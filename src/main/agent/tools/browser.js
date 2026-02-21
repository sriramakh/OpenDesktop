const { exec } = require('child_process');

// Browser automation tools using system-level commands
// For full Playwright integration, the user can install playwright separately

let browserProcess = null;

const BrowserTools = [
  {
    name: 'browser_navigate',
    category: 'browser',
    description: 'Open a URL in the default browser',
    params: ['url'],
    permissionLevel: 'sensitive',
    async execute({ url }) {
      if (!url) throw new Error('url is required');
      if (!url.match(/^https?:\/\//)) url = 'https://' + url;

      const platform = process.platform;
      let cmd;

      if (platform === 'darwin') {
        cmd = `open "${url}"`;
      } else if (platform === 'linux') {
        cmd = `xdg-open "${url}"`;
      } else if (platform === 'win32') {
        cmd = `start "" "${url}"`;
      }

      return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 10000 }, (err) => {
          if (err) reject(new Error(`Failed to open URL: ${err.message}`));
          else resolve(`Opened: ${url}`);
        });
      });
    },
  },

  {
    name: 'browser_click',
    category: 'browser',
    description: 'Click at screen coordinates (x, y) using system automation',
    params: ['x', 'y', 'button'],
    permissionLevel: 'sensitive',
    async execute({ x, y, button = 'left' }) {
      if (x === undefined || y === undefined) throw new Error('x and y are required');

      const platform = process.platform;

      if (platform === 'darwin') {
        // Use cliclick or AppleScript
        const clickType = button === 'right' ? 'rc' : 'c';
        try {
          return await runShell(`cliclick ${clickType}:${x},${y}`);
        } catch {
          // Fallback to AppleScript
          return await runShell(
            `osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`
          );
        }
      } else if (platform === 'linux') {
        const btn = button === 'right' ? '3' : '1';
        return await runShell(`xdotool mousemove ${x} ${y} click ${btn}`);
      } else if (platform === 'win32') {
        return await runShell(
          `powershell -command "[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y}); [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`
        );
      }

      throw new Error('Unsupported platform');
    },
  },

  {
    name: 'browser_type',
    category: 'browser',
    description: 'Type text using keyboard automation',
    params: ['text', 'delay'],
    permissionLevel: 'sensitive',
    async execute({ text, delay = 50 }) {
      if (!text) throw new Error('text is required');

      const platform = process.platform;

      if (platform === 'darwin') {
        // Escape for AppleScript
        const escaped = text.replace(/"/g, '\\"').replace(/'/g, "'\"'\"'");
        try {
          return await runShell(`cliclick t:"${escaped}"`);
        } catch {
          return await runShell(
            `osascript -e 'tell application "System Events" to keystroke "${escaped}"'`
          );
        }
      } else if (platform === 'linux') {
        return await runShell(`xdotool type --delay ${delay} "${text}"`);
      } else if (platform === 'win32') {
        const escaped = text.replace(/[+^%~(){}[\]]/g, '{$&}');
        return await runShell(
          `powershell -command "[System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`
        );
      }

      throw new Error('Unsupported platform');
    },
  },

  {
    name: 'browser_key',
    category: 'browser',
    description: 'Press a keyboard shortcut (e.g., "cmd+c", "ctrl+v", "enter")',
    params: ['keys'],
    permissionLevel: 'sensitive',
    async execute({ keys }) {
      if (!keys) throw new Error('keys is required');

      const platform = process.platform;

      if (platform === 'darwin') {
        const parts = keys.toLowerCase().split('+').map((k) => k.trim());
        let modifiers = '';
        let key = '';

        for (const p of parts) {
          if (p === 'cmd' || p === 'command') modifiers += 'command down, ';
          else if (p === 'ctrl' || p === 'control') modifiers += 'control down, ';
          else if (p === 'shift') modifiers += 'shift down, ';
          else if (p === 'alt' || p === 'option') modifiers += 'option down, ';
          else key = p;
        }

        modifiers = modifiers.replace(/, $/, '');

        if (modifiers) {
          return await runShell(
            `osascript -e 'tell application "System Events" to keystroke "${key}" using {${modifiers}}'`
          );
        } else {
          // Special keys
          const specialKeys = {
            enter: 36, return: 36, tab: 48, escape: 53, space: 49,
            delete: 51, backspace: 51, up: 126, down: 125, left: 123, right: 124,
          };
          const keyCode = specialKeys[key.toLowerCase()];
          if (keyCode) {
            return await runShell(
              `osascript -e 'tell application "System Events" to key code ${keyCode}'`
            );
          }
          return await runShell(
            `osascript -e 'tell application "System Events" to keystroke "${key}"'`
          );
        }
      } else if (platform === 'linux') {
        const xdoKeys = keys.replace(/cmd/i, 'super').replace(/\+/g, '+');
        return await runShell(`xdotool key ${xdoKeys}`);
      }

      throw new Error('Unsupported platform for keyboard shortcuts');
    },
  },

  {
    name: 'browser_submit_form',
    category: 'browser',
    description: 'Submit form data to a URL via HTTP POST',
    params: ['url', 'data', 'contentType'],
    permissionLevel: 'dangerous',
    async execute({ url, data, contentType = 'application/json' }) {
      if (!url || !data) throw new Error('url and data are required');

      const body = typeof data === 'string' ? data : JSON.stringify(data);

      return await runShell(
        `curl -s -X POST -H "Content-Type: ${contentType}" -d '${body.replace(/'/g, "'\\''")}' "${url}"`
      );
    },
  },
];

function runShell(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`Command failed: ${err.message}\n${stderr}`));
      else resolve(stdout.trim() || 'OK');
    });
  });
}

module.exports = { BrowserTools };
