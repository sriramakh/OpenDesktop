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
    description: 'Read a Word document (.docx) and extract its text content. Set format="html" for structured output with headings and lists.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the .docx file.',
      },
      format: {
        type: 'string',
        description: "Output format: 'text' (default, plain text) or 'html' (structured HTML with headings/lists).",
        enum: ['text', 'html'],
        default: 'text',
      },
    },
    required: ['path'],
  },

  office_write_docx: {
    description: "Create a Word document (.docx) from markdown-like content. Use # for H1, ## for H2, ### for H3, - or * for bullet lists, 1. for numbered lists. Plain text becomes paragraphs.",
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to save the .docx file.',
      },
      content: {
        type: 'string',
        description: 'Document content in markdown-like format. Use # H1, ## H2, ### H3, - bullet, 1. numbered.',
      },
      title: {
        type: 'string',
        description: 'Document title (used in metadata). Defaults to filename.',
      },
    },
    required: ['path', 'content'],
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
    description: 'Build a dynamic pivot/summary table in an Excel workbook. Uses SUMIF/COUNTIF/AVERAGEIF/MAXIFS/MINIFS formulas so the summary auto-recalculates when source data changes. Writes a professionally styled sheet. To create a chart: open in Excel, select the summary data, and Insert → Chart.',
    properties: {
      path: { type: 'string', description: 'Absolute path to the Excel file.' },
      dataSheet: { type: 'string', description: 'Source sheet name. Defaults to first sheet.' },
      dataRange: { type: 'string', description: "Optional range to limit source rows (e.g. 'A1:F500'). Defaults to all rows." },
      outputSheet: { type: 'string', description: "Sheet name for the pivot output. Default: 'Summary'." },
      title: { type: 'string', description: 'Title for the summary table.' },
      pivotConfig: {
        type: 'object',
        description: 'Pivot configuration (all fields are 1-indexed column numbers).',
        properties: {
          groupByCol:  { type: 'number', description: 'Column number to group by (1-indexed). Default: 1.' },
          valueCol:    { type: 'number', description: 'Column number to aggregate (1-indexed). Default: 2.' },
          aggregation: { type: 'string', description: "Aggregation: 'SUM' (default), 'COUNT', 'AVG', 'MAX', 'MIN'.", enum: ['SUM', 'COUNT', 'AVG', 'MAX', 'MIN'] },
          labelCol:    { type: 'number', description: 'Optional column for a third label column in the output.' },
        },
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
};

module.exports = { TOOL_SCHEMAS };
