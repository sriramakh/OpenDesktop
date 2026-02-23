const { FilesystemTools } = require('./filesystem');
const { AppControlTools } = require('./app-control');
const { BrowserTools } = require('./browser');
const { SearchFetchTools } = require('./search-fetch');
const { SystemTools } = require('./system');
const { LLMTools } = require('./llm-tools');
const { OfficeTools } = require('./office');
const { CONNECTOR_TOOLS } = require('./connectors');
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

  /**
   * Register (or refresh) tools from all connected MCP servers.
   * Removes any previously registered MCP tools first, then re-adds them.
   * Call this after adding/removing an MCP server.
   */
  registerMCPTools(mcpManager) {
    // Remove existing MCP tools
    for (const name of this.tools.keys()) {
      if (name.startsWith('mcp_')) this.tools.delete(name);
    }
    // Register fresh set
    for (const tool of mcpManager.getRegistryTools()) {
      this.register(tool);
    }
    const mcpCount = Array.from(this.tools.keys()).filter((n) => n.startsWith('mcp_')).length;
    console.log(`[ToolRegistry] Registered ${mcpCount} MCP tools (${this.tools.size} total)`);
  }

  async registerBuiltinTools() {
    for (const tool of FilesystemTools)    this.register(tool);
    for (const tool of AppControlTools)    this.register(tool);
    for (const tool of BrowserTools)       this.register(tool);
    for (const tool of SearchFetchTools)   this.register(tool);
    for (const tool of SystemTools)        this.register(tool);
    for (const tool of LLMTools)           this.register(tool);
    for (const tool of OfficeTools)        this.register(tool);
    for (const tool of CONNECTOR_TOOLS)    this.register(tool);

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
      case 'xai':
      case 'mistral':
      case 'groq':
      case 'together':
      case 'perplexity':
        return this._toOpenAITools(tools);
      case 'ollama':
        return this._toOllamaTools(tools);
      case 'google':
        return this._toGeminiTools(tools);
      default:
        // Default to OpenAI format for unknown OpenAI-compatible providers
        return this._toOpenAITools(tools);
    }
  }

  // ---- Anthropic format ----
  _toAnthropicTools(tools) {
    return tools.map((t) => {
      const schema = TOOL_SCHEMAS[t.name] || t._schema;
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

  // ---- OpenAI / DeepSeek format ----
  _toOpenAITools(tools) {
    return tools.map((t) => {
      const schema = TOOL_SCHEMAS[t.name] || t._schema;
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

  // ---- Ollama format (simplified schemas) ----
  _toOllamaTools(tools) {
    return tools.map((t) => {
      const schema = TOOL_SCHEMAS[t.name] || t._schema;
      return {
        type: 'function',
        function: {
          name: t.name,
          description: schema?.description || t.description,
          parameters: {
            type: 'object',
            properties: this._simplifyProperties(schema?.properties || this._inferProperties(t)),
            required: schema?.required || [],
          },
        },
      };
    });
  }

  _simplifyProperties(props) {
    if (!props) return {};
    const result = {};
    for (const [key, val] of Object.entries(props)) {
      const simpleType = val.type === 'array' ? 'string'
        : val.type === 'object' ? 'string'
        : val.type || 'string';
      const desc = val.type === 'array'
        ? `${val.description || key} (pass as JSON array string)`
        : val.type === 'object'
        ? `${val.description || key} (pass as JSON object string)`
        : val.description || key;
      result[key] = { type: simpleType, description: desc };
    }
    return result;
  }

  // ---- Google Gemini format ----
  _toGeminiTools(tools) {
    const functionDeclarations = tools.map((t) => {
      const schema = TOOL_SCHEMAS[t.name] || t._schema;
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

  /**
   * Recursively convert a JSON Schema node to Gemini schema format.
   * Gemini requires:
   *  - type in UPPER_CASE
   *  - ARRAY types must always have an `items` field
   *  - OBJECT types may have `properties` + `required`
   *  - No `additionalProperties`, `default`, `$schema` etc.
   */
  _toGeminiSchema(schema) {
    if (!schema) return { type: 'STRING' };

    const type = (schema.type || 'string').toUpperCase();
    const result = { type };
    if (schema.description) result.description = schema.description;
    if (schema.enum)        result.enum = schema.enum;

    if (type === 'ARRAY') {
      // Gemini rejects arrays without items — always provide one
      result.items = schema.items
        ? this._toGeminiSchema(schema.items)
        : { type: 'STRING' };
    }

    if (type === 'OBJECT' && schema.properties) {
      result.properties = this._toGeminiProperties(schema.properties);
      if (schema.required?.length) result.required = schema.required;
    }

    return result;
  }

  _toGeminiProperties(props) {
    if (!props) return {};
    const result = {};
    for (const [key, val] of Object.entries(props)) {
      result[key] = this._toGeminiSchema(val);
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
