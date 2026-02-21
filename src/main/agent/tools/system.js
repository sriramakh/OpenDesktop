const { exec, spawn } = require('child_process');
const os = require('os');

const SystemTools = [
  {
    name: 'system_exec',
    category: 'system',
    description: 'Execute any shell command (bash/powershell) and return stdout+stderr. Use for: listing files with ls/find, checking disk usage with du/df, running git commands, installing packages, etc. Provide the full command string.',
    params: ['command', 'cwd', 'timeout', 'env'],
    permissionLevel: 'sensitive',
    async execute({ command, cwd, timeout = 30000, env = {} }) {
      if (!command) throw new Error('command is required');

      // Block extremely dangerous patterns at tool level too
      const blocked = [/\brm\s+-rf\s+\/\s*$/i, /\bmkfs\b/i, /\bdd\b.*of=\/dev/i];
      for (const pattern of blocked) {
        if (pattern.test(command)) {
          throw new Error(`Blocked dangerous command: ${command}`);
        }
      }

      return new Promise((resolve, reject) => {
        exec(command, {
          cwd: cwd || process.cwd(),
          timeout,
          maxBuffer: 5 * 1024 * 1024,
          env: { ...process.env, ...env },
          shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
        }, (err, stdout, stderr) => {
          if (err) {
            if (err.killed) {
              reject(new Error(`Command timed out after ${timeout}ms`));
            } else {
              // Return stderr as part of the result, not always an error
              const output = (stdout + '\n' + stderr).trim();
              if (output) resolve(output);
              else reject(new Error(`Exit code ${err.code}: ${err.message}`));
            }
          } else {
            resolve((stdout + '\n' + stderr).trim());
          }
        });
      });
    },
  },

  {
    name: 'system_info',
    category: 'system',
    description: 'Get detailed system information: OS, CPU model/count, memory (total/free/used), hostname, username, uptime, load averages. Set detail="full" for network interfaces and PATH.',
    params: ['detail'],
    permissionLevel: 'safe',
    async execute({ detail = 'summary' }) {
      const info = {
        platform: process.platform,
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname(),
        username: os.userInfo().username,
        homeDir: os.homedir(),
        shell: process.env.SHELL || process.env.COMSPEC || 'unknown',
        nodeVersion: process.version,
        cpus: os.cpus().length,
        cpuModel: os.cpus()[0]?.model || 'unknown',
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
        usedMemory: formatBytes(os.totalmem() - os.freemem()),
        uptime: formatUptime(os.uptime()),
        loadAvg: os.loadavg().map((l) => l.toFixed(2)),
      };

      if (detail === 'full') {
        info.networkInterfaces = {};
        const nets = os.networkInterfaces();
        for (const [name, addrs] of Object.entries(nets)) {
          info.networkInterfaces[name] = addrs
            .filter((a) => !a.internal)
            .map((a) => ({ address: a.address, family: a.family }));
        }
        info.envPath = process.env.PATH;
        info.tempDir = os.tmpdir();
      }

      return JSON.stringify(info, null, 2);
    },
  },

  {
    name: 'system_processes',
    category: 'system',
    description: 'List top running processes sorted by CPU or memory usage. Returns process name, PID, CPU%, and memory usage.',
    params: ['sortBy', 'limit'],
    permissionLevel: 'safe',
    async execute({ sortBy = 'cpu', limit = 15 }) {
      const platform = process.platform;
      let cmd;

      if (platform === 'darwin' || platform === 'linux') {
        const sortFlag = sortBy === 'memory' ? '-%mem' : '-%cpu';
        cmd = `ps aux --sort=${sortFlag} 2>/dev/null | head -${limit + 1} || ps aux | sort -k ${sortBy === 'memory' ? '4' : '3'} -rn | head -${limit + 1}`;
      } else if (platform === 'win32') {
        cmd = `powershell -command "Get-Process | Sort-Object ${sortBy === 'memory' ? 'WorkingSet64' : 'CPU'} -Descending | Select-Object -First ${limit} Name, Id, CPU, @{Name='MemMB';Expression={[math]::Round($_.WorkingSet64/1MB,1)}} | Format-Table -AutoSize"`;
      }

      return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 10000 }, (err, stdout) => {
          if (err) reject(new Error(`Failed to list processes: ${err.message}`));
          else resolve(stdout.trim());
        });
      });
    },
  },

  {
    name: 'system_clipboard_read',
    category: 'system',
    description: 'Read whatever text is currently in the system clipboard (paste buffer).',
    params: [],
    permissionLevel: 'safe',
    async execute() {
      const platform = process.platform;
      let cmd;

      if (platform === 'darwin') cmd = 'pbpaste';
      else if (platform === 'linux') cmd = 'xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output';
      else if (platform === 'win32') cmd = 'powershell -command "Get-Clipboard"';

      return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 5000 }, (err, stdout) => {
          if (err) reject(new Error('Failed to read clipboard'));
          else resolve(stdout);
        });
      });
    },
  },

  {
    name: 'system_clipboard_write',
    category: 'system',
    description: 'Copy text to the system clipboard so the user can paste it elsewhere.',
    params: ['text'],
    permissionLevel: 'sensitive',
    async execute({ text }) {
      if (!text) throw new Error('text is required');
      const platform = process.platform;

      if (platform === 'darwin') {
        return new Promise((resolve, reject) => {
          const proc = spawn('pbcopy');
          proc.stdin.write(text);
          proc.stdin.end();
          proc.on('close', (code) => {
            if (code === 0) resolve('Copied to clipboard');
            else reject(new Error('Failed to write to clipboard'));
          });
        });
      } else if (platform === 'linux') {
        return new Promise((resolve, reject) => {
          const proc = spawn('xclip', ['-selection', 'clipboard']);
          proc.stdin.write(text);
          proc.stdin.end();
          proc.on('close', (code) => {
            if (code === 0) resolve('Copied to clipboard');
            else reject(new Error('Failed to write to clipboard'));
          });
        });
      } else if (platform === 'win32') {
        return new Promise((resolve, reject) => {
          exec(`powershell -command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`
            , { timeout: 5000 }, (err) => {
              if (err) reject(new Error('Failed to write to clipboard'));
              else resolve('Copied to clipboard');
            });
        });
      }

      throw new Error('Unsupported platform');
    },
  },

  {
    name: 'system_notify',
    category: 'system',
    description: 'Show a native OS notification popup with a title and message. Useful for alerting the user when a long task completes.',
    params: ['title', 'message', 'sound'],
    permissionLevel: 'safe',
    async execute({ title = 'OpenDesktop', message, sound = false }) {
      if (!message) throw new Error('message is required');
      const platform = process.platform;

      if (platform === 'darwin') {
        const soundFlag = sound ? ' sound name "default"' : '';
        return new Promise((resolve, reject) => {
          exec(
            `osascript -e 'display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"${soundFlag}'`,
            { timeout: 5000 },
            (err) => {
              if (err) reject(err);
              else resolve('Notification sent');
            }
          );
        });
      } else if (platform === 'linux') {
        return new Promise((resolve, reject) => {
          exec(`notify-send "${title}" "${message}"`, { timeout: 5000 }, (err) => {
            if (err) reject(err);
            else resolve('Notification sent');
          });
        });
      }

      return 'Notification not supported on this platform';
    },
  },
];

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

module.exports = { SystemTools };
