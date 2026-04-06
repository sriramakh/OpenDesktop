const { exec } = require('child_process');
const os = require('os');
const path = require('path');

class ContextAwareness {
  constructor() {
    this.cache = null;
    this.cacheExpiry = 0;
    this.cacheTTL = 30000; // 30 seconds — context rarely changes mid-conversation
  }

  async getActiveContext() {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) {
      return this.cache;
    }

    const context = {
      platform: process.platform,
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      homeDir: os.homedir(),
      cwd: process.cwd(),
      nodeVersion: process.version,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpus: os.cpus().length,
      uptime: os.uptime(),
      timestamp: now,
    };

    // Platform-specific context — run ALL commands in parallel to minimize latency
    try {
      if (process.platform === 'darwin') {
        const [activeApp, activeWindow, appList] = await Promise.all([
          this.runCommand(
            `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`
          ).catch(() => 'unknown'),
          this.runCommand(
            `osascript -e 'tell application "System Events" to get name of front window of first application process whose frontmost is true'`
          ).catch(() => 'unknown'),
          this.runCommand(
            `osascript -e 'tell application "System Events" to get name of every application process whose background only is false'`
          ).catch(() => ''),
        ]);
        context.activeApp = activeApp;
        context.activeWindow = activeWindow;
        context.runningApps = appList.split(',').map((a) => a.trim()).filter(Boolean);
      } else if (process.platform === 'linux') {
        const [activeApp, activeWindow, appList] = await Promise.all([
          this.runCommand(
            `xdotool getactivewindow getwindowpid 2>/dev/null | xargs -I{} ps -p {} -o comm= 2>/dev/null`
          ).catch(() => 'unknown'),
          this.runCommand(
            `xdotool getactivewindow getwindowname 2>/dev/null`
          ).catch(() => 'unknown'),
          this.runCommand(
            `wmctrl -l 2>/dev/null | awk '{$1=$2=$3=""; print $0}' | sed 's/^ *//'`
          ).catch(() => ''),
        ]);
        context.activeApp = activeApp;
        context.activeWindow = activeWindow;
        context.runningApps = appList.split('\n').filter(Boolean);
      } else if (process.platform === 'win32') {
        context.activeApp = await this.runCommand(
          `powershell -command "(Get-Process | Where-Object {$_.MainWindowHandle -eq (Get-Process -Id (Get-WmiObject Win32_Process | Where-Object {$_.ProcessId -eq (Get-ForegroundWindow | ForEach-Object {$_.ProcessId})}).ProcessId).MainWindowHandle}).ProcessName"`
        ).catch(() => 'unknown');
      }
    } catch {
      context.activeApp = 'unknown';
      context.runningApps = [];
    }

    // Clip values for display
    if (context.activeApp) context.activeApp = context.activeApp.trim();
    if (context.activeWindow) context.activeWindow = context.activeWindow.trim();

    this.cache = context;
    this.cacheExpiry = now + this.cacheTTL;

    return context;
  }

  runCommand(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout: 3000 }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
  }
}

module.exports = { ContextAwareness };
