const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { glob } = require('glob');
const { exec } = require('child_process');

// Extension → category mapping for fs_organize
const EXT_CATEGORIES = {
  // Images
  '.jpg': 'Images', '.jpeg': 'Images', '.png': 'Images', '.gif': 'Images',
  '.bmp': 'Images', '.svg': 'Images', '.webp': 'Images', '.heic': 'Images',
  '.heif': 'Images', '.tiff': 'Images', '.tif': 'Images', '.ico': 'Images',
  '.raw': 'Images', '.cr2': 'Images', '.nef': 'Images', '.arw': 'Images',
  // Videos
  '.mp4': 'Videos', '.mov': 'Videos', '.avi': 'Videos', '.mkv': 'Videos',
  '.wmv': 'Videos', '.flv': 'Videos', '.webm': 'Videos', '.m4v': 'Videos',
  '.3gp': 'Videos', '.ts': 'Videos', '.m2ts': 'Videos', '.mts': 'Videos',
  // Audio
  '.mp3': 'Audio', '.wav': 'Audio', '.flac': 'Audio', '.aac': 'Audio',
  '.ogg': 'Audio', '.m4a': 'Audio', '.wma': 'Audio', '.aiff': 'Audio',
  '.alac': 'Audio', '.opus': 'Audio',
  // Documents
  '.pdf': 'Documents', '.doc': 'Documents', '.docx': 'Documents',
  '.odt': 'Documents', '.rtf': 'Documents', '.pages': 'Documents',
  '.txt': 'Documents', '.md': 'Documents', '.rst': 'Documents',
  // Spreadsheets
  '.xls': 'Spreadsheets', '.xlsx': 'Spreadsheets', '.ods': 'Spreadsheets',
  '.csv': 'Spreadsheets', '.numbers': 'Spreadsheets', '.tsv': 'Spreadsheets',
  // Presentations
  '.ppt': 'Presentations', '.pptx': 'Presentations', '.odp': 'Presentations',
  '.key': 'Presentations',
  // Code
  '.js': 'Code', '.ts': 'Code', '.py': 'Code', '.java': 'Code',
  '.c': 'Code', '.cpp': 'Code', '.cs': 'Code', '.go': 'Code',
  '.rs': 'Code', '.rb': 'Code', '.php': 'Code', '.swift': 'Code',
  '.kt': 'Code', '.sh': 'Code', '.bash': 'Code', '.zsh': 'Code',
  '.html': 'Code', '.css': 'Code', '.json': 'Code', '.xml': 'Code',
  '.yaml': 'Code', '.yml': 'Code', '.toml': 'Code', '.sql': 'Code',
  // Archives
  '.zip': 'Archives', '.tar': 'Archives', '.gz': 'Archives', '.bz2': 'Archives',
  '.7z': 'Archives', '.rar': 'Archives', '.xz': 'Archives', '.tgz': 'Archives',
  // Applications / DMG
  '.app': 'Applications', '.dmg': 'Applications', '.pkg': 'Applications',
  '.exe': 'Applications', '.msi': 'Applications', '.deb': 'Applications',
  '.rpm': 'Applications',
  // Fonts
  '.ttf': 'Fonts', '.otf': 'Fonts', '.woff': 'Fonts', '.woff2': 'Fonts',
};

// Binary file extensions that need special extraction
const BINARY_EXTENSIONS = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.doc': 'doc',
  '.xlsx': 'xlsx',
  '.xls': 'xls',
  '.pptx': 'pptx',
  '.ppt': 'ppt',
  '.rtf': 'rtf',
  '.odt': 'odt',
  '.ods': 'ods',
  '.odp': 'odp',
  '.pages': 'pages',
  '.numbers': 'numbers',
  '.key': 'keynote',
};

function shellExec(cmd, timeout = 30000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

/**
 * OCR a PDF using PyMuPDF (fitz) to render pages as images + tesseract.
 * Works on scanned/image-based PDFs. Requires python3 + fitz + tesseract.
 */
async function ocrPDF(filePath, maxPages = 15) {
  // Inline Python script — uses tempfile.mkstemp() for real paths (avoids /tmp symlink issue on macOS)
  const script = `
import sys, os, tempfile, subprocess, json

try:
    import fitz
except ImportError:
    print(json.dumps({'error': 'PyMuPDF not installed: pip install PyMuPDF'}))
    sys.exit(0)

pdf_path = sys.argv[1]
max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 15

try:
    doc = fitz.open(pdf_path)
except Exception as e:
    print(json.dumps({'error': str(e)}))
    sys.exit(0)

results = []
for i in range(min(len(doc), max_pages)):
    page = doc[i]
    mat = fitz.Matrix(2.5, 2.5)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)

    fd, img_path = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    fd, out_base = tempfile.mkstemp(suffix='.txt')
    os.close(fd)
    out_base = out_base[:-4]

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
            results.append({'page': i + 1, 'text': text})
    finally:
        if os.path.exists(img_path):
            os.unlink(img_path)

total_pages = len(doc)
doc.close()
print(json.dumps({'pages': results, 'total': total_pages}))
`;

  const scriptPath = path.join(require('os').tmpdir(), `_ocr_pdf_${Date.now()}.py`);
  await fsp.writeFile(scriptPath, script, 'utf-8');
  try {
    const output = await shellExec(`python3 "${scriptPath}" "${filePath}" 15`, 120000);
    const result = JSON.parse(output.trim());
    if (result.error) throw new Error(result.error);

    const pageTexts = result.pages
      .filter((p) => p.text && p.text.trim().length > 0)
      .map((p) => `=== Page ${p.page} ===\n${p.text}`);

    if (pageTexts.length === 0) throw new Error('OCR produced no text');
    return `[PDF (OCR): ${result.total} pages — ${path.basename(filePath)}]\n\n${pageTexts.join('\n\n')}`;
  } finally {
    await fsp.unlink(scriptPath).catch(() => {});
  }
}

/**
 * Resolve path to pdfjs-dist standard fonts (used by pdf-parse v2 to suppress warnings).
 */
function getStandardFontDataUrl() {
  try {
    const pdfjsPkg = require.resolve('pdfjs-dist/package.json');
    return path.join(path.dirname(pdfjsPkg), 'standard_fonts') + path.sep;
  } catch {
    return undefined;
  }
}

/**
 * Extract readable text from binary document files.
 * Uses native Node.js libraries first, then falls back to shell commands.
 * For scanned PDFs: falls back to OCR via PyMuPDF + tesseract.
 */
async function extractBinaryContent(filePath, ext) {
  const platform = process.platform;
  const strategies = [];

  // ── PDF ──────────────────────────────────────────────────────────────────────
  if (ext === '.pdf') {
    // Strategy 1: pdf-parse v2 (text PDFs) → OCR fallback (scanned PDFs)
    strategies.push(async () => {
      const { PDFParse } = require('pdf-parse');
      const data = await fsp.readFile(filePath);
      const uint8 = new Uint8Array(data);
      const opts = {};
      const sfUrl = getStandardFontDataUrl();
      if (sfUrl) opts.standardFontDataUrl = sfUrl;

      // Suppress pdfjs-dist v5 font warning (non-critical)
      const _origWarn = console.warn;
      console.warn = (...a) => { if (String(a[0]).includes('standardFontDataUrl')) return; _origWarn(...a); };
      let info, result;
      try {
        const parser = new PDFParse(uint8, opts);
        await parser.load();
        info   = await parser.getInfo();
        result = await parser.getText();
        parser.destroy();
      } finally {
        console.warn = _origWarn;
      }

      const text = result.text || '';
      const pages = info.total || 1;
      const charsPerPage = text.replace(/[\s\-–]/g, '').length / pages;

      // If sparse (< 30 meaningful chars/page), it's a scanned PDF → try OCR
      if (charsPerPage < 30) {
        try {
          return await ocrPDF(filePath);
        } catch (ocrErr) {
          // OCR not available — return what we have with a note
          return `[PDF: ${pages} pages — scanned/image-based, OCR unavailable: ${ocrErr.message}]\n\nInstall PyMuPDF + tesseract for OCR support:\n  pip install PyMuPDF\n  brew install tesseract`;
        }
      }

      return `[PDF: ${pages} pages]\n\n${text.trim()}`;
    });

    // Strategy 2: pdftotext CLI (poppler)
    strategies.push(async () => shellExec(`pdftotext "${filePath}" -`));
  }

  // ── DOCX / DOC / RTF / ODT / Pages ──────────────────────────────────────────
  if (['.docx', '.odt'].includes(ext)) {
    // Strategy 1: mammoth (native Node.js for DOCX/ODT)
    strategies.push(async () => {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      if (!result.value || result.value.trim().length < 5) throw new Error('Empty document');
      return result.value;
    });
  }

  if (platform === 'darwin' && ['.doc', '.docx', '.rtf', '.odt', '.pages'].includes(ext)) {
    // macOS textutil (very reliable for Apple/Microsoft formats)
    strategies.push(async () => {
      return await shellExec(`textutil -convert txt -stdout "${filePath}"`);
    });
  }

  // ── XLSX / XLS ───────────────────────────────────────────────────────────────
  if (['.xlsx', '.xls'].includes(ext)) {
    // Strategy 1: SheetJS (native Node.js)
    strategies.push(async () => {
      const XLSX = require('xlsx');
      const wb = XLSX.readFile(filePath, { sheetRows: 200 });
      const lines = [];
      for (const sheetName of wb.SheetNames.slice(0, 5)) {
        lines.push(`\n=== Sheet: ${sheetName} ===`);
        const ws = wb.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(ws);
        lines.push(csv.split('\n').slice(0, 200).join('\n'));
      }
      const text = lines.join('\n');
      if (text.trim().length < 5) throw new Error('Empty workbook');
      return text;
    });
  }

  // ── PPTX ─────────────────────────────────────────────────────────────────────
  if (['.pptx', '.ppt'].includes(ext)) {
    // Strategy 1: jszip — PPTX is a ZIP; parse slide XML natively
    strategies.push(async () => {
      const JSZip = require('jszip');
      const data = await fsp.readFile(filePath);
      const zip = await JSZip.loadAsync(data);

      const slideFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const na = parseInt(a.match(/\d+/)[0]);
          const nb = parseInt(b.match(/\d+/)[0]);
          return na - nb;
        });

      const lines = [];
      for (let i = 0; i < slideFiles.length; i++) {
        const xml = await zip.files[slideFiles[i]].async('text');
        // Extract text from <a:t> tags (DrawingML text runs)
        const textNodes = [...xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)].map((m) => m[1]);
        const slideText = textNodes
          .map((t) => t.trim())
          .filter(Boolean)
          .join(' ');
        if (slideText) lines.push(`\n=== Slide ${i + 1} ===\n${slideText}`);
      }

      const text = lines.join('\n');
      if (text.trim().length < 5) throw new Error('Empty presentation');
      return text;
    });

    // Strategy 2: macOS textutil fallback for .ppt
    if (platform === 'darwin' && ext === '.ppt') {
      strategies.push(async () => shellExec(`textutil -convert txt -stdout "${filePath}"`));
    }
  }

  // ── CSV / TSV ─────────────────────────────────────────────────────────────────
  if (['.csv', '.tsv'].includes(ext)) {
    strategies.push(async () => {
      const content = await fsp.readFile(filePath, 'utf-8');
      return content.slice(0, 50000);
    });
  }

  // ── macOS Numbers ─────────────────────────────────────────────────────────────
  if (ext === '.numbers' && platform === 'darwin') {
    strategies.push(async () => shellExec(`textutil -convert txt -stdout "${filePath}"`));
  }

  // ── Generic fallback ──────────────────────────────────────────────────────────
  strategies.push(async () => {
    const output = await shellExec(`strings "${filePath}" | head -500`);
    return `[Extracted raw strings from ${path.basename(filePath)}]\n${output}`;
  });

  // Try each strategy in order — return first success
  const errors = [];
  for (const strategy of strategies) {
    try {
      const result = await strategy();
      if (result && result.trim().length > 10) {
        return result.trim();
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  throw new Error(
    `Unable to extract text from ${path.basename(filePath)} (${ext}). ` +
    `Attempted ${strategies.length} strategies. Last errors: ${errors.slice(-2).join('; ')}`
  );
}

const FilesystemTools = [
  {
    name: 'fs_read',
    category: 'filesystem',
    description: 'Read the full contents of a file. Supports text files AND binary documents (PDF, DOCX, XLSX, PPTX, CSV) — binary files are automatically extracted to readable text. Scanned PDFs are automatically OCR\'d if PyMuPDF + tesseract are available. Use absolute paths. If the target is a directory, returns a listing instead.',
    params: ['path', 'encoding', 'offset', 'limit'],
    permissionLevel: 'safe',
    async execute({ path: filePath, encoding = 'utf-8', offset, limit }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      guardPath(resolved);

      const stat = await fsp.stat(resolved);

      // If user points fs_read at a directory, return a listing instead of erroring
      if (stat.isDirectory()) {
        const entries = await fsp.readdir(resolved, { withFileTypes: true });
        const listing = entries
          .filter((e) => !e.name.startsWith('.'))
          .map((e) => {
            const type = e.isDirectory() ? '[DIR] ' : '      ';
            return `${type}${path.join(resolved, e.name)}`;
          });
        return `Directory: ${resolved}\n${listing.join('\n')}`;
      }

      if (stat.size > 10 * 1024 * 1024) {
        throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.`);
      }

      // Check if this is a binary document that needs extraction
      const ext = path.extname(resolved).toLowerCase();
      if (BINARY_EXTENSIONS[ext]) {
        return await extractBinaryContent(resolved, ext);
      }

      const content = await fsp.readFile(resolved, encoding);

      if (offset || limit) {
        const lines = content.split('\n');
        const start = (offset || 1) - 1;
        const end = limit ? start + limit : lines.length;
        return lines.slice(start, end).join('\n');
      }

      return content;
    },
  },

  {
    name: 'fs_write',
    category: 'filesystem',
    description: 'Write content to a file, creating parent directories if needed',
    params: ['path', 'content', 'append'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, content, append = false }) {
      if (!filePath) throw new Error('path is required');
      if (content === undefined) throw new Error('content is required');
      const resolved = resolvePath(filePath);
      guardPath(resolved);

      await fsp.mkdir(path.dirname(resolved), { recursive: true });

      if (append) {
        await fsp.appendFile(resolved, content, 'utf-8');
      } else {
        await fsp.writeFile(resolved, content, 'utf-8');
      }

      return `Written ${content.length} bytes to ${resolved}`;
    },
  },

  {
    name: 'fs_edit',
    category: 'filesystem',
    description: 'Find and replace text in a file',
    params: ['path', 'find', 'replace', 'all'],
    permissionLevel: 'sensitive',
    async execute({ path: filePath, find, replace, all = false }) {
      if (!filePath || !find) throw new Error('path and find are required');
      const resolved = resolvePath(filePath);
      guardPath(resolved);

      let content = await fsp.readFile(resolved, 'utf-8');
      const original = content;

      if (all) {
        content = content.split(find).join(replace || '');
      } else {
        const idx = content.indexOf(find);
        if (idx === -1) throw new Error(`Text not found in file: "${find.slice(0, 50)}..."`);
        content = content.slice(0, idx) + (replace || '') + content.slice(idx + find.length);
      }

      if (content === original) throw new Error('No changes made');

      await fsp.writeFile(resolved, content, 'utf-8');
      return `Edited ${resolved}`;
    },
  },

  {
    name: 'fs_list',
    category: 'filesystem',
    description: 'List all files and subdirectories at the given path. Returns full absolute paths, file sizes, and types. Use this to browse/crawl any directory like ~/Desktop, ~/Downloads, etc. Set recursive=true to include subdirectory contents.',
    params: ['path', 'recursive', 'maxDepth', 'showHidden'],
    permissionLevel: 'safe',
    async execute({ path: dirPath = '.', recursive = false, maxDepth = 3, showHidden = false }) {
      const resolved = resolvePath(dirPath);
      guardPath(resolved);

      const stat = await fsp.stat(resolved).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        throw new Error(`Not a directory: ${resolved}`);
      }

      const results = [];

      async function walk(dir, depth) {
        let entries;
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch { return; }

        for (const entry of entries) {
          if (!showHidden && entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          const entryStat = await fsp.stat(fullPath).catch(() => null);

          results.push({
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'dir' : 'file',
            size: entryStat ? entryStat.size : 0,
            modified: entryStat ? entryStat.mtime.toISOString() : null,
          });

          if (recursive && entry.isDirectory() && depth < maxDepth && results.length < 200) {
            await walk(fullPath, depth + 1);
          }
        }
      }

      await walk(resolved, 0);

      return JSON.stringify(results, null, 2);
    },
  },

  {
    name: 'fs_search',
    category: 'filesystem',
    description: 'Search for files matching a glob pattern (e.g. "**/*.txt", "**/*.pdf") within a directory. Returns full absolute paths. Use cwd to set the search root (e.g. ~/Desktop). Optionally grep for text content inside matching files.',
    params: ['pattern', 'cwd', 'maxResults', 'contentMatch'],
    permissionLevel: 'safe',
    async execute({ pattern, cwd = '.', maxResults = 50, contentMatch }) {
      if (!pattern) throw new Error('pattern is required');
      const resolved = resolvePath(cwd);
      guardPath(resolved);

      const matches = await glob(pattern, {
        cwd: resolved,
        nodir: false,
        dot: false,
        maxDepth: 8,
      });

      let fullPaths = matches.map((m) => path.join(resolved, m));

      // Optional content-level grep
      if (contentMatch && typeof contentMatch === 'string') {
        const contentMatched = [];
        const needle = contentMatch.toLowerCase();
        for (const fp of fullPaths) {
          if (contentMatched.length >= maxResults) break;
          try {
            const s = await fsp.stat(fp);
            if (s.isFile() && s.size < 2 * 1024 * 1024) {
              const text = await fsp.readFile(fp, 'utf-8');
              if (text.toLowerCase().includes(needle)) {
                contentMatched.push(fp);
              }
            }
          } catch { /* skip unreadable */ }
        }
        return JSON.stringify(contentMatched.slice(0, maxResults));
      }

      return JSON.stringify(fullPaths.slice(0, maxResults));
    },
  },

  {
    name: 'fs_delete',
    category: 'filesystem',
    description: 'Delete a file or directory (requires approval)',
    params: ['path', 'recursive'],
    permissionLevel: 'dangerous',
    async execute({ path: targetPath, recursive = false }) {
      if (!targetPath) throw new Error('path is required');
      const resolved = resolvePath(targetPath);
      guardPath(resolved);

      const stat = await fsp.stat(resolved);
      if (stat.isDirectory()) {
        if (!recursive) throw new Error('Use recursive: true to delete directories');
        await fsp.rm(resolved, { recursive: true, force: true });
      } else {
        await fsp.unlink(resolved);
      }

      return `Deleted: ${resolved}`;
    },
  },

  {
    name: 'fs_move',
    category: 'filesystem',
    description: 'Move or rename files/directories. Supports glob patterns like "*.jpg" or "**/*.png" in the source path to move multiple files at once. If destination is an existing directory, files are moved INTO it. Use absolute paths.',
    params: ['source', 'destination'],
    permissionLevel: 'dangerous',
    async execute({ source, destination }) {
      if (!source || !destination) throw new Error('source and destination are required');
      const resolvedDst = resolvePath(destination);
      guardPath(resolvedDst);

      // Check if source contains glob characters
      const hasGlob = /[*?{}\[\]]/.test(source);

      if (hasGlob) {
        // Extract the directory part and the glob pattern
        const resolvedSrc = resolvePath(source);
        const srcDir = path.dirname(resolvedSrc);
        const pattern = path.basename(resolvedSrc);

        // Also try the full path as a glob pattern
        const globPattern = source.startsWith('~') ? resolvePath(source) : source;
        const parentDir = path.dirname(globPattern);
        const resolvedParent = resolvePath(parentDir);
        guardPath(resolvedParent);

        const matches = await glob(path.basename(globPattern), {
          cwd: resolvedParent,
          nodir: false,
          dot: false,
          absolute: false,
        });

        if (matches.length === 0) {
          throw new Error(`No files matched pattern: ${source}`);
        }

        // Ensure destination directory exists
        await fsp.mkdir(resolvedDst, { recursive: true });

        const moved = [];
        const errors = [];
        for (const match of matches) {
          const fullSrc = path.join(resolvedParent, match);
          const fullDst = path.join(resolvedDst, path.basename(match));
          guardPath(fullSrc);
          try {
            await fsp.rename(fullSrc, fullDst);
            moved.push(path.basename(match));
          } catch (renameErr) {
            // rename fails across devices — fall back to copy+delete
            try {
              await fsp.copyFile(fullSrc, fullDst);
              await fsp.unlink(fullSrc);
              moved.push(path.basename(match));
            } catch (copyErr) {
              errors.push(`${path.basename(match)}: ${copyErr.message}`);
            }
          }
        }

        let result = `Moved ${moved.length} file(s) to ${resolvedDst}`;
        if (moved.length > 0 && moved.length <= 20) result += `:\n${moved.join('\n')}`;
        if (errors.length > 0) result += `\nErrors (${errors.length}):\n${errors.join('\n')}`;
        return result;
      }

      // Single file/directory move
      const resolvedSrc = resolvePath(source);
      guardPath(resolvedSrc);

      // If destination is an existing directory, move source INTO it
      const dstStat = await fsp.stat(resolvedDst).catch(() => null);
      let finalDst = resolvedDst;
      if (dstStat && dstStat.isDirectory()) {
        finalDst = path.join(resolvedDst, path.basename(resolvedSrc));
      } else {
        await fsp.mkdir(path.dirname(resolvedDst), { recursive: true });
      }

      try {
        await fsp.rename(resolvedSrc, finalDst);
      } catch (renameErr) {
        // Cross-device fallback: copy then delete
        const srcStat = await fsp.stat(resolvedSrc);
        if (srcStat.isFile()) {
          await fsp.copyFile(resolvedSrc, finalDst);
          await fsp.unlink(resolvedSrc);
        } else {
          throw renameErr;
        }
      }

      return `Moved: ${resolvedSrc} → ${finalDst}`;
    },
  },

  {
    name: 'fs_mkdir',
    category: 'filesystem',
    description: 'Create a directory (with parents if needed). Use absolute paths.',
    params: ['path'],
    permissionLevel: 'sensitive',
    async execute({ path: dirPath }) {
      if (!dirPath) throw new Error('path is required');
      const resolved = resolvePath(dirPath);
      guardPath(resolved);

      await fsp.mkdir(resolved, { recursive: true });
      return `Created directory: ${resolved}`;
    },
  },

  {
    name: 'fs_tree',
    category: 'filesystem',
    description: 'Show a tree view of a directory structure. Great for exploring/crawling folder hierarchies. Returns an indented tree with file sizes. Use maxDepth to control depth.',
    params: ['path', 'maxDepth', 'showHidden'],
    permissionLevel: 'safe',
    async execute({ path: dirPath = '.', maxDepth = 3, showHidden = false }) {
      const resolved = resolvePath(dirPath);
      guardPath(resolved);

      const stat = await fsp.stat(resolved).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        throw new Error(`Not a directory: ${resolved}`);
      }

      const lines = [`${resolved}/`];
      let count = 0;
      const MAX_ENTRIES = 300;

      async function buildTree(dir, prefix, depth) {
        if (depth > maxDepth || count > MAX_ENTRIES) return;
        let entries;
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch { return; }

        if (!showHidden) entries = entries.filter((e) => !e.name.startsWith('.'));
        entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (let i = 0; i < entries.length && count < MAX_ENTRIES; i++) {
          count++;
          const entry = entries[i];
          const isLast = i === entries.length - 1;
          const connector = isLast ? '└── ' : '├── ';
          const fullPath = path.join(dir, entry.name);
          const entryStat = await fsp.stat(fullPath).catch(() => null);

          if (entry.isDirectory()) {
            lines.push(`${prefix}${connector}${entry.name}/`);
            await buildTree(fullPath, prefix + (isLast ? '    ' : '│   '), depth + 1);
          } else {
            const sizeStr = entryStat ? formatSize(entryStat.size) : '?';
            lines.push(`${prefix}${connector}${entry.name} (${sizeStr})`);
          }
        }
      }

      await buildTree(resolved, '', 0);

      if (count >= MAX_ENTRIES) {
        lines.push(`\n... truncated at ${MAX_ENTRIES} entries`);
      }

      return lines.join('\n');
    },
  },

  {
    name: 'fs_info',
    category: 'filesystem',
    description: 'Get detailed metadata about a file or directory: size, permissions, creation/modification dates, type.',
    params: ['path'],
    permissionLevel: 'safe',
    async execute({ path: filePath }) {
      if (!filePath) throw new Error('path is required');
      const resolved = resolvePath(filePath);
      guardPath(resolved);

      const stat = await fsp.stat(resolved);
      const info = {
        path: resolved,
        type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symlink' : 'other',
        size: stat.size,
        sizeHuman: formatSize(stat.size),
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
        accessed: stat.atime.toISOString(),
        permissions: stat.mode.toString(8),
      };

      if (stat.isDirectory()) {
        const entries = await fsp.readdir(resolved).catch(() => []);
        info.itemCount = entries.length;
      }

      return JSON.stringify(info, null, 2);
    },
  },
  {
    name: 'fs_organize',
    category: 'filesystem',
    description: 'Intelligently organize files in a directory by type. Classifies files by extension, creates category folders (Images, Videos, Documents, Spreadsheets, Presentations, Code, Archives, Audio, Applications, Fonts), and moves ONLY files (never existing subdirectories) to their destinations. Use dryRun=true first to preview. Use customRules to override default categories.',
    params: ['path', 'dryRun', 'customRules', 'othersFolder'],
    permissionLevel: 'dangerous',
    async execute({ path: dirPath, dryRun = false, customRules, othersFolder = 'Others' }) {
      if (!dirPath) throw new Error('path is required');
      const resolved = resolvePath(dirPath);
      guardPath(resolved);

      const stat = await fsp.stat(resolved);
      if (!stat.isDirectory()) throw new Error(`Not a directory: ${resolved}`);

      // Merge custom rules into default categories
      const extMap = { ...EXT_CATEGORIES };
      if (customRules && typeof customRules === 'object') {
        for (const [ext, category] of Object.entries(customRules)) {
          extMap[ext.toLowerCase()] = category;
        }
      }

      // List ONLY direct children (no recursion)
      const entries = await fsp.readdir(resolved, { withFileTypes: true });

      // Collect only FILES — skip directories entirely
      const files = entries.filter((e) => e.isFile() && !e.name.startsWith('.'));

      if (files.length === 0) {
        return 'No files to organize (directory only contains subdirectories or is empty).';
      }

      // Classify each file
      const plan = [];
      for (const file of files) {
        const ext = path.extname(file.name).toLowerCase();
        const category = extMap[ext] || othersFolder;
        plan.push({ name: file.name, ext, category });
      }

      // Summary
      const categorySummary = {};
      for (const { name, category } of plan) {
        if (!categorySummary[category]) categorySummary[category] = [];
        categorySummary[category].push(name);
      }

      if (dryRun) {
        const lines = ['[DRY RUN — no files moved]\n'];
        for (const [cat, files] of Object.entries(categorySummary)) {
          lines.push(`${cat}/ (${files.length} files):`);
          for (const f of files) lines.push(`  ${f}`);
        }
        return lines.join('\n');
      }

      // Create destination folders
      const foldersCreated = new Set();
      for (const category of new Set(plan.map((p) => p.category))) {
        const destDir = path.join(resolved, category);
        const exists = await fsp.stat(destDir).catch(() => null);
        if (!exists) {
          await fsp.mkdir(destDir, { recursive: true });
          foldersCreated.add(category);
        }
      }

      // Move files
      const moved = [];
      const errors = [];
      for (const { name, category } of plan) {
        const src = path.join(resolved, name);
        const destDir = path.join(resolved, category);
        const dst = path.join(destDir, name);

        // Skip if source is one of the category folders we just created
        if (foldersCreated.has(name) || name === othersFolder) continue;

        try {
          // Rename first (fast, same-volume)
          await fsp.rename(src, dst).catch(async () => {
            // Cross-device fallback
            await fsp.copyFile(src, dst);
            await fsp.unlink(src);
          });
          moved.push(`${name} → ${category}/`);
        } catch (err) {
          errors.push(`${name}: ${err.message}`);
        }
      }

      const lines = [`Organized ${moved.length} files in ${resolved}:`];
      for (const [cat, catFiles] of Object.entries(categorySummary)) {
        const movedCount = moved.filter((m) => m.includes(`→ ${cat}/`)).length;
        if (movedCount > 0) lines.push(`  ${cat}/ — ${movedCount} files`);
      }
      if (foldersCreated.size > 0) {
        lines.push(`\nFolders created: ${[...foldersCreated].join(', ')}`);
      }
      if (errors.length > 0) {
        lines.push(`\nErrors (${errors.length}):\n${errors.join('\n')}`);
      }

      return lines.join('\n');
    },
  },
];

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function resolvePath(p) {
  if (p.startsWith('~')) {
    return path.join(require('os').homedir(), p.slice(1));
  }
  return path.resolve(p);
}

function guardPath(resolved) {
  // Prevent access to extremely sensitive system directories
  const forbidden = ['/System', '/Library/System', '/bin', '/sbin', '/usr/bin', '/usr/sbin'];
  for (const f of forbidden) {
    if (resolved.startsWith(f) && !resolved.startsWith(f + '/local')) {
      throw new Error(`Access denied: ${resolved} is in a protected system directory`);
    }
  }
}

module.exports = { FilesystemTools };
