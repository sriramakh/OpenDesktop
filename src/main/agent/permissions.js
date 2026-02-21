// Permission classification for tool actions
// Levels: safe, sensitive, dangerous

const TOOL_PERMISSION_MAP = {
  // Safe: read-only, no side effects
  fs_read: 'safe',
  fs_list: 'safe',
  fs_search: 'safe',
  fs_tree: 'safe',
  fs_info: 'safe',
  web_search: 'safe',
  web_fetch: 'safe',
  web_fetch_json: 'safe',
  context_active: 'safe',
  llm_query: 'safe',
  llm_summarize: 'safe',
  llm_extract: 'safe',
  llm_code: 'safe',
  system_info: 'safe',
  system_processes: 'safe',
  system_clipboard_read: 'safe',
  system_notify: 'safe',
  app_list: 'safe',
  app_screenshot: 'safe',

  // Sensitive: write operations, launching apps
  fs_write: 'sensitive',
  fs_edit: 'sensitive',
  fs_mkdir: 'sensitive',
  app_open: 'sensitive',
  system_exec: 'sensitive',
  browser_navigate: 'sensitive',
  browser_click: 'sensitive',
  browser_type: 'sensitive',

  // Dangerous: destructive or high-risk
  fs_delete: 'dangerous',
  fs_move: 'dangerous',
  system_exec_sudo: 'dangerous',
  browser_submit_form: 'dangerous',
};

// Patterns that escalate permission level
const DANGEROUS_PATTERNS = {
  system_exec: [
    /\brm\s+(-rf?|--recursive)/i,
    /\bsudo\b/i,
    /\bmkfs\b/i,
    /\bdd\b.*of=/i,
    /\bformat\b/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bkill\s+-9/i,
    />\s*\/dev\//i,
    /\bcurl\b.*\|\s*(bash|sh)/i,
    /\bchmod\s+777/i,
    /\bpasswd\b/i,
  ],
  fs_write: [
    /\/etc\//i,
    /\/usr\//i,
    /\/system\//i,
    /\.ssh\//i,
    /\.env/i,
    /\.bashrc/i,
    /\.zshrc/i,
    /\.profile/i,
  ],
  browser_type: [
    /password/i,
    /credit.?card/i,
    /ssn/i,
    /social.?security/i,
    /\bcvv\b/i,
  ],
};

class PermissionManager {
  constructor() {
    this.overrides = new Map(); // tool -> level
    this.auditLog = [];
  }

  classify(toolName, params) {
    // Check overrides first
    if (this.overrides.has(toolName)) {
      return this.overrides.get(toolName);
    }

    let level = TOOL_PERMISSION_MAP[toolName] || 'sensitive';

    // Check for dangerous patterns that escalate permission level
    const patterns = DANGEROUS_PATTERNS[toolName];
    if (patterns && params) {
      const paramStr = JSON.stringify(params);
      for (const pattern of patterns) {
        if (pattern.test(paramStr)) {
          level = 'dangerous';
          break;
        }
      }
    }

    this.auditLog.push({
      toolName,
      params: this.sanitizeParams(params),
      level,
      timestamp: Date.now(),
    });

    return level;
  }

  setOverride(toolName, level) {
    this.overrides.set(toolName, level);
  }

  removeOverride(toolName) {
    this.overrides.delete(toolName);
  }

  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }

  sanitizeParams(params) {
    if (!params) return {};
    const sanitized = { ...params };
    // Redact sensitive values
    for (const key of ['password', 'apiKey', 'token', 'secret', 'credential']) {
      if (sanitized[key]) sanitized[key] = '***REDACTED***';
    }
    return sanitized;
  }
}

module.exports = { PermissionManager, TOOL_PERMISSION_MAP };
