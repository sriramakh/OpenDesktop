const { FilesystemTools } = require('./filesystem');
const { AppControlTools } = require('./app-control');
const { BrowserTools } = require('./browser');
const { SearchFetchTools } = require('./search-fetch');
const { SystemTools } = require('./system');
const { LLMTools } = require('./llm-tools');
const { OfficeTools } = require('./office');
const { CONNECTOR_TOOLS } = require('./connectors');
const { BROWSER_TABS_TOOLS } = require('./browser-tabs');
const { ContentTools } = require('./content-tools');
const { ReminderTools } = require('./reminder-tools');
const { DATABASE_TOOLS } = require('./database-tools');
const { GITHUB_TOOLS } = require('./github-tools');
const { PRODUCTIVITY_TOOLS } = require('./productivity-tools');
const { MESSAGING_TOOLS } = require('./messaging-tools');
const { WORKFLOW_TOOLS } = require('./workflow-tools');
const { SCHEDULER_TOOLS } = require('./scheduler-tools');
const { ORCHESTRATION_TOOLS } = require('./orchestration-tools');
const { PresentationTools } = require('./presentation-tools');
const { ExcelTools } = require('./excel-tools');
const { SOCIAL_MEDIA_TOOLS } = require('./social-media-tools');
const { SKILL_TOOLS } = require('./skill-tools');
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
    // Invalidate cached tool definitions so the loop picks up the new tools
    this._toolDefsVersion = (this._toolDefsVersion || 0) + 1;
    const mcpCount = Array.from(this.tools.keys()).filter((n) => n.startsWith('mcp_')).length;
    console.log(`[ToolRegistry] Registered ${mcpCount} MCP tools (${this.tools.size} total)`);
  }

  async registerBuiltinTools({ spawner } = {}) {
    for (const tool of FilesystemTools)    this.register(tool);
    for (const tool of AppControlTools)    this.register(tool);
    for (const tool of BrowserTools)       this.register(tool);
    for (const tool of SearchFetchTools)   this.register(tool);
    for (const tool of SystemTools)        this.register(tool);
    for (const tool of LLMTools)           this.register(tool);
    for (const tool of OfficeTools)        this.register(tool);
    for (const tool of CONNECTOR_TOOLS)      this.register(tool);
    for (const tool of BROWSER_TABS_TOOLS)  this.register(tool);
    for (const tool of ContentTools)        this.register(tool);
    for (const tool of ReminderTools)       this.register(tool);
    for (const tool of DATABASE_TOOLS)      this.register(tool);
    for (const tool of GITHUB_TOOLS)        this.register(tool);
    for (const tool of PRODUCTIVITY_TOOLS)  this.register(tool);
    for (const tool of MESSAGING_TOOLS)     this.register(tool);
    for (const tool of WORKFLOW_TOOLS)      this.register(tool);
    for (const tool of SCHEDULER_TOOLS)     this.register(tool);
    for (const tool of ORCHESTRATION_TOOLS) this.register(tool);
    for (const tool of PresentationTools)   this.register(tool);
    for (const tool of ExcelTools)          this.register(tool);
    for (const tool of SOCIAL_MEDIA_TOOLS)  this.register(tool);
    for (const tool of SKILL_TOOLS)         this.register(tool);

    // Wire spawner into orchestration tools if provided
    if (spawner && ORCHESTRATION_TOOLS._setSpawner) {
      ORCHESTRATION_TOOLS._setSpawner(spawner);
    }

    console.log(`[ToolRegistry] Registered ${this.tools.size} tools`);
  }

  /**
   * Load and register custom connector tools from {userData}/connectors/ directory.
   */
  loadCustomConnectors(userDataPath) {
    try {
      const { loadConnectors } = require('../connector-sdk');
      const customTools = loadConnectors(userDataPath);
      for (const tool of customTools) {
        this.register(tool);
      }
      if (customTools.length > 0) {
        console.log(`[ToolRegistry] Loaded ${customTools.length} custom connector tools`);
      }
    } catch (err) {
      console.warn('[ToolRegistry] Custom connector load failed:', err.message);
    }
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
  getToolDefinitions(provider = 'anthropic', model = '') {
    let tools = Array.from(this.tools.values());

    // Provider-specific tool limits
    const OPENAI_TOOL_LIMIT = 128;
    // Ollama: small models (<= 12B) get fewer tools to stay within context
    // Match explicit size suffix (qwen3.5:9b) or known small model names
    const KNOWN_SMALL = /^(llama3\.2|llama3\.2:|phi3|phi3:|gemma2:2b|gemma2:7b|gemma3:4b|qwen2\.5:|qwen3:|mistral(?!-nemo)(?!-large)(?::|\b))/i;
    const hasSizeSuffix = model && /[:\-]([0-9]+)b/i.test(model) && parseInt(RegExp.$1, 10) <= 12;
    const ollamaSmall = hasSizeSuffix || KNOWN_SMALL.test(model || '');
    const OLLAMA_TOOL_LIMIT = ollamaSmall ? 48 : 128;
    const needsTrim = ['openai', 'deepseek', 'xai', 'mistral', 'groq', 'together'].includes(provider)
      || (!['anthropic', 'minimax', 'google', 'ollama'].includes(provider));
    if (needsTrim && tools.length > OPENAI_TOOL_LIMIT) {
      tools = this._trimToolsToLimit(tools, OPENAI_TOOL_LIMIT);
    }
    if (provider === 'ollama' && tools.length > OLLAMA_TOOL_LIMIT) {
      tools = this._trimToolsToLimit(tools, OLLAMA_TOOL_LIMIT);
    }

    switch (provider) {
      case 'anthropic':
      case 'minimax':
        return this._toAnthropicTools(tools);
      case 'openai':
      case 'deepseek':
      case 'xai':
      case 'mistral':
      case 'groq':
      case 'together':
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

  /**
   * Trim tools to a max count by dropping lower-priority tools.
   * Priority: core tools first, then enterprise/niche tools dropped from the end.
   */
  _trimToolsToLimit(tools, limit) {
    // Low-priority tools that can be dropped when hitting provider limits.
    // Order matters: first items get dropped first.
    const LOW_PRIORITY = new Set([
      // Enterprise integrations — most users won't have these configured
      'jira_search', 'jira_get_issue', 'jira_create_issue', 'jira_update_status', 'jira_add_comment',
      'linear_list_issues', 'linear_create_issue', 'linear_update_issue',
      'notion_search', 'notion_read_page', 'notion_create_page', 'notion_append_block',
      'slack_send', 'slack_send_blocks', 'slack_search',
      'teams_send', 'teams_send_card',
      'github_list_repos', 'github_list_issues', 'github_list_prs',
      'github_create_issue', 'github_create_pr', 'github_get_file', 'github_search_code', 'github_comment',
      'db_list_connections', 'db_add_connection', 'db_test_connection', 'db_schema', 'db_describe', 'db_query',
      // Google connectors (need OAuth setup)
      'connector_drive_search', 'connector_drive_read', 'connector_gmail_search', 'connector_gmail_read', 'connector_calendar_events',
      // Legacy/specialized
      'excel_vba_run', 'excel_vba_list',
      'pptx_generate_content', 'pptx_build', 'pptx_list_themes', 'pptx_list_slide_types',
      // Workflow/orchestration/scheduler
      'workflow_save', 'workflow_run', 'workflow_list', 'workflow_delete', 'workflow_export', 'workflow_import',
      'schedule_create', 'schedule_list', 'schedule_delete', 'schedule_enable', 'schedule_disable', 'schedule_run_now',
      'agent_spawn', 'agent_fanout', 'agent_map', 'agent_reduce',
      // Excel Master — less common tools
      'excel_list_templates', 'excel_list_themes', 'excel_row_col_op', 'excel_sheet_op',
      'excel_add_feature', 'excel_change_theme', 'excel_redo',
      // Presentation editing — specialized
      'pptx_edit_move_slide', 'pptx_edit_rename_section', 'pptx_edit_add_section',
      'pptx_edit_regenerate', 'pptx_edit_set_theme',
      // Social media — specialized
      'social_reply', 'social_create_post', 'social_read_notifications', 'social_get_context',
      // Office — specialized
      'office_dashboard_xlsx', 'office_validate_dashboard', 'office_csv_to_xlsx',
      'office_search_docx', 'office_search_docxs',
      // Skill management
      'skill_update', 'skill_rollback', 'skill_history',
    ]);

    const core = [];
    const low = [];
    for (const t of tools) {
      if (LOW_PRIORITY.has(t.name)) {
        low.push(t);
      } else {
        core.push(t);
      }
    }

    // Keep all core tools, then fill remaining slots with low-priority
    const remaining = limit - core.length;
    if (remaining > 0) {
      return [...core, ...low.slice(0, remaining)];
    }
    return core.slice(0, limit);
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
          description: this._sanitizeOllamaDesc(schema?.description || t.description),
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
      let desc = val.type === 'array'
        ? `${val.description || key} (pass as JSON array string)`
        : val.type === 'object'
        ? `${val.description || key} (pass as JSON object string)`
        : val.description || key;
      // Strip literal { } from descriptions — Ollama's parser chokes on them
      desc = desc.replace(/[{}]/g, '');
      result[key] = { type: simpleType, description: desc };
    }
    return result;
  }

  /** Sanitize tool description for Ollama (strip braces that break JSON parsing) */
  _sanitizeOllamaDesc(desc) {
    if (!desc) return '';
    return desc.replace(/[{}]/g, '');
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
