# OpenDesktop — Architecture Reference

> Complete technical reference for every subsystem, module, data flow, and design decision in the OpenDesktop autonomous desktop agent.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Process Model (Electron)](#2-process-model-electron)
3. [Main Process — Entry & IPC](#3-main-process--entry--ipc)
4. [Agent Core — Orchestrator](#4-agent-core--orchestrator)
5. [Agent Loop — ReAct Execution Engine](#5-agent-loop--react-execution-engine)
6. [LLM Module — Multi-Provider Client](#6-llm-module--multi-provider-client)
7. [Tool System](#7-tool-system)
8. [Memory System](#8-memory-system)
9. [Permission System](#9-permission-system)
10. [Persona System](#10-persona-system)
11. [Context Awareness](#11-context-awareness)
12. [KeyStore — Encrypted API Key Storage](#12-keystore--encrypted-api-key-storage)
13. [Renderer — React UI](#13-renderer--react-ui)
14. [IPC Event Protocol](#14-ipc-event-protocol)
15. [Data Flows](#15-data-flows)
16. [Security Model](#16-security-model)
17. [File-by-File Reference](#17-file-by-file-reference)
18. [Dependencies](#18-dependencies)

---

## 1. High-Level Overview

OpenDesktop is a **local-first autonomous AI agent** that runs natively on macOS (with Linux/Windows support). It uses a **ReAct (Reasoning + Acting) loop** — the same architecture as Claude Code, OpenAI Assistants, and other modern autonomous agents — to observe, reason, and execute multi-step tasks across the operating system.

```
┌──────────────────────────────────────────────────────────────────┐
│                        Electron Shell                            │
│                                                                  │
│  ┌─────────────────────── Renderer Process ───────────────────┐  │
│  │  TitleBar │ Sidebar │ ChatPanel │ ContextPanel │ Settings  │  │
│  │           │ Personas│ Streaming │ System info  │ LLM config│  │
│  │           │ Tools   │ Tool calls│ Running apps │ API keys  │  │
│  │           │ History │ Approvals │ Resources    │ Personas  │  │
│  └────────────────────────── IPC ─────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────── Main Process ─────────────────────────┐  │
│  │                                                            │  │
│  │  main.js ──→ AgentCore ──→ AgentLoop (ReAct)              │  │
│  │              │    │    │       │                            │  │
│  │              │    │    │       ├── LLM callWithTools()      │  │
│  │              │    │    │       ├── ToolRegistry.execute()   │  │
│  │              │    │    │       └── Approval gating          │  │
│  │              │    │    │                                    │  │
│  │              │    │    ├── PersonaManager (auto-select)     │  │
│  │              │    │    ├── ContextAwareness (OS state)      │  │
│  │              │    │    └── MemorySystem (SQLite FTS5)       │  │
│  │              │    │                                         │  │
│  │              │    └── KeyStore (AES-256-GCM)                │  │
│  │              └── PermissionManager (safe/sensitive/danger)  │  │
│  │                                                            │  │
│  │  ┌─── Tool Registry (51 tools) ────────────────────────┐  │  │
│  │  │ Filesystem(11) │ Office(15) │ AppControl(6)         │  │  │
│  │  │ Browser(5)     │ Search(4) │ System(6) │ LLM(4)     │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Key design principles:**
- **No upfront plan** — the LLM decides what to do at every step based on full context
- **Native tool calling** — uses each provider's native function/tool calling API
- **Local-first** — everything runs on the user's machine; API keys never leave the device
- **Provider-agnostic** — 10 LLM providers, 80+ models, unified internal message format

---

## 2. Process Model (Electron)

OpenDesktop is an Electron application with strict process isolation:

| Process | Role | Key Files |
|---------|------|-----------|
| **Main** | Node.js backend — agent logic, tool execution, LLM calls, file I/O, system commands | `src/main/main.js`, `src/main/agent/*` |
| **Renderer** | React UI — chat interface, settings, streaming display | `src/renderer/*` |
| **Preload** | Context bridge — exposes a safe `window.api` object to the renderer | `src/main/preload.js` |

**Security boundaries:**
- `contextIsolation: true` — renderer cannot access Node.js APIs directly
- `nodeIntegration: false` — no `require()` in renderer
- `sandbox: false` — required for preload script to access `ipcRenderer`
- All communication flows through `ipcMain.handle()` / `ipcRenderer.invoke()` (request/response) or `ipcRenderer.on()` (streaming events)

---

## 3. Main Process — Entry & IPC

**File:** `src/main/main.js` (192 lines)

### Startup Sequence

```
app.whenReady()
  → initializeAgent()
      → new MemorySystem(userDataPath)     // SQLite or JSON fallback
      → new PermissionManager()
      → new ContextAwareness()
      → new ToolRegistry(permissions)
      → new KeyStore(userDataPath)
      → new AgentCore({ memory, permissions, context, toolRegistry, keyStore, emit })
      → memory.initialize()                // Create/open SQLite DB
      → keyStore.initialize()              // Decrypt .keystore.enc
      → toolRegistry.registerBuiltinTools() // Load all 51 tools
  → createWindow()                          // BrowserWindow with vibrancy
  → setupIPC()                              // Register all IPC handlers
```

### IPC Handlers

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `agent:send-message` | Renderer → Main | Send user message, returns `{ taskId, summary }` |
| `agent:cancel` | Renderer → Main | Cancel current task |
| `agent:approval-response` | Renderer → Main | User approves/denies a dangerous action |
| `agent:new-session` | Renderer → Main | Clear conversation history |
| `memory:search` | Renderer → Main | Full-text search over long-term memory |
| `memory:get-history` | Renderer → Main | Get recent task history |
| `context:get-active` | Renderer → Main | Get current OS context |
| `settings:get` / `settings:update` | Renderer → Main | Read/write agent settings |
| `tools:list` | Renderer → Main | List all registered tools |
| `models:catalog` | Renderer → Main | Get MODEL_CATALOG |
| `models:ollama-list` | Renderer → Main | Discover locally installed Ollama models |
| `keys:set` / `keys:remove` / `keys:list` / `keys:has` | Renderer → Main | Encrypted API key management |
| `window:minimize` / `window:maximize` / `window:close` | Renderer → Main | Window controls (frameless) |

### Streaming Events (Main → Renderer)

| Event | Payload | When |
|-------|---------|------|
| `agent:task-start` | `{ taskId }` | Immediately when a new task begins |
| `agent:thinking` | `{ taskId, turn }` | Each new ReAct turn starts |
| `agent:token` | `{ taskId, token }` | Each streaming text token from LLM |
| `agent:tool-calls` | `{ taskId, turn, calls[] }` | LLM requests tool calls |
| `agent:tool-start` | `{ taskId, id, name, input }` | Individual tool begins execution |
| `agent:tool-end` | `{ taskId, id, name, success, outputPreview/error }` | Individual tool completes |
| `agent:tool-results` | `{ taskId, turn, results[] }` | Batch of tool results returned to LLM |
| `agent:step-update` | `{ taskId, phase, message }` | Phase changes (context, running) |
| `agent:approval-request` | `{ requestId, taskId, action }` | Dangerous action needs user approval |
| `agent:complete` | `{ taskId, status, summary, steps[] }` | Task finished |
| `agent:error` | `{ taskId, error }` | Unrecoverable error |

---

## 4. Agent Core — Orchestrator

**File:** `src/main/agent/core.js` (378 lines)

AgentCore is the central orchestrator. It does **not** execute tools or call LLMs directly — it delegates to AgentLoop.

### Responsibilities

1. **Session management** — maintains `sessionMessages[]` across multiple user messages within a session
2. **Auto-persona selection** — classifies each request into executor/researcher/planner using heuristic scoring + LLM fallback
3. **System prompt construction** — injects OS context, persona instructions, tool guidelines, memory, and environment info
4. **AgentLoop invocation** — passes conversation + system prompt to the ReAct loop
5. **Memory persistence** — stores task summaries in long-term memory after completion
6. **Approval routing** — bridges approval requests from AgentLoop to the renderer
7. **Cancellation** — propagates cancel signals to the loop

### Auto-Persona Selection Algorithm

```
1. Tokenize user message (lowercase)
2. Score against regex patterns for each persona:
   - executor:   strong signals (move, delete, install, run...) × 3
                  weak signals (create, make, write, open...) × 1
   - researcher: strong signals (search, explain, compare...) × 3
                  weak signals (what, why, how, when...) × 1
   - planner:    strong signals (plan, design, architect...) × 3
                  weak signals (should, could, option...) × 1
3. If max score ≥ 3 → use that persona
4. If ambiguous → call LLM for classification (one-word response)
5. If max score > 0 → use highest scorer
6. Default fallback → executor
```

### System Prompt Structure

```
[Persona system prompt]

You are OpenDesktop, an autonomous AI agent running natively on {user}'s {platform} computer.

## Your capabilities
[Full tool listing by category]

## Critical operating principles
[7 rules: be autonomous, explore first, chain tools, parallel execution, recover from errors, be complete, summarize]

## Tool guidelines
[Specific guidance for file paths, directory exploration, document reading, shell commands, app opening, web research]

## Current environment
- Platform, User, Home, Active app, Time
- Running apps (top 10)
- Relevant past interactions (from memory search)
```

---

## 5. Agent Loop — ReAct Execution Engine

**File:** `src/main/agent/loop.js` (382 lines)

The AgentLoop implements the core ReAct pattern — the same architecture used by Claude Code, OpenAI Assistants, and all modern autonomous agents.

### Loop Algorithm

```
while (turns < maxTurns && !cancelled):
    1. Get tool definitions (provider-specific format)
    2. Truncate conversation if approaching context limit
    3. Call LLM with: systemPrompt + conversation + toolDefs
    4. Append assistant response to conversation
    5. If no tool calls → return final text answer (DONE)
    6. If tool calls:
       a. Emit tool-calls event to UI
       b. Classify each tool: safe/sensitive/dangerous
       c. Gate dangerous tools through user approval
       d. Execute all approved tools in parallel (Promise.allSettled)
       e. Trim large tool results (>8000 chars)
       f. Append tool results to conversation
       g. Emit tool-results event to UI
       h. Loop back to step 1
```

### Context Overflow Protection

**Token estimation:** `Math.ceil(text.length / 3.5)` (rough chars-to-tokens ratio)

**Truncation strategy:**
- Budget: 80,000 tokens for conversation (reserves space for system prompt, tools, completion)
- Keeps first user message (original request) and most recent messages
- Removes older assistant/tool_results pairs from the middle
- Tool results are trimmed to 8,000 characters before appending

### Input Normalization (Ollama Compatibility)

Ollama's simplified schemas convert array/object params to strings. The loop normalizes them back:

```javascript
// If schema says array/object but we received a string → JSON.parse()
if ((propSchema.type === 'array' || propSchema.type === 'object') && typeof val === 'string') {
    normalized[key] = JSON.parse(val);
}
```

### Approval Flow

```
1. Tool classified as "dangerous" by PermissionManager
2. Loop emits agent:approval-request with requestId
3. UI shows ApprovalDialog with tool name, params, risk level
4. User clicks Approve/Deny
5. Renderer sends agent:approval-response via IPC
6. Core resolves the pending Promise
7. Loop continues (executes tool) or skips (returns "denied" result)
8. Auto-timeout: 5 minutes → auto-deny
```

---

## 6. LLM Module — Multi-Provider Client

**File:** `src/main/agent/llm.js` (901 lines)

### Two Calling Modes

| Mode | Function | Used By | Returns |
|------|----------|---------|---------|
| **Simple** | `callLLM(systemPrompt, userMessage, options)` | llm-tools, auto-persona classification | `string` (text response) |
| **Agentic** | `callWithTools(systemPrompt, messages, tools, options)` | AgentLoop | `{ text, toolCalls, rawContent, stopReason }` |

### Provider Catalog (MODEL_CATALOG)

10 providers, 80+ models:

| Provider | Key | Endpoint | Adapter | Models |
|----------|-----|----------|---------|--------|
| **Ollama** | No | `http://127.0.0.1:11434` | Dedicated (`/api/chat`) | 20 local models |
| **OpenAI** | Yes | `https://api.openai.com` | Dedicated (`/v1/chat/completions`) | 12 models (GPT-4.1, o3, o4-mini...) |
| **Anthropic** | Yes | `https://api.anthropic.com` | Dedicated (`/v1/messages`) | 8 Claude models |
| **Google** | Yes | `https://generativelanguage.googleapis.com` | Dedicated (Gemini REST) | 6 Gemini models |
| **DeepSeek** | Yes | `https://api.deepseek.com` | OpenAI-compatible | 2 models |
| **xAI** | Yes | `https://api.x.ai` | OpenAI-compatible | 5 Grok models |
| **Mistral** | Yes | `https://api.mistral.ai` | OpenAI-compatible | 6 models |
| **Groq** | Yes | `https://api.groq.com/openai` | OpenAI-compatible | 7 models |
| **Together** | Yes | `https://api.together.xyz` | OpenAI-compatible | 7 models |
| **Perplexity** | Yes | `https://api.perplexity.ai` | OpenAI-compatible | 5 Sonar models |

### Internal Message Format

The LLM module uses an Anthropic-inspired canonical format internally. Each provider adapter converts to/from this format:

```javascript
// User message
{ role: 'user', content: 'string' }
{ role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }

// Assistant message
{ role: 'assistant', content: 'string' }
{ role: 'assistant', content: [
    { type: 'text', text: '...' },
    { type: 'tool_use', id: '...', name: '...', input: {...} }
]}

// Tool results (synthetic — adapters expand into correct position)
{ role: 'tool_results', results: [{ id, name, content, error? }] }
```

### Provider Adapters

Each provider has two adapter functions:

| Provider | Simple | With Tools | Message Converter |
|----------|--------|------------|-------------------|
| Anthropic | `_anthropicSimple` | `_anthropicWithTools` | `_internalToAnthropicMessages` |
| OpenAI | `_openAISimple` | `_openAIWithTools` | `_internalToOpenAIMessages` |
| Ollama | `_ollamaSimple` | `_ollamaWithTools` | `_internalToOpenAIMessages` (shared) |
| Google | `_geminiSimple` | `_geminiWithTools` | `_internalToGeminiContents` |
| OpenAI-compatible | Reuses `_openAISimple` | Reuses `_openAIWithTools` | `_internalToOpenAIMessages` |

### Reasoning Model Handling (o1/o3/o4)

OpenAI reasoning models require special parameter handling:

```javascript
const isReasoningModel = /^o[0-9]/.test(model);

if (isReasoningModel) {
    bodyObj.max_completion_tokens = maxTokens;  // NOT max_tokens
    // Omit: temperature, tool_choice (unsupported)
} else {
    bodyObj.temperature = temperature;
    bodyObj.max_tokens = maxTokens;
    bodyObj.tool_choice = 'auto';
}
```

### OpenAI-Compatible Routing

New providers with `openaiCompatible: true` in the catalog are automatically routed through the OpenAI adapter:

```javascript
// In callWithTools default case:
if (catalogEntry?.openaiCompatible || provider === 'deepseek') {
    return _openAIWithTools(endpoint || catalogEntry?.endpoint, apiKey, model, ...);
}
```

### Ollama Auto-Discovery

```javascript
async function listOllamaModels(endpoint) {
    // GET /api/tags → returns all locally installed models
    // Returns: [{ id, name, size, modified, parameterSize, family }]
}
```

---

## 7. Tool System

### Registry

**File:** `src/main/agent/tools/registry.js` (229 lines)

The ToolRegistry manages all registered tools and generates provider-specific tool definitions, including dynamic nested schema conversion for strict providers (like Gemini).

**Registration:** `registerBuiltinTools()` loads tools from all category files (filesystem, office, app-control, browser, search-fetch, system, llm-tools).

**Provider-specific schema generation:**

| Provider | Method | Format |
|----------|--------|--------|
| Anthropic | `_toAnthropicTools()` | `{ name, description, input_schema }` |
| OpenAI + compatible | `_toOpenAITools()` | `{ type: 'function', function: { name, description, parameters } }` |
| Ollama | `_toOllamaTools()` | Simplified OpenAI format (no nested objects/arrays/enums) |
| Google | `_toGeminiTools()` | `{ functionDeclarations: [{ name, description, parameters }] }` |

**Ollama schema simplification:** Arrays and objects are converted to `type: 'string'` with instructions to pass JSON strings. This avoids Ollama's parser choking on nested schemas.

### Tool Schemas

**File:** `src/main/agent/tools/tool-schemas.js` (29,692 bytes)

Every tool has a full JSON Schema definition with:
- `description` — what the tool does
- `properties` — parameter definitions with types, descriptions, defaults, enums
- `required` — mandatory parameters

### Tool Categories

#### Filesystem (11 tools) — `filesystem.js`

| Tool | Permission | Description |
|------|-----------|-------------|
| `fs_read` | safe | Read files + auto-extract binary documents (PDF, DOCX, XLSX, PPTX). Scanned PDFs auto-OCR via PyMuPDF + tesseract. Directories return listings. |
| `fs_write` | sensitive | Write/append to files, auto-create parent dirs |
| `fs_edit` | sensitive | Find-and-replace in files |
| `fs_list` | safe | List directory contents with metadata (recursive option) |
| `fs_search` | safe | Glob pattern search with optional content grep |
| `fs_delete` | dangerous | Delete files/directories (recursive option) |
| `fs_move` | dangerous | Move/rename with glob support + cross-device fallback |
| `fs_mkdir` | sensitive | Create directories recursively |
| `fs_tree` | safe | Indented tree view (max 300 entries) |
| `fs_info` | safe | File/directory metadata (size, dates, permissions) |
| `fs_organize` | dangerous | Classify files by extension into category folders (Images, Videos, Documents, etc.). Only moves files, never subdirectories. Supports dry-run and custom rules. |

**Binary document extraction pipeline (`extractBinaryContent`):**

```
PDF:  pdf-parse v2 (PDFParse class) → scanned detection (< 30 chars/page)
                                      → OCR via PyMuPDF + tesseract
                                      → pdftotext CLI fallback
DOCX: mammoth → macOS textutil fallback
XLSX: SheetJS (sheet_to_csv)
PPTX: JSZip XML parsing (<a:t> text runs)
CSV:  Direct read (first 50KB)
Other: `strings` command fallback
```

**OCR pipeline (scanned PDFs):**
1. Inline Python script using PyMuPDF (`fitz`) renders each page at 2.5× resolution to grayscale PNG
2. Tesseract OCR processes each PNG with `--psm 1` (automatic page segmentation)
3. Results collected as JSON, parsed in Node.js
4. Temp files cleaned up in `finally` blocks

**File organization categories (EXT_CATEGORIES):**
Images, Videos, Audio, Documents, Spreadsheets, Presentations, Code, Archives, Applications, Fonts — covering 80+ extensions.

#### Office Documents (15 tools) — `office.js`

| Tool | Permission | Description |
|------|-----------|-------------|
| `office_read_pdf` | safe | Read and extract text/tables from a PDF file. Supports paginated output, chunked reading (startPage/endPage), and "overview" mode for surveying large PDFs. Falls back to PyMuPDF/tesseract OCR for scanned documents. |
| `office_pdf_search` | safe | Search for specific terms, phrases, or keywords within a single PDF. Returns matching lines with surrounding context and page numbers. |
| `office_pdf_ask` | safe | Ask a specific question about a PDF document. For Anthropic and Google providers, sends the entire PDF directly to the AI for native document understanding (perfect for Q&A, summaries, tables, images). |
| `office_search_pdfs` | safe | Search for a term or phrase across ALL PDF files in a directory (recursive by default). Runs in one Python process — much faster than calling office_pdf_search once per file. |
| `office_read_docx` | safe | Word document extraction via python-docx / mammoth. Modes: text, html, structured (heading hierarchy, tables, metadata). |
| `office_search_docx` | safe | Search for a specific term or phrase inside a single Word document (.docx). Returns matching paragraphs with surrounding context and section heading. |
| `office_search_docxs` | safe | Search for a term or phrase across ALL Word documents (.docx) in a directory. Runs in one Python process. |
| `office_write_docx` | sensitive | Create/update DOCX from markdown-like content (headings, bullets, numbered lists, bold, italic, tables) via Office Open XML. |
| `office_read_xlsx` | safe | Excel read via SheetJS — summaryOnly mode, merged cells/column widths metadata, row×col dimensions |
| `office_write_xlsx` | sensitive | Excel write via ExcelJS — full formatting, 12 operation types, financial color coding, autoFormat mode |
| `office_chart_xlsx` | sensitive | Dynamic pivot/summary tables using SUMIF/COUNTIF/AVERAGEIF formulas (auto-recalculate) |
| `office_read_pptx` | safe | PowerPoint extraction via JSZip (titles, body, speaker notes) |
| `office_write_pptx` | write | PowerPoint creation via pptxgenjs — 4 themes, 5 slide layouts, template color extraction, OOXML post-fix |
| `office_read_csv` | safe | CSV/TSV with auto-delimiter detection, pagination, JSON output |
| `office_write_csv` | sensitive | Write/append CSV with custom delimiter |

**PDF reading pipeline (`readPDF`):**
```
1. Read file → Uint8Array (pdf-parse v2 requires this, not Buffer)
2. Configure: standardFontDataUrl, password, max pages
3. Suppress pdfjs-dist v5 font warning (non-critical)
4. PDFParse → load() → getInfo() → getText() → destroy()
5. getText() returns { pages[], text, total }
6. Apply page range filter if requested
7. Scanned detection: if < 30 meaningful chars/page → try OCR
8. OCR: PyMuPDF renders pages → tesseract → JSON results
9. Fallback: return sparse text with install instructions
```

**Excel write pipeline (`office_write_xlsx` — ExcelJS-based):**
- `sheetData` bulk mode: 2D arrays → cells, `=` prefix → formulas, `autoFormat` → dark blue headers, alternating rows, frozen panes, auto-sized columns
- `operations` fine-grained mode: 12 types — `set_cell`, `set_range`, `add_sheet`, `auto_sum`, `format_range`, `freeze_panes`, `set_column_width`, `set_row_height`, `merge_cells`, `create_table`, `auto_fit_columns`, `add_comment`
- Financial color coding: `financial_type` on `set_cell` ops — input (blue), formula (black), cross_sheet (green), external (red), assumption (yellow bg)
- `create_table`: styles header + data rows with alternating fills + auto-filter

**Pivot/summary table (`office_chart_xlsx`):**
- Reads source data, extracts unique keys from `groupByCol`
- Writes SUMIF/COUNTIF/AVERAGEIF/MAXIFS/MINIFS formulas (dynamic — recalculate when source changes)
- Professional styling: title row, column headers, alternating data rows, total row
- Frozen header rows, auto-sized columns

**PPTX writer (`office_write_pptx` — pptxgenjs):**
- 4 built-in themes: professional (navy/white), dark (slate/charcoal), minimal (black/white), vibrant (purple/white)
- Template color extraction: reads `ppt/theme/themeN.xml` from a user-provided `.pptx` to extract dk1/lt1/accent1/accent2 colors
- 5 slide layouts: title (cover/closing), content (bullet list), two-column (comparison), table (data grid), section (chapter divider)
- Quality enforcement: talking headers (complete sentences), 4–6 bullet points per content slide, speaker notes
- OOXML post-processing: strips orphaned `[Content_Types].xml` entries from pptxgenjs v4 bug

**DOCX writer:** Builds valid Office Open XML (`.docx` is a ZIP) using JSZip:
- `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml`, `word/numbering.xml`
- Supports headings (H1-H3), paragraphs, bullet lists, numbered lists
- Proper XML escaping and namespace declarations

#### App Control (6 tools) — `app-control.js`

| Tool | Permission | Description |
|------|-----------|-------------|
| `app_open` | sensitive | Smart app resolution with fuzzy matching against `/Applications` |
| `app_find` | safe | Search installed apps with confidence scores |
| `app_list` | safe | List running applications |
| `app_focus` | sensitive | Bring app to foreground |
| `app_quit` | sensitive | Quit an application |
| `app_screenshot` | safe | Capture screen/window screenshot |

#### Browser Automation (5 tools) — `browser.js`

| Tool | Permission | Description |
|------|-----------|-------------|
| `browser_navigate` | sensitive | Open URL in browser |
| `browser_click` | sensitive | Click at coordinates or element |
| `browser_type` | sensitive | Type text into focused element |
| `browser_key` | sensitive | Press keyboard shortcut |
| `browser_submit_form` | dangerous | Submit a web form |

#### Search & Fetch (4 tools) — `search-fetch.js`

| Tool | Permission | Description |
|------|-----------|-------------|
| `web_search` | safe | Web search via DuckDuckGo |
| `web_fetch` | safe | Fetch webpage content as text |
| `web_fetch_json` | safe | Fetch JSON API endpoint |
| `web_download` | sensitive | Download file to disk |

#### System (6 tools) — `system.js`

| Tool | Permission | Description |
|------|-----------|-------------|
| `system_exec` | sensitive | Execute shell commands (escalates to dangerous for `rm -rf`, `sudo`, etc.) |
| `system_info` | safe | OS info (platform, memory, CPU, disk) |
| `system_processes` | safe | List running processes |
| `system_clipboard_read` | safe | Read clipboard contents |
| `system_clipboard_write` | sensitive | Write to clipboard |
| `system_notify` | safe | Show macOS notification |

#### LLM Tools (4 tools) — `llm-tools.js`

| Tool | Permission | Description |
|------|-----------|-------------|
| `llm_query` | safe | Ask a question to the LLM (sub-query) |
| `llm_summarize` | safe | Summarize text |
| `llm_extract` | safe | Extract structured data from text |
| `llm_code` | safe | Generate code |

---

## 8. Memory System

**File:** `src/main/agent/memory.js` (306 lines)

### Storage Architecture

```
┌─────────────────────────────────────────┐
│              MemorySystem               │
│                                         │
│  ┌─── Short-Term (in-memory) ────────┐  │
│  │  Rolling window: 100 messages     │  │
│  │  Current session only             │  │
│  │  Evicts oldest when full          │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─── Long-Term (persistent) ────────┐  │
│  │  Primary: SQLite + FTS5           │  │
│  │  Fallback: JSON file              │  │
│  │  Auto-migration: JSON → SQLite    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### SQLite Schema

```sql
-- Task records and summaries
CREATE TABLE long_term (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,        -- 'task'
    query TEXT,                -- user's original message
    summary TEXT,              -- agent's final summary
    persona TEXT,              -- which persona handled it
    status TEXT,               -- 'completed' | 'cancelled'
    turns INTEGER,             -- how many ReAct turns
    session_id TEXT,
    timestamp INTEGER NOT NULL
);

-- Full-text search (FTS5)
CREATE VIRTUAL TABLE long_term_fts
    USING fts5(id UNINDEXED, query, summary, content='long_term', content_rowid='rowid');

-- Auto-sync triggers
CREATE TRIGGER lt_ai AFTER INSERT ON long_term BEGIN ... END;
CREATE TRIGGER lt_ad AFTER DELETE ON long_term BEGIN ... END;
```

**WAL mode** enabled for concurrent read/write performance.

### Search

- **SQLite path:** FTS5 `MATCH` query with rank ordering
- **JSON fallback:** Keyword overlap scoring (tokenize query, count matches in JSON-serialized entries)

---

## 9. Permission System

**File:** `src/main/agent/permissions.js` (139 lines)

### Three-Tier Classification

| Level | Behavior | Examples |
|-------|----------|---------|
| **Safe** | Auto-approved, no user interaction | `fs_read`, `fs_list`, `web_search`, `system_info`, `llm_query` |
| **Sensitive** | Configurable (auto-approve or prompt) | `fs_write`, `fs_edit`, `system_exec`, `app_open`, `browser_navigate` |
| **Dangerous** | Always requires explicit user approval | `fs_delete`, `fs_move`, `fs_organize`, `browser_submit_form` |

### Pattern-Based Escalation

Certain parameter patterns automatically escalate a tool to "dangerous":

```javascript
// system_exec escalation patterns:
/\brm\s+(-rf?|--recursive)/i    // rm -rf
/\bsudo\b/i                      // sudo anything
/\bmkfs\b/i                      // format disk
/\bdd\b.*of=/i                   // dd write
/\bcurl\b.*\|\s*(bash|sh)/i     // pipe to shell

// fs_write escalation patterns:
/\/etc\//i, /\.ssh\//i, /\.env/i, /\.bashrc/i

// browser_type escalation patterns:
/password/i, /credit.?card/i, /ssn/i
```

### Audit Log

Every permission check is logged with tool name, sanitized params, level, and timestamp. Sensitive values (password, apiKey, token, secret) are redacted.

---

## 10. Persona System

**File:** `src/main/agent/personas.js` (90 lines)

### Built-in Personas

| Persona | System Prompt Style | Traits |
|---------|-------------------|--------|
| **Planner** | Strategic, breaks down goals, gathers info first | `planFirst: true`, `verbosity: medium`, `riskTolerance: low` |
| **Executor** | Action-oriented, decisive, terse | `planFirst: false`, `verbosity: low`, `riskTolerance: medium` |
| **Researcher** | Thorough, multi-source, cites sources | `planFirst: true`, `verbosity: high`, `riskTolerance: low` |
| **Custom** | Generic helpful assistant | Configurable |

Each persona has: `name`, `label`, `icon`, `color`, `description`, `systemPrompt`, `traits`.

---

## 11. Context Awareness

**File:** `src/main/agent/context.js` (99 lines)

Gathers live OS state with a 5-second cache TTL:

| Data | Source (macOS) | Source (Linux) |
|------|---------------|----------------|
| Active app | `osascript` (System Events) | `xdotool` |
| Active window | `osascript` (System Events) | `xdotool` |
| Running apps | `osascript` (every non-background process) | `wmctrl` |
| System info | `os` module (platform, arch, hostname, memory, CPUs, uptime) | Same |

This context is injected into the system prompt so the LLM knows what's currently happening on the user's machine.

---

## 12. KeyStore — Encrypted API Key Storage

**File:** `src/main/agent/keystore.js` (156 lines)

### Encryption Details

| Parameter | Value |
|-----------|-------|
| Algorithm | AES-256-GCM |
| Key derivation | PBKDF2 (SHA-512, 100,000 iterations) |
| Key length | 256 bits (32 bytes) |
| IV | 128 bits (16 bytes, random per write) |
| Auth tag | 128 bits (16 bytes) |
| Salt | 256 bits (32 bytes, random per keystore) |

### Machine Binding

The master key is derived from a machine-specific identity string:
```javascript
const machineId = `${os.userInfo().username}@${os.hostname()}:${os.homedir()}`;
// → PBKDF2(machineId, salt, 100000, 32, 'sha512')
```

This means the keystore file is **not portable** — it can only be decrypted on the same machine + user account.

### File Format

```
[salt:32 bytes][iv:16 bytes][tag:16 bytes][encrypted:variable]
```

Stored at: `{userData}/.keystore.enc`

### API

- `setKey(provider, apiKey)` — encrypt and persist
- `getKey(provider)` → raw API key (in-memory only)
- `removeKey(provider)` — delete and re-persist
- `listKeys()` → `{ provider: 'sk-a••••b1c2' }` (masked)
- `hasKey(provider)` → boolean
- `close()` — clear keys from memory

---

## 13. Renderer — React UI

### Component Tree

```
App.jsx
├── TitleBar.jsx          — Frameless window controls (minimize, maximize, close)
├── Sidebar.jsx           — Persona selector, tool list, session history
├── ChatPanel.jsx         — Main chat interface
│   ├── Message rendering (markdown, code blocks, URLs, file paths)
│   ├── Streaming token display
│   ├── Live tool call visualization (start → running → complete)
│   ├── Collapsible tool history
│   └── Input bar with persona indicator + model info
├── ContextPanel.jsx      — System info, running apps, resources
├── ApprovalDialog.jsx    — Human-in-the-loop approval for dangerous actions
└── SettingsModal.jsx     — LLM provider/model selection, API keys, agent config
```

### App.jsx — State Management

Key state variables:
- `messages[]` — chat message history (with tool calls, streaming text)
- `isProcessing` — whether agent is currently working
- `phaseLabel` — current phase ("Gathering context...", "Reasoning...", etc.)
- `settings` — loaded from main process on mount
- `tools` — registered tool list
- `history` — recent task history from memory
- `contextData` — live OS context

### Event Handling Flow

```
User types message → handleSend()
  → Generate client-side placeholder (uid)
  → Set isProcessing = true
  → api.sendMessage(message, persona)
  → Server emits agent:task-start → client patches placeholder with server taskId
  → Server streams agent:token → client accumulates text in message
  → Server emits agent:tool-calls → client shows tool call cards
  → Server emits agent:tool-start/end → client updates tool status
  → Server emits agent:complete → client sets isProcessing = false
```

### SettingsModal.jsx — Provider Configuration

- **PROVIDER_META** — display metadata for all 10 providers (icon, color, description, docs URL)
- **Provider card grid** — visual selector with active state highlighting
- **Model dropdown** — filtered by selected provider, shows context window size
- **API key management** — set/remove with masked display, links to provider docs
- **Agent settings** — max turns, temperature, max tokens, default persona, auto-approve toggles

### ChatPanel.jsx — Message Rendering

- **simpleMarkdown()** — lightweight markdown renderer (code blocks, bold, italic, lists, URLs, file paths)
- URLs become clickable links (opens in external browser)
- Absolute file paths become clickable links
- Tool calls rendered as expandable cards with status indicators
- Streaming tokens displayed in real-time

---

## 14. IPC Event Protocol

### Request-Response (invoke/handle)

```
Renderer                          Main Process
   │                                  │
   │── agent:send-message ──────────→ │
   │                                  │── handleUserMessage()
   │                                  │   ├── auto-persona
   │                                  │   ├── build system prompt
   │                                  │   └── AgentLoop.run()
   │                                  │
   │←── { taskId, summary } ─────────│
```

### Streaming Events (send/on)

```
Main Process                      Renderer
   │                                  │
   │── agent:task-start ────────────→ │  (adopt server taskId)
   │── agent:thinking ──────────────→ │  (show "Reasoning...")
   │── agent:token ─────────────────→ │  (append to message)
   │── agent:token ─────────────────→ │  (append to message)
   │── agent:tool-calls ────────────→ │  (show tool cards)
   │── agent:tool-start ────────────→ │  (tool spinner)
   │── agent:tool-end ──────────────→ │  (tool ✓ or ✗)
   │── agent:tool-results ──────────→ │  (results summary)
   │── agent:thinking ──────────────→ │  (next turn)
   │── agent:token ─────────────────→ │  (final answer)
   │── agent:complete ──────────────→ │  (done, show summary)
```

---

## 15. Data Flows

### User Message → Agent Response

```
1. User types message in ChatPanel
2. App.jsx handleSend() → api.sendMessage(message, persona)
3. preload.js → ipcRenderer.invoke('agent:send-message', { message, persona })
4. main.js IPC handler → agentCore.handleUserMessage(message, persona)
5. AgentCore:
   a. Generate taskId (uuidv4)
   b. Emit agent:task-start
   c. Auto-select persona (heuristic + LLM fallback)
   d. Gather OS context + search memory
   e. Build system prompt
   f. Emit agent:step-update (phase: 'running')
   g. AgentLoop.run({ messages, systemPrompt, taskId, options })
6. AgentLoop:
   a. Get tool definitions for current provider
   b. Truncate conversation if needed
   c. LLM callWithTools(systemPrompt, conversation, toolDefs)
   d. Provider adapter converts internal format → provider API
   e. HTTP request to LLM endpoint
   f. Parse response → { text, toolCalls, rawContent }
   g. If tool calls → execute → append results → loop
   h. If text → return final answer
7. AgentCore:
   a. Update session messages
   b. Persist to long-term memory
   c. Emit agent:complete
   d. Return { taskId, summary }
8. Renderer updates UI with final message
```

### API Key Storage Flow

```
1. User enters API key in SettingsModal
2. api.setApiKey(provider, apiKey)
3. preload.js → ipcRenderer.invoke('keys:set', { provider, apiKey })
4. main.js → agentCore.keyStore.setKey(provider, apiKey)
5. KeyStore:
   a. Store in memory: this.keys[provider] = apiKey
   b. JSON.stringify(this.keys)
   c. AES-256-GCM encrypt with PBKDF2-derived master key
   d. Write [salt][iv][tag][ciphertext] to .keystore.enc
6. On next LLM call:
   a. llm.js checks _keyStore.getKey(provider)
   b. Returns raw key from memory (never re-reads file)
```

---

## 16. Security Model

| Layer | Mechanism | Details |
|-------|-----------|---------|
| **Process isolation** | Electron context isolation | `contextIsolation: true`, `nodeIntegration: false` |
| **API key encryption** | AES-256-GCM + PBKDF2 | 100K iterations, machine-bound salt, keys never in plaintext on disk |
| **Path guards** | `guardPath()` in filesystem.js | Blocks `/System`, `/Library/System`, `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin` |
| **Command blockers** | Pattern-based escalation | `rm -rf`, `sudo`, `mkfs`, `dd of=/dev`, `curl | bash`, `chmod 777` → always dangerous |
| **Permission tiers** | Three-level classification | safe (auto), sensitive (configurable), dangerous (always prompt) |
| **Credential redaction** | Audit log sanitization | password, apiKey, token, secret, credential → `***REDACTED***` |
| **Approval timeouts** | Auto-deny after 5 minutes | Prevents indefinite blocking |
| **File size limits** | `fs_read` max 10MB | Prevents memory exhaustion |
| **Tool result trimming** | Max 8,000 chars per result | Prevents context overflow |
| **Conversation truncation** | 80K token budget | Removes old messages to stay within model limits |

---

## 17. File-by-File Reference

```
OpenDesktop/
├── package.json                    # Dependencies, scripts, metadata
├── vite.config.js                  # Vite config for React renderer
├── tailwind.config.js              # Tailwind CSS config (dark theme)
├── postcss.config.js               # PostCSS with Tailwind + Autoprefixer
│
├── src/main/                       # ═══ ELECTRON MAIN PROCESS ═══
│   ├── main.js                     # App entry: window creation, IPC setup, agent init
│   ├── preload.js                  # Context bridge: 30+ API methods exposed to renderer
│   │
│   └── agent/                      # ═══ AGENT BACKEND ═══
│       ├── core.js                 # AgentCore: orchestrator, auto-persona, system prompt
│       ├── loop.js                 # AgentLoop: ReAct loop, tool execution, approval gating
│       ├── llm.js                  # LLM client: 10 providers, 80+ models, 4 adapters
│       ├── memory.js               # MemorySystem: SQLite FTS5 + JSON fallback
│       ├── permissions.js          # PermissionManager: 3-tier classification + patterns
│       ├── personas.js             # PersonaManager: planner/executor/researcher/custom
│       ├── context.js              # ContextAwareness: live OS state (apps, windows, system)
│       ├── keystore.js             # KeyStore: AES-256-GCM encrypted API key storage
│       ├── planner.js              # TaskPlanner: legacy plan decomposition (fallback)
│       │
│       └── tools/                  # ═══ TOOL IMPLEMENTATIONS ═══
│           ├── registry.js         # ToolRegistry: registration + provider-specific schemas
│           ├── tool-schemas.js     # JSON Schema definitions for all 51 tools
│           ├── filesystem.js       # 11 tools: read, write, edit, list, search, move, organize...
│           ├── office.js           # 15 tools: PDF (with OCR), DOCX, XLSX (ExcelJS), PPTX (pptxgenjs), CSV
│           ├── app-control.js      # 6 tools: open (fuzzy), find, list, focus, quit, screenshot
│           ├── browser.js          # 5 tools: navigate, click, type, key, submit_form
│           ├── search-fetch.js     # 4 tools: web_search, web_fetch, web_fetch_json, web_download
│           ├── system.js           # 6 tools: exec, info, processes, clipboard, notify
│           └── llm-tools.js        # 4 tools: query, summarize, extract, code
│
└── src/renderer/                   # ═══ REACT UI ═══
    ├── index.html                  # HTML entry point
    ├── index.css                   # Global styles + Tailwind imports
    ├── main.jsx                    # React DOM render entry
    ├── App.jsx                     # Root component: state, events, layout
    │
    └── components/
        ├── TitleBar.jsx            # Frameless window controls
        ├── Sidebar.jsx             # Personas, tools, history
        ├── ChatPanel.jsx           # Chat messages, streaming, tool calls
        ├── ContextPanel.jsx        # OS context display
        ├── ApprovalDialog.jsx      # Dangerous action approval UI
        └── SettingsModal.jsx       # Provider/model/key/agent configuration
```

---

## 18. Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `better-sqlite3` | ^12.6.2 | Long-term memory storage with FTS5 |
| `electron-store` | ^8.1.0 | Settings persistence |
| `exceljs` | ^4.4.0 | Excel charts and pivot tables |
| `glob` | ^10.3.10 | File pattern matching for fs_search, fs_move |
| `jszip` | ^3.10.1 | PPTX reading + DOCX writing |
| `lucide-react` | ^0.312.0 | UI icons |
| `mammoth` | ^1.11.0 | DOCX text extraction |
| `marked` | ^11.1.1 | Markdown parsing |
| `node-fetch` | ^3.3.2 | HTTP requests for web tools |
| `pdf-parse` | ^2.4.5 | PDF text extraction (v2 class-based API) |
| `playwright` | ^1.41.1 | Browser automation |
| `react` | ^18.2.0 | UI framework |
| `react-dom` | ^18.2.0 | React DOM renderer |
| `uuid` | ^9.0.0 | Unique ID generation |
| `xlsx` | ^0.18.5 | Excel read/write (SheetJS) |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@vitejs/plugin-react` | ^4.2.1 | Vite React plugin |
| `autoprefixer` | ^10.4.17 | CSS vendor prefixes |
| `concurrently` | ^8.2.2 | Run Vite + Electron in parallel |
| `electron` | ^28.1.3 | Desktop app framework |
| `electron-builder` | ^24.9.1 | App packaging/distribution |
| `postcss` | ^8.4.33 | CSS processing |
| `tailwindcss` | ^3.4.1 | Utility-first CSS |
| `vite` | ^5.0.12 | Frontend build tool |
| `wait-on` | ^7.2.0 | Wait for Vite dev server before launching Electron |

### Optional System Dependencies (for enhanced PDF support)

| Dependency | Install | Purpose |
|-----------|---------|---------|
| PyMuPDF | `pip install PyMuPDF` | Render scanned PDF pages to images for OCR |
| Tesseract | `brew install tesseract` | OCR engine for scanned PDFs |
| Poppler | `brew install poppler` | `pdftotext` CLI fallback |
