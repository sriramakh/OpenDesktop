const { FilesystemTools } = require('./filesystem');
const { AppControlTools } = require('./app-control');
const { BrowserTools } = require('./browser');
const { SearchFetchTools } = require('./search-fetch');
const { SystemTools } = require('./system');
const { LLMTools } = require('./llm-tools');

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
    // Filesystem tools
    for (const tool of FilesystemTools) {
      this.register(tool);
    }

    // App control tools
    for (const tool of AppControlTools) {
      this.register(tool);
    }

    // Browser tools
    for (const tool of BrowserTools) {
      this.register(tool);
    }

    // Search & fetch tools
    for (const tool of SearchFetchTools) {
      this.register(tool);
    }

    // System tools
    for (const tool of SystemTools) {
      this.register(tool);
    }

    // LLM tools
    for (const tool of LLMTools) {
      this.register(tool);
    }

    console.log(`[ToolRegistry] Registered ${this.tools.size} tools`);
  }
}

module.exports = { ToolRegistry };
