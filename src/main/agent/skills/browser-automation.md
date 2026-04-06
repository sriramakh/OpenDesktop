# Browser Automation & Tab Management Skill Guide

Last verified: 2026-04-06

14 tools total: 5 browser tools (system-level) + 9 tabs tools (AppleScript/CDP per-tab control).

---

## Tool Reference

### Browser Tools (system-level, category: browser)

| Tool | Permission | Parameters | Description |
|------|-----------|------------|-------------|
| `browser_navigate` | sensitive | `url` | Opens a URL in the **default** browser. Spawns a new window/tab via `open` (macOS). Does NOT control which browser or tab. |
| `browser_click` | sensitive | `x`, `y`, `button` | Click at screen pixel coordinates. Uses cliclick (preferred) or AppleScript System Events. `button`: "left" (default) or "right". |
| `browser_type` | sensitive | `text`, `delay` | Type text into the currently focused element. Uses cliclick or AppleScript keystroke. `delay`: ms between keys (default 50). |
| `browser_key` | sensitive | `keys` | Press keyboard shortcuts. Format: "cmd+c", "ctrl+shift+t", "enter", "tab", "escape". Supports modifiers: cmd/command, ctrl/control, shift, alt/option. |
| `browser_submit_form` | dangerous | `url`, `data`, `contentType` | HTTP POST via curl. `data`: object or string. `contentType` default: "application/json". Server-side submission, not browser-based. |

### Tabs Tools (per-tab control, category: tabs)

| Tool | Permission | Parameters | Description |
|------|-----------|------------|-------------|
| `tabs_list` | read | `browser` | List all open tabs across running browsers. Returns browser, windowIndex, tabIndex, title, URL, active state, memory usage. `browser`: "all" (default), "chrome", "safari", "firefox", "brave", "edge", "arc", "opera". |
| `tabs_navigate` | sensitive | `browser`\*, `url`\*, `windowIndex`, `tabIndex`, `newTab` | Navigate an existing tab to a URL, or open a new tab. Preferred over `browser_navigate` — does NOT spawn a new browser window. `newTab`: true to open new tab instead of replacing current. |
| `tabs_close` | sensitive | `browser`, `windowIndex`, `tabIndex`, `urlPattern`, `duplicatesOnly` | Three modes: (1) specific tab by browser+window+tab, (2) regex `urlPattern` matching URL/title, (3) `duplicatesOnly=true` removes duplicate URLs keeping one. |
| `tabs_read` | read | `browser`\*, `windowIndex`\*, `tabIndex`\*, `maxLength` | Read visible text of a tab. Strips nav/ads/scripts. `maxLength` default: 15000. Falls back to URL fetch for public pages if JS is blocked. |
| `tabs_focus` | read | `browser`\*, `windowIndex`\*, `tabIndex`\* | Bring a specific tab to the foreground and activate it. |
| `tabs_find_duplicates` | read | `browser` | Analyze tabs for exact duplicates, near-duplicates (same URL ignoring query/hash), and same-domain clusters. Reports memory usage per browser. |
| `tabs_find_forms` | read | `browser`\*, `windowIndex`\*, `tabIndex`\* | Detect all fillable form fields on the page. Returns type, name, id, label, placeholder, value (redacted for sensitive fields), required status, and select options. |
| `tabs_fill_form` | sensitive | `browser`\*, `windowIndex`\*, `tabIndex`\*, `fields`\*, `submit` | Fill form fields by name/id/label. `fields`: object mapping identifier to value. Uses native value setters (works with React/Vue/Angular). `submit`: true to click submit after filling (default false — always confirm with user first). |
| `tabs_run_js` | sensitive | `browser`\*, `windowIndex`\*, `tabIndex`\*, `code`\* | Execute arbitrary JavaScript in a tab's page context. Return value is JSON-serialized for objects. Use for custom interactions not covered by other tabs tools. |

\* = required parameter

---

## Critical Rules

### 1. Use `tabs_navigate` for Opening URLs, NOT `browser_navigate`

`browser_navigate` opens the system default browser and creates a new window. It gives no control over which browser, window, or tab is used.

`tabs_navigate` targets a specific running browser, can open a new tab in an existing window, or navigate an existing tab. Always prefer it unless the user explicitly wants to launch a new browser window.

```
CORRECT:   tabs_navigate  browser="chrome"  url="https://example.com"  newTab=true
WRONG:     browser_navigate  url="https://example.com"
```

### 2. Always Call `tabs_list` First

Before using any tool that requires `windowIndex` and `tabIndex`, call `tabs_list` to discover the current tab layout. The indices are 1-based and come directly from the browser's window/tab ordering.

### 3. JavaScript Execution Requires One-Time Setup

`tabs_read`, `tabs_find_forms`, `tabs_fill_form`, and `tabs_run_js` all require JavaScript execution in the browser tab. This needs one of:

**Option A — Allow JavaScript from Apple Events (recommended, works with default Chrome/Safari session):**
- Chrome: Open DevTools (Cmd+Option+I), then Chrome menu bar > View > Developer > Allow JavaScript from Apple Events. One-time, persists across restarts.
- Safari: Safari menu > Settings > Advanced > "Show Develop menu in menu bar", then Develop menu > Allow JavaScript from Apple Events.

**Option B — Chrome DevTools Protocol (CDP, separate profile):**
- Run: `bash scripts/launch-chrome-debug.sh`
- Opens Chrome with a separate "ChromeDebug" profile on port 9222
- Log in to accounts once — logins persist for future sessions
- Provides full CDP capability without needing Apple Events permission

### 4. Never Ask for Sensitive Field Values Without Permission

`tabs_fill_form` redacts sensitive fields (password, CVV, SSN, credit card). Always ask the user to provide these values before calling the tool. Never invent or guess sensitive values.

### 5. `submit=false` by Default

`tabs_fill_form` defaults to `submit=false`. Always confirm with the user before setting `submit=true`. Show them which fields will be filled and ask for explicit approval to submit.

---

## Procedure: Open a URL in a Specific Browser

1. Call `tabs_navigate` with `browser` and `url`. Set `newTab=true` to open in a new tab.
2. If the browser is not running, `tabs_navigate` will activate it and create a new window.
3. To navigate an existing tab instead, provide `windowIndex` and `tabIndex` (from `tabs_list`).

```
Step 1: tabs_navigate  browser="chrome"  url="https://docs.google.com"  newTab=true
```

---

## Procedure: Read Page Content from a Browser Tab

1. Call `tabs_list` to find the tab.
2. Call `tabs_read` with `browser`, `windowIndex`, `tabIndex`.
3. If JS execution is blocked, `tabs_read` automatically falls back to URL fetch for public pages.
4. If the page requires login and JS is blocked, the tool returns setup instructions.

```
Step 1: tabs_list  browser="chrome"
Step 2: tabs_read  browser="chrome"  windowIndex=1  tabIndex=3  maxLength=20000
```

**Auth wall detection**: The tool detects login pages for known domains (Google, Facebook, GitHub, etc.) and returns a clear message instead of raw login-page HTML.

---

## Procedure: Fill a Web Form

1. Call `tabs_list` to identify the tab with the form.
2. Call `tabs_find_forms` to discover all fillable fields (names, ids, labels, types, options).
3. Map user-provided data to field identifiers. Use `name`, `id`, or label text as keys.
4. Call `tabs_fill_form` with the `fields` object. Set `submit=false`.
5. Ask the user to review the filled form in their browser.
6. Only after user confirmation, call `tabs_fill_form` again with `submit=true` (or just the submit action).

```
Step 1: tabs_list  browser="chrome"
Step 2: tabs_find_forms  browser="chrome"  windowIndex=1  tabIndex=2
Step 3: (analyze field names — "email", "first_name", "city", etc.)
Step 4: tabs_fill_form  browser="chrome"  windowIndex=1  tabIndex=2  fields={"email":"user@example.com","first_name":"John","city":"New York"}  submit=false
Step 5: (ask user to review)
Step 6: tabs_fill_form  browser="chrome"  windowIndex=1  tabIndex=2  fields={}  submit=true
```

**React/Vue/Angular compatibility**: The fill script uses native property descriptors (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`) and dispatches `input`, `change`, and `blur` events. This ensures framework state updates correctly.

**Field matching priority**: The tool searches in this order: `[name="key"]` > `#key` > `[placeholder="key"]` > label text containing key (case-insensitive).

---

## Procedure: Manage Tabs (Clean Up Duplicates)

1. Call `tabs_find_duplicates` to analyze all browsers for exact duplicates, near-duplicates, and same-domain clusters.
2. Review the report with the user — show which duplicates exist and estimated memory savings.
3. Call `tabs_close` with `duplicatesOnly=true` to remove all duplicates (keeps one copy of each).
4. Or call `tabs_close` with a specific `urlPattern` regex to close tabs matching a pattern.

```
Step 1: tabs_find_duplicates  browser="all"
Step 2: (show report to user)
Step 3: tabs_close  duplicatesOnly=true
```

---

## Procedure: Run Custom JavaScript in a Tab

1. Call `tabs_list` to identify the tab.
2. Call `tabs_run_js` with `code`. The code is wrapped in an eval, so both expressions (`document.title`) and multi-statement blocks work.
3. Return values are auto-stringified. Objects/arrays are JSON-serialized.

```
Step 1: tabs_list  browser="safari"
Step 2: tabs_run_js  browser="safari"  windowIndex=1  tabIndex=1  code="document.querySelectorAll('h2').length"
```

---

## Procedure: Interact with Page Elements (Click, Type, Keyboard)

The `browser_click`, `browser_type`, and `browser_key` tools operate at the OS level using screen coordinates and system keyboard events. They are browser-agnostic but imprecise.

**Prefer `tabs_fill_form` and `tabs_run_js` over browser_click/browser_type** for web interactions. The OS-level tools are useful for:
- Clicking UI elements that cannot be targeted by DOM selectors (e.g., browser chrome, native dialogs)
- Typing into elements that resist programmatic value setting
- Keyboard shortcuts that affect the browser itself (Cmd+T for new tab, Cmd+W to close)

```
Example — close current tab via keyboard:
  browser_key  keys="cmd+w"

Example — select all text and copy:
  browser_key  keys="cmd+a"
  browser_key  keys="cmd+c"
```

---

## Procedure: Submit Data to an API (Server-Side POST)

`browser_submit_form` sends an HTTP POST via curl. It does NOT interact with the browser DOM.

Use it for:
- Submitting data to a REST API endpoint
- Posting form data to a server directly
- Webhook triggers

```
browser_submit_form  url="https://api.example.com/submit"  data={"name":"John","email":"john@example.com"}  contentType="application/json"
```

For browser-based form submission (clicking a submit button in the user's browser tab), use `tabs_fill_form` with `submit=true` instead.

---

## Browser Support Matrix

| Feature | Chrome | Safari | Brave/Edge/Arc | Firefox |
|---------|--------|--------|-----------------|---------|
| Tab listing | AppleScript + CDP | AppleScript | AppleScript + CDP | NOT SUPPORTED |
| Tab navigation | AppleScript + CDP | AppleScript | AppleScript + CDP | BiDi (limited) |
| Tab close | AppleScript + CDP | AppleScript | AppleScript + CDP | BiDi (limited) |
| Tab focus | AppleScript | AppleScript | AppleScript | NOT SUPPORTED |
| Read tab content | JS via Apple Events or CDP | JS via Apple Events | JS via Apple Events or CDP | NOT SUPPORTED |
| Form detection | JS via Apple Events or CDP | JS via Apple Events | JS via Apple Events or CDP | NOT SUPPORTED |
| Form filling | JS via Apple Events or CDP | JS via Apple Events | JS via Apple Events or CDP | NOT SUPPORTED |
| Run JS | JS via Apple Events or CDP | JS via Apple Events | JS via Apple Events or CDP | NOT SUPPORTED |

**JS execution priority**: CDP (if debug port available) > AppleScript JavaScript > URL fetch fallback (read-only, public pages only).

---

## Known Issues & Gotchas

### Firefox is Severely Limited

Firefox 129+ uses WebDriver BiDi instead of CDP. The BiDi protocol requires a geckodriver-managed session to access browsing contexts, which cannot attach to the user's existing Firefox window. Result:
- Tab listing: NOT SUPPORTED (throws an error with instructions to use Chrome/Safari)
- Tab reading, form filling, JS execution: NOT SUPPORTED
- Navigation: Partial — can open URLs via `open -a Firefox` system command fallback
- Recommendation: Always suggest Chrome or Safari when the user needs tab automation

### Chrome Debug Profile is Separate

`scripts/launch-chrome-debug.sh` uses `~/Library/Application Support/Google/ChromeDebug` as its user data directory. This is intentional — Chrome's security blocks `--remote-debugging-port` on the default profile. Consequence: the user must log in to their accounts once in the ChromeDebug profile. Those logins persist for future sessions.

### Auth Wall Detection

When `tabs_read` falls back to URL fetch (JS blocked), it checks for auth walls on known domains (Google, Facebook, GitHub, LinkedIn, etc.). If detected, it returns setup instructions instead of useless login-page HTML. The detection uses:
- Domain-based: known AUTH_DOMAINS set (mail.google.com, facebook.com, etc.)
- Root path of auth domains is always treated as a login page
- Signal-based: "sign in to continue", "forgot password", "continue with google", etc. (requires 2+ signals)

### AppleScript Variable Naming

Internal implementation detail, but if debugging or modifying the tool code:
- NEVER name a variable `result` in AppleScript — it is the implicit return variable
- Use `(ASCII character 10)` for newlines, NOT `"\n"` (which becomes literal backslash-n)
- Use index-based iteration (`repeat with i from 1 to count`) not `repeat with t in tabs`

### Tab Indices Are 1-Based and Volatile

Window and tab indices from `tabs_list` are 1-based. They can change if the user opens, closes, or reorders tabs between calls. Always call `tabs_list` immediately before operations that depend on specific indices.

### CDP Port Conflicts

Chrome, Brave, Edge, and Arc all share port 9222 for CDP. Only one can use CDP at a time. If multiple Chromium browsers are running with debug ports, only the first one on port 9222 will respond. Firefox uses port 9223 (BiDi, not CDP).

### `browser_click` Coordinate Accuracy

Screen coordinates are pixel-based and depend on display resolution and scaling. On Retina displays, coordinates may need adjustment. The tool uses cliclick (if installed) with AppleScript System Events as fallback. cliclick is more reliable — install via `brew install cliclick`.

### `browser_submit_form` Is NOT Browser-Based

Despite its name, `browser_submit_form` is a server-side HTTP POST via curl. It does not interact with any browser tab, does not carry the user's cookies or session, and does not execute JavaScript. For submitting forms in the user's actual browser session, use `tabs_fill_form` with `submit=true`.

### Timeout Limits

- AppleScript commands: 15-20 second timeout
- CDP WebSocket: 20 second timeout
- JS execution in tabs: 30 second timeout
- browser_click/type/key: 15 second timeout
- browser_submit_form (curl): 15 second timeout
- Tab reading URL fetch fallback: 20 second timeout

### `maxLength` on `tabs_read`

Default is 15000 characters. For long pages, increase to 50000. Very long pages will be truncated with a `[...truncated at N chars]` marker. If the user needs the full content of a very long page, consider using `web_fetch` with a higher `maxLength` (up to 50000) on the tab's URL — but note this fetches the public version, not the authenticated session.
