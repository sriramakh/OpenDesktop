/**
 * Office document tools — specialized read/write for PDF, DOCX, XLSX, PPTX, CSV.
 *
 * Uses native Node.js libraries:
 *   - pdf-parse   → PDF text extraction
 *   - mammoth     → DOCX → text/HTML
 *   - xlsx (SheetJS) → Excel read/write/formulas
 *   - exceljs     → Excel with charts, styling, pivot tables
 *   - jszip       → PPTX XML extraction
 *   - pptxgenjs   → PPTX creation (beautiful, template-aware)
 *   - csv (built-in) → CSV parsing/writing
 */

const fsp  = require('fs/promises');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { exec } = require('child_process');

// pdfjs-dist (used by pdf-parse v2) expects browser globals — polyfill for Node.js
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init) {
      const v = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
      this.a = v[0]; this.b = v[1]; this.c = v[2];
      this.d = v[3]; this.e = v[4]; this.f = v[5];
      this.is2D = true; this.isIdentity = false;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF helpers — pdfplumber (primary) → pdf-parse (fallback) → OCR (scanned)
// ─────────────────────────────────────────────────────────────────────────────

/** Path to pdfjs-dist standard fonts — silences pdf-parse v2 warning */
function getStandardFontDataUrl() {
  try {
    const pkg = require.resolve('pdfjs-dist/package.json');
    return path.join(path.dirname(pkg), 'standard_fonts') + path.sep;
  } catch {
    return undefined;
  }
}

/**
 * runPythonScript(scriptBody, args, timeout)
 * Write a temp Python script, run it, return stdout as parsed JSON.
 */
async function runPythonScript(scriptBody, args = [], timeout = 180000) {
  const scriptPath = path.join(os.tmpdir(), `_pdf_${process.pid}_${Date.now()}.py`);
  await fsp.writeFile(scriptPath, scriptBody, 'utf-8');
  try {
    const escapedArgs = args.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
    const raw = await new Promise((resolve, reject) => {
      exec(`python3 "${scriptPath}" ${escapedArgs}`,
        { timeout, maxBuffer: 30 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err && !stdout) reject(new Error(stderr || err.message));
          else resolve(stdout || '{}');
        }
      );
    });
    return JSON.parse(raw.trim());
  } finally {
    await fsp.unlink(scriptPath).catch(() => {});
  }
}

/**
 * extractWithPdfplumber(filePath, opts)
 * Primary extraction: uses pdfplumber for high-quality layout-aware text + tables.
 * Returns { total, pages: [{page, text, tables, charCount}], meta }
 */
async function extractWithPdfplumber(filePath, opts = {}) {
  const { startPage = 1, endPage, mode = 'full' } = opts;

  const script = `
import sys, json
try:
    import pdfplumber
except ImportError:
    print(json.dumps({'error': 'pdfplumber not installed. Run: pip install pdfplumber'}))
    sys.exit(0)

pdf_path   = sys.argv[1]
start_page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
end_page   = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != '0' else None
mode       = sys.argv[4] if len(sys.argv) > 4 else 'full'

try:
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        end_p = end_page or total
        pages = []
        for i in range(start_page - 1, min(end_p, total)):
            page = pdf.pages[i]
            text = page.extract_text(x_tolerance=3, y_tolerance=3) or ''
            tables = []
            if mode != 'overview':
                try:
                    raw_tbls = page.extract_tables({'vertical_strategy': 'lines_strict', 'horizontal_strategy': 'lines_strict'}) or []
                    if not raw_tbls:
                        raw_tbls = page.extract_tables() or []
                    for tbl in raw_tbls:
                        if tbl:
                            tables.append([[str(c).strip() if c else '' for c in row] for row in tbl])
                except Exception:
                    pass
            pages.append({
                'page': i + 1,
                'text': text[:400] if mode == 'overview' else text,
                'tables': tables,
                'char_count': len(text),
            })
        meta = {}
        try:
            info = pdf.metadata or {}
            meta = {k: str(v)[:200] for k, v in info.items() if v and isinstance(v, (str, int, float))}
        except Exception:
            pass
        print(json.dumps({'total': total, 'pages': pages, 'meta': meta}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

  return runPythonScript(script, [filePath, startPage, endPage || 0, opts.mode || 'full']);
}

/**
 * extractWithPdfParse(filePath, opts)
 * Fallback: uses pdf-parse (Node.js). Less accurate but no Python required.
 */
async function extractWithPdfParse(filePath, opts = {}) {
  const { startPage, endPage, password } = opts;
  const { PDFParse } = require('pdf-parse');
  const rawData = await fsp.readFile(filePath);
  const uint8   = new Uint8Array(rawData);

  const parseOpts = {};
  const sfUrl = getStandardFontDataUrl();
  if (sfUrl)    parseOpts.standardFontDataUrl = sfUrl;
  if (password) parseOpts.password = password;
  if (endPage)  parseOpts.max = endPage;

  const _origWarn = console.warn;
  console.warn = (...a) => { if (String(a[0]).includes('standardFontDataUrl')) return; _origWarn(...a); };

  let textResult, info;
  try {
    const parser = new PDFParse(uint8, parseOpts);
    await parser.load();
    info       = await parser.getInfo();
    textResult = await parser.getText();
    parser.destroy();
  } finally {
    console.warn = _origWarn;
  }

  const totalPages = info?.total || 1;
  const rawPages   = textResult?.pages || [];

  // Build paginated result
  const s = (startPage || 1) - 1;
  const e = endPage || rawPages.length;
  const pages = rawPages.length > 0
    ? rawPages.slice(s, e).map((p, i) => ({ page: s + i + 1, text: p.text, tables: [], charCount: p.text.length }))
    : [{ page: 1, text: textResult?.text || '', tables: [], charCount: (textResult?.text || '').length }];

  return { total: totalPages, pages, meta: {} };
}

/**
 * ocrPDF(filePath, maxPages)
 * OCR using PyMuPDF → tesseract. For scanned/image-based PDFs.
 */
async function ocrPDF(filePath, maxPages = 20) {
  const script = `
import sys, os, tempfile, subprocess, json
try:
    import fitz
except ImportError:
    print(json.dumps({'error': 'PyMuPDF not installed. Run: pip install PyMuPDF'}))
    sys.exit(0)

pdf_path  = sys.argv[1]
max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 20

try:
    doc = fitz.open(pdf_path)
except Exception as e:
    print(json.dumps({'error': f'Cannot open PDF: {e}'}))
    sys.exit(0)

results = []
for i in range(min(len(doc), max_pages)):
    page = doc[i]

    # First try fitz text extraction (fast, no tesseract needed)
    text = page.get_text('text').strip()
    if len(text) > 50:
        results.append({'page': i + 1, 'text': text, 'method': 'fitz'})
        continue

    # Scanned page — render and OCR
    mat = fitz.Matrix(2.5, 2.5)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
    fd, img_path = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    fd, out_base = tempfile.mkstemp(suffix='.txt')
    os.close(fd)
    out_base = out_base[:-4]
    try:
        pix.save(img_path)
        r = subprocess.run(['tesseract', img_path, out_base, '-l', 'eng', '--psm', '1'],
                           capture_output=True, timeout=60)
        txt_file = out_base + '.txt'
        if os.path.exists(txt_file):
            with open(txt_file, 'r', encoding='utf-8', errors='replace') as f:
                text = f.read().strip()
            os.unlink(txt_file)
            if text:
                results.append({'page': i + 1, 'text': text, 'method': 'ocr'})
    except FileNotFoundError:
        results.append({'page': i + 1, 'text': '(tesseract not installed — install with: brew install tesseract)', 'method': 'ocr_failed'})
    finally:
        if os.path.exists(img_path): os.unlink(img_path)

total_pages = len(doc)
doc.close()
print(json.dumps({'pages': results, 'total': total_pages}))
`;

  const result = await runPythonScript(script, [filePath, maxPages], 300000);
  if (result.error) throw new Error(result.error);
  return result;
}

/**
 * formatPDFOutput(extractResult, opts)
 * Converts the structured extraction result into a readable string for the agent.
 */
function formatPDFOutput(result, opts = {}) {
  const { mode = 'full', filePath } = opts;
  const { total, pages, meta } = result;
  const fname = path.basename(filePath || '');

  const lines = [`[PDF: ${total} page(s) — ${fname}]`];

  if (meta && Object.keys(meta).length > 0) {
    const metaStr = Object.entries(meta)
      .filter(([k]) => ['Title', 'Author', 'Subject', 'Creator', 'CreationDate'].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');
    if (metaStr) lines.push(`Metadata: ${metaStr}`);
  }

  if (mode === 'overview') {
    lines.push(`\nDOCUMENT OVERVIEW (first ~400 chars per page):`);
    lines.push(`Use office_read_pdf with startPage/endPage to read specific sections.\n`);
    for (const p of pages) {
      const preview = p.text.trim().slice(0, 400).replace(/\n+/g, ' ');
      const tableNote = p.tables?.length > 0 ? ` [${p.tables.length} table(s)]` : '';
      lines.push(`--- Page ${p.page} / ${total}${tableNote} ---\n${preview || '(no text)'}...`);
    }
  } else {
    lines.push('');
    for (const p of pages) {
      lines.push(`--- Page ${p.page} / ${total} ---`);
      if (p.text.trim()) {
        lines.push(p.text.trim());
      } else {
        lines.push('(no text on this page)');
      }
      if (p.tables?.length > 0) {
        for (let ti = 0; ti < p.tables.length; ti++) {
          lines.push(`\n[Table ${ti + 1} on page ${p.page}]`);
          const tbl = p.tables[ti];
          for (const row of tbl) {
            lines.push(row.join(' | '));
          }
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * readPDF(filePath, opts)
 * Main entry point for PDF reading.
 * Strategy: pdfplumber → pdf-parse → OCR
 */
async function readPDF(filePath, opts = {}) {
  const { startPage, endPage, password, mode = 'full' } = opts;

  // Strategy 1: pdfplumber (best quality)
  let extractResult;
  try {
    extractResult = await extractWithPdfplumber(filePath, { startPage, endPage, mode });
    if (extractResult.error) throw new Error(extractResult.error);
  } catch (plumberErr) {
    // Strategy 2: pdf-parse (Node fallback)
    try {
      extractResult = await extractWithPdfParse(filePath, { startPage, endPage, password });
    } catch (parseErr) {
      extractResult = null;
    }
  }

  if (extractResult) {
    const { total, pages } = extractResult;
    const totalChars = pages.reduce((s, p) => s + (p.charCount || p.text?.length || 0), 0);
    const charsPerPage = totalChars / Math.max(pages.length, 1);

    // Scanned PDF detection: sparse text layer
    if (charsPerPage < 30 && total > 0) {
      try {
        const ocrResult = await ocrPDF(filePath, endPage || Math.min(total, 30));
        if (ocrResult.pages?.length > 0) {
          // Merge OCR result into extractResult format
          extractResult = {
            total: ocrResult.total,
            pages: ocrResult.pages.map((p) => ({ ...p, tables: [], charCount: p.text.length })),
            meta: extractResult.meta || {},
            _ocr: true,
          };
        }
      } catch (_) {
        // OCR unavailable — proceed with sparse text + explanation
        extractResult.pages = extractResult.pages.map((p) => ({
          ...p,
          text: p.text || '(scanned page — install PyMuPDF + tesseract for OCR)',
        }));
      }
    }

    return formatPDFOutput(extractResult, { mode, filePath });
  }

  throw new Error(`Could not extract text from PDF: ${path.basename(filePath)}`);
}

/**
 * searchPDF(filePath, query, opts)
 * Search for terms/phrases within a PDF and return matching pages with context.
 * Returns { total, matchCount, matches: [{page, line, context}] }
 */
async function searchPDF(filePath, query, opts = {}) {
  const { maxResults = 30, contextLines = 3 } = opts;

  const script = `
import sys, json, re
try:
    import pdfplumber
except ImportError:
    print(json.dumps({'error': 'pdfplumber not installed. Run: pip install pdfplumber'}))
    sys.exit(0)

pdf_path    = sys.argv[1]
query       = sys.argv[2]
max_results = int(sys.argv[3]) if len(sys.argv) > 3 else 30
ctx_lines   = int(sys.argv[4]) if len(sys.argv) > 4 else 3

try:
    pattern = re.compile(re.escape(query), re.IGNORECASE)
except Exception:
    pattern = None

matches = []
total = 0
try:
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            text = page.extract_text(x_tolerance=3, y_tolerance=3) or ''
            lines = text.split('\\n')
            for j, line in enumerate(lines):
                if (pattern and pattern.search(line)) or (not pattern and query.lower() in line.lower()):
                    start = max(0, j - ctx_lines)
                    end   = min(len(lines), j + ctx_lines + 1)
                    context = '\\n'.join(lines[start:end])
                    matches.append({
                        'page': i + 1,
                        'line_num': j + 1,
                        'line': line.strip(),
                        'context': context.strip(),
                    })
                    if len(matches) >= max_results:
                        break
            if len(matches) >= max_results:
                break
    print(json.dumps({'matches': matches, 'total_pages': total}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

  return runPythonScript(script, [filePath, query, maxResults, contextLines]);
}

function shellExec(cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

function resolvePath(p) {
  if (typeof p === 'string' && p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV helpers (no external deps)
// ─────────────────────────────────────────────────────────────────────────────

function parseCSV(text, delimiter = ',') {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        row.push(field); field = '';
      } else {
        field += ch;
      }
    }
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toCSV(rows, delimiter = ',') {
  return rows.map((row) =>
    row.map((cell) => {
      const s = cell === null || cell === undefined ? '' : String(cell);
      if (s.includes(delimiter) || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(delimiter)
  ).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────

const OfficeTools = [
  // ── PDF ───────────────────────────────────────────────────────────────────
  {
    name: 'office_read_pdf',
    category: 'office',
    description: 'Read and extract text (and tables) from a PDF file. Uses pdfplumber for high-quality extraction. Returns paginated text with --- Page N / TOTAL --- markers. For large PDFs, use mode="overview" first to survey the document, then read specific page ranges.',
    params: ['path', 'mode', 'startPage', 'endPage', 'password'],
    permissionLevel: 'safe',
    async execute({ path: filePath, mode = 'full', startPage, endPage, password }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      return await readPDF(resolved, { mode, startPage, endPage, password });
    },
  },

  {
    name: 'office_pdf_search',
    category: 'office',
    description: 'Search for specific terms, phrases, or keywords within a PDF. Returns matching lines with surrounding context and page numbers. Use this when looking for specific information without reading the entire document.',
    params: ['path', 'query', 'maxResults'],
    permissionLevel: 'safe',
    async execute({ path: filePath, query, maxResults = 30 }) {
      if (!filePath) throw new Error('path is required');
      if (!query)    throw new Error('query is required');
      const resolved = resolvePath(filePath);
      const result = await searchPDF(resolved, query, { maxResults });
      if (result.error) throw new Error(result.error);
      const { matches, total_pages } = result;
      if (!matches || matches.length === 0) {
        return `[PDF Search] No matches for "${query}" in ${path.basename(resolved)} (${total_pages} pages).`;
      }
      const lines = [
        `[PDF Search: "${query}" — ${matches.length} match(es) across ${total_pages} pages — ${path.basename(resolved)}]\n`,
      ];
      for (const m of matches) {
        lines.push(`--- Page ${m.page} (line ${m.line_num}) ---`);
        lines.push(m.context);
        lines.push('');
      }
      return lines.join('\n');
    },
  },

  {
    name: 'office_pdf_ask',
    category: 'office',
    description: 'Ask a specific question about a PDF document. For Anthropic and Google providers, sends the entire PDF directly to the AI for native document understanding — perfect for Q&A, summaries, and analysis of complex PDFs including tables and images. For other providers, extracts text and answers using that.',
    params: ['path', 'question'],
    permissionLevel: 'safe',
    async execute({ path: filePath, question }) {
      if (!filePath)  throw new Error('path is required');
      if (!question)  throw new Error('question is required');
      const resolved = resolvePath(filePath);

      const { askAboutPDF, getCurrentProvider } = require('../llm');
      const provider = getCurrentProvider();

      // For Anthropic/Google: use native PDF vision (most accurate)
      if (provider === 'anthropic' || provider === 'google') {
        try {
          return await askAboutPDF(resolved, question);
        } catch (err) {
          // If file too large or other error, fall through to text extraction
          console.warn(`[office_pdf_ask] Native PDF failed (${err.message}), falling back to text`);
        }
      }

      // Fallback: extract text with pdfplumber, then ask
      let extractResult;
      try {
        extractResult = await extractWithPdfplumber(resolved, { mode: 'full' });
      } catch (_) {
        extractResult = await extractWithPdfParse(resolved, {});
      }

      const fullText = formatPDFOutput(extractResult, { mode: 'full', filePath: resolved });

      // Truncate if too long (keep within ~60K chars)
      const truncated = fullText.length > 60000 ? fullText.slice(0, 60000) + '\n...(truncated)' : fullText;

      const { askAboutPDF: _ask } = require('../llm');
      return await _ask(resolved, question, { fallbackText: truncated });
    },
  },

  // ── DOCX read ─────────────────────────────────────────────────────────────
  {
    name: 'office_read_docx',
    category: 'office',
    description: 'Read a Word document (.docx) and return its text content. Preserves paragraph structure. Use format="html" to get a structured HTML representation with headings and formatting.',
    params: ['path', 'format'],
    permissionLevel: 'safe',
    async execute({ path: filePath, format = 'text' }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const mammoth = require('mammoth');

      let result;
      if (format === 'html') {
        result = await mammoth.convertToHtml({ path: resolved });
        return `[DOCX HTML — ${path.basename(resolved)}]\n\n${result.value}`;
      } else {
        result = await mammoth.extractRawText({ path: resolved });
        const warnings = result.messages
          .filter((m) => m.type === 'warning')
          .map((m) => m.message);
        let out = `[DOCX — ${path.basename(resolved)}]\n\n${result.value}`;
        if (warnings.length > 0) out += `\n\n[Warnings: ${warnings.join('; ')}]`;
        return out;
      }
    },
  },

  // ── DOCX write ────────────────────────────────────────────────────────────
  {
    name: 'office_write_docx',
    category: 'office',
    description: 'Create or update a Word document (.docx). Pass content as markdown-like text with headings (# H1, ## H2, ### H3), paragraphs, and bullet lists (- item). Saves to the specified path.',
    params: ['path', 'content', 'title'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, content, title }) {
      if (!filePath || !content) throw new Error('path and content are required');
      const resolved = resolvePath(filePath);

      // Build DOCX XML (Office Open XML format) from markdown-like content
      const lines = content.split('\n');
      const paragraphs = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { paragraphs.push('<w:p/>'); continue; }

        if (trimmed.startsWith('### ')) {
          paragraphs.push(makePara(trimmed.slice(4), 'Heading3'));
        } else if (trimmed.startsWith('## ')) {
          paragraphs.push(makePara(trimmed.slice(3), 'Heading2'));
        } else if (trimmed.startsWith('# ')) {
          paragraphs.push(makePara(trimmed.slice(2), 'Heading1'));
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          paragraphs.push(makeListItem(trimmed.slice(2)));
        } else if (/^\d+\.\s/.test(trimmed)) {
          paragraphs.push(makeListItem(trimmed.replace(/^\d+\.\s/, ''), true));
        } else {
          paragraphs.push(makePara(trimmed, 'Normal'));
        }
      }

      const docXml = buildDocXml(paragraphs, title || path.basename(resolved, '.docx'));
      const docxBuffer = await buildDocxBuffer(docXml);

      await fsp.mkdir(path.dirname(resolved), { recursive: true });
      await fsp.writeFile(resolved, docxBuffer);

      return `Created DOCX: ${resolved} (${(docxBuffer.length / 1024).toFixed(1)} KB)`;
    },
  },

  // ── XLSX read ─────────────────────────────────────────────────────────────
  {
    name: 'office_read_xlsx',
    category: 'office',
    description: 'Read an Excel workbook (.xlsx/.xls). Returns sheet data, formulas, metadata (merged cells, column widths). Use summaryOnly for a fast overview of large files.',
    params: ['path', 'sheetName', 'maxRows', 'includeFormulas', 'outputFormat', 'summaryOnly'],
    permissionLevel: 'safe',
    async execute({ path: filePath, sheetName, maxRows = 500, includeFormulas = false, outputFormat = 'text', summaryOnly = false }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const XLSX = require('xlsx');

      // summaryOnly: no row limit (need full !ref for accurate row count); data mode: cap at maxRows
      const readOpts = summaryOnly ? { cellFormula: false } : { sheetRows: maxRows, cellFormula: true };
      const wb = XLSX.readFile(resolved, readOpts);

      const sheetNames = sheetName
        ? (wb.SheetNames.includes(sheetName) ? [sheetName] : (() => { throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`); })())
        : wb.SheetNames;

      const stat = await fsp.stat(resolved);
      const output = [`[Excel Workbook: ${path.basename(resolved)} — ${(stat.size / 1024).toFixed(1)} KB]`];
      output.push(`Sheets (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}`);

      for (const name of sheetNames) {
        const ws = wb.Sheets[name];
        const range = ws['!ref'];
        if (!range) { output.push(`\n=== Sheet: ${name} — (empty) ===`); continue; }

        const decoded = XLSX.utils.decode_range(range);
        const totalRows = decoded.e.r + 1;
        const totalCols = decoded.e.c + 1;
        const merges = (ws['!merges'] || []).map((m) => XLSX.utils.encode_range(m));
        const colWidths = (ws['!cols'] || []).map((c, i) =>
          c?.wch ? `${XLSX.utils.encode_col(i)}:${c.wch}` : null
        ).filter(Boolean);

        output.push(`\n=== Sheet: ${name} (${totalRows} rows × ${totalCols} cols) ===`);
        if (merges.length) output.push(`Merged cells: ${merges.join(', ')}`);
        if (colWidths.length) output.push(`Column widths: ${colWidths.join(', ')}`);

        if (summaryOnly) {
          // Just show headers (first row) + row count
          const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })[0] || [];
          output.push(`Headers: ${headerRow.join(' | ')}`);
          output.push(`Data rows: ${Math.max(0, totalRows - 1)}`);
          continue;
        }

        if (outputFormat === 'json') {
          const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
          output.push(JSON.stringify(json.slice(0, maxRows)));
        } else {
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
          const displayRows = rows.slice(0, maxRows);
          output.push(displayRows.map((r) => r.join('\t')).join('\n'));

          if (includeFormulas) {
            const formulaMap = {};
            for (const [addr, cell] of Object.entries(ws)) {
              if (!addr.startsWith('!') && cell.f) formulaMap[addr] = cell.f;
            }
            if (Object.keys(formulaMap).length) {
              output.push('\n--- Formulas ---');
              for (const [addr, f] of Object.entries(formulaMap)) output.push(`${addr}: =${f}`);
            }
          }

          if (totalRows > maxRows) output.push(`\n... ${totalRows - maxRows} more rows not shown (use maxRows to see more)`);
        }
      }

      return output.join('\n');
    },
  },

  // ── XLSX write ────────────────────────────────────────────────────────────
  {
    name: 'office_write_xlsx',
    category: 'office',
    description: 'EXCEL SPREADSHEETS ONLY — NOT for PowerPoint or presentations (use office_write_pptx for those). Creates or modifies .xlsx workbooks with full formatting. Use sheetData for bulk data, operations for fine-grained control: set_cell (values/formulas/financial coloring), format_range, freeze_panes, set_column_width, merge_cells, create_table, auto_fit_columns. ALWAYS use Excel formulas instead of hardcoded values.',
    params: ['path', 'sheetData', 'operations', 'autoFormat'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, operations, sheetData, autoFormat = false }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const ExcelJS = require('exceljs');

      // Financial model color coding (industry standard)
      // Blue=inputs users change, Black=formulas, Green=cross-sheet links, Red=external, Yellow bg=assumptions
      const FIN_COLOR = {
        input:       'FF0000FF',  // blue
        formula:     'FF000000',  // black
        cross_sheet: 'FF008000',  // green
        external:    'FFFF0000',  // red
        assumption:  'FF000000',  // black text + yellow fill
      };

      const wb = new ExcelJS.Workbook();
      wb.creator = 'OpenDesktop';
      wb.modified = new Date();

      const exists = await fsp.stat(resolved).catch(() => null);
      if (exists) {
        try { await wb.xlsx.readFile(resolved); } catch { /* start fresh */ }
      }

      const getSheet = (name) =>
        name ? (wb.getWorksheet(name) || wb.addWorksheet(name))
              : (wb.worksheets[0] || wb.addWorksheet('Sheet1'));

      // Apply a style object to a single cell
      const applyStyle = (cell, s) => {
        if (!s) return;
        if (s.bold != null || s.italic != null || s.fontSize != null || s.fontColor != null || s.fontName != null) {
          cell.font = {
            bold:   s.bold   ?? cell.font?.bold,
            italic: s.italic ?? cell.font?.italic,
            size:   s.fontSize ?? cell.font?.size ?? 11,
            color:  s.fontColor ? { argb: 'FF' + s.fontColor.replace('#', '') } : cell.font?.color,
            name:   s.fontName ?? cell.font?.name ?? 'Calibri',
          };
        }
        if (s.bgColor) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + s.bgColor.replace('#', '') } };
        }
        if (s.numFormat) cell.numFmt = s.numFormat;
        if (s.align || s.valign || s.wrapText != null) {
          cell.alignment = {
            horizontal: s.align   ?? cell.alignment?.horizontal,
            vertical:   s.valign  ?? cell.alignment?.vertical ?? 'middle',
            wrapText:   s.wrapText ?? cell.alignment?.wrapText,
          };
        }
        if (s.border) {
          const b = s.border === true ? { style: 'thin' } : { style: s.border };
          cell.border = { top: b, bottom: b, left: b, right: b };
        }
      };

      // Set a cell's value (string starting with = becomes a formula)
      const setCellValue = (cell, val) => {
        if (typeof val === 'string' && val.startsWith('=')) {
          cell.value = { formula: val.slice(1), result: 0 };
        } else {
          cell.value = val ?? null;
        }
      };

      // ── sheetData bulk write ───────────────────────────────────────────────
      if (sheetData && typeof sheetData === 'object') {
        for (const [name, data] of Object.entries(sheetData)) {
          const sheet = getSheet(name);
          const rows = Array.isArray(data) ? data : [];

          for (let ri = 0; ri < rows.length; ri++) {
            const row = rows[ri];
            for (let ci = 0; ci < row.length; ci++) {
              const cell = sheet.getCell(ri + 1, ci + 1);
              setCellValue(cell, row[ci]);

              if (autoFormat) {
                if (ri === 0) {
                  // Header row: dark blue bg, white bold text, centered
                  cell.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' } };
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
                  cell.alignment = { horizontal: 'center', vertical: 'middle' };
                  cell.border = { bottom: { style: 'medium', color: { argb: 'FF2E86AB' } } };
                } else if (ri % 2 === 0) {
                  // Alternating row: light blue tint
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF4F9' } };
                }
              }
            }
          }

          if (autoFormat && rows.length > 0) {
            sheet.getRow(1).height = 22;
            // Freeze header row
            sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
            // Auto-size columns (sample first 100 rows)
            const colWidths = {};
            for (let ri = 0; ri < Math.min(rows.length, 100); ri++) {
              for (let ci = 0; ci < rows[ri].length; ci++) {
                const len = String(rows[ri][ci] ?? '').length;
                colWidths[ci] = Math.max(colWidths[ci] || 8, Math.min(len + 4, 45));
              }
            }
            for (const [ci, w] of Object.entries(colWidths)) {
              sheet.getColumn(Number(ci) + 1).width = w;
            }
          }
        }
      }

      // ── operations ────────────────────────────────────────────────────────
      if (Array.isArray(operations)) {
        for (const op of operations) {
          const sheet = getSheet(op.sheet);

          switch (op.type) {

            case 'set_cell': {
              if (!op.cell) break;
              const cell = sheet.getCell(op.cell);
              if (op.formula) {
                cell.value = { formula: op.formula.replace(/^=/, ''), result: op.result ?? 0 };
              } else if (op.value !== undefined) {
                cell.value = op.value;
              }
              // Financial color coding
              if (op.financial_type && FIN_COLOR[op.financial_type]) {
                cell.font = { ...(cell.font || {}), color: { argb: FIN_COLOR[op.financial_type] }, name: 'Calibri', size: cell.font?.size ?? 11 };
                if (op.financial_type === 'assumption') {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                }
              }
              if (op.style) applyStyle(cell, op.style);
              break;
            }

            case 'set_range': {
              const data2d = op.data || [];
              const anchor = sheet.getCell(op.range || 'A1');
              const startRow = anchor.row, startCol = anchor.col;
              for (let ri = 0; ri < data2d.length; ri++) {
                for (let ci = 0; ci < data2d[ri].length; ci++) {
                  setCellValue(sheet.getCell(startRow + ri, startCol + ci), data2d[ri][ci]);
                }
              }
              break;
            }

            case 'add_sheet': {
              const newName = op.name || `Sheet${wb.worksheets.length + 1}`;
              if (!wb.getWorksheet(newName)) {
                const ns = wb.addWorksheet(newName);
                if (Array.isArray(op.data)) {
                  op.data.forEach((row, ri) =>
                    row.forEach((val, ci) => setCellValue(ns.getCell(ri + 1, ci + 1), val))
                  );
                }
              }
              break;
            }

            case 'auto_sum': {
              if (!op.targetCell || !op.sourceRange) break;
              sheet.getCell(op.targetCell).value = { formula: `SUM(${op.sourceRange})`, result: 0 };
              if (op.style) applyStyle(sheet.getCell(op.targetCell), op.style);
              break;
            }

            case 'format_range': {
              if (!op.range) break;
              const rangeStr = op.range.includes(':') ? op.range : `${op.range}:${op.range}`;
              const [s, e] = rangeStr.split(':');
              const sc = sheet.getCell(s), ec = sheet.getCell(e);
              for (let r = sc.row; r <= ec.row; r++) {
                for (let c = sc.col; c <= ec.col; c++) {
                  applyStyle(sheet.getCell(r, c), op.style || op);
                }
              }
              break;
            }

            case 'freeze_panes': {
              sheet.views = [{ state: 'frozen', ySplit: op.row ?? 1, xSplit: op.col ?? 0 }];
              break;
            }

            case 'set_column_width': {
              const defs = op.cols || (op.col ? [{ col: op.col, width: op.width }] : []);
              for (const { col, width } of defs) {
                sheet.getColumn(col).width = width;
              }
              break;
            }

            case 'set_row_height': {
              const rowNum = typeof op.row === 'number' ? op.row : sheet.getCell(op.cell || 'A1').row;
              sheet.getRow(rowNum).height = op.height ?? 20;
              break;
            }

            case 'merge_cells': {
              if (!op.range) break;
              try { sheet.mergeCells(op.range); } catch { /* ignore if already merged */ }
              break;
            }

            case 'create_table': {
              // Styles header + data rows; adds auto-filter on header row
              if (!op.range) break;
              const [ts, te] = op.range.split(':');
              const sc = sheet.getCell(ts), ec = sheet.getCell(te);
              // Header row
              for (let c = sc.col; c <= ec.col; c++) {
                const cell = sheet.getCell(sc.row, c);
                cell.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { bottom: { style: 'medium', color: { argb: 'FF2E86AB' } } };
              }
              // Data rows — alternating fill + Calibri font
              for (let r = sc.row + 1; r <= ec.row; r++) {
                for (let c = sc.col; c <= ec.col; c++) {
                  const cell = sheet.getCell(r, c);
                  cell.font = { name: 'Calibri', size: 11 };
                  if ((r - sc.row) % 2 === 0) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
                  }
                  cell.border = { bottom: { style: 'hair', color: { argb: 'FFBDD7EE' } } };
                }
              }
              // Auto-filter on header
              sheet.autoFilter = { from: { row: sc.row, column: sc.col }, to: { row: sc.row, column: ec.col } };
              break;
            }

            case 'auto_fit_columns': {
              const maxRow = Math.min(sheet.rowCount || 100, 100);
              const colWidths = {};
              for (let r = 1; r <= maxRow; r++) {
                sheet.getRow(r).eachCell({ includeEmpty: false }, (cell, colNum) => {
                  const len = String(cell.text || cell.value || '').length;
                  colWidths[colNum] = Math.max(colWidths[colNum] || 8, Math.min(len + 4, 50));
                });
              }
              for (const [colNum, w] of Object.entries(colWidths)) {
                sheet.getColumn(Number(colNum)).width = w;
              }
              break;
            }

            case 'add_comment': {
              if (!op.cell || !op.comment) break;
              try {
                sheet.getCell(op.cell).note = {
                  texts: [{ font: { name: 'Calibri', size: 9 }, text: String(op.comment) }],
                };
              } catch { /* ignore */ }
              break;
            }
          }
        }
      }

      await fsp.mkdir(path.dirname(resolved), { recursive: true });
      await wb.xlsx.writeFile(resolved);

      const stat = await fsp.stat(resolved);
      const sheets = wb.worksheets.map((s) => s.name);
      return `Saved Excel workbook: ${resolved} (${(stat.size / 1024).toFixed(1)} KB, ${sheets.length} sheet(s): ${sheets.join(', ')})`;
    },
  },

  // ── XLSX chart / pivot ────────────────────────────────────────────────────
  {
    name: 'office_chart_xlsx',
    category: 'office',
    description: 'Add a professionally-styled pivot/summary table to an Excel workbook. Aggregates source data using SUMIF/COUNTIF/AVERAGEIF formulas (dynamic — updates when source data changes). Writes to a new or existing sheet. Use office_write_xlsx for chart data, then open in Excel to insert a chart.',
    params: ['path', 'dataSheet', 'dataRange', 'outputSheet', 'title', 'pivotConfig'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, dataSheet, dataRange, outputSheet, title, pivotConfig }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const ExcelJS = require('exceljs');

      const wb = new ExcelJS.Workbook();
      const exists = await fsp.stat(resolved).catch(() => null);
      if (exists) {
        try { await wb.xlsx.readFile(resolved); } catch { /* start fresh */ }
      }
      if (!wb.worksheets.length) wb.addWorksheet('Sheet1');

      const srcSheetName = dataSheet || wb.worksheets[0].name;
      const srcSheet = wb.getWorksheet(srcSheetName);
      if (!srcSheet) throw new Error(`Source sheet "${srcSheetName}" not found. Available: ${wb.worksheets.map((s) => s.name).join(', ')}`);

      const outName = outputSheet || 'Summary';
      let outSheet = wb.getWorksheet(outName);
      if (!outSheet) outSheet = wb.addWorksheet(outName);

      const { groupByCol = 1, valueCol = 2, aggregation = 'SUM', labelCol } = pivotConfig || {};

      // ── Determine source range ─────────────────────────────────────────────
      let srcStart = 1, srcEnd = srcSheet.rowCount || 1000;
      if (dataRange) {
        const [s, e] = dataRange.split(':');
        if (s) srcStart = srcSheet.getCell(s).row;
        if (e) srcEnd   = srcSheet.getCell(e).row;
      }

      // ── Read unique keys from groupByCol (skip header row) ────────────────
      const keys = new Set();
      srcSheet.eachRow((row, ri) => {
        if (ri <= srcStart) return; // skip header
        const v = row.getCell(groupByCol).value;
        if (v != null && v !== '') keys.add(String(v));
      });
      const uniqueKeys = [...keys].sort();

      // ── Column letter helpers ─────────────────────────────────────────────
      const colLetter = (n) => {
        let s = '';
        for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(((i - 1) % 26) + 65) + s;
        return s;
      };
      const groupCol = colLetter(groupByCol);
      const valCol   = colLetter(valueCol);
      const labelColLetter = labelCol ? colLetter(labelCol) : null;

      // Source range for formulas (row 2 to end of data)
      const formulaSrcRange = `${srcSheetName}!$${groupCol}$${srcStart + 1}:$${groupCol}$${srcEnd}`;
      const formulaValRange = `${srcSheetName}!$${valCol}$${srcStart + 1}:$${valCol}$${srcEnd}`;

      // ── Write output sheet ─────────────────────────────────────────────────
      // Header row
      const titleText = title || `${aggregation} of ${valCol} by ${groupCol}`;
      outSheet.getCell('A1').value = titleText;
      outSheet.mergeCells('A1:C1');

      // Column headers at row 2
      outSheet.getCell('A2').value = 'Category';
      outSheet.getCell('B2').value = `${aggregation} (${valCol})`;
      if (labelColLetter) outSheet.getCell('C2').value = 'Label';

      // Data rows: one per unique key, using formula-based aggregation
      let dataStart = 3;
      uniqueKeys.forEach((key, i) => {
        const r = dataStart + i;
        outSheet.getCell(r, 1).value = key;

        let formula;
        switch (aggregation.toUpperCase()) {
          case 'COUNT':
            formula = `COUNTIF(${formulaSrcRange},"${key}")`;
            break;
          case 'AVG':
          case 'AVERAGE':
            formula = `AVERAGEIF(${formulaSrcRange},"${key}",${formulaValRange})`;
            break;
          case 'MAX':
            formula = `MAXIFS(${formulaValRange},${formulaSrcRange},"${key}")`;
            break;
          case 'MIN':
            formula = `MINIFS(${formulaValRange},${formulaSrcRange},"${key}")`;
            break;
          default: // SUM
            formula = `SUMIF(${formulaSrcRange},"${key}",${formulaValRange})`;
        }
        outSheet.getCell(r, 2).value = { formula, result: 0 };
        outSheet.getCell(r, 2).numFmt = '#,##0.00';
      });

      // Total row
      const totalRow = dataStart + uniqueKeys.length;
      outSheet.getCell(totalRow, 1).value = 'TOTAL';
      if (aggregation.toUpperCase() !== 'COUNT') {
        outSheet.getCell(totalRow, 2).value = { formula: `SUM(B${dataStart}:B${totalRow - 1})`, result: 0 };
      } else {
        outSheet.getCell(totalRow, 2).value = { formula: `SUM(B${dataStart}:B${totalRow - 1})`, result: 0 };
      }
      outSheet.getCell(totalRow, 2).numFmt = '#,##0.00';

      // ── Styling ────────────────────────────────────────────────────────────
      // Title
      const titleCell = outSheet.getCell('A1');
      titleCell.font = { bold: true, size: 13, name: 'Calibri', color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      outSheet.getRow(1).height = 24;

      // Column headers
      ['A2', 'B2', 'C2'].forEach((addr) => {
        const c = outSheet.getCell(addr);
        if (!c.value) return;
        c.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86AB' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      outSheet.getRow(2).height = 20;

      // Data rows — alternating fill
      for (let i = 0; i < uniqueKeys.length; i++) {
        const r = dataStart + i;
        for (let c = 1; c <= 2; c++) {
          const cell = outSheet.getCell(r, c);
          cell.font = { name: 'Calibri', size: 11 };
          if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF4F9' } };
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFBDD7EE' } } };
        }
        outSheet.getCell(dataStart + i, 1).alignment = { horizontal: 'left', vertical: 'middle' };
        outSheet.getCell(dataStart + i, 2).alignment = { horizontal: 'right', vertical: 'middle' };
      }

      // Total row styling
      for (let c = 1; c <= 2; c++) {
        const cell = outSheet.getCell(totalRow, c);
        cell.font = { bold: true, name: 'Calibri', size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        cell.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' } };
        cell.border = { top: { style: 'medium', color: { argb: 'FF2E86AB' } } };
      }

      // Column widths
      outSheet.getColumn(1).width = 28;
      outSheet.getColumn(2).width = 18;
      outSheet.getColumn(3).width = 20;

      // Freeze header rows
      outSheet.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];

      await wb.xlsx.writeFile(resolved);

      return `Pivot table "${titleText}" written to sheet "${outName}" in ${resolved}.\n${uniqueKeys.length} categories + total row. Formulas use ${aggregation}IF — they recalculate automatically when source data changes.\nTip: select B${dataStart}:B${totalRow - 1} in Excel and Insert → Chart to visualise.`;
    },
  },

  // ── PPTX read ─────────────────────────────────────────────────────────────
  {
    name: 'office_read_pptx',
    category: 'office',
    description: 'Read a PowerPoint presentation (.pptx) and extract all slide content including titles, body text, speaker notes, and text boxes. Returns slide-by-slide breakdown.',
    params: ['path', 'includeNotes', 'slideRange'],
    permissionLevel: 'safe',
    async execute({ path: filePath, includeNotes = true, slideRange }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const JSZip = require('jszip');

      const data = await fsp.readFile(resolved);
      const zip = await JSZip.loadAsync(data);

      // Parse slide files
      const slideFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const na = parseInt(a.match(/\d+/)[0]);
          const nb = parseInt(b.match(/\d+/)[0]);
          return na - nb;
        });

      // Parse note files
      const noteFiles = includeNotes
        ? Object.keys(zip.files)
          .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))
          .sort((a, b) => {
            const na = parseInt(a.match(/\d+/)[0]);
            const nb = parseInt(b.match(/\d+/)[0]);
            return na - nb;
          })
        : [];

      // Parse slide range
      let start = 1, end = slideFiles.length;
      if (slideRange) {
        const parts = String(slideRange).split('-');
        start = parseInt(parts[0]) || 1;
        end = parseInt(parts[1]) || slideFiles.length;
      }

      // Get total slide count from presentation.xml
      let totalSlides = slideFiles.length;
      try {
        const presXml = await zip.files['ppt/presentation.xml']?.async('text');
        if (presXml) {
          const sldIdMatches = [...presXml.matchAll(/<p:sldId\b/g)];
          totalSlides = sldIdMatches.length || slideFiles.length;
        }
      } catch {}

      const output = [`[PowerPoint: ${path.basename(resolved)} — ${totalSlides} slides]`];

      for (let i = start - 1; i < Math.min(end, slideFiles.length); i++) {
        const slideXml = await zip.files[slideFiles[i]].async('text');

        // Extract text from <a:t> elements (DrawingML text runs)
        const textNodes = [...slideXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
          .map((m) => decodeXMLEntities(m[1].trim()))
          .filter(Boolean);

        // Try to separate title from body (title is usually in first sp with <p:ph type="title">)
        const titleMatch = slideXml.match(/<p:ph\s+type="title"[^>]*\/>[\s\S]*?<a:t[^>]*>([^<]+)<\/a:t>/);
        const slideTitle = titleMatch ? decodeXMLEntities(titleMatch[1]) : '';

        output.push(`\n=== Slide ${i + 1}${slideTitle ? ': ' + slideTitle : ''} ===`);
        const bodyTexts = slideTitle ? textNodes.filter((t) => t !== slideTitle) : textNodes;
        if (bodyTexts.length > 0) output.push(bodyTexts.join('\n'));

        // Add notes
        if (includeNotes && noteFiles[i]) {
          try {
            const noteXml = await zip.files[noteFiles[i]].async('text');
            const noteTexts = [...noteXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
              .map((m) => decodeXMLEntities(m[1].trim()))
              .filter(Boolean)
              .filter((t) => t !== slideTitle); // skip slide title repeated in notes
            if (noteTexts.length > 0) {
              output.push(`\n[Speaker Notes]\n${noteTexts.join('\n')}`);
            }
          } catch {}
        }
      }

      if (end < slideFiles.length) {
        output.push(`\n... ${slideFiles.length - end} more slides not shown. Use slideRange to read more.`);
      }

      return output.join('\n');
    },
  },

  // ── PPTX write ────────────────────────────────────────────────────────────
  {
    name: 'office_write_pptx',
    category: 'office',
    description: 'POWERPOINT PRESENTATIONS ONLY — NOT for Excel/spreadsheets (use office_write_xlsx for those). Creates a styled .pptx using pptxgenjs with built-in themes or a user template. QUALITY REQUIREMENTS: (1) Every slide title must be a TALKING HEADER — a complete sentence conveying the key insight, e.g. "Enterprise AI Adoption Tripled in 2025" not just "AI Adoption". (2) Content slides need 4–6 substantive bullet points minimum. (3) Always generate the exact number of slides requested. (4) Required structure: first slide = title layout, last slide = title layout (closing/thank you), middle slides = content/section/two-column/table. (5) Use section slides as visual dividers between topic groups.',
    params: ['path', 'title', 'slides', 'templatePath', 'theme', 'author'],
    permissionLevel: 'write',
    async execute({ path: filePath, title = 'Presentation', slides = [], templatePath, theme = 'professional', author = '' }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);

      // ── Built-in themes ────────────────────────────────────────────────────
      const THEMES = {
        professional: {
          bg: 'FFFFFF',
          titleBg: '1E3A5F',
          titleText: 'FFFFFF',
          titleSubtext: 'A8C4E0',
          accentBar: '2E86AB',
          headingText: '1E3A5F',
          bodyText: '2D3748',
          bulletText: '374151',
          font: 'Calibri',
          slidesBg: 'F8FAFC',
          slidesBgAlt: 'FFFFFF',
          tableHeader: '1E3A5F',
          tableHeaderText: 'FFFFFF',
          tableRowAlt: 'EBF4F9',
          chartColors: ['2E86AB', '1E3A5F', '4FB0C6', 'A8C4E0', '6B7280'],
        },
        dark: {
          bg: '1A1A2E',
          titleBg: '16213E',
          titleText: 'E2E8F0',
          titleSubtext: '94A3B8',
          accentBar: '0F3460',
          headingText: 'E2E8F0',
          bodyText: 'CBD5E1',
          bulletText: 'CBD5E1',
          font: 'Calibri',
          slidesBg: '1A1A2E',
          slidesBgAlt: '16213E',
          tableHeader: '0F3460',
          tableHeaderText: 'E2E8F0',
          tableRowAlt: '1E2A4A',
          chartColors: ['4A9EBF', 'E94560', '0F3460', '533483', '16213E'],
        },
        minimal: {
          bg: 'FFFFFF',
          titleBg: 'FFFFFF',
          titleText: '111827',
          titleSubtext: '6B7280',
          accentBar: '111827',
          headingText: '111827',
          bodyText: '374151',
          bulletText: '4B5563',
          font: 'Helvetica',
          slidesBg: 'FFFFFF',
          slidesBgAlt: 'F9FAFB',
          tableHeader: '111827',
          tableHeaderText: 'FFFFFF',
          tableRowAlt: 'F3F4F6',
          chartColors: ['111827', '6B7280', '9CA3AF', 'D1D5DB', '374151'],
        },
        vibrant: {
          bg: 'FFFFFF',
          titleBg: '7C3AED',
          titleText: 'FFFFFF',
          titleSubtext: 'DDD6FE',
          accentBar: '7C3AED',
          headingText: '4C1D95',
          bodyText: '374151',
          bulletText: '374151',
          font: 'Calibri',
          slidesBg: 'FAFAFA',
          slidesBgAlt: 'FFFFFF',
          tableHeader: '7C3AED',
          tableHeaderText: 'FFFFFF',
          tableRowAlt: 'F5F3FF',
          chartColors: ['7C3AED', 'A78BFA', 'C4B5FD', 'DDD6FE', '4C1D95'],
        },
      };

      let t = THEMES[theme] || THEMES.professional;

      // ── Template color extraction (override theme with template's palette) ──
      if (templatePath) {
        try {
          const tmplResolved = resolvePath(templatePath);
          const JSZip = require('jszip');
          const tmplData = await fsp.readFile(tmplResolved);
          const tmplZip = await JSZip.loadAsync(tmplData);

          // Try to extract accent/dk1/lt1 colors from theme XML
          const themeFiles = Object.keys(tmplZip.files).filter((n) =>
            /^ppt\/theme\/theme\d*\.xml$/.test(n)
          );
          if (themeFiles.length > 0) {
            const themeXml = await tmplZip.files[themeFiles[0]].async('text');

            const extractColor = (tag) => {
              const m = themeXml.match(new RegExp(`<a:${tag}[^>]*>[\\s\\S]*?<a:srgbClr val="([A-Fa-f0-9]{6})"`, 'i'));
              return m ? m[1].toUpperCase() : null;
            };
            const dk1 = extractColor('dk1');
            const lt1 = extractColor('lt1');
            const accent1 = extractColor('accent1');
            const accent2 = extractColor('accent2');

            // Apply extracted colors if found
            if (dk1) {
              t = { ...t, titleText: lt1 || t.titleText, headingText: dk1, bodyText: dk1 };
            }
            if (lt1) {
              t = { ...t, titleBg: dk1 || t.titleBg, slidesBg: lt1, slidesBgAlt: lt1 };
            }
            if (accent1) {
              t = { ...t, accentBar: accent1, titleBg: accent1, tableHeader: accent1 };
            }
            if (accent2) {
              t = { ...t, chartColors: [accent1 || t.chartColors[0], accent2, ...t.chartColors.slice(2)] };
            }
          }
        } catch (e) {
          // Template read failed — fall back to chosen theme silently
        }
      }

      // ── Build presentation ─────────────────────────────────────────────────
      const pptxgen = require('pptxgenjs');
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';
      pres.title = title;
      if (author) pres.author = author;

      const W = 10; // slide width inches
      const H = 5.625; // slide height inches

      const makeShadow = () => ({
        type: 'outer', color: '000000', blur: 6, offset: 2, angle: 135, opacity: 0.12,
      });

      // ── Helper: title/cover slide ──────────────────────────────────────────
      const addTitleSlide = (slide, { title: sTitle = '', subtitle = '' }) => {
        slide.background = { color: t.titleBg };

        // Decorative accent rectangle (bottom band)
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: H - 0.55, w: W, h: 0.55,
          fill: { color: t.accentBar, transparency: 20 },
          line: { color: t.accentBar, width: 0 },
        });

        // Left vertical accent bar
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 0.18, h: H,
          fill: { color: t.accentBar },
          line: { color: t.accentBar, width: 0 },
        });

        // Title text
        slide.addText(sTitle, {
          x: 0.5, y: 1.5, w: W - 1.0, h: 1.2,
          fontSize: 36, fontFace: t.font, color: t.titleText,
          bold: true, align: 'left', valign: 'middle', margin: 0,
        });

        // Subtitle
        if (subtitle) {
          slide.addText(subtitle, {
            x: 0.5, y: 2.9, w: W - 1.0, h: 0.8,
            fontSize: 18, fontFace: t.font, color: t.titleSubtext,
            bold: false, align: 'left', valign: 'top', margin: 0,
          });
        }
      };

      // ── Helper: content slide ──────────────────────────────────────────────
      const addContentSlide = (slide, { title: sTitle = '', content = [], notes = '' }) => {
        slide.background = { color: t.slidesBg };

        // Top header bar
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: W, h: 0.9,
          fill: { color: t.titleBg },
          line: { color: t.titleBg, width: 0 },
        });

        // Left accent bar (full height)
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 0.12, h: H,
          fill: { color: t.accentBar },
          line: { color: t.accentBar, width: 0 },
        });

        // Slide title
        slide.addText(sTitle, {
          x: 0.28, y: 0, w: W - 0.4, h: 0.9,
          fontSize: 22, fontFace: t.font, color: t.titleText,
          bold: true, align: 'left', valign: 'middle', margin: [0, 0, 0, 0.15],
        });

        // Bullet content
        if (content.length > 0) {
          const bulletItems = content.map((item, idx) => {
            const isSubItem = typeof item === 'string' && item.startsWith('  ');
            const text = typeof item === 'string' ? item.trim() : String(item);
            return {
              text,
              options: {
                bullet: true,
                indentLevel: isSubItem ? 1 : 0,
                fontSize: isSubItem ? 14 : 16,
                fontFace: t.font,
                color: t.bulletText,
                breakLine: idx < content.length - 1,
                paraSpaceAfter: isSubItem ? 4 : 8,
              },
            };
          });

          slide.addText(bulletItems, {
            x: 0.28, y: 1.0, w: W - 0.55, h: H - 1.15,
            valign: 'top', margin: [0.1, 0.1, 0.1, 0.1],
          });
        }

        if (notes) slide.addNotes(notes);
      };

      // ── Helper: two-column slide ───────────────────────────────────────────
      const addTwoColumnSlide = (slide, { title: sTitle = '', leftContent = [], rightContent = [], notes = '' }) => {
        slide.background = { color: t.slidesBg };

        // Header bar
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: W, h: 0.9,
          fill: { color: t.titleBg },
          line: { color: t.titleBg, width: 0 },
        });

        // Accent bar
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 0.12, h: H,
          fill: { color: t.accentBar },
          line: { color: t.accentBar, width: 0 },
        });

        // Title
        slide.addText(sTitle, {
          x: 0.28, y: 0, w: W - 0.4, h: 0.9,
          fontSize: 22, fontFace: t.font, color: t.titleText,
          bold: true, align: 'left', valign: 'middle', margin: [0, 0, 0, 0.15],
        });

        // Divider line between columns
        slide.addShape(pres.shapes.LINE, {
          x: 5.0, y: 1.0, w: 0, h: H - 1.15,
          line: { color: t.accentBar, width: 1 },
        });

        // Left column
        if (leftContent.length > 0) {
          const items = leftContent.map((item, idx) => ({
            text: typeof item === 'string' ? item.trim() : String(item),
            options: {
              bullet: true,
              fontSize: 14, fontFace: t.font, color: t.bulletText,
              breakLine: idx < leftContent.length - 1,
              paraSpaceAfter: 6,
            },
          }));
          slide.addText(items, {
            x: 0.28, y: 1.05, w: 4.55, h: H - 1.25,
            valign: 'top', margin: [0.05, 0.1, 0.05, 0.1],
          });
        }

        // Right column
        if (rightContent.length > 0) {
          const items = rightContent.map((item, idx) => ({
            text: typeof item === 'string' ? item.trim() : String(item),
            options: {
              bullet: true,
              fontSize: 14, fontFace: t.font, color: t.bulletText,
              breakLine: idx < rightContent.length - 1,
              paraSpaceAfter: 6,
            },
          }));
          slide.addText(items, {
            x: 5.2, y: 1.05, w: 4.55, h: H - 1.25,
            valign: 'top', margin: [0.05, 0.1, 0.05, 0.1],
          });
        }

        if (notes) slide.addNotes(notes);
      };

      // ── Helper: table slide ────────────────────────────────────────────────
      const addTableSlide = (slide, { title: sTitle = '', tableData = [], notes = '' }) => {
        slide.background = { color: t.slidesBg };

        // Header bar
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: W, h: 0.9,
          fill: { color: t.titleBg },
          line: { color: t.titleBg, width: 0 },
        });

        // Accent bar
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 0, y: 0, w: 0.12, h: H,
          fill: { color: t.accentBar },
          line: { color: t.accentBar, width: 0 },
        });

        slide.addText(sTitle, {
          x: 0.28, y: 0, w: W - 0.4, h: 0.9,
          fontSize: 22, fontFace: t.font, color: t.titleText,
          bold: true, align: 'left', valign: 'middle', margin: [0, 0, 0, 0.15],
        });

        if (tableData.length > 0) {
          const rows = tableData.map((row, ri) =>
            row.map((cell) => ({
              text: String(cell),
              options: {
                fontSize: 13,
                fontFace: t.font,
                fill: { color: ri === 0 ? t.tableHeader : (ri % 2 === 0 ? t.tableRowAlt : 'FFFFFF') },
                color: ri === 0 ? t.tableHeaderText : t.bodyText,
                bold: ri === 0,
                align: 'center',
                valign: 'middle',
              },
            }))
          );
          slide.addTable(rows, {
            x: 0.28, y: 1.0, w: W - 0.55,
            border: { pt: 0.5, color: 'D1D5DB' },
            rowH: 0.4,
          });
        }

        if (notes) slide.addNotes(notes);
      };

      // ── Helper: section/divider slide ─────────────────────────────────────
      const addSectionSlide = (slide, { title: sTitle = '', subtitle = '' }) => {
        slide.background = { color: t.accentBar };

        slide.addShape(pres.shapes.RECTANGLE, {
          x: W * 0.55, y: 0, w: W * 0.45, h: H,
          fill: { color: t.titleBg },
          line: { color: t.titleBg, width: 0 },
        });

        slide.addText(sTitle, {
          x: 0.5, y: 1.8, w: W * 0.5, h: 1.2,
          fontSize: 30, fontFace: t.font, color: t.titleText,
          bold: true, align: 'left', valign: 'middle', margin: 0,
        });

        if (subtitle) {
          slide.addText(subtitle, {
            x: 0.5, y: 3.1, w: W * 0.5, h: 0.7,
            fontSize: 16, fontFace: t.font, color: t.titleSubtext,
            align: 'left', valign: 'top', margin: 0,
          });
        }
      };

      // ── Render each slide ──────────────────────────────────────────────────
      for (const s of slides) {
        const layout = s.layout || 'content';
        const slide = pres.addSlide();

        if (layout === 'title') {
          addTitleSlide(slide, s);
        } else if (layout === 'two-column') {
          addTwoColumnSlide(slide, s);
        } else if (layout === 'table') {
          addTableSlide(slide, s);
        } else if (layout === 'section') {
          addSectionSlide(slide, s);
        } else {
          addContentSlide(slide, s);
        }
      }

      await pres.writeFile({ fileName: resolved });

      // ── Fix: pptxgenjs v4 declares slideMaster2.xml in [Content_Types].xml
      // but never writes that file, causing strict OOXML parsers (WPS, LibreOffice)
      // to reject the file. Strip any Content_Types <Override> entries that point
      // to parts not present in the ZIP archive.
      try {
        const JSZip = require('jszip');
        const raw = await fsp.readFile(resolved);
        const zip = await JSZip.loadAsync(raw);

        const presentParts = new Set(Object.keys(zip.files).map((n) => '/' + n.replace(/^\//, '')));
        let ct = await zip.files['[Content_Types].xml'].async('text');

        // Remove <Override PartName="..."/> entries where the part is missing
        ct = ct.replace(/<Override\s+PartName="([^"]+)"[^>]*\/>/g, (match, partName) => {
          const key = partName.startsWith('/') ? partName : '/' + partName;
          // Only prune /ppt/ parts — keep docProps and other package-level parts
          if (!key.startsWith('/ppt/')) return match;
          return presentParts.has(key) ? match : '';
        });

        zip.file('[Content_Types].xml', ct);
        const fixed = await zip.generateAsync({
          type: 'nodebuffer',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        });
        await fsp.writeFile(resolved, fixed);
      } catch { /* if post-processing fails, leave original file intact */ }

      const slideCount = slides.length;
      return `Created "${path.basename(resolved)}" — ${slideCount} slide${slideCount !== 1 ? 's' : ''}${templatePath ? ' (styled from template)' : ` (theme: ${theme})`}.\nSaved to: ${resolved}`;
    },
  },

  // ── CSV read ──────────────────────────────────────────────────────────────
  {
    name: 'office_read_csv',
    category: 'office',
    description: 'Read and parse a CSV or TSV file. Returns structured data with column headers, row count, and preview rows. Supports auto-detecting delimiter. Use startRow/endRow to read a slice of the file.',
    params: ['path', 'delimiter', 'hasHeader', 'startRow', 'endRow', 'outputFormat'],
    permissionLevel: 'safe',
    async execute({ path: filePath, delimiter, hasHeader = true, startRow = 1, endRow = 200, outputFormat = 'text' }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);

      const raw = await fsp.readFile(resolved, 'utf-8');
      const lines = raw.trim().split('\n');

      // Auto-detect delimiter
      if (!delimiter) {
        const sample = lines[0] || '';
        if (sample.split('\t').length > sample.split(',').length) delimiter = '\t';
        else delimiter = ',';
      }

      const rows = parseCSV(raw, delimiter);
      const headers = hasHeader ? rows[0] : null;
      const dataRows = hasHeader ? rows.slice(1) : rows;

      const totalRows = dataRows.length;
      const sliced = dataRows.slice(startRow - 1, endRow);

      if (outputFormat === 'json') {
        if (headers) {
          return JSON.stringify(sliced.map((row) =>
            Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
          ), null, 2);
        }
        return JSON.stringify(sliced);
      }

      const output = [
        `[CSV: ${path.basename(resolved)} — ${totalRows} data rows, ${headers?.length || rows[0]?.length || 0} columns]`,
      ];

      if (headers) {
        output.push(`Columns: ${headers.join(', ')}\n`);
      }

      const preview = sliced.map((row, i) => {
        const rowNum = (startRow - 1) + i + (hasHeader ? 2 : 1);
        return `Row ${rowNum}: ${row.join(delimiter)}`;
      });
      output.push(...preview);

      if (endRow < totalRows) {
        output.push(`\n... ${totalRows - endRow} more rows. Use startRow/endRow to read more.`);
      }

      return output.join('\n');
    },
  },

  // ── CSV write ─────────────────────────────────────────────────────────────
  {
    name: 'office_write_csv',
    category: 'office',
    description: 'Write data to a CSV file. Pass rows as a 2D array (first row is headers). Use append=true to add rows to an existing file. Supports custom delimiter.',
    params: ['path', 'rows', 'delimiter', 'append'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, rows, delimiter = ',', append = false }) {
      if (!filePath || !rows) throw new Error('path and rows are required');
      if (!Array.isArray(rows)) throw new Error('rows must be a 2D array');
      const resolved = resolvePath(filePath);

      const csvText = toCSV(rows, delimiter);
      await fsp.mkdir(path.dirname(resolved), { recursive: true });

      if (append) {
        const existsSize = await fsp.stat(resolved).then((s) => s.size).catch(() => 0);
        const sep = existsSize > 0 ? '\n' : '';
        await fsp.appendFile(resolved, sep + csvText, 'utf-8');
      } else {
        await fsp.writeFile(resolved, csvText, 'utf-8');
      }

      const stat = await fsp.stat(resolved);
      return `${append ? 'Appended' : 'Wrote'} ${rows.length} rows to ${resolved} (${(stat.size / 1024).toFixed(1)} KB)`;
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// DOCX builder helpers (Office Open XML format — minimal but valid)
// ─────────────────────────────────────────────────────────────────────────────

function escapeXML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXMLEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xA;/g, '\n')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

function makePara(text, style) {
  return `<w:p>
    <w:pPr><w:pStyle w:val="${style}"/></w:pPr>
    <w:r><w:t xml:space="preserve">${escapeXML(text)}</w:t></w:r>
  </w:p>`;
}

function makeListItem(text, numbered = false) {
  const numPr = numbered
    ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    : '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>';
  return `<w:p>
    <w:pPr>${numPr}</w:pPr>
    <w:r><w:t xml:space="preserve">${escapeXML(text)}</w:t></w:r>
  </w:p>`;
}

function buildDocXml(paragraphs, title) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:mv="urn:schemas-microsoft-com:mac:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="mv mo w14 wp14">
  <w:body>
    ${paragraphs.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:sz w:val="24"/>
    </w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="160"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="2F5496"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="2F5496"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:outlineLvl w:val="2"/><w:spacing w:before="160" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="1F3864"/></w:rPr>
  </w:style>
</w:styles>`;

const DOCX_NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const WORD_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

async function buildDocxBuffer(docXml) {
  const JSZip = require('jszip');
  const zip = new JSZip();

  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', docXml);
  zip.file('word/styles.xml', DOCX_STYLES);
  zip.file('word/numbering.xml', DOCX_NUMBERING);
  zip.file('word/_rels/document.xml.rels', WORD_RELS);

  return await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SheetJS range helpers
// ─────────────────────────────────────────────────────────────────────────────

function updateSheetRange(ws, addr) {
  const XLSX = require('xlsx');
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const cell  = XLSX.utils.decode_cell(addr);
  if (cell.r < range.s.r) range.s.r = cell.r;
  if (cell.c < range.s.c) range.s.c = cell.c;
  if (cell.r > range.e.r) range.e.r = cell.r;
  if (cell.c > range.e.c) range.e.c = cell.c;
  ws['!ref'] = XLSX.utils.encode_range(range);
}

function extendRange(existing, additional) {
  const XLSX = require('xlsx');
  if (!existing) return additional;
  const r1 = XLSX.utils.decode_range(existing);
  const r2 = XLSX.utils.decode_range(additional);
  const merged = {
    s: { r: Math.min(r1.s.r, r2.s.r), c: Math.min(r1.s.c, r2.s.c) },
    e: { r: Math.max(r1.e.r, r2.e.r), c: Math.max(r1.e.c, r2.e.c) },
  };
  return XLSX.utils.encode_range(merged);
}

module.exports = { OfficeTools };
