# OpenDesktop

A local-first autonomous desktop agent that can observe, reason, and execute multi-step tasks across your OS using a true **ReAct (Reasoning + Acting)** loop with native LLM tool calling.

Built with **Electron + React + Node.js** — everything runs locally on your machine.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Electron Shell                       │
│  ┌──────────┐  ┌───────────────────┐  ┌───────────────┐ │
│  │ Sidebar   │  │    Chat Panel     │  │ Context Panel │ │
│  │ Personas  │  │ Streaming tokens  │  │ System info   │ │
│  │ Tools     │  │ Live tool calls   │  │ Running apps  │ │
│  │ History   │  │ Approval dialogs  │  │ Resources     │ │
│  └──────────┘  └───────────────────┘  └───────────────┘ │
│                         │ IPC                             │
│  ┌──────────────────────┴──────────────────────────────┐ │
│  │                    AgentCore                         │ │
│  │  Auto-persona → System prompt → AgentLoop (ReAct)   │ │
│  │       ↓              ↓               ↓              │ │
│  │  Heuristic +    OS context +     LLM call with      │ │
│  │  LLM classify   memory inject    native tool defs   │ │
│  │                                      ↓              │ │
│  │                              Tool calls? ──yes──→ Execute in parallel │
│  │                                  │                   ↓              │ │
│  │                                  no            Append results       │ │
│  │                                  ↓             Loop back to LLM     │ │
│  │                            Final text answer                       │ │
│  └──────────┬────────────────────────┬─────────────────┘ │
│  ┌──────────┴──────────┐  ┌──────────┴────────────────┐ │
│  │   Tool Registry      │  │    Memory System          │ │
│  │  • Filesystem (11)   │  │  • Short-term (100 msg)   │ │
│  │  • Office (8)        │  │  • Long-term (SQLite FTS) │ │
│  │  • App Control (6)   │  │  • Full-text search       │ │
│  │  • Browser (5)       │  │  • JSON fallback          │ │
│  │  • Search/Fetch (4)  │  ├──────────────────────────┤ │
│  │  • System (6)        │  │  Permission Manager       │ │
│  │  • LLM (4)           │  │  safe / sensitive / danger │ │
│  │  Total: 44 tools     │  └──────────────────────────┘ │
│  └──────────────────────┘                                │
└──────────────────────────────────────────────────────────┘
```

## Features

### True ReAct Agent Loop

The agent uses the same architecture as Claude Code, OpenAI Assistants, and other modern autonomous agents:

1. **No upfront plan** — the LLM decides what to do at every step based on full context
2. **Native tool calling** — uses each provider's native function/tool calling API (Anthropic, OpenAI, Gemini, Ollama)
3. **Full conversation history** — every LLM call sees all prior tool results, enabling multi-turn reasoning
4. **Parallel tool execution** — multiple independent tool calls in a single turn
5. **Dynamic recovery** — the model reacts to failures, explores alternative paths, and chains discoveries
6. **Session continuity** — follow-up questions ("tell me more", "open that file") resolve correctly using conversation history
7. **Configurable max turns** (default: 50)

### Auto-Persona Selection

The agent automatically selects the best persona for each request:

| Persona | Auto-selected when... | Style |
|---------|----------------------|-------|
| **Auto** (default) | Always — picks the best below | Adaptive |
| **Executor** | "create", "move", "open", "organize", "run", "install" | Action-oriented, decisive |
| **Researcher** | "search", "explain", "compare", "what is", "summarize" | Thorough, multi-source |
| **Planner** | "plan", "design", "architect", "strategy", "step-by-step" | Strategic, methodical |
| **Custom** | Manual selection | Configurable |

Uses fast keyword heuristics with weighted scoring (strong signals × 3 + weak signals), falling back to LLM classification for ambiguous requests.

### Multi-Provider LLM Support

Choose from **5 providers** and **40+ models** directly in the Settings UI:

| Provider | Models | Key Required |
|----------|--------|:------------:|
| **Ollama (Local)** | Llama 3/3.1/3.2/3.3, Mistral, Mixtral, CodeLlama, DeepSeek Coder V2, Qwen 2.5, Phi-3, Gemma 2, Command R + any locally installed model | No |
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-4, GPT-3.5 Turbo, o1, o1 Mini, o3 Mini | Yes |
| **Anthropic (Claude)** | Claude Opus 4.5, Claude Sonnet 4.5, Claude Sonnet 4, Claude 3.7 Sonnet, Claude 3.5 Sonnet v2, Claude 3.5 Haiku, Claude 3 Opus, Claude 3 Haiku | Yes |
| **Google (Gemini)** | Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash | Yes |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | Yes |

**LLM module features:**
- **Two calling modes**: `callLLM()` for simple text-in/text-out, `callWithTools()` for native agentic tool calling
- **Unified internal message format** — provider adapters convert to/from Anthropic, OpenAI, Gemini, and Ollama formats
- **Native tool calling** for all providers (not prompt-based JSON extraction)
- **Provider card selector** with one-click switching
- **Model dropdown** with context window size display
- **Ollama auto-discovery** — detects locally installed models via `ollama list`
- **Encrypted API key storage** — AES-256-GCM encryption with machine-specific key derivation (PBKDF2, 100K iterations)
- Keys are stored in `~/.config/open-desktop/.keystore.enc`, never in plaintext

### Unified Tool System (44 tools)

All tools have full **JSON Schema definitions** (`tool-schemas.js`) for native function calling with every LLM provider.

| Category | Tools | Count | Permission |
|----------|-------|:-----:|------------|
| **Filesystem** | `fs_read`, `fs_write`, `fs_edit`, `fs_list`, `fs_search`, `fs_delete`, `fs_move`, `fs_mkdir`, `fs_tree`, `fs_info`, `fs_organize` | 11 | Safe/Sensitive/Dangerous |
| **Office Documents** | `office_read_pdf`, `office_read_docx`, `office_write_docx`, `office_read_xlsx`, `office_write_xlsx`, `office_chart_xlsx`, `office_read_pptx`, `office_read_csv`, `office_write_csv` | 9 | Safe/Sensitive |
| **App Control** | `app_open`, `app_find`, `app_list`, `app_focus`, `app_quit`, `app_screenshot` | 6 | Safe/Sensitive |
| **Browser** | `browser_navigate`, `browser_click`, `browser_type`, `browser_key`, `browser_submit_form` | 5 | Sensitive/Dangerous |
| **Search/Fetch** | `web_search`, `web_fetch`, `web_fetch_json`, `web_download` | 4 | Safe/Sensitive |
| **System** | `system_exec`, `system_info`, `system_processes`, `system_clipboard_read`, `system_clipboard_write`, `system_notify` | 6 | Safe/Sensitive |
| **LLM** | `llm_query`, `llm_summarize`, `llm_extract`, `llm_code` | 4 | Safe |

#### Key tool capabilities

- **`fs_read`** — Reads text files AND binary documents (PDF, DOCX, XLSX, PPTX) with automatic extraction via `textutil`, `pdftotext`, or Python libraries
- **`fs_move`** — Supports glob patterns (`*.jpg`, `**/*.png`) for batch moves; cross-device fallback (copy+delete)
- **`fs_organize`** — Atomic directory organizer: classifies files by extension into category folders (Images, Videos, Documents, etc.), only moves files (never subdirectories), supports dry-run preview and custom rules
- **`app_open`** — Smart app resolution: fuzzy-matches app names against `/Applications` (handles typos like "olama" → "Ollama"), falls back to Spotlight search
- **`app_find`** — Search for installed apps by name with fuzzy matching and confidence scores
- **`office_read_pdf`** — Full PDF text extraction via `pdf-parse` with page range support and password handling
- **`office_read_docx`** — Word document extraction via `mammoth` (text or HTML output)
- **`office_write_docx`** — Creates `.docx` files from markdown-like content (headings, bullets, numbered lists)
- **`office_read_xlsx`** / **`office_write_xlsx`** — Full Excel read/write via SheetJS: cell values, formulas (`=SUM`, `=VLOOKUP`), multi-sheet support
- **`office_chart_xlsx`** — Add charts and pivot tables to Excel workbooks via ExcelJS
- **`office_read_pptx`** — PowerPoint slide extraction (titles, body text, speaker notes) via JSZip XML parsing
- **`office_read_csv`** / **`office_write_csv`** — CSV/TSV with auto-delimiter detection, pagination, and JSON output

### Memory System
- **Short-term**: Rolling 100-message window for current session context
- **Long-term**: Persistent **SQLite database** with FTS5 full-text search (WAL mode for performance)
- **JSON fallback**: Graceful degradation if `better-sqlite3` native module isn't built
- **Auto-migration**: Existing JSON memory data is automatically migrated to SQLite on first run
- **Session management**: `newSession()` clears conversation history for fresh starts

### Permission Controls
- **Safe** (auto-approved): Read files, search, fetch, system info, list apps, read office documents
- **Sensitive** (configurable): Write files, run commands, open apps, write office documents
- **Dangerous** (always requires approval): Delete files, move files, organize directories, sudo, form submissions
- Pattern-based escalation (e.g., `rm -rf` detected → always dangerous)
- Full audit log of all permission checks

### Streaming UI
- **Real-time token streaming** from LLM responses
- **Live tool call visualization** — see each tool start, run, and complete with status indicators
- **Collapsible tool history** — expand any completed tool call to see its output
- **Phase indicators** — "Gathering context...", "Reasoning...", "Running fs_list...", etc.
- **Human-in-the-loop approval dialogs** with countdown timer for dangerous operations
- **New Session button** to clear conversation and start fresh
- **Context awareness sidebar** (active app, system resources, running processes)
- **Dark theme** with glass morphism design and smooth animations

## Setup

### Prerequisites
- **Node.js** ≥ 18
- **npm** ≥ 9

### Install

```bash
cd OpenDesktop
npm install
```

### Configure LLM

**Option A: Local with Ollama (default, no API key needed)**
```bash
# Install Ollama: https://ollama.ai
ollama pull llama3
# The app auto-discovers installed models at http://localhost:11434
```

**Option B: Cloud Providers (OpenAI, Claude, Gemini, DeepSeek)**

1. Open the app → Settings (gear icon) → **LLM & Models** tab
2. Click a provider card (OpenAI, Anthropic, Google, DeepSeek)
3. Paste your API key → click **Save Key** (encrypted automatically)
4. Select a model from the dropdown
5. Click **Save Settings**

API keys are encrypted with AES-256-GCM using a machine-specific derived key and stored locally in `.keystore.enc`. They never leave your machine.

| Provider | Get API Key |
|----------|-------------|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| Google | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| DeepSeek | [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |

### Optional: Office Document Support

For full PDF/Excel/PPTX reading, the following are bundled as npm dependencies (installed automatically):
- **pdf-parse** — PDF text extraction
- **mammoth** — DOCX reading
- **xlsx (SheetJS)** — Excel read/write
- **exceljs** — Excel charts and pivot tables
- **jszip** — PPTX XML extraction

### Run

```bash
# Development mode (hot reload)
npm run dev

# Production
npm start
```

## Project Structure

```
OpenDesktop/
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.js              # App entry, window, IPC setup
│   │   ├── preload.js           # Context bridge API (streaming events)
│   │   └── agent/
│   │       ├── core.js          # AgentCore — orchestrator, auto-persona, system prompt builder
│   │       ├── loop.js          # AgentLoop — ReAct loop with native tool calling
│   │       ├── planner.js       # Legacy planner (fallback for simple tasks)
│   │       ├── personas.js      # Persona definitions + manager
│   │       ├── llm.js           # Multi-provider LLM client (callLLM + callWithTools)
│   │       ├── keystore.js      # AES-256-GCM encrypted API key storage
│   │       ├── memory.js        # SQLite FTS5 memory with JSON fallback
│   │       ├── permissions.js   # Permission classification + audit
│   │       ├── context.js       # OS context awareness
│   │       └── tools/
│   │           ├── registry.js      # Tool registration + provider-specific schema generation
│   │           ├── tool-schemas.js  # JSON Schema definitions for all 44 tools
│   │           ├── filesystem.js    # 11 file ops (read, write, move, organize, tree, etc.)
│   │           ├── office.js        # 9 office document ops (PDF, DOCX, XLSX, PPTX, CSV)
│   │           ├── app-control.js   # 6 app ops (open with fuzzy match, find, list, etc.)
│   │           ├── browser.js       # 5 browser/UI automation ops
│   │           ├── search-fetch.js  # 4 web ops
│   │           ├── system.js        # 6 system ops
│   │           └── llm-tools.js     # 4 LLM ops
│   └── renderer/                # React UI
│       ├── index.html
│       ├── index.css
│       ├── main.jsx
│       ├── App.jsx              # Main app — streaming event handling, session management
│       └── components/
│           ├── TitleBar.jsx
│           ├── Sidebar.jsx      # Auto/Planner/Executor/Researcher personas, tool list
│           ├── ChatPanel.jsx    # Streaming messages, live tool calls, tool history
│           ├── ContextPanel.jsx
│           ├── ApprovalDialog.jsx
│           └── SettingsModal.jsx
├── assets/
│   └── icon.png
└── .gitignore
```

## Security Model

1. **Encrypted key storage**: API keys encrypted with AES-256-GCM, PBKDF2 key derivation (100K iterations), machine-bound salt
2. **Path guards**: System directories (`/System`, `/bin`, `/sbin`) are blocked
3. **Command blockers**: `rm -rf /`, `mkfs`, `dd of=/dev` are blocked at tool level
4. **Pattern escalation**: Dangerous shell patterns auto-escalate to `dangerous` permission
5. **Credential redaction**: Passwords, API keys, tokens are redacted in audit logs
6. **Approval timeouts**: Pending approvals auto-deny after 5 minutes
7. **Context isolation**: Renderer runs with `contextIsolation: true`, no `nodeIntegration`
8. **Parallel approval gating**: Dangerous tools are gated through approval before execution; safe tools run in parallel

## License

MIT
