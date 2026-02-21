const http = require('http');
const https = require('https');

// ---------------------------------------------------------------------------
// Provider & Model Catalog
// ---------------------------------------------------------------------------

const MODEL_CATALOG = {
  ollama: {
    label: 'Ollama (Local)',
    requiresKey: false,
    endpoint: 'http://localhost:11434',
    models: [
      { id: 'llama3', name: 'Llama 3 8B', ctx: 8192 },
      { id: 'llama3:70b', name: 'Llama 3 70B', ctx: 8192 },
      { id: 'llama3.1', name: 'Llama 3.1 8B', ctx: 131072 },
      { id: 'llama3.1:70b', name: 'Llama 3.1 70B', ctx: 131072 },
      { id: 'llama3.2', name: 'Llama 3.2 3B', ctx: 131072 },
      { id: 'llama3.3', name: 'Llama 3.3 70B', ctx: 131072 },
      { id: 'mistral', name: 'Mistral 7B', ctx: 32768 },
      { id: 'mixtral', name: 'Mixtral 8x7B', ctx: 32768 },
      { id: 'codellama', name: 'Code Llama 7B', ctx: 16384 },
      { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', ctx: 131072 },
      { id: 'qwen2.5', name: 'Qwen 2.5 7B', ctx: 131072 },
      { id: 'qwen2.5:72b', name: 'Qwen 2.5 72B', ctx: 131072 },
      { id: 'phi3', name: 'Phi-3 3.8B', ctx: 4096 },
      { id: 'gemma2', name: 'Gemma 2 9B', ctx: 8192 },
      { id: 'command-r', name: 'Command R 35B', ctx: 131072 },
    ],
  },
  openai: {
    label: 'OpenAI',
    requiresKey: true,
    endpoint: 'https://api.openai.com',
    keyPrefix: 'sk-',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', ctx: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', ctx: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', ctx: 128000 },
      { id: 'gpt-4', name: 'GPT-4', ctx: 8192 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', ctx: 16385 },
      { id: 'o1', name: 'o1', ctx: 200000 },
      { id: 'o1-mini', name: 'o1 Mini', ctx: 128000 },
      { id: 'o1-preview', name: 'o1 Preview', ctx: 128000 },
      { id: 'o3-mini', name: 'o3 Mini', ctx: 200000 },
    ],
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    requiresKey: true,
    endpoint: 'https://api.anthropic.com',
    keyPrefix: 'sk-ant-',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', ctx: 200000 },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', ctx: 200000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', ctx: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', ctx: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', ctx: 200000 },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', ctx: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', ctx: 200000 },
    ],
  },
  google: {
    label: 'Google (Gemini)',
    requiresKey: true,
    endpoint: 'https://generativelanguage.googleapis.com',
    keyPrefix: 'AI',
    models: [
      { id: 'gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro', ctx: 1048576 },
      { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', ctx: 1048576 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', ctx: 1048576 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', ctx: 2097152 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', ctx: 1048576 },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', ctx: 1048576 },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    requiresKey: true,
    endpoint: 'https://api.deepseek.com',
    keyPrefix: 'sk-',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', ctx: 65536 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', ctx: 65536 },
    ],
  },
};

function getModelCatalog() {
  return MODEL_CATALOG;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

let settings = {
  provider: 'ollama',
  model: 'llama3',
  temperature: 0.7,
  maxTokens: 4096,
};

let keyStore = null;

function configure(newSettings) {
  settings = { ...settings, ...newSettings };
}

function setKeyStore(ks) {
  keyStore = ks;
}

// ---------------------------------------------------------------------------
// Ollama local model discovery
// ---------------------------------------------------------------------------

async function listOllamaModels(endpoint) {
  const baseUrl = endpoint || MODEL_CATALOG.ollama.endpoint;
  try {
    const url = new URL('/api/tags', baseUrl);
    const response = await httpRequest(url, { method: 'GET', headers: {} });
    const data = JSON.parse(response);
    return (data.models || []).map((m) => ({
      id: m.name,
      name: m.name,
      size: m.size,
      modified: m.modified_at,
      parameterSize: m.details?.parameter_size || null,
      family: m.details?.family || null,
    }));
  } catch (err) {
    console.error('[LLM] Ollama not reachable:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Provider dispatch
// ---------------------------------------------------------------------------

async function callLLM(systemPrompt, userMessage, options = {}) {
  const merged = { ...settings, ...options };
  const { provider, model, temperature, maxTokens } = merged;

  const catalogEntry = MODEL_CATALOG[provider];
  const endpoint = merged.endpoint || catalogEntry?.endpoint || '';

  // Resolve API key: options override → keyStore → empty
  let apiKey = merged.apiKey || '';
  if (!apiKey && keyStore && provider !== 'ollama') {
    apiKey = keyStore.getKey(provider) || '';
  }

  if (catalogEntry?.requiresKey && !apiKey) {
    throw new Error(`No API key configured for ${catalogEntry.label}. Add one in Settings → LLM.`);
  }

  switch (provider) {
    case 'ollama':
      return callOllama(endpoint, model, systemPrompt, userMessage, temperature);
    case 'openai':
      return callOpenAI(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens);
    case 'anthropic':
      return callAnthropic(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens);
    case 'google':
      return callGemini(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens);
    case 'deepseek':
      return callDeepSeek(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

async function callOllama(endpoint, model, systemPrompt, userMessage, temperature) {
  const url = new URL('/api/generate', endpoint || MODEL_CATALOG.ollama.endpoint);
  const body = JSON.stringify({
    model,
    system: systemPrompt,
    prompt: userMessage,
    stream: false,
    options: { temperature },
  });

  const response = await httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const data = JSON.parse(response);
  return data.response || '';
}

async function callOpenAI(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens) {
  const url = new URL('/v1/chat/completions', endpoint || MODEL_CATALOG.openai.endpoint);
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
  });

  const response = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  const data = JSON.parse(response);
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens) {
  const url = new URL('/v1/messages', endpoint || MODEL_CATALOG.anthropic.endpoint);
  const body = JSON.stringify({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    temperature,
    max_tokens: maxTokens,
  });

  const response = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
  });

  const data = JSON.parse(response);
  return data.content?.[0]?.text || '';
}

async function callGemini(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens) {
  const baseUrl = endpoint || MODEL_CATALOG.google.endpoint;
  const url = new URL(`/v1beta/models/${model}:generateContent?key=${apiKey}`, baseUrl);

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });

  const response = await httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const data = JSON.parse(response);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callDeepSeek(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens) {
  // DeepSeek uses OpenAI-compatible API
  const url = new URL('/chat/completions', endpoint || MODEL_CATALOG.deepseek.endpoint);
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
  });

  const response = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  const data = JSON.parse(response);
  return data.choices?.[0]?.message?.content || '';
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function httpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 120000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
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

module.exports = { callLLM, configure, setKeyStore, getModelCatalog, listOllamaModels };
