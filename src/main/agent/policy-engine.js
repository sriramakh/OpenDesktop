/**
 * PolicyEngine — Rule-based governance for tool execution.
 *
 * Rules can block, require approval, or warn before tool execution.
 * Loaded from {userData}/policies.json + built-in default rules.
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Default built-in rules (always applied)
const DEFAULT_RULES = [
  {
    id: 'protect-system-dirs',
    name: 'Protect System Directories',
    description: 'Block writes to critical system directories',
    tool: ['fs_write', 'fs_edit', 'fs_delete', 'fs_move', 'fs_mkdir', 'fs_organize'],
    condition: {
      path: {
        matches: '^/(System|private/var/root|Library/Keychains|etc/passwd|etc/shadow)',
      },
    },
    action: 'block',
    builtin: true,
  },
  {
    id: 'protect-env-files',
    name: 'Protect Credential Files',
    description: 'Require approval before writing credential/key files',
    tool: ['fs_write', 'fs_edit'],
    condition: {
      path: {
        matches: '\\.(env|pem|key|p12|pfx|crt|cer)$',
      },
    },
    action: 'require_approval',
    builtin: true,
  },
  {
    id: 'warn-bulk-delete',
    name: 'Warn on Delete',
    description: 'Warn when deleting files',
    tool: ['fs_delete'],
    condition: {},
    action: 'warn',
    builtin: true,
  },
];

class PolicyEngine {
  constructor() {
    this._userDataPath = null;
    this._policiesFile = null;
    this._userRules    = [];
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  init(userDataPath) {
    this._userDataPath = userDataPath;
    this._policiesFile = path.join(userDataPath, 'policies.json');
    this._load();
    console.log(`[PolicyEngine] ${DEFAULT_RULES.length} built-in + ${this._userRules.length} user rules`);
  }

  _load() {
    try {
      if (fs.existsSync(this._policiesFile)) {
        const raw  = fs.readFileSync(this._policiesFile, 'utf-8');
        const data = JSON.parse(raw);
        this._userRules = Array.isArray(data.rules) ? data.rules : [];
      }
    } catch (err) {
      console.warn('[PolicyEngine] Failed to load policies.json:', err.message);
      this._userRules = [];
    }
  }

  _save() {
    try {
      fs.writeFileSync(
        this._policiesFile,
        JSON.stringify({ rules: this._userRules }, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.warn('[PolicyEngine] Failed to save policies.json:', err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Rule Evaluation
  // ---------------------------------------------------------------------------

  /**
   * Evaluate all rules for a given tool call.
   * @param {string} toolName
   * @param {object} input
   * @returns {{ allowed: boolean, action: string, message: string, ruleId: string|null }}
   */
  evaluate(toolName, input) {
    const allRules = [...DEFAULT_RULES, ...this._userRules];

    for (const rule of allRules) {
      if (!this._toolMatches(rule.tool, toolName)) continue;
      if (!this._conditionMatches(rule.condition, input)) continue;

      if (rule.action === 'block') {
        return {
          allowed: false,
          action: 'block',
          message: `Blocked by policy "${rule.name}": ${rule.description || ''}`,
          ruleId: rule.id,
        };
      }
      if (rule.action === 'require_approval') {
        return {
          allowed: true,
          action: 'require_approval',
          message: `Policy "${rule.name}" requires approval: ${rule.description || ''}`,
          ruleId: rule.id,
        };
      }
      if (rule.action === 'warn') {
        return {
          allowed: true,
          action: 'warn',
          message: `Policy warning from "${rule.name}": ${rule.description || ''}`,
          ruleId: rule.id,
        };
      }
    }

    return { allowed: true, action: 'allow', message: '', ruleId: null };
  }

  _toolMatches(ruleTools, toolName) {
    if (!ruleTools) return true;
    if (typeof ruleTools === 'string') return ruleTools === toolName || ruleTools === '*';
    if (Array.isArray(ruleTools)) return ruleTools.includes(toolName) || ruleTools.includes('*');
    return false;
  }

  _conditionMatches(condition, input) {
    if (!condition || Object.keys(condition).length === 0) return true;
    if (!input) return false;

    for (const [field, checks] of Object.entries(condition)) {
      const value  = input[field];
      if (value === undefined || value === null) continue;
      const strVal = String(value);

      if (checks.matches) {
        try {
          if (!new RegExp(checks.matches, 'i').test(strVal)) return false;
        } catch { return false; }
      }
      if (checks.eq !== undefined) {
        if (strVal !== String(checks.eq)) return false;
      }
      if (checks.contains !== undefined) {
        if (!strVal.toLowerCase().includes(String(checks.contains).toLowerCase())) return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Rule Management
  // ---------------------------------------------------------------------------

  listRules() {
    return [
      ...DEFAULT_RULES.map((r) => ({ ...r, builtin: true })),
      ...this._userRules.map((r) => ({ ...r, builtin: false })),
    ];
  }

  addRule(rule) {
    const newRule = {
      id:          rule.id || `rule_${uuidv4().slice(0, 8)}`,
      name:        rule.name        || 'Custom Rule',
      description: rule.description || '',
      tool:        rule.tool        || '*',
      condition:   rule.condition   || {},
      action:      rule.action      || 'warn',
      builtin:     false,
    };
    this._userRules.push(newRule);
    this._save();
    return newRule;
  }

  removeRule(id) {
    const before = this._userRules.length;
    this._userRules = this._userRules.filter((r) => r.id !== id);
    if (this._userRules.length < before) {
      this._save();
      return true;
    }
    return false;
  }

  updateRule(id, updates) {
    const idx = this._userRules.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    this._userRules[idx] = { ...this._userRules[idx], ...updates };
    this._save();
    return this._userRules[idx];
  }
}

// Singleton
const policyEngine = new PolicyEngine();
module.exports = policyEngine;
