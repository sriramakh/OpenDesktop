const { exec } = require('child_process');
const os = require('os');

const AppControlTools = [
  {
    name: 'app_open',
    category: 'app-control',
    description: 'Open an application, file, or URL using the system default handler. Can open any file (e.g. PDFs, images, documents) with its default app. Use full file paths like /Users/name/Desktop/report.pdf or app names like "Safari", "Finder".',
    params: ['target', 'app'],
    permissionLevel: 'sensitive',
    async execute({ target, app }) {
      if (!target) throw new Error('target is required');

      let cmd;
      const platform = process.platform;

      if (platform === 'darwin') {
        cmd = app ? `open -a "${app}" "${target}"` : `open "${target}"`;
      } else if (platform === 'linux') {
        cmd = app ? `${app} "${target}"` : `xdg-open "${target}"`;
      } else if (platform === 'win32') {
        cmd = app ? `start "" "${app}" "${target}"` : `start "" "${target}"`;
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return runShell(cmd);
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
