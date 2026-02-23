/**
 * Google connector tools — Drive, Gmail, Calendar
 *
 * All tools check google.isConnected() and return a helpful message if not.
 * Uses the Google REST APIs via native https.
 */

const https  = require('https');
const google = require('../../connectors/google');

function httpsGet(urlStr, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers:  { Authorization: `Bearer ${accessToken}` },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

const NOT_CONNECTED = (service) =>
  `Not connected to Google ${service}. Ask the user to click the connector button and sign in first.`;

const CONNECTOR_TOOLS = [
  // ── Drive ────────────────────────────────────────────────────────────────
  {
    name: 'connector_drive_search',
    category: 'connector',
    description: 'Search Google Drive files by name, type, or query. Requires Google Drive connection.',
    params: ['query', 'maxResults'],
    permissionLevel: 'safe',
    async execute({ query, maxResults = 10 }) {
      if (!google.isConnected('drive')) return NOT_CONNECTED('Drive');
      const token = await google.getToken('drive');
      const q = encodeURIComponent(query);
      const n = Math.min(maxResults, 50);
      const data = await httpsGet(
        `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=${n}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`,
        token
      );
      if (data.error) throw new Error(data.error.message);
      if (!data.files || data.files.length === 0) return 'No files found matching that query in Google Drive.';
      return JSON.stringify(data.files, null, 2);
    },
  },

  {
    name: 'connector_drive_read',
    category: 'connector',
    description: 'Read the text content of a Google Drive file by its file ID. For Google Docs, exports as plain text. Requires Google Drive connection.',
    params: ['fileId', 'mimeType'],
    permissionLevel: 'safe',
    async execute({ fileId, mimeType }) {
      if (!google.isConnected('drive')) return NOT_CONNECTED('Drive');
      if (!fileId) throw new Error('fileId is required');
      const token = await google.getToken('drive');

      // For Google Docs, use export; for others try direct download
      const isGDoc = mimeType && mimeType.includes('google-apps.document');
      const endpoint = isGDoc
        ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`
        : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

      return new Promise((resolve, reject) => {
        const parsed = new URL(endpoint);
        const req = https.request(
          {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
            method:   'GET',
            headers:  { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve(data.slice(0, 20000)));
          }
        );
        req.on('error', reject);
        req.end();
      });
    },
  },

  // ── Gmail ─────────────────────────────────────────────────────────────────
  {
    name: 'connector_gmail_search',
    category: 'connector',
    description: 'Search Gmail emails by query (e.g. "from:boss@example.com", "subject:invoice", "is:unread"). Returns list of matching email summaries. Requires Gmail connection.',
    params: ['query', 'maxResults'],
    permissionLevel: 'safe',
    async execute({ query, maxResults = 10 }) {
      if (!google.isConnected('gmail')) return NOT_CONNECTED('Gmail');
      if (!query) throw new Error('query is required');
      const token = await google.getToken('gmail');
      const q = encodeURIComponent(query);
      const n = Math.min(maxResults, 50);

      // List matching message IDs
      const listData = await httpsGet(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${n}`,
        token
      );
      if (listData.error) throw new Error(listData.error.message);
      if (!listData.messages || listData.messages.length === 0) return 'No emails found matching that query.';

      // Fetch snippet for each (parallel, up to 5)
      const ids = listData.messages.slice(0, 5).map((m) => m.id);
      const details = await Promise.all(
        ids.map((id) =>
          httpsGet(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            token
          )
        )
      );

      const results = details.map((msg) => {
        const headers = msg.payload?.headers || [];
        const get = (name) => headers.find((h) => h.name === name)?.value || '';
        return {
          id:      msg.id,
          subject: get('Subject'),
          from:    get('From'),
          date:    get('Date'),
          snippet: msg.snippet,
        };
      });

      return JSON.stringify(results, null, 2);
    },
  },

  {
    name: 'connector_gmail_read',
    category: 'connector',
    description: 'Read the full text content of a Gmail email by its message ID. Requires Gmail connection.',
    params: ['messageId'],
    permissionLevel: 'safe',
    async execute({ messageId }) {
      if (!google.isConnected('gmail')) return NOT_CONNECTED('Gmail');
      if (!messageId) throw new Error('messageId is required');
      const token = await google.getToken('gmail');

      const msg = await httpsGet(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        token
      );
      if (msg.error) throw new Error(msg.error.message);

      const headers = msg.payload?.headers || [];
      const get = (name) => headers.find((h) => h.name === name)?.value || '';

      // Extract body text (plain text part preferred)
      function extractBody(part) {
        if (!part) return '';
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.parts) {
          for (const p of part.parts) {
            const text = extractBody(p);
            if (text) return text;
          }
        }
        return '';
      }

      const body = extractBody(msg.payload);

      return JSON.stringify({
        id:      msg.id,
        subject: get('Subject'),
        from:    get('From'),
        to:      get('To'),
        date:    get('Date'),
        body:    body.slice(0, 10000),
      }, null, 2);
    },
  },

  // ── Calendar ──────────────────────────────────────────────────────────────
  {
    name: 'connector_calendar_events',
    category: 'connector',
    description: 'List upcoming Google Calendar events within a date range. Requires Google Calendar connection.',
    params: ['timeMin', 'timeMax', 'maxResults'],
    permissionLevel: 'safe',
    async execute({ timeMin, timeMax, maxResults = 10 }) {
      if (!google.isConnected('calendar')) return NOT_CONNECTED('Calendar');
      const token = await google.getToken('calendar');

      const now = new Date();
      const start = timeMin ? new Date(timeMin) : now;
      const end   = timeMax ? new Date(timeMax) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const n = Math.min(maxResults, 50);

      const params = new URLSearchParams({
        timeMin:    start.toISOString(),
        timeMax:    end.toISOString(),
        maxResults: n,
        singleEvents: 'true',
        orderBy:    'startTime',
      });

      const data = await httpsGet(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        token
      );
      if (data.error) throw new Error(data.error.message);
      if (!data.items || data.items.length === 0) return 'No events found in that date range.';

      const events = data.items.map((e) => ({
        summary:  e.summary,
        start:    e.start?.dateTime || e.start?.date,
        end:      e.end?.dateTime || e.end?.date,
        location: e.location,
        description: e.description?.slice(0, 200),
      }));

      return JSON.stringify(events, null, 2);
    },
  },
];

module.exports = { CONNECTOR_TOOLS };
