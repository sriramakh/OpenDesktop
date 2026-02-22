const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { glob } = require('glob');
const { exec } = require('child_process');

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
 * Extract readable text from binary document files.
 * Tries multiple strategies in order of preference.
 */
async function extractBinaryContent(filePath, ext) {
  const platform = process.platform;
  const strategies = [];

  // macOS textutil handles doc, docx, rtf, odt, pages, etc.
  if (platform === 'darwin' && ['.doc', '.docx', '.rtf', '.odt', '.pages'].includes(ext)) {
    strategies.push(async () => {
      return await shellExec(`textutil -convert txt -stdout "${filePath}"`);
    });
  }

  // PDF extraction
  if (ext === '.pdf') {
    // Try pdftotext (poppler)
    strategies.push(async () => {
      return await shellExec(`pdftotext "${filePath}" -`);
    });
    // Fallback: macOS mdimport metadata
    if (platform === 'darwin') {
      strategies.push(async () => {
        return await shellExec(`mdimport -d2 "${filePath}" 2>&1 | head -500`);
      });
    }
    // Fallback: python
    strategies.push(async () => {
      const pyScript = `
import sys
try:
    import PyPDF2
    reader = PyPDF2.PdfReader("${filePath.replace(/"/g, '\\"')}")
    for page in reader.pages[:20]:
        text = page.extract_text()
        if text: print(text)
except ImportError:
    try:
        import fitz
        doc = fitz.open("${filePath.replace(/"/g, '\\"')}")
        for page in doc[:20]:
            print(page.get_text())
    except ImportError:
        print("[ERROR] No PDF library available. Install: pip install PyPDF2 or pip install PyMuPDF")
`;
      return await shellExec(`python3 -c '${pyScript.replace(/'/g, "'\\''")}'`);
    });
  }

  // Excel extraction
  if (['.xlsx', '.xls'].includes(ext)) {
    // macOS: try using python with openpyxl
    strategies.push(async () => {
      const pyScript = ext === '.xlsx' ? `
import sys
try:
    import openpyxl
    wb = openpyxl.load_workbook("${filePath.replace(/"/g, '\\"')}", read_only=True, data_only=True)
    for sheet_name in wb.sheetnames[:5]:
        ws = wb[sheet_name]
        print(f"\\n=== Sheet: {sheet_name} ===")
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i > 100: print("... (truncated)"); break
            print("\\t".join(str(c) if c is not None else "" for c in row))
except ImportError:
    print("[ERROR] openpyxl not available. Install: pip install openpyxl")
` : `
import sys
try:
    import xlrd
    wb = xlrd.open_workbook("${filePath.replace(/"/g, '\\"')}")
    for sheet in wb.sheets()[:5]:
        print(f"\\n=== Sheet: {sheet.name} ===")
        for i in range(min(sheet.nrows, 100)):
            print("\\t".join(str(sheet.cell_value(i, j)) for j in range(sheet.ncols)))
except ImportError:
    print("[ERROR] xlrd not available. Install: pip install xlrd")
`;
      return await shellExec(`python3 -c '${pyScript.replace(/'/g, "'\\''")}'`);
    });
  }

  // PowerPoint extraction
  if (['.pptx', '.ppt'].includes(ext)) {
    strategies.push(async () => {
      const pyScript = `
import sys
try:
    from pptx import Presentation
    prs = Presentation("${filePath.replace(/"/g, '\\"')}")
    for i, slide in enumerate(prs.slides):
        print(f"\\n=== Slide {i+1} ===")
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = para.text.strip()
                    if text: print(text)
except ImportError:
    print("[ERROR] python-pptx not available. Install: pip install python-pptx")
`;
      return await shellExec(`python3 -c '${pyScript.replace(/'/g, "'\\''")}'`);
    });
    // macOS textutil fallback for .ppt
    if (platform === 'darwin' && ext === '.ppt') {
      strategies.push(async () => {
        return await shellExec(`textutil -convert txt -stdout "${filePath}"`);
      });
    }
  }

  // macOS Numbers
  if (ext === '.numbers' && platform === 'darwin') {
    strategies.push(async () => {
      return await shellExec(`textutil -convert txt -stdout "${filePath}"`);
    });
  }

  // Generic fallback: strings command (extracts readable strings from any binary)
  strategies.push(async () => {
    const output = await shellExec(`strings "${filePath}" | head -500`);
    return `[Extracted raw strings from ${path.basename(filePath)}]\n${output}`;
  });

  // Try each strategy in order
  for (const strategy of strategies) {
    try {
      const result = await strategy();
      if (result && result.trim().length > 10) {
        return result.trim();
      }
    } catch (err) {
      // Try next strategy
      continue;
    }
  }

  throw new Error(`Unable to extract text from ${path.basename(filePath)}. File type: ${ext}. Try installing the appropriate tools (pdftotext for PDF, python3 with openpyxl/PyPDF2/python-pptx for Office files).`);
}

const FilesystemTools = [
  {
    name: 'fs_read',
    category: 'filesystem',
    description: 'Read the full contents of a file. Supports text files AND binary documents (PDF, DOCX, XLSX, PPTX, etc.) — binary files are automatically extracted to readable text. Use absolute paths. If the target is a directory, returns a listing instead.',
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
