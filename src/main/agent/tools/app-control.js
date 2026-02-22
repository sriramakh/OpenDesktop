const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Fuzzy match score: how similar two strings are (0-1).
 * Simple bigram similarity — good enough for app name typos.
 */
function fuzzyScore(a, b) {
  a = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  b = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a.includes(b) || b.includes(a) ? 0.5 : 0;

  const bigramsA = new Set();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (bigramsA.has(b.slice(i, i + 2))) matches++;
  }
  return (2 * matches) / (a.length - 1 + b.length - 1);
}

/**
 * Find an application by name on macOS.
 * Searches /Applications, ~/Applications, /System/Applications.
 * Returns the best fuzzy match.
 */
async function findMacApp(appName) {
  const searchDirs = [
    '/Applications',
    path.join(os.homedir(), 'Applications'),
    '/System/Applications',
    '/System/Applications/Utilities',
  ];

  const candidates = [];

  for (const dir of searchDirs) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.endsWith('.app')) {
          const name = entry.replace(/\.app$/, '');
          const score = fuzzyScore(appName, name);
          candidates.push({ name, path: path.join(dir, entry), score });
        }
      }
    } catch { /* dir doesn't exist */ }
  }

  // Also check if the target is a running process name (for non-.app things like Ollama)
  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Return best match if score is reasonable (> 0.3)
  if (candidates.length > 0 && candidates[0].score > 0.3) {
    return candidates[0];
  }

  return null;
}

const AppControlTools = [
  {
    name: 'app_open',
    category: 'app-control',
    description: 'Open an application, file, or URL. For apps, just use the name (e.g. "Safari", "Finder", "Ollama", "Visual Studio Code") — the system will find it automatically even with typos. For files, use the full absolute path. For URLs, use the full URL with https://.',
    params: ['target', 'app'],
    permissionLevel: 'sensitive',
    async execute({ target, app }) {
      if (!target) throw new Error('target is required');

      const platform = process.platform;

      // Detect what kind of target this is
      const isURL = /^https?:\/\//i.test(target);
      const isFilePath = target.startsWith('/') || target.startsWith('~') || target.startsWith('.');
      const isAppName = !isURL && !isFilePath;

      if (platform === 'darwin') {
        // If it's an app name, try to find it intelligently
        if (isAppName && !app) {
          // First try: direct `open -a` which handles exact names
          try {
            return await runShell(`open -a "${target}"`);
          } catch (directErr) {
            // Direct open failed — try fuzzy search
            const found = await findMacApp(target);
            if (found) {
              try {
                return await runShell(`open -a "${found.name}"`);
              } catch {
                // Try opening the .app bundle directly
                return await runShell(`open "${found.path}"`);
              }
            }

            // Last resort: try mdfind (Spotlight) to locate the app
            try {
              const spotlightResult = await runShell(
                `mdfind "kMDItemKind == 'Application'" -name "${target}" | head -3`
              );
              const appPaths = spotlightResult.trim().split('\n').filter(Boolean);
              if (appPaths.length > 0) {
                return await runShell(`open "${appPaths[0]}"`);
              }
            } catch { /* spotlight failed */ }

            throw new Error(
              `Could not find application "${target}". ` +
              (found ? `Did you mean "${found.name}"? ` : '') +
              `Make sure it's installed in /Applications or ~/Applications.`
            );
          }
        }

        // File path or URL
        const cmd = app ? `open -a "${app}" "${target}"` : `open "${target}"`;
        return runShell(cmd);
      } else if (platform === 'linux') {
        const cmd = app ? `${app} "${target}"` : `xdg-open "${target}"`;
        return runShell(cmd);
      } else if (platform === 'win32') {
        const cmd = app ? `start "" "${app}" "${target}"` : `start "" "${target}"`;
        return runShell(cmd);
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }
    },
  },

  {
    name: 'app_find',
    category: 'app-control',
    description: 'Search for installed applications by name. Handles typos and partial matches. Returns the best matching app names and paths. Use this to verify an app exists before opening it.',
    params: ['query'],
    permissionLevel: 'safe',
    async execute({ query }) {
      if (!query) throw new Error('query is required');
      const platform = process.platform;

      if (platform === 'darwin') {
        const searchDirs = [
          '/Applications',
          path.join(os.homedir(), 'Applications'),
          '/System/Applications',
          '/System/Applications/Utilities',
        ];

        const candidates = [];
        for (const dir of searchDirs) {
          try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
              if (entry.endsWith('.app')) {
                const name = entry.replace(/\.app$/, '');
                const score = fuzzyScore(query, name);
                if (score > 0.2) {
                  candidates.push({ name, path: path.join(dir, entry), score: Math.round(score * 100) });
                }
              }
            }
          } catch { /* skip */ }
        }

        candidates.sort((a, b) => b.score - a.score);
        const top = candidates.slice(0, 10);

        if (top.length === 0) {
          return `No applications found matching "${query}".`;
        }

        return `Applications matching "${query}":\n` +
          top.map((c) => `  ${c.name} (${c.score}% match) — ${c.path}`).join('\n');
      }

      // Linux/Windows fallback
      return await runShell(
        platform === 'linux'
          ? `find /usr/share/applications -name "*.desktop" | xargs grep -l -i "${query}" 2>/dev/null | head -10`
          : `powershell -command "Get-StartApps | Where-Object { $_.Name -like '*${query}*' } | Select-Object Name, AppID | Format-Table -AutoSize"`
      );
    },
  },

  {
    name: 'app_list',
    category: 'app-control',
    description: 'List all currently running (visible) applications on the system. Returns app names.',
    params: [],
    permissionLevel: 'safe',
    async execute() {
      const platform = process.platform;
      let cmd;

      if (platform === 'darwin') {
        cmd = `osascript -e 'tell application "System Events" to get name of every application process whose background only is false'`;
      } else if (platform === 'linux') {
        cmd = `wmctrl -l 2>/dev/null | awk '{$1=$2=$3=""; print $0}' | sed 's/^ *//' || ps aux --sort=-%mem | head -20 | awk '{print $11}'`;
      } else if (platform === 'win32') {
        cmd = `powershell -command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object ProcessName, MainWindowTitle | Format-Table -AutoSize"`;
      }

      const result = await runShell(cmd);
      return result;
    },
  },

  {
    name: 'app_focus',
    category: 'app-control',
    description: 'Bring a named application to the foreground/focus. Use the exact app name like "Finder", "Safari", "Terminal".',
    params: ['appName'],
    permissionLevel: 'sensitive',
    async execute({ appName }) {
      if (!appName) throw new Error('appName is required');
      const platform = process.platform;

      if (platform === 'darwin') {
        return runShell(`osascript -e 'tell application "${appName}" to activate'`);
      } else if (platform === 'linux') {
        return runShell(`wmctrl -a "${appName}" 2>/dev/null || xdotool search --name "${appName}" windowactivate`);
      } else if (platform === 'win32') {
        return runShell(
          `powershell -command "(New-Object -ComObject WScript.Shell).AppActivate('${appName}')"`
        );
      }

      throw new Error(`Unsupported platform: ${platform}`);
    },
  },

  {
    name: 'app_quit',
    category: 'app-control',
    description: 'Quit/close a running application. Set force=true to force-kill. Use exact app name.',
    params: ['appName', 'force'],
    permissionLevel: 'sensitive',
    async execute({ appName, force = false }) {
      if (!appName) throw new Error('appName is required');
      const platform = process.platform;

      if (platform === 'darwin') {
        const script = force
          ? `tell application "${appName}" to quit`
          : `tell application "${appName}" to quit saving yes`;
        return runShell(`osascript -e '${script}'`);
      } else if (platform === 'linux') {
        return force
          ? runShell(`pkill -f "${appName}"`)
          : runShell(`wmctrl -c "${appName}" 2>/dev/null || pkill -f "${appName}"`);
      } else if (platform === 'win32') {
        return force
          ? runShell(`taskkill /F /IM "${appName}.exe"`)
          : runShell(`taskkill /IM "${appName}.exe"`);
      }

      throw new Error(`Unsupported platform: ${platform}`);
    },
  },

  {
    name: 'app_screenshot',
    category: 'app-control',
    description: 'Capture a screenshot of the full screen or a specific window. Saves to outputPath (defaults to /tmp/screenshot_<timestamp>.png).',
    params: ['outputPath', 'window'],
    permissionLevel: 'safe',
    async execute({ outputPath, window }) {
      const platform = process.platform;
      const outPath = outputPath || `/tmp/screenshot_${Date.now()}.png`;

      if (platform === 'darwin') {
        const cmd = window
          ? `screencapture -w "${outPath}"`
          : `screencapture -x "${outPath}"`;
        await runShell(cmd);
      } else if (platform === 'linux') {
        const cmd = window
          ? `scrot -s "${outPath}" 2>/dev/null || import "${outPath}"`
          : `scrot "${outPath}" 2>/dev/null || import -window root "${outPath}"`;
        await runShell(cmd);
      } else if (platform === 'win32') {
        await runShell(
          `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bitmap = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bitmap.Save('${outPath}') }"`
        );
      }

      return `Screenshot saved to: ${outPath}`;
    },
  },
];

function runShell(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Command failed: ${err.message}\n${stderr}`));
      } else {
        resolve(stdout.trim() || stderr.trim() || 'OK');
      }
    });
  });
}

module.exports = { AppControlTools };
