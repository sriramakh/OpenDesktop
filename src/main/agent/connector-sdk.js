/**
 * ConnectorSDK — Custom connector SDK for user-built integrations.
 *
 * Users drop a .js file in {userData}/connectors/ to add custom tools.
 *
 * Example connector:
 * ```js
 * const { createConnector } = require('.../connector-sdk');
 * module.exports = createConnector({
 *   name: 'my-api',
 *   authType: 'bearer',
 *   tools: [{
 *     name: 'my_tool',
 *     description: 'Does something',
 *     params: ['url'],
 *     permissionLevel: 'safe',
 *     execute: async ({ url }, { httpGet, token }) => {
 *       return await httpGet(url, token);
 *     }
 *   }]
 * });
 * ```
 */

const https = require('https');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

// ---------------------------------------------------------------------------
// HTTP helpers (injected into connector execute context)
// ---------------------------------------------------------------------------

function httpGet(url, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'OpenDesktop/1.0', ...extraHeaders };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = lib.get({ host: parsed.host, path: parsed.pathname + parsed.search, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        else resolve(body);
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function httpPost(url, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'OpenDesktop/1.0',
      ...extraHeaders,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = lib.request(
      { host: parsed.host, path: parsed.pathname + parsed.search, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(data);
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// KeyStore reference
// ---------------------------------------------------------------------------

let _keyStoreRef = null;

function setKeyStore(ks) { _keyStoreRef = ks; }

// ---------------------------------------------------------------------------
// Connector factory
// ---------------------------------------------------------------------------

function createConnector({ name, authType = 'bearer', tools = [] }) {
  if (!name) throw new Error('Connector name is required');
  if (!Array.isArray(tools) || tools.length === 0) throw new Error('Connector must have at least one tool');

  const wrappedTools = tools.map((tool) => ({
    ...tool,
    name:     `custom_${name}_${tool.name}`.replace(/[^a-z0-9_]/gi, '_'),
    category: 'custom',
    execute:  async (input) => {
      let token = null;
      if (authType !== 'none' && _keyStoreRef) {
        token = _keyStoreRef.getKey ? _keyStoreRef.getKey(`connector_${name}`) : null;
      }
      return tool.execute(input, { httpGet, httpPost, token, authType });
    },
  }));

  return { name, authType, tools: wrappedTools };
}

// ---------------------------------------------------------------------------
// File-based connector loader
// ---------------------------------------------------------------------------

function loadConnectors(userDataPath) {
  const connectorsDir = path.join(userDataPath, 'connectors');
  const loadedTools   = [];

  if (!fs.existsSync(connectorsDir)) return loadedTools;

  const files = fs.readdirSync(connectorsDir).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(connectorsDir, file);
    try {
      delete require.cache[require.resolve(filePath)];
      const connector = require(filePath);

      if (connector && Array.isArray(connector.tools)) {
        for (const tool of connector.tools) {
          if (tool.name && tool.execute) {
            loadedTools.push(tool);
            console.log(`[ConnectorSDK] Loaded: ${tool.name} from ${file}`);
          }
        }
      } else {
        console.warn(`[ConnectorSDK] ${file} did not export a valid connector`);
      }
    } catch (err) {
      console.error(`[ConnectorSDK] Failed to load ${file}:`, err.message);
    }
  }

  console.log(`[ConnectorSDK] ${loadedTools.length} tools from ${files.length} connector files`);
  return loadedTools;
}

module.exports = { createConnector, loadConnectors, setKeyStore, httpGet, httpPost };
