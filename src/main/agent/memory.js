const path = require('path');
const fs = require('fs');

class MemorySystem {
  constructor(userDataPath) {
    this.dbPath = path.join(userDataPath, 'memory.json');
    this.shortTerm = []; // Current session conversation context
    this.longTerm = []; // Persistent across sessions
    this.maxShortTerm = 50; // Rolling window
  }

  async initialize() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const data = JSON.parse(raw);
        this.longTerm = data.longTerm || [];
      }
    } catch (err) {
      console.error('[Memory] Failed to load:', err.message);
      this.longTerm = [];
    }
  }

  addToShortTerm(entry) {
    this.shortTerm.push({
      ...entry,
      id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });

    // Keep rolling window
    if (this.shortTerm.length > this.maxShortTerm) {
      // Move overflow to long-term summary
      const overflow = this.shortTerm.splice(0, this.shortTerm.length - this.maxShortTerm);
      const summary = this.summarizeEntries(overflow);
      if (summary) {
        this.longTerm.push({
          id: `lt_${Date.now()}`,
          type: 'session_summary',
          summary,
          timestamp: Date.now(),
        });
        this.persist();
      }
    }
  }

  async addToLongTerm(entry) {
    this.longTerm.push({
      ...entry,
      id: `lt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
    this.persist();
  }

  search(query, limit = 5) {
    if (!query) return [];
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter((t) => t.length > 2);

    // Score each long-term memory by keyword overlap
    const scored = this.longTerm
      .map((entry) => {
        const text = JSON.stringify(entry).toLowerCase();
        let score = 0;
        for (const token of queryTokens) {
          if (text.includes(token)) score++;
        }
        return { entry, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((s) => s.entry);
  }

  getShortTermContext() {
    return [...this.shortTerm];
  }

  getRecentHistory(limit = 20) {
    return this.longTerm
      .filter((e) => e.type === 'task')
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);
  }

  summarizeEntries(entries) {
    const messages = entries
      .filter((e) => e.content)
      .map((e) => `[${e.role}] ${e.content.slice(0, 200)}`)
      .join('\n');
    return messages || null;
  }

  persist() {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.dbPath,
        JSON.stringify({ longTerm: this.longTerm }, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('[Memory] Failed to persist:', err.message);
    }
  }

  close() {
    this.persist();
  }
}

module.exports = { MemorySystem };
