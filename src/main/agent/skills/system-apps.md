# System & Application Control Tools Skill Guide

Last verified: 2026-04-06

12 tools for running shell commands, inspecting the system, managing the clipboard, sending notifications, and controlling applications. Platform support: macOS (primary), Linux, Windows.

---

## Tool Reference

### System Tools (6)

| Tool | Permission | Description |
|------|-----------|-------------|
| `system_exec` | sensitive | Execute any shell command (bash on macOS/Linux, PowerShell on Windows). Returns stdout + stderr. |
| `system_info` | safe | System information: OS, CPU, memory, hostname, username, uptime, load averages. |
| `system_processes` | safe | List top running processes sorted by CPU or memory usage. |
| `system_clipboard_read` | safe | Read the current system clipboard (paste buffer) text. |
| `system_clipboard_write` | sensitive | Copy text to the system clipboard. |
| `system_notify` | safe | Show a native OS notification popup with title and message. |

### Application Control Tools (6)

| Tool | Permission | Description |
|------|-----------|-------------|
| `app_open` | sensitive | Open an application, file, or URL. Fuzzy-matches app names, falls back to Spotlight. |
| `app_find` | safe | Search for installed applications by name with fuzzy matching. Returns top 10 matches with scores. |
| `app_list` | safe | List all currently running (visible/foreground) applications. |
| `app_focus` | sensitive | Bring a named application to the foreground. |
| `app_quit` | sensitive | Quit a running application. Optional force-kill. |
| `app_screenshot` | safe | Capture a screenshot of the full screen or a specific window. Saves as PNG. |

---

## Parameter Reference

### system_exec

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `command` | string | yes | - | Full shell command to execute. |
| `cwd` | string | no | `process.cwd()` | Working directory for the command. |
| `timeout` | number | no | `30000` | Timeout in milliseconds. Max buffer: 5 MB. |
| `env` | object | no | `{}` | Additional environment variables merged with `process.env`. |

Blocked patterns (always rejected): `rm -rf /`, `mkfs`, `dd ... of=/dev`. Shell: `/bin/bash` on macOS/Linux, `powershell.exe` on Windows.

### system_info

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `detail` | string | no | `"summary"` | `"summary"` for core info. `"full"` adds network interfaces, PATH, temp directory. |

Returns JSON with: platform, arch, release, hostname, username, homeDir, shell, nodeVersion, cpus, cpuModel, totalMemory, freeMemory, usedMemory, uptime, loadAvg.

### system_processes

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `sortBy` | string | no | `"cpu"` | Sort by `"cpu"` or `"memory"`. |
| `limit` | number | no | `15` | Number of top processes to return. |

### system_clipboard_read

No parameters. Returns the current clipboard text content.

### system_clipboard_write

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | yes | - | Text to copy to the clipboard. |

### system_notify

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | no | `"OpenDesktop"` | Notification title. |
| `message` | string | yes | - | Notification body text. |
| `sound` | boolean | no | `false` | Play the default notification sound (macOS only). |

macOS uses `osascript display notification`. Linux uses `notify-send`.

### app_open

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `target` | string | yes | - | App name, file path, or URL to open. |
| `app` | string | no | - | Specific application to open the target with (e.g. open a URL in a specific browser). |

Target detection: URLs start with `http://` or `https://`. File paths start with `/`, `~`, or `.`. Everything else is treated as an app name.

App name resolution order (macOS):
1. `open -a "target"` (exact name)
2. Fuzzy search across `/Applications`, `~/Applications`, `/System/Applications`, `/System/Applications/Utilities`
3. Spotlight (`mdfind`) as last resort

### app_find

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | yes | - | App name to search for (handles typos and partial matches). |

Returns up to 10 matches with name, match score (0-100%), and full `.app` path. Searches `/Applications`, `~/Applications`, `/System/Applications`, `/System/Applications/Utilities`.

### app_list

No parameters. Returns a comma-separated list of all visible (non-background) application names via AppleScript on macOS.

### app_focus

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `appName` | string | yes | - | Exact application name (e.g. "Safari", "Finder", "Terminal"). |

Uses AppleScript `tell application "X" to activate` on macOS.

### app_quit

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `appName` | string | yes | - | Exact application name. |
| `force` | boolean | no | `false` | If true, force-quit (no save dialog). If false, quits saving. |

macOS: `force: false` sends `quit saving yes` (saves before quitting). `force: true` sends `quit` (may lose unsaved work).

### app_screenshot

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `outputPath` | string | no | `/tmp/screenshot_<timestamp>.png` | Where to save the screenshot. |
| `window` | boolean/string | no | - | If truthy, capture a specific window instead of the full screen. |

macOS: Uses `screencapture`. Full screen uses `-x` (silent, no sound). Window mode uses `-w` (interactive window selection -- requires user click). Output is always PNG.

---

## Procedure: Run a Shell Command

```
system_exec({ command: "ls -la ~/Desktop" })
system_exec({ command: "git status", cwd: "~/Projects/my-app" })
system_exec({ command: "brew install ripgrep", timeout: 60000 })
system_exec({ command: "python3 script.py", cwd: "/tmp", env: { "DEBUG": "1" } })
```

For long-running commands, increase the timeout:

```
system_exec({ command: "npm install", cwd: "~/project", timeout: 120000 })
```

---

## Procedure: Find and Open an Application

1. Search first to verify the app exists:

```
app_find({ query: "vscode" })
```

Returns matches like: `Visual Studio Code (72% match) -- /Applications/Visual Studio Code.app`

2. Open it:

```
app_open({ target: "Visual Studio Code" })
```

Or just use `app_open` directly -- it handles fuzzy matching internally:

```
app_open({ target: "vscode" })
```

**Open a file with a specific app:**

```
app_open({ target: "~/Documents/notes.md", app: "Visual Studio Code" })
```

**Open a URL:**

```
app_open({ target: "https://github.com" })
```

**Open a URL in a specific browser:**

```
app_open({ target: "https://github.com", app: "Firefox" })
```

---

## Procedure: Take a Screenshot

**Full screen (silent, no user interaction):**

```
app_screenshot({})
```

Returns: `Screenshot saved to: /tmp/screenshot_1712345678901.png`

**Full screen to a specific path:**

```
app_screenshot({ outputPath: "~/Desktop/screenshot.png" })
```

**Window capture (requires user to click a window):**

```
app_screenshot({ window: true, outputPath: "~/Desktop/window.png" })
```

Note: Window mode on macOS triggers an interactive selection cursor. The user must click the target window.

---

## Procedure: Manage Running Applications

1. List what is running:

```
app_list()
```

Returns: `Finder, Safari, Terminal, Visual Studio Code, ...`

2. Bring an app to the foreground:

```
app_focus({ appName: "Safari" })
```

3. Quit an app gracefully:

```
app_quit({ appName: "Safari" })
```

4. Force-quit an unresponsive app:

```
app_quit({ appName: "Safari", force: true })
```

---

## Procedure: Check System Resources

**Quick summary:**

```
system_info({})
```

Returns CPU count/model, memory usage, OS version, uptime, load averages.

**Full detail (includes network interfaces and PATH):**

```
system_info({ detail: "full" })
```

**Top processes by CPU:**

```
system_processes({ sortBy: "cpu", limit: 10 })
```

**Top processes by memory:**

```
system_processes({ sortBy: "memory", limit: 20 })
```

---

## Procedure: Clipboard Operations

**Read what the user has copied:**

```
system_clipboard_read()
```

**Copy text for the user to paste:**

```
system_clipboard_write({ text: "Hello, world!" })
```

---

## Procedure: Notify the User

**Simple notification:**

```
system_notify({ message: "Your export is complete!" })
```

**With custom title and sound:**

```
system_notify({ title: "Download Finished", message: "report.pdf is ready", sound: true })
```

Use this after long-running tasks to alert the user.

---

## Known Issues and Gotchas

### system_exec timeout defaults to 30 seconds
Commands that take longer (npm install, large builds, video processing) WILL be killed. Always set an appropriate `timeout` for long-running commands. The max buffer is 5 MB -- commands producing more output will fail.

### system_exec returns combined stdout + stderr
Both stdout and stderr are concatenated in the result. Non-zero exit codes with output are treated as success (output is returned). Only commands that produce no output AND fail will throw an error.

### system_exec blocked commands
Three patterns are always blocked: `rm -rf /` (trailing slash), `mkfs`, and `dd` writing to `/dev`. These throw an error immediately. Other dangerous commands are allowed but require user approval due to the `sensitive` permission level.

### system_exec shell type
macOS/Linux use `/bin/bash`. Windows uses `powershell.exe`. Write commands accordingly. Do not assume bash features are available on Windows.

### app_open vs app_find: use app_find to verify first
`app_open` will try fuzzy matching and Spotlight, but if it cannot find the app, it throws an error. Use `app_find` first when unsure of the exact app name.

### app_open target detection
The tool decides whether the target is a URL, file path, or app name based on prefixes: `http://`/`https://` for URLs, `/`/`~`/`.` for file paths, everything else for app names. A target like `google.com` (no protocol) is treated as an app name and will fail. Always include `https://`.

### app_focus and app_quit require exact app names
These tools use AppleScript `tell application "X"` on macOS. The name must match what macOS knows the app as. Use `app_list` to see exact running app names. Common pitfalls:
- "VS Code" vs "Visual Studio Code" -- use the full name
- "Chrome" vs "Google Chrome" -- use the full name
- Background-only processes (like menu bar apps) do not appear in `app_list`

### app_quit force: false saves before quitting
On macOS, `force: false` (the default) sends `quit saving yes`, which tells the app to save open documents. `force: true` sends a plain `quit` which may discard unsaved changes. For truly unresponsive apps, use `system_exec({ command: "kill -9 <PID>" })` after finding the PID with `system_processes`.

### app_screenshot window mode is interactive
On macOS, `screencapture -w` presents a crosshair cursor and waits for the user to click a window. This blocks until the user interacts. Full-screen mode (`window` omitted or falsy) captures immediately with no interaction.

### app_screenshot format is always PNG
The output is always a PNG image regardless of the file extension in `outputPath`. If you need JPEG, use `system_exec` with `sips` to convert after capture.

### system_clipboard_write on macOS uses pbcopy
Data is piped to `pbcopy` via stdin. Very large clipboard content (tens of MB) may be slow. Text only -- images and rich content are not supported.

### system_clipboard_read returns empty string if clipboard is empty
It does not throw an error. If the clipboard contains non-text data (images, files), it returns an empty string.

### system_notify on macOS uses osascript
The notification appears in the macOS Notification Center. If the user has Do Not Disturb enabled, the notification is silently queued. The `sound` parameter only works on macOS. Linux uses `notify-send` (requires libnotify). Windows is not supported.

### system_processes output format varies by platform
On macOS/Linux, returns `ps aux` formatted output. On Windows, returns PowerShell `Format-Table` output. The column layout differs between platforms.

### app_list shows only foreground apps on macOS
Uses AppleScript `background only is false` filter. Menu bar apps, daemons, and background processes are excluded. Use `system_processes` to see all processes including background ones.

### App control tool timeout
All `app_control` tools have a 15-second timeout on the underlying shell command. AppleScript calls to unresponsive apps may hit this limit.

### Fuzzy matching threshold
`app_open` requires a fuzzy match score above 0.3 (30%) to consider a candidate. `app_find` returns anything above 0.2 (20%). Very short or very different names may not match. For exact-name launches, the tool tries `open -a` directly first before fuzzy search.
