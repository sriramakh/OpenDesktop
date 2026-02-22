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
      },
      headers: {
        type: 'object',
        description: 'Additional HTTP headers.',
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
      },
    },
    required: ['path'],
  },

  // ---------------------------------------------------------------------------
  // Office documents
  // ---------------------------------------------------------------------------
  office_read_pdf: {
    description: 'Read and extract text from a PDF file. Returns full text content with page markers. Optionally limit to a page range.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the PDF file.',
      },
      startPage: {
        type: 'number',
        description: 'First page to read (1-indexed). Default: 1 (read from beginning).',
      },
      endPage: {
        type: 'number',
        description: 'Last page to read. Default: read all pages (up to 30).',
      },
      password: {
        type: 'string',
        description: 'Password for encrypted PDFs (if required).',
      },
    },
    required: ['path'],
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
    description: 'Read an Excel workbook (.xlsx or .xls). Returns all sheets with data, column headers, and optionally cell formulas. Handles multiple sheets.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the Excel file.',
      },
      sheetName: {
        type: 'string',
        description: 'Specific sheet name to read. Omit to read all sheets.',
      },
      maxRows: {
        type: 'number',
        description: 'Maximum rows to return per sheet. Default: 500.',
        default: 500,
      },
      includeFormulas: {
        type: 'boolean',
        description: 'If true, show cell formulas alongside values. Default: false.',
        default: false,
      },
      outputFormat: {
        type: 'string',
        description: "Output format: 'text' (CSV-like, default) or 'json' (array of objects).",
        enum: ['text', 'json'],
        default: 'text',
      },
    },
    required: ['path'],
  },

  office_write_xlsx: {
    description: 'Write or modify an Excel workbook. Use sheetData for quick full-sheet writes, or operations for fine-grained cell control including formulas. Supports all Excel formulas (=SUM, =VLOOKUP, etc.). Creates the file if it does not exist.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the Excel file.',
      },
      sheetData: {
        type: 'object',
        description: 'Object mapping sheet names to 2D arrays: {"Sheet1": [[header1, header2], [val1, val2]], "Sheet2": [...]}. Fastest way to write bulk data.',
      },
      operations: {
        type: 'array',
        description: 'Array of cell operations: [{type: "set_cell", sheet: "Sheet1", cell: "A1", value: 42}, {type: "set_cell", sheet: "Sheet1", cell: "B1", formula: "SUM(A1:A10)"}, {type: "set_range", sheet: "Sheet1", range: "A1", data: [[1,2],[3,4]]}, {type: "add_sheet", name: "Summary"}, {type: "auto_sum", sheet: "Sheet1", sourceRange: "B2:B10", targetCell: "B11"}].',
        items: { type: 'object' },
      },
    },
    required: ['path'],
  },

  office_chart_xlsx: {
    description: 'Add a chart or pivot table to an Excel workbook. Supports bar, line, pie, scatter chart types. Can auto-generate a pivot table from a data range.',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the Excel file.',
      },
      chartType: {
        type: 'string',
        description: "Chart type: 'bar', 'line', 'pie', 'scatter'. Default: 'bar'.",
        enum: ['bar', 'line', 'pie', 'scatter'],
        default: 'bar',
      },
      dataSheet: {
        type: 'string',
        description: 'Source sheet name containing the data. Defaults to first sheet.',
      },
      dataRange: {
        type: 'string',
        description: "Data range for the chart (e.g. 'A1:C10').",
      },
      outputSheet: {
        type: 'string',
        description: "Name of the sheet to add the chart to. Default: 'Chart'.",
      },
      title: {
        type: 'string',
        description: 'Chart title.',
      },
      pivotConfig: {
        type: 'object',
        description: "Pivot table config: {groupByCol: 1, valueCol: 2, aggregation: 'SUM'}. Column numbers are 1-indexed.",
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
        items: { type: 'array' },
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
