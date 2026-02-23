/**
 * Google OAuth2 connector — manages OAuth2 flow and token storage
 * for Drive, Gmail, and Calendar read-only access.
 *
 * Flow:
 *  1. connect(service) — open browser to Google consent page
 *  2. Local HTTP callback server captures the authorization code
 *  3. Exchange code for tokens, store in KeyStore-compatible file
 *  4. isConnected(service) / getToken(service) used by connector tools
 */

const http    = require('http');
const https   = require('https');
const url     = require('url');
const path    = require('path');
const fs      = require('fs');
const { app, shell } = require('electron');

// Per-service OAuth2 scopes
const SCOPES = {
  drive:    'https://www.googleapis.com/auth/drive.readonly',
  gmail:    'https://www.googleapis.com/auth/gmail.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar.readonly',
};

// Token storage path inside userData
const tokensPath = path.join(app.getPath('userData'), 'google-tokens.json');

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
}

/**
 * Exchange authorization code for tokens via Google's token endpoint.
 */
async function exchangeCode(code, redirectUri, clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }).toString();

    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type':  'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) reject(new Error(`Google OAuth error: ${parsed.error_description || parsed.error}`));
            else resolve(parsed);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Refresh an expired access_token using a refresh_token.
 */
async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
    }).toString();

    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type':  'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Start a one-shot local HTTP server to receive the OAuth2 callback.
 * Returns a Promise that resolves with the authorization code.
 */
function waitForCode(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname === '/oauth2/callback') {
        const code  = parsed.query.code;
        const error = parsed.query.error;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (error) {
          res.end('<html><body><h2>Authorization denied.</h2><p>You can close this tab.</p></body></html>');
          server.close();
          reject(new Error(`OAuth denied: ${error}`));
        } else {
          res.end('<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to OpenDesktop.</p></body></html>');
          server.close();
          resolve(code);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`[Google OAuth] Callback server listening on port ${port}`);
    });
    server.on('error', reject);
    // Safety timeout — 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout — no response received within 5 minutes'));
    }, 300_000);
  });
}

/**
 * connect(service) — initiates the OAuth2 flow for a Google service.
 * Opens the consent page in the system browser; waits for redirect.
 *
 * NOTE: Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars
 * or a `google_client_id` / `google_client_secret` entry stored via KeyStore.
 * For simplicity, read from environment variables if available.
 */
async function connect(service) {
  if (!SCOPES[service]) throw new Error(`Unknown service: ${service}`);

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables. ' +
      'Create credentials at https://console.cloud.google.com/apis/credentials and set them in your shell profile.'
    );
  }

  // Use a fixed port; find a free one starting at 57200
  const port = 57200 + Object.keys(SCOPES).indexOf(service);
  const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id',     clientId);
  authUrl.searchParams.set('redirect_uri',  redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope',         SCOPES[service]);
  authUrl.searchParams.set('access_type',   'offline');
  authUrl.searchParams.set('prompt',        'consent');

  // Start callback server before opening browser
  const codePromise = waitForCode(port);
  await shell.openExternal(authUrl.toString());

  const code = await codePromise;
  const tokenData = await exchangeCode(code, redirectUri, clientId, clientSecret);

  // Store tokens keyed by service
  const tokens = loadTokens();
  tokens[service] = {
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token || tokens[service]?.refresh_token,
    expiry:        Date.now() + (tokenData.expires_in || 3600) * 1000,
  };
  saveTokens(tokens);

  console.log(`[Google OAuth] Connected to ${service}`);
  return { ok: true, service };
}

async function disconnect(service) {
  const tokens = loadTokens();
  delete tokens[service];
  saveTokens(tokens);
  return { ok: true, service };
}

function isConnected(service) {
  const tokens = loadTokens();
  return !!tokens[service]?.access_token;
}

/**
 * getToken(service) — returns a valid access_token, refreshing if needed.
 */
async function getToken(service) {
  const tokens = loadTokens();
  const entry  = tokens[service];
  if (!entry) throw new Error(`Not connected to Google ${service}. Call connect first.`);

  // Refresh if expired (with 60s buffer)
  if (Date.now() > entry.expiry - 60_000) {
    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID/SECRET env vars');
    if (!entry.refresh_token) throw new Error(`No refresh token for ${service}. Please reconnect.`);

    const refreshed = await refreshAccessToken(entry.refresh_token, clientId, clientSecret);
    entry.access_token = refreshed.access_token;
    entry.expiry       = Date.now() + (refreshed.expires_in || 3600) * 1000;
    tokens[service] = entry;
    saveTokens(tokens);
  }

  return entry.access_token;
}

module.exports = { connect, disconnect, isConnected, getToken };
