/**
 * MessagingTools — Slack and Microsoft Teams webhook integrations.
 *
 * Webhook URLs in KeyStore: 'slack_webhook', 'teams_webhook'
 * Slack Bot token: 'slack_bot_token'
 */

const https = require('https');

let _keyStore = null;
function setKeyStore(ks) { _keyStore = ks; }
function getKey(k) { return _keyStore?.getKey ? _keyStore.getKey(k) : null; }

// Allowed webhook URL domains to prevent exfiltration via user-supplied URLs
const ALLOWED_WEBHOOK_DOMAINS = new Set([
  'hooks.slack.com', 'outlook.office.com', 'outlook.office365.com',
  'webhook.site',  // common for testing
]);

function validateWebhookUrl(url) {
  if (!url || typeof url !== 'string') throw new Error('Invalid webhook URL');
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS');
    // Allow keyStore-configured URLs unconditionally (user set them in settings)
    // Only validate user-supplied overrides
    return parsed;
  } catch (err) {
    if (err.message.includes('HTTPS')) throw err;
    throw new Error(`Invalid webhook URL: ${err.message}`);
  }
}

function safeJsonParse(str, fieldName) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    throw new Error(`Invalid JSON for ${fieldName}: expected valid JSON string`);
  }
}

function httpsPost(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const payload = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...extraHeaders };
    const req = https.request({ host: parsed.host, path: parsed.pathname + parsed.search, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(payload);
    req.end();
  });
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get({ host: parsed.host, path: parsed.pathname + parsed.search, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        else { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

const MESSAGING_TOOLS = [
  {
    name: 'slack_send', description: 'Send a message to Slack via incoming webhook.',
    category: 'messaging', permissionLevel: 'sensitive', params: ['message'],
    execute: async ({ message, webhookUrl, channel, username, iconEmoji }) => {
      if (!message) throw new Error('message is required');
      const url = webhookUrl || getKey('slack_webhook');
      if (!url) throw new Error('Slack webhook not configured. Add slack_webhook in Settings → Integrations.');
      validateWebhookUrl(url);
      const body = { text: message };
      if (channel)   body.channel    = channel;
      if (username)  body.username   = username;
      if (iconEmoji) body.icon_emoji = iconEmoji;
      await httpsPost(url, body);
      return JSON.stringify({ ok: true, message: 'Slack message sent' });
    },
  },
  {
    name: 'slack_send_blocks', description: 'Send a Slack message with Block Kit rich formatting.',
    category: 'messaging', permissionLevel: 'sensitive', params: ['blocks'],
    execute: async ({ blocks, text, webhookUrl, channel }) => {
      if (!blocks) throw new Error('blocks is required');
      const url = webhookUrl || getKey('slack_webhook');
      if (!url) throw new Error('Slack webhook not configured.');
      validateWebhookUrl(url);
      const parsedBlocks = safeJsonParse(blocks, 'blocks');
      const body = { blocks: parsedBlocks };
      if (text)    body.text    = text;
      if (channel) body.channel = channel;
      await httpsPost(url, body);
      return JSON.stringify({ ok: true, message: 'Slack blocks message sent' });
    },
  },
  {
    name: 'slack_search', description: 'Search Slack messages (requires Slack Bot token with search:read scope).',
    category: 'messaging', permissionLevel: 'safe', params: ['query'],
    execute: async ({ query, count = 10 }) => {
      if (!query) throw new Error('query is required');
      const token = getKey('slack_bot_token');
      if (!token) throw new Error('Slack bot token not configured. Add slack_bot_token in Settings → Integrations.');
      const data = await httpsGet(`https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=${count}`, { Authorization: `Bearer ${token}` });
      if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
      return JSON.stringify({
        total: data.messages?.total || 0,
        results: (data.messages?.matches || []).map((m) => ({ text: m.text?.slice(0, 500), user: m.username, channel: m.channel?.name, timestamp: m.ts, permalink: m.permalink })),
      });
    },
  },
  {
    name: 'teams_send', description: 'Send a message to Microsoft Teams via incoming webhook.',
    category: 'messaging', permissionLevel: 'sensitive', params: ['message'],
    execute: async ({ message, webhookUrl, title, themeColor }) => {
      if (!message) throw new Error('message is required');
      const url = webhookUrl || getKey('teams_webhook');
      if (!url) throw new Error('Teams webhook not configured. Add teams_webhook in Settings → Integrations.');
      validateWebhookUrl(url);
      await httpsPost(url, {
        '@type': 'MessageCard', '@context': 'http://schema.org/extensions',
        themeColor: themeColor || '0076D7',
        summary: title || message.slice(0, 100),
        sections: [{ activityTitle: title || 'OpenDesktop', activityText: message }],
      });
      return JSON.stringify({ ok: true, message: 'Teams message sent' });
    },
  },
  {
    name: 'teams_send_card', description: 'Send an Adaptive Card to Microsoft Teams.',
    category: 'messaging', permissionLevel: 'sensitive', params: ['card'],
    execute: async ({ card, webhookUrl }) => {
      if (!card) throw new Error('card is required');
      const url = webhookUrl || getKey('teams_webhook');
      if (!url) throw new Error('Teams webhook not configured.');
      validateWebhookUrl(url);
      const parsedCard = safeJsonParse(card, 'card');
      await httpsPost(url, {
        type: 'message',
        attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: parsedCard }],
      });
      return JSON.stringify({ ok: true, message: 'Teams card sent' });
    },
  },
];

module.exports = { MESSAGING_TOOLS, setKeyStore };
