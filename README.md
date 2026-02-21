# OpenDesktop

A local-first desktop agent application that can observe, plan, and execute multi-step tasks across your OS.

Built with **Electron + React + Node.js** — everything runs locally on your machine.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Electron Shell                     │
│  ┌──────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ Title Bar │  │    Chat Panel    │  │  Context   │ │
│  │ Sidebar   │  │  (Streaming UI)  │  │   Panel    │ │
│  │ Personas  │  │  Approval Dlgs   │  │  Sys Info  │ │
│  └──────────┘  └──────────────────┘  └────────────┘ │
│                        │ IPC                         │
│  ┌─────────────────────┴───────────────────────────┐ │
│  │                  Agent Core                      │ │
│  │  Intent → Planner → Tool Router → Executor      │ │
│  │           ↓                          ↓           │ │
│  │     Task Decomposition         Feedback Loop     │ │
│  │           ↓                          ↓           │ │
│  │    Persona System            Re-plan if needed   │ │
│  └──────────┬──────────────────────────┬───────────┘ │
│  ┌──────────┴──────────┐  ┌────────────┴───────────┐ │
│  │    Tool Registry     │  │    Memory System       │ │
│  │  • Filesystem (8)    │  │  • Short-term (50 msg) │ │
│  │  • App Control (5)   │  │  • Long-term (JSON)    │ │
│  │  • Browser (5)       │  │  • Keyword search      │ │
│  │  • Search/Fetch (4)  │  │                        │ │
│  │  • System (6)        │  ├────────────────────────┤ │
│  │  • LLM (4)           │  │  Permission Manager    │ │
│  │  Total: 32 tools     │  │  safe/sensitive/danger  │ │
│  └──────────────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Features

### Agent Loop
- **User Intent** → **Task Decomposition** → **Tool Selection** → **Execution** → **Feedback** → **Iterate**
- **Autonomous Execution**: Steps can depend on prior step outputs. The agent automatically resolves parameters at runtime using LLM context (e.g., listing a directory, then reading a specific file from that list).
- Automatic re-planning when steps fail, with context of prior step results.
- Configurable max steps per task

### Multi-Provider LLM Support

Choose from **5 providers** and **40+ models** directly in the Settings UI:

| Provider | Models | Key Required |
|----------|--------|:------------:|
| **Ollama (Local)** | Llama 3/3.1/3.2/3.3, Mistral, Mixtral, CodeLlama, DeepSeek Coder V2, Qwen 2.5, Phi-3, Gemma 2, Command R + any locally installed model | No |
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-4, GPT-3.5 Turbo, o1, o1 Mini, o1 Preview, o3 Mini | Yes |
| **Anthropic (Claude)** | Claude Sonnet 4, Claude 3.7 Sonnet, Claude 3.5 Sonnet v2, Claude 3.5 Haiku, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku | Yes |
| **Google (Gemini)** | Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 1.5 Flash 8B | Yes |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | Yes |

**Key features:**
- **Provider card selector** with one-click switching
- **Model dropdown** with context window size display
- **Ollama auto-discovery** — detects locally installed models via `ollama list`
- **Encrypted API key storage** — AES-256-GCM encryption with machine-specific key derivation (PBKDF2, 100K iterations)
- Keys are stored in `~/.config/open-desktop/.keystore.enc`, never in plaintext
- **Per-provider key management** — save, change, or remove keys independently
- Each provider shows a masked key preview (e.g., `sk-a••••xyz9`) when stored

### Unified Tool System (34 tools)

| Category | Tools | Permission |
|----------|-------|------------|
| **Filesystem** | `fs_read`, `fs_write`, `fs_edit`, `fs_list`, `fs_search`, `fs_delete`, `fs_move`, `fs_mkdir`, `fs_tree`, `fs_info` | Safe/Sensitive/Dangerous |
| **App Control** | `app_open`, `app_list`, `app_focus`, `app_quit`, `app_screenshot` | Safe/Sensitive |
| **Browser** | `browser_navigate`, `browser_click`, `browser_type`, `browser_key`, `browser_submit_form` | Sensitive/Dangerous |
| **Search/Fetch** | `web_search`, `web_fetch`, `web_fetch_json`, `web_download` | Safe/Sensitive |
| **System** | `system_exec`, `system_info`, `system_processes`, `system_clipboard_read`, `system_clipboard_write`, `system_notify` | Safe/Sensitive |
| **LLM** | `llm_query`, `llm_summarize`, `llm_extract`, `llm_code` | Safe |

### Memory System
- **Short-term**: Rolling 50-message window for current session context
- **Long-term**: Persistent JSON storage with keyword-based search
- Automatic overflow summarization from short-term to long-term

### Personas
| Persona | Style | Preferred Tools |
|---------|-------|----------------|
| **Planner** | Strategic, plans first, low risk | `fs_read`, `fs_list`, `web_search`, `llm_query` |
| **Executor** | Action-oriented, terse, direct | `system_exec`, `fs_write`, `fs_edit`, `app_open` |
| **Researcher** | Thorough, multi-source, cites sources | `web_search`, `web_fetch`, `fs_read`, `llm_query` |
| **Custom** | Configurable in settings | Any |

### Permission Controls
- **Safe** (auto-approved): Read files, search, fetch, system info
- **Sensitive** (configurable): Write files, run commands, open apps
- **Dangerous** (always requires approval): Delete files, sudo, form submissions with credentials
- Pattern-based escalation (e.g., `rm -rf` detected → always dangerous)
- Full audit log of all permission checks

### Streaming UI
- Real-time task progress with phase indicators
- Step-by-step execution display
- Human-in-the-loop approval dialogs with countdown timer
- Context awareness sidebar (active app, system resources, running processes)
- Dark theme with glass morphism design

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
│   │   ├── main.js              # App entry, window, IPC
│   │   ├── preload.js           # Context bridge API
│   │   └── agent/
│   │       ├── core.js          # Agent loop orchestrator
│   │       ├── planner.js       # Task decomposition + re-planning
│   │       ├── personas.js      # Persona definitions + manager
│   │       ├── llm.js           # Multi-provider LLM client (5 providers, 40+ models)
│   │       ├── keystore.js      # AES-256-GCM encrypted API key storage
│   │       ├── memory.js        # Short-term + long-term memory
│   │       ├── permissions.js   # Permission classification + audit
│   │       ├── context.js       # OS context awareness
│   │       └── tools/
│   │           ├── registry.js  # Tool registration + lookup
│   │           ├── filesystem.js    # 8 file ops
│   │           ├── app-control.js   # 5 app ops
│   │           ├── browser.js       # 5 browser ops
│   │           ├── search-fetch.js  # 4 web ops
│   │           ├── system.js        # 6 system ops
│   │           └── llm-tools.js     # 4 LLM ops
│   └── renderer/                # React UI
│       ├── index.html
│       ├── index.css
│       ├── main.jsx
│       ├── App.jsx
│       └── components/
│           ├── TitleBar.jsx
│           ├── Sidebar.jsx
│           ├── ChatPanel.jsx
│           ├── ContextPanel.jsx
│           ├── ApprovalDialog.jsx
│           └── SettingsModal.jsx   # Full model catalog + key management UI
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

## License

MIT
