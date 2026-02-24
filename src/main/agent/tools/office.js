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
const { getPythonPath } = require('../../python-runtime');

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
      exec(`"${getPythonPath()}" "${scriptPath}" ${escapedArgs}`,
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
 * runPythonWithJSON(scriptBody, configObj, timeout)
 * Like runPythonScript but passes complex config via a temp JSON file instead of argv.
 * Handles all characters in the config safely.
 */
async function runPythonWithJSON(scriptBody, configObj, timeout = 120000) {
  const configPath = path.join(os.tmpdir(), `_od_cfg_${process.pid}_${Date.now()}.json`);
  await fsp.writeFile(configPath, JSON.stringify(configObj), 'utf-8');
  try {
    return await runPythonScript(scriptBody, [configPath], timeout);
  } finally {
    await fsp.unlink(configPath).catch(() => {});
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
/**
 * searchPDF(filePath, query, opts)
 *
 * Key fix over the old version:
 *  - Searches the FULL normalized page text (not line-by-line) so multi-line
 *    phrases like "augmented\npiotroski score" are always found.
 *  - Uses PyMuPDF (fitz) as primary extractor + pdfplumber fallback.
 *  - Returns surrounding context as original lines from around the match position.
 *  - Flags image-based (scanned) pages so the caller knows to use OCR.
 */
async function searchPDF(filePath, query, opts = {}) {
  const { maxResults = 50, contextChars = 300 } = opts;

  const script = `
import sys, json, re

pdf_path    = sys.argv[1]
query       = sys.argv[2].lower()
max_results = int(sys.argv[3]) if len(sys.argv) > 3 else 50
ctx_chars   = int(sys.argv[4]) if len(sys.argv) > 4 else 300

def extract_page_text(pdf_path):
    """Try PyMuPDF first, pdfplumber fallback. Returns list of {page, raw_text}."""
    pages_out = []
    total = 0
    # Strategy 1: PyMuPDF (fitz) — robust for research papers, journals
    try:
        import fitz
        doc = fitz.open(pdf_path)
        total = len(doc)
        for i in range(total):
            raw = doc[i].get_text('text') or ''
            pages_out.append({'page': i + 1, 'text': raw, 'chars': len(raw.strip()), 'method': 'fitz'})
        doc.close()
        return total, pages_out
    except Exception as e_fitz:
        pass

    # Strategy 2: pdfplumber fallback
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            total = len(pdf.pages)
            for i, p in enumerate(pdf.pages):
                raw = p.extract_text(x_tolerance=3, y_tolerance=3) or ''
                pages_out.append({'page': i + 1, 'text': raw, 'chars': len(raw.strip()), 'method': 'plumber'})
        return total, pages_out
    except Exception as e_plumb:
        return 0, []

def normalize_for_search(text):
    """Collapse line breaks into spaces so cross-line phrases are found."""
    # Fix hyphenated line-breaks common in justified text: "aug-\\nmented" -> "augmented"
    text = re.sub(r'(\\w)-\\n(\\w)', r'\\1\\2', text)
    # Replace all whitespace sequences (\\n, \\t, multiple spaces) with single space
    text = re.sub(r'\\s+', ' ', text)
    return text

def get_context(raw_text, match_start, match_end, ctx_chars):
    """Extract surrounding context as a clean snippet."""
    start = max(0, match_start - ctx_chars)
    end   = min(len(raw_text), match_end + ctx_chars)
    snippet = raw_text[start:end].strip()
    # Clean up excessive whitespace
    snippet = re.sub(r'\\s+', ' ', snippet)
    return ('...' if start > 0 else '') + snippet + ('...' if end < len(raw_text) else '')

try:
    total, pages = extract_page_text(pdf_path)
    if not pages:
        print(json.dumps({'error': 'Could not extract text from PDF', 'total_pages': 0, 'matches': []}))
        sys.exit(0)

    pattern = re.compile(re.escape(query), re.IGNORECASE)
    matches = []
    scanned_pages = []

    for p in pages:
        raw   = p['text']
        pg_no = p['page']

        if len(raw.strip()) < 30:
            scanned_pages.append(pg_no)
            continue

        # Normalize for search (joins cross-line phrases)
        norm = normalize_for_search(raw)

        # Find all non-overlapping matches in the normalized text
        for m in pattern.finditer(norm):
            # Map back to approximate position in original for context
            ctx = get_context(norm, m.start(), m.end(), ctx_chars)
            matches.append({
                'page':    pg_no,
                'match':   m.group(0),
                'context': ctx,
                'char_pos': m.start(),
            })
            if len(matches) >= max_results:
                break
        if len(matches) >= max_results:
            break

    result = {
        'matches':       matches,
        'total_pages':   total,
        'scanned_pages': scanned_pages,
        'match_count':   len(matches),
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e), 'matches': [], 'total_pages': 0}))
`;

  return runPythonScript(script, [filePath, query, maxResults, contextChars], 120000);
}

/**
 * searchAcrossPDFs(directory, query, opts)
 *
 * Batch-search across ALL PDFs in a directory (recursive) in ONE Python process.
 * Much faster than calling office_pdf_search once per file.
 * Returns aggregated results: [{file, page, context}]
 */
async function searchAcrossPDFs(directory, query, opts = {}) {
  const { maxResultsPerFile = 10, maxFiles = 200, recursive = true, contextChars = 250 } = opts;

  const script = `
import sys, json, re, os, glob

directory      = sys.argv[1]
query          = sys.argv[2].lower()
max_per_file   = int(sys.argv[3]) if len(sys.argv) > 3 else 10
max_files      = int(sys.argv[4]) if len(sys.argv) > 4 else 200
recursive_srch = sys.argv[5].lower() == 'true' if len(sys.argv) > 5 else True
ctx_chars      = int(sys.argv[6]) if len(sys.argv) > 6 else 250

# Find all PDFs
if recursive_srch:
    pdfs = glob.glob(os.path.join(directory, '**', '*.pdf'), recursive=True) + \\
           glob.glob(os.path.join(directory, '**', '*.PDF'), recursive=True)
else:
    pdfs = glob.glob(os.path.join(directory, '*.pdf')) + \\
           glob.glob(os.path.join(directory, '*.PDF'))

pdfs = list(set(pdfs))[:max_files]

def normalize(text):
    text = re.sub(r'(\\w)-\\n(\\w)', r'\\1\\2', text)
    return re.sub(r'\\s+', ' ', text)

def get_ctx(text, ms, me, ctx):
    s = max(0, ms - ctx)
    e = min(len(text), me + ctx)
    snip = re.sub(r'\\s+', ' ', text[s:e].strip())
    return ('...' if s > 0 else '') + snip + ('...' if e < len(text) else '')

pattern = re.compile(re.escape(query), re.IGNORECASE)

all_matches  = []
searched     = 0
failed       = []
scanned_note = []

try:
    import fitz
    has_fitz = True
except ImportError:
    has_fitz = False

for pdf_path in pdfs:
    searched += 1
    file_matches = []
    try:
        pages_text = []
        total_p = 0

        if has_fitz:
            doc = fitz.open(pdf_path)
            total_p = len(doc)
            for i in range(total_p):
                txt = doc[i].get_text('text') or ''
                pages_text.append((i + 1, txt))
            doc.close()
        else:
            try:
                import pdfplumber
                with pdfplumber.open(pdf_path) as pdf:
                    total_p = len(pdf.pages)
                    for i, pg in enumerate(pdf.pages):
                        txt = pg.extract_text(x_tolerance=3, y_tolerance=3) or ''
                        pages_text.append((i + 1, txt))
            except Exception:
                failed.append(os.path.basename(pdf_path))
                continue

        total_chars = sum(len(t) for _, t in pages_text)
        if total_chars < 50:
            scanned_note.append(os.path.basename(pdf_path))
            continue

        for pg_no, raw in pages_text:
            if len(raw.strip()) < 20:
                continue
            norm = normalize(raw)
            for m in pattern.finditer(norm):
                file_matches.append({
                    'file':    os.path.basename(pdf_path),
                    'path':    pdf_path,
                    'page':    pg_no,
                    'pages':   total_p,
                    'match':   m.group(0),
                    'context': get_ctx(norm, m.start(), m.end(), ctx_chars),
                })
                if len(file_matches) >= max_per_file:
                    break
            if len(file_matches) >= max_per_file:
                break

        if file_matches:
            all_matches.extend(file_matches)

    except Exception as e:
        failed.append(os.path.basename(pdf_path))

print(json.dumps({
    'matches':       all_matches,
    'total_matches': len(all_matches),
    'searched':      searched,
    'failed':        failed[:20],
    'scanned':       scanned_note[:20],
    'pdf_list':      [os.path.basename(p) for p in pdfs[:50]],
}))
`;

  return runPythonScript(
    script,
    [directory, query, maxResultsPerFile, maxFiles, recursive ? 'true' : 'false', contextChars],
    600000  // 10 min — many PDFs can take time
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX helpers — python-docx (primary) → mammoth (fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * extractDocxStructured(filePath)
 * Uses python-docx to return rich structured output:
 *   { paragraphs:[{text, style, level}], tables:[[[cells]]], meta, total_paragraphs }
 */
async function extractDocxStructured(filePath) {
  const script = `
import sys, json
doc_path = sys.argv[1]

try:
    from docx import Document
    from docx.oxml.ns import qn
    import datetime

    doc = Document(doc_path)

    # Core properties
    cp = doc.core_properties
    def dt_str(d):
        if d is None: return None
        if isinstance(d, datetime.datetime): return d.isoformat()
        return str(d)

    meta = {
        'title':    cp.title or '',
        'author':   cp.author or '',
        'created':  dt_str(cp.created),
        'modified': dt_str(cp.modified),
        'subject':  cp.subject or '',
        'keywords': cp.keywords or '',
    }

    # Paragraphs
    paragraphs = []
    for p in doc.paragraphs:
        txt = p.text
        style = p.style.name if p.style else 'Normal'
        level = None
        if style.startswith('Heading'):
            try: level = int(style.split()[-1])
            except: level = 1
        paragraphs.append({'text': txt, 'style': style, 'level': level})

    # Tables
    tables = []
    for tbl in doc.tables:
        rows = []
        for row in tbl.rows:
            cells = [cell.text.strip() for cell in row.cells]
            rows.append(cells)
        tables.append(rows)

    print(json.dumps({
        'paragraphs':       paragraphs,
        'tables':           tables,
        'meta':             meta,
        'total_paragraphs': len(paragraphs),
        'total_tables':     len(tables),
    }))

except ImportError:
    print(json.dumps({'error': 'python-docx not installed. Run: pip install python-docx'}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
  return runPythonScript(script, [filePath], 60000);
}

/**
 * searchDocx(filePath, query, opts)
 * Search a DOCX for a term/phrase, handling cross-paragraph normalization.
 * Returns { matches:[{paragraph_idx, style, heading_context, match, context}], total_paragraphs, match_count }
 */
async function searchDocx(filePath, query, opts = {}) {
  const { maxResults = 50, contextParas = 1 } = opts;

  const script = `
import sys, json, re
doc_path    = sys.argv[1]
query       = sys.argv[2].lower()
max_results = int(sys.argv[3]) if len(sys.argv) > 3 else 50

def normalize(text):
    text = re.sub(r'(\\w)-\\n(\\w)', r'\\1\\2', text)
    return re.sub(r'\\s+', ' ', text).strip()

try:
    from docx import Document

    doc = Document(doc_path)
    paras = []
    for p in doc.paragraphs:
        style = p.style.name if p.style else 'Normal'
        paras.append({'text': p.text, 'style': style})
    # Also include table cell text so searches find content inside tables
    for tbl in doc.tables:
        for row in tbl.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    if p.text.strip():
                        style = p.style.name if p.style else 'Normal'
                        paras.append({'text': p.text, 'style': style})

    total = len(paras)

    # Build a flat normalized corpus with paragraph boundaries tracked
    # We join all paragraphs with a unique sentinel to do cross-para matching
    SENTINEL = ' ||| '
    parts    = [normalize(p['text']) for p in paras]
    corpus   = SENTINEL.join(parts)

    pattern  = re.compile(re.escape(query), re.IGNORECASE)
    matches  = []

    # Track paragraph start offsets in the corpus
    offsets = []
    pos = 0
    for part in parts:
        offsets.append(pos)
        pos += len(part) + len(SENTINEL)

    def para_idx_for_pos(char_pos):
        """Find which paragraph index a corpus char_pos falls in."""
        for i in range(len(offsets) - 1):
            if offsets[i] <= char_pos < offsets[i + 1]:
                return i
        return len(offsets) - 1

    def find_last_heading(para_idx):
        """Walk backwards to find nearest heading paragraph."""
        for i in range(para_idx, -1, -1):
            s = paras[i]['style']
            if 'Heading' in s or 'Title' in s:
                return paras[i]['text']
        return None

    for m in pattern.finditer(corpus):
        idx = para_idx_for_pos(m.start())
        # Build snippet: para before + matching para + para after
        snip_parts = []
        for i in range(max(0, idx - 1), min(total, idx + 2)):
            snip_parts.append(parts[i])
        context = ' ... '.join(filter(None, snip_parts))

        matches.append({
            'paragraph_idx':   idx,
            'style':           paras[idx]['style'],
            'heading_context': find_last_heading(idx),
            'match':           m.group(0),
            'context':         context,
        })
        if len(matches) >= max_results:
            break

    # Dedup by paragraph_idx (don't show same paragraph twice)
    seen = set()
    deduped = []
    for m in matches:
        key = m['paragraph_idx']
        if key not in seen:
            seen.add(key)
            deduped.append(m)

    print(json.dumps({
        'matches':          deduped,
        'total_paragraphs': total,
        'match_count':      len(deduped),
    }))

except ImportError:
    print(json.dumps({'error': 'python-docx not installed. Run: pip install python-docx'}))
except Exception as e:
    print(json.dumps({'error': str(e), 'matches': [], 'total_paragraphs': 0}))
`;
  return runPythonScript(script, [filePath, query, maxResults], 60000);
}

/**
 * searchAcrossDocxs(directory, query, opts)
 * Batch search across ALL DOCX files in a directory (one Python process).
 * Returns { matches:[{file, path, paragraph_idx, style, heading_context, match, context}], total_matches, searched, failed }
 */
async function searchAcrossDocxs(directory, query, opts = {}) {
  const { maxResultsPerFile = 10, maxFiles = 200, recursive = true } = opts;

  const script = `
import sys, json, re, os, glob

directory      = sys.argv[1]
query          = sys.argv[2].lower()
max_per_file   = int(sys.argv[3]) if len(sys.argv) > 3 else 10
max_files      = int(sys.argv[4]) if len(sys.argv) > 4 else 200
recursive_srch = sys.argv[5].lower() == 'true' if len(sys.argv) > 5 else True

# Collect DOCX files
if recursive_srch:
    docxs = glob.glob(os.path.join(directory, '**', '*.docx'), recursive=True) + \\
            glob.glob(os.path.join(directory, '**', '*.DOCX'), recursive=True)
else:
    docxs = glob.glob(os.path.join(directory, '*.docx')) + \\
            glob.glob(os.path.join(directory, '*.DOCX'))

docxs = list(set(docxs))[:max_files]

def normalize(text):
    text = re.sub(r'(\\w)-\\n(\\w)', r'\\1\\2', text)
    return re.sub(r'\\s+', ' ', text).strip()

pattern    = re.compile(re.escape(query), re.IGNORECASE)
SENTINEL   = ' ||| '
all_matches = []
searched   = 0
failed     = []

try:
    from docx import Document
    has_docx = True
except ImportError:
    has_docx = False

for doc_path in docxs:
    searched += 1
    try:
        if not has_docx:
            failed.append(os.path.basename(doc_path))
            continue

        doc   = Document(doc_path)
        paras = [{'text': p.text, 'style': p.style.name if p.style else 'Normal'} for p in doc.paragraphs]
        # Also include table cell text so searches find content inside tables
        for tbl in doc.tables:
            for row in tbl.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        if p.text.strip():
                            paras.append({'text': p.text, 'style': p.style.name if p.style else 'Normal'})
        parts = [normalize(p['text']) for p in paras]
        total = len(parts)

        if sum(len(p) for p in parts) < 20:
            continue  # empty / corrupted

        corpus  = SENTINEL.join(parts)
        offsets = []
        pos = 0
        for part in parts:
            offsets.append(pos)
            pos += len(part) + len(SENTINEL)

        def para_idx_for_pos(char_pos):
            for i in range(len(offsets) - 1):
                if offsets[i] <= char_pos < offsets[i + 1]:
                    return i
            return len(offsets) - 1

        def find_last_heading(idx):
            for i in range(idx, -1, -1):
                s = paras[i]['style']
                if 'Heading' in s or 'Title' in s:
                    return paras[i]['text']
            return None

        file_matches = []
        seen_idx = set()
        for m in pattern.finditer(corpus):
            idx = para_idx_for_pos(m.start())
            if idx in seen_idx:
                continue
            seen_idx.add(idx)
            snip = ' ... '.join(filter(None, [parts[i] for i in range(max(0, idx-1), min(total, idx+2))]))
            file_matches.append({
                'file':            os.path.basename(doc_path),
                'path':            doc_path,
                'paragraph_idx':   idx,
                'style':           paras[idx]['style'],
                'heading_context': find_last_heading(idx),
                'match':           m.group(0),
                'context':         snip,
            })
            if len(file_matches) >= max_per_file:
                break

        all_matches.extend(file_matches)

    except Exception as e:
        failed.append(os.path.basename(doc_path))

print(json.dumps({
    'matches':       all_matches,
    'total_matches': len(all_matches),
    'searched':      searched,
    'failed':        failed[:20],
    'docx_list':     [os.path.basename(d) for d in docxs[:50]],
}))
`;
  return runPythonScript(
    script,
    [directory, query, maxResultsPerFile, maxFiles, recursive ? 'true' : 'false'],
    600000 // 10 min
  );
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
  // Normalize Windows CRLF → LF so \r never leaks into field values or header names
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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
        row.push(field.trim()); field = '';
      } else {
        field += ch;
      }
    }
    row.push(field.trim());
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
// Excel analysis helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * analyzeExcelWorkbook(filePath, opts)
 * Deep multi-sheet analysis: headers, data types, statistics, samples, cross-sheet refs.
 * Returns a rich formatted text report the LLM can reason over directly.
 */
async function analyzeExcelWorkbook(filePath, opts = {}) {
  const { sampleRows = 5, maxColsPerSheet = 60 } = opts;
  const ExcelJS = require('exceljs');

  const stat = await fsp.stat(filePath);
  const sizeFmt = stat.size < 1048576
    ? `${(stat.size / 1024).toFixed(1)} KB`
    : `${(stat.size / 1048576).toFixed(1)} MB`;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const sheets = wb.worksheets;
  const sheetNames = sheets.map(s => s.name);

  const lines = [];
  lines.push(`# Excel Workbook: ${path.basename(filePath)}`);
  lines.push(`Path: ${filePath}  |  Size: ${sizeFmt}  |  Modified: ${stat.mtime.toLocaleDateString()}`);
  lines.push(`Sheets (${sheetNames.length}): ${sheetNames.join(' · ')}`);

  let grandTotalRows = 0;
  const crossRefs = [];

  // Helper: unwrap ExcelJS cell value to a plain JS value
  function unwrapCell(cell) {
    const v = cell.value;
    if (v == null) return null;
    // Formula cell — use cached result
    if (typeof v === 'object' && v !== null && 'result' in v) {
      const r = v.result;
      return (r instanceof Error || r == null) ? null : r;
    }
    // Rich text
    if (typeof v === 'object' && v !== null && Array.isArray(v.richText)) {
      return v.richText.map(rt => rt.text || '').join('');
    }
    // Hyperlink
    if (typeof v === 'object' && v !== null && v.text != null) {
      return String(v.text);
    }
    return v;
  }

  for (const ws of sheets) {
    const sheetName = ws.name;

    // Build 2D array from all rows (ExcelJS 1-based indexing)
    const allRows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const rowData = [];
      for (let c = 1; c <= Math.min(ws.columnCount || maxColsPerSheet, maxColsPerSheet); c++) {
        rowData.push(unwrapCell(row.getCell(c)));
      }
      // Trim trailing nulls but keep row
      allRows.push(rowData);
    });

    if (allRows.length === 0) {
      lines.push(`\n## Sheet: "${sheetName}" — (empty)`);
      continue;
    }

    // Determine actual column count from data (not ws.columnCount which may be 0 on some versions)
    const actualCols = Math.min(
      Math.max(...allRows.map(r => r.length), 1),
      maxColsPerSheet
    );

    const nRows = allRows.length;
    const dataRows = Math.max(0, nRows - 1);
    grandTotalRows += dataRows;

    const headers = (allRows[0] || []).slice(0, actualCols).map((h, i) =>
      h != null && String(h).trim() ? String(h).trim() : `Col${i + 1}`
    );
    const dataRowsArr = allRows.slice(1);

    lines.push(`\n## Sheet: "${sheetName}"  (${nRows.toLocaleString()} rows × ${actualCols} cols | ${dataRows.toLocaleString()} data rows)`);
    lines.push(`Columns: ${headers.join(' | ')}`);
    lines.push('');
    lines.push('**Column Analysis:**');

    for (let c = 0; c < actualCols; c++) {
      const header = headers[c];
      const rawVals = dataRowsArr.map(r => (r[c] !== undefined ? r[c] : null));
      const nonNull = rawVals.filter(v => v != null && v !== '');
      const nullCount = rawVals.length - nonNull.length;

      // Type detection
      const nums = nonNull.filter(v => typeof v === 'number' && isFinite(v));
      const dates = nonNull.filter(v => v instanceof Date);
      const isNumericDom = nonNull.length > 0 && nums.length / nonNull.length >= 0.75;
      const isDateDom = nonNull.length > 0 && dates.length / nonNull.length >= 0.75;

      // Check for formula on first data row cell (row index 2 in 1-based)
      const firstDataCell = ws.getRow(2).getCell(c + 1);
      const hasFormula = firstDataCell?.type === ExcelJS.ValueType?.Formula ||
        (firstDataCell?.value && typeof firstDataCell.value === 'object' && 'formula' in firstDataCell.value);
      const formulaStr = hasFormula && firstDataCell?.value?.formula
        ? String(firstDataCell.value.formula).slice(0, 60)
        : null;

      // Detect cross-sheet refs in formulas
      if (crossRefs.length < 10) {
        ws.eachRow({ includeEmpty: false }, (row, rIdx) => {
          if (crossRefs.length >= 10) return;
          const cell = row.getCell(c + 1);
          if (cell?.value && typeof cell.value === 'object' && cell.value.formula) {
            const f = String(cell.value.formula);
            const extRefs = f.match(/([A-Za-z0-9_'[\]]+)!/g);
            if (extRefs) {
              const addr = `${ws.name}!${cell.address || `R${rIdx}C${c+1}`}`;
              crossRefs.push(`  ${addr}  →  references ${extRefs.join(', ')}`);
            }
          }
        });
      }

      const type = hasFormula ? 'formula' : isDateDom ? 'date' : isNumericDom ? 'number' : 'text';
      const uniqueSet = new Set(nonNull.map(v => String(v)));

      const parts = [`${nonNull.length.toLocaleString()} values`];
      if (nullCount > 0) parts.push(`${nullCount} empty`);

      const fmt = (n) => {
        if (!isFinite(n)) return String(n);
        const a = Math.abs(n);
        if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
        if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
        if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return Number.isInteger(n) ? n.toLocaleString() : parseFloat(n.toFixed(2)).toString();
      };

      if (type === 'number' && nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0);
        const avg = sum / nums.length;
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        parts.push(`Sum: ${fmt(sum)}  Avg: ${fmt(avg)}  Min: ${fmt(min)}  Max: ${fmt(max)}`);
      } else if (type === 'date' && dates.length > 0) {
        const sorted = [...dates].sort((a, b) => a - b);
        parts.push(`Range: ${sorted[0].toLocaleDateString()} → ${sorted[sorted.length - 1].toLocaleDateString()}`);
        parts.push(`${uniqueSet.size} unique dates`);
      } else if (type === 'text') {
        parts.push(`${uniqueSet.size} unique`);
        if (uniqueSet.size <= 25) {
          const freq = {};
          nonNull.forEach(v => { const k = String(v); freq[k] = (freq[k] || 0) + 1; });
          const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6)
            .map(([k, n]) => (n > 1 ? `${k}(×${n})` : k));
          parts.push(`Values: ${top.join(', ')}${uniqueSet.size > 6 ? ' …' : ''}`);
        }
      }

      if (formulaStr) parts.push(`Formula: =${formulaStr}`);

      lines.push(`  ${header} [${type}] — ${parts.join('  |  ')}`);
    }

    // Sample rows
    if (dataRowsArr.length > 0 && sampleRows > 0) {
      lines.push('');
      lines.push(`**Sample (first ${Math.min(sampleRows, dataRowsArr.length)} rows):**`);
      for (const row of dataRowsArr.slice(0, sampleRows)) {
        const cells = headers.map((_, ci) => {
          const v = row[ci] !== undefined ? row[ci] : null;
          if (v == null) return '—';
          if (v instanceof Date) return v.toLocaleDateString();
          if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : parseFloat(v.toFixed(4)).toString();
          return String(v).slice(0, 40);
        });
        lines.push(`  ${cells.join(' | ')}`);
      }
    }
  }

  if (crossRefs.length > 0) {
    lines.push('\n**Cross-sheet References:**');
    lines.push(...crossRefs);
  }

  // Summary line near top
  lines.splice(3, 0, `Total: ${sheetNames.length} sheet(s), ${grandTotalRows.toLocaleString()} data rows`);

  return lines.join('\n');
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
      const { matches, total_pages, match_count } = result;
      if (!matches || matches.length === 0) {
        return `[PDF Search] No matches for "${query}" in ${path.basename(resolved)} (${total_pages} pages).`;
      }
      const lines = [
        `[PDF Search: "${query}" — ${match_count} match(es) across ${total_pages} pages — ${path.basename(resolved)}]\n`,
      ];
      for (const m of matches) {
        lines.push(`--- Page ${m.page} ---`);
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

  {
    name: 'office_search_pdfs',
    category: 'office',
    description: 'Search for a term or phrase across ALL PDF files in a directory (recursive by default). Runs in one Python process — much faster than calling office_pdf_search once per file. Use this when the user wants to find which PDF(s) contain a specific term, or search across a collection of documents. Returns matching context, page numbers, and file names.',
    params: ['directory', 'query', 'maxResultsPerFile', 'maxFiles', 'recursive'],
    permissionLevel: 'safe',
    async execute({ directory, query, maxResultsPerFile = 10, maxFiles = 200, recursive = true }) {
      if (!directory) throw new Error('directory is required');
      if (!query)     throw new Error('query is required');
      const resolved = resolvePath(directory);
      const result = await searchAcrossPDFs(resolved, query, { maxResultsPerFile, maxFiles, recursive });
      if (result.error) throw new Error(result.error);
      const { matches, total_matches, searched, failed, scanned, pdf_list } = result;

      const header = [
        `[PDF Batch Search: "${query}"]`,
        `  PDFs searched: ${searched} | Matches: ${total_matches}` +
        (failed?.length  ? ` | Failed: ${failed.length}`  : '') +
        (scanned?.length ? ` | Scanned/image-only: ${scanned.length}` : ''),
        '',
      ];

      if (!matches || matches.length === 0) {
        return [...header, `No matches found for "${query}" across ${searched} PDF(s).`].join('\n');
      }

      const lines = [...header];
      let lastFile = null;
      for (const m of matches) {
        if (m.file !== lastFile) {
          lines.push(`\n### ${m.file}`);
          lastFile = m.file;
        }
        lines.push(`  Page ${m.page}/${m.pages}: ${m.context}`);
      }

      if (failed?.length)  lines.push(`\n[Failed to read: ${failed.join(', ')}]`);
      if (scanned?.length) lines.push(`[Image-only (no text): ${scanned.join(', ')}]`);

      return lines.join('\n');
    },
  },

  // ── DOCX read ─────────────────────────────────────────────────────────────
  {
    name: 'office_read_docx',
    category: 'office',
    description: 'Read a Word document (.docx). Modes: "text" (plain text, default), "html" (structured HTML with headings/lists), "structured" (rich outline: heading hierarchy, tables, metadata including author/title/dates — best for understanding document structure before editing).',
    params: ['path', 'format'],
    permissionLevel: 'safe',
    async execute({ path: filePath, format = 'text' }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);

      if (format === 'structured') {
        const result = await extractDocxStructured(resolved);
        if (result.error) throw new Error(result.error);
        const { paragraphs, tables, meta, total_paragraphs, total_tables } = result;

        const lines = [`[DOCX Structured — ${path.basename(resolved)}]`];
        if (meta?.title)    lines.push(`Title:    ${meta.title}`);
        if (meta?.author)   lines.push(`Author:   ${meta.author}`);
        if (meta?.created)  lines.push(`Created:  ${meta.created}`);
        if (meta?.modified) lines.push(`Modified: ${meta.modified}`);
        lines.push(`Paragraphs: ${total_paragraphs}  |  Tables: ${total_tables}`);
        lines.push('');

        for (const p of paragraphs) {
          if (!p.text.trim()) continue;
          if (p.level === 1) lines.push(`\n# ${p.text}`);
          else if (p.level === 2) lines.push(`\n## ${p.text}`);
          else if (p.level === 3) lines.push(`\n### ${p.text}`);
          else if (p.level) lines.push(`\n${'#'.repeat(p.level)} ${p.text}`);
          else if (p.style === 'List Paragraph' || p.style?.includes('List')) lines.push(`  • ${p.text}`);
          else lines.push(p.text);
        }

        if (tables.length > 0) {
          lines.push('\n\n--- TABLES ---');
          tables.forEach((tbl, ti) => {
            lines.push(`\nTable ${ti + 1}:`);
            for (const row of tbl) lines.push('  ' + row.join(' | '));
          });
        }

        return lines.join('\n');
      }

      const mammoth = require('mammoth');
      if (format === 'html') {
        const result = await mammoth.convertToHtml({ path: resolved });
        return `[DOCX HTML — ${path.basename(resolved)}]\n\n${result.value}`;
      }

      // Default: plain text
      const result = await mammoth.extractRawText({ path: resolved });
      const warnings = result.messages.filter((m) => m.type === 'warning').map((m) => m.message);
      let out = `[DOCX — ${path.basename(resolved)}]\n\n${result.value}`;
      if (warnings.length > 0) out += `\n\n[Warnings: ${warnings.join('; ')}]`;
      return out;
    },
  },

  // ── DOCX write ────────────────────────────────────────────────────────────
  {
    name: 'office_write_docx',
    category: 'office',
    description: 'Create a Word document (.docx) from markdown-like content. Supports: # H1, ## H2, ### H3 (headings), - or * (bullet lists), 1. (numbered lists), **bold**, *italic*, ***bold+italic***, __underline__, `code` (inline formatting), | col | col | (markdown tables — first row = header), --- alone on a line (page break). Paragraph text becomes Normal style.',
    params: ['path', 'content', 'title'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, content, title }) {
      if (!filePath || !content) throw new Error('path and content are required');
      const resolved = resolvePath(filePath);

      const lines = content.split('\n');
      const elements = []; // each item is either an XML string or {type:'table', rows}
      let tableBuffer = [];
      let inTable = false;

      const flushTable = () => {
        if (tableBuffer.length > 0) {
          const rows = parseMarkdownTable(tableBuffer);
          if (rows.length > 0) elements.push({ type: 'table', rows });
          tableBuffer = [];
        }
        inTable = false;
      };

      for (const line of lines) {
        const trimmed = line.trim();

        // Detect markdown table lines
        if (trimmed.startsWith('|')) {
          inTable = true;
          tableBuffer.push(line);
          continue;
        }
        if (inTable) { flushTable(); }

        if (!trimmed) {
          elements.push('<w:p/>');
        } else if (trimmed === '---' || trimmed === '***' || trimmed === '===') {
          // Page break
          elements.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
        } else if (trimmed.startsWith('#### ')) {
          elements.push(makePara(trimmed.slice(5), 'Heading4'));
        } else if (trimmed.startsWith('### ')) {
          elements.push(makePara(trimmed.slice(4), 'Heading3'));
        } else if (trimmed.startsWith('## ')) {
          elements.push(makePara(trimmed.slice(3), 'Heading2'));
        } else if (trimmed.startsWith('# ')) {
          elements.push(makePara(trimmed.slice(2), 'Heading1'));
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          elements.push(makeListItem(trimmed.slice(2)));
        } else if (/^\d+\.\s/.test(trimmed)) {
          elements.push(makeListItem(trimmed.replace(/^\d+\.\s/, ''), true));
        } else {
          elements.push(makePara(trimmed, 'Normal'));
        }
      }
      if (inTable) flushTable();

      // Build final paragraphs array, expanding tables into XML
      const paragraphs = [];
      for (const el of elements) {
        if (typeof el === 'string') {
          paragraphs.push(el);
        } else if (el.type === 'table') {
          paragraphs.push(makeTable(el.rows));
        }
      }

      const docXml = buildDocXml(paragraphs, title || path.basename(resolved, '.docx'));
      const docxBuffer = await buildDocxBuffer(docXml);

      await fsp.mkdir(path.dirname(resolved), { recursive: true });
      await fsp.writeFile(resolved, docxBuffer);

      return `Created DOCX: ${resolved} (${(docxBuffer.length / 1024).toFixed(1)} KB)`;
    },
  },

  // ── DOCX search ───────────────────────────────────────────────────────────
  {
    name: 'office_search_docx',
    category: 'office',
    description: 'Search for a specific term or phrase inside a Word document (.docx). Returns matching paragraphs with surrounding context, the section heading they appear under, and the paragraph style. Handles cross-paragraph phrases correctly via text normalization.',
    params: ['path', 'query', 'maxResults'],
    permissionLevel: 'safe',
    async execute({ path: filePath, query, maxResults = 30 }) {
      if (!filePath) throw new Error('path is required');
      if (!query)    throw new Error('query is required');
      const resolved = resolvePath(filePath);
      const result = await searchDocx(resolved, query, { maxResults });
      if (result.error) throw new Error(result.error);
      const { matches, total_paragraphs, match_count } = result;
      if (!matches || matches.length === 0) {
        return `[DOCX Search] No matches for "${query}" in ${path.basename(resolved)} (${total_paragraphs} paragraphs).`;
      }
      const lines = [
        `[DOCX Search: "${query}" — ${match_count} match(es) in ${path.basename(resolved)} (${total_paragraphs} paragraphs)]\n`,
      ];
      for (const m of matches) {
        const section = m.heading_context ? `  Section: ${m.heading_context}` : '';
        lines.push(`--- Para #${m.paragraph_idx + 1} [${m.style}]${section ? '\n' + section : ''} ---`);
        lines.push(m.context);
        lines.push('');
      }
      return lines.join('\n');
    },
  },

  {
    name: 'office_search_docxs',
    category: 'office',
    description: 'Search for a term or phrase across ALL Word documents (.docx) in a directory (recursive by default). Runs in one Python process — much faster than searching files one by one. Returns matches grouped by file with section context. Use this for cross-document queries like "find which reports mention topic X".',
    params: ['directory', 'query', 'maxResultsPerFile', 'maxFiles', 'recursive'],
    permissionLevel: 'safe',
    async execute({ directory, query, maxResultsPerFile = 10, maxFiles = 200, recursive = true }) {
      if (!directory) throw new Error('directory is required');
      if (!query)     throw new Error('query is required');
      const resolved = resolvePath(directory);
      const result = await searchAcrossDocxs(resolved, query, { maxResultsPerFile, maxFiles, recursive });
      if (result.error) throw new Error(result.error);
      const { matches, total_matches, searched, failed, docx_list } = result;

      const header = [
        `[DOCX Batch Search: "${query}"]`,
        `  Documents searched: ${searched} | Matches: ${total_matches}` +
        (failed?.length ? ` | Failed: ${failed.length}` : ''),
        '',
      ];

      if (!matches || matches.length === 0) {
        return [...header, `No matches found for "${query}" across ${searched} DOCX file(s).`].join('\n');
      }

      const lines = [...header];
      let lastFile = null;
      for (const m of matches) {
        if (m.file !== lastFile) {
          lines.push(`\n### ${m.file}`);
          lastFile = m.file;
        }
        const section = m.heading_context ? ` [§ ${m.heading_context}]` : '';
        lines.push(`  Para #${m.paragraph_idx + 1}${section}: ${m.context}`);
      }

      if (failed?.length) lines.push(`\n[Failed to read: ${failed.join(', ')}]`);

      return lines.join('\n');
    },
  },

  // ── XLSX analyze (deep multi-sheet analysis) ──────────────────────────────
  {
    name: 'office_analyze_xlsx',
    category: 'office',
    description: 'Deep analysis of ALL sheets in an Excel workbook. Returns headers, data types, statistics (sum/avg/min/max/unique count), sample rows, and cross-sheet formula references for every sheet. Use this FIRST before writing, charting, or summarizing any Excel file — it gives the complete picture needed to reason about the data.',
    params: ['path', 'sampleRows'],
    permissionLevel: 'safe',
    async execute({ path: filePath, sampleRows = 5 }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      // CSV files are not ZIP-based — ExcelJS would throw "Can't find end of central directory"
      if (/\.csv$/i.test(resolved)) {
        const { parse } = require('csv-parse/sync');
        const raw = await fsp.readFile(resolved, 'utf-8');
        const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true, to: sampleRows + 1 });
        const headers = rows.length ? Object.keys(rows[0]) : [];
        const totalRows = raw.split('\n').filter(l => l.trim()).length - 1;
        const lines = [
          `# CSV File: ${path.basename(resolved)}`,
          `Rows: ${totalRows}  |  Columns: ${headers.length}`,
          `Headers: ${headers.join(' | ')}`,
          ``,
          `Sample rows:`,
          ...rows.slice(0, sampleRows).map((r, i) => `  [${i + 1}] ${Object.values(r).slice(0, 8).join(' | ')}`),
          ``,
          `NOTE: This is a CSV file. Use office_read_csv to read it or office_python_dashboard to build a dashboard from it.`,
        ];
        return lines.join('\n');
      }
      return analyzeExcelWorkbook(resolved, { sampleRows });
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
                // Auto-detect formula: '=SUM(A1:A3)' in value → stored as formula, not literal text
                if (typeof op.value === 'string' && op.value.startsWith('=')) {
                  cell.value = { formula: op.value.slice(1), result: op.result ?? 0 };
                } else {
                  cell.value = op.value;
                }
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
              const _colKey = op.col ?? op.column;
              const defs = op.cols || (_colKey ? [{ col: _colKey, width: op.width }] : []);
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

  // ── XLSX chart creation (real Excel chart objects via openpyxl) ──────────
  {
    name: 'office_chart_xlsx',
    category: 'office',
    description: 'Create real Excel chart objects (bar, column, line, pie, area, scatter) embedded in a workbook. Supports multiple charts per call, custom titles, axis labels, and auto-positioning. Use office_analyze_xlsx first to understand the data layout, then call this with the correct dataRange.',
    params: ['path', 'charts'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, charts = [] }) {
      if (!filePath) throw new Error('path is required');
      if (!charts.length) throw new Error('charts array is required. Each item: {type, dataSheet, dataRange, title, targetSheet?, anchor?, xTitle?, yTitle?, width?, height?}');
      const resolved = resolvePath(filePath);

      const CHART_PY = `
import sys, json
try:
    config_path = sys.argv[1]
    with open(config_path) as f:
        config = json.load(f)
except Exception as e:
    print(json.dumps({'error': 'Config read failed: ' + str(e)})); sys.exit(0)

try:
    from openpyxl import load_workbook, Workbook
    from openpyxl.chart import BarChart, LineChart, PieChart, AreaChart, ScatterChart, Reference
    from openpyxl.utils import range_boundaries, get_column_letter
except ImportError as e:
    print(json.dumps({'error': 'openpyxl not installed: ' + str(e)})); sys.exit(0)

filepath = config['path']
charts_cfg = config.get('charts', [])

try:
    wb = load_workbook(filepath)
except FileNotFoundError:
    wb = Workbook(); wb.active.title = 'Sheet1'
except Exception as e:
    print(json.dumps({'error': 'Cannot open workbook: ' + str(e)})); sys.exit(0)

results = []
anchor_next = {}  # targetSheet -> (col_n, row_n) for auto-placement

for cfg in charts_cfg:
    try:
        ctype  = cfg.get('type', 'column').lower()
        title  = cfg.get('title', '')
        dsheet = cfg.get('dataSheet', '')
        drange = cfg.get('dataRange', '')
        tsheet = cfg.get('targetSheet', 'Charts')
        anchor = cfg.get('anchor', '')
        width  = float(cfg.get('width', 15))
        height = float(cfg.get('height', 10))
        xtitle = cfg.get('xTitle', '')
        ytitle = cfg.get('yTitle', '')

        src_ws = wb[dsheet] if (dsheet and dsheet in wb.sheetnames) else wb.active

        if tsheet not in wb.sheetnames:
            tgt_ws = wb.create_sheet(tsheet)
        else:
            tgt_ws = wb[tsheet]

        if drange:
            min_col, min_row, max_col, max_row = range_boundaries(drange)
        else:
            min_col, min_row = 1, 1
            max_row = src_ws.max_row
            max_col = src_ws.max_column

        if not anchor:
            if tsheet not in anchor_next:
                anchor_next[tsheet] = [1, 1]
            col_n, row_n = anchor_next[tsheet]
            anchor = get_column_letter(col_n) + str(row_n)
            if col_n == 1:
                anchor_next[tsheet] = [9, row_n]
            else:
                anchor_next[tsheet] = [1, row_n + 22]

        # Build chart object
        if ctype in ('bar',):
            chart = BarChart(); chart.type = 'bar'; chart.grouping = 'clustered'
        elif ctype in ('column', 'grouped_column', 'clustered_column'):
            chart = BarChart(); chart.type = 'col'; chart.grouping = 'clustered'
        elif ctype == 'stacked_bar':
            chart = BarChart(); chart.type = 'bar'; chart.grouping = 'stacked'
        elif ctype in ('stacked_column', 'stacked'):
            chart = BarChart(); chart.type = 'col'; chart.grouping = 'stacked'
        elif ctype in ('line', 'smooth_line'):
            chart = LineChart(); chart.grouping = 'standard'
        elif ctype == 'pie':
            chart = PieChart()
        elif ctype == 'area':
            chart = AreaChart()
        elif ctype == 'scatter':
            chart = ScatterChart()
        else:
            chart = BarChart(); chart.type = 'col'; chart.grouping = 'clustered'

        chart.title  = title
        chart.width  = width
        chart.height = height
        if xtitle: chart.x_axis.title = xtitle
        if ytitle: chart.y_axis.title = ytitle

        if isinstance(chart, PieChart):
            data = Reference(src_ws, min_col=min_col+1, max_col=min_col+1, min_row=min_row, max_row=max_row)
            cats = Reference(src_ws, min_col=min_col, min_row=min_row+1, max_row=max_row)
            chart.add_data(data, titles_from_data=True)
            chart.set_categories(cats)
        elif isinstance(chart, ScatterChart):
            x_vals = Reference(src_ws, min_col=min_col, min_row=min_row+1, max_row=max_row)
            y_vals = Reference(src_ws, min_col=min_col+1, max_col=max_col, min_row=min_row, max_row=max_row)
            chart.add_data(y_vals, titles_from_data=True)
            chart.set_categories(x_vals)
        else:
            data = Reference(src_ws, min_col=min_col+1, max_col=max_col, min_row=min_row, max_row=max_row)
            cats = Reference(src_ws, min_col=min_col, min_row=min_row+1, max_row=max_row)
            chart.add_data(data, titles_from_data=True)
            chart.set_categories(cats)

        tgt_ws.add_chart(chart, anchor)
        results.append({'chart': title or ctype, 'sheet': tsheet, 'anchor': anchor, 'ok': True})
    except Exception as e:
        results.append({'chart': cfg.get('title', '?'), 'error': str(e), 'ok': False})

try:
    wb.save(filepath)
    print(json.dumps({'results': results, 'saved': filepath}))
except Exception as e:
    print(json.dumps({'error': 'Save failed: ' + str(e), 'results': results}))
`;

      const res = await runPythonWithJSON(CHART_PY, { path: resolved, charts }, 60000);
      if (res.error) throw new Error(res.error);

      const ok = (res.results || []).filter(r => r.ok);
      const fail = (res.results || []).filter(r => !r.ok);
      const lines = ok.map(r => `  ✓ "${r.chart}" → ${r.sheet}!${r.anchor}`);
      if (fail.length) fail.forEach(r => lines.push(`  ✗ "${r.chart}": ${r.error}`));
      return `Created ${ok.length} chart(s) in ${path.basename(resolved)}:\n${lines.join('\n')}`;
    },
  },


  // ── XLSX dashboard ────────────────────────────────────────────────────────
  {
    name: 'office_dashboard_xlsx',
    category: 'office',
    description: 'Create a professional Excel dashboard sheet with KPI metric cards, embedded charts (up to 4), and auto-formatting. Writes a "Dashboard" sheet (or custom name) into an existing or new workbook. Use after office_analyze_xlsx to understand the data, then call this to produce an executive-ready visualization.',
    params: ['path', 'title', 'kpis', 'charts', 'outputSheet', 'summaryText'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, title = 'Dashboard', kpis = [], charts = [], outputSheet = 'Dashboard', summaryText = '' }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);

      const DASHBOARD_PY = `
import sys, json
try:
    config_path = sys.argv[1]
    with open(config_path) as f:
        config = json.load(f)
except Exception as e:
    print(json.dumps({'error': 'Config read failed: ' + str(e)})); sys.exit(0)

try:
    from openpyxl import load_workbook, Workbook
    from openpyxl.chart import BarChart, LineChart, PieChart, AreaChart, Reference
    from openpyxl.utils import get_column_letter, range_boundaries
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side, numbers
except ImportError as e:
    print(json.dumps({'error': 'openpyxl not installed: ' + str(e)})); sys.exit(0)

filepath    = config['path']
title       = config.get('title', 'Dashboard')
kpis        = config.get('kpis', [])
charts_cfg  = config.get('charts', [])
out_sheet   = config.get('outputSheet', 'Dashboard')
summary_txt = config.get('summaryText', '')

try:
    wb = load_workbook(filepath)
except FileNotFoundError:
    wb = Workbook(); wb.active.title = 'Data'
except Exception as e:
    print(json.dumps({'error': 'Cannot open workbook: ' + str(e)})); sys.exit(0)

# Remove and recreate dashboard sheet at position 0
if out_sheet in wb.sheetnames:
    del wb[out_sheet]
ws = wb.create_sheet(out_sheet, 0)
ws.sheet_view.showGridLines = False

# ── Helpers ────────────────────────────────────────────────────────────────
def fill(hex6): return PatternFill(fill_type='solid', fgColor='FF' + hex6.lstrip('#'))
def font(bold=False, size=11, hex6='000000', italic=False):
    return Font(bold=bold, size=size, color='FF'+hex6.lstrip('#'), italic=italic, name='Calibri')
def align(h='center', v='center', wrap=False):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)

DARK    = '1E1E2E'
ACCENT  = '6366F1'
GREEN   = '10B981'
AMBER   = 'F59E0B'
RED     = 'EF4444'
BLUE    = '3B82F6'
LIGHT   = 'F8FAFC'
MUTED   = '64748B'
WHITE   = 'FFFFFF'

KPI_COLORS = [ACCENT, GREEN, AMBER, BLUE]

# ── Title row (rows 1-3) ──────────────────────────────────────────────────
ws.merge_cells('A1:R3')
tc = ws['A1']
tc.value = title
tc.fill  = fill(DARK)
tc.font  = font(bold=True, size=22, hex6=WHITE)
tc.alignment = align()
for r in [1, 2, 3]:
    ws.row_dimensions[r].height = 14

# ── KPI cards (rows 5-9, 4 cols each) ────────────────────────────────────
KPI_ROW = 5
for i, kpi in enumerate(kpis[:4]):
    cs = 1 + i * 4           # col start (1,5,9,13)
    ce = cs + 3               # col end
    col_s = get_column_letter(cs)
    col_e = get_column_letter(ce)
    color = KPI_COLORS[i % len(KPI_COLORS)]

    # Merge all 5 rows of card for background
    for r in range(KPI_ROW, KPI_ROW + 5):
        for c in range(cs, ce + 1):
            cell = ws.cell(row=r, column=c)
            cell.fill = fill(color)

    ws.merge_cells(f'{col_s}{KPI_ROW}:{col_e}{KPI_ROW}')
    label_c = ws[f'{col_s}{KPI_ROW}']
    label_c.value = kpi.get('label', '')
    label_c.font  = font(size=9, hex6=WHITE, italic=True)
    label_c.alignment = align(h='left', v='center')

    ws.merge_cells(f'{col_s}{KPI_ROW+1}:{col_e}{KPI_ROW+2}')
    val_c = ws.cell(row=KPI_ROW+1, column=cs)
    val_c.value = kpi.get('value', '')
    val_c.font  = font(bold=True, size=24, hex6=WHITE)
    val_c.alignment = align()

    ws.merge_cells(f'{col_s}{KPI_ROW+3}:{col_e}{KPI_ROW+3}')
    change_c = ws.cell(row=KPI_ROW+3, column=cs)
    trend = kpi.get('trend', 'neutral')
    arrow = '▲ ' if trend == 'up' else '▼ ' if trend == 'down' else '● '
    change_c.value = arrow + str(kpi.get('change', ''))
    change_c.font  = font(size=10, hex6=WHITE, bold=True)
    change_c.alignment = align()

    ws.merge_cells(f'{col_s}{KPI_ROW+4}:{col_e}{KPI_ROW+4}')
    sub_c = ws.cell(row=KPI_ROW+4, column=cs)
    sub_c.value = kpi.get('subtitle', '')
    sub_c.font  = font(size=8, hex6=WHITE, italic=True)
    sub_c.alignment = align()

for r in [KPI_ROW, KPI_ROW+1, KPI_ROW+2, KPI_ROW+3, KPI_ROW+4]:
    ws.row_dimensions[r].height = 16 if r in [KPI_ROW+1, KPI_ROW+2] else 14

# ── Charts (2 per row, starting at row 12) ───────────────────────────────
CHART_ROW_START = 12
for i, cfg in enumerate(charts_cfg[:4]):
    ctype  = cfg.get('type', 'column').lower()
    ctitle = cfg.get('title', f'Chart {i+1}')
    dsheet = cfg.get('dataSheet', '')
    drange = cfg.get('dataRange', '')

    src_ws = wb[dsheet] if (dsheet and dsheet in wb.sheetnames) else None
    if src_ws is None:
        data_sheets = [s for s in wb.sheetnames if s != out_sheet]
        src_ws = wb[data_sheets[0]] if data_sheets else wb.active

    if drange:
        mn_c, mn_r, mx_c, mx_r = range_boundaries(drange)
    else:
        mn_c, mn_r = 1, 1; mx_r = min(src_ws.max_row, 200); mx_c = src_ws.max_column

    row_offset = (i // 2) * 22
    col_offset = (i % 2) * 9
    anchor = get_column_letter(1 + col_offset) + str(CHART_ROW_START + row_offset)

    if ctype == 'pie':
        chart = PieChart()
        data = Reference(src_ws, min_col=mn_c+1, max_col=mn_c+1, min_row=mn_r, max_row=mx_r)
        cats = Reference(src_ws, min_col=mn_c, min_row=mn_r+1, max_row=mx_r)
        chart.add_data(data, titles_from_data=True); chart.set_categories(cats)
    elif ctype == 'line':
        chart = LineChart(); chart.grouping = 'standard'
        data = Reference(src_ws, min_col=mn_c+1, max_col=mx_c, min_row=mn_r, max_row=mx_r)
        cats = Reference(src_ws, min_col=mn_c, min_row=mn_r+1, max_row=mx_r)
        chart.add_data(data, titles_from_data=True); chart.set_categories(cats)
    elif ctype == 'area':
        chart = AreaChart()
        data = Reference(src_ws, min_col=mn_c+1, max_col=mx_c, min_row=mn_r, max_row=mx_r)
        cats = Reference(src_ws, min_col=mn_c, min_row=mn_r+1, max_row=mx_r)
        chart.add_data(data, titles_from_data=True); chart.set_categories(cats)
    else:
        chart = BarChart(); chart.type = 'col'; chart.grouping = 'clustered'
        data = Reference(src_ws, min_col=mn_c+1, max_col=mx_c, min_row=mn_r, max_row=mx_r)
        cats = Reference(src_ws, min_col=mn_c, min_row=mn_r+1, max_row=mx_r)
        chart.add_data(data, titles_from_data=True); chart.set_categories(cats)

    chart.title  = ctitle
    chart.width  = float(cfg.get('width', 14))
    chart.height = float(cfg.get('height', 10))
    ws.add_chart(chart, anchor)

# ── Optional summary text (below charts) ─────────────────────────────────
if summary_txt:
    txt_row = CHART_ROW_START + max(1, ((len(charts_cfg[:4]) + 1) // 2)) * 22 + 2
    ws.merge_cells(f'A{txt_row}:R{txt_row + 3}')
    sc = ws[f'A{txt_row}']
    sc.value = summary_txt
    sc.font  = font(size=10, hex6=MUTED)
    sc.alignment = align(h='left', v='top', wrap=True)
    ws.row_dimensions[txt_row].height = 60

# ── Section label above KPIs ─────────────────────────────────────────────
ws.merge_cells('A4:R4')
lbl = ws['A4']
lbl.value = 'KEY METRICS'
lbl.font  = font(size=8, hex6=MUTED, bold=True)
lbl.alignment = align(h='left', v='center')
ws.row_dimensions[4].height = 12

# ── Column widths ─────────────────────────────────────────────────────────
for col in range(1, 19):
    ws.column_dimensions[get_column_letter(col)].width = 11

try:
    wb.save(filepath)
    print(json.dumps({'saved': filepath, 'sheet': out_sheet, 'kpis': len(kpis[:4]), 'charts': len(charts_cfg[:4])}))
except Exception as e:
    print(json.dumps({'error': 'Save failed: ' + str(e)}))
`;

      const res = await runPythonWithJSON(DASHBOARD_PY, {
        path: resolved, title, kpis, charts, outputSheet, summaryText,
      }, 60000);
      if (res.error) throw new Error(res.error);

      return (
        `Dashboard "${title}" created in ${path.basename(resolved)} → sheet "${res.sheet}".\n` +
        `  KPI cards: ${res.kpis}  |  Charts embedded: ${res.charts}\n` +
        `Open the file to see the dashboard.`
      );
    },
  },

  // ── VBA Dashboard (Terminal-launched xlwings → Excel object model) ─────────
  //
  // ARCHITECTURE: Python spawned from Electron's exec() runs in a restricted
  // macOS context and cannot drive GUI apps via AppleScript. xlwings needs
  // AppleScript to control Excel, so direct subprocess execution hangs.
  //
  // FIX: Write the xlwings script + a .command launcher, open it with macOS
  // `open` (which runs .command files in Terminal with full permissions), then
  // poll a result JSON file for up to 120 seconds.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * runViaTerminal(pythonScript, configObj, timeoutMs)
   * Writes the Python script and config to temp files, creates a .command
   * launcher (opens in Terminal on macOS), then polls for a result file.
   */
  // (helper defined inline below inside execute — hoisted here as comment)

  {
    name: 'office_python_dashboard',
    category: 'office',
    description: 'Build a comprehensive professionally styled Excel dashboard (.xlsx) from any Excel or CSV file using Python (pandas + openpyxl). ALWAYS follow the skill guide workflow: (1) call office_read_xlsx/office_read_csv to analyze the data, (2) read the skill guide fs_read("src/main/agent/skills/excel-dashboard.md"), (3) design the dashboard (KPIs, charts, analysis sheets), (4) write the complete pythonScript following the template, (5) call this tool. The tool pre-injects SOURCE, OUTPUT, RESULT_PATH, write_result() — do NOT redefine them. The script must end with write_result({ok: true, ...}).',
    params: ['path', 'pythonScript', 'outputPath'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, pythonScript: userScript, outputPath }) {
      if (!filePath)   throw new Error('path is required');
      if (!userScript) throw new Error('pythonScript is required');

      const resolved    = resolvePath(filePath);
      const resolvedOut = outputPath
        ? resolvePath(outputPath)
        : resolved.replace(/\.(xlsx?|csv)$/i, '_Dashboard.xlsx');

      const ts = Date.now();
      const scriptPath = path.join(os.tmpdir(), `od_dash_${ts}.py`);
      const resultPath = path.join(os.tmpdir(), `od_dash_result_${ts}.json`);

      // ── GOLD STANDARD boilerplate ──────────────────────────────────────────
      // Everything injected here is ALWAYS consistent regardless of how the
      // agent writes its script. The agent only writes data-specific logic.
      const boilerplate = `#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  OpenDesktop Dashboard Framework — auto-injected by office_python_dashboard ║
# ║  DO NOT redefine: SOURCE, OUTPUT, write_result(), COLORS, h(), ft(), al(),  ║
# ║  brd(), set_col_width(), kpi_card(), write_section_header(),                ║
# ║  build_data_sheet(), build_dashboard_shell()                                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
import sys, json, os, subprocess, time, traceback, atexit, re
from datetime import datetime

# ── Paths (injected by tool) ──────────────────────────────────────────────────
SOURCE      = ${JSON.stringify(resolved)}
OUTPUT      = ${JSON.stringify(resolvedOut)}
RESULT_PATH = ${JSON.stringify(resultPath)}

# ── Infrastructure ────────────────────────────────────────────────────────────
_result_written = False

def write_result(data):
    global _result_written
    _result_written = True
    with open(RESULT_PATH, 'w') as f:
        json.dump(data, f)

def _exit_handler():
    if not _result_written:
        write_result({'ok': False, 'error': 'Script exited without calling write_result()'})
atexit.register(_exit_handler)

def _exception_hook(exc_type, exc_value, exc_tb):
    global _result_written
    if not _result_written:
        tb_str = ''.join(__import__('traceback').format_exception(exc_type, exc_value, exc_tb))
        write_result({'ok': False, 'error': str(exc_value), 'traceback': tb_str[-3000:]})
    sys.__excepthook__(exc_type, exc_value, exc_tb)
sys.excepthook = _exception_hook

_is_bundled = any(x in sys.executable for x in ['Resources/python', 'resources/python'])

def _ensure_packages():
    if _is_bundled:
        return
    for pkg in ['pandas', 'openpyxl', 'numpy', 'xlrd']:
        try:
            __import__(pkg)
        except ImportError:
            print(f"Installing {pkg}...")
            for cmd in [
                [sys.executable, '-m', 'pip', 'install', pkg, '--quiet', '--break-system-packages'],
                [sys.executable, '-m', 'pip', 'install', pkg, '--quiet', '--user'],
                [sys.executable, '-m', 'pip', 'install', pkg, '--quiet'],
            ]:
                try:
                    subprocess.check_call(cmd, timeout=120,
                                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    break
                except subprocess.CalledProcessError:
                    continue
_ensure_packages()

# ── Imports (always available — do NOT re-import) ─────────────────────────────
import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, LineChart, PieChart, ScatterChart, AreaChart, Reference
from openpyxl.chart.series import DataPoint
from openpyxl.utils import get_column_letter, column_index_from_string
from openpyxl.utils.dataframe import dataframe_to_rows
from openpyxl.formatting.rule import ColorScaleRule, DataBarRule
from openpyxl.worksheet.table import Table, TableStyleInfo

# ── GOLD STANDARD color palette ───────────────────────────────────────────────
COLORS = {
    # Core brand colors
    'NAVY':     '1A1A2E', 'BLUE':    '2E4057', 'TEAL':    '048A81',
    'AMBER':    'F4A261', 'RED':     'E76F51', 'GREEN':   '2ECC71',
    # Surface / text
    'LIGHT_BG': 'F5F7FA', 'CARD_BG': 'FFFFFF', 'MUTED':   '94A3B8',
    'DARK_TEXT':'1E293B', 'MID_TEXT':'475569',
    # Extra colors agents commonly request
    'ORANGE':   'F97316', 'PURPLE':  '7C3AED', 'PINK':    'EC4899',
    'CYAN':     '06B6D4', 'LIME':    '84CC16', 'INDIGO':  '4F46E5',
    'YELLOW':   'EAB308', 'GRAY':    '6B7280', 'WHITE':   'FFFFFF',
    'BLACK':    '000000', 'DARK':    '1E293B',
}
CHART_PALETTE = ['2E4057','E76F51','048A81','F4A261','6B4EFF','2ECC71','E74C3C','F39C12']

# Global dashboard sheet reference — set by build_dashboard_shell(), used by kpi_card()
DASH = None
CHART_ROW = 11  # Charts start at row 11 on the Dashboard sheet

# ── Style helpers (always available — DO NOT redefine) ────────────────────────
def h(hex_color):
    return PatternFill('solid', fgColor=hex_color)

def ft(size=11, bold=False, color='1E293B'):
    return Font(name='Calibri', size=size, bold=bold, color=color)

def al(horiz='center', vert='center', wrap=False):
    return Alignment(horizontal=horiz, vertical=vert, wrap_text=wrap)

def brd(color='D1D5DB', style='thin'):
    s = Side(border_style=style, color=color)
    return Border(left=s, right=s, top=s, bottom=s)

def _resolve_color(color_key):
    """Accept a COLORS key name ('NAVY'), a hex string ('1A1A2E'), or '#1A1A2E'."""
    if color_key in COLORS:
        return COLORS[color_key]
    # Strip leading # if present
    return color_key.lstrip('#')

def set_col_width(ws, *_):
    """Auto-fit all columns in ws. Extra arguments are silently ignored."""
    for col_cells in ws.columns:
        max_len = max(
            (len(str(cell.value)) for cell in col_cells if cell.value is not None),
            default=8
        )
        ws.column_dimensions[get_column_letter(col_cells[0].column)].width = min(max_len + 3, 45)

def kpi_card(*args, fmt='#,##0', n_cols=2, label=None, row=None, col=None,
             ws=None, formula=None, **kwargs):
    """
    Draw a professional KPI card. GOLD STANDARD styling — always consistent.
    Accepts any calling convention — type-based inference handles all patterns:

        kpi_card(dash, row=6, col=1, label='Total Sales', formula='=SUM(Data!C:C)')
        kpi_card(dash, 6, 1, 'Total Sales', '=SUM(Data!C:C)')
        kpi_card(dash, 'Total Sales', '=SUM(Data!C:C)', row=6, col=1)
        kpi_card(6, 1, 'Total Sales', '=SUM(Data!C:C)')          # ws omitted → uses global DASH

    Note: subtitle, icon, color and other unknown kwargs are silently accepted and ignored.
    """
    if kwargs:
        _unk = [k for k in kwargs if k not in ('subtitle', 'icon', 'color', 'bg_color')]
        if _unk:
            print(f'[kpi_card] note: unknown kwargs ignored: {_unk}', flush=True)
    global DASH
    # Seed from explicit keyword args (they always win)
    _ws      = ws
    _row     = row
    _col     = col
    _label   = label
    _formula = formula

    # Process positional args left-to-right, classifying each by type
    remaining = list(args)

    # Step 1: consume worksheet (first arg that has .cell)
    if remaining and hasattr(remaining[0], 'cell'):
        _ws = remaining.pop(0)

    # Step 2: consume any remaining positional args — classify by type
    for a in remaining:
        if isinstance(a, int):
            # Integers fill row then col in order
            if _row is None:
                _row = a
            elif _col is None:
                _col = a
        elif isinstance(a, str) and a.startswith('='):
            if _formula is None:
                _formula = a
        elif isinstance(a, str):
            if _label is None:
                _label = a
        # Worksheet passed out-of-order (unusual but safe)
        elif hasattr(a, 'cell') and _ws is None:
            _ws = a

    # Fall back to global DASH if no worksheet was provided
    if _ws is None:
        _ws = DASH

    if _ws is None:      raise RuntimeError('kpi_card: no worksheet — call build_dashboard_shell() first')
    if _row is None:     raise ValueError('kpi_card: row is required')
    if _col is None:     raise ValueError('kpi_card: col is required')
    if _label is None:   raise ValueError('kpi_card: label is required')
    if _formula is None: raise ValueError('kpi_card: formula is required')

    end_col = _col + n_cols - 1

    # ── Purge stale MergedCell proxies from the card footprint ────────────────
    # openpyxl.merge_cells() leaves MergedCell proxy objects in _ws._cells even
    # after a prior merge in the same area. unmerge_cells() removes the range
    # from merged_cells.ranges but does NOT remove those proxy objects from _cells.
    # Accessing them later raises "MergedCell.value is read-only" because they are
    # not real Cells. We fix this by:
    #   1. Removing any merge ranges that overlap with our card's footprint
    #   2. Deleting the stale MergedCell proxies from _ws._cells so the next
    #      _ws.cell() call creates fresh, writable Cell objects in their place.
    from openpyxl.cell.cell import MergedCell as _MC
    _overlapping = [str(_mr) for _mr in list(_ws.merged_cells.ranges)
                    if (_mr.min_row <= _row + 2 and _mr.max_row >= _row and
                        _mr.min_col <= end_col   and _mr.max_col >= _col)]
    for _rng in _overlapping:
        _ws.unmerge_cells(_rng)
    for _r in range(_row, _row + 3):
        for _c in range(_col, end_col + 1):
            if isinstance(_ws._cells.get((_r, _c)), _MC):
                del _ws._cells[(_r, _c)]

    # Now all cells in the footprint are fresh — safe to style and re-merge
    for r in range(_row, _row + 3):
        for c in range(_col, end_col + 1):
            cell = _ws.cell(r, c)
            cell.fill = h(COLORS['CARD_BG'])
            cell.border = brd()
    top = Side(border_style='medium', color=COLORS['BLUE'])
    for c in range(_col, end_col + 1):
        _ws.cell(_row, c).border = Border(
            top=top,
            left=Side(border_style='thin', color='D1D5DB'),
            right=Side(border_style='thin', color='D1D5DB'),
            bottom=Side(border_style='thin', color='D1D5DB'),
        )
    _ws.merge_cells(start_row=_row, start_column=_col, end_row=_row, end_column=end_col)
    lc = _ws.cell(_row, _col)   # always a fresh Cell after the purge above
    lc.value = str(_label).upper()
    lc.font = ft(8, True, COLORS['MUTED'])
    lc.alignment = al()
    lc.fill = h(COLORS['CARD_BG'])
    _ws.merge_cells(start_row=_row+1, start_column=_col, end_row=_row+2, end_column=end_col)
    vc = _ws.cell(_row+1, _col)  # always a fresh Cell after the purge above
    vc.value = _formula
    vc.number_format = fmt
    vc.font = ft(24, True, COLORS['NAVY'])
    vc.alignment = al()
    vc.fill = h(COLORS['CARD_BG'])

def write_section_header(ws, row, col, text, n_cols=12):
    """Navy banner row spanning n_cols columns."""
    end_col = col + n_cols - 1
    ws.merge_cells(start_row=row, start_column=col, end_row=row, end_column=end_col)
    c = ws.cell(row, col)
    c.value = '  ' + text.upper()
    c.fill = h(COLORS['NAVY'])
    c.font = ft(10, True, 'FFFFFF')
    c.alignment = al('left', 'center')
    ws.row_dimensions[row].height = 18

def build_data_sheet(wb, df, colorscale_cols=None):
    """
    Build a GOLD STANDARD Data sheet on wb.active.
    - Blue header row, alternating light-blue / white rows
    - Excel Table with TableStyleMedium2
    - Red→White→Green ColorScale on specified numeric columns
    - Frozen header, auto-fitted column widths
    Returns the worksheet.
    """
    ws = wb.active
    ws.title = 'Data'
    HEADER_FILL = h(COLORS['BLUE'])
    HEADER_FONT = ft(10, True, 'FFFFFF')
    ALT_FILL    = h('EFF6FF')

    # Header
    for ci, cn in enumerate(df.columns, 1):
        c = ws.cell(1, ci, cn)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
        c.alignment = al()

    # Data rows
    N = len(df)
    for ri, row_vals in enumerate(df.itertuples(index=False), 2):
        fill = ALT_FILL if ri % 2 == 0 else h(COLORS['CARD_BG'])
        for ci, v in enumerate(row_vals, 1):
            c = ws.cell(ri, ci)
            if hasattr(v, 'to_pydatetime'):
                c.value = v.to_pydatetime()
            elif pd.isna(v):
                c.value = None
            else:
                c.value = v
            c.fill = fill

    # Excel Table
    last_letter = get_column_letter(len(df.columns))
    tbl = Table(displayName='DataTable', ref=f'A1:{last_letter}{N+1}')
    tbl.tableStyleInfo = TableStyleInfo(
        name='TableStyleMedium2', showFirstColumn=False,
        showLastColumn=False, showRowStripes=True, showColumnStripes=False
    )
    ws.add_table(tbl)

    # Color scales on numeric columns
    for col_name in (colorscale_cols or []):
        if col_name in df.columns:
            cl = get_column_letter(df.columns.get_loc(col_name) + 1)
            ws.conditional_formatting.add(
                f'{cl}2:{cl}{N+1}',
                ColorScaleRule(
                    start_type='min', start_color='E76F51',
                    mid_type='num',   mid_value=0,  mid_color='FFFFFF',
                    end_type='max',   end_color='2ECC71'
                )
            )

    ws.freeze_panes = 'A2'
    set_col_width(ws)
    print(f'  Data sheet: {N} rows x {len(df.columns)} cols')
    return ws

def build_dashboard_shell(wb, title, subtitle=''):
    """
    Create the Dashboard sheet (inserted at position 0) with:
    - Navy title banner (rows 1-3)
    - Light subtitle bar (row 4)
    - 'KEY METRICS' section header (row 5)
    - KPI rows (6-8), spacer (9)
    - 'CHARTS & ANALYSIS' section header (row 10)
    Sets global DASH and returns the dash worksheet.
    CHART_ROW = 11 is pre-defined. Place kpi_card() at row=6, charts at CHART_ROW.
    """
    global DASH
    dash = wb.create_sheet('Dashboard', 0)
    dash.sheet_view.showGridLines = False

    # 12-column grid, each ~12 chars wide
    for ci in range(1, 13):
        dash.column_dimensions[get_column_letter(ci)].width = 12

    # Title banner
    dash.merge_cells('A1:L3')
    tc = dash['A1']
    tc.value = title
    tc.fill = h(COLORS['NAVY'])
    tc.font = ft(20, True, 'FFFFFF')
    tc.alignment = al()
    for r in range(1, 4):
        dash.row_dimensions[r].height = 20

    # Subtitle
    dash.merge_cells('A4:L4')
    sc = dash['A4']
    sc.value = subtitle if subtitle else ''
    sc.fill = h(COLORS['LIGHT_BG'])
    sc.font = ft(9, False, COLORS['MID_TEXT'])
    sc.alignment = al('left', 'center')
    dash.row_dimensions[4].height = 14

    # Section headers + row heights
    write_section_header(dash, 5, 1, 'Key Metrics', n_cols=12)
    for r in [6, 7, 8]:
        dash.row_dimensions[r].height = 22
    dash.row_dimensions[9].height = 8
    write_section_header(dash, 10, 1, 'Charts & Analysis', n_cols=12)
    dash.row_dimensions[10].height = 18

    # Page setup
    dash.page_setup.orientation = 'landscape'
    dash.page_setup.fitToWidth  = 1
    dash.page_setup.fitToHeight = 0

    DASH = dash
    return dash

def add_bar_chart(dash, source_ws, title, n_data_rows,
                  data_col=2, cat_col=1, anchor='A11',
                  color=None, width=14, height=9):
    """Add a clustered column BarChart to dash, referencing source_ws."""
    chart = BarChart()
    chart.type = 'col'
    chart.grouping = 'clustered'
    chart.title = title
    chart.style = 10
    chart.width = width
    chart.height = height
    chart.y_axis.numFmt = '#,##0'
    chart.add_data(
        Reference(source_ws, min_col=data_col, min_row=1, max_row=n_data_rows + 1),
        titles_from_data=True
    )
    chart.set_categories(
        Reference(source_ws, min_col=cat_col, min_row=2, max_row=n_data_rows + 1)
    )
    if chart.series and color:
        chart.series[0].graphicalProperties.solidFill = color
        chart.series[0].graphicalProperties.line.solidFill = color
    dash.add_chart(chart, anchor)
    return chart

def add_line_chart(dash, source_ws, title, n_data_rows,
                   data_col=2, cat_col=1, anchor='G11',
                   color=None, width=14, height=9):
    """Add a smooth LineChart to dash, referencing source_ws."""
    chart = LineChart()
    chart.title = title
    chart.style = 10
    chart.width = width
    chart.height = height
    chart.smooth = True
    chart.y_axis.numFmt = '#,##0'
    chart.add_data(
        Reference(source_ws, min_col=data_col, min_row=1, max_row=n_data_rows + 1),
        titles_from_data=True
    )
    chart.set_categories(
        Reference(source_ws, min_col=cat_col, min_row=2, max_row=n_data_rows + 1)
    )
    if chart.series and color:
        chart.series[0].graphicalProperties.line.solidFill = color
        chart.series[0].graphicalProperties.line.width = 25000
    dash.add_chart(chart, anchor)
    return chart

def add_pie_chart(dash, source_ws, title, n_slices,
                  data_col=2, cat_col=1, anchor='A26', width=14, height=9):
    """Add a PieChart (capped at 7 slices) to dash, referencing source_ws."""
    slices = min(n_slices, 7)
    chart = PieChart()
    chart.title = title
    chart.style = 10
    chart.width = width
    chart.height = height
    chart.add_data(
        Reference(source_ws, min_col=data_col, min_row=1, max_row=slices + 1),
        titles_from_data=True
    )
    chart.set_categories(
        Reference(source_ws, min_col=cat_col, min_row=2, max_row=slices + 1)
    )
    dash.add_chart(chart, anchor)
    return chart

def style_analysis_header(ws, headers, color_key='NAVY'):
    """Write a styled header row on an analysis sheet."""
    fill = h(_resolve_color(color_key))
    font = ft(10, True, 'FFFFFF')
    for i, hdr in enumerate(headers, 1):
        c = ws.cell(1, i, hdr)
        c.fill = fill
        c.font = font
        c.alignment = al()

def style_analysis_row(ws, row, n_cols, alt_color='EFF6FF'):
    """Apply alternating fill to a data row on an analysis sheet."""
    fill = h(alt_color) if row % 2 == 0 else h(COLORS['CARD_BG'])
    for c in range(1, n_cols + 1):
        ws.cell(row, c).fill = fill

def safe_cell(ws, row, col):
    """
    Return a writable Cell even if the coordinate falls inside a merged region.
    If the cell is a MergedCell (non-top-left of a merge), returns the top-left cell.
    Use this when writing to cells that may have been merged by kpi_card or build_dashboard_shell.

    Example:
        safe_cell(dash, 6, 3).value = '=SUM(Data!C:C)'   # safe even if (6,3) is merged
    """
    from openpyxl.cell.cell import MergedCell as _MC
    c = ws.cell(row, col)
    if isinstance(c, _MC):
        for mr in ws.merged_cells.ranges:
            if mr.min_row <= row <= mr.max_row and mr.min_col <= col <= mr.max_col:
                return ws.cell(mr.min_row, mr.min_col)
    return c

import atexit

def _framework_validate():
    """Auto-runs at exit. Detects shadowed functions, missing build_dashboard_shell, and hardcoded KPIs."""
    global DASH
    import sys as _s
    _saved = getattr(_s, '_od_fns_', {})
    _g = globals()

    # ── 1. Detect framework function name shadowing ───────────────────────
    _shadowed = {}
    for _fname, _orig in _saved.items():
        _cur = _g.get(_fname)
        if _cur is not _orig:
            _shadowed[_fname] = _cur

    if _shadowed:
        for _fname, _cur_val in _shadowed.items():
            _typ = type(_cur_val).__name__
            print(f'\\n[FRAMEWORK ERROR] "{_fname}" was overwritten with {_typ}!', flush=True)
            if isinstance(_cur_val, str):
                print(f'  Its value is now: {repr(_cur_val)[:80]}', flush=True)
                if _fname == 'build_dashboard_shell':
                    print(f'  WRONG:   build_dashboard_shell = "My Dashboard Title"  ← this kills the function!', flush=True)
                    print(f'  CORRECT: title = "My Dashboard Title"', flush=True)
                    print(f'           dash = build_dashboard_shell(wb, title, "optional subtitle")', flush=True)
                else:
                    print(f'  NEVER use "{_fname}" as a variable name — it is a framework function.', flush=True)
            elif callable(_cur_val):
                print(f'  It was replaced by a different callable. Do not redefine framework functions.', flush=True)
            else:
                print(f'  NEVER use "{_fname}" as a variable name — it is a framework function.', flush=True)
        return

    # ── 2. Check build_dashboard_shell was called ─────────────────────────
    if DASH is None:
        print('\\n[FRAMEWORK ERROR] build_dashboard_shell() was never called!', flush=True)
        print('  CORRECT ORDER:', flush=True)
        print('    1. Load data:  df = pd.read_csv(SOURCE)', flush=True)
        print('    2. Build Data: build_data_sheet(wb, df)', flush=True)
        print('    3. Analysis:   ws = wb.create_sheet("By Category")', flush=True)
        print('    4. Dashboard:  dash = build_dashboard_shell(wb, "Title", "Subtitle")', flush=True)
        print('    5. KPIs:       kpi_card(row=6, col=1, label="Metric", formula=\\'=SUM(Data!C:C)\\')', flush=True)
        print('  Do NOT create a "Dashboard" sheet manually or with openpyxl.Workbook().create_sheet().', flush=True)
        return

    # ── 3. Check for hardcoded KPI values on rows 6-8 ────────────────────
    _formula_count = 0
    _hardcoded = []
    for _row in DASH.iter_rows(min_row=6, max_row=8):
        for _cell in _row:
            _v = _cell.value
            if _v is None: continue
            if str(_v).startswith('='): _formula_count += 1
            elif isinstance(_v, (int, float)): _hardcoded.append(f'{_cell.coordinate}={_v}')

    if _hardcoded:
        print(f'\\n[FRAMEWORK WARNING] {len(_hardcoded)} hardcoded KPI value(s) detected!', flush=True)
        print(f'  Hardcoded cells: {_hardcoded[:6]}', flush=True)
        print(f'  WRONG: kpi_card(..., formula=5002)', flush=True)
        print(f'  RIGHT: kpi_card(..., formula=\\'=COUNTA(Data!A:A)-1\\')', flush=True)
    elif _formula_count == 0:
        print('\\n[FRAMEWORK WARNING] Dashboard rows 6-8 have ZERO Excel formulas!', flush=True)
        print('  KPI values must be formula strings like formula=\\'=SUM(Data!C:C)\\'.', flush=True)
        print('  NEVER pass hardcoded numbers.', flush=True)
    else:
        print(f'  Framework: Dashboard OK ({_formula_count} Excel formulas on KPI rows) ✓', flush=True)

atexit.register(_framework_validate)

# ── Save framework function fingerprints ─────────────────────────────────
# _framework_validate() reads these at exit to detect accidental name shadowing.
# Do NOT reassign any of these names in your script.
import sys as _od_sys
_od_sys._od_fns_ = {
    'build_dashboard_shell': build_dashboard_shell,
    'kpi_card': kpi_card,
    'add_bar_chart': add_bar_chart,
    'add_line_chart': add_line_chart,
    'add_pie_chart': add_pie_chart,
    'build_data_sheet': build_data_sheet,
}
del _od_sys

print(f'=== OpenDesktop Dashboard Framework ===')
print(f'Source : {os.path.basename(SOURCE)}')
print(f'Output : {os.path.basename(OUTPUT)}')
print()
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  AGENT SCRIPT STARTS HERE                                                  ║
# ║                                                                             ║
# ║  EXACT SIGNATURES — copy these exactly, do not guess:                      ║
# ║    wb = openpyxl.Workbook()                                                ║
# ║    build_data_sheet(wb, df)          → Data sheet, styled headers          ║
# ║    ws = wb.create_sheet('By Category')  → analysis sheet                  ║
# ║    dash = build_dashboard_shell(wb, "Title", "Subtitle")  → Dashboard[0]  ║
# ║    kpi_card(row=6, col=1, label='Revenue', formula='=SUM(Data!C:C)')       ║
# ║    kpi_card(row=6, col=3, label='Count',   formula='=COUNTA(Data!A:A)-1')  ║
# ║    add_bar_chart(dash, ws, "Title", n_rows, data_col=2, anchor='A11')      ║
# ║    add_line_chart(dash, ws, "Title", n_rows, data_col=2, anchor='G11')     ║
# ║    add_pie_chart(dash, ws, "Title", n_slices, anchor='A26')                ║
# ║    style_analysis_header(ws, ['Cat','Revenue','Count'])                    ║
# ║    safe_cell(ws, row, col)  → writable cell even if merged                 ║
# ║                                                                             ║
# ║  ⛔ FORBIDDEN VARIABLE NAMES (these are functions, NEVER use as strings):  ║
# ║    build_dashboard_shell  kpi_card  add_bar_chart  add_line_chart          ║
# ║    add_pie_chart  build_data_sheet  write_section_header  DASH             ║
# ║  WRONG:   build_dashboard_shell = "Momentum Dashboard"  ← 'str not callable'║
# ║  CORRECT: title = "Momentum Dashboard"                                     ║
# ║           dash  = build_dashboard_shell(wb, title, "subtitle here")        ║
# ║                                                                             ║
# ║  ⛔ HARDCODED VALUES FORBIDDEN:                                            ║
# ║  WRONG:   kpi_card(..., formula=5002)   ← hardcoded number                 ║
# ║  CORRECT: kpi_card(..., formula='=COUNTA(Data!A:A)-1')                     ║
# ║                                                                             ║
# ║  ⛔ MERGEDCELL: never write to a cell that was already merged.              ║
# ║    Use safe_cell(ws, row, col) to safely write near merged regions.         ║
# ║                                                                             ║
# ║  MANDATORY ORDER:                                                           ║
# ║  1. df = pd.read_csv(SOURCE) or pd.read_excel(SOURCE)                      ║
# ║  2. build_data_sheet(wb, df)                                                ║
# ║  3. ws = wb.create_sheet('By Xxx'); populate analysis sheets               ║
# ║  4. dash = build_dashboard_shell(wb, title, subtitle)  ← AFTER sheets      ║
# ║  5. kpi_card(row=6, ...)  kpi_card(row=6, col=3, ...)  etc.                ║
# ║  6. add_bar_chart / add_line_chart / add_pie_chart                          ║
# ║  7. wb.save(OUTPUT); write_result({'ok': True, 'sheets': wb.sheetnames})   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
`;

      const fullScript = boilerplate + '\n' + userScript;
      await fsp.writeFile(scriptPath, fullScript, 'utf-8');

      let stdout = '', stderr = '';
      try {
        // Run directly — captures all Python output so the agent sees errors immediately.
        // The boilerplate's _exception_hook writes structured errors to resultPath.
        await new Promise((resolve) => {
          exec(
            `"${getPythonPath()}" "${scriptPath}"`,
            { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
            (err, out, serr) => {
              stdout = out || '';
              stderr = serr || '';
              resolve(); // always resolve — result file tells us what happened
            }
          );
        });

        // Read structured result written by write_result() / _exception_hook
        let res;
        try {
          const raw = await fsp.readFile(resultPath, 'utf-8');
          res = JSON.parse(raw);
        } catch (_readErr) {
          // No result file — likely a syntax error before any code ran
          const errDetail = stderr.trim() || stdout.trim() || 'No output from script.';
          throw new Error(`Dashboard script failed before writing a result.\n\nPython output:\n${errDetail.slice(0, 3000)}`);
        }

        if (!res.ok) {
          const trace = res.traceback ? `\n\nTraceback:\n${res.traceback}` : '';
          const out   = stdout.trim() ? `\n\nScript output:\n${stdout.trim().slice(0, 1500)}` : '';
          throw new Error(`Dashboard build failed: ${res.error}${trace}${out}`);
        }

        exec(`open "${resolvedOut}"`, () => {});

        const sheets = Array.isArray(res.sheets) ? res.sheets.join(' → ') : 'Dashboard';
        const scriptOut = stdout.trim() ? `\n\nScript output:\n${stdout.trim().slice(0, 800)}` : '';
        return (
          `Dashboard built successfully!\n` +
          `  File: ${path.basename(resolvedOut)}\n` +
          `  Sheets: ${sheets}\n` +
          (res.summary ? `  Summary: ${res.summary}\n` : '') +
          `The file has been opened in Excel/Numbers.` +
          scriptOut
        );
      } finally {
        await Promise.all([scriptPath, resultPath]
          .map(p => fsp.unlink(p).catch(() => {})));
      }
    },
  },

  {
    name: 'excel_vba_run',
    category: 'office',
    description: 'Run a named VBA macro in an existing Excel workbook (.xlsm) without re-injecting any code. Use this to refresh a dashboard after data updates, or to re-run any existing macro by name.',
    params: ['path', 'macroName'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, macroName }) {
      if (!filePath)  throw new Error('path is required');
      if (!macroName) throw new Error('macroName is required');

      const resolved = resolvePath(filePath);
      const ts = Date.now();
      const scriptPath = path.join(os.tmpdir(), `od_vba_run_${ts}.py`);
      const resultPath = path.join(os.tmpdir(), `od_vba_run_result_${ts}.json`);
      const launchPath = path.join(os.tmpdir(), `od_vba_run_${ts}.command`);

      // Same open-then-connect pattern to avoid OSERROR -50
      const pythonScript = `#!/usr/bin/env python3
import sys, json, os, subprocess, time, traceback
file_path   = ${JSON.stringify(resolved)}
macro_name  = ${JSON.stringify(macroName)}
result_path = ${JSON.stringify(resultPath)}

def write_result(data):
    with open(result_path, 'w') as f:
        json.dump(data, f)

def run_applescript(script):
    as_tmp = result_path.replace('.json', f'_{int(time.time()*1000)}.applescript')
    try:
        with open(as_tmp, 'w') as _af:
            _af.write(script)
        r = subprocess.run(['osascript', as_tmp], capture_output=True, text=True, timeout=60)
        return r.stdout.strip(), r.stderr.strip(), r.returncode
    finally:
        try: os.unlink(as_tmp)
        except: pass

print(f"Running macro: {macro_name}")
print(f"File: {os.path.basename(file_path)}")

try:
    import xlwings as xw
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'xlwings',
                           '--quiet', '--break-system-packages'], timeout=120)
    import xlwings as xw

fname = os.path.basename(file_path)
subprocess.Popen(['open', '-a', 'Microsoft Excel', file_path])

wb = None
app = None
for _ in range(20):
    time.sleep(1)
    try:
        app = xw.apps.active
        if app is None: continue
        app.display_alerts = False
        for book in app.books:
            bname = os.path.basename(book.fullname) if book.fullname else book.name
            if bname.lower() == fname.lower():
                wb = book; break
        if wb: break
    except Exception: pass

if wb is None and app:
    wb = app.books.active

if wb is None:
    write_result({'ok': False, 'error': f"Could not open '{fname}' in Excel."})
    sys.exit(1)

print(f"Workbook: {wb.name}")

# Run macro via AppleScript
run_script = f"""
tell application "Microsoft Excel"
    activate
    run VB macro "{macro_name}"
end tell"""
out, err, rc = run_applescript(run_script)
if rc != 0 and 'error' in err.lower():
    print(f"Macro error: {err}")
    write_result({'ok': False, 'error': f'Macro failed: {err}'})
    sys.exit(1)

wb.save()
print(f"\\n✓ Macro completed.")
write_result({'ok': True, 'ran': macro_name, 'path': file_path})
time.sleep(5)
`;

      const launcher = `#!/bin/bash
echo "=== OpenDesktop: Run Excel Macro ==="
"${getPythonPath()}" "${scriptPath}"
sleep 4
`;
      await fsp.writeFile(scriptPath, pythonScript);
      await fsp.writeFile(launchPath, launcher);
      await fsp.chmod(launchPath, 0o755);
      await new Promise((resolve, reject) => {
        exec(`open "${launchPath}"`, (err) => err ? reject(err) : resolve());
      });

      // Poll up to 90 seconds
      const start = Date.now();
      while (Date.now() - start < 90000) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const raw = await fsp.readFile(resultPath, 'utf-8');
          const res = JSON.parse(raw);
          await Promise.all([scriptPath, resultPath, launchPath].map(p => fsp.unlink(p).catch(() => {})));
          if (!res.ok) throw new Error(res.error || 'Macro failed');
          return `Macro "${res.ran}" ran successfully in ${path.basename(res.path)}.`;
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
      }
      return `Macro still running in Terminal. Check the Terminal window for output.`;
    },
  },

  {
    name: 'excel_vba_list',
    category: 'office',
    description: 'List all VBA modules and their public Sub/Function names in an Excel workbook (.xlsm). Use this to discover existing macros before calling excel_vba_run.',
    params: ['path'],
    permissionLevel: 'safe',
    async execute({ path: filePath }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const ts = Date.now();
      const scriptPath = path.join(os.tmpdir(), `od_vba_list_${ts}.py`);
      const resultPath = path.join(os.tmpdir(), `od_vba_list_result_${ts}.json`);
      const launchPath = path.join(os.tmpdir(), `od_vba_list_${ts}.command`);

      // Same open-then-connect pattern; uses AppleScript for VBProject (xlwings can't on macOS)
      const pythonScript = `#!/usr/bin/env python3
import sys, json, os, subprocess, time
file_path   = ${JSON.stringify(resolved)}
result_path = ${JSON.stringify(resultPath)}

def write_result(data):
    with open(result_path, 'w') as f:
        json.dump(data, f)

def run_applescript(script):
    as_tmp = result_path.replace('.json', f'_{int(time.time()*1000)}.applescript')
    try:
        with open(as_tmp, 'w') as _af:
            _af.write(script)
        r = subprocess.run(['osascript', as_tmp], capture_output=True, text=True, timeout=60)
        return r.stdout.strip(), r.stderr.strip(), r.returncode
    finally:
        try: os.unlink(as_tmp)
        except: pass

try:
    import xlwings as xw
except ImportError:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'xlwings',
                           '--quiet', '--break-system-packages'], timeout=120)
    import xlwings as xw

fname = os.path.basename(file_path)
subprocess.Popen(['open', '-a', 'Microsoft Excel', file_path])

wb = None
app = None
for _ in range(20):
    time.sleep(1)
    try:
        app = xw.apps.active
        if app is None: continue
        app.display_alerts = False
        for book in app.books:
            bname = os.path.basename(book.fullname) if book.fullname else book.name
            if bname.lower() == fname.lower():
                wb = book; break
        if wb: break
    except Exception: pass

if wb is None and app:
    wb = app.books.active

if wb is None:
    write_result({'ok': False, 'error': f"Could not open '{fname}' in Excel."})
    sys.exit(1)

wb_name = wb.name
print(f"Inspecting VBA in: {wb_name}")

# Use AppleScript to list VBA modules (xlwings/appscript cannot access VBProject on macOS)
modules = []
list_script = f"""
tell application "Microsoft Excel"
    activate
    set vbp to VBProject of workbook "{wb_name}"
    set outText to ""
    repeat with comp in (get VBComponents of vbp)
        set compName to name of comp
        set compCode to ""
        try
            set compCode to code text of code module of comp
        end try
        set outText to outText & "===MOD===" & compName & (ASCII character 10) & compCode & "===END===" & (ASCII character 10)
    end repeat
    return outText
end tell"""
out_list, err_list, rc_list = run_applescript(list_script)
if rc_list != 0:
    err_str = (err_list or out_list or 'unknown error').strip()
    if any(x in err_str.lower() for x in ['trust', 'permission', 'denied', 'access', 'security', 'visual basic']):
        modules = [{'error': 'VBA access denied',
                    'detail': 'Enable "Trust access to Visual Basic project" in Excel -> Tools -> Macros -> Security -> OK -> restart Excel'}]
    else:
        modules = [{'error': 'VBA listing failed', 'detail': err_str}]
else:
    try:
        for part in out_list.split('===MOD===')[1:]:
            if '===END===' not in part:
                continue
            header_line, rest = part.split('\\n', 1)
            code_text = rest.split('===END===')[0]
            subs = []
            for line in code_text.split('\\n'):
                s = line.strip()
                sl = s.lower()
                if any(sl.startswith(kw) for kw in ['sub ', 'function ', 'public sub ',
                       'public function ', 'private sub ', 'private function ']):
                    sub_name = s.split('(')[0].split()[-1]
                    if sub_name:
                        subs.append(sub_name)
            modules.append({'name': header_line.strip(), 'type': 'Module', 'subs': subs})
    except Exception as pe:
        modules = [{'error': 'Parse error', 'detail': str(pe)}]

write_result({'ok': True, 'path': file_path, 'modules': modules})
time.sleep(3)
`;

      const launcher = `#!/bin/bash
"${getPythonPath()}" "${scriptPath}"
sleep 3
`;
      await fsp.writeFile(scriptPath, pythonScript);
      await fsp.writeFile(launchPath, launcher);
      await fsp.chmod(launchPath, 0o755);
      await new Promise((resolve, reject) => {
        exec(`open "${launchPath}"`, (err) => err ? reject(err) : resolve());
      });

      const start = Date.now();
      while (Date.now() - start < 60000) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const raw = await fsp.readFile(resultPath, 'utf-8');
          const res = JSON.parse(raw);
          await Promise.all([scriptPath, resultPath, launchPath].map(p => fsp.unlink(p).catch(() => {})));
          if (!res.ok) throw new Error(res.error || 'List failed');
          const modules = res.modules || [];
          if (modules.length === 0) return `No VBA modules found in ${path.basename(resolved)}.`;
          const lines = modules.map(m => {
            if (m.error) return `  [Error] ${m.error}`;
            const subsStr = m.subs.length > 0 ? `\n    Subs: ${m.subs.join(', ')}` : '';
            return `  ${m.name} (${m.type})${subsStr}`;
          });
          return `VBA modules in ${path.basename(resolved)}:\n${lines.join('\n')}`;
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
      }
      return `VBA list still running. Check the Terminal window.`;
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

      // Coerce a raw CSV string to the most specific JS type possible
      const coerce = (val) => {
        if (val === '' || val === null || val === undefined) return null;
        // Boolean
        if (val === 'true' || val === 'True')  return true;
        if (val === 'false' || val === 'False') return false;
        // Number (integer or float) — reject values like "01" that look like IDs
        const n = Number(val);
        if (!isNaN(n) && val.trim() !== '' && !/^0\d/.test(val.trim())) return n;
        return val;
      };

      if (outputFormat === 'json') {
        if (headers) {
          return JSON.stringify(sliced.map((row) =>
            Object.fromEntries(headers.map((h, i) => [h, coerce(row[i] ?? '')]))
          ), null, 2);
        }
        return JSON.stringify(sliced.map((row) => row.map(coerce)));
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

  // ── Dashboard Validator ───────────────────────────────────────────────────
  {
    name: 'office_validate_dashboard',
    category: 'office',
    description: 'Validate a built Excel dashboard against Gold Standard criteria. Runs 25 checks across structure, KPI formulas, chart references, analysis sheet formulas, and data integrity. Returns a score report with pass/fail details. Use immediately after office_python_dashboard.',
    params: ['path', 'sourcePath'],
    permissionLevel: 'safe',
    async execute({ path: filePath, sourcePath }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);

      const script = `
import sys, json, re, openpyxl
from openpyxl.utils import get_column_letter

path = sys.argv[1]
source_path = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != 'null' else None

checks = {}   # name -> {passed, detail}
ERROR_STRINGS = {'#REF!', '#VALUE!', '#NAME?', '#DIV/0!', '#N/A', '#NULL!', '#NUM!'}

def chk(name, passed, detail=''):
    checks[name] = {'passed': bool(passed), 'detail': detail}

try:
    wb = openpyxl.load_workbook(path, data_only=True)
except Exception as e:
    print(json.dumps({'error': f'Cannot open workbook: {e}'}))
    sys.exit(0)

sheet_names = wb.sheetnames

# ── Category A — Sheet Structure (5) ──────────────────────────────────────
chk('dashboard_exists', 'Dashboard' in sheet_names,
    '' if 'Dashboard' in sheet_names else 'No sheet named "Dashboard" found')

chk('dashboard_first',
    sheet_names[0] == 'Dashboard' if 'Dashboard' in sheet_names else False,
    '' if (sheet_names and sheet_names[0] == 'Dashboard') else
    f'Dashboard is at index {sheet_names.index("Dashboard") if "Dashboard" in sheet_names else "N/A"}, expected index 0')

chk('data_sheet_exists', 'Data' in sheet_names,
    '' if 'Data' in sheet_names else 'No sheet named "Data" found')

analysis_sheets = [n for n in sheet_names if n not in ('Dashboard', 'Data')]
chk('analysis_sheets_exist', len(analysis_sheets) >= 1,
    '' if analysis_sheets else 'No analysis sheets found (sheets other than Dashboard and Data)')

if 'Dashboard' in sheet_names and analysis_sheets:
    dash_idx = sheet_names.index('Dashboard')
    all_before = all(sheet_names.index(s) < dash_idx for s in analysis_sheets)
    chk('sheet_order_correct', all_before,
        '' if all_before else f'Dashboard (index {dash_idx}) should come after all analysis sheets')
else:
    chk('sheet_order_correct', False, 'Cannot check order — missing Dashboard or analysis sheets')

# ── Category B — Dashboard Layout (7) ──────────────────────────────────────
if 'Dashboard' in sheet_names:
    dash = wb['Dashboard']

    # title_banner_merged: A1:L3 merge exists
    merged_ranges = [str(m) for m in dash.merged_cells.ranges]
    banner_merged = any('A1' in r for r in merged_ranges)
    chk('title_banner_merged', banner_merged,
        '' if banner_merged else f'No merged cell range starting at A1 found. Merged ranges: {merged_ranges[:5]}')

    # title_banner_fill: A1 fill is dark-ish (NAVY ~1A1A2E)
    a1 = dash['A1']
    fill_ok = False
    fill_detail = 'A1 has no fill or white fill'
    try:
        fg = a1.fill.fgColor if a1.fill else None
        if fg:
            hex_val = fg.rgb if fg.type == 'rgb' else (fg.theme if fg.type == 'theme' else None)
            if hex_val and isinstance(hex_val, str) and len(hex_val) >= 6:
                # Strip alpha prefix (AARRGGBB → RRGGBB)
                h = hex_val[-6:]
                r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
                is_dark = r < 120 and g < 120 and b < 120
                fill_ok = is_dark
                fill_detail = '' if fill_ok else f'A1 fill #{h} is not dark enough (r={r},g={g},b={b})'
    except Exception as e:
        fill_detail = f'Could not read fill: {e}'
    chk('title_banner_fill', fill_ok, fill_detail)

    # title_font_large: A1 font size >= 14
    font_ok = False
    font_detail = 'A1 has no font size set'
    try:
        if a1.font and a1.font.size and a1.font.size >= 14:
            font_ok = True
            font_detail = ''
        else:
            sz = a1.font.size if a1.font else None
            font_detail = f'A1 font size is {sz} (need >= 14)'
    except Exception as e:
        font_detail = f'Could not read font: {e}'
    chk('title_font_large', font_ok, font_detail)

    # grid_lines_hidden
    sv = getattr(dash.sheet_view, 'showGridLines', True) if dash.sheet_view else True
    # openpyxl stores multiple views; check the first one
    try:
        sv = dash.sheet_views[0].showGridLines
    except Exception:
        sv = True
    chk('grid_lines_hidden', not sv,
        '' if not sv else 'Dashboard sheet has grid lines visible (showGridLines should be False)')

    # kpi_cards_present: >= 3 formula cells on rows 6–8
    kpi_formula_cells = []
    for row in dash.iter_rows(min_row=6, max_row=8):
        for cell in row:
            if cell.value and str(cell.value).startswith('='):
                kpi_formula_cells.append(cell.coordinate)
    chk('kpi_cards_present', len(kpi_formula_cells) >= 3,
        '' if len(kpi_formula_cells) >= 3 else
        f'Only {len(kpi_formula_cells)} formula cell(s) on rows 6–8 (need >= 3). Cells: {kpi_formula_cells[:10]}')

    # kpi_all_formulas: every non-empty value cell on rows 6–8 is a formula
    kpi_hardcoded = []
    for row in dash.iter_rows(min_row=6, max_row=8):
        for cell in row:
            val = cell.value
            if val is None or val == '':
                continue
            # Skip labels (strings that don't look numeric or like formulas)
            if isinstance(val, str) and not val.startswith('='):
                continue
            if isinstance(val, (int, float)):
                kpi_hardcoded.append(f'{cell.coordinate} has hardcoded value {val} (use formula like =COUNTA(Data!A:A)-1)')
    chk('kpi_all_formulas', len(kpi_hardcoded) == 0,
        '' if not kpi_hardcoded else f'Row 7 cell {kpi_hardcoded[0]}' if kpi_hardcoded else '')

    # charts_present: >= 2 charts
    chart_count = len(dash._charts) if hasattr(dash, '_charts') else 0
    chk('charts_present', chart_count >= 2,
        '' if chart_count >= 2 else f'Only {chart_count} chart(s) on Dashboard (need >= 2)')
else:
    for name in ['title_banner_merged','title_banner_fill','title_font_large',
                 'grid_lines_hidden','kpi_cards_present','kpi_all_formulas','charts_present']:
        chk(name, False, 'Dashboard sheet missing')

# ── Category C — Formula Integrity (6) ────────────────────────────────────
if 'Dashboard' in sheet_names:
    dash = wb['Dashboard']

    # kpi_reference_data: KPI formulas contain 'Data!'
    kpi_refs_data = []
    kpi_no_data_ref = []
    for row in dash.iter_rows(min_row=6, max_row=8):
        for cell in row:
            if cell.value and str(cell.value).startswith('='):
                if 'Data!' in str(cell.value):
                    kpi_refs_data.append(cell.coordinate)
                else:
                    kpi_no_data_ref.append(f'{cell.coordinate}: {str(cell.value)[:60]}')
    chk('kpi_reference_data', len(kpi_no_data_ref) == 0 or len(kpi_refs_data) > 0,
        '' if (len(kpi_no_data_ref) == 0 or len(kpi_refs_data) > 0) else
        f'KPI formulas do not reference Data sheet: {kpi_no_data_ref[:3]}')

    # no_hardcoded_kpis: rows 6–8 contain no raw numeric values
    hc_kpis = []
    for row in dash.iter_rows(min_row=6, max_row=8):
        for cell in row:
            if isinstance(cell.value, (int, float)):
                hc_kpis.append(f'{cell.coordinate}={cell.value}')
    chk('no_hardcoded_kpis', len(hc_kpis) == 0,
        '' if not hc_kpis else f'{len(hc_kpis)} KPI cells contain raw numbers: {hc_kpis[:5]}')

    # analysis_has_formulas: each analysis sheet >= 30% formula rows
    analysis_formula_fail = []
    for sname in analysis_sheets:
        ws = wb[sname]
        data_rows = list(ws.iter_rows(min_row=2))
        if not data_rows:
            analysis_formula_fail.append(f'"{sname}": empty')
            continue
        formula_rows = sum(
            1 for row in data_rows
            if any(cell.value and str(cell.value).startswith('=') for cell in row)
        )
        pct = formula_rows / len(data_rows) if data_rows else 0
        if pct < 0.30:
            analysis_formula_fail.append(
                f'"{sname}": {formula_rows}/{len(data_rows)} rows have formulas (all hardcoded Python values)'
            )
    chk('analysis_has_formulas', len(analysis_formula_fail) == 0,
        '' if not analysis_formula_fail else '; '.join(analysis_formula_fail[:3]))

    # chart_refs_valid: every chart's series references an existing sheet
    bad_chart_refs = []
    for chart_anchor in (dash._charts if hasattr(dash, '_charts') else []):
        chart = chart_anchor.chart if hasattr(chart_anchor, 'chart') else chart_anchor
        try:
            for series in chart.series:
                for ref_obj in [getattr(series, 'val', None), getattr(series, 'cat', None)]:
                    if ref_obj is None: continue
                    ref_str = str(getattr(ref_obj, 'numRef', None) or getattr(ref_obj, 'strRef', None) or '')
                    # Extract sheet name from formula like 'SheetName'!A1:A10 or SheetName!A1:A10
                    m = re.search(r"'?([^'!]+)'?!", ref_str)
                    if m:
                        ref_sheet = m.group(1)
                        if ref_sheet not in sheet_names:
                            bad_chart_refs.append(f'Chart references missing sheet "{ref_sheet}"')
        except Exception:
            pass
    chk('chart_refs_valid', len(bad_chart_refs) == 0,
        '' if not bad_chart_refs else '; '.join(bad_chart_refs[:3]))

    # no_ref_errors_dashboard: no #REF! in Dashboard cell values
    dash_errors = []
    for row in dash.iter_rows():
        for cell in row:
            if str(cell.value) in ERROR_STRINGS:
                dash_errors.append(f'{cell.coordinate}: {cell.value}')
    chk('no_ref_errors_dashboard', len(dash_errors) == 0,
        '' if not dash_errors else f'{len(dash_errors)} error(s): {dash_errors[:5]}')
else:
    for name in ['kpi_reference_data','no_hardcoded_kpis','analysis_has_formulas',
                 'chart_refs_valid','no_ref_errors_dashboard']:
        chk(name, False, 'Dashboard sheet missing')

# no_ref_errors_analysis
analysis_errors = []
for sname in analysis_sheets:
    ws = wb[sname]
    for row in ws.iter_rows():
        for cell in row:
            if str(cell.value) in ERROR_STRINGS:
                analysis_errors.append(f'"{sname}" {cell.coordinate}: {cell.value}')
chk('no_ref_errors_analysis', len(analysis_errors) == 0,
    '' if not analysis_errors else f'{len(analysis_errors)} error(s): {analysis_errors[:5]}')

# ── Category D — Data Sheet (4) ───────────────────────────────────────────
if 'Data' in sheet_names:
    data_ws = wb['Data']
    # data_has_headers
    row1 = list(data_ws.iter_rows(min_row=1, max_row=1, values_only=True))[0]
    has_headers = any(v is not None and str(v).strip() for v in row1)
    chk('data_has_headers', has_headers, '' if has_headers else 'Row 1 of Data sheet is empty')

    # data_has_rows
    row_count = data_ws.max_row or 0
    chk('data_has_rows', row_count >= 10,
        '' if row_count >= 10 else f'Data sheet has only {row_count} rows (need >= 10)')

    # data_header_styled: >= 1 row-1 cell has non-white/non-None fill
    styled_headers = False
    try:
        for cell in data_ws[1]:
            if cell.fill and cell.fill.fgColor and cell.fill.fgColor.type == 'rgb':
                h = cell.fill.fgColor.rgb[-6:]
                if h.upper() not in ('FFFFFF', '000000', 'FFFFFFFF', '00000000'):
                    styled_headers = True
                    break
    except Exception:
        pass
    chk('data_header_styled', styled_headers,
        '' if styled_headers else 'Data sheet row 1 has no colored fill on any cell')

    # data_no_errors
    data_errs = []
    for row in data_ws.iter_rows(min_row=2, max_row=min(data_ws.max_row or 2, 1002)):
        for cell in row:
            if str(cell.value) in ERROR_STRINGS:
                data_errs.append(f'{cell.coordinate}: {cell.value}')
    chk('data_no_errors', len(data_errs) == 0,
        '' if not data_errs else f'{len(data_errs)} error(s): {data_errs[:5]}')
else:
    for name in ['data_has_headers','data_has_rows','data_header_styled','data_no_errors']:
        chk(name, False, 'Data sheet missing')

# ── Category E — Analysis Sheets (3) ──────────────────────────────────────
analysis_header_fail = []
analysis_minrows_fail = []
analysis_err_fail = []

for sname in analysis_sheets:
    ws = wb[sname]
    # analysis_headers_styled
    try:
        row1_cells = list(ws.iter_rows(min_row=1, max_row=1))[0]
        has_fill = any(
            c.fill and c.fill.fgColor and c.fill.fgColor.type == 'rgb' and
            c.fill.fgColor.rgb[-6:].upper() not in ('FFFFFF', '000000')
            for c in row1_cells
        )
        if not has_fill:
            analysis_header_fail.append(f'"{sname}"')
    except Exception:
        analysis_header_fail.append(f'"{sname}" (error reading)')

    # analysis_min_rows
    nrows = (ws.max_row or 1) - 1  # excluding header
    if nrows < 3:
        analysis_minrows_fail.append(f'"{sname}": {nrows} data row(s)')

    # analysis_no_errors
    for row in ws.iter_rows(min_row=2, max_row=min(ws.max_row or 2, 502)):
        for cell in row:
            if str(cell.value) in ERROR_STRINGS:
                analysis_err_fail.append(f'"{sname}" {cell.coordinate}: {cell.value}')

chk('analysis_headers_styled', len(analysis_header_fail) == 0,
    '' if not analysis_header_fail else f'No colored header fill: {", ".join(analysis_header_fail[:5])}')
chk('analysis_min_rows', len(analysis_minrows_fail) == 0,
    '' if not analysis_minrows_fail else '; '.join(analysis_minrows_fail[:5]))
chk('analysis_no_errors', len(analysis_err_fail) == 0,
    '' if not analysis_err_fail else f'{len(analysis_err_fail)} error(s): {analysis_err_fail[:5]}')

# ── Build report ──────────────────────────────────────────────────────────
print(json.dumps(checks))
`;

      let checksResult;
      try {
        checksResult = await runPythonScript(script, [resolved, sourcePath || 'null'], 60000);
      } catch (err) {
        return `Validation error: ${err.message}`;
      }

      if (checksResult.error) {
        return `Validation error: ${checksResult.error}`;
      }

      // Category map for display prefix
      const CATEGORY = {
        dashboard_exists: 'A', dashboard_first: 'A', data_sheet_exists: 'A',
        analysis_sheets_exist: 'A', sheet_order_correct: 'A',
        title_banner_merged: 'B', title_banner_fill: 'B', title_font_large: 'B',
        grid_lines_hidden: 'B', kpi_cards_present: 'B', kpi_all_formulas: 'B', charts_present: 'B',
        kpi_reference_data: 'C', no_hardcoded_kpis: 'C', analysis_has_formulas: 'C',
        chart_refs_valid: 'C', no_ref_errors_dashboard: 'C', no_ref_errors_analysis: 'C',
        data_has_headers: 'D', data_has_rows: 'D', data_header_styled: 'D', data_no_errors: 'D',
        analysis_headers_styled: 'E', analysis_min_rows: 'E', analysis_no_errors: 'E',
      };

      const allChecks = Object.keys(CATEGORY);
      const passed = allChecks.filter(n => checksResult[n]?.passed);
      const failed = allChecks.filter(n => checksResult[n] && !checksResult[n].passed);

      const score = passed.length;
      const total = allChecks.length;
      const pct = Math.round((score / total) * 100);

      let verdict;
      if (score === total) {
        verdict = 'GOLD STANDARD ✅';
      } else if (pct >= 95) {
        verdict = 'EXCELLENT — minor issues only';
      } else if (pct >= 80) {
        verdict = 'NEEDS IMPROVEMENT';
      } else {
        verdict = 'REBUILD REQUIRED';
      }

      const fileName = path.basename(resolved);
      const lines = [
        `=== Dashboard Validation Report ===`,
        `File: ${fileName}`,
        `Score: ${score}/${total} (${pct}%) — ${verdict}`,
        ``,
        `✅ PASSED (${passed.length}): ${passed.join(', ')}`,
        ``,
      ];

      if (failed.length > 0) {
        lines.push(`❌ FAILED (${failed.length}):`);
        for (const name of failed) {
          const detail = checksResult[name]?.detail || '';
          const cat = CATEGORY[name] || '?';
          lines.push(`  [${cat}] ${name}${detail ? ` — ${detail}` : ''}`);
        }
        lines.push(``);
        lines.push(`Verdict: ${verdict} — fix the ${failed.length} failed check${failed.length > 1 ? 's' : ''} listed above.`);
      } else {
        lines.push(`Verdict: ${verdict}`);
      }

      return lines.join('\n');
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

/**
 * parseInlineRuns(text) — handles **bold**, *italic*, ***bold+italic***, __underline__, `code`
 * Returns array of run objects.
 */
function parseInlineRuns(text) {
  const runs = [];
  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|`([^`]+?)`)/g;
  let lastIndex = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) runs.push({ text: text.slice(lastIndex, m.index) });
    if (m[2] !== undefined)      runs.push({ text: m[2], bold: true, italic: true });
    else if (m[3] !== undefined) runs.push({ text: m[3], bold: true });
    else if (m[4] !== undefined) runs.push({ text: m[4], italic: true });
    else if (m[5] !== undefined) runs.push({ text: m[5], underline: true });
    else if (m[6] !== undefined) runs.push({ text: m[6], code: true });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex) });
  return runs.length ? runs : [{ text }];
}

function renderRun(run) {
  const props = [];
  if (run.bold)      props.push('<w:b/>');
  if (run.italic)    props.push('<w:i/>');
  if (run.underline) props.push('<w:u w:val="single"/>');
  if (run.code)      props.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/>');
  const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXML(run.text)}</w:t></w:r>`;
}

function makePara(text, style) {
  const runs = parseInlineRuns(text).map(renderRun).join('');
  return `<w:p>
    <w:pPr><w:pStyle w:val="${style}"/></w:pPr>
    ${runs}
  </w:p>`;
}

function makeListItem(text, numbered = false) {
  const numPr = numbered
    ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    : '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>';
  const runs = parseInlineRuns(text).map(renderRun).join('');
  return `<w:p>
    <w:pPr>${numPr}</w:pPr>
    ${runs}
  </w:p>`;
}

/**
 * makeTable(rows) — rows is array of arrays of strings.
 * First row is the header (dark blue bg, white bold text).
 */
function makeTable(rows) {
  if (!rows || rows.length === 0) return '';
  const colCount = Math.max(...rows.map((r) => r.length));
  const colWidth  = Math.floor(9360 / colCount);
  const tblGrid   = Array.from({ length: colCount }, () => `<w:gridCol w:w="${colWidth}"/>`).join('');

  const xmlRows = rows.map((row, ri) => {
    const isHeader = ri === 0;
    const cells = Array.from({ length: colCount }, (_, ci) => {
      const cellText = row[ci] !== undefined ? String(row[ci]) : '';
      const runXml = isHeader
        ? `<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t xml:space="preserve">${escapeXML(cellText)}</w:t></w:r>`
        : parseInlineRuns(cellText).map(renderRun).join('');
      const shading = isHeader
        ? '<w:shd w:val="clear" w:color="auto" w:fill="2F5496"/>'
        : (ri % 2 !== 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2F8"/>' : '');
      return `<w:tc>
        <w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${shading}</w:tcPr>
        <w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${runXml}</w:p>
      </w:tc>`;
    }).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('\n');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="9360" w:type="dxa"/>
      <w:tblBorders>
        <w:top    w:val="single" w:sz="4" w:space="0" w:color="2F5496"/>
        <w:left   w:val="single" w:sz="4" w:space="0" w:color="2F5496"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="2F5496"/>
        <w:right  w:val="single" w:sz="4" w:space="0" w:color="2F5496"/>
        <w:insideH w:val="single" w:sz="2" w:space="0" w:color="BFBFBF"/>
        <w:insideV w:val="single" w:sz="2" w:space="0" w:color="BFBFBF"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${tblGrid}</w:tblGrid>
    ${xmlRows}
  </w:tbl>`;
}

/** Parse a block of markdown table lines into [[cells], [cells], ...] */
function parseMarkdownTable(lines) {
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[\s\-|:]+\|$/.test(trimmed)) continue; // separator row
    rows.push(trimmed.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  }
  return rows;
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
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:pPr><w:outlineLvl w:val="3"/><w:spacing w:before="120" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:i/><w:sz w:val="24"/><w:color w:val="1F3864"/></w:rPr>
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
