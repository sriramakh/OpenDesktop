/**
 * LLM module — unified interface for all supported providers.
 *
 * Two modes:
 *  1. callLLM(systemPrompt, userMessage, options)
 *     Simple text-in / text-out. Used by llm-tools.js and simple synthesis.
 *
 *  2. callWithTools(systemPrompt, messages, tools, options)
 *     Full agentic tool-calling API. Used by AgentLoop.
 *     Returns { text, toolCalls, rawContent, stopReason }.
 *     Messages use an internal format; each provider adapter converts as needed.
 *
 * Internal message format (canonical, Anthropic-inspired):
 *   { role: 'user',   content: string | [{type:'tool_result', tool_use_id, content}] }
 *   { role: 'assistant', content: string | [{type:'text', text} | {type:'tool_use', id, name, input}] }
 *   { role: 'tool_results', results: [{id, name, content, error?}] }
 *     (tool_results are synthetic; adapters expand them into the correct position)
 */

const http  = require('http');
const https = require('https');

// ---------------------------------------------------------------------------
// Provider & Model Catalog
// ---------------------------------------------------------------------------

const MODEL_CATALOG = {
  ollama: {
    label: 'Ollama (Local)',
    requiresKey: false,
    endpoint: 'http://127.0.0.1:11434',
    models: [
      { id: 'llama3.3',           name: 'Llama 3.3 70B',       ctx: 131072 },
      { id: 'llama3.2',           name: 'Llama 3.2 3B',        ctx: 131072 },
      { id: 'llama3.1',           name: 'Llama 3.1 8B',        ctx: 131072 },
      { id: 'llama3.1:70b',       name: 'Llama 3.1 70B',       ctx: 131072 },
      { id: 'qwen2.5',            name: 'Qwen 2.5 7B',         ctx: 131072 },
      { id: 'qwen2.5:72b',        name: 'Qwen 2.5 72B',        ctx: 131072 },
      { id: 'qwen3',              name: 'Qwen 3 8B',           ctx: 131072 },
      { id: 'qwen3.5:9b',         name: 'Qwen 3.5 9B',         ctx: 131072 },
      { id: 'mistral',            name: 'Mistral 7B',          ctx: 32768  },
      { id: 'mixtral',            name: 'Mixtral 8x7B',        ctx: 32768  },
      { id: 'mistral-nemo',       name: 'Mistral Nemo 12B',    ctx: 131072 },
      { id: 'gemma4',             name: 'Gemma 4 12B',         ctx: 131072 },
      { id: 'gemma3',             name: 'Gemma 3 12B',         ctx: 131072 },
      { id: 'command-r',          name: 'Command R 35B',       ctx: 131072 },
    ],
  },
  openai: {
    label: 'OpenAI',
    requiresKey: true,
    endpoint: 'https://api.openai.com',
    keyPrefix: 'sk-',
    models: [
      { id: 'gpt-5.2',            name: 'GPT-5.2',             ctx: 2048000 },
      { id: 'gpt-5.1',            name: 'GPT-5.1',             ctx: 2048000 },
      { id: 'gpt-5',              name: 'GPT-5',               ctx: 2048000 },
      { id: 'gpt-5-mini',         name: 'GPT-5 Mini',          ctx: 1048576 },
      { id: 'gpt-5-nano',         name: 'GPT-5 Nano',          ctx: 1048576 },
      { id: 'gpt-4.1',            name: 'GPT-4.1',             ctx: 1047576 },
      { id: 'gpt-4.1-mini',       name: 'GPT-4.1 Mini',        ctx: 1047576 },
      { id: 'gpt-4.1-nano',       name: 'GPT-4.1 Nano',        ctx: 1047576 },
      { id: 'gpt-4o',             name: 'GPT-4o',              ctx: 128000 },
      { id: 'gpt-4o-mini',        name: 'GPT-4o Mini',         ctx: 128000 },
      { id: 'o3',                 name: 'o3',                  ctx: 200000 },
      { id: 'o3-mini',            name: 'o3 Mini',             ctx: 200000 },
      { id: 'o4-mini',            name: 'o4 Mini',             ctx: 200000 },
      { id: 'o1',                 name: 'o1',                  ctx: 200000 },
      { id: 'gpt-4-turbo',        name: 'GPT-4 Turbo',         ctx: 128000 },
      { id: 'gpt-3.5-turbo',      name: 'GPT-3.5 Turbo',       ctx: 16385  },
    ],
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    requiresKey: true,
    endpoint: 'https://api.anthropic.com',
    keyPrefix: 'sk-ant-',
    models: [
      { id: 'claude-opus-4-6',                name: 'Claude Opus 4.6',       ctx: 200000 },
      { id: 'claude-opus-4-5',                name: 'Claude Opus 4.5',       ctx: 200000 },
      { id: 'claude-sonnet-4-6',              name: 'Claude Sonnet 4.6',     ctx: 200000 },
      { id: 'claude-sonnet-4-5',              name: 'Claude Sonnet 4.5',     ctx: 200000 },
      { id: 'claude-sonnet-4-20250514',       name: 'Claude Sonnet 4',       ctx: 200000 },
      { id: 'claude-3-7-sonnet-20250219',     name: 'Claude 3.7 Sonnet',     ctx: 200000 },
      { id: 'claude-3-5-sonnet-20241022',     name: 'Claude 3.5 Sonnet v2',  ctx: 200000 },
      { id: 'claude-3-5-haiku-20241022',      name: 'Claude 3.5 Haiku',      ctx: 200000 },
      { id: 'claude-3-opus-20240229',         name: 'Claude 3 Opus',         ctx: 200000 },
      { id: 'claude-3-haiku-20240307',        name: 'Claude 3 Haiku',        ctx: 200000 },
    ],
  },
  google: {
    label: 'Google (Gemini)',
    requiresKey: true,
    endpoint: 'https://generativelanguage.googleapis.com',
    keyPrefix: 'AI',
    models: [
      { id: 'gemini-3.1-pro-preview',    name: 'Gemini 3.1 Pro',          ctx: 2097152 },
      { id: 'gemini-3-flash-preview',    name: 'Gemini 3 Flash',          ctx: 2097152 },
      { id: 'gemini-2.5-pro',            name: 'Gemini 2.5 Pro',          ctx: 1048576 },
      { id: 'gemini-2.5-flash',          name: 'Gemini 2.5 Flash',        ctx: 1048576 },
      { id: 'gemini-2.5-flash-lite',     name: 'Gemini 2.5 Flash Lite',   ctx: 1048576 },
      { id: 'gemini-2.0-flash',          name: 'Gemini 2.0 Flash',        ctx: 1048576 },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    requiresKey: true,
    endpoint: 'https://api.deepseek.com',
    keyPrefix: 'sk-',
    models: [
      { id: 'deepseek-chat',      name: 'DeepSeek V3',         ctx: 65536  },
      { id: 'deepseek-reasoner',  name: 'DeepSeek R1',         ctx: 65536  },
    ],
  },
  xai: {
    label: 'xAI (Grok)',
    requiresKey: true,
    endpoint: 'https://api.x.ai',
    keyPrefix: 'xai-',
    openaiCompatible: true,
    models: [
      { id: 'grok-3',             name: 'Grok 3',              ctx: 131072 },
      { id: 'grok-3-fast',        name: 'Grok 3 Fast',         ctx: 131072 },
      { id: 'grok-3-mini',        name: 'Grok 3 Mini',         ctx: 131072 },
      { id: 'grok-3-mini-fast',   name: 'Grok 3 Mini Fast',    ctx: 131072 },
      { id: 'grok-2',             name: 'Grok 2',              ctx: 131072 },
    ],
  },
  mistral: {
    label: 'Mistral AI',
    requiresKey: true,
    endpoint: 'https://api.mistral.ai',
    keyPrefix: '',
    openaiCompatible: true,
    models: [
      { id: 'mistral-large-latest',   name: 'Mistral Large',       ctx: 131072 },
      { id: 'mistral-medium-latest',  name: 'Mistral Medium',      ctx: 131072 },
      { id: 'mistral-small-latest',   name: 'Mistral Small',       ctx: 131072 },
      { id: 'codestral-latest',       name: 'Codestral',           ctx: 262144 },
      { id: 'open-mistral-nemo',      name: 'Mistral Nemo',        ctx: 131072 },
      { id: 'pixtral-large-latest',   name: 'Pixtral Large',       ctx: 131072 },
    ],
  },
  groq: {
    label: 'Groq',
    requiresKey: true,
    endpoint: 'https://api.groq.com/openai',
    keyPrefix: 'gsk_',
    openaiCompatible: true,
    models: [
      { id: 'llama-3.3-70b-versatile',    name: 'Llama 3.3 70B',       ctx: 131072 },
      { id: 'llama-3.1-8b-instant',       name: 'Llama 3.1 8B',        ctx: 131072 },
      { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision', ctx: 131072 },
      { id: 'qwen-qwq-32b',              name: 'Qwen QwQ 32B',        ctx: 131072 },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B',  ctx: 131072 },
    ],
  },
  together: {
    label: 'Together AI',
    requiresKey: true,
    endpoint: 'https://api.together.xyz',
    keyPrefix: '',
    openaiCompatible: true,
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo',  ctx: 131072 },
      { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B Turbo', ctx: 131072 },
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B Turbo', ctx: 131072 },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B Turbo', ctx: 131072 },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B',  ctx: 65536  },
      { id: 'deepseek-ai/DeepSeek-R1',        name: 'DeepSeek R1',          ctx: 65536  },
      { id: 'deepseek-ai/DeepSeek-V3',        name: 'DeepSeek V3',          ctx: 65536  },
    ],
  },
  minimax: {
    label: 'MiniMax',
    requiresKey: true,
    endpoint: 'https://api.minimax.io',
    keyPrefix: '',
    anthropicCompatible: true,
    models: [
      { id: 'MiniMax-M2.7-fast', name: 'MiniMax M2.7 Fast', ctx: 1000000 },
      { id: 'MiniMax-M2.5',      name: 'MiniMax M2.5',      ctx: 1000000 },
      { id: 'MiniMax-M2',        name: 'MiniMax M2',         ctx: 1000000 },
    ],
  },
};

function getModelCatalog() { return MODEL_CATALOG; }

// ---------------------------------------------------------------------------
// Token costs (USD per token, approximate)
// ---------------------------------------------------------------------------

const TOKEN_COSTS = {
  // Anthropic
  'claude-opus-4-6':              { input: 15e-6,   output: 75e-6   },
  'claude-opus-4-5':              { input: 15e-6,   output: 75e-6   },
  'claude-sonnet-4-6':            { input: 3e-6,    output: 15e-6   },
  'claude-sonnet-4-5':            { input: 3e-6,    output: 15e-6   },
  'claude-3-7-sonnet-20250219':   { input: 3e-6,    output: 15e-6   },
  'claude-3-5-sonnet-20241022':   { input: 3e-6,    output: 15e-6   },
  'claude-3-5-haiku-20241022':    { input: 0.8e-6,  output: 4e-6    },
  'claude-3-opus-20240229':       { input: 15e-6,   output: 75e-6   },
  'claude-3-haiku-20240307':      { input: 0.25e-6, output: 1.25e-6 },
  // OpenAI
  'gpt-4o':                       { input: 2.5e-6,  output: 10e-6   },
  'gpt-4o-mini':                  { input: 0.15e-6, output: 0.6e-6  },
  'gpt-4-turbo':                  { input: 10e-6,   output: 30e-6   },
  'gpt-4.1':                      { input: 2e-6,    output: 8e-6    },
  'gpt-4.1-mini':                 { input: 0.4e-6,  output: 1.6e-6  },
  'gpt-3.5-turbo':                { input: 0.5e-6,  output: 1.5e-6  },
  'o3':                           { input: 10e-6,   output: 40e-6   },
  'o3-mini':                      { input: 1.1e-6,  output: 4.4e-6  },
  'o4-mini':                      { input: 1.1e-6,  output: 4.4e-6  },
  // Google
  'gemini-2.5-pro':               { input: 1.25e-6, output: 10e-6   },
  'gemini-2.5-flash':             { input: 0.075e-6,output: 0.3e-6  },
  'gemini-2.0-flash':             { input: 0.1e-6,  output: 0.4e-6  },
  // DeepSeek
  'deepseek-chat':                { input: 0.27e-6, output: 1.1e-6  },
  'deepseek-reasoner':            { input: 0.55e-6, output: 2.19e-6 },
  // Groq (fast inference pricing)
  'llama-3.3-70b-versatile':      { input: 0.59e-6, output: 0.79e-6 },
};

/**
 * Estimate cost in USD for a given model and usage.
 * @param {string} model
 * @param {{ inputTokens: number, outputTokens: number }} usage
 * @returns {number} cost in USD
 */
function estimateCost(model, usage) {
  const costs = TOKEN_COSTS[model];
  if (!costs || !usage) return 0;
  return (usage.inputTokens || 0) * costs.input + (usage.outputTokens || 0) * costs.output;
}

// ---------------------------------------------------------------------------
// Module-level settings
// ---------------------------------------------------------------------------

let settings = {
  provider:    'ollama',
  model:       'llama3.2',
  temperature: 0.7,
  maxTokens:   8096,
};

let _keyStore = null;

// Environment variable names for each provider (fallback when KeyStore has no key)
const ENV_KEY_MAP = {
  openai:     ['OPENAI_API_KEY'],
  anthropic:  ['ANTHROPIC_API_KEY'],
  google:     ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  deepseek:   ['DEEPSEEK_API_KEY'],
  xai:        ['XAI_API_KEY'],
  mistral:    ['MISTRAL_API_KEY'],
  groq:       ['GROQ_API_KEY'],
  together:   ['TOGETHER_API_KEY'],
  minimax:    ['MINIMAX_API_TOKEN', 'MINIMAX_API_KEY'],
};

/**
 * Resolve an API key for a given provider.
 * Priority: 1. explicit option  2. KeyStore  3. process.env
 */
function resolveApiKey(provider, explicitKey) {
  if (explicitKey) return explicitKey;

  // KeyStore (encrypted)
  if (_keyStore && provider !== 'ollama') {
    const ksKey = _keyStore.getKey(provider);
    if (ksKey) return ksKey;
  }

  // Environment variable fallback
  const envNames = ENV_KEY_MAP[provider];
  if (envNames) {
    for (const name of envNames) {
      const val = process.env[name];
      if (val) return val;
    }
  }

  return '';
}

function configure(newSettings) {
  settings = { ...settings, ...newSettings };
}

function setKeyStore(ks) { _keyStore = ks; }

function getCurrentProvider() { return settings.provider; }
function getCurrentModel() { return settings.model; }

// ---------------------------------------------------------------------------
// Ollama: list locally available models
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
// Simple text-in / text-out (for llm-tools, synthesis, etc.)
// ---------------------------------------------------------------------------

async function callLLM(systemPrompt, userMessage, options = {}) {
  const merged = { ...settings, ...options };
  const { provider, model, temperature, maxTokens } = merged;

  const catalogEntry = MODEL_CATALOG[provider];
  const endpoint = merged.endpoint || catalogEntry?.endpoint || '';

  const apiKey = resolveApiKey(provider, merged.apiKey);

  if (catalogEntry?.requiresKey && !apiKey) {
    throw new Error(`No API key configured for ${catalogEntry.label}. Add one in Settings → LLM, or set the ${(ENV_KEY_MAP[provider] || [provider.toUpperCase() + '_API_KEY']).join(' / ')} environment variable.`);
  }

  switch (provider) {
    case 'ollama':
      return _ollamaSimple(endpoint, model, systemPrompt, userMessage, temperature);
    case 'openai':
      return _openAISimple(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens);
    case 'anthropic':
      return _anthropicSimple(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens);
    case 'google':
      return _geminiSimple(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens);
    case 'minimax':
      return _anthropicSimple(
        endpoint || MODEL_CATALOG.minimax.endpoint,
        apiKey, model, systemPrompt, userMessage, temperature, maxTokens,
        '/anthropic/v1/messages'
      );
    default: {
      // All OpenAI-compatible providers (deepseek, xai, mistral, groq, together, etc.)
      if (catalogEntry?.openaiCompatible || provider === 'deepseek') {
        return _openAISimple(
          endpoint || catalogEntry?.endpoint,
          apiKey, model, systemPrompt, userMessage, temperature, maxTokens
        );
      }
      throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Native tool-calling API  (used by AgentLoop)
// ---------------------------------------------------------------------------

/**
 * callWithTools — send a conversation with tool definitions and return:
 *   { text, toolCalls, rawContent, stopReason }
 *
 * @param {string}  systemPrompt
 * @param {Array}   messages       Internal message array (see file header for format)
 * @param {Array}   tools          Provider-specific tool definitions from ToolRegistry
 * @param {object}  options        { onTextToken, temperature, maxTokens, ... }
 */
async function callWithTools(systemPrompt, messages, tools, options = {}) {
  const merged = { ...settings, ...options };
  const { provider, model, temperature } = merged;
  const maxTokens = merged.maxTokens || 8096;

  const catalogEntry = MODEL_CATALOG[provider];
  const endpoint = merged.endpoint || catalogEntry?.endpoint || '';

  const apiKey = resolveApiKey(provider, merged.apiKey);

  if (catalogEntry?.requiresKey && !apiKey) {
    throw new Error(`No API key configured for ${catalogEntry.label}. Add one in Settings → LLM, or set the ${(ENV_KEY_MAP[provider] || [provider.toUpperCase() + '_API_KEY']).join(' / ')} environment variable.`);
  }

  switch (provider) {
    case 'anthropic':
      return _anthropicWithTools(endpoint, apiKey, model, systemPrompt, messages, tools, temperature, maxTokens, options);
    case 'openai':
      return _openAIWithTools(endpoint, apiKey, model, systemPrompt, messages, tools, temperature, maxTokens, options);
    case 'ollama':
      return _ollamaWithTools(endpoint, model, systemPrompt, messages, tools, temperature, maxTokens, options);
    case 'google':
      return _geminiWithTools(endpoint, apiKey, model, systemPrompt, messages, tools, temperature, maxTokens, options);
    case 'minimax':
      return _anthropicWithTools(
        endpoint || MODEL_CATALOG.minimax.endpoint,
        apiKey, model, systemPrompt, messages, tools, temperature, maxTokens,
        { ...options, _messagesPath: '/anthropic/v1/messages' }
      );
    default: {
      // All OpenAI-compatible providers (deepseek, xai, mistral, groq, together, etc.)
      if (catalogEntry?.openaiCompatible || provider === 'deepseek') {
        return _openAIWithTools(
          endpoint || catalogEntry?.endpoint,
          apiKey, model, systemPrompt, messages, tools, temperature, maxTokens, options
        );
      }
      throw new Error(`Unknown LLM provider for tool calling: ${provider}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal message format → Anthropic messages
// ---------------------------------------------------------------------------

function _internalToAnthropicMessages(messages) {
  const result = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      // Plain text user message or tool_result injection
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        result.push({ role: 'user', content: msg.content });
      }
    } else if (msg.role === 'assistant') {
      // Could be plain text or array with tool_use blocks
      if (typeof msg.content === 'string') {
        result.push({ role: 'assistant', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        result.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool_results') {
      // Convert tool results into Anthropic's user message format
      const toolResultBlocks = (msg.results || []).map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: r.content || '',
        is_error: !!r.error,
      }));
      if (toolResultBlocks.length > 0) {
        result.push({ role: 'user', content: toolResultBlocks });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal message format → OpenAI messages
// ---------------------------------------------------------------------------

function _internalToOpenAIMessages(messages) {
  const result = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // Convert tool_result blocks to tool messages
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            result.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: block.content || '',
            });
          } else if (block.type === 'text') {
            result.push({ role: 'user', content: block.text });
          }
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'assistant', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // Separate text and tool_use blocks
        const textBlocks = msg.content.filter((b) => b.type === 'text');
        const toolUseBlocks = msg.content.filter((b) => b.type === 'tool_use');

        const assistantMsg = {
          role: 'assistant',
          content: textBlocks.map((b) => b.text).join('') || null,
        };

        if (toolUseBlocks.length > 0) {
          assistantMsg.tool_calls = toolUseBlocks.map((b) => ({
            id: b.id,
            type: 'function',
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input),
            },
          }));
        }

        result.push(assistantMsg);
      }
    } else if (msg.role === 'tool_results') {
      for (const r of msg.results || []) {
        result.push({
          role: 'tool',
          tool_call_id: r.id,
          content: r.content || (r.error ? `Error: ${r.error}` : ''),
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Anthropic with tools
// ---------------------------------------------------------------------------

async function _anthropicWithTools(
  endpoint, apiKey, model, systemPrompt, messages, tools, temperature, maxTokens, options
) {
  const url = new URL(options?._messagesPath || '/v1/messages', endpoint || MODEL_CATALOG.anthropic.endpoint);
  const anthropicMessages = _internalToAnthropicMessages(messages);

  // ── Prompt caching: mark system prompt and tools for KV cache reuse ──
  // The system prompt and tool definitions are stable across turns.
  // Anthropic's prompt caching avoids re-processing them on every request,
  // reducing latency by ~2x and input token cost by 90% on cache hits.
  const systemBlocks = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
  ];

  const bodyObj = {
    model,
    system:     systemBlocks,
    messages:   anthropicMessages,
    max_tokens: maxTokens,
    temperature,
    stream:     true,
  };
  if (tools && tools.length > 0) {
    // Mark the last tool with cache_control so the entire tools array is cached
    const cachedTools = tools.map((t, i) =>
      i === tools.length - 1
        ? { ...t, cache_control: { type: 'ephemeral' } }
        : t
    );
    bodyObj.tools = cachedTools;
  }
  const body = JSON.stringify(bodyObj);

  const headers = {
    'Content-Type':      'application/json',
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta':    'prompt-caching-2024-07-31',
  };
  // Forward any extra headers (e.g. anthropic-beta for PDF support)
  if (options?.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      // Merge anthropic-beta values instead of overwriting
      if (k === 'anthropic-beta' && headers['anthropic-beta']) {
        headers[k] = headers[k] + ',' + v;
      } else {
        headers[k] = v;
      }
    }
  }

  let fullText              = '';
  const contentBlocks       = {}; // index → { type, id, name, text, inputJson }
  let stopReason            = null;
  let usage                 = null;

  await httpStreamRequest(url, { method: 'POST', headers, body }, (line) => {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (!raw) return;
    let ev;
    try { ev = JSON.parse(raw); } catch { return; }

    switch (ev.type) {
      case 'message_start':
        if (ev.message?.usage) {
          usage = {
            inputTokens:        ev.message.usage.input_tokens || 0,
            outputTokens:       0,
            cacheCreationTokens: ev.message.usage.cache_creation_input_tokens || 0,
            cacheReadTokens:     ev.message.usage.cache_read_input_tokens || 0,
          };
        }
        break;

      case 'content_block_start': {
        const blk = ev.content_block;
        contentBlocks[ev.index] = {
          type:      blk.type,
          id:        blk.id   || null,
          name:      blk.name || null,
          text:      blk.type === 'text'     ? (blk.text || '') : '',
          inputJson: blk.type === 'tool_use' ? '' : null,
        };
        break;
      }

      case 'content_block_delta': {
        const blk   = contentBlocks[ev.index];
        if (!blk) break;
        const delta = ev.delta;
        if (delta.type === 'text_delta' && delta.text) {
          blk.text += delta.text;
          fullText  += delta.text;
          if (options?.onTextToken) options.onTextToken(delta.text);
        } else if (delta.type === 'input_json_delta' && delta.partial_json != null) {
          blk.inputJson += delta.partial_json;
        }
        break;
      }

      case 'message_delta':
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        if (ev.usage?.output_tokens != null) {
          if (!usage) usage = { inputTokens: 0, outputTokens: 0 };
          usage.outputTokens = ev.usage.output_tokens;
        }
        break;

      default:
        break;
    }
  });

  // Log cache metrics
  if (usage && (usage.cacheCreationTokens || usage.cacheReadTokens)) {
    console.log(`[LLM] Anthropic cache: created=${usage.cacheCreationTokens} read=${usage.cacheReadTokens} input=${usage.inputTokens}`);
  }

  // Reconstruct rawContent and toolCalls from accumulated blocks (preserve order)
  const rawContent = [];
  const toolCalls  = [];

  for (const [, blk] of Object.entries(contentBlocks).sort(([a], [b]) => Number(a) - Number(b))) {
    if (blk.type === 'text' && blk.text) {
      rawContent.push({ type: 'text', text: blk.text });
    } else if (blk.type === 'tool_use') {
      let input = {};
      try { input = JSON.parse(blk.inputJson || '{}'); } catch {}
      rawContent.push({ type: 'tool_use', id: blk.id, name: blk.name, input });
      toolCalls.push({ id: blk.id, name: blk.name, input });
    }
  }

  return {
    text:       fullText,
    rawContent: rawContent.length > 0 ? rawContent : fullText,
    toolCalls,
    stopReason,
    usage,
  };
}

// ---------------------------------------------------------------------------
// OpenAI (+ DeepSeek) with tools
// ---------------------------------------------------------------------------

async function _openAIWithTools(
  endpoint, apiKey, model, systemPrompt, messages, tools, temperature, maxTokens, options
) {
  const url = new URL('/v1/chat/completions', endpoint || MODEL_CATALOG.openai.endpoint);
  const openAIMessages = _internalToOpenAIMessages(messages);

  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...openAIMessages,
  ];

  // Reasoning models: don't support temperature, tool_choice, or max_tokens
  // Includes o-series (o1, o3, o4-mini) and GPT-5 series (gpt-5, gpt-5-mini, etc.)
  const isReasoningModel = /^(o[0-9]|gpt-5)/.test(model);

  const bodyObj = { model, messages: allMessages, stream: true };

  if (!isReasoningModel) {
    bodyObj.temperature = temperature;
  }
  // Reasoning models require max_completion_tokens; all other GPT models use max_tokens
  if (isReasoningModel) {
    bodyObj.max_completion_tokens = maxTokens;
  } else {
    bodyObj.max_tokens = maxTokens;
  }

  if (tools && tools.length > 0) {
    bodyObj.tools = tools;
    if (!isReasoningModel) bodyObj.tool_choice = 'auto';
  }

  let fullText       = '';
  const toolCallsAcc = {}; // index → { id, name, argumentsJson }
  let stopReason     = null;
  let usage          = null;

  await httpStreamRequest(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify(bodyObj),
  }, (line) => {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (raw === '[DONE]' || !raw) return;
    let ev;
    try { ev = JSON.parse(raw); } catch { return; }

    if (ev.error) throw new Error(`OpenAI API error: ${ev.error.message || JSON.stringify(ev.error)}`);

    // Usage can appear in a trailing chunk (some providers send it after [DONE])
    if (ev.usage) {
      usage = { inputTokens: ev.usage.prompt_tokens || 0, outputTokens: ev.usage.completion_tokens || 0 };
    }

    const delta = ev.choices?.[0]?.delta;
    if (!delta) return;

    if (delta.content) {
      fullText += delta.content;
      if (options?.onTextToken) options.onTextToken(delta.content);
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallsAcc[idx]) toolCallsAcc[idx] = { id: '', name: '', argumentsJson: '' };
        if (tc.id)                 toolCallsAcc[idx].id            += tc.id;
        if (tc.function?.name)     toolCallsAcc[idx].name          += tc.function.name;
        if (tc.function?.arguments) toolCallsAcc[idx].argumentsJson += tc.function.arguments;
      }
    }

    const fr = ev.choices?.[0]?.finish_reason;
    if (fr) stopReason = fr;
  });

  // Build rawContent in Anthropic-compatible format for consistent history
  const rawContent = [];
  const toolCalls  = [];

  if (fullText) rawContent.push({ type: 'text', text: fullText });
  for (const [, tc] of Object.entries(toolCallsAcc).sort(([a], [b]) => Number(a) - Number(b))) {
    let input = {};
    try { input = JSON.parse(tc.argumentsJson); } catch {}
    rawContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
    toolCalls.push({ id: tc.id, name: tc.name, input });
  }

  return {
    text:       fullText,
    rawContent: rawContent.length > 0 ? rawContent : fullText,
    toolCalls,
    stopReason,
    usage,
  };
}

// ---------------------------------------------------------------------------
// Ollama with tools (uses /api/chat — OpenAI-compatible tool calling)
// ---------------------------------------------------------------------------

async function _ollamaWithTools(
  endpoint, model, systemPrompt, messages, tools, temperature, maxTokens, options
) {
  const baseUrl = endpoint || MODEL_CATALOG.ollama.endpoint;
  const url = new URL('/api/chat', baseUrl);

  const ollamaMessages = _internalToOpenAIMessages(messages);
  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...ollamaMessages,
  ];

  const bodyObj = {
    model,
    messages: allMessages,
    stream:   true,
    options:  { temperature, num_predict: maxTokens },
  };

  if (tools && tools.length > 0) bodyObj.tools = tools;

  let fullText     = '';
  let finalMessage = null;
  let finalUsage   = null;

  async function doRequest(body) {
    fullText = '';
    finalMessage = null;
    finalUsage = null;

    await httpStreamRequest(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }, (line) => {
      if (!line.trim()) return;
      let ev;
      try { ev = JSON.parse(line); } catch { return; }

      // Detect "does not support tools" error in stream
      if (ev.error) {
        throw new Error(ev.error);
      }

      const content = ev.message?.content;
      if (content && !ev.done) {
        fullText += content;
        if (options?.onTextToken) options.onTextToken(content);
      }

      if (ev.done) {
        finalMessage = ev.message || {};
        if (finalMessage.content && !fullText) {
          fullText = finalMessage.content;
          if (options?.onTextToken) options.onTextToken(fullText);
        }
        if (ev.prompt_eval_count || ev.eval_count) {
          finalUsage = { inputTokens: ev.prompt_eval_count || 0, outputTokens: ev.eval_count || 0 };
        }
      }
    });
  }

  // Try with tools first; if model doesn't support them, retry without
  try {
    await doRequest(JSON.stringify(bodyObj));
  } catch (err) {
    if (err.message && /does not support tools|tool.*not supported/i.test(err.message)) {
      console.warn(`[LLM] Ollama: ${model} does not support tools — retrying without tools`);
      delete bodyObj.tools;
      await doRequest(JSON.stringify(bodyObj));
    } else {
      throw err;
    }
  }

  const toolCallsRaw = finalMessage?.tool_calls || [];
  const rawContent   = [];
  const toolCalls    = [];

  if (fullText) rawContent.push({ type: 'text', text: fullText });
  for (const tc of toolCallsRaw) {
    const block = {
      type:  'tool_use',
      id:    `ollama_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name:  tc.function?.name || tc.name,
      input: tc.function?.arguments || tc.arguments || {},
    };
    rawContent.push(block);
    toolCalls.push({ id: block.id, name: block.name, input: block.input });
  }

  return {
    text:       fullText,
    rawContent: rawContent.length > 0 ? rawContent : fullText,
    toolCalls,
    stopReason: 'stop',
    usage:      finalUsage,
  };
}

// ---------------------------------------------------------------------------
// Google Gemini with tools
// ---------------------------------------------------------------------------

function _internalToGeminiContents(messages) {
  const result = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', parts: [{ text: msg.content }] });
      } else if (Array.isArray(msg.content)) {
        const parts = [];
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            parts.push({
              functionResponse: {
                name: block.toolName || 'unknown',
                response: { result: block.content || '' },
              },
            });
          } else if (block.type === 'text') {
            parts.push({ text: block.text });
          }
        }
        if (parts.length > 0) result.push({ role: 'user', parts });
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'model', parts: [{ text: msg.content }] });
      } else if (Array.isArray(msg.content)) {
        const parts = [];
        for (const block of msg.content) {
          if (block.type === 'text') parts.push({ text: block.text });
          if (block.type === 'tool_use') {
            const part = { functionCall: { name: block.name, args: block.input } };
            // Replay thought signature as part-level sibling — required by Gemini for multi-turn calls
            if (block.thoughtSignature) part.thoughtSignature = block.thoughtSignature;
            parts.push(part);
          }
        }
        if (parts.length > 0) result.push({ role: 'model', parts });
      }
    } else if (msg.role === 'tool_results') {
      const parts = (msg.results || []).map((r) => ({
        functionResponse: {
          name: r.name,
          response: { result: r.content || (r.error ? `Error: ${r.error}` : '') },
        },
      }));
      if (parts.length > 0) result.push({ role: 'user', parts });
    }
  }

  return result;
}

async function _geminiWithTools(
  endpoint, apiKey, model, systemPrompt, messages, tools, temperature, maxTokens, options
) {
  const baseUrl = endpoint || MODEL_CATALOG.google.endpoint;
  // Use streamGenerateContent with alt=sse for chunked SSE streaming
  const url = new URL(
    `/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    baseUrl
  );

  const contents = _internalToGeminiContents(messages);
  const bodyObj  = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  if (tools && tools.length > 0) bodyObj.tools = tools;

  let fullText    = '';
  const toolCalls = [];
  let stopReason  = null;
  let usage       = null;
  let apiError    = null;

  await httpStreamRequest(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(bodyObj),
  }, (line) => {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6).trim();
    if (!raw) return;
    let ev;
    try { ev = JSON.parse(raw); } catch { return; }

    if (ev.error) {
      apiError = `Gemini API error: ${ev.error.message || JSON.stringify(ev.error)}`;
      return;
    }

    const parts = ev.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      if (p.text) {
        fullText += p.text;
        if (options?.onTextToken) options.onTextToken(p.text);
      }
      if (p.functionCall) {
        const tc = {
          id:    `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name:  p.functionCall.name,
          input: p.functionCall.args || {},
        };
        // Preserve thought signature (part-level sibling to functionCall) for Gemini multi-turn calls
        if (p.thoughtSignature) {
          tc.thoughtSignature = p.thoughtSignature;
        }
        toolCalls.push(tc);
      }
    }

    const fr = ev.candidates?.[0]?.finishReason;
    if (fr) stopReason = fr;

    if (ev.usageMetadata) {
      usage = {
        inputTokens:  ev.usageMetadata.promptTokenCount     || 0,
        outputTokens: ev.usageMetadata.candidatesTokenCount || 0,
      };
    }
  });

  if (apiError) throw new Error(apiError);

  const rawContent = [];
  if (fullText) rawContent.push({ type: 'text', text: fullText });
  for (const tc of toolCalls) {
    const block = { type: 'tool_use', id: tc.id, name: tc.name, input: tc.input };
    // Preserve Gemini thought signature so it can be replayed in subsequent turns
    if (tc.thoughtSignature) block.thoughtSignature = tc.thoughtSignature;
    rawContent.push(block);
  }

  return {
    text:       fullText,
    rawContent: rawContent.length > 0 ? rawContent : fullText,
    toolCalls,
    stopReason,
    usage,
  };
}

// ---------------------------------------------------------------------------
// Simple (non-tool) provider implementations
// ---------------------------------------------------------------------------

async function _ollamaSimple(endpoint, model, systemPrompt, userMessage, temperature) {
  const url = new URL('/api/generate', endpoint || MODEL_CATALOG.ollama.endpoint);
  const response = await httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: userMessage,
      stream: false,
      options: { temperature },
    }),
  });
  return JSON.parse(response).response || '';
}

async function _openAISimple(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens) {
  const url = new URL('/v1/chat/completions', endpoint || MODEL_CATALOG.openai.endpoint);
  const isReasoning = /^(o[0-9]|gpt-5)/.test(model);
  const bodyObj = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
  };
  if (!isReasoning) {
    bodyObj.temperature = temperature;
  }
  if (isReasoning) {
    bodyObj.max_completion_tokens = maxTokens;
  } else {
    bodyObj.max_tokens = maxTokens;
  }
  const response = await httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(bodyObj),
  });
  return JSON.parse(response).choices?.[0]?.message?.content || '';
}

async function _anthropicSimple(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens, messagesPath) {
  const url = new URL(messagesPath || '/v1/messages', endpoint || MODEL_CATALOG.anthropic.endpoint);
  const response = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  const data = JSON.parse(response);
  return data.content?.[0]?.text || '';
}

async function _geminiSimple(endpoint, apiKey, model, systemPrompt, userMessage, temperature, maxTokens) {
  const baseUrl = endpoint || MODEL_CATALOG.google.endpoint;
  const url = new URL(`/v1beta/models/${model}:generateContent?key=${apiKey}`, baseUrl);
  const response = await httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });
  return JSON.parse(response).candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ---------------------------------------------------------------------------
// Native PDF Q&A — sends the PDF binary directly to vision-capable providers
// ---------------------------------------------------------------------------

/**
 * askAboutPDF(filePath, question, options)
 *
 * Sends a PDF file + question directly to the LLM using provider-native PDF
 * document support (Anthropic document API, Gemini inline_data).
 * Falls back to text extraction + callLLM for other providers.
 *
 * @param {string}  filePath   Absolute path to PDF file
 * @param {string}  question   The question to ask about the PDF
 * @param {object}  options    { maxTokens, fallbackText }
 * @returns {Promise<string>}  LLM answer
 */
async function askAboutPDF(filePath, question, options = {}) {
  const merged = { ...settings, ...options };
  const { provider, model, temperature } = merged;
  const maxTokens = merged.maxTokens || 4096;

  const catalogEntry = MODEL_CATALOG[provider];
  const endpoint = merged.endpoint || catalogEntry?.endpoint || '';

  const apiKey = resolveApiKey(provider, merged.apiKey);

  const fsp = require('fs/promises');
  const pdfData = await fsp.readFile(filePath);
  const pdfBase64 = pdfData.toString('base64');
  const fileSizeMB = pdfData.length / (1024 * 1024);

  // Anthropic native PDF document support (200K ctx, up to ~100 pages/32MB)
  if (provider === 'anthropic') {
    if (!apiKey) throw new Error('No Anthropic API key configured. Add one in Settings → LLM.');

    const url = new URL('/v1/messages', endpoint || MODEL_CATALOG.anthropic.endpoint);
    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      system: 'You are an expert document analyst. Read the PDF thoroughly and answer questions with specific details, page references, and accurate citations from the document. Never skip content.',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          { type: 'text', text: question },
        ],
      }],
    };

    const response = await httpRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify(body),
    });
    const data = JSON.parse(response);
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.content?.[0]?.text || '';
  }

  // Google Gemini native PDF support
  if (provider === 'google') {
    if (!apiKey) throw new Error('No Google API key configured. Add one in Settings → LLM.');

    const baseUrl = endpoint || MODEL_CATALOG.google.endpoint;
    const url = new URL(`/v1beta/models/${model}:generateContent?key=${apiKey}`, baseUrl);
    const body = {
      system_instruction: { parts: [{ text: 'You are an expert document analyst. Read the PDF thoroughly and answer questions with specific details and page references.' }] },
      contents: [{
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          { text: question },
        ],
      }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };

    const response = await httpRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = JSON.parse(response);
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // Fallback: use pre-extracted text if provided
  if (options.fallbackText) {
    return callLLM(
      'You are an expert document analyst. Answer questions accurately using only the provided document text. Always cite page numbers when available.',
      `DOCUMENT TEXT:\n${options.fallbackText}\n\n---\nQUESTION: ${question}\n\nAnswer thoroughly with specific details and page references:`,
      options
    );
  }

  // Last resort: tell caller we need text extraction
  throw new Error(
    `Provider '${provider}' does not support native PDF vision. Use office_read_pdf to extract text first, then ask your question.`
  );
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function httpRequest(url, options) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method:  options.method || 'GET',
        headers: options.headers || {},
        timeout: 180_000,
      },
      (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url.toString()).toString();
          httpRequest(new URL(redirectUrl), options).then(resolve).catch(reject);
          return;
        }

        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
          }
        });
      }
    );

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out (180s)')); });

    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * httpStreamRequest — streaming HTTP request for SSE / NDJSON responses.
 *
 * Calls onLine() for each newline-delimited line as it arrives from the server.
 * This is used by all callWithTools implementations to enable true per-token
 * streaming, dramatically reducing time-to-first-token.
 *
 * @param {URL}      url
 * @param {object}   options  { method, headers, body }
 * @param {Function} onLine   Called with each complete line string
 * @returns {Promise<void>}   Resolves when the stream is complete
 */
function httpStreamRequest(url, options, onLine) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method:  options.method || 'POST',
      headers: options.headers || {},
      timeout: 180_000,
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url.toString()).toString();
        httpStreamRequest(new URL(redirectUrl), options, onLine).then(resolve).catch(reject);
        return;
      }

      // Non-2xx: drain body and reject with error
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errBody = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => { errBody += c; });
        res.on('end',  () => reject(new Error(`HTTP ${res.statusCode}: ${errBody.slice(0, 500)}`)));
        return;
      }

      let buffer        = '';
      let callbackError = null;

      res.setEncoding('utf-8');
      res.on('data', (chunk) => {
        if (callbackError) return;
        buffer += chunk;
        // Split on newlines; keep any incomplete trailing line buffered
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          try { onLine(line); }
          catch (e) { callbackError = e; return; }
        }
      });
      res.on('end', () => {
        if (callbackError) { reject(callbackError); return; }
        if (buffer.trim()) {
          try { onLine(buffer); } catch (e) { reject(e); return; }
        }
        resolve();
      });
      res.on('error', reject);
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Stream request timed out (180s)')); });

    if (options.body) req.write(options.body);
    req.end();
  });
}

module.exports = {
  callLLM,
  callWithTools,
  askAboutPDF,
  configure,
  setKeyStore,
  getModelCatalog,
  listOllamaModels,
  getCurrentProvider,
  getCurrentModel,
  resolveApiKey,
  TOKEN_COSTS,
  estimateCost,
};
