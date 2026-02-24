/**
 * Browser Tab Management & Form Automation Tools
 *
 * 9 tools for Chrome, Safari, Firefox, Brave, Edge, Arc on macOS.
 *
 * Architecture:
 *  1. Chrome/Firefox CDP (--remote-debugging-port)  → full capability, preferred
 *  2. AppleScript                                   → listing, navigation, focus, close
 *  3. AppleScript JS injection                      → read/forms/fill (needs "Allow JS from Apple Events")
 *  4. URL-fetch fallback                            → tabs_read on public pages
 *
 * Setup scripts:
 *  - scripts/launch-chrome-debug.sh  → Chrome with --remote-debugging-port=9222
 *  - scripts/launch-firefox-debug.sh → Firefox with --remote-debugging-port=9223
 *
 * IMPORTANT AppleScript rules (avoid regressions):
 *  - Never name a variable "result" — it's AppleScript's implicit return variable
 *  - Use (ASCII character 10) for newline, NOT "\n" (\\n in JS = literal backslash-n in file)
 *  - Use index-based tab iteration (repeat with i from 1 to N) not "repeat with t in tabs"
 */

'use strict';

const { exec }      = require('child_process');
const { promisify } = require('util');
const fs            = require('fs/promises');
const os            = require('os');
const path          = require('path');

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BROWSER_APP_NAMES = {
  chrome:  'Google Chrome',
  safari:  'Safari',
  brave:   'Brave Browser',
  edge:    'Microsoft Edge',
  arc:     'Arc',
  opera:   'Opera',
  firefox: 'Firefox',
};

const CHROME_LIKE = new Set(['chrome', 'brave', 'edge', 'arc', 'opera']);

const CDP_PORTS = { chrome: 9222, brave: 9222, edge: 9222, arc: 9222, firefox: 9223 };

// ---------------------------------------------------------------------------
// AppleScript runner
// ---------------------------------------------------------------------------

async function runAppleScript(script, timeoutMs = 15000) {
  const tmp = path.join(os.tmpdir(), `od_as_${Date.now()}_${Math.random().toString(36).slice(2)}.applescript`);
  await fs.writeFile(tmp, script, 'utf-8');
  try {
    const { stdout } = await execAsync(`osascript "${tmp}"`, { timeout: timeoutMs });
    return stdout.trim();
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Firefox WebDriver BiDi helpers (Firefox 129+ uses BiDi instead of CDP)
// ---------------------------------------------------------------------------

/** Check if Firefox BiDi debug server is running on port 9223. Returns port or null. */
async function getFirefoxBiDiPort() {
  try {
    const { stdout } = await execAsync(
      'curl -s --connect-timeout 1 http://localhost:9223/',
      { timeout: 3000 }
    );
    // Firefox BiDi server returns its own httpd.js page at root
    return stdout.includes('httpd.js') ? 9223 : null;
  } catch {
    return null;
  }
}

/**
 * Send a single WebDriver BiDi command and return the result.
 * Works for both CDP (Chrome) and BiDi (Firefox) since both use the same WebSocket transport.
 */
async function sendBiDiCommand(wsUrl, method, params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(wsUrl); // eslint-disable-line no-undef
    } catch (e) {
      return reject(new Error('Failed to open BiDi WebSocket: ' + e.message));
    }

    const msgId = Math.floor(Math.random() * 1e9);
    let settled = false;

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Firefox BiDi timeout after ${timeoutMs}ms`)));
    }, timeoutMs);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    ws.addEventListener('message', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      // Skip event messages (no id field or mismatched id)
      if (data.id !== msgId) return;
      finish(() => {
        if (data.error) return reject(new Error('BiDi error: ' + (data.error.message || JSON.stringify(data.error))));
        resolve(data.result || {});
      });
    });

    ws.addEventListener('error', () => {
      finish(() => reject(new Error('Firefox BiDi WebSocket connection error')));
    });
  });
}

/**
 * List Firefox tabs via BiDi or show actionable error.
 *
 * Firefox 129+ uses WebDriver BiDi when launched with --remote-debugging-port.
 * However, BiDi requires a proper geckodriver session to access browsing contexts.
 * Firefox's implementation doesn't allow attaching to the existing user session
 * via the WebSocket directly (an existing session blocks new session creation).
 *
 * For full Firefox automation, use Chrome or Safari instead.
 */
async function listFirefoxTabsViaBiDi() {
  const biDiPort = await getFirefoxBiDiPort();
  if (!biDiPort) {
    throw new Error(
      'Firefox is running but remote debugging is not enabled on port 9223.\n' +
      'Run: bash scripts/launch-firefox-debug.sh\n' +
      'Note: Chrome and Safari provide full tab management without extra setup.'
    );
  }

  // Firefox BiDi is available but we cannot access the user\'s existing session.
  // The BiDi protocol requires a geckodriver-managed session, which would open
  // a new browser window separate from the user\'s existing Firefox.
  throw new Error(
    'Firefox remote debugging detected on port 9223 (BiDi protocol).\n' +
    'Firefox 129+ uses WebDriver BiDi which cannot access your existing browser\n' +
    'session without geckodriver. Tab listing, reading, and JS execution are\n' +
    'not supported for Firefox with the current setup.\n\n' +
    'Options:\n' +
    '  • Use Chrome — full support via AppleScript + CDP\n' +
    '  • Use Safari — full support via AppleScript'
  );
}

/** Placeholder — Firefox JS execution not supported without geckodriver session. */
async function execJSInFirefoxBiDi(wsUrl, contextId, jsCode) {
  throw new Error('Firefox JS execution requires geckodriver. Use Chrome or Safari instead.');
}

/** Placeholder — Firefox BiDi context not accessible in existing session. */
async function getFirefoxBiDiContext(tabIdx) {
  throw new Error('Firefox BiDi contexts not accessible without geckodriver session.');
}

// ---------------------------------------------------------------------------
// CDP helpers (Chrome DevTools Protocol)
// ---------------------------------------------------------------------------

/**
 * Auto-detect Chrome/Chromium debug port (CDP).
 * Returns port number or null. Chrome-only — Firefox uses BiDi, not CDP.
 */
async function getCDPPort(browser) {
  if (browser === 'firefox') return null; // Firefox uses BiDi
  const port = CDP_PORTS[browser] || (CHROME_LIKE.has(browser) ? 9222 : null);
  if (!port) return null;
  try {
    const { stdout } = await execAsync(
      `curl -s --connect-timeout 1 http://localhost:${port}/json/version`,
      { timeout: 3000 }
    );
    return stdout.includes('webSocketDebuggerUrl') ? port : null;
  } catch {
    return null;
  }
}

/** List all tabs via CDP (Chrome or Firefox debug port). */
async function listCDPTabs(browser, port) {
  const { stdout } = await execAsync(
    `curl -s --connect-timeout 2 http://localhost:${port}/json`,
    { timeout: 5000 }
  );
  if (!stdout.trim().startsWith('[')) throw new Error('Invalid CDP response');

  const pages = JSON.parse(stdout).filter((p) => p.type === 'page');
  return pages.map((p, i) => ({
    browser,
    browserApp:  BROWSER_APP_NAMES[browser] || browser,
    windowIndex: 1,
    tabIndex:    i + 1,
    url:         p.url || '',
    title:       p.title || '(no title)',
    active:      i === 0,
    cdpId:       p.id,
    wsUrl:       p.webSocketDebuggerUrl || null,
  }));
}

/**
 * Execute JavaScript in a tab via raw CDP WebSocket.
 * Works for both Chrome (port 9222) and Firefox (port 9223).
 * Uses Node.js built-in WebSocket (requires Node 21+, we have Node 25).
 */
async function execJSViaCDP(wsUrl, jsCode, timeoutMs = 20000) {
  if (!wsUrl) throw new Error('No WebSocket debugger URL for this tab');

  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(wsUrl); // eslint-disable-line no-undef
    } catch (e) {
      return reject(new Error('Failed to open CDP WebSocket: ' + e.message));
    }

    const msgId = Math.floor(Math.random() * 1e9);
    let settled = false;

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`CDP WebSocket timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        id: msgId,
        method: 'Runtime.evaluate',
        params: { expression: jsCode, returnByValue: true, awaitPromise: false },
      }));
    });

    ws.addEventListener('message', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.id !== msgId) return;

      finish(() => {
        if (data.error) {
          return reject(new Error('CDP error: ' + (data.error.message || JSON.stringify(data.error))));
        }
        const r = data.result?.result;
        if (!r) return resolve('');
        if (r.type === 'object') {
          if (r.subtype === 'null') return resolve('null');
          if (r.value !== undefined) return resolve(JSON.stringify(r.value));
          return resolve(r.description || '');
        }
        resolve(String(r.value ?? r.description ?? ''));
      });
    });

    ws.addEventListener('error', () => {
      finish(() => reject(new Error('CDP WebSocket connection failed — is the browser running with --remote-debugging-port?')));
    });
  });
}

/** Execute JS in a specific CDP tab by index (1-based). */
async function execJSInCDPTab(browser, port, tabIdx, jsCode) {
  const { stdout } = await execAsync(`curl -s http://localhost:${port}/json`, { timeout: 5000 });
  const pages = JSON.parse(stdout).filter((p) => p.type === 'page');
  const page = pages[tabIdx - 1] || pages[0];
  if (!page) throw new Error(`Tab ${tabIdx} not found via CDP`);
  return execJSViaCDP(page.webSocketDebuggerUrl, jsCode);
}

// ---------------------------------------------------------------------------
// AppleScript JS execution (Chrome/Safari — needs "Allow JS from Apple Events")
// ---------------------------------------------------------------------------

function jsPermissionMsg(browser) {
  if (browser === 'safari') {
    return (
      'Safari blocked JavaScript execution.\n' +
      'One-time fix: Safari menu > Settings > Advanced > check "Show Develop menu in menu bar"\n' +
      'Then: Develop menu > Allow JavaScript from Apple Events'
    );
  }
  return (
    `${BROWSER_APP_NAMES[browser] || 'Chrome'} blocked JavaScript execution.\n` +
    'Option A — Enable JavaScript from Apple Events (one-time, works with your current Chrome session):\n' +
    '  1. Open Chrome DevTools: Cmd+Option+I\n' +
    '  2. Chrome menu bar: View > Developer > Allow JavaScript from Apple Events\n' +
    '  3. This setting persists — you only need to do this once.\n' +
    '\n' +
    'Option B — Run Chrome with remote debugging (separate profile, full CDP capability):\n' +
    '  bash scripts/launch-chrome-debug.sh\n' +
    '  Opens a Chrome window with a separate "ChromeDebug" profile.\n' +
    '  Log in to your accounts once — logins are saved for future sessions.'
  );
}

async function execJSInChromeBrowser(appName, windowIdx, tabIdx, jsCode) {
  const jsTmp = path.join(os.tmpdir(), `od_js_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
  await fs.writeFile(jsTmp, jsCode, 'utf-8');
  const script = `
tell application "${appName}"
  set jsCode to do shell script "cat \\"${jsTmp}\\""
  set r to execute tab ${tabIdx} of window ${windowIdx} javascript jsCode
  return r as string
end tell`;
  try {
    return await runAppleScript(script, 30000);
  } catch (e) {
    const msg = String(e.message || '');
    // Chrome's actual error: "Executing JavaScript through AppleScript is turned off."
    // Also catch older/alternate error codes and messages
    const isJsBlocked = (
      msg.includes('AppleScript is turned off') ||
      msg.includes('JavaScript from Apple Events') ||
      msg.includes('Allow JavaScript') ||
      msg.includes('not allowed') ||
      msg.includes('-10006') ||
      msg.includes('(-1743)') ||
      msg.includes('(12)') ||
      msg.includes('AppleEvent handler failed')
    );
    if (isJsBlocked) {
      const key = Object.keys(BROWSER_APP_NAMES).find((k) => BROWSER_APP_NAMES[k] === appName) || 'chrome';
      throw new Error(jsPermissionMsg(key));
    }
    throw e;
  } finally {
    await fs.unlink(jsTmp).catch(() => {});
  }
}

async function execJSInSafari(windowIdx, tabIdx, jsCode) {
  const jsTmp = path.join(os.tmpdir(), `od_js_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
  await fs.writeFile(jsTmp, jsCode, 'utf-8');
  const script = `
tell application "Safari"
  set jsCode to do shell script "cat \\"${jsTmp}\\""
  set r to do JavaScript jsCode in tab ${tabIdx} of window ${windowIdx}
  return r as string
end tell`;
  try {
    return await runAppleScript(script, 30000);
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes('not allowed') || msg.includes('-2700') || msg.includes('JavaScriptEnabled')) {
      throw new Error(jsPermissionMsg('safari'));
    }
    throw e;
  } finally {
    await fs.unlink(jsTmp).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Unified JS execution dispatcher — CDP preferred, AppleScript fallback
// ---------------------------------------------------------------------------

async function execJSInTab(browser, windowIdx, tabIdx, jsCode) {
  // Firefox: BiDi protocol doesn't support attaching to existing sessions
  if (browser === 'firefox') {
    throw new Error(
      'Firefox tab JavaScript execution is not supported.\n' +
      'Firefox 129+ uses WebDriver BiDi which requires geckodriver to access existing tabs.\n\n' +
      'Use Chrome or Safari for tab reading, form filling, and JavaScript execution.'
    );
  }

  // Chrome/Chromium: try CDP first (no permissions needed, reads authenticated pages)
  const cdpPort = await getCDPPort(browser);
  if (cdpPort) {
    try {
      return await execJSInCDPTab(browser, cdpPort, tabIdx, jsCode);
    } catch (cdpErr) {
      // CDP available but failed for this tab — fall through to AppleScript
      console.error(`[tabs] CDP JS failed for ${browser}:`, cdpErr.message);
    }
  }

  // AppleScript fallback
  if (browser === 'safari')     return execJSInSafari(windowIdx, tabIdx, jsCode);
  if (CHROME_LIKE.has(browser)) return execJSInChromeBrowser(BROWSER_APP_NAMES[browser], windowIdx, tabIdx, jsCode);

  throw new Error(`Unsupported browser: ${browser}`);
}

// ---------------------------------------------------------------------------
// Browser detection
// ---------------------------------------------------------------------------

async function getRunningBrowsers() {
  const found = new Set();
  try {
    // ps -axo comm returns full executable path on macOS
    // Use case-insensitive grep; exclude sub-process helpers
    const { stdout } = await execAsync(
      'ps -axo comm | grep -iE "(google chrome|firefox|brave browser|microsoft edge)" | grep -iv "helper|renderer|crashpad|plugin.container|gpu-helper|crashhelper|media-plugin" | sort -u',
      { timeout: 5000 }
    );
    if (/google chrome/i.test(stdout))  found.add('chrome');
    if (/firefox/i.test(stdout))         found.add('firefox');
    if (/brave browser/i.test(stdout))   found.add('brave');
    if (/microsoft edge/i.test(stdout))  found.add('edge');
  } catch {}

  // Detect Safari + Arc via System Events (more reliable on macOS)
  try {
    const { stdout } = await execAsync(
      `osascript -e 'tell application "System Events" to return name of (every process whose name is in {"Safari", "Arc"})'`,
      { timeout: 5000 }
    );
    if (/\bSafari\b/.test(stdout)) found.add('safari');
    if (/\bArc\b/.test(stdout))    found.add('arc');
  } catch {}

  return Array.from(found);
}

async function getBrowserMemoryMB(appName) {
  try {
    const { stdout } = await execAsync(
      `ps -axo rss,comm | grep "${appName}" | awk '{sum+=$1} END {printf "%.0f", sum/1024}'`,
      { timeout: 5000 }
    );
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Tab listing per browser
// ---------------------------------------------------------------------------

/**
 * List Chrome/Brave/Edge/Arc tabs.
 * Priority: CDP (most reliable) → AppleScript (fallback)
 * THROWS on failure so getAllTabs captures it as a warning.
 */
async function listChromeLikeTabs(browserKey) {
  const appName = BROWSER_APP_NAMES[browserKey];

  // 1. Try CDP if debug port is open
  const cdpPort = await getCDPPort(browserKey);
  if (cdpPort) {
    try {
      return await listCDPTabs(browserKey, cdpPort);
    } catch (e) {
      console.warn(`[tabs] ${browserKey} CDP listing failed (${e.message}), falling back to AppleScript`);
    }
  }

  // 2. AppleScript fallback
  // KEY: use "tabData" (not "result"), (ASCII character 10) for newlines, index-based iteration
  const script = `
tell application "${appName}"
  if not running then return ""
  set tabData to ""
  set wCount to count of windows
  repeat with wIdx from 1 to wCount
    try
      set tCount to count of tabs of window wIdx
      set aIdx to active tab index of window wIdx
      repeat with tIdx from 1 to tCount
        set t to tab tIdx of window wIdx
        set isAct to (tIdx = aIdx) as string
        set tabData to tabData & wIdx & "|" & tIdx & "|" & (URL of t) & "|" & (title of t) & "|" & isAct & (ASCII character 10)
      end repeat
    end try
  end repeat
  return tabData
end tell`;

  const raw = await runAppleScript(script, 20000); // throws on failure
  if (!raw) return [];

  return raw.split('\n').filter(Boolean).map((line) => {
    const parts = line.split('|');
    if (parts.length < 5) return null;
    return {
      browser:     browserKey,
      browserApp:  appName,
      windowIndex: parseInt(parts[0], 10),
      tabIndex:    parseInt(parts[1], 10),
      url:         parts[2] || '',
      title:       parts.slice(3, -1).join('|') || '(no title)',
      active:      parts[parts.length - 1].trim() === 'true',
    };
  }).filter(Boolean);
}

async function listSafariTabs() {
  const script = `
tell application "Safari"
  if not running then return ""
  set tabData to ""
  set wCount to count of windows
  repeat with wIdx from 1 to wCount
    try
      set tCount to count of tabs of window wIdx
      set activeName to name of current tab of window wIdx
      repeat with tIdx from 1 to tCount
        set t to tab tIdx of window wIdx
        set isAct to ((name of t) = activeName) as string
        set tabData to tabData & wIdx & "|" & tIdx & "|" & (URL of t) & "|" & (name of t) & "|" & isAct & (ASCII character 10)
      end repeat
    end try
  end repeat
  return tabData
end tell`;

  const raw = await runAppleScript(script, 20000); // throws on failure
  if (!raw) return [];

  return raw.split('\n').filter(Boolean).map((line) => {
    const parts = line.split('|');
    if (parts.length < 5) return null;
    return {
      browser:     'safari',
      browserApp:  'Safari',
      windowIndex: parseInt(parts[0], 10),
      tabIndex:    parseInt(parts[1], 10),
      url:         parts[2] || '',
      title:       parts.slice(3, -1).join('|') || '(no title)',
      active:      parts[parts.length - 1].trim() === 'true',
    };
  }).filter(Boolean);
}

async function listFirefoxTabs() {
  // Firefox 129+ uses WebDriver BiDi — no /json endpoint available
  return listFirefoxTabsViaBiDi();
}

/**
 * Returns { tabs, warnings } — warnings are per-browser errors.
 * Uses Promise.allSettled so one browser failing doesn't hide others.
 */
async function getAllTabs(browser = 'all') {
  const running = await getRunningBrowsers();

  let targets;
  if (browser === 'all') {
    targets = running;
  } else if (Array.isArray(browser)) {
    targets = [...new Set(browser)];
  } else {
    targets = [browser];
  }

  const settled = await Promise.allSettled(
    targets.map(async (b) => {
      if (b === 'safari')     return listSafariTabs();
      if (b === 'firefox')    return listFirefoxTabs();
      if (CHROME_LIKE.has(b)) return listChromeLikeTabs(b);
      return [];
    })
  );

  const tabs = [];
  const warnings = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      tabs.push(...r.value);
    } else {
      const name = BROWSER_APP_NAMES[targets[i]] || targets[i];
      warnings.push(`${name}: ${r.reason?.message || String(r.reason)}`);
    }
  }
  return { tabs, warnings };
}

// ---------------------------------------------------------------------------
// URL fetch fallback (for tabs_read on public pages)
// ---------------------------------------------------------------------------

async function getTabURL(browser, windowIdx, tabIdx) {
  try {
    if (browser === 'safari') {
      return (await runAppleScript(`tell application "Safari" to return URL of tab ${tabIdx} of window ${windowIdx}`)).trim();
    }
    if (CHROME_LIKE.has(browser)) {
      // Try CDP first
      const port = await getCDPPort(browser);
      if (port) {
        const { stdout } = await execAsync(`curl -s http://localhost:${port}/json`, { timeout: 5000 });
        const pages = JSON.parse(stdout).filter((p) => p.type === 'page');
        if (pages[tabIdx - 1]) return pages[tabIdx - 1].url;
      }
      const appName = BROWSER_APP_NAMES[browser];
      return (await runAppleScript(`tell application "${appName}" to return URL of tab ${tabIdx} of window ${windowIdx}`)).trim();
    }
    if (browser === 'firefox') {
      const biDiPort = await getFirefoxBiDiPort();
      if (!biDiPort) return null;
      const wsUrl = `ws://127.0.0.1:${biDiPort}`;
      const treeResult = await sendBiDiCommand(wsUrl, 'browsingContext.getTree', {});
      return (treeResult.contexts || [])[tabIdx - 1]?.url || null;
    }
  } catch {}
  return null;
}

async function fetchURLContent(url, maxLength = 15000) {
  if (!url || /^(chrome:|about:|file:)/.test(url)) return null;
  try {
    const { stdout } = await execAsync(
      `curl -sL --max-time 15 --compressed -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${url.replace(/"/g, '\\"')}"`,
      { timeout: 20000, maxBuffer: 5 * 1024 * 1024 }
    );
    const text = stdout
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
      .replace(/[ \t]{3,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return text.length > maxLength ? text.slice(0, maxLength) + '\n\n[...truncated]' : text;
  } catch {
    return null;
  }
}

// Known services that require login — if we get any auth signals from these, it's an auth wall
const AUTH_DOMAINS = new Set([
  'mail.google.com', 'accounts.google.com', 'drive.google.com', 'docs.google.com',
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'reddit.com', 'tiktok.com',
  'github.com', 'gitlab.com',
  'netflix.com', 'amazon.com', 'outlook.live.com', 'outlook.office.com',
  'slack.com', 'notion.so', 'figma.com',
]);

function isAuthWall(text, url = '') {
  if (!text || text.length < 50) return false;

  // URL-based detection: for known auth-required services, detect login pages
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      if (AUTH_DOMAINS.has(host)) {
        const pathLower = parsed.pathname.toLowerCase();
        // Root path of auth-required services is always the login/landing page
        const isLandingPage = pathLower === '/' || pathLower === '' || /login|signin|sign-in|auth|session/.test(pathLower);
        if (isLandingPage) return true;
        // For deeper paths, require at least one auth signal
        const sample = text.slice(0, 3000).toLowerCase().replace(/\s+/g, ' ');
        const anyAuthSignal = [
          'sign in', 'log in', 'login', 'password', 'create account', 'sign up', 'forgot',
        ].some((s) => sample.includes(s));
        if (anyAuthSignal) return true;
      }
    } catch {}
  }

  // General detection: normalize whitespace first to fix "sign in  to continue" → "sign in to continue"
  const sample = text.slice(0, 2000).toLowerCase().replace(/\s+/g, ' ');
  const signals = [
    'sign in to continue', 'log in to continue', 'login to continue',
    'create account', 'forgot password', 'forgot email',
    'you must be logged in', 'please sign in', 'please log in',
    'continue with google', 'continue with facebook',
    'enter your email', 'enter your password',
    'sign in with google', 'use a private browsing window',
  ];
  return signals.filter((s) => sample.includes(s)).length >= 2;
}

// ---------------------------------------------------------------------------
// JS snippets
// ---------------------------------------------------------------------------

const GET_TEXT_JS = `(function(){
  try {
    var c = document.body.cloneNode(true);
    c.querySelectorAll('script,style,noscript,nav,footer,header,aside,[class*="ad-"],[id*="cookie"],[class*="cookie"],[class*="banner"]').forEach(function(e){e.remove();});
    return (c.innerText||c.textContent||'').replace(/\\n{3,}/g,'\\n\\n').replace(/[ \\t]{4,}/g,' ').trim();
  } catch(e){return 'Error: '+e.message;}
})()`;

const FIND_FORMS_JS = `(function(){
  var sp=/password|passwd|pwd|cvv|ssn|social.?security|credit.?card|card.?number|secret|token/i;
  var fields=[];var idx=0;
  document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),select,textarea').forEach(function(el){
    var lbl='';
    if(el.id){var l=document.querySelector('label[for="'+el.id+'"]');if(l)lbl=l.innerText.trim();}
    if(!lbl){var p=el.closest('label');if(p)lbl=p.innerText.replace(el.value||'','').trim();}
    if(!lbl){var pr=el.previousElementSibling;if(pr&&/label|span|div/i.test(pr.tagName))lbl=pr.innerText.trim();}
    var sens=sp.test(el.name||'')||sp.test(el.id||'')||sp.test(el.type||'')||sp.test(lbl);
    var opts=el.tagName==='SELECT'?Array.from(el.options).map(function(o){return{value:o.value,text:o.text.trim()};}):[];
    fields.push({index:idx++,tag:el.tagName.toLowerCase(),type:el.type||el.tagName.toLowerCase(),name:el.name||'',id:el.id||'',label:lbl,placeholder:el.placeholder||'',value:sens?'[REDACTED]':(el.value||''),required:el.required,sensitive:sens,options:opts,visible:el.offsetWidth>0&&el.offsetHeight>0});
  });
  return JSON.stringify({url:window.location.href,title:document.title,fieldCount:fields.length,fields:fields});
})()`;

function buildFillJS(fieldMap, submit = false) {
  return `(function(){
  var fields=${JSON.stringify(fieldMap)};
  var niS=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')&&Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  var nsS=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')&&Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
  var ntS=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')&&Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  function findEl(key){
    var el=document.querySelector('[name="'+key+'"]')||document.querySelector('#'+key)||document.querySelector('[placeholder="'+key+'"]');
    if(!el){var ls=document.querySelectorAll('label');for(var i=0;i<ls.length;i++){if(ls[i].innerText.trim().toLowerCase().indexOf(key.toLowerCase())>=0){var fid=ls[i].htmlFor;el=fid?document.getElementById(fid):ls[i].querySelector('input,select,textarea');if(el)break;}}}
    return el;
  }
  function setVal(el,val){var s=el instanceof HTMLSelectElement?nsS:el instanceof HTMLTextAreaElement?ntS:niS;if(s)s.call(el,val);else el.value=val;['input','change','blur'].forEach(function(ev){el.dispatchEvent(new Event(ev,{bubbles:true}));});}
  var res=[];
  for(var k in fields){var el=findEl(k);if(el){try{setVal(el,fields[k]);res.push({field:k,status:'filled'});}catch(e){res.push({field:k,status:'error',error:e.message});}}else{res.push({field:k,status:'not_found'});}}
  ${submit?"var f=document.querySelector('form');if(f){var b=f.querySelector('[type=\"submit\"]');if(b)b.click();else f.submit();res.push({field:'__submit__',status:'submitted'});}else{res.push({field:'__submit__',status:'no_form_found'});}" :''}
  return JSON.stringify({filled:res.filter(function(r){return r.status==='filled';}).length,results:res});
})()`;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function tabsList({ browser = 'all' } = {}) {
  const { tabs, warnings } = await getAllTabs(browser);
  const lines = [];

  if (tabs.length > 0) {
    const browsers = [...new Set(tabs.map((t) => t.browser))];
    const mem = {};
    await Promise.all(browsers.map(async (b) => { mem[b] = await getBrowserMemoryMB(BROWSER_APP_NAMES[b]); }));

    const grouped = {};
    for (const t of tabs) { if (!grouped[t.browser]) grouped[t.browser] = []; grouped[t.browser].push(t); }

    lines.push(`Found ${tabs.length} open tab(s):\n`);
    for (const [b, bTabs] of Object.entries(grouped)) {
      const cdpNote = (await getCDPPort(b)) ? ' [CDP ✓]' : '';
      lines.push(`## ${BROWSER_APP_NAMES[b] || b} (${bTabs.length} tabs${mem[b] ? `, ~${mem[b]} MB` : ''}${cdpNote})`);
      for (const t of bTabs) {
        lines.push(`  [W${t.windowIndex}T${t.tabIndex}]${t.active ? ' ★' : '  '} ${t.title}`);
        lines.push(`         ${t.url}`);
      }
      lines.push('');
    }
  } else if (warnings.length === 0) {
    return 'No browsers running or no windows open.';
  }

  if (warnings.length > 0) {
    if (tabs.length > 0) lines.push('---');
    lines.push('Browsers with errors:');
    for (const w of warnings) lines.push(`  ! ${w}`);
  }

  return lines.join('\n');
}

// ── tabs_navigate ──────────────────────────────────────────────────────────

async function tabsNavigate({ browser, url, windowIndex, tabIndex, newTab = false } = {}) {
  if (!browser) return 'Please specify a browser.';
  if (!url)     return 'Please specify a url.';
  const fullUrl = url.startsWith('http') ? url : `https://${url}`;

  if (browser === 'safari') {
    const script = (newTab || (!windowIndex && !tabIndex)) ? `
tell application "Safari"
  activate
  if (count of windows) = 0 then make new document
  tell front window
    make new tab with properties {URL:"${fullUrl}"}
    set current tab to last tab
  end tell
end tell` : `
tell application "Safari"
  set URL of tab ${tabIndex || 1} of window ${windowIndex || 1} to "${fullUrl}"
  activate
end tell`;
    await runAppleScript(script);
    return `Navigated Safari to ${fullUrl}`;
  }

  if (CHROME_LIKE.has(browser)) {
    const appName = BROWSER_APP_NAMES[browser];
    // Try CDP navigation if available
    const port = await getCDPPort(browser);
    if (port && !newTab && windowIndex && tabIndex) {
      try {
        await execJSInCDPTab(browser, port, tabIndex, `window.location.href="${fullUrl}"`);
        return `Navigated ${appName} W${windowIndex}T${tabIndex} to ${fullUrl}`;
      } catch {}
    }
    const script = (newTab || (!windowIndex && !tabIndex)) ? `
tell application "${appName}"
  activate
  if (count of windows) = 0 then make new window
  tell window 1
    make new tab at end of tabs with properties {URL:"${fullUrl}"}
    set active tab index to count of tabs
  end tell
end tell` : `
tell application "${appName}"
  set URL of tab ${tabIndex || 1} of window ${windowIndex || 1} to "${fullUrl}"
  set active tab index of window ${windowIndex || 1} to ${tabIndex || 1}
  activate
end tell`;
    await runAppleScript(script);
    return `Navigated ${appName} to ${fullUrl}`;
  }

  if (browser === 'firefox') {
    // Firefox: use BiDi browsingContext.navigate
    const biDiPort = await getFirefoxBiDiPort();
    if (biDiPort) {
      const wsUrl = `ws://127.0.0.1:${biDiPort}`;
      if (!newTab && tabIndex) {
        try {
          const treeResult = await sendBiDiCommand(wsUrl, 'browsingContext.getTree', {});
          const ctx = (treeResult.contexts || [])[tabIndex - 1];
          if (ctx) {
            await sendBiDiCommand(wsUrl, 'browsingContext.navigate', { context: ctx.context, url: fullUrl });
            return `Navigated Firefox tab ${tabIndex} to ${fullUrl}`;
          }
        } catch {}
      }
      // Open new tab via BiDi
      try {
        const newCtx = await sendBiDiCommand(wsUrl, 'browsingContext.create', { type: 'tab' });
        await sendBiDiCommand(wsUrl, 'browsingContext.navigate', { context: newCtx.context, url: fullUrl });
        return `Opened new Firefox tab: ${fullUrl}`;
      } catch {}
    }
    // Final fallback: open URL in Firefox via system
    await execAsync(`open -a Firefox "${fullUrl.replace(/"/g, '\\"')}"`, { timeout: 5000 });
    return `Opened ${fullUrl} in Firefox (run scripts/launch-firefox-debug.sh for full control)`;
  }

  return `Unsupported browser: ${browser}`;
}

// ── tabs_close ─────────────────────────────────────────────────────────────

async function tabsClose({ browser, windowIndex, tabIndex, urlPattern, duplicatesOnly = false } = {}) {
  if (duplicatesOnly) {
    const { tabs } = await getAllTabs(browser || 'all');
    const seen = new Map(); const toClose = [];
    for (const t of tabs) { const k = t.url.replace(/[?#].*$/, ''); if (seen.has(k)) toClose.push(t); else seen.set(k, t); }
    if (!toClose.length) return 'No duplicate tabs found.';
    const closed = [];
    for (const t of toClose) {
      try { await closeTab(t.browser, t.windowIndex, t.tabIndex, t.cdpId); closed.push(`"${t.title}"`); }
      catch (e) { closed.push(`[failed: ${t.title}]`); }
    }
    return `Closed ${closed.length} duplicate(s):\n${closed.join('\n')}`;
  }
  if (urlPattern) {
    const { tabs } = await getAllTabs(browser || 'all');
    let rx; try { rx = new RegExp(urlPattern, 'i'); } catch { return `Invalid regex: ${urlPattern}`; }
    const matching = tabs.filter((t) => rx.test(t.url) || rx.test(t.title));
    if (!matching.length) return `No tabs matched: ${urlPattern}`;
    const closed = [];
    for (const t of matching) { try { await closeTab(t.browser, t.windowIndex, t.tabIndex, t.cdpId); closed.push(`"${t.title}"`); } catch {} }
    return `Closed ${closed.length} tab(s) matching "${urlPattern}":\n${closed.join('\n')}`;
  }
  if (browser && windowIndex && tabIndex) {
    await closeTab(browser, windowIndex, tabIndex);
    return `Closed ${browser} W${windowIndex}T${tabIndex}.`;
  }
  return 'Specify browser+windowIndex+tabIndex, urlPattern, or duplicatesOnly=true.';
}

async function closeTab(browser, windowIdx, tabIdx, cdpId) {
  // Try CDP close if ID available
  if (cdpId) {
    const port = CDP_PORTS[browser];
    if (port) {
      try {
        await execAsync(`curl -s -X DELETE http://localhost:${port}/json/close/${cdpId}`, { timeout: 5000 });
        return;
      } catch {}
    }
  }
  if (browser === 'safari') { await runAppleScript(`tell application "Safari" to close tab ${tabIdx} of window ${windowIdx}`); return; }
  if (CHROME_LIKE.has(browser)) { await runAppleScript(`tell application "${BROWSER_APP_NAMES[browser]}" to close tab ${tabIdx} of window ${windowIdx}`); return; }
  if (browser === 'firefox') {
    const biDiPort = await getFirefoxBiDiPort();
    if (!biDiPort) throw new Error('Firefox remote debugging not available on port 9223');
    const wsUrl = `ws://127.0.0.1:${biDiPort}`;
    const treeResult = await sendBiDiCommand(wsUrl, 'browsingContext.getTree', {});
    const ctx = (treeResult.contexts || [])[tabIdx - 1];
    if (!ctx) throw new Error(`Firefox tab ${tabIdx} not found`);
    await sendBiDiCommand(wsUrl, 'browsingContext.close', { context: ctx.context });
    return;
  }
  throw new Error(`Cannot close tabs in ${browser}`);
}

// ── tabs_read ──────────────────────────────────────────────────────────────

async function tabsRead({ browser, windowIndex, tabIndex, maxLength = 15000 } = {}) {
  if (!browser || !windowIndex || !tabIndex) return 'Specify browser, windowIndex, tabIndex. Use tabs_list first.';

  // 1. Try in-browser JS (reads authenticated content, exactly what user sees)
  try {
    const text = await execJSInTab(browser, windowIndex, tabIndex, GET_TEXT_JS);
    if (!text || text === 'null' || text.length < 10) return '(Page appears empty or has no readable text)';
    return text.length > maxLength ? text.slice(0, maxLength) + `\n\n[...truncated at ${maxLength} chars]` : text;
  } catch (jsErr) {
    const errMsg = jsErr.message || '';
    const isPermErr = errMsg.includes('blocked') || errMsg.includes('Apple Events') || errMsg.includes('One-time fix') || errMsg.includes('remote debugging');

    if (!isPermErr) return `Failed to read tab: ${errMsg}`;

    // 2. URL-fetch fallback (works for public pages without login)
    const url = await getTabURL(browser, windowIndex, tabIndex);
    if (url) {
      const fetched = await fetchURLContent(url, maxLength);
      if (fetched) {
        if (isAuthWall(fetched, url)) {
          return (
            `Cannot read "${url}" — this page requires login and JavaScript execution is not enabled.\n\n` +
            `To read authenticated pages (Gmail, Facebook, etc.) choose one of:\n\n` +
            `Option A — Enable JavaScript from Apple Events (works with your current Chrome session):\n` +
            `  1. Open Chrome DevTools: Cmd+Option+I\n` +
            `  2. Chrome menu bar: View > Developer > Allow JavaScript from Apple Events\n` +
            `  (One-time setup — persists across restarts)\n\n` +
            `Option B — Use Chrome with remote debugging (separate profile with CDP):\n` +
            `  bash scripts/launch-chrome-debug.sh\n` +
            `  Opens a "ChromeDebug" profile — log in to your accounts once, logins are saved.`
          );
        }
        return `[Note: Read via URL fetch — showing public/cached version, not your logged-in session]\n\n${fetched}`;
      }
    }

    // 3. Nothing worked — return the permission instructions
    return (
      `Cannot read tab content.\n\n${errMsg}\n\n` +
      `Tab URL: ${url || '(unavailable)'}`
    );
  }
}

// ── tabs_focus ─────────────────────────────────────────────────────────────

async function tabsFocus({ browser, windowIndex, tabIndex } = {}) {
  if (!browser || !windowIndex || !tabIndex) return 'Specify browser, windowIndex, tabIndex.';
  if (browser === 'safari') {
    await runAppleScript(`tell application "Safari"\n  set current tab of window ${windowIndex} to tab ${tabIndex} of window ${windowIndex}\n  activate\nend tell`);
    return `Focused Safari W${windowIndex}T${tabIndex}.`;
  }
  if (CHROME_LIKE.has(browser)) {
    const appName = BROWSER_APP_NAMES[browser];
    await runAppleScript(`tell application "${appName}"\n  set active tab index of window ${windowIndex} to ${tabIndex}\n  set index of window ${windowIndex} to 1\n  activate\nend tell`);
    return `Focused ${appName} W${windowIndex}T${tabIndex}.`;
  }
  return `Focus not supported for ${browser} without CDP.`;
}

// ── tabs_find_duplicates ───────────────────────────────────────────────────

async function tabsFindDuplicates({ browser = 'all' } = {}) {
  const { tabs, warnings } = await getAllTabs(browser);
  if (!tabs.length) {
    const lines = ['No open tabs found.'];
    for (const w of warnings) lines.push(`  ! ${w}`);
    return lines.join('\n');
  }

  const exactMap = new Map();
  for (const t of tabs) { if (!exactMap.has(t.url)) exactMap.set(t.url, []); exactMap.get(t.url).push(t); }
  const exactDups = [...exactMap.entries()].filter(([, a]) => a.length > 1);

  const normMap = new Map();
  for (const t of tabs) { const n = t.url.replace(/[?#].*$/, ''); if (!normMap.has(n)) normMap.set(n, []); normMap.get(n).push(t); }
  const nearDups = [...normMap.entries()].filter(([, a]) => a.length > 1 && !exactMap.has(a[0].url));

  const domMap = new Map();
  for (const t of tabs) { try { const d = new URL(t.url).hostname; if (!domMap.has(d)) domMap.set(d, []); domMap.get(d).push(t); } catch {} }
  const domDups = [...domMap.entries()].filter(([, a]) => a.length > 1);

  const browsers = [...new Set(tabs.map((t) => t.browser))];
  const mem = {};
  await Promise.all(browsers.map(async (b) => { mem[b] = await getBrowserMemoryMB(BROWSER_APP_NAMES[b]); }));

  const lines = [`Tab Analysis — ${tabs.length} tab(s)\n`];
  for (const b of browsers) lines.push(`${BROWSER_APP_NAMES[b]}: ~${mem[b] || 0} MB`);
  lines.push('');

  if (exactDups.length) {
    lines.push('### Exact Duplicates');
    for (const [url, arr] of exactDups) {
      lines.push(`  ${arr.length}x  ${arr[0].title || url}`);
      for (let i = 1; i < arr.length; i++) lines.push(`  → Close: ${arr[i].browser} W${arr[i].windowIndex}T${arr[i].tabIndex}`);
    }
    lines.push('');
  } else lines.push('No exact duplicates.\n');

  if (nearDups.length) {
    lines.push('### Near-Duplicates (same URL, different hash/query)');
    for (const [n, arr] of nearDups) { lines.push(`  ${arr.length}x ${n}`); for (const t of arr) lines.push(`    ${t.browser} W${t.windowIndex}T${t.tabIndex}: ${t.url}`); }
    lines.push('');
  }

  if (domDups.length) {
    lines.push('### Same Domain (multiple tabs)');
    for (const [d, arr] of domDups.sort(([, a], [, b]) => b.length - a.length).slice(0, 10)) lines.push(`  ${d} — ${arr.length} tabs`);
    lines.push('');
  }

  const total = exactDups.reduce((s, [, a]) => s + a.length - 1, 0) + nearDups.reduce((s, [, a]) => s + a.length - 1, 0);
  lines.push(total > 0 ? `Recommendation: Close ${total} duplicate(s) → tabs_close duplicatesOnly=true` : 'Tabs look clean — no significant duplicates!');

  for (const w of warnings) lines.push(`  ! ${w}`);
  return lines.join('\n');
}

// ── tabs_find_forms ────────────────────────────────────────────────────────

async function tabsFindForms({ browser, windowIndex, tabIndex } = {}) {
  if (!browser || !windowIndex || !tabIndex) return 'Specify browser, windowIndex, tabIndex.';

  let raw;
  try {
    raw = await execJSInTab(browser, windowIndex, tabIndex, FIND_FORMS_JS);
  } catch (e) {
    if (e.message.includes('blocked') || e.message.includes('Apple Events') || e.message.includes('One-time fix') || e.message.includes('remote debugging')) {
      return `Cannot scan forms — JavaScript not enabled in ${browser}.\n\n${e.message}`;
    }
    return `Failed to scan forms: ${e.message}`;
  }

  let data;
  try { data = JSON.parse(raw); } catch { return `Unexpected response: ${raw?.slice(0, 200)}`; }
  if (!data.fields?.length) return `No form fields found on "${data.title}"`;

  const lines = [`Found ${data.fieldCount} field(s) on "${data.title}"\nURL: ${data.url}\n`];
  for (const f of data.fields) {
    const lbl = f.label || f.placeholder || f.name || f.id || '(unlabeled)';
    lines.push(`  [${f.index}] ${f.tag}[${f.type}]${f.sensitive?' [SENSITIVE]':''}${f.required?' *required*':''}`);
    lines.push(`       Label: "${lbl}"  name="${f.name}"  id="${f.id}"`);
    if (f.value && !f.sensitive) lines.push(`       Current: "${f.value}"`);
    if (f.options?.length) lines.push(`       Options: ${f.options.slice(0,5).map((o)=>`"${o.text}"`).join(', ')}${f.options.length>5?` +${f.options.length-5} more`:''}`);
  }
  lines.push('\nUse tabs_fill_form to fill by name, id, or label text.');
  return lines.join('\n');
}

// ── tabs_fill_form ─────────────────────────────────────────────────────────

async function tabsFillForm({ browser, windowIndex, tabIndex, fields = {}, submit = false } = {}) {
  if (!browser || !windowIndex || !tabIndex) return 'Specify browser, windowIndex, tabIndex.';
  if (!Object.keys(fields).length) return 'No fields provided.';

  let raw;
  try {
    raw = await execJSInTab(browser, windowIndex, tabIndex, buildFillJS(fields, submit));
  } catch (e) {
    if (e.message.includes('blocked') || e.message.includes('Apple Events') || e.message.includes('One-time fix') || e.message.includes('remote debugging')) {
      return `Cannot fill form — JavaScript not enabled in ${browser}.\n\n${e.message}`;
    }
    return `Failed to fill form: ${e.message}`;
  }

  let result;
  try { result = JSON.parse(raw); } catch { return `Unexpected response: ${raw?.slice(0,200)}`; }

  const lines = [`Filled ${result.filled}/${Object.keys(fields).length} field(s):`];
  for (const r of result.results) lines.push(`  ${r.status==='filled'?'✓':r.status==='not_found'?'✗':'!'} ${r.field}: ${r.status}${r.error?` (${r.error})`:''}`);
  const nf = result.results.filter((r) => r.status === 'not_found').map((r) => r.field);
  if (nf.length) lines.push(`\nNot found: ${nf.join(', ')}\nTip: use tabs_find_forms to see exact field names/ids.`);
  return lines.join('\n');
}

// ── tabs_run_js ────────────────────────────────────────────────────────────

async function tabsRunJS({ browser, windowIndex, tabIndex, code } = {}) {
  if (!browser || !windowIndex || !tabIndex || !code) return 'Specify browser, windowIndex, tabIndex, code.';
  // Use eval() so both expressions ("document.title") and blocks ("var x=1; return x+1;") work
  const wrapped = `(function(){try{var _r=eval(${JSON.stringify(code)});return typeof _r==='object'&&_r!==null?JSON.stringify(_r):String(_r===undefined?'':_r);}catch(e){return 'Error: '+e.message;}})()`;
  try {
    const raw = await execJSInTab(browser, windowIndex, tabIndex, wrapped);
    return raw || '(returned empty/undefined)';
  } catch (e) {
    if (e.message.includes('blocked') || e.message.includes('Apple Events') || e.message.includes('One-time fix')) {
      return `JavaScript execution blocked.\n\n${e.message}`;
    }
    return `JavaScript execution failed: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------
// Tool exports
// ---------------------------------------------------------------------------

const BROWSER_TABS_TOOLS = [
  { name: 'tabs_list',            category: 'tabs', permissionLevel: 'read',      params: ['browser'],                                          execute: async (a) => { try { return await tabsList(a); }           catch(e){return `tabs_list error: ${e.message}`;} } },
  { name: 'tabs_navigate',        category: 'tabs', permissionLevel: 'sensitive', params: ['browser','url','windowIndex','tabIndex','newTab'],   execute: async (a) => { try { return await tabsNavigate(a); }       catch(e){return `tabs_navigate error: ${e.message}`;} } },
  { name: 'tabs_close',           category: 'tabs', permissionLevel: 'sensitive', params: ['browser','windowIndex','tabIndex','urlPattern','duplicatesOnly'], execute: async (a) => { try { return await tabsClose(a); } catch(e){return `tabs_close error: ${e.message}`;} } },
  { name: 'tabs_read',            category: 'tabs', permissionLevel: 'read',      params: ['browser','windowIndex','tabIndex','maxLength'],       execute: async (a) => { try { return await tabsRead(a); }           catch(e){return `tabs_read error: ${e.message}`;} } },
  { name: 'tabs_focus',           category: 'tabs', permissionLevel: 'read',      params: ['browser','windowIndex','tabIndex'],                   execute: async (a) => { try { return await tabsFocus(a); }          catch(e){return `tabs_focus error: ${e.message}`;} } },
  { name: 'tabs_find_duplicates', category: 'tabs', permissionLevel: 'read',      params: ['browser'],                                           execute: async (a) => { try { return await tabsFindDuplicates(a); } catch(e){return `tabs_find_duplicates error: ${e.message}`;} } },
  { name: 'tabs_find_forms',      category: 'tabs', permissionLevel: 'read',      params: ['browser','windowIndex','tabIndex'],                   execute: async (a) => { try { return await tabsFindForms(a); }      catch(e){return `tabs_find_forms error: ${e.message}`;} } },
  { name: 'tabs_fill_form',       category: 'tabs', permissionLevel: 'sensitive', params: ['browser','windowIndex','tabIndex','fields','submit'], execute: async (a) => { try { return await tabsFillForm(a); }       catch(e){return `tabs_fill_form error: ${e.message}`;} } },
  { name: 'tabs_run_js',          category: 'tabs', permissionLevel: 'sensitive', params: ['browser','windowIndex','tabIndex','code'],            execute: async (a) => { try { return await tabsRunJS(a); }          catch(e){return `tabs_run_js error: ${e.message}`;} } },
];

module.exports = { BROWSER_TABS_TOOLS };
