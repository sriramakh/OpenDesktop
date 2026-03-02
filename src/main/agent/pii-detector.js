/**
 * PII Detector — scans text for Personally Identifiable Information.
 * Used by loop.js before writing tools to gate sensitive data through approvals.
 */

const PII_PATTERNS = [
  {
    type: 'SSN',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    description: 'Social Security Number',
  },
  {
    type: 'CreditCard',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    description: 'Credit Card Number',
  },
  {
    type: 'Email',
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    description: 'Email Address',
  },
  {
    type: 'Phone',
    pattern: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s][0-9]{3}[-.\s][0-9]{4}\b/g,
    description: 'Phone Number',
  },
  {
    type: 'APIKey',
    pattern: /\b(?:api[_\-]?key|apikey|access[_\-]?token|secret[_\-]?key)["'\s:=]+[A-Za-z0-9\-_]{20,}\b/gi,
    description: 'API Key or Token',
  },
  {
    type: 'AWSKey',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    description: 'AWS Access Key ID',
  },
  {
    type: 'PrivateKey',
    pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
    description: 'Private Key',
  },
  {
    type: 'Password',
    pattern: /\b(?:password|passwd|pwd)["'\s:=]+\S{6,}\b/gi,
    description: 'Password',
  },
];

// Tools that write data and should be scanned for PII
const WRITE_TOOLS = new Set([
  'fs_write',
  'fs_edit',
  'office_write_docx',
  'office_write_xlsx',
  'office_write_csv',
  'office_write_pptx',
  'db_query',
  'slack_send',
  'slack_send_blocks',
  'teams_send',
  'teams_send_card',
  'github_create_issue',
  'github_create_pr',
  'github_comment',
  'jira_create_issue',
  'jira_add_comment',
  'notion_create_page',
  'notion_append_block',
]);

/**
 * Scan text for PII patterns.
 * @param {string} text
 * @returns {{ found: boolean, findings: Array<{type: string, count: number, description: string}> }}
 */
function scan(text) {
  if (!text || typeof text !== 'string') {
    return { found: false, findings: [] };
  }

  const findings = [];

  for (const { type, pattern, description } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      findings.push({ type, count: matches.length, description });
    }
    pattern.lastIndex = 0;
  }

  return {
    found: findings.length > 0,
    findings,
  };
}

/**
 * Get a human-readable summary of findings.
 * @param {Array} findings
 * @returns {string}
 */
function summarizeFindings(findings) {
  if (!findings || findings.length === 0) return 'No PII detected.';
  return findings
    .map((f) => `${f.description} (${f.count} occurrence${f.count > 1 ? 's' : ''})`)
    .join(', ');
}

module.exports = { scan, summarizeFindings, WRITE_TOOLS, PII_PATTERNS };
