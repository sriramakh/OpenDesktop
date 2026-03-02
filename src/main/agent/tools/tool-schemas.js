/**
 * JSON Schema parameter definitions for all built-in tools.
 * Used by the ToolRegistry to generate provider-specific tool definitions
 * for native function/tool calling APIs (Anthropic, OpenAI, Gemini, Ollama).
 *
 * Format follows JSON Schema draft-07.
 */

const TOOL_SCHEMAS = {
  // ---------------------------------------------------------------------------
  // Filesystem
  // ---------------------------------------------------------------------------
  fs_read: {
    description:
      'Read the full contents of a file. Supports text AND binary documents (PDF, DOCX, XLSX, PPTX) — binary files are automatically extracted to readable text. If the path is a directory, returns a listing instead.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file or directory (e.g. /Users/alice/file.txt or ~/Documents/report.pdf)',
      },
      encoding: {
        type: 'string',
        description: "File encoding. Default: 'utf-8'",
        default: 'utf-8',
      },
      offset: {
        type: 'number',
        description: 'Starting line number (1-indexed). Omit to read from beginning.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read. Omit to read entire file.',
      },
    },
    required: ['path'],
  },

  fs_write: {
    description: 'Write content to a file, creating parent directories as needed. Overwrites existing content unless append is true.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path for the file to write.',
      },
      content: {
        type: 'string',
        description: 'Text content to write to the file.',
      },
      append: {
        type: 'boolean',
        description: 'If true, append to existing content instead of overwriting. Default: false.',
        default: false,
      },
    },
    required: ['path', 'content'],
  },

  fs_edit: {
    description: 'Find and replace specific text in a file. Use this for targeted edits rather than rewriting the whole file.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file.',
      },
      find: {
        type: 'string',
        description: 'Exact text to search for in the file.',
      },
      replace: {
        type: 'string',
        description: 'Replacement text. Use empty string to delete the found text.',
      },
      all: {
        type: 'boolean',
        description: 'If true, replace all occurrences. If false (default), only replace the first.',
        default: false,
      },
    },
    required: ['path', 'find', 'replace'],
  },

  fs_list: {
    description: 'List all files and subdirectories at a given path. Returns full absolute paths, file sizes, and types. Perfect for exploring directories like ~/Desktop, ~/Downloads, etc.',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (e.g. ~/Desktop, /Users/alice/Documents).',
      },
      recursive: {
        type: 'boolean',
        description: 'If true, include subdirectory contents. Default: false.',
        default: false,
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum recursion depth (only used when recursive=true). Default: 3.',
        default: 3,
      },
      showHidden: {
        type: 'boolean',
        description: 'If true, include hidden files (starting with .). Default: false.',
        default: false,
      },
    },
    required: ['path'],
  },

  fs_search: {
    description: "Search for files matching a glob pattern within a directory. Examples: '**/*.pdf', '**/*.{jpg,png}', 'src/**/*.js'. Returns full absolute paths.",
    properties: {
      pattern: {
        type: 'string',
        description: "Glob pattern to match (e.g. '**/*.pdf', '*.txt', 'src/**/*.js').",
      },
      cwd: {
        type: 'string',
        description: 'Root directory to search from (e.g. ~/Desktop, ~/Documents).',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return. Default: 50.',
        default: 50,
      },
      contentMatch: {
        type: 'string',
        description: 'Optional: only return files whose content contains this string (case-insensitive grep).',
      },
      maxDepth: {
        type: 'number',
        description: 'How deep to search into subdirectories. Default: 15.',
        default: 15,
      },
      dot: {
        type: 'boolean',
        description: 'Include hidden files/directories (starting with .). Default: false.',
        default: false,
      },
    },
    required: ['pattern', 'cwd'],
  },

  fs_delete: {
    description: 'Delete a file or directory. Requires user approval. Set recursive=true to delete a directory and all its contents.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file or directory to delete.',
      },
      recursive: {
        type: 'boolean',
        description: 'Required to delete directories. Default: false.',
        default: false,
      },
    },
    required: ['path'],
  },

  fs_move: {
    description: 'Move or rename files/directories. Supports glob patterns in the source (e.g. ~/Downloads/*.jpg) to move multiple files at once. If destination is an existing directory, files are moved INTO it.',
    properties: {
      source: {
        type: 'string',
        description: 'Source path or glob pattern (e.g. ~/Downloads/*.jpg, ~/Desktop/old-name.txt).',
      },
      destination: {
        type: 'string',
        description: 'Destination path or directory.',
      },
    },
    required: ['source', 'destination'],
  },

  fs_mkdir: {
    description: 'Create a directory (and any required parent directories). Use absolute paths.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path for the new directory.',
      },
    },
    required: ['path'],
  },

  fs_tree: {
    description: 'Show a tree view of a directory structure. Great for understanding folder hierarchies at a glance. Returns an indented tree with file sizes.',
    properties: {
      path: {
        type: 'string',
        description: 'Root directory for the tree view.',
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum depth to display. Default: 3.',
        default: 3,
      },
      showHidden: {
        type: 'boolean',
        description: 'Include hidden files. Default: false.',
        default: false,
      },
    },
    required: ['path'],
  },

  fs_info: {
    description: 'Get detailed metadata about a file or directory: size, permissions, creation/modification dates, type, and item count for directories.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file or directory.',
      },
    },
    required: ['path'],
  },

  // ---------------------------------------------------------------------------
  // System
  // ---------------------------------------------------------------------------
  system_exec: {
    description: 'Execute a shell command (bash on macOS/Linux, PowerShell on Windows) and return stdout + stderr. Use for git operations, npm/pip/brew installs, file operations not covered by fs_ tools, running scripts, etc.',
    properties: {
      command: {
        type: 'string',
        description: 'The full shell command to execute.',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command. Defaults to current directory.',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds. Default: 30000 (30s).',
        default: 30000,
      },
    },
    required: ['command'],
  },

  system_info: {
    description: "Get system information: OS, CPU, memory (total/free), hostname, uptime, load averages. Set detail='full' for network interfaces and PATH.",
    properties: {
      detail: {
        type: 'string',
        description: "Level of detail: 'summary' (default) or 'full'.",
        enum: ['summary', 'full'],
        default: 'summary',
      },
    },
    required: [],
  },

  system_processes: {
    description: 'List top running processes sorted by CPU or memory usage. Returns process name, PID, CPU%, and memory.',
    properties: {
      sortBy: {
        type: 'string',
        description: "Sort by 'cpu' (default) or 'memory'.",
        enum: ['cpu', 'memory'],
        default: 'cpu',
      },
      limit: {
        type: 'number',
        description: 'Number of processes to return. Default: 15.',
        default: 15,
      },
    },
    required: [],
  },

  system_clipboard_read: {
    description: 'Read whatever text is currently in the system clipboard.',
    properties: {},
    required: [],
  },

  system_clipboard_write: {
    description: 'Copy text to the system clipboard so the user can paste it.',
    properties: {
      text: {
        type: 'string',
        description: 'Text to copy to clipboard.',
      },
    },
    required: ['text'],
  },

  system_notify: {
    description: 'Show a native OS notification popup. Useful for alerting the user when a long task completes.',
    properties: {
      title: {
        type: 'string',
        description: "Notification title. Default: 'OpenDesktop'.",
      },
      message: {
        type: 'string',
        description: 'Notification body text.',
      },
      sound: {
        type: 'boolean',
        description: 'Play a sound with the notification. Default: false.',
        default: false,
      },
    },
    required: ['message'],
  },

  // ---------------------------------------------------------------------------
  // App control
  // ---------------------------------------------------------------------------
  app_open: {
    description: "Open an application, file, or URL. For apps: just use the name ('Safari', 'Finder', 'VS Code') — the system finds it automatically even with typos. For files: use the absolute path. For URLs: use https://...",
    properties: {
      target: {
        type: 'string',
        description: "App name (e.g. 'Finder', 'Safari'), file path, or URL.",
      },
      app: {
        type: 'string',
        description: 'Optional: specific app to open the target with.',
      },
    },
    required: ['target'],
  },

  app_find: {
    description: 'Search for installed applications by name. Handles typos and partial matches. Use to verify an app exists before opening it.',
    properties: {
      query: {
        type: 'string',
        description: 'App name to search for (partial matches OK).',
      },
    },
    required: ['query'],
  },

  app_list: {
    description: 'List all currently running (visible) applications on the system.',
    properties: {},
    required: [],
  },

  app_focus: {
    description: "Bring a named application to the foreground. Use the exact app name like 'Finder', 'Safari', 'Terminal'.",
    properties: {
      appName: {
        type: 'string',
        description: 'Name of the application to focus.',
      },
    },
    required: ['appName'],
  },

  app_quit: {
    description: 'Quit a running application. Set force=true to force-kill.',
    properties: {
      appName: {
        type: 'string',
        description: 'Name of the application to quit.',
      },
      force: {
        type: 'boolean',
        description: 'Force-kill the application. Default: false.',
        default: false,
      },
    },
    required: ['appName'],
  },

  app_screenshot: {
    description: 'Capture a screenshot of the full screen or a specific window.',
    properties: {
      outputPath: {
        type: 'string',
        description: 'Where to save the screenshot. Defaults to /tmp/screenshot_<timestamp>.png.',
      },
      window: {
        type: 'boolean',
        description: 'If true, capture a specific window interactively.',
        default: false,
      },
    },
    required: [],
  },

  // ---------------------------------------------------------------------------
  // Browser / UI automation
  // ---------------------------------------------------------------------------
  browser_navigate: {
    description: 'Open a URL in the default browser.',
    properties: {
      url: {
        type: 'string',
        description: 'URL to open (must start with https:// or http://).',
      },
    },
    required: ['url'],
  },

  browser_click: {
    description: 'Click at screen coordinates (x, y) using system automation.',
    properties: {
      x: { type: 'number', description: 'X coordinate in screen pixels.' },
      y: { type: 'number', description: 'Y coordinate in screen pixels.' },
      button: {
        type: 'string',
        description: "Mouse button: 'left' (default) or 'right'.",
        enum: ['left', 'right'],
        default: 'left',
      },
    },
    required: ['x', 'y'],
  },

  browser_type: {
    description: 'Type text using keyboard automation into the currently focused element.',
    properties: {
      text: {
        type: 'string',
        description: 'Text to type.',
      },
      delay: {
        type: 'number',
        description: 'Delay between keystrokes in ms. Default: 50.',
        default: 50,
      },
    },
    required: ['text'],
  },

  browser_key: {
    description: "Press a keyboard shortcut (e.g. 'cmd+c', 'ctrl+v', 'enter', 'tab', 'escape').",
    properties: {
      keys: {
        type: 'string',
        description: "Key combination (e.g. 'cmd+c', 'ctrl+shift+t', 'enter').",
      },
    },
    required: ['keys'],
  },

  browser_submit_form: {
    description: 'Submit form data to a URL via HTTP POST.',
    properties: {
      url: { type: 'string', description: 'URL to POST to.' },
      data: {
        type: 'object',
        description: 'Form data as a JSON object.',
        additionalProperties: true,
      },
      contentType: {
        type: 'string',
        description: "Content-Type header. Default: 'application/json'.",
        default: 'application/json',
      },
    },
    required: ['url', 'data'],
  },

  // ---------------------------------------------------------------------------
  // Content summarization
  // ---------------------------------------------------------------------------
  content_summarize: {
    description:
      'Summarize any content: web articles, YouTube videos, podcast feeds, local audio/video files (MP3, MP4, WAV, M4A), PDFs, or text files. Powered by the summarize CLI which auto-detects input type and handles Whisper transcription for audio/video. Use instead of web_fetch+llm_summarize for: YouTube links, podcast URLs, audio/video files, and any URL that needs intelligent extraction. Requires summarize CLI: npm install -g @steipete/summarize',
    properties: {
      input: {
        type: 'string',
        description:
          'URL (web page, YouTube, podcast RSS/Apple Podcasts/Spotify) or absolute file path (MP3, MP4, WAV, M4A, PDF, TXT). Examples: "https://youtu.be/dQw4w9WgXcQ", "https://example.com/article", "/Users/alice/podcast.mp3"',
      },
      length: {
        type: 'string',
        enum: ['short', 'medium', 'long', 'xl', 'xxl'],
        description:
          'Summary length. short ~900 chars, medium ~1800 chars (default), long ~4200 chars, xl ~9000 chars, xxl ~17000 chars. Use "xl" or "xxl" when the user wants a detailed summary or near-full transcript.',
      },
      language: {
        type: 'string',
        description:
          'Output language code (e.g. "en", "de", "fr", "es", "ja"). Defaults to English. Pass the user\'s preferred language here.',
      },
      extract: {
        type: 'boolean',
        description:
          'If true, return raw extracted content without summarizing. Use to get the full transcript of a video/podcast, full article text, or raw PDF content.',
      },
      slides: {
        type: 'boolean',
        description:
          'For YouTube videos and slide-heavy presentations: extract key screenshots with timestamps. Useful when the user wants visual slide content from a presentation video.',
      },
    },
    required: ['input'],
  },

  // ---------------------------------------------------------------------------
  // Web search & fetch
  // ---------------------------------------------------------------------------
  web_search: {
    description: 'Search the web using DuckDuckGo (no API key needed). Returns titles, URLs, and snippets. Use for any web research.',
    properties: {
      query: {
        type: 'string',
        description: 'Search query.',
      },
      maxResults: {
        type: 'number',
        description: 'Number of results to return. Default: 8.',
        default: 8,
      },
    },
    required: ['query'],
  },

  web_fetch: {
    description: 'Fetch a web page and return its text content (HTML stripped). Use to read articles, documentation, or any URL. Returns up to maxLength characters.',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch.',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum characters to return. Default: 50000.',
        default: 50000,
      },
    },
    required: ['url'],
  },

  web_fetch_json: {
    description: 'Call a JSON REST API endpoint and return the parsed response. Supports GET, POST, PUT, DELETE.',
    properties: {
      url: { type: 'string', description: 'API endpoint URL.' },
      method: {
        type: 'string',
        description: "HTTP method. Default: 'GET'.",
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        default: 'GET',
      },
      body: {
        type: 'object',
        description: 'Request body (for POST/PUT/PATCH).',
        additionalProperties: true,
      },
      headers: {
        type: 'object',
        description: 'Additional HTTP headers.',
        additionalProperties: true,
      },
    },
    required: ['url'],
  },

  web_download: {
    description: 'Download a file from a URL and save it to a local path.',
    properties: {
      url: { type: 'string', description: 'URL to download.' },
      outputPath: {
        type: 'string',
        description: 'Local file path to save to (absolute).',
      },
    },
    required: ['url', 'outputPath'],
  },

  // ---------------------------------------------------------------------------
  // LLM tools
  // ---------------------------------------------------------------------------
  llm_query: {
    description: 'Query the configured LLM for reasoning, summarization, code generation, or general Q&A. Use for subtasks that require language understanding.',
    properties: {
      prompt: {
        type: 'string',
        description: 'The question or instruction to send to the LLM.',
      },
      systemPrompt: {
        type: 'string',
        description: 'Optional system prompt to guide the LLM response.',
      },
      temperature: {
        type: 'number',
        description: 'Sampling temperature (0–1). Default: 0.7.',
        default: 0.7,
      },
    },
    required: ['prompt'],
  },

  llm_summarize: {
    description: 'Summarize a long piece of text into key points using the LLM.',
    properties: {
      text: {
        type: 'string',
        description: 'Text to summarize.',
      },
      maxLength: {
        type: 'number',
        description: 'Target summary length in characters. Default: 500.',
        default: 500,
      },
      format: {
        type: 'string',
        description: "Output format: 'bullets', 'paragraph', or 'structured'. Default: 'bullets'.",
        enum: ['bullets', 'paragraph', 'structured'],
        default: 'bullets',
      },
    },
    required: ['text'],
  },

  llm_extract: {
    description: 'Extract structured data (as JSON) from unstructured text using the LLM.',
    properties: {
      text: {
        type: 'string',
        description: 'Source text to extract from.',
      },
      schema: {
        type: 'object',
        description: 'Optional JSON schema describing the data structure to extract.',
        additionalProperties: true,
      },
      instructions: {
        type: 'string',
        description: 'Additional extraction instructions.',
      },
    },
    required: ['text'],
  },

  llm_code: {
    description: 'Generate or modify code using the LLM.',
    properties: {
      instruction: {
        type: 'string',
        description: 'What code to generate or how to modify existing code.',
      },
      language: {
        type: 'string',
        description: "Programming language (e.g. 'javascript', 'python', 'bash'). Default: 'javascript'.",
        default: 'javascript',
      },
      existingCode: {
        type: 'string',
        description: 'Existing code to modify (optional).',
      },
      context: {
        type: 'string',
        description: 'Additional context about the codebase or requirements.',
      },
    },
    required: ['instruction'],
  },

  // ---------------------------------------------------------------------------
  // Filesystem (additional)
  // ---------------------------------------------------------------------------
  fs_organize: {
    description: 'Intelligently organize files in a directory by type into category subfolders (Images, Videos, Documents, Spreadsheets, Presentations, Code, Archives, Audio, Applications, Fonts, Others). ONLY moves files — never moves existing subdirectories. Use dryRun=true first to preview what would happen.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the directory to organize (e.g. ~/Downloads, ~/Desktop).',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true, preview the organization plan without moving any files. Default: false.',
        default: false,
      },
      othersFolder: {
        type: 'string',
        description: "Name of the catch-all folder for unrecognized file types. Default: 'Others'.",
        default: 'Others',
      },
      customRules: {
        type: 'object',
        description: 'Override or extend default extension→category mapping. E.g. {".log": "Logs", ".conf": "Config"}.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['path'],
  },

  fs_undo: {
    description: 'Restore a file to its state before the last write/edit/delete in this session. A snapshot is taken automatically before any fs_write, fs_edit, or fs_delete call.',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file to restore.' },
    },
    required: ['path'],
  },

  fs_diff: {
    description: 'Show a unified diff of a file vs its pre-modification snapshot from this session. Useful to review what the agent changed before deciding whether to keep or undo it.',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file.' },
    },
    required: ['path'],
  },

  // ---------------------------------------------------------------------------
  // Office documents
  // ---------------------------------------------------------------------------
  office_read_pdf: {
    description: `Read and extract text (and tables) from a PDF file using pdfplumber.
Returns paginated output with "--- Page N / TOTAL ---" markers for every page.

STRATEGY FOR LARGE PDFs:
1. Start with mode="overview" to see the full document structure (first ~400 chars per page, table counts).
2. Read specific sections with startPage/endPage (e.g. pages 1-10, then 11-20).
3. Use office_pdf_search to find specific terms/sections.
4. Use office_pdf_ask to ask direct questions — the AI reads the whole PDF natively.

Never read a 100-page PDF in one shot — use overview + targeted page ranges.`,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the PDF file.',
      },
      mode: {
        type: 'string',
        enum: ['full', 'overview'],
        description: '"full" (default) = complete text + tables for requested pages. "overview" = one-liner per page + table counts — fast document survey for large PDFs.',
      },
      startPage: {
        type: 'number',
        description: 'First page to read (1-indexed). Default: 1.',
      },
      endPage: {
        type: 'number',
        description: 'Last page to read. Omit to read all pages (or use with startPage for chunked reading).',
      },
      password: {
        type: 'string',
        description: 'Password for encrypted PDFs.',
      },
    },
    required: ['path'],
  },

  office_pdf_search: {
    description: `Search for terms, phrases, or keywords inside a PDF.
Returns every matching line with ±3 lines of surrounding context and the page number.
Use this to locate specific facts, names, numbers, or sections without reading everything.`,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the PDF file.',
      },
      query: {
        type: 'string',
        description: 'Text to search for (case-insensitive). Can be a word, phrase, or name.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of matching passages to return. Default: 30.',
      },
    },
    required: ['path', 'query'],
  },

  office_pdf_ask: {
    description: `Ask a specific question about a PDF and get a precise AI-generated answer.
For Anthropic and Google providers: sends the ENTIRE PDF binary directly to the AI model — it reads all text, tables, charts, and images natively. This is the BEST tool for:
- "What does the contract say about termination?"
- "Summarize the key findings from the report"
- "What are all the financial figures mentioned?"
- "Compare section 3 and section 7"

For other providers: extracts text and answers using that.
ALWAYS prefer this tool over manually reading + summarizing large PDFs.`,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the PDF file.',
      },
      question: {
        type: 'string',
        description: 'The specific question to answer about the PDF. Be precise and detailed for best results.',
      },
    },
    required: ['path', 'question'],
  },

  office_search_pdfs: {
    description: `Search for a term or phrase across ALL PDFs in a directory in a single operation.
Use this instead of calling office_pdf_search once per file — it's dramatically faster and searches across hundreds of PDFs at once.
Returns every match with file name, page number, and surrounding context.
Perfect for: "find which PDFs mention X", "search my research folder for a specific term", or "which reports discuss topic Y".`,
    properties: {
      directory: {
        type: 'string',
        description: 'Absolute path to the directory containing PDF files. Will search recursively by default.',
      },
      query: {
        type: 'string',
        description: 'The term, phrase, or keyword to search for (case-insensitive). Cross-line phrases are handled correctly.',
      },
      maxResultsPerFile: {
        type: 'number',
        description: 'Maximum matches to return per PDF file. Default: 10.',
      },
      maxFiles: {
        type: 'number',
        description: 'Maximum number of PDF files to scan. Default: 200.',
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to search subdirectories recursively. Default: true.',
      },
    },
    required: ['directory', 'query'],
  },

  office_read_docx: {
    description: `Read a Word document (.docx). Three output modes:
- "text" (default): plain text extraction — fast, good for reading content
- "html": structured HTML with headings, lists, and formatting preserved
- "structured": rich outline view using python-docx — shows heading hierarchy, paragraph styles, tables, and metadata (author, title, created/modified dates). Best mode for understanding document structure before editing.`,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the .docx file.',
      },
      format: {
        type: 'string',
        description: "Output mode: 'text' (plain text, default), 'html' (structured HTML), 'structured' (heading hierarchy + tables + metadata).",
        enum: ['text', 'html', 'structured'],
        default: 'text',
      },
    },
    required: ['path'],
  },

  office_write_docx: {
    description: `Create a Word document (.docx) from markdown-like content. Supported syntax:
- Headings: # H1, ## H2, ### H3, #### H4
- Bullet lists: - item or * item
- Numbered lists: 1. item, 2. item
- Inline formatting: **bold**, *italic*, ***bold+italic***, __underline__, \`code\`
- Tables: markdown pipe syntax | Col1 | Col2 | (first row = header with dark blue bg)
- Page break: a line with only --- or === or ***
- Plain text → Normal paragraph`,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to save the .docx file (created or overwritten).',
      },
      content: {
        type: 'string',
        description: 'Document content using the supported markdown-like syntax described above.',
      },
      title: {
        type: 'string',
        description: 'Document title stored in metadata. Defaults to the filename.',
      },
    },
    required: ['path', 'content'],
  },

  office_search_docx: {
    description: `Search for a specific term, phrase, or keyword within a single Word document (.docx).
Returns matching paragraphs with surrounding context, the section heading they appear under, and the paragraph style.
Cross-paragraph phrases are handled correctly via text normalization (unlike simple grep).
Use this to locate specific facts, clauses, names, or sections without reading the whole document.`,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the .docx file.',
      },
      query: {
        type: 'string',
        description: 'The term or phrase to search for (case-insensitive).',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum matching paragraphs to return. Default: 30.',
      },
    },
    required: ['path', 'query'],
  },

  office_search_docxs: {
    description: `Search for a term or phrase across ALL Word documents (.docx) in a directory in a single operation.
Runs one Python process — much faster than calling office_search_docx once per file.
Returns matches grouped by file with section context.
Use this for: "find which contracts mention X", "search my reports folder for a specific clause", etc.`,
    properties: {
      directory: {
        type: 'string',
        description: 'Absolute path to the directory containing .docx files. Searches recursively by default.',
      },
      query: {
        type: 'string',
        description: 'The term or phrase to search for (case-insensitive). Cross-paragraph phrases handled correctly.',
      },
      maxResultsPerFile: {
        type: 'number',
        description: 'Maximum matches per DOCX file. Default: 10.',
      },
      maxFiles: {
        type: 'number',
        description: 'Maximum number of DOCX files to scan. Default: 200.',
      },
      recursive: {
        type: 'boolean',
        description: 'Search subdirectories recursively. Default: true.',
      },
    },
    required: ['directory', 'query'],
  },

  office_analyze_xlsx: {
    description: 'Deep analysis of ALL sheets in an Excel workbook. Returns headers, data types, statistics (sum/avg/min/max/unique), sample rows, and cross-sheet references. Use this FIRST before any other Excel operation to fully understand the data.',
    properties: {
      path:       { type: 'string', description: 'Absolute path to the Excel file.' },
      sampleRows: { type: 'number', description: 'Sample rows to show per sheet. Default: 5.', default: 5 },
    },
    required: ['path'],
  },

  office_read_xlsx: {
    description: 'Read an Excel workbook (.xlsx/.xls). Returns sheet data, formulas, merged cells, column widths. Use summaryOnly=true for a fast overview of large files (headers + row count only).',
    properties: {
      path: { type: 'string', description: 'Absolute path to the Excel file.' },
      sheetName: { type: 'string', description: 'Specific sheet name to read. Omit to read all sheets.' },
      maxRows: { type: 'number', description: 'Max rows to return per sheet. Default: 500.', default: 500 },
      includeFormulas: { type: 'boolean', description: 'If true, list all cell formulas after the data. Default: false.', default: false },
      outputFormat: { type: 'string', description: "'text' (tab-separated, default) or 'json' (array of arrays).", enum: ['text', 'json'], default: 'text' },
      summaryOnly: { type: 'boolean', description: 'If true, return only headers + row count per sheet (no data). Useful for large files to understand structure first.', default: false },
    },
    required: ['path'],
  },

  office_write_xlsx: {
    description: 'EXCEL SPREADSHEETS ONLY — NOT for PowerPoint or presentations (use office_write_pptx for those). Creates or modifies .xlsx workbooks. Use sheetData for fast bulk writes. Use operations for precise control. ALWAYS use Excel formulas (=SUM, =IF, =VLOOKUP) instead of hardcoded values so spreadsheets stay dynamic. Financial color coding: set financial_type on set_cell ops (input=blue, formula=black, cross_sheet=green, external=red, assumption=yellow bg).',
    properties: {
      path: { type: 'string', description: 'Absolute path to the Excel file. Created if it does not exist.' },
      autoFormat: {
        type: 'boolean',
        description: 'When true and using sheetData, auto-applies professional styling: dark blue header row, alternating row fills, frozen header, auto-sized columns. Default: false.',
        default: false,
      },
      sheetData: {
        type: 'object',
        description: 'Bulk write: map sheet names to 2D arrays. First row = headers. Cell values starting with "=" become formulas. Example: {"Sales": [["Month","Revenue","=SUM(B2:B13)"],["Jan",5000]]}.',
        additionalProperties: true,
      },
      operations: {
        type: 'array',
        description: 'Fine-grained operations array. Each op has a "type" field. Supported types and their fields:\n• set_cell: sheet, cell (e.g."A1"), value OR formula (e.g."=SUM(B2:B10)"), financial_type ("input"|"formula"|"cross_sheet"|"external"|"assumption"), style\n• set_range: sheet, range (start cell e.g."A1"), data (2D array, "=" strings become formulas)\n• add_sheet: name, data (optional 2D array)\n• auto_sum: sheet, sourceRange, targetCell, style\n• format_range: sheet, range (e.g."A1:D10"), style {bold, italic, fontSize, fontColor (hex no#), bgColor (hex no#), numFormat, align, valign, wrapText, border}\n• freeze_panes: sheet, row (default 1), col (default 0)\n• set_column_width: sheet, col ("A"), width (number) — or cols:[{col,width}] for batch\n• set_row_height: sheet, row (number), height\n• merge_cells: sheet, range (e.g."A1:D1")\n• create_table: sheet, range (e.g."A1:E20"), tableName — styles header+data with alternating fills + auto-filter\n• auto_fit_columns: sheet — auto-sizes all columns based on content\n• add_comment: sheet, cell, comment (string)',
        items: { type: 'object', additionalProperties: true },
      },
    },
    required: ['path'],
  },

  office_chart_xlsx: {
    description: 'Embed real Excel chart objects (bar, column, line, pie, area, scatter) into a workbook. Each chart reads from a data range where the first column = categories/x-axis and remaining columns = data series. Supports multiple charts per call with auto-positioning. Always call office_analyze_xlsx first to get the correct sheet names and data ranges.',
    properties: {
      path:   { type: 'string', description: 'Absolute path to the Excel file.' },
      charts: {
        type: 'array',
        description: 'Array of chart definitions. Each chart specifies its own data source and target sheet.',
        items: {
          type: 'object',
          properties: {
            type:        { type: 'string', description: "Chart type: 'column' (default), 'bar', 'line', 'pie', 'area', 'scatter', 'stacked_column', 'stacked_bar'." },
            title:       { type: 'string', description: 'Chart title shown above the chart.' },
            dataSheet:   { type: 'string', description: 'Sheet containing the source data.' },
            dataRange:   { type: 'string', description: "Cell range with headers in row 1, e.g. 'A1:C13'. First column = categories, rest = data series." },
            targetSheet: { type: 'string', description: "Sheet where the chart is inserted. Default: 'Charts'. Created if it doesn't exist." },
            anchor:      { type: 'string', description: "Top-left cell for chart placement, e.g. 'A1'. Auto-assigned if omitted." },
            xTitle:      { type: 'string', description: 'X-axis label.' },
            yTitle:      { type: 'string', description: 'Y-axis label.' },
            width:       { type: 'number', description: 'Chart width in cm. Default: 15.' },
            height:      { type: 'number', description: 'Chart height in cm. Default: 10.' },
          },
        },
      },
    },
    required: ['path', 'charts'],
  },

  office_dashboard_xlsx: {
    description: 'Create a complete executive dashboard sheet in a workbook. Combines KPI metric cards (with value, trend arrow, change %) and embedded charts (up to 4) into a professionally styled sheet. Perfect for executive summaries and data presentations. Call office_analyze_xlsx first to get the data layout.',
    properties: {
      path:        { type: 'string', description: 'Absolute path to the Excel file (created if missing).' },
      title:       { type: 'string', description: 'Dashboard title shown at the top. Default: "Dashboard".' },
      outputSheet: { type: 'string', description: 'Name of the dashboard sheet. Default: "Dashboard".' },
      summaryText: { type: 'string', description: 'Optional narrative/executive summary text displayed below the charts.' },
      kpis: {
        type: 'array',
        description: 'Up to 4 KPI metric cards shown prominently at the top.',
        items: {
          type: 'object',
          properties: {
            label:    { type: 'string', description: 'Metric name, e.g. "Total Revenue".' },
            value:    { type: 'string', description: 'Primary value, e.g. "$2.4M" or "12,450".' },
            change:   { type: 'string', description: 'Change vs prior period, e.g. "+15%" or "-3%".' },
            trend:    { type: 'string', description: '"up", "down", or "neutral". Controls arrow direction.' },
            subtitle: { type: 'string', description: 'Small subtitle text, e.g. "vs last quarter".' },
          },
        },
      },
      charts: {
        type: 'array',
        description: 'Up to 4 charts embedded in the dashboard body.',
        items: {
          type: 'object',
          properties: {
            type:      { type: 'string', description: "Chart type: 'column', 'line', 'pie', 'area', 'bar'." },
            title:     { type: 'string', description: 'Chart title.' },
            dataSheet: { type: 'string', description: 'Sheet with source data.' },
            dataRange: { type: 'string', description: "Data range, e.g. 'A1:B13'. First col = categories." },
            width:     { type: 'number', description: 'Width in cm. Default: 14.' },
            height:    { type: 'number', description: 'Height in cm. Default: 10.' },
          },
        },
      },
    },
    required: ['path'],
  },

  office_python_dashboard: {
    description: 'Build a comprehensive professionally styled Excel dashboard (.xlsx) from any Excel or CSV file using Python (pandas + openpyxl). ALWAYS follow the skill guide workflow: (1) call office_read_xlsx or office_read_csv to analyze the data, (2) read the skill guide with fs_read on excel-dashboard.md in the skills folder, (3) design the dashboard (KPIs, charts, analysis sheets), (4) write the complete pythonScript following the template, (5) call this tool. The tool pre-injects SOURCE, OUTPUT, RESULT_PATH, write_result() — do NOT redefine them. The script must end with write_result({ok: true, sheets: [...], summary: "..."}).',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the source Excel (.xlsx, .xls) or CSV file to build the dashboard from.',
      },
      pythonScript: {
        type: 'string',
        description: 'Complete Python script following the skill guide template. Uses pandas + openpyxl. Do NOT redefine SOURCE, OUTPUT, RESULT_PATH, or write_result() — they are pre-injected by the tool. Script must end by calling write_result({"ok": true, "sheets": [...], "summary": "..."}).',
      },
      outputPath: {
        type: 'string',
        description: 'Absolute path for the output .xlsx dashboard file. Default: same directory as source with "_Dashboard.xlsx" suffix.',
      },
    },
    required: ['path', 'pythonScript'],
  },

  office_validate_dashboard: {
    description: 'Validate a built Excel dashboard against Gold Standard criteria. Runs 25 checks across structure, KPI formulas, chart references, analysis sheet formulas, and data integrity. Returns a score report with specific pass/fail details for each check. Use immediately after office_python_dashboard to catch issues before reporting to the user.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the dashboard .xlsx file to validate.',
      },
      sourcePath: {
        type: 'string',
        description: 'Optional: absolute path to the source CSV/XLSX. Used to cross-validate formula column references.',
      },
    },
    required: ['path'],
  },

  excel_vba_run: {
    description: 'Run a named VBA macro in an existing Excel workbook (.xlsm) without re-injecting VBA code. Use to refresh a dashboard after data updates or to execute any existing macro by name.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the .xlsm workbook.',
      },
      macroName: {
        type: 'string',
        description: 'Fully-qualified macro name. For a module named OD_Dashboard with sub BuildDashboard, use "OD_Dashboard.BuildDashboard". Or just "BuildDashboard" if unambiguous.',
      },
    },
    required: ['path', 'macroName'],
  },

  excel_vba_list: {
    description: 'List all VBA modules and public Sub/Function names in an Excel workbook. Use to discover existing macros before calling excel_vba_run.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the .xlsm (or .xlsx) workbook to inspect.',
      },
    },
    required: ['path'],
  },

  office_read_pptx: {
    description: 'Read a PowerPoint presentation (.pptx) and extract all slide content: titles, body text, text boxes, and speaker notes. Returns slide-by-slide breakdown.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the .pptx file.',
      },
      includeNotes: {
        type: 'boolean',
        description: 'If true, include speaker notes for each slide. Default: true.',
        default: true,
      },
      slideRange: {
        type: 'string',
        description: "Optional slide range to read (e.g. '1-10', '5-15'). Defaults to all slides.",
      },
    },
    required: ['path'],
  },

  office_write_pptx: {
    description: `POWERPOINT PRESENTATIONS ONLY — NOT for Excel/spreadsheets (use office_write_xlsx for data/tables).

MANDATORY QUALITY RULES — violating any of these produces a bad presentation:

1. TALKING HEADERS: Every slide title MUST be a complete sentence that conveys the key insight.
   BAD: "Market Overview"  |  GOOD: "The Global AI Market Will Reach $1.8T by 2030"
   BAD: "Key Findings"     |  GOOD: "Three Structural Shifts Are Redefining the Industry"
   BAD: "Introduction"     |  GOOD: "AI Is No Longer Optional — It's a Competitive Necessity"

2. SLIDE COUNT: Generate EXACTLY the number of slides requested. If asked for 5, build 5.

3. CONTENT DENSITY: Content slides need 4–6 bullet points minimum. Sub-bullets add depth.
   Each bullet should be a meaningful statement, not a one-word label.

4. REQUIRED STRUCTURE:
   - Slide 1: layout="title" (cover with title + subtitle)
   - Middle slides: layout="content" / "two-column" / "table" / "section" as appropriate
   - Use layout="section" as visual chapter dividers in longer decks (5+ slides)
   - Use layout="two-column" for comparisons, before/after, pros/cons
   - Use layout="table" for structured data (3+ rows, 2+ columns)
   - Last slide: layout="title" (closing / thank you)

5. SPEAKER NOTES: Add notes to every slide with talking points the presenter should cover.

6. PLANNING: Before building the slides array, mentally outline every slide — topic, insight, 4–6 supporting points. Never generate a slide with only 1–2 bullets.`,

    properties: {
      path: {
        type: 'string',
        description: 'Absolute output path for the .pptx file (e.g. /Users/name/Desktop/deck.pptx).',
      },
      title: {
        type: 'string',
        description: 'Presentation title (document metadata).',
      },
      slides: {
        type: 'array',
        description: 'Fully-planned slides array. Each slide must follow the quality rules in the tool description.',
        items: {
          type: 'object',
          properties: {
            layout: {
              type: 'string',
              enum: ['title', 'content', 'two-column', 'table', 'section'],
              description: '"title" = cover/closing. "content" = bullet list (4–6 items). "two-column" = left/right comparison. "table" = data grid. "section" = visual chapter divider.',
            },
            title: {
              type: 'string',
              description: 'TALKING HEADER — a complete sentence conveying the key insight of this slide. Not a noun label.',
            },
            subtitle: {
              type: 'string',
              description: 'Supporting line under the title (title and section layouts only). E.g. presenter name, date, or section descriptor.',
            },
            content: {
              type: 'array',
              items: { type: 'string' },
              description: 'Bullet points for content layout. Minimum 4, ideally 5–6. Each bullet is a meaningful statement. Prefix with two spaces to indent as a sub-bullet: "  Supporting detail here".',
            },
            leftContent: {
              type: 'array',
              items: { type: 'string' },
              description: 'Left column bullets (two-column layout). 3–5 items.',
            },
            rightContent: {
              type: 'array',
              items: { type: 'string' },
              description: 'Right column bullets (two-column layout). 3–5 items.',
            },
            tableData: {
              type: 'array',
              items: { type: 'array', items: { type: 'string' } },
              description: '2D array for table layout. First row = headers. Minimum 3 data rows for a useful table.',
            },
            notes: {
              type: 'string',
              description: 'Speaker notes — talking points the presenter covers on this slide. Always include.',
            },
          },
        },
      },
      templatePath: {
        type: 'string',
        description: 'Path to an existing .pptx to extract its color palette from. Ask the user if they have one before generating.',
      },
      theme: {
        type: 'string',
        enum: ['professional', 'dark', 'minimal', 'vibrant'],
        description: 'Built-in theme when no templatePath given. "professional"=navy/white (default), "dark"=slate/charcoal, "minimal"=black/white, "vibrant"=purple/white.',
        default: 'professional',
      },
      author: { type: 'string', description: 'Author name in file metadata.' },
    },
    required: ['path', 'slides'],
  },

  // ---------------------------------------------------------------------------
  // PPT Master — Premium Presentation Builder (32 slide types, 14 themes)
  // ---------------------------------------------------------------------------

  pptx_list_themes: {
    description: 'List all 14 available presentation themes with industry, UX style, colors, fonts, and descriptions. Use to help the user choose a theme before building a presentation.',
    properties: {},
    required: [],
  },

  pptx_list_slide_types: {
    description: 'List all 32 selectable slide types with descriptions and required content keys. Reference this to understand what JSON content each slide type needs.',
    properties: {},
    required: [],
  },

  pptx_generate_content: {
    description: 'Use Python-side LLM to generate presentation content JSON from a topic. Alternative to the agent generating content directly — requires an API key forwarded to the Python process.',
    properties: {
      topic: {
        type: 'string',
        description: 'Main topic or title for the presentation (e.g. "Q4 2025 Financial Review for Acme Corp").',
      },
      company_name: {
        type: 'string',
        description: 'Company name. Default: "Acme Corp".',
      },
      industry: {
        type: 'string',
        description: 'Industry context (e.g. "Technology", "Healthcare"). Helps guide content tone.',
      },
      audience: {
        type: 'string',
        description: 'Target audience (e.g. "Board of Directors", "Investors", "Engineering team").',
      },
      additional_context: {
        type: 'string',
        description: 'Extra context, data points, or instructions for content generation.',
      },
      provider: {
        type: 'string',
        description: 'LLM provider for content generation: minimax, openai, anthropic, google. Default: minimax.',
      },
      api_key: {
        type: 'string',
        description: 'API key for the LLM provider.',
      },
    },
    required: ['topic'],
  },

  pptx_build: {
    description: `Build a professional PPTX file from content JSON using PPT Master engine. Supports 32 slide types, 14 industry themes, 144 icons, and 14 UX styles.

WORKFLOW — the agent should:
1. Read the skill guide: fs_read the presentation-builder.md skill file
2. Use pptx_list_themes to help the user pick a theme (or auto-select by industry)
3. Select appropriate slide types from the 32 available (use pptx_list_slide_types for reference)
4. Generate a content_json object following the schema (selected_slides + sections + content)
5. Call pptx_build with that JSON

ALWAYS-INCLUDED SLIDES (do NOT list in selected_slides):
- cover: provide cover_title, cover_subtitle, cover_date in content
- toc: auto-generated from sections
- section_divider: auto-inserted before each section
- thank_you: provide thankyou_contacts in content

CRITICAL RULES:
- pie_values MUST sum to 100
- Chart series values must match category count
- kpis/progress/gauges: floats must be 0.0-1.0
- No truncation with "..." — complete sentences only`,
    properties: {
      content_json: {
        type: 'object',
        description: `The presentation content. Structure:
{
  "selected_slides": ["executive_summary", "bar_chart", "next_steps"],
  "sections": [{"title": "Overview", "slides": ["executive_summary"]}, {"title": "Analysis", "slides": ["bar_chart"]}, {"title": "Actions", "slides": ["next_steps"]}],
  "content": {
    "cover_title": "Presentation Title", "cover_subtitle": "Subtitle", "cover_date": "March 2026",
    "exec_title": "Executive Summary", "exec_bullets": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"], "exec_metrics": [["$100M", "Revenue"], ["25%", "Growth"], ["500", "Customers"]],
    "bar_title": "Revenue", "bar_categories": ["Q1","Q2","Q3","Q4"], "bar_series": [{"name":"2025","values":[10,20,30,40]}],
    "next_steps_title": "Next Steps", "next_steps": [["Action","Desc","Owner","Due"], ["Action2","Desc2","Owner2","Due2"], ["Action3","Desc3","Owner3","Due3"], ["Action4","Desc4","Owner4","Due4"]],
    "thankyou_contacts": [["Email","contact@co.com"],["Phone","555-1234"],["Web","company.com"]]
  }
}
Each slide type has specific content keys — call pptx_list_slide_types for the full reference. Always include cover_title, cover_subtitle, cover_date, and thankyou_contacts. Sections are optional (auto-created if omitted).`,
      },
      theme_key: {
        type: 'string',
        description: 'Theme key from pptx_list_themes (e.g. "corporate", "technology", "finance"). Default: "corporate".',
        default: 'corporate',
      },
      company_name: {
        type: 'string',
        description: 'Company name shown on cover and footer. Default: "Acme Corp".',
      },
      output_path: {
        type: 'string',
        description: 'Absolute path for the output .pptx file. Default: ~/Desktop/presentation.pptx.',
      },
    },
    required: ['content_json'],
  },

  pptx_ai_build: {
    description: 'Build a professional presentation end-to-end. The AI engine selects 10-15 optimal slides from 32 types, generates all content, and renders a polished PPTX with charts, KPIs, diagrams, and more. ALWAYS use this for ANY presentation request. Pass research findings or file data via additional_context.',
    properties: {
      topic: {
        type: 'string',
        description: 'What the presentation is about. Be descriptive — e.g. "FY25 Annual Report of The Home Depot" or "Series B Pitch Deck for AI Startup NexTech".',
      },
      company_name: {
        type: 'string',
        description: 'Company name shown on cover and throughout. Default: "Acme Corp".',
      },
      theme_key: {
        type: 'string',
        description: 'Visual theme: corporate, healthcare, technology, finance, education, sustainability, luxury, startup, government, realestate, creative, academic, research, report. Default: "corporate".',
      },
      industry: {
        type: 'string',
        description: 'Industry context to guide content tone (e.g. "Retail", "Technology", "Healthcare").',
      },
      audience: {
        type: 'string',
        description: 'Target audience (e.g. "Board of Directors", "Investors", "Engineering Team").',
      },
      additional_context: {
        type: 'string',
        description: 'IMPORTANT: Pass ALL gathered context here — research findings from web_search/web_fetch, file contents from office_read_*/fs_read, data summaries, specific numbers, or any instructions. The AI engine weaves this into the slides. The more context you provide, the better the presentation.',
      },
      output_path: {
        type: 'string',
        description: 'Absolute path for the output .pptx file. Default: ~/Desktop/presentation.pptx.',
      },
    },
    required: ['topic'],
  },

  // ── Presentation Edit Tools ────────────────────────────────────────

  pptx_edit_get_state: {
    description: 'Show the current structure of an iteratively-edited presentation: sections, slide types, theme, and metadata. Call this first when the user wants to edit an existing presentation.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file (returned by pptx_ai_build or pptx_build).',
      },
    },
    required: ['session_path'],
  },

  pptx_edit_add_slide: {
    description: 'Add a new slide to an existing presentation. The AI generates content for it automatically. Use pptx_list_slide_types to see available types.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file.',
      },
      slide_type: {
        type: 'string',
        description: 'Slide type to add — e.g. "swot_matrix", "bar_chart", "kpi_dashboard". Must be one of the 32 valid types.',
      },
      after: {
        type: 'string',
        description: 'Insert after this slide type. If omitted, appends to the end.',
      },
      section_title: {
        type: 'string',
        description: 'Place in this section (by title). If omitted, uses the section containing "after" or the last section.',
      },
      instruction: {
        type: 'string',
        description: 'Optional instruction to guide content generation — e.g. "Focus on Q4 metrics" or "Compare with competitor X".',
      },
    },
    required: ['session_path', 'slide_type'],
  },

  pptx_edit_remove_slide: {
    description: 'Remove a slide type from an existing presentation.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file.',
      },
      slide_type: {
        type: 'string',
        description: 'Slide type to remove — e.g. "team_leadership", "sources".',
      },
    },
    required: ['session_path', 'slide_type'],
  },

  pptx_edit_move_slide: {
    description: 'Move a slide to a different position in the presentation.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file.',
      },
      slide_type: {
        type: 'string',
        description: 'Slide type to move.',
      },
      after: {
        type: 'string',
        description: 'Move after this slide type. Omit or set to null to move to the front.',
      },
    },
    required: ['session_path', 'slide_type'],
  },

  pptx_edit_update_content: {
    description: 'Update specific content fields for a slide without regenerating everything. Pass the exact content keys and new values.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file.',
      },
      slide_type: {
        type: 'string',
        description: 'Slide type whose content to update (for context in the status message).',
      },
      updates: {
        type: 'object',
        description: 'JSON object of content key-value pairs to update. Keys must match the slide type content keys from pptx_list_slide_types. Example: {"exec_title": "New Title", "exec_bullets": ["bullet 1", "bullet 2"]}.',
      },
    },
    required: ['session_path', 'slide_type', 'updates'],
  },

  pptx_edit_regenerate: {
    description: 'Regenerate content for a specific slide using LLM. The existing content is replaced with freshly generated content. Optionally pass an instruction to guide the output.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file.',
      },
      slide_type: {
        type: 'string',
        description: 'Slide type to regenerate — e.g. "executive_summary", "kpi_dashboard".',
      },
      instruction: {
        type: 'string',
        description: 'Optional instruction to guide regeneration — e.g. "Make it more data-driven" or "Focus on sustainability".',
      },
    },
    required: ['session_path', 'slide_type'],
  },

  pptx_edit_set_theme: {
    description: 'Change the visual theme of an existing presentation. The presentation is rebuilt with the new theme applied to all slides.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file.',
      },
      theme_key: {
        type: 'string',
        description: 'New theme key: corporate, healthcare, technology, finance, education, sustainability, luxury, startup, government, realestate, creative, academic, research, report.',
      },
    },
    required: ['session_path', 'theme_key'],
  },

  pptx_edit_rebuild: {
    description: 'Force rebuild the presentation PPTX from current session state. Use after making manual changes to the session file or to refresh the output.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file.',
      },
    },
    required: ['session_path'],
  },

  pptx_edit_rename_section: {
    description: 'Rename a section in the presentation. The section divider slide title will update on rebuild.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file.',
      },
      old_title: {
        type: 'string',
        description: 'Current section title (case-insensitive match).',
      },
      new_title: {
        type: 'string',
        description: 'New section title.',
      },
    },
    required: ['session_path', 'old_title', 'new_title'],
  },

  pptx_edit_add_section: {
    description: 'Add a new empty section to the presentation. You can then add slides to it with pptx_edit_add_slide using the section_title parameter.',
    properties: {
      session_path: {
        type: 'string',
        description: 'Absolute path to the .session.json file.',
      },
      title: {
        type: 'string',
        description: 'Section title.',
      },
      subtitle: {
        type: 'string',
        description: 'Optional section subtitle.',
      },
    },
    required: ['session_path', 'title'],
  },

  office_read_csv: {
    description: 'Read and parse a CSV or TSV file. Returns column headers, row count, and data. Supports auto-detecting delimiter. Use startRow/endRow for pagination.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the CSV or TSV file.',
      },
      delimiter: {
        type: 'string',
        description: "Field delimiter. Default: auto-detect (usually ',' for CSV, '\\t' for TSV).",
      },
      hasHeader: {
        type: 'boolean',
        description: 'Whether the first row is a header row. Default: true.',
        default: true,
      },
      startRow: {
        type: 'number',
        description: 'First data row to return (1-indexed, after header). Default: 1.',
        default: 1,
      },
      endRow: {
        type: 'number',
        description: 'Last data row to return. Default: 200.',
        default: 200,
      },
      outputFormat: {
        type: 'string',
        description: "Output format: 'text' (default) or 'json' (array of objects with headers as keys).",
        enum: ['text', 'json'],
        default: 'text',
      },
    },
    required: ['path'],
  },

  office_write_csv: {
    description: 'Write data to a CSV file. Pass rows as a 2D array where the first row is headers. Use append=true to add rows to an existing file.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the CSV file to write.',
      },
      rows: {
        type: 'array',
        description: '2D array of data. First row should be headers. Example: [["Name","Age"],["Alice",30],["Bob",25]].',
        items: { type: 'array', items: { type: 'string' } },
      },
      delimiter: {
        type: 'string',
        description: "Field delimiter. Default: ',' (comma).",
        default: ',',
      },
      append: {
        type: 'boolean',
        description: 'If true, append rows to existing file instead of overwriting. Default: false.',
        default: false,
      },
    },
    required: ['path', 'rows'],
  },

  office_csv_to_xlsx: {
    description: 'Convert an entire CSV file directly to an Excel (.xlsx) workbook — reads ALL rows, no LLM context limit. Use this instead of office_read_csv + office_write_xlsx for any CSV with more than a few hundred rows.',
    properties: {
      source: {
        type: 'string',
        description: 'Absolute path to the source CSV file.',
      },
      output: {
        type: 'string',
        description: 'Absolute path for the output .xlsx file.',
      },
      sheetName: {
        type: 'string',
        description: "Name for the worksheet. Default: 'Data'.",
        default: 'Data',
      },
      autoFormat: {
        type: 'boolean',
        description: 'Apply header styling, alternating row colors, frozen header row, and auto-sized columns. Default: true.',
        default: true,
      },
      delimiter: {
        type: 'string',
        description: "CSV field delimiter. Auto-detected if omitted (comma or tab).",
      },
    },
    required: ['source', 'output'],
  },

  // ---------------------------------------------------------------------------
  // Connector tools (Google Drive, Gmail, Calendar)
  // ---------------------------------------------------------------------------

  connector_drive_search: {
    description: "Search Google Drive files by name, type, or query. Requires Google Drive connection.",
    properties: {
      query: {
        type: 'string',
        description: "Drive search query (e.g. \"name contains 'report'\", \"mimeType='application/pdf'\").",
      },
      maxResults: {
        type: 'number',
        description: 'Maximum results to return. Default: 10.',
        default: 10,
      },
    },
    required: ['query'],
  },

  connector_drive_read: {
    description: "Read the text content of a Google Drive file by its file ID.",
    properties: {
      fileId: {
        type: 'string',
        description: 'Google Drive file ID (from connector_drive_search results).',
      },
      mimeType: {
        type: 'string',
        description: 'MIME type of the file (optional; helps determine export format).',
      },
    },
    required: ['fileId'],
  },

  connector_gmail_search: {
    description: "Search Gmail emails by query. Requires Gmail connection.",
    properties: {
      query: {
        type: 'string',
        description: "Gmail search query (e.g. \"from:boss@example.com\", \"subject:invoice\", \"is:unread\").",
      },
      maxResults: {
        type: 'number',
        description: 'Maximum results to return. Default: 10.',
        default: 10,
      },
    },
    required: ['query'],
  },

  connector_gmail_read: {
    description: "Read the full content of a Gmail email by message ID.",
    properties: {
      messageId: {
        type: 'string',
        description: 'Gmail message ID (from connector_gmail_search results).',
      },
    },
    required: ['messageId'],
  },

  connector_calendar_events: {
    description: "List upcoming Google Calendar events within a date range. Requires Google Calendar connection.",
    properties: {
      timeMin: {
        type: 'string',
        description: 'Start of date range in ISO 8601 format (e.g. "2026-02-23T00:00:00Z"). Defaults to now.',
      },
      timeMax: {
        type: 'string',
        description: 'End of date range in ISO 8601 format. Defaults to 7 days from now.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum events to return. Default: 10.',
        default: 10,
      },
    },
    required: [],
  },
  // ---------------------------------------------------------------------------
  // Browser tab management
  // ---------------------------------------------------------------------------

  tabs_list: {
    description: 'List all open tabs across one or more browsers (Chrome, Safari, Firefox, Brave, Edge, Arc). Returns each tab\'s browser, window index, tab index, title, URL, and active state. Use windowIndex and tabIndex values with other tabs_* tools.',
    properties: {
      browser: {
        type: 'string',
        enum: ['all', 'chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera'],
        description: 'Which browser(s) to list tabs from. Default: "all" (all running browsers).',
        default: 'all',
      },
    },
    required: [],
  },

  tabs_navigate: {
    description: 'Navigate an existing browser tab to a URL, or open a new tab in a currently running browser. Use this instead of browser_navigate, app_open, or system_exec open when the user wants to work with their existing Chrome/Safari/Firefox session — it does NOT open a new browser window.',
    properties: {
      browser: {
        type: 'string',
        enum: ['chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera'],
        description: 'Which browser to navigate.',
      },
      url: {
        type: 'string',
        description: 'URL to navigate to. If no protocol is specified, https:// is assumed.',
      },
      windowIndex: {
        type: 'number',
        description: 'Window number from tabs_list. Omit (or set newTab=true) to open a new tab.',
      },
      tabIndex: {
        type: 'number',
        description: 'Tab number from tabs_list. Omit (or set newTab=true) to open a new tab.',
      },
      newTab: {
        type: 'boolean',
        description: 'If true, open a new tab in the existing browser window instead of navigating the current tab. Default: false.',
        default: false,
      },
    },
    required: ['browser', 'url'],
  },

  tabs_close: {
    description: 'Close one or more browser tabs. Three modes: (1) specific tab by browser+windowIndex+tabIndex, (2) all tabs matching a URL/title regex pattern, (3) duplicatesOnly=true to remove all duplicate URLs keeping one.',
    properties: {
      browser: {
        type: 'string',
        enum: ['chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera'],
        description: 'Browser to target. Required when closing a specific tab or when using urlPattern with a specific browser.',
      },
      windowIndex: {
        type: 'number',
        description: 'Window number (from tabs_list). Required with tabIndex for closing a specific tab.',
      },
      tabIndex: {
        type: 'number',
        description: 'Tab number within the window (from tabs_list). Required with windowIndex for closing a specific tab.',
      },
      urlPattern: {
        type: 'string',
        description: 'Regular expression to match against tab URLs and titles. Closes all matching tabs across all (or the specified) browser.',
      },
      duplicatesOnly: {
        type: 'boolean',
        description: 'If true, close all duplicate tabs (same URL), keeping one copy of each. Applies across all browsers if browser is not specified.',
        default: false,
      },
    },
    required: [],
  },

  tabs_read: {
    description: 'Read the visible text content of a browser tab — strips navigation, ads, and scripts, returning only the readable page text. Use tabs_list first to get windowIndex and tabIndex.',
    properties: {
      browser: {
        type: 'string',
        enum: ['chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera'],
        description: 'Browser containing the tab.',
      },
      windowIndex: {
        type: 'number',
        description: 'Window number (from tabs_list).',
      },
      tabIndex: {
        type: 'number',
        description: 'Tab number within the window (from tabs_list).',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum characters to return. Default: 15000.',
        default: 15000,
      },
    },
    required: ['browser', 'windowIndex', 'tabIndex'],
  },

  tabs_focus: {
    description: 'Switch to and activate a specific browser tab, bringing it to the foreground.',
    properties: {
      browser: {
        type: 'string',
        enum: ['chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera'],
        description: 'Browser containing the tab.',
      },
      windowIndex: {
        type: 'number',
        description: 'Window number (from tabs_list).',
      },
      tabIndex: {
        type: 'number',
        description: 'Tab number within the window (from tabs_list).',
      },
    },
    required: ['browser', 'windowIndex', 'tabIndex'],
  },

  tabs_find_duplicates: {
    description: 'Analyze all open browser tabs to find exact duplicates (identical URL), near-duplicates (same URL ignoring hash/query), and tabs from the same domain. Also reports browser memory usage. Use this before tabs_close to identify what to clean up.',
    properties: {
      browser: {
        type: 'string',
        enum: ['all', 'chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera'],
        description: 'Which browser(s) to analyze. Default: "all".',
        default: 'all',
      },
    },
    required: [],
  },

  tabs_find_forms: {
    description: 'Detect all fillable input fields on a browser tab\'s current page. Returns field type, name, id, label, placeholder, current value (redacted for sensitive fields like passwords), required status, and select options. Use this before tabs_fill_form to see what fields are available.',
    properties: {
      browser: {
        type: 'string',
        enum: ['chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera'],
        description: 'Browser containing the tab.',
      },
      windowIndex: {
        type: 'number',
        description: 'Window number (from tabs_list).',
      },
      tabIndex: {
        type: 'number',
        description: 'Tab number within the window (from tabs_list).',
      },
    },
    required: ['browser', 'windowIndex', 'tabIndex'],
  },

  tabs_fill_form: {
    description: 'Fill form fields on a browser tab. Uses native value setters so it works with React, Vue, and Angular (fires input/change/blur events). Provide fields as an object mapping field name, id, or label text to value. For sensitive fields (password, CVV), ask the user for the value before calling this tool.',
    properties: {
      browser: {
        type: 'string',
        enum: ['chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera'],
        description: 'Browser containing the tab.',
      },
      windowIndex: {
        type: 'number',
        description: 'Window number (from tabs_list).',
      },
      tabIndex: {
        type: 'number',
        description: 'Tab number within the window (from tabs_list).',
      },
      fields: {
        type: 'object',
        description: 'Map of field identifier → value. Keys can be the field\'s name attribute, id attribute, or label text (case-insensitive). Example: {"email": "user@example.com", "First Name": "John", "city": "New York"}.',
        additionalProperties: { type: 'string' },
      },
      submit: {
        type: 'boolean',
        description: 'If true, click the submit button (or call form.submit()) after filling all fields. Default: false — always confirm with the user before submitting.',
        default: false,
      },
    },
    required: ['browser', 'windowIndex', 'tabIndex', 'fields'],
  },

  tabs_run_js: {
    description: 'Execute arbitrary JavaScript in a browser tab and return the result. The return value is JSON-serialized if it\'s an object/array. Use for custom page interactions not covered by other tabs_* tools.',
    properties: {
      browser: {
        type: 'string',
        enum: ['chrome', 'safari', 'firefox', 'brave', 'edge', 'arc', 'opera'],
        description: 'Browser containing the tab.',
      },
      windowIndex: {
        type: 'number',
        description: 'Window number (from tabs_list).',
      },
      tabIndex: {
        type: 'number',
        description: 'Tab number within the window (from tabs_list).',
      },
      code: {
        type: 'string',
        description: 'JavaScript code to execute in the tab\'s page context. Can be a single expression or a multi-line function body. The last expression is returned.',
      },
    },
    required: ['browser', 'windowIndex', 'tabIndex', 'code'],
  },
  // Reminder tools
  reminder_set: {
    description: 'Schedule a native OS notification reminder at a specific time. Use ISO 8601 format for "at" when possible (e.g. "2026-02-26T20:00:00"), or natural language like "in 30 minutes", "8pm", "tomorrow at 9am".',
    properties: {
      message: { type: 'string', description: 'The reminder message to display in the notification.' },
      at: {
        type: 'string',
        description: 'When to fire the reminder. Prefer ISO 8601 (e.g. "2026-02-26T20:00:00"). Also accepts: "in 30 minutes", "in 2 hours", "8pm", "8:30am", "tomorrow at 9am", "friday at 6pm", "noon", "midnight".',
      },
    },
    required: ['message', 'at'],
  },

  reminder_list: {
    description: 'List reminders. status="pending" (default) shows upcoming reminders; status="all" shows all including fired and cancelled.',
    properties: {
      status: {
        type: 'string',
        description: '"pending" (default) or "all".',
        enum: ['pending', 'all'],
      },
    },
    required: [],
  },

  reminder_cancel: {
    description: 'Cancel a pending reminder by its ID. Use reminder_list to find IDs.',
    properties: {
      id: { type: 'string', description: 'The reminder ID to cancel (e.g. "rem_1234567_abc12").' },
    },
    required: ['id'],
  },

  // ---------------------------------------------------------------------------
  // Database
  // ---------------------------------------------------------------------------
  db_list_connections: {
    description: 'List all configured database connections (SQLite, PostgreSQL, MySQL).',
    properties: {},
    required: [],
  },
  db_add_connection: {
    description: 'Add a new database connection. Supports SQLite, PostgreSQL, MySQL.',
    properties: {
      name:     { type: 'string', description: 'Friendly name for this connection.' },
      type:     { type: 'string', description: 'Database type: sqlite, postgres, or mysql.', enum: ['sqlite', 'postgres', 'mysql'] },
      database: { type: 'string', description: 'Database name or file path (for SQLite).' },
      host:     { type: 'string', description: 'Hostname (PostgreSQL/MySQL only).' },
      port:     { type: 'number', description: 'Port number (default: 5432 for PG, 3306 for MySQL).' },
      user:     { type: 'string', description: 'Database username.' },
      password: { type: 'string', description: 'Database password (stored securely).' },
      ssl:      { type: 'boolean', description: 'Enable SSL/TLS.' },
    },
    required: ['name', 'type', 'database'],
  },
  db_test_connection: {
    description: 'Test a database connection.',
    properties: {
      connectionId: { type: 'string', description: 'Connection ID or name.' },
    },
    required: ['connectionId'],
  },
  db_schema: {
    description: 'List all tables and views in a database.',
    properties: {
      connectionId: { type: 'string', description: 'Connection ID or name.' },
    },
    required: ['connectionId'],
  },
  db_describe: {
    description: 'Describe the columns of a specific table.',
    properties: {
      connectionId: { type: 'string', description: 'Connection ID or name.' },
      table:        { type: 'string', description: 'Table name to describe.' },
    },
    required: ['connectionId', 'table'],
  },
  db_query: {
    description: 'Execute a SQL query. SELECT returns rows; INSERT/UPDATE/DELETE returns affected rows count.',
    properties: {
      connectionId: { type: 'string', description: 'Connection ID or name.' },
      query:        { type: 'string', description: 'SQL query to execute.' },
      maxRows:      { type: 'number', description: 'Maximum rows to return (default: 100, max: 1000).' },
    },
    required: ['connectionId', 'query'],
  },

  // ---------------------------------------------------------------------------
  // GitHub
  // ---------------------------------------------------------------------------
  github_list_repos: {
    description: 'List GitHub repositories for a user or org.',
    properties: {
      owner: { type: 'string', description: 'GitHub username or org name.' },
      type:  { type: 'string', description: 'all, owner, member. Default: all.' },
      sort:  { type: 'string', description: 'Sort by: created, updated, pushed, full_name. Default: updated.' },
      limit: { type: 'number', description: 'Max repos to return (default: 30).' },
    },
    required: ['owner'],
  },
  github_list_issues: {
    description: 'List issues for a GitHub repository.',
    properties: {
      owner: { type: 'string', description: 'Repository owner.' },
      repo:  { type: 'string', description: 'Repository name.' },
      state: { type: 'string', description: 'open, closed, or all. Default: open.' },
      label: { type: 'string', description: 'Filter by label name.' },
      limit: { type: 'number', description: 'Max issues to return (default: 20).' },
    },
    required: ['owner', 'repo'],
  },
  github_create_issue: {
    description: 'Create a new GitHub issue.',
    properties: {
      owner:     { type: 'string', description: 'Repository owner.' },
      repo:      { type: 'string', description: 'Repository name.' },
      title:     { type: 'string', description: 'Issue title.' },
      body:      { type: 'string', description: 'Issue body (markdown).' },
      labels:    { type: 'array',  description: 'Array of label names.', items: { type: 'string' } },
      assignees: { type: 'array',  description: 'Array of usernames to assign.', items: { type: 'string' } },
    },
    required: ['owner', 'repo', 'title'],
  },
  github_list_prs: {
    description: 'List pull requests for a GitHub repository.',
    properties: {
      owner: { type: 'string', description: 'Repository owner.' },
      repo:  { type: 'string', description: 'Repository name.' },
      state: { type: 'string', description: 'open, closed, or all. Default: open.' },
      limit: { type: 'number', description: 'Max PRs to return (default: 20).' },
    },
    required: ['owner', 'repo'],
  },
  github_create_pr: {
    description: 'Create a pull request.',
    properties: {
      owner: { type: 'string', description: 'Repository owner.' },
      repo:  { type: 'string', description: 'Repository name.' },
      title: { type: 'string', description: 'PR title.' },
      head:  { type: 'string', description: 'Branch with changes.' },
      base:  { type: 'string', description: 'Target branch (e.g. main).' },
      body:  { type: 'string', description: 'PR description.' },
      draft: { type: 'boolean', description: 'Create as draft PR.' },
    },
    required: ['owner', 'repo', 'title', 'head', 'base'],
  },
  github_get_file: {
    description: 'Get file contents from a GitHub repository.',
    properties: {
      owner:    { type: 'string', description: 'Repository owner.' },
      repo:     { type: 'string', description: 'Repository name.' },
      filePath: { type: 'string', description: 'Path to file in repo (e.g. src/index.js).' },
      ref:      { type: 'string', description: 'Branch, tag, or commit SHA.' },
    },
    required: ['owner', 'repo', 'filePath'],
  },
  github_search_code: {
    description: 'Search for code on GitHub.',
    properties: {
      query: { type: 'string', description: 'Search query (supports GitHub code search syntax).' },
      limit: { type: 'number', description: 'Max results (default: 10).' },
    },
    required: ['query'],
  },
  github_comment: {
    description: 'Add a comment to a GitHub issue or PR.',
    properties: {
      owner:       { type: 'string', description: 'Repository owner.' },
      repo:        { type: 'string', description: 'Repository name.' },
      issueNumber: { type: 'number', description: 'Issue or PR number.' },
      body:        { type: 'string', description: 'Comment text (markdown).' },
    },
    required: ['owner', 'repo', 'issueNumber', 'body'],
  },

  // ---------------------------------------------------------------------------
  // Jira
  // ---------------------------------------------------------------------------
  jira_search: {
    description: 'Search Jira issues using JQL (Jira Query Language).',
    properties: {
      jql:        { type: 'string', description: 'JQL query (e.g. "project = ENG AND status = Open").' },
      maxResults: { type: 'number', description: 'Max results (default: 20).' },
    },
    required: ['jql'],
  },
  jira_get_issue: {
    description: 'Get details of a specific Jira issue.',
    properties: {
      issueKey: { type: 'string', description: 'Issue key (e.g. ENG-123).' },
    },
    required: ['issueKey'],
  },
  jira_create_issue: {
    description: 'Create a new Jira issue.',
    properties: {
      projectKey:  { type: 'string', description: 'Jira project key (e.g. ENG).' },
      summary:     { type: 'string', description: 'Issue summary/title.' },
      issueType:   { type: 'string', description: 'Issue type: Task, Bug, Story, Epic. Default: Task.' },
      description: { type: 'string', description: 'Issue description.' },
      priority:    { type: 'string', description: 'Priority: Highest, High, Medium, Low, Lowest.' },
    },
    required: ['projectKey', 'summary'],
  },
  jira_update_status: {
    description: 'Transition a Jira issue to a new status.',
    properties: {
      issueKey: { type: 'string', description: 'Issue key (e.g. ENG-123).' },
      status:   { type: 'string', description: 'Target status name (e.g. "In Progress", "Done").' },
    },
    required: ['issueKey', 'status'],
  },
  jira_add_comment: {
    description: 'Add a comment to a Jira issue.',
    properties: {
      issueKey: { type: 'string', description: 'Issue key (e.g. ENG-123).' },
      body:     { type: 'string', description: 'Comment text.' },
    },
    required: ['issueKey', 'body'],
  },

  // ---------------------------------------------------------------------------
  // Linear
  // ---------------------------------------------------------------------------
  linear_list_issues: {
    description: 'List Linear issues.',
    properties: {
      teamId: { type: 'string', description: 'Team ID to filter by.' },
      state:  { type: 'string', description: 'State name to filter by (e.g. "In Progress").' },
      limit:  { type: 'number', description: 'Max results (default: 20).' },
    },
    required: [],
  },
  linear_create_issue: {
    description: 'Create a new Linear issue.',
    properties: {
      teamId:      { type: 'string', description: 'Team ID (required).' },
      title:       { type: 'string', description: 'Issue title.' },
      description: { type: 'string', description: 'Issue description (markdown).' },
      priority:    { type: 'number', description: 'Priority: 0=No, 1=Urgent, 2=High, 3=Medium, 4=Low.' },
    },
    required: ['teamId', 'title'],
  },
  linear_update_issue: {
    description: 'Update a Linear issue.',
    properties: {
      issueId:     { type: 'string', description: 'Issue ID.' },
      title:       { type: 'string', description: 'New title.' },
      description: { type: 'string', description: 'New description.' },
      priority:    { type: 'number', description: 'New priority.' },
      stateId:     { type: 'string', description: 'New workflow state ID.' },
    },
    required: ['issueId'],
  },

  // ---------------------------------------------------------------------------
  // Notion
  // ---------------------------------------------------------------------------
  notion_search: {
    description: 'Search Notion pages and databases.',
    properties: {
      query: { type: 'string', description: 'Search query.' },
      limit: { type: 'number', description: 'Max results (default: 10).' },
    },
    required: ['query'],
  },
  notion_read_page: {
    description: 'Read the content blocks of a Notion page.',
    properties: {
      pageId: { type: 'string', description: 'Notion page ID.' },
    },
    required: ['pageId'],
  },
  notion_create_page: {
    description: 'Create a new Notion page.',
    properties: {
      parentId:   { type: 'string', description: 'Parent page or database ID.' },
      title:      { type: 'string', description: 'Page title.' },
      content:    { type: 'string', description: 'Initial content text.' },
      parentType: { type: 'string', description: 'page_id or database_id. Default: page_id.' },
    },
    required: ['parentId', 'title'],
  },
  notion_append_block: {
    description: 'Append content to a Notion page.',
    properties: {
      pageId:    { type: 'string', description: 'Page ID to append to.' },
      content:   { type: 'string', description: 'Content text to append.' },
      blockType: { type: 'string', description: 'Block type: paragraph, heading_1, heading_2, bulleted_list_item, etc.' },
    },
    required: ['pageId', 'content'],
  },

  // ---------------------------------------------------------------------------
  // Slack / Teams
  // ---------------------------------------------------------------------------
  slack_send: {
    description: 'Send a message to a Slack channel via incoming webhook.',
    properties: {
      message:    { type: 'string', description: 'Message text (supports Slack markdown).' },
      webhookUrl: { type: 'string', description: 'Override the configured webhook URL.' },
      channel:    { type: 'string', description: 'Channel override (e.g. #general).' },
      username:   { type: 'string', description: 'Bot display name.' },
      iconEmoji:  { type: 'string', description: 'Bot icon emoji (e.g. :robot_face:).' },
    },
    required: ['message'],
  },
  slack_send_blocks: {
    description: 'Send a Slack message with Block Kit layout for rich formatting.',
    properties: {
      blocks:     { type: 'array', description: 'Block Kit blocks array.', items: { type: 'object' } },
      text:       { type: 'string', description: 'Fallback text.' },
      webhookUrl: { type: 'string', description: 'Override webhook URL.' },
      channel:    { type: 'string', description: 'Channel override.' },
    },
    required: ['blocks'],
  },
  slack_search: {
    description: 'Search Slack messages (requires Slack Bot token with search:read scope).',
    properties: {
      query: { type: 'string', description: 'Search query.' },
      count: { type: 'number', description: 'Max results (default: 10).' },
    },
    required: ['query'],
  },
  teams_send: {
    description: 'Send a message to Microsoft Teams via incoming webhook.',
    properties: {
      message:    { type: 'string', description: 'Message text.' },
      webhookUrl: { type: 'string', description: 'Override the configured webhook URL.' },
      title:      { type: 'string', description: 'Message title.' },
      themeColor: { type: 'string', description: 'Hex color for the card accent (e.g. 0076D7).' },
    },
    required: ['message'],
  },
  teams_send_card: {
    description: 'Send an Adaptive Card to Microsoft Teams.',
    properties: {
      card:       { type: 'object', description: 'Adaptive Card JSON object.' },
      webhookUrl: { type: 'string', description: 'Override webhook URL.' },
    },
    required: ['card'],
  },

  // ---------------------------------------------------------------------------
  // Workflows
  // ---------------------------------------------------------------------------
  workflow_save: {
    description: 'Save a reusable workflow prompt. Use {{variableName}} placeholders for dynamic substitution.',
    properties: {
      name:        { type: 'string', description: 'Workflow name (unique identifier).' },
      prompt:      { type: 'string', description: 'Prompt template. Use {{var}} for variables.' },
      description: { type: 'string', description: 'Human-readable description.' },
      tags:        { type: 'array',  description: 'Tags for organization.', items: { type: 'string' } },
    },
    required: ['name', 'prompt'],
  },
  workflow_list: {
    description: 'List all saved workflows.',
    properties: {
      search: { type: 'string', description: 'Filter by name/description.' },
      tag:    { type: 'string', description: 'Filter by tag.' },
    },
    required: [],
  },
  workflow_run: {
    description: 'Run a saved workflow, optionally substituting variables.',
    properties: {
      workflowId: { type: 'string', description: 'Workflow name or ID.' },
      variables:  { type: 'object', description: 'Variable substitutions (e.g. {date: "today"}).' },
    },
    required: ['workflowId'],
  },
  workflow_delete: {
    description: 'Delete a saved workflow.',
    properties: {
      workflowId: { type: 'string', description: 'Workflow name or ID.' },
    },
    required: ['workflowId'],
  },
  workflow_export: {
    description: 'Export a workflow as JSON for sharing or backup.',
    properties: {
      workflowId: { type: 'string', description: 'Workflow name or ID.' },
    },
    required: ['workflowId'],
  },
  workflow_import: {
    description: 'Import a workflow from a JSON string.',
    properties: {
      json: { type: 'string', description: 'JSON string of the workflow to import.' },
    },
    required: ['json'],
  },

  // ---------------------------------------------------------------------------
  // Scheduler
  // ---------------------------------------------------------------------------
  schedule_create: {
    description: 'Create a scheduled task using a cron expression. Examples: "0 9 * * 1-5" (Mon-Fri 9am), "0 * * * *" (hourly), "*/5 * * * *" (every 5 min).',
    properties: {
      name:        { type: 'string', description: 'Task name.' },
      prompt:      { type: 'string', description: 'Prompt to send to the agent when the task fires.' },
      schedule:    { type: 'string', description: 'Cron expression (5 fields: min hour day month weekday).' },
      enabled:     { type: 'boolean', description: 'Whether to start scheduling immediately. Default: true.' },
      timezone:    { type: 'string', description: 'Timezone (e.g. America/New_York). Default: America/New_York.' },
      description: { type: 'string', description: 'Optional description.' },
    },
    required: ['name', 'prompt', 'schedule'],
  },
  schedule_list: {
    description: 'List all scheduled tasks and their status.',
    properties: {},
    required: [],
  },
  schedule_delete: {
    description: 'Delete a scheduled task.',
    properties: {
      taskId: { type: 'string', description: 'Task ID.' },
    },
    required: ['taskId'],
  },
  schedule_enable: {
    description: 'Enable a paused scheduled task.',
    properties: {
      taskId: { type: 'string', description: 'Task ID.' },
    },
    required: ['taskId'],
  },
  schedule_disable: {
    description: 'Disable (pause) a scheduled task without deleting it.',
    properties: {
      taskId: { type: 'string', description: 'Task ID.' },
    },
    required: ['taskId'],
  },
  schedule_run_now: {
    description: 'Immediately run a scheduled task once.',
    properties: {
      taskId: { type: 'string', description: 'Task ID.' },
    },
    required: ['taskId'],
  },

  // ---------------------------------------------------------------------------
  // Multi-agent Orchestration
  // ---------------------------------------------------------------------------
  agent_spawn: {
    description: 'Spawn a sub-agent to complete a focused sub-task independently. Returns the sub-agent\'s final answer.',
    properties: {
      prompt:       { type: 'string', description: 'Task for the sub-agent to complete.' },
      tools:        { type: 'array',  description: 'Restrict sub-agent to these tool names (omit for all tools).', items: { type: 'string' } },
      maxTurns:     { type: 'number', description: 'Max turns for sub-agent (default: 15).' },
      systemPrompt: { type: 'string', description: 'Optional system prompt override for sub-agent.' },
    },
    required: ['prompt'],
  },
  agent_fanout: {
    description: 'Run multiple prompts in parallel using independent sub-agents. Use for parallel research, analysis, or generation.',
    properties: {
      prompts:  { type: 'array',  description: 'Array of prompts to run in parallel.', items: { type: 'string' } },
      tools:    { type: 'array',  description: 'Tool restriction (shared by all).', items: { type: 'string' } },
      maxTurns: { type: 'number', description: 'Max turns per agent (default: 15).' },
    },
    required: ['prompts'],
  },
  agent_map: {
    description: 'Apply a prompt template to each item in an array using parallel sub-agents. Use {{item}} as the placeholder.',
    properties: {
      template: { type: 'string', description: 'Prompt template. Use {{item}} for the current item.' },
      items:    { type: 'array',  description: 'Array of items to process.', items: { type: 'string' } },
      tools:    { type: 'array',  description: 'Tool restriction.', items: { type: 'string' } },
      maxTurns: { type: 'number', description: 'Max turns per agent (default: 15).' },
    },
    required: ['template', 'items'],
  },
  agent_reduce: {
    description: 'Combine multiple text results into one synthesized output using a sub-agent.',
    properties: {
      results:       { type: 'array',  description: 'Array of text results to combine.', items: { type: 'string' } },
      combinePrompt: { type: 'string', description: 'Instructions for how to combine/synthesize the results.' },
      maxTurns:      { type: 'number', description: 'Max turns (default: 10).' },
    },
    required: ['results'],
  },

  // ── Excel Master Tools ────────────────────────────────────────────────

  excel_list_templates: {
    description: 'List available Excel dashboard templates with their industries and default themes.',
    properties: {},
    required: [],
  },

  excel_list_themes: {
    description: 'List available Excel dashboard color themes.',
    properties: {},
    required: [],
  },

  excel_profile_data: {
    description: 'Profile a CSV/XLSX dataset: column types, row count, sample values, distributions. Use this before building dashboards to understand the data.',
    properties: {
      path: { type: 'string', description: 'Absolute path to the CSV or XLSX file.' },
    },
    required: ['path'],
  },

  excel_auto_build: {
    description: 'Auto-build a full Excel dashboard from CSV/XLSX data. Uses AI to select template, theme, KPIs, and charts. Returns a session_id for further editing with other excel_* tools.',
    properties: {
      path: { type: 'string', description: 'Absolute path to the CSV or XLSX file.' },
      output_path: { type: 'string', description: 'Output XLSX path (default: same directory as input, with _dashboard suffix).' },
      template: { type: 'string', description: 'Template key (executive_summary, hr_analytics, dark_operational, financial, supply_chain, marketing, minimal_clean). Default: auto-selected.' },
      theme: { type: 'string', description: 'Color theme key (corporate_blue, hr_purple, dark_mode, supply_green, finance_green, marketing_orange, slate_minimal, executive_navy).' },
    },
    required: ['path'],
  },

  excel_add_chart: {
    description: 'Add a chart to the Excel dashboard. Supports bar, line, pie, doughnut, area, scatter, bar_horizontal, and combo types.',
    properties: {
      session_id: { type: 'string', description: 'Session ID returned by excel_auto_build.' },
      type: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut', 'area', 'scatter', 'bar_horizontal', 'combo'], description: 'Chart type.' },
      x_column: { type: 'string', description: 'Column for x-axis / categories.' },
      y_columns: { type: 'array', items: { type: 'string' }, description: 'Column(s) for y-axis values.' },
      title: { type: 'string', description: 'Chart title.' },
      aggregation: { type: 'string', enum: ['sum', 'avg', 'count', 'max', 'min', 'median'], description: 'Aggregation function (default: sum).' },
      width: { type: 'string', enum: ['full', 'half'], description: 'Chart width (default: half).' },
      side: { type: 'string', enum: ['left', 'right'], description: 'Side for half-width charts (default: left).' },
      top_n: { type: 'integer', description: 'Show only top N categories (0 = all).' },
      show_data_labels: { type: 'boolean', description: 'Show data labels on chart (default: true).' },
      sheet: { type: 'string', description: 'Target sheet name (default: Dashboard).' },
      position: { type: 'string', description: "Position: 'end', 'after:<id>', 'row:<N>'." },
    },
    required: ['session_id', 'type', 'x_column', 'y_columns'],
  },

  excel_modify_object: {
    description: 'Modify any existing dashboard object by its ID. Pass only the fields you want to change. Use excel_query first to discover object IDs.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      object_id: { type: 'string', description: 'ID of the object to modify (e.g. chart_0, table_0).' },
      changes: { type: 'object', description: 'Fields to update. For charts: type, title, x_column, y_columns, aggregation, width, side. For tables: columns, max_rows. For KPI rows: kpis (full list). For text: content, style.' },
      sheet: { type: 'string', description: 'Sheet where the object lives (default: Dashboard).' },
    },
    required: ['session_id', 'object_id', 'changes'],
  },

  excel_remove_object: {
    description: 'Remove an object from the dashboard by its ID.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      object_id: { type: 'string', description: 'ID of the object to remove.' },
      sheet: { type: 'string', description: 'Sheet name (default: searches all sheets).' },
    },
    required: ['session_id', 'object_id'],
  },

  excel_add_kpi_row: {
    description: 'Add a row of KPI metric tiles to the dashboard.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      kpis: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Display label.' },
            column: { type: 'string', description: 'Data column to aggregate.' },
            aggregation: { type: 'string', enum: ['sum', 'avg', 'count', 'max', 'min', 'median', 'distinct_count'], description: 'Aggregation (default: sum).' },
            format: { type: 'string', enum: ['number', 'currency', 'percentage', 'decimal', 'integer'], description: 'Display format.' },
            prefix: { type: 'string', description: 'Prefix (e.g. "$").' },
            suffix: { type: 'string', description: 'Suffix (e.g. "%").' },
          },
          required: ['label', 'column'],
        },
        description: 'List of KPI definitions.',
      },
      sheet: { type: 'string', description: 'Target sheet.' },
      position: { type: 'string', description: 'Position.' },
    },
    required: ['session_id', 'kpis'],
  },

  excel_add_table: {
    description: 'Add a data table or pivot table to the dashboard.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      table_type: { type: 'string', enum: ['data', 'pivot'], description: 'Table type (default: data).' },
      columns: { type: 'array', items: { type: 'string' }, description: 'Columns to show (for data tables).' },
      max_rows: { type: 'integer', description: 'Max rows to display (default: 15).' },
      show_conditional: { type: 'boolean', description: 'Show conditional formatting (default: true).' },
      index_col: { type: 'string', description: 'Row grouping column (for pivot tables).' },
      value_col: { type: 'string', description: 'Value column (for pivot tables).' },
      columns_col: { type: 'string', description: 'Cross-tab column (for pivot tables).' },
      agg: { type: 'string', enum: ['sum', 'avg', 'count', 'max', 'min', 'median'], description: 'Aggregation for pivot (default: sum).' },
      sheet: { type: 'string', description: 'Target sheet.' },
      position: { type: 'string', description: 'Position.' },
    },
    required: ['session_id'],
  },

  excel_add_content: {
    description: 'Add a title bar, section header, or text block to the dashboard.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      content_type: { type: 'string', enum: ['title', 'section_header', 'text'], description: 'Type of content.' },
      text: { type: 'string', description: 'Content text.' },
      subtitle: { type: 'string', description: 'Subtitle (for title type only).' },
      style: { type: 'string', enum: ['body', 'heading', 'insight', 'footnote'], description: 'Text style (for text type).' },
      color: { type: 'string', description: 'Hex color override (for section headers).' },
      sheet: { type: 'string', description: 'Target sheet.' },
      position: { type: 'string', description: 'Position.' },
    },
    required: ['session_id', 'content_type', 'text'],
  },

  excel_write_cells: {
    description: 'Write values, formulas, and formatting to individual cells.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      writes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cell: { type: 'string', description: "Cell address like 'A1', 'B3'." },
            value: { description: "Value: string, number, or formula starting with '='." },
            bold: { type: 'boolean' },
            italic: { type: 'boolean' },
            font_size: { type: 'number' },
            font_color: { type: 'string', description: "Hex color like '#FF0000'." },
            bg_color: { type: 'string', description: 'Background hex color.' },
            num_format: { type: 'string', description: "Number format like '#,##0.00'." },
            align: { type: 'string', enum: ['left', 'center', 'right'] },
            border: { type: 'integer', description: 'Border style (1=thin, 2=medium, 5=thick).' },
          },
          required: ['cell'],
        },
        description: 'List of cell writes.',
      },
      sheet: { type: 'string', description: 'Target sheet (default: Dashboard).' },
    },
    required: ['session_id', 'writes'],
  },

  excel_format_range: {
    description: 'Apply formatting to a range of cells (bold, colors, borders, number format).',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      range: { type: 'string', description: "Range like 'A1:F20'." },
      bold: { type: 'boolean' },
      italic: { type: 'boolean' },
      font_size: { type: 'number' },
      font_color: { type: 'string' },
      bg_color: { type: 'string' },
      num_format: { type: 'string' },
      align: { type: 'string', enum: ['left', 'center', 'right'] },
      valign: { type: 'string', enum: ['top', 'vcenter', 'bottom'] },
      border: { type: 'integer' },
      text_wrap: { type: 'boolean' },
      sheet: { type: 'string' },
    },
    required: ['session_id', 'range'],
  },

  excel_sheet_op: {
    description: 'Create, rename, delete, reorder sheets. Set tab color, hide/show.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      operation: { type: 'string', enum: ['create', 'rename', 'delete', 'reorder', 'set_tab_color', 'hide', 'show'], description: 'Sheet operation type.' },
      sheet: { type: 'string', description: 'Sheet name to operate on.' },
      new_name: { type: 'string', description: 'New name (for rename).' },
      position: { type: 'integer', description: 'New position index (for reorder).' },
      tab_color: { type: 'string', description: 'Hex tab color (for set_tab_color).' },
    },
    required: ['session_id', 'operation'],
  },

  excel_row_col_op: {
    description: 'Resize or hide/show rows and columns.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      target: { type: 'string', enum: ['row', 'column'] },
      operation: { type: 'string', enum: ['resize', 'hide', 'show'] },
      index: { type: 'integer', description: 'Row or column index (0-based).' },
      end_index: { type: 'integer', description: 'End index for range operations (inclusive).' },
      size: { type: 'number', description: 'Height (rows) or width (columns) in points.' },
      sheet: { type: 'string' },
    },
    required: ['session_id', 'target', 'operation', 'index'],
  },

  excel_add_feature: {
    description: 'Add Excel features: conditional formatting, data validation, freeze panes, zoom, merge cells, hyperlinks, comments, images.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      feature: { type: 'string', enum: ['conditional_format', 'data_validation', 'freeze_panes', 'zoom', 'merge', 'hyperlink', 'comment', 'image'], description: 'Feature type.' },
      range: { type: 'string', description: "Cell or range (e.g. 'A1:F20')." },
      cell: { type: 'string', description: 'Single cell address (for hyperlink, comment, image).' },
      rule_type: { type: 'string', enum: ['3_color_scale', '2_color_scale', 'data_bar', 'icon_set', 'cell_is'], description: 'Conditional format rule type.' },
      criteria: { type: 'string', description: "Criteria for cell_is rules (e.g. '>', 'between')." },
      value: { description: 'Threshold value for cell_is rules.' },
      min_color: { type: 'string' },
      mid_color: { type: 'string' },
      max_color: { type: 'string' },
      bar_color: { type: 'string', description: 'Data bar color.' },
      validate: { type: 'string', enum: ['list', 'whole', 'decimal', 'custom'], description: 'Data validation type.' },
      source: { type: 'array', items: { type: 'string' }, description: 'List values for validation.' },
      freeze_row: { type: 'integer' },
      freeze_col: { type: 'integer' },
      zoom_level: { type: 'integer', description: 'Zoom percentage (10-400).' },
      merge_value: { type: 'string', description: 'Text to write in merged cell.' },
      format: { type: 'object', description: 'Format dict for merge.' },
      url: { type: 'string' },
      display_text: { type: 'string' },
      comment_text: { type: 'string' },
      author: { type: 'string' },
      image_path: { type: 'string' },
      x_scale: { type: 'number' },
      y_scale: { type: 'number' },
      sheet: { type: 'string' },
    },
    required: ['session_id', 'feature'],
  },

  excel_change_theme: {
    description: 'Change the workbook color theme.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      theme: { type: 'string', enum: ['corporate_blue', 'hr_purple', 'dark_mode', 'supply_green', 'finance_green', 'marketing_orange', 'slate_minimal', 'executive_navy'], description: 'Color theme.' },
    },
    required: ['session_id', 'theme'],
  },

  excel_query: {
    description: 'Read-only: list objects, get object details, data summary, list sheets, inspect registry. Use this to discover object IDs before modifying.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      query: { type: 'string', enum: ['list_objects', 'object_details', 'data_summary', 'list_sheets', 'registry_snapshot'], description: 'What to query.' },
      object_id: { type: 'string', description: 'Object ID (for object_details).' },
      sheet: { type: 'string', description: 'Filter by sheet name.' },
    },
    required: ['session_id', 'query'],
  },

  excel_undo: {
    description: 'Undo the last action in the Excel dashboard session.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
    },
    required: ['session_id'],
  },

  excel_redo: {
    description: 'Redo the last undone action in the Excel dashboard session.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
    },
    required: ['session_id'],
  },

  excel_save: {
    description: 'Render and save the current Excel dashboard session to XLSX.',
    properties: {
      session_id: { type: 'string', description: 'Session ID.' },
      output_path: { type: 'string', description: 'Output file path (default: uses session default).' },
    },
    required: ['session_id'],
  },
};

module.exports = { TOOL_SCHEMAS };
