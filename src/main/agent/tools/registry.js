const { FilesystemTools } = require('./filesystem');
const { AppControlTools } = require('./app-control');
const { BrowserTools } = require('./browser');
const { SearchFetchTools } = require('./search-fetch');
const { SystemTools } = require('./system');
const { LLMTools } = require('./llm-tools');
const { OfficeTools } = require('./office');
const { TOOL_SCHEMAS } = require('./tool-schemas');

class ToolRegistry {
  constructor(permissions) {
    this.tools = new Map();
    this.permissions = permissions;
  }

  register(tool) {
    if (!tool.name || !tool.execute) {
      throw new Error(`Invalid tool: must have name and execute function`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name) {
    return this.tools.get(name) || null;
  }

  listTools() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      category: t.category,
      description: t.description,
      params: t.params || [],
      permissionLevel: t.permissionLevel || 'sensitive',
    }));
  }

  async registerBuiltinTools() {
    for (const tool of FilesystemTools)    this.register(tool);
    for (const tool of AppControlTools)    this.register(tool);
    for (const tool of BrowserTools)       this.register(tool);
    for (const tool of SearchFetchTools)   this.register(tool);
    for (const tool of SystemTools)        this.register(tool);
    for (const tool of LLMTools)           this.register(tool);
    for (const tool of OfficeTools)        this.register(tool);

    console.log(`[ToolRegistry] Registered ${this.tools.size} tools`);
  }

  // --------------------------------------------------------------------------
  // Native tool calling schemas
  // --------------------------------------------------------------------------

  /**
   * Returns tool definitions in the format required by the given LLM provider.
   * Used by the AgentLoop for native tool/function calling.
   *
   * @param {'anthropic'|'openai'|'ollama'|'google'|'deepseek'} provider
   * @returns {Array} Provider-specific tool definition array
   */
  getToolDefinitions(provider = 'anthropic') {
    const tools = Array.from(this.tools.values());

    switch (provider) {
      case 'anthropic':
        return this._toAnthropicTools(tools);
      case 'openai':
      case 'deepseek':
      case 'ollama':
        return this._toOpenAITools(tools);
      case 'google':
        return this._toGeminiTools(tools);
      default:
        return this._toAnthropicTools(tools);
    }
  }

  // ---- Anthropic format ----
  _toAnthropicTools(tools) {
    return tools.map((t) => {
      const schema = TOOL_SCHEMAS[t.name];
      return {
        name: t.name,
        description: schema?.description || t.description,
        input_schema: {
          type: 'object',
          properties: schema?.properties || this._inferProperties(t),
          required: schema?.required || [],
        },
      };
    });
  }

  // ---- OpenAI / DeepSeek / Ollama format ----
  _toOpenAITools(tools) {
    return tools.map((t) => {
      const schema = TOOL_SCHEMAS[t.name];
      return {
        type: 'function',
        function: {
          name: t.name,
          description: schema?.description || t.description,
          parameters: {
            type: 'object',
            properties: schema?.properties || this._inferProperties(t),
            required: schema?.required || [],
          },
        },
      };
    });
  }

  // ---- Google Gemini format ----
  _toGeminiTools(tools) {
    const functionDeclarations = tools.map((t) => {
      const schema = TOOL_SCHEMAS[t.name];
      return {
        name: t.name,
        description: schema?.description || t.description,
        parameters: {
          type: 'OBJECT',
          properties: this._toGeminiProperties(schema?.properties || this._inferProperties(t)),
          required: schema?.required || [],
        },
      };
    });
    return [{ functionDeclarations }];
  }

  _toGeminiProperties(props) {
    if (!props) return {};
    const result = {};
    for (const [key, val] of Object.entries(props)) {
      result[key] = {
        type: (val.type || 'string').toUpperCase(),
        description: val.description || '',
      };
      if (val.enum) result[key].enum = val.enum;
    }
    return result;
  }

  /**
   * Fallback: infer basic string properties from the tool's params array.
   */
  _inferProperties(tool) {
    const props = {};
    for (const param of tool.params || []) {
      props[param] = { type: 'string', description: param };
    }
    return props;
  }
}

module.exports = { ToolRegistry };
