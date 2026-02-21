const http = require('http');
const https = require('https');
const { exec } = require('child_process');

const SearchFetchTools = [
  {
    name: 'web_search',
    category: 'search',
    description: 'Search the web using DuckDuckGo (no API key needed). Returns titles, URLs, and snippets. Use for any web research, finding documentation, looking up information.',
    params: ['query', 'maxResults'],
    permissionLevel: 'safe',
    async execute({ query, maxResults = 8 }) {
      if (!query) throw new Error('query is required');

      // Use DuckDuckGo HTML endpoint
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      const html = await httpGet(url, {
        'User-Agent': 'Mozilla/5.0 (compatible; OpenDesktop/1.0)',
      });

      // Parse results from HTML
      const results = [];
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

      let match;
      while ((match = resultRegex.exec(html)) && results.length < maxResults) {
        const url = decodeURIComponent(
          match[1].replace(/.*uddg=/, '').replace(/&.*/, '')
        );
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        results.push({ title, url, snippet: '' });
      }

      let i = 0;
      while ((match = snippetRegex.exec(html)) && i < results.length) {
        results[i].snippet = match[1].replace(/<[^>]*>/g, '').trim();
        i++;
      }

      if (results.length === 0) {
        return `No results found for: "${query}"`;
      }

      return JSON.stringify(results, null, 2);
    },
  },

  {
    name: 'web_fetch',
    category: 'search',
    description: 'Fetch a web page and return its text content (HTML tags stripped). Use to read articles, documentation pages, or any URL. Returns up to maxLength characters.',
    params: ['url', 'maxLength', 'headers'],
    permissionLevel: 'safe',
    async execute({ url, maxLength = 50000, headers = {} }) {
      if (!url) throw new Error('url is required');
      if (!url.match(/^https?:\/\//)) url = 'https://' + url;

      const content = await httpGet(url, {
        'User-Agent': 'Mozilla/5.0 (compatible; OpenDesktop/1.0)',
        ...headers,
      });

      // Strip HTML tags for readability
      let text = content
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length > maxLength) {
        text = text.slice(0, maxLength) + '\n...[truncated]';
      }

      return text;
    },
  },

  {
    name: 'web_fetch_json',
    category: 'search',
    description: 'Call a JSON REST API endpoint and return the parsed response. Supports GET, POST, PUT, DELETE with custom headers and body.',
    params: ['url', 'method', 'body', 'headers'],
    permissionLevel: 'safe',
    async execute({ url, method = 'GET', body, headers = {} }) {
      if (!url) throw new Error('url is required');

      const defaultHeaders = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'OpenDesktop/1.0',
        ...headers,
      };

      const response = await httpRequest(url, {
        method,
        headers: defaultHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      try {
        const parsed = JSON.parse(response);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return response;
      }
    },
  },

  {
    name: 'web_download',
    category: 'search',
    description: 'Download a file from a URL and save it to a local path. Use for downloading images, documents, packages, etc.',
    params: ['url', 'outputPath'],
    permissionLevel: 'sensitive',
    async execute({ url, outputPath }) {
      if (!url || !outputPath) throw new Error('url and outputPath are required');

      return new Promise((resolve, reject) => {
        exec(
          `curl -sL -o "${outputPath}" "${url}"`,
          { timeout: 60000 },
          (err, stdout, stderr) => {
            if (err) reject(new Error(`Download failed: ${err.message}`));
            else resolve(`Downloaded: ${url} → ${outputPath}`);
          }
        );
      });
    },
  },
];

function httpGet(url, headers = {}) {
  return httpRequest(url, { method: 'GET', headers });
}

function httpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const req = lib.request(parsedUrl, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 30000,
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        httpRequest(redirectUrl, options).then(resolve).catch(reject);
        return;
      }

      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 5 * 1024 * 1024) {
          req.destroy();
          reject(new Error('Response too large (>5MB)'));
        }
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

module.exports = { SearchFetchTools };
