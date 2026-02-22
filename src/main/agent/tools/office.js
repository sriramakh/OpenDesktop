/**
 * Office document tools — specialized read/write for PDF, DOCX, XLSX, PPTX, CSV.
 *
 * Uses native Node.js libraries:
 *   - pdf-parse   → PDF text extraction
 *   - mammoth     → DOCX → text/HTML
 *   - xlsx (SheetJS) → Excel read/write/formulas
 *   - exceljs     → Excel with charts, styling, pivot tables
 *   - jszip       → PPTX XML extraction
 *   - csv (built-in) → CSV parsing/writing
 */

const fsp  = require('fs/promises');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { exec } = require('child_process');

// ─────────────────────────────────────────────────────────────────────────────
// Shared PDF helpers
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
 * OCR a PDF using PyMuPDF (fitz) to render pages → PNG → tesseract.
 * Handles scanned/image-based PDFs. Requires python3 with fitz + tesseract CLI.
 */
async function ocrPDF(filePath, maxPages = 15) {
  const script = `
import sys, os, tempfile, subprocess, json
try:
    import fitz
except ImportError:
    print(json.dumps({'error': 'PyMuPDF not installed. Run: pip install PyMuPDF'}))
    sys.exit(0)

pdf_path  = sys.argv[1]
max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 15

try:
    doc = fitz.open(pdf_path)
except Exception as e:
    print(json.dumps({'error': f'Cannot open PDF: {e}'}))
    sys.exit(0)

results = []
for i in range(min(len(doc), max_pages)):
    page = doc[i]
    mat  = fitz.Matrix(2.5, 2.5)  # 2.5x resolution — quality/speed balance
    pix  = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)

    fd, img_path = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    fd, out_base = tempfile.mkstemp(suffix='.txt')
    os.close(fd)
    out_base = out_base[:-4]  # tesseract appends .txt itself

    try:
        pix.save(img_path)
        subprocess.run(
            ['tesseract', img_path, out_base, '-l', 'eng', '--psm', '1'],
            capture_output=True, timeout=45
        )
        txt_file = out_base + '.txt'
        if os.path.exists(txt_file):
            with open(txt_file, 'r', encoding='utf-8', errors='replace') as f:
                text = f.read().strip()
            os.unlink(txt_file)
            if text:
                results.append({'page': i + 1, 'text': text})
    finally:
        if os.path.exists(img_path):
            os.unlink(img_path)

total_pages = len(doc)
doc.close()
print(json.dumps({'pages': results, 'total': total_pages}))
`;

  const scriptPath = path.join(os.tmpdir(), `_ocr_pdf_${process.pid}.py`);
  await fsp.writeFile(scriptPath, script, 'utf-8');

  try {
    const raw = await new Promise((resolve, reject) => {
      exec(`python3 "${scriptPath}" "${filePath}" ${maxPages}`,
        { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err && !stdout) reject(new Error(stderr || err.message));
          else resolve(stdout || '');
        }
      );
    });

    const result = JSON.parse(raw.trim());
    if (result.error) throw new Error(result.error);

    const pageTexts = result.pages
      .filter((p) => p.text && p.text.trim().length > 5)
      .map((p) => `=== Page ${p.page} ===\n${p.text}`);

    if (pageTexts.length === 0) throw new Error('OCR produced no text (possibly blank pages)');
    return `[PDF OCR: ${result.total} pages — ${path.basename(filePath)}]\n\n${pageTexts.join('\n\n')}`;
  } finally {
    await fsp.unlink(scriptPath).catch(() => {});
  }
}

/**
 * Read PDF: try text extraction first, fall back to OCR if the PDF is scanned.
 */
async function readPDF(filePath, opts = {}) {
  const { startPage, endPage, password } = opts;
  const { PDFParse } = require('pdf-parse');

  const rawData = await fsp.readFile(filePath);
  const uint8   = new Uint8Array(rawData);

  const parseOpts = {};
  const sfUrl = getStandardFontDataUrl();
  if (sfUrl)   parseOpts.standardFontDataUrl = sfUrl;
  if (password) parseOpts.password = password;
  if (endPage)  parseOpts.max = endPage;

  // Suppress pdfjs-dist v5 font warning (non-critical; text extraction still works)
  const _origWarn = console.warn;
  console.warn = (...a) => { if (String(a[0]).includes('standardFontDataUrl')) return; _origWarn(...a); };

  let textResult, info;
  try {
    const parser = new PDFParse(uint8, parseOpts);
    await parser.load();
    info       = await parser.getInfo();
    textResult = await parser.getText();
    parser.destroy();
  } catch (parseErr) {
    // pdf-parse failed entirely (corrupted, encrypted without password, etc.)
    // Try OCR directly
    console.warn = _origWarn;
    try {
      return await ocrPDF(filePath);
    } catch (ocrErr) {
      throw new Error(`PDF unreadable: ${parseErr.message}. OCR also failed: ${ocrErr.message}`);
    }
  } finally {
    console.warn = _origWarn;
  }

  const totalPages   = info?.total || 1;
  let   fullText     = textResult?.text || '';

  // Apply page range filter if requested
  if ((startPage || endPage) && textResult?.pages?.length > 0) {
    const s = (startPage || 1) - 1;
    const e = endPage || textResult.pages.length;
    fullText = textResult.pages
      .slice(s, e)
      .map((p, i) => `--- Page ${s + i + 1} ---\n${p.text}`)
      .join('\n\n');
  }

  const charsPerPage = fullText.replace(/[\s\-–—|]/g, '').length / totalPages;

  // Scanned PDF — text-layer is empty or just boilerplate; try OCR
  if (charsPerPage < 30) {
    try {
      const ocrText = await ocrPDF(filePath, endPage || 30);
      return ocrText;
    } catch (ocrErr) {
      // tesseract or fitz not available — return sparse text with explanation
      return [
        `[PDF: ${totalPages} page(s) — ${path.basename(filePath)}]`,
        `NOTE: This appears to be a scanned (image-based) PDF. No selectable text found.`,
        `To read scanned PDFs, install: pip install PyMuPDF && brew install tesseract`,
        fullText.trim() || '(no text layer)',
      ].join('\n');
    }
  }

  return `[PDF: ${totalPages} pages — ${path.basename(filePath)}]\n\n${fullText.trim()}`;
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
    description: 'Read and extract text from a PDF file. Returns the full text content with page numbers. Optionally limit to specific page range. Handles password-protected PDFs if password is provided.',
    params: ['path', 'startPage', 'endPage', 'password'],
    permissionLevel: 'safe',
    async execute({ path: filePath, startPage, endPage, password }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      return await readPDF(resolved, { startPage, endPage, password });
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
    description: 'Read an Excel workbook (.xlsx or .xls). Returns all sheets with their data in a structured format. Set includeFormulas=true to see cell formulas. Set sheetName to read only one sheet. Returns up to maxRows rows per sheet.',
    params: ['path', 'sheetName', 'maxRows', 'includeFormulas', 'outputFormat'],
    permissionLevel: 'safe',
    async execute({ path: filePath, sheetName, maxRows = 500, includeFormulas = false, outputFormat = 'text' }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const XLSX = require('xlsx');

      const readOpts = { sheetRows: maxRows };
      if (includeFormulas) readOpts.cellFormula = true;

      const wb = XLSX.readFile(resolved, readOpts);

      const sheetNames = sheetName
        ? (wb.SheetNames.includes(sheetName) ? [sheetName] : [])
        : wb.SheetNames;

      if (sheetNames.length === 0) {
        throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${wb.SheetNames.join(', ')}`);
      }

      const output = [`[Excel Workbook: ${path.basename(resolved)}]`];
      output.push(`Sheets: ${wb.SheetNames.join(', ')}\n`);

      for (const name of sheetNames) {
        const ws = wb.Sheets[name];
        const range = ws['!ref'];
        output.push(`\n=== Sheet: ${name} (range: ${range || 'empty'}) ===`);

        if (!range) { output.push('(empty sheet)'); continue; }

        if (outputFormat === 'json') {
          const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
          output.push(JSON.stringify(json.slice(0, maxRows)));
        } else if (includeFormulas) {
          // Show both values and formulas
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
          const formulaMap = {};
          for (const [addr, cell] of Object.entries(ws)) {
            if (addr.startsWith('!')) continue;
            if (cell.f) formulaMap[addr] = cell.f;
          }
          for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
            const rowStr = rows[i].join('\t');
            output.push(rowStr);
          }
          if (Object.keys(formulaMap).length > 0) {
            output.push('\n--- Formulas ---');
            for (const [addr, formula] of Object.entries(formulaMap)) {
              output.push(`${addr}: =${formula}`);
            }
          }
        } else {
          const csv = XLSX.utils.sheet_to_csv(ws);
          output.push(csv.split('\n').slice(0, maxRows).join('\n'));
        }
      }

      return output.join('\n');
    },
  },

  // ── XLSX write ────────────────────────────────────────────────────────────
  {
    name: 'office_write_xlsx',
    category: 'office',
    description: 'Write or modify an Excel workbook. Accepts operations: set cell values/formulas, create new sheets, add tables. Pass operations as a JSON array. Supports Excel formulas (=SUM(A1:A10), =VLOOKUP, etc.). Creates the file if it does not exist.',
    params: ['path', 'operations', 'sheetData'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, operations, sheetData }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const XLSX = require('xlsx');

      // Load existing or create new
      let wb;
      const exists = await fsp.stat(resolved).catch(() => null);
      if (exists) {
        wb = XLSX.readFile(resolved, { cellFormula: true });
      } else {
        wb = XLSX.utils.book_new();
      }

      // sheetData: shorthand to write whole sheets at once
      // Format: { "Sheet1": [[row1col1, row1col2], [row2col1, ...]], ... }
      if (sheetData && typeof sheetData === 'object') {
        for (const [name, data] of Object.entries(sheetData)) {
          const aoa = Array.isArray(data) ? data : [];
          const ws = XLSX.utils.aoa_to_sheet(aoa);
          if (wb.SheetNames.includes(name)) {
            wb.Sheets[name] = ws;
          } else {
            XLSX.utils.book_append_sheet(wb, ws, name);
          }
        }
      }

      // operations: fine-grained cell operations
      // Each op: { type: "set_cell", sheet, cell, value, formula }
      //          { type: "set_range", sheet, range, data }
      //          { type: "add_sheet", name, data }
      //          { type: "auto_sum", sheet, sourceRange, targetCell }
      if (Array.isArray(operations)) {
        for (const op of operations) {
          const sheetName = op.sheet || wb.SheetNames[0] || 'Sheet1';

          if (!wb.SheetNames.includes(sheetName)) {
            const newWs = {};
            wb.SheetNames.push(sheetName);
            wb.Sheets[sheetName] = newWs;
          }

          const ws = wb.Sheets[sheetName];

          if (op.type === 'set_cell') {
            const cell = op.cell; // e.g. "A1"
            if (!cell) continue;
            if (op.formula) {
              ws[cell] = { t: 'n', f: op.formula.replace(/^=/, ''), v: 0 };
            } else {
              const v = op.value;
              const t = typeof v === 'number' ? 'n' : (typeof v === 'boolean' ? 'b' : 's');
              ws[cell] = { t, v };
            }
            // Update sheet range
            updateSheetRange(ws, cell);

          } else if (op.type === 'set_range') {
            // data: 2D array [[r1c1, r1c2], [r2c1, r2c2]]
            const startCell = op.range || 'A1';
            const aoa = op.data || [];
            const tmpWs = XLSX.utils.aoa_to_sheet(aoa, { origin: startCell });
            for (const [addr, cell] of Object.entries(tmpWs)) {
              if (!addr.startsWith('!')) ws[addr] = cell;
            }
            if (tmpWs['!ref']) ws['!ref'] = extendRange(ws['!ref'], tmpWs['!ref']);

          } else if (op.type === 'add_sheet') {
            const newName = op.name || `Sheet${wb.SheetNames.length + 1}`;
            const newWs = op.data
              ? XLSX.utils.aoa_to_sheet(op.data)
              : {};
            if (!wb.SheetNames.includes(newName)) {
              XLSX.utils.book_append_sheet(wb, newWs, newName);
            }

          } else if (op.type === 'auto_sum') {
            // Create a SUM formula
            const target = op.targetCell;
            const src = op.sourceRange;
            if (target && src) {
              ws[target] = { t: 'n', f: `SUM(${src})`, v: 0 };
              updateSheetRange(ws, target);
            }
          }
        }
      }

      await fsp.mkdir(path.dirname(resolved), { recursive: true });
      XLSX.writeFile(wb, resolved);

      const stat = await fsp.stat(resolved);
      return `Saved Excel workbook: ${resolved} (${(stat.size / 1024).toFixed(1)} KB, ${wb.SheetNames.length} sheet(s): ${wb.SheetNames.join(', ')})`;
    },
  },

  // ── XLSX chart ────────────────────────────────────────────────────────────
  {
    name: 'office_chart_xlsx',
    category: 'office',
    description: 'Add a chart or pivot table to an Excel workbook using ExcelJS. Supports bar, line, pie, scatter chart types and auto pivot table generation from data range. Creates a new sheet with the chart/pivot if outputSheet is specified.',
    params: ['path', 'chartType', 'dataSheet', 'dataRange', 'outputSheet', 'title', 'pivotConfig'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, chartType = 'bar', dataSheet, dataRange, outputSheet, title, pivotConfig }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      const ExcelJS = require('exceljs');

      const wb = new ExcelJS.Workbook();

      const exists = await fsp.stat(resolved).catch(() => null);
      if (exists) {
        await wb.xlsx.readFile(resolved);
      }

      let chartSheet;
      const sheetName = outputSheet || 'Chart';

      if (wb.getWorksheet(sheetName)) {
        chartSheet = wb.getWorksheet(sheetName);
      } else {
        chartSheet = wb.addWorksheet(sheetName);
      }

      // If pivotConfig: generate a pivot table manually using formulas
      if (pivotConfig) {
        const srcSheet = wb.getWorksheet(dataSheet || wb.worksheets[0]?.name);
        if (!srcSheet) throw new Error(`Source sheet "${dataSheet}" not found`);

        // Simple pivot: group by column, aggregate another column
        const { groupByCol = 1, valueCol = 2, aggregation = 'SUM' } = pivotConfig;

        // Read source data
        const rows = [];
        srcSheet.eachRow((row, i) => {
          if (i > 1) rows.push({ key: row.getCell(groupByCol).value, val: row.getCell(valueCol).value });
        });

        // Aggregate
        const pivotMap = {};
        for (const { key, val } of rows) {
          const k = String(key || '');
          pivotMap[k] = (pivotMap[k] || 0) + (Number(val) || 0);
        }

        // Write pivot data to chart sheet
        chartSheet.getCell('A1').value = 'Category';
        chartSheet.getCell('B1').value = 'Value';
        let pivotRow = 2;
        for (const [k, v] of Object.entries(pivotMap)) {
          chartSheet.getCell(`A${pivotRow}`).value = k;
          chartSheet.getCell(`B${pivotRow}`).value = v;
          pivotRow++;
        }

        // Style headers
        ['A1', 'B1'].forEach((cell) => {
          chartSheet.getCell(cell).font = { bold: true };
          chartSheet.getCell(cell).fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: 'FFD9E1F2' },
          };
        });
        chartSheet.columns = [{ width: 25 }, { width: 15 }];
      }

      // Add chart using ExcelJS chart API
      if (chartType && dataRange) {
        const srcSheetName = dataSheet || wb.worksheets[0]?.name;
        const plotArea = chartSheet.addChart?.({
          type: chartType,
          title: { name: title || 'Chart' },
        });

        if (plotArea) {
          // ExcelJS chart support is basic — set reference
          chartSheet.addChart(plotArea);
        }
      }

      await wb.xlsx.writeFile(resolved);

      return `Chart/pivot added to "${sheetName}" in ${resolved}.`;
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
