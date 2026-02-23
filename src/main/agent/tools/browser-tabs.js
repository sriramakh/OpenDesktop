/**
 * Browser Tab Management & Form Automation Tools
 *
 * Provides 8 tools for managing browser tabs across Chrome, Safari, Firefox,
 * Brave, Edge, Arc, and Opera on macOS.
 *
 * Primary approach: AppleScript (zero-setup, works for all Chromium-based + Safari)
 * Secondary: CDP via Playwright (for Firefox + advanced Chrome features)
 */

'use strict';

const { exec }     = require('child_process');
const { promisify } = require('util');
const fs           = require('fs/promises');
const os           = require('os');
const path         = require('path');

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Browser name mappings
// ---------------------------------------------------------------------------

/** Map friendly key → AppleScript-visible app name */
const BROWSER_APP_NAMES = {
  chrome:  'Google Chrome',
  safari:  'Safari',
  brave:   'Brave Browser',
  edge:    'Microsoft Edge',
  arc:     'Arc',
  opera:   'Opera',
  firefox: null,  // Firefox uses CDP, not AppleScript
};

/** Chromium-based browsers that support AppleScript JS execution */
const CHROME_LIKE = new Set(['chrome', 'brave', 'edge', 'arc', 'opera']);

// ---------------------------------------------------------------------------
// AppleScript helpers
// ---------------------------------------------------------------------------

/**
 * Write an AppleScript to a temp file and run it with osascript.
 * Using temp files avoids shell-quoting issues with multi-line scripts.
 */
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

/**
 * Execute JavaScript in a Chromium-based browser tab via AppleScript.
 * Writes JS to a temp file and reads it inside AppleScript to handle special chars safely.
 */
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
  } finally {
    await fs.unlink(jsTmp).catch(() => {});
  }
}

/**
 * Execute JavaScript in a Safari tab via AppleScript.
 */
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
  } finally {
    await fs.unlink(jsTmp).catch(() => {});
  }
}

/**
 * Execute JavaScript via CDP (Playwright) — used for Firefox.
 * @param {number} port CDP port (9223 for Firefox, 9222 for Chrome debug mode)
 * @param {number} pageIndex 0-based page index (maps to tabIndex - 1)
 * @param {string} jsCode JavaScript code to evaluate
 */
async function execJSViaCDP(port, pageIndex, jsCode) {
  const { chromium } = require('playwright');
  let browser = null;
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${port}`);
    const pages = browser.contexts().flatMap((c) => c.pages());
    const page = pages[pageIndex] || pages[0];
    if (!page) throw new Error('No page found via CDP');
    const result = await page.evaluate(jsCode);
    return typeof result === 'object' ? JSON.stringify(result) : String(result ?? '');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Browser detection helpers
// ---------------------------------------------------------------------------

/** Returns array of running browser keys (e.g. ['chrome', 'safari']) */
async function getRunningBrowsers() {
  try {
    const { stdout } = await execAsync(
      "ps aux | grep -iE 'Google Chrome|Safari$|Firefox|Brave Browser|Microsoft Edge|\\bArc\\b|Opera' | grep -v grep",
      { timeout: 5000 }
    );
    const running = new Set();
    if (/Google Chrome/i.test(stdout))   running.add('chrome');
    if (/Firefox/i.test(stdout))         running.add('firefox');
    if (/Brave Browser/i.test(stdout))   running.add('brave');
    if (/Microsoft Edge/i.test(stdout))  running.add('edge');
    if (/\bArc\b/.test(stdout))          running.add('arc');
    if (/Opera/.test(stdout))            running.add('opera');
    // Safari detection: look for Safari.app process specifically
    if (/\/Safari$|\/Safari\/Safari/i.test(stdout)) running.add('safari');
    return Array.from(running);
  } catch {
    return [];
  }
}

/** Get browser memory usage in MB (sum of all its processes' RSS) */
async function getBrowserMemoryMB(appName) {
  try {
    const { stdout } = await execAsync(
      `ps aux | grep "${appName}" | grep -v grep | awk '{sum+=$6} END {printf "%.0f", sum/1024}'`,
      { timeout: 5000 }
    );
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/** Check if Firefox has CDP debugging enabled on port 9223 */
async function isFirefoxCDPAvailable() {
  try {
    const { stdout } = await execAsync(
      'curl -s --connect-timeout 1 http://localhost:9223/json/version',
      { timeout: 3000 }
    );
    return stdout.includes('Firefox');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tab listing helpers
// ---------------------------------------------------------------------------

/**
 * List tabs in a Chromium-based browser via AppleScript.
 * Returns array of raw tab objects.
 */
async function listChromeTabs(browserKey) {
  const appName = BROWSER_APP_NAMES[browserKey];
  if (!appName) return [];

  const script = `
tell application "${appName}"
  if not running then return ""
  set result to ""
  set wIdx to 0
  repeat with w in windows
    set wIdx to wIdx + 1
    try
      set activeIdx to active tab index of w
      set tIdx to 0
      repeat with t in tabs of w
        set tIdx to tIdx + 1
        set isActive to (tIdx = activeIdx)
        set result to result & wIdx & "|" & tIdx & "|" & (URL of t) & "|" & (title of t) & "|" & isActive & "\\n"
      end repeat
    end try
  end repeat
  return result
end tell`;

  try {
    const raw = await runAppleScript(script);
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map((line) => {
      const parts = line.split('|');
      return {
        browser:      browserKey,
        browserApp:   appName,
        windowIndex:  parseInt(parts[0], 10),
        tabIndex:     parseInt(parts[1], 10),
        url:          parts[2] || '',
        title:        parts.slice(3, -1).join('|') || '(no title)',
        active:       parts[parts.length - 1] === 'true',
      };
    });
  } catch {
    return [];
  }
}

/** List tabs in Safari via AppleScript. */
async function listSafariTabs() {
  const script = `
tell application "Safari"
  if not running then return ""
  set result to ""
  set wIdx to 0
  repeat with w in windows
    set wIdx to wIdx + 1
    try
      set activeTab to current tab of w
      set tIdx to 0
      repeat with t in tabs of w
        set tIdx to tIdx + 1
        set isActive to (t = activeTab)
        set result to result & wIdx & "|" & tIdx & "|" & (URL of t) & "|" & (name of t) & "|" & isActive & "\\n"
      end repeat
    end try
  end repeat
  return result
end tell`;

  try {
    const raw = await runAppleScript(script);
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map((line) => {
      const parts = line.split('|');
      return {
        browser:     'safari',
        browserApp:  'Safari',
        windowIndex: parseInt(parts[0], 10),
        tabIndex:    parseInt(parts[1], 10),
        url:         parts[2] || '',
        title:       parts.slice(3, -1).join('|') || '(no title)',
        active:      parts[parts.length - 1] === 'true',
      };
    });
  } catch {
    return [];
  }
}

/** List tabs in Firefox via CDP on port 9223. Throws a descriptive error if CDP is not available. */
async function listFirefoxTabs() {
  let stdout;
  try {
    const result = await execAsync(
      'curl -s --connect-timeout 2 http://localhost:9223/json',
      { timeout: 5000 }
    );
    stdout = result.stdout;
  } catch (e) {
    throw new Error(
      'Firefox is running but remote debugging is not enabled on port 9223.\n' +
      'Fix: run  bash scripts/launch-firefox-debug.sh  (starts Firefox with --remote-debugging-port=9223).\n' +
      'Then try again. Chrome, Safari, and Brave work without any setup.'
    );
  }

  if (!stdout || !stdout.trim().startsWith('[')) {
    throw new Error(
      'Firefox remote debugging port 9223 is not responding with tab data.\n' +
      'Ensure Firefox was started with  --remote-debugging-port=9223  via  bash scripts/launch-firefox-debug.sh .'
    );
  }

  let pages;
  try {
    pages = JSON.parse(stdout);
  } catch {
    throw new Error(
      'Firefox CDP returned unexpected data on port 9223. Try restarting Firefox via  bash scripts/launch-firefox-debug.sh .'
    );
  }

  return pages
    .filter((p) => p.type === 'page')
    .map((p, i) => ({
      browser:     'firefox',
      browserApp:  'Firefox',
      windowIndex: 1,
      tabIndex:    i + 1,
      url:         p.url || '',
      title:       p.title || '(no title)',
      active:      false,
      cdpId:       p.id,
    }));
}

/**
 * List all tabs across requested browsers.
 * Returns { tabs: [...], warnings: [...] } — warnings contain per-browser error messages.
 * @param {string|string[]} browser 'all' | 'chrome' | 'safari' | ... | array
 */
async function getAllTabs(browser = 'all') {
  const running = await getRunningBrowsers();

  let targets;
  if (browser === 'all') {
    targets = running;
  } else if (Array.isArray(browser)) {
    targets = browser.filter((b) => running.includes(b));
  } else {
    // If the specific browser isn't running, still try — avoids false "not running" dismissals
    targets = [browser];
  }

  // Remove duplicates
  targets = [...new Set(targets)];

  const settled = await Promise.allSettled(
    targets.map(async (b) => {
      if (b === 'safari')        return listSafariTabs();
      if (b === 'firefox')       return listFirefoxTabs();
      if (CHROME_LIKE.has(b))    return listChromeTabs(b);
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
      const browserName = BROWSER_APP_NAMES[targets[i]] || targets[i];
      warnings.push(`${browserName}: ${r.reason?.message || String(r.reason)}`);
    }
  }

  return { tabs, warnings };
}

// ---------------------------------------------------------------------------
// JS snippets
// ---------------------------------------------------------------------------

const GET_TEXT_JS = `(function(){
  try {
    var c = document.body.cloneNode(true);
    c.querySelectorAll('script,style,noscript,nav,footer,header,aside,[class*="ad-"],[id*="cookie"],[class*="cookie"],[class*="banner"],[role="banner"],[role="navigation"]').forEach(function(e){e.remove();});
    var text = c.innerText || c.textContent || '';
    return text.replace(/\\n{3,}/g,'\\n\\n').replace(/[ \\t]{4,}/g,' ').trim();
  } catch(e) { return 'Error: ' + e.message; }
})()`;

const FIND_FORMS_JS = `(function(){
  var sensitivePattern = /password|passwd|pwd|cvv|ssn|social.?security|credit.?card|card.?number|secret|token/i;
  var fields = [];
  var idx = 0;
  var inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),select,textarea');
  inputs.forEach(function(el){
    var label = '';
    if(el.id){
      var l = document.querySelector('label[for="'+el.id+'"]');
      if(l) label = l.innerText.trim();
    }
    if(!label){
      var p = el.closest('label');
      if(p) label = p.innerText.replace(el.value,'').trim();
    }
    if(!label){
      var prev = el.previousElementSibling;
      if(prev && /label|span|div/i.test(prev.tagName)) label = prev.innerText.trim();
    }
    var isSensitive = sensitivePattern.test(el.name||'') || sensitivePattern.test(el.id||'') || sensitivePattern.test(el.type||'') || sensitivePattern.test(label);
    var opts = [];
    if(el.tagName === 'SELECT'){
      opts = Array.from(el.options).map(function(o){ return {value:o.value,text:o.text.trim()}; });
    }
    fields.push({
      index: idx++,
      tag: el.tagName.toLowerCase(),
      type: el.type || el.tagName.toLowerCase(),
      name: el.name || '',
      id: el.id || '',
      label: label,
      placeholder: el.placeholder || '',
      value: isSensitive ? '[REDACTED]' : (el.value || ''),
      required: el.required,
      sensitive: isSensitive,
      options: opts,
      visible: el.offsetWidth > 0 && el.offsetHeight > 0
    });
  });
  return JSON.stringify({
    url: window.location.href,
    title: document.title,
    fieldCount: fields.length,
    fields: fields
  });
})()`;

/**
 * Build JS that fills form fields using native value setter
 * (works with React, Vue, Angular synthetic events).
 * @param {Object} fieldMap - { fieldNameOrIdOrLabel: value }
 * @param {boolean} submit - whether to submit the form after filling
 */
function buildFillJS(fieldMap, submit = false) {
  const fieldsJson = JSON.stringify(fieldMap);
  return `(function(){
  var fields = ${fieldsJson};
  var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') && Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  var nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value') && Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  var nativeTextAreaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') && Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;

  function findElement(key){
    // Try by name, id, placeholder, label text
    var el = document.querySelector('[name="'+key+'"]') ||
             document.querySelector('#'+key) ||
             document.querySelector('[placeholder="'+key+'"]');
    if(!el){
      // Try label text match
      var labels = document.querySelectorAll('label');
      for(var i=0;i<labels.length;i++){
        if(labels[i].innerText.trim().toLowerCase().indexOf(key.toLowerCase())>=0){
          var forId = labels[i].htmlFor;
          if(forId) el = document.getElementById(forId);
          if(!el) el = labels[i].querySelector('input,select,textarea');
          if(el) break;
        }
      }
    }
    return el;
  }

  function setAndDispatch(el, value){
    var setter = el instanceof HTMLSelectElement ? nativeSelectValueSetter :
                 el instanceof HTMLTextAreaElement ? nativeTextAreaSetter :
                 nativeInputValueSetter;
    if(setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    el.dispatchEvent(new Event('blur', {bubbles:true}));
  }

  var results = [];
  for(var key in fields){
    var el = findElement(key);
    if(el){
      try{
        setAndDispatch(el, fields[key]);
        results.push({field:key, status:'filled'});
      } catch(e){
        results.push({field:key, status:'error', error:e.message});
      }
    } else {
      results.push({field:key, status:'not_found'});
    }
  }

  ${submit ? `
  // Submit the form
  var form = document.querySelector('form');
  if(form){
    var submitBtn = form.querySelector('[type="submit"]');
    if(submitBtn) submitBtn.click();
    else form.submit();
    results.push({field:'__submit__', status:'submitted'});
  } else {
    results.push({field:'__submit__', status:'no_form_found'});
  }` : ''}

  return JSON.stringify({filled: results.filter(function(r){return r.status==='filled';}).length, results: results});
})()`;
}

// ---------------------------------------------------------------------------
// JS execution dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute JS in a tab. Dispatches to AppleScript (Chrome/Safari) or CDP (Firefox).
 */
async function execJSInTab(browser, windowIdx, tabIdx, jsCode) {
  if (browser === 'safari') {
    return execJSInSafari(windowIdx, tabIdx, jsCode);
  }
  if (browser === 'firefox') {
    return execJSViaCDP(9223, tabIdx - 1, jsCode);
  }
  if (CHROME_LIKE.has(browser)) {
    const appName = BROWSER_APP_NAMES[browser];
    return execJSInChromeBrowser(appName, windowIdx, tabIdx, jsCode);
  }
  throw new Error(`Unsupported browser: ${browser}`);
}

// ---------------------------------------------------------------------------
// Tool: tabs_list
// ---------------------------------------------------------------------------

async function tabsList({ browser = 'all' } = {}) {
  const { tabs, warnings } = await getAllTabs(browser);

  const lines = [];

  if (tabs.length === 0 && warnings.length === 0) {
    const running = await getRunningBrowsers();
    if (running.length === 0) return 'No browsers are currently running.';
    const requested = browser === 'all' ? running.join(', ') : browser;
    return `No tabs found in ${requested}. The browser may have no windows open.`;
  }

  if (tabs.length > 0) {
    // Group by browser for memory stats
    const browsers = [...new Set(tabs.map((t) => t.browser))];
    const memStats = {};
    await Promise.all(
      browsers.map(async (b) => {
        const appName = BROWSER_APP_NAMES[b] || b;
        memStats[b] = await getBrowserMemoryMB(appName);
      })
    );

    const grouped = {};
    for (const tab of tabs) {
      if (!grouped[tab.browser]) grouped[tab.browser] = [];
      grouped[tab.browser].push(tab);
    }

    lines.push(`Found ${tabs.length} open tab(s):\n`);
    for (const [b, bTabs] of Object.entries(grouped)) {
      const memMB = memStats[b] || 0;
      lines.push(`## ${BROWSER_APP_NAMES[b] || b} (${bTabs.length} tabs${memMB ? `, ~${memMB} MB` : ''})`);
      for (const t of bTabs) {
        const activeMarker = t.active ? ' ★' : '';
        lines.push(`  [W${t.windowIndex}T${t.tabIndex}]${activeMarker} ${t.title}`);
        lines.push(`         ${t.url}`);
      }
      lines.push('');
    }
  }

  // Always show browser errors — this is critical so the agent knows why Firefox tabs are missing
  if (warnings.length > 0) {
    if (tabs.length > 0) lines.push('---');
    lines.push('The following browsers had errors:\n');
    for (const w of warnings) {
      lines.push(`  ! ${w}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool: tabs_close
// ---------------------------------------------------------------------------

async function tabsClose({ browser, windowIndex, tabIndex, urlPattern, duplicatesOnly = false } = {}) {
  if (duplicatesOnly) {
    // Find and close duplicate tabs
    const { tabs } = await getAllTabs(browser || 'all');
    const seen = new Map();
    const toClose = [];

    for (const tab of tabs) {
      const key = tab.url.replace(/#.*$/, '').replace(/\?.*$/, ''); // normalize URL
      if (seen.has(key)) {
        toClose.push(tab);
      } else {
        seen.set(key, tab);
      }
    }

    if (toClose.length === 0) return 'No duplicate tabs found.';

    const closedTitles = [];
    for (const tab of toClose) {
      try {
        await closeSpecificTab(tab.browser, tab.windowIndex, tab.tabIndex);
        closedTitles.push(`"${tab.title}" (${tab.browser} W${tab.windowIndex}T${tab.tabIndex})`);
      } catch (e) {
        closedTitles.push(`[failed: ${tab.title}] — ${e.message}`);
      }
    }
    return `Closed ${closedTitles.length} duplicate tab(s):\n${closedTitles.join('\n')}`;
  }

  if (urlPattern) {
    // Close all tabs matching URL regex
    const { tabs } = await getAllTabs(browser || 'all');
    let regex;
    try { regex = new RegExp(urlPattern, 'i'); } catch { return `Invalid URL pattern regex: ${urlPattern}`; }
    const matching = tabs.filter((t) => regex.test(t.url) || regex.test(t.title));
    if (matching.length === 0) return `No tabs matched pattern: ${urlPattern}`;

    const closedTitles = [];
    for (const tab of matching) {
      try {
        await closeSpecificTab(tab.browser, tab.windowIndex, tab.tabIndex);
        closedTitles.push(`"${tab.title}"`);
      } catch (e) {
        closedTitles.push(`[failed: ${tab.title}]`);
      }
    }
    return `Closed ${closedTitles.length} tab(s) matching "${urlPattern}":\n${closedTitles.join('\n')}`;
  }

  if (browser && windowIndex && tabIndex) {
    await closeSpecificTab(browser, windowIndex, tabIndex);
    return `Closed tab W${windowIndex}T${tabIndex} in ${BROWSER_APP_NAMES[browser] || browser}.`;
  }

  return 'Please specify either (browser + windowIndex + tabIndex), urlPattern, or duplicatesOnly=true.';
}

async function closeSpecificTab(browser, windowIdx, tabIdx) {
  if (browser === 'safari') {
    const script = `
tell application "Safari"
  close tab ${tabIdx} of window ${windowIdx}
end tell`;
    return runAppleScript(script);
  }

  if (CHROME_LIKE.has(browser)) {
    const appName = BROWSER_APP_NAMES[browser];
    const script = `
tell application "${appName}"
  close tab ${tabIdx} of window ${windowIdx}
end tell`;
    return runAppleScript(script);
  }

  if (browser === 'firefox') {
    // Firefox CDP: close via DevTools protocol
    const { stdout } = await execAsync(
      'curl -s http://localhost:9223/json',
      { timeout: 5000 }
    );
    const pages = JSON.parse(stdout);
    const page = pages.filter((p) => p.type === 'page')[tabIdx - 1];
    if (!page) throw new Error(`Firefox tab ${tabIdx} not found`);
    await execAsync(`curl -s -X DELETE http://localhost:9223/json/close/${page.id}`, { timeout: 5000 });
    return;
  }

  throw new Error(`Cannot close tabs in unsupported browser: ${browser}`);
}

// ---------------------------------------------------------------------------
// Tool: tabs_read
// ---------------------------------------------------------------------------

async function tabsRead({ browser, windowIndex, tabIndex, maxLength = 15000 } = {}) {
  if (!browser || !windowIndex || !tabIndex) {
    return 'Please specify browser, windowIndex, and tabIndex. Use tabs_list to find them.';
  }

  const js = GET_TEXT_JS;
  let text;
  try {
    text = await execJSInTab(browser, windowIndex, tabIndex, js);
  } catch (e) {
    return `Failed to read tab content: ${e.message}`;
  }

  if (!text || text === 'null') return '(Page appears to be empty or has no readable text)';

  // Trim to maxLength
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + `\n\n[...truncated at ${maxLength} chars. Total length: ${text.length}]`;
  }

  return text;
}

// ---------------------------------------------------------------------------
// Tool: tabs_focus
// ---------------------------------------------------------------------------

async function tabsFocus({ browser, windowIndex, tabIndex } = {}) {
  if (!browser || !windowIndex || !tabIndex) {
    return 'Please specify browser, windowIndex, and tabIndex.';
  }

  if (browser === 'safari') {
    const script = `
tell application "Safari"
  set current tab of window ${windowIndex} to tab ${tabIndex} of window ${windowIndex}
  activate
end tell`;
    await runAppleScript(script);
    return `Focused Safari tab ${tabIndex} in window ${windowIndex}.`;
  }

  if (CHROME_LIKE.has(browser)) {
    const appName = BROWSER_APP_NAMES[browser];
    const script = `
tell application "${appName}"
  set active tab index of window ${windowIndex} to ${tabIndex}
  set index of window ${windowIndex} to 1
  activate
end tell`;
    await runAppleScript(script);
    return `Focused ${appName} tab ${tabIndex} in window ${windowIndex}.`;
  }

  return `Focus not supported for ${browser} via this method. Tab management for Firefox requires CDP.`;
}

// ---------------------------------------------------------------------------
// Tool: tabs_find_duplicates
// ---------------------------------------------------------------------------

async function tabsFindDuplicates({ browser = 'all' } = {}) {
  const { tabs, warnings } = await getAllTabs(browser);

  if (tabs.length === 0) {
    const msg = ['No open tabs found.'];
    if (warnings.length > 0) {
      msg.push('');
      msg.push('Browsers with errors:');
      for (const w of warnings) msg.push(`  ! ${w}`);
    }
    return msg.join('\n');
  }

  // Exact URL duplicates
  const exactUrlMap = new Map();
  for (const tab of tabs) {
    if (!exactUrlMap.has(tab.url)) exactUrlMap.set(tab.url, []);
    exactUrlMap.get(tab.url).push(tab);
  }
  const exactDups = [...exactUrlMap.entries()].filter(([, arr]) => arr.length > 1);

  // Near-duplicate URLs (same URL ignoring hash + query)
  const normalUrlMap = new Map();
  for (const tab of tabs) {
    const norm = tab.url.replace(/[?#].*$/, '');
    if (!normalUrlMap.has(norm)) normalUrlMap.set(norm, []);
    normalUrlMap.get(norm).push(tab);
  }
  const nearDups = [...normalUrlMap.entries()].filter(([, arr]) => arr.length > 1 && !exactUrlMap.has(arr[0].url));

  // Duplicate domains
  const domainMap = new Map();
  for (const tab of tabs) {
    try {
      const domain = new URL(tab.url).hostname;
      if (!domainMap.has(domain)) domainMap.set(domain, []);
      domainMap.get(domain).push(tab);
    } catch {}
  }
  const domainDups = [...domainMap.entries()].filter(([, arr]) => arr.length > 1);

  // Memory per browser
  const browsers = [...new Set(tabs.map((t) => t.browser))];
  const memStats = {};
  await Promise.all(
    browsers.map(async (b) => {
      const appName = BROWSER_APP_NAMES[b] || b;
      memStats[b] = await getBrowserMemoryMB(appName);
    })
  );

  const lines = [];
  lines.push(`Tab Analysis — ${tabs.length} total open tabs\n`);

  // Memory summary
  for (const b of browsers) {
    lines.push(`${BROWSER_APP_NAMES[b] || b}: ~${memStats[b] || 0} MB`);
  }
  lines.push('');

  if (exactDups.length > 0) {
    lines.push('### Exact Duplicates (identical URL)');
    for (const [url, arr] of exactDups) {
      lines.push(`  ${arr.length}x  ${arr[0].title || url}`);
      lines.push(`       ${url}`);
      for (let i = 1; i < arr.length; i++) {
        const t = arr[i];
        lines.push(`  → Recommend closing: ${t.browser} W${t.windowIndex}T${t.tabIndex}`);
      }
    }
    lines.push('');
  } else {
    lines.push('No exact URL duplicates found.\n');
  }

  if (nearDups.length > 0) {
    lines.push('### Near-Duplicates (same page, different hash/query)');
    for (const [norm, arr] of nearDups) {
      lines.push(`  ${arr.length}x  ${norm}`);
      for (const t of arr) {
        lines.push(`    ${t.browser} W${t.windowIndex}T${t.tabIndex}: ${t.url}`);
      }
    }
    lines.push('');
  }

  if (domainDups.length > 0) {
    lines.push('### Same Domain (multiple tabs on the same site)');
    const top = domainDups.sort(([, a], [, b]) => b.length - a.length).slice(0, 10);
    for (const [domain, arr] of top) {
      lines.push(`  ${domain} — ${arr.length} tabs`);
    }
    lines.push('');
  }

  const totalDup = exactDups.reduce((s, [, a]) => s + a.length - 1, 0) + nearDups.reduce((s, [, a]) => s + a.length - 1, 0);
  if (totalDup > 0) {
    lines.push(`Recommendation: Close ${totalDup} duplicate/near-duplicate tab(s) with tabs_close duplicatesOnly=true`);
  } else {
    lines.push('No significant duplicates found. Your tabs look clean!');
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('Browsers with errors (tabs not included in analysis):');
    for (const w of warnings) lines.push(`  ! ${w}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool: tabs_find_forms
// ---------------------------------------------------------------------------

async function tabsFindForms({ browser, windowIndex, tabIndex } = {}) {
  if (!browser || !windowIndex || !tabIndex) {
    return 'Please specify browser, windowIndex, and tabIndex. Use tabs_list to find them.';
  }

  let raw;
  try {
    raw = await execJSInTab(browser, windowIndex, tabIndex, FIND_FORMS_JS);
  } catch (e) {
    return `Failed to scan for forms: ${e.message}`;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return `Unexpected response from page: ${raw?.slice(0, 200)}`;
  }

  if (!data.fields || data.fields.length === 0) {
    return `No fillable form fields found on "${data.title}" (${data.url})`;
  }

  const visibleFields = data.fields.filter((f) => f.visible);
  const lines = [
    `Found ${data.fieldCount} form field(s) on "${data.title}"`,
    `URL: ${data.url}`,
    `Visible fields: ${visibleFields.length}`,
    '',
  ];

  for (const f of data.fields) {
    const sens = f.sensitive ? ' [SENSITIVE]' : '';
    const req  = f.required  ? ' *required*'  : '';
    const labelStr = f.label || f.placeholder || f.name || f.id || '(unlabeled)';
    lines.push(`  [${f.index}] ${f.tag}[type=${f.type}]${sens}${req}`);
    lines.push(`       Label: "${labelStr}"  name="${f.name}"  id="${f.id}"`);
    if (f.value && !f.sensitive) lines.push(`       Current value: "${f.value}"`);
    if (f.options && f.options.length > 0) {
      const opts = f.options.slice(0, 5).map((o) => `"${o.text}"`).join(', ');
      lines.push(`       Options: ${opts}${f.options.length > 5 ? ` +${f.options.length - 5} more` : ''}`);
    }
  }

  lines.push('');
  lines.push('Use tabs_fill_form to fill fields by name, id, or label text.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool: tabs_fill_form
// ---------------------------------------------------------------------------

async function tabsFillForm({ browser, windowIndex, tabIndex, fields = {}, submit = false } = {}) {
  if (!browser || !windowIndex || !tabIndex) {
    return 'Please specify browser, windowIndex, and tabIndex.';
  }
  if (Object.keys(fields).length === 0) {
    return 'No fields provided. Pass fields as an object: { "fieldName": "value", ... }';
  }

  const js = buildFillJS(fields, submit);
  let raw;
  try {
    raw = await execJSInTab(browser, windowIndex, tabIndex, js);
  } catch (e) {
    return `Failed to fill form: ${e.message}`;
  }

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    return `Unexpected response: ${raw?.slice(0, 200)}`;
  }

  const lines = [`Filled ${result.filled} of ${Object.keys(fields).length} field(s):`];
  for (const r of result.results) {
    const icon = r.status === 'filled' ? '✓' : r.status === 'not_found' ? '✗' : '!';
    lines.push(`  ${icon} ${r.field}: ${r.status}${r.error ? ` (${r.error})` : ''}`);
  }

  const notFound = result.results.filter((r) => r.status === 'not_found').map((r) => r.field);
  if (notFound.length > 0) {
    lines.push(`\nNot found: ${notFound.join(', ')}`);
    lines.push('Tip: Use tabs_find_forms to see exact field names/ids/labels.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool: tabs_run_js
// ---------------------------------------------------------------------------

async function tabsRunJS({ browser, windowIndex, tabIndex, code } = {}) {
  if (!browser || !windowIndex || !tabIndex || !code) {
    return 'Please specify browser, windowIndex, tabIndex, and code.';
  }

  // Wrap in try/catch and JSON-serialize result
  const wrappedCode = `(function(){ try { var _r = (function(){ ${code} }()); return typeof _r === 'object' ? JSON.stringify(_r) : String(_r === undefined ? '' : _r); } catch(e) { return 'Error: ' + e.message; } })()`;

  try {
    const result = await execJSInTab(browser, windowIndex, tabIndex, wrappedCode);
    return result || '(returned undefined)';
  } catch (e) {
    return `JavaScript execution failed: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------
// Tool definitions export
// ---------------------------------------------------------------------------

const BROWSER_TABS_TOOLS = [
  {
    name: 'tabs_list',
    category: 'tabs',
    description: 'List all open tabs across one or more browsers.',
    permissionLevel: 'read',
    params: ['browser'],
    execute: async (args) => {
      try { return await tabsList(args); }
      catch (e) { return `tabs_list error: ${e.message}`; }
    },
  },
  {
    name: 'tabs_close',
    category: 'tabs',
    description: 'Close one or more browser tabs.',
    permissionLevel: 'sensitive',
    params: ['browser', 'windowIndex', 'tabIndex', 'urlPattern', 'duplicatesOnly'],
    execute: async (args) => {
      try { return await tabsClose(args); }
      catch (e) { return `tabs_close error: ${e.message}`; }
    },
  },
  {
    name: 'tabs_read',
    category: 'tabs',
    description: 'Read the visible text content of a browser tab.',
    permissionLevel: 'read',
    params: ['browser', 'windowIndex', 'tabIndex', 'maxLength'],
    execute: async (args) => {
      try { return await tabsRead(args); }
      catch (e) { return `tabs_read error: ${e.message}`; }
    },
  },
  {
    name: 'tabs_focus',
    category: 'tabs',
    description: 'Switch to and activate a specific browser tab.',
    permissionLevel: 'read',
    params: ['browser', 'windowIndex', 'tabIndex'],
    execute: async (args) => {
      try { return await tabsFocus(args); }
      catch (e) { return `tabs_focus error: ${e.message}`; }
    },
  },
  {
    name: 'tabs_find_duplicates',
    category: 'tabs',
    description: 'Analyze open tabs and find duplicates, near-duplicates, and memory usage.',
    permissionLevel: 'read',
    params: ['browser'],
    execute: async (args) => {
      try { return await tabsFindDuplicates(args); }
      catch (e) { return `tabs_find_duplicates error: ${e.message}`; }
    },
  },
  {
    name: 'tabs_find_forms',
    category: 'tabs',
    description: 'Detect all fillable input fields on a browser tab.',
    permissionLevel: 'read',
    params: ['browser', 'windowIndex', 'tabIndex'],
    execute: async (args) => {
      try { return await tabsFindForms(args); }
      catch (e) { return `tabs_find_forms error: ${e.message}`; }
    },
  },
  {
    name: 'tabs_fill_form',
    category: 'tabs',
    description: 'Fill form fields on a browser tab. Works with React, Vue, Angular.',
    permissionLevel: 'sensitive',
    params: ['browser', 'windowIndex', 'tabIndex', 'fields', 'submit'],
    execute: async (args) => {
      try { return await tabsFillForm(args); }
      catch (e) { return `tabs_fill_form error: ${e.message}`; }
    },
  },
  {
    name: 'tabs_run_js',
    category: 'tabs',
    description: 'Execute arbitrary JavaScript in a browser tab and return the result.',
    permissionLevel: 'sensitive',
    params: ['browser', 'windowIndex', 'tabIndex', 'code'],
    execute: async (args) => {
      try { return await tabsRunJS(args); }
      catch (e) { return `tabs_run_js error: ${e.message}`; }
    },
  },
];

module.exports = { BROWSER_TABS_TOOLS };
