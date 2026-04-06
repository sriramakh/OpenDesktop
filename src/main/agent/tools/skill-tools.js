/**
 * Skill Management Tools
 *
 * Provides safe, versioned skill file updates with automatic backup and rollback.
 *
 * Architecture:
 *  - Skill files live in src/main/agent/skills/*.md
 *  - Before any update, the current version is backed up to skills/.history/
 *  - Backups are timestamped: {filename}.{timestamp}.md
 *  - Rollback restores the most recent backup
 *  - skill_read is a convenience shortcut (agent can also use fs_read)
 *
 * Safety rules enforced:
 *  1. Only files inside the skills/ directory can be modified
 *  2. Every update creates a backup FIRST
 *  3. Updates are APPEND-ONLY by default (adds a new section, doesn't replace)
 *  4. Full rewrites require explicit mode="replace"
 *  5. All updates are tagged with [Learned: date] and a reason
 */

'use strict';

const fsSync = require('fs');
const fsp    = require('fs/promises');
const path   = require('path');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SKILLS_DIR  = path.join(__dirname, '..', 'skills');
const HISTORY_DIR = path.join(SKILLS_DIR, '.history');

function resolveSkillPath(name) {
  // Accept "social-media-instagram" or "social-media-instagram.md" or full path
  if (name.includes('/') || name.includes('\\')) {
    // Full or relative path — must still be inside skills dir
    const resolved = path.resolve(name);
    if (!resolved.startsWith(SKILLS_DIR)) {
      throw new Error(`Skill files must be inside ${SKILLS_DIR}. Got: ${resolved}`);
    }
    return resolved;
  }
  const filename = name.endsWith('.md') ? name : `${name}.md`;
  return path.join(SKILLS_DIR, filename);
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

function ensureHistoryDir() {
  if (!fsSync.existsSync(HISTORY_DIR)) {
    fsSync.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function createBackup(skillPath) {
  if (!fsSync.existsSync(skillPath)) return null;
  ensureHistoryDir();
  const basename = path.basename(skillPath, '.md');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `${basename}.${timestamp}.md`;
  const backupPath = path.join(HISTORY_DIR, backupName);
  fsSync.copyFileSync(skillPath, backupPath);
  return backupPath;
}

function listBackups(skillPath) {
  ensureHistoryDir();
  const basename = path.basename(skillPath, '.md');
  const files = fsSync.readdirSync(HISTORY_DIR)
    .filter(f => f.startsWith(basename + '.') && f.endsWith('.md'))
    .sort()
    .reverse(); // newest first
  return files.map(f => ({
    file: f,
    path: path.join(HISTORY_DIR, f),
    timestamp: f.replace(basename + '.', '').replace('.md', '').replace(/-/g, (m, i) => i < 19 ? ['.', '.', 'T', ':', ':', '.'][Math.floor(i / 3) - 1] || '-' : '-'),
  }));
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const SKILL_TOOLS = [

  {
    name: 'skill_read',
    description: 'Read a skill file. Shortcut for fs_read on skill files. Use this BEFORE attempting any non-trivial task to check for existing procedures.',
    category: 'skills',
    permissionLevel: 'safe',
    params: ['name'],
    async execute({ name }) {
      if (!name) {
        // List all available skills
        const files = fsSync.readdirSync(SKILLS_DIR)
          .filter(f => f.endsWith('.md') && !f.startsWith('.'))
          .sort();
        return `Available skill files (${files.length}):\n${files.map(f => `  - ${f.replace('.md', '')}`).join('\n')}\n\nUse skill_read(name="<skill-name>") to read a specific skill.`;
      }
      const skillPath = resolveSkillPath(name);
      if (!fsSync.existsSync(skillPath)) {
        return `Skill file not found: ${name}. Use skill_read() with no args to list available skills.`;
      }
      return fsSync.readFileSync(skillPath, 'utf-8');
    },
  },

  {
    name: 'skill_update',
    description: 'Update a skill file with new learned procedures. Automatically backs up the current version first. Use mode="append" (default) to add a new section, or mode="replace" to rewrite a specific section. ONLY update after verifying the new procedure works.',
    category: 'skills',
    permissionLevel: 'sensitive',
    params: ['name', 'section', 'content', 'reason', 'mode'],
    async execute({ name, section, content, reason, mode = 'append' }) {
      if (!name) throw new Error('name is required (e.g. "social-media-instagram")');
      if (!content) throw new Error('content is required — the new procedure or update to add');
      if (!reason) throw new Error('reason is required — explain what you learned and WHY this update is needed');

      const skillPath = resolveSkillPath(name);
      const exists = fsSync.existsSync(skillPath);
      const date = new Date().toISOString().slice(0, 10);

      // Create backup of current version
      let backupPath = null;
      if (exists) {
        backupPath = createBackup(skillPath);
      }

      const taggedContent = `\n\n${section ? `## ${section}` : ''}\n[Learned: ${date}] ${reason}\n\n${content}`;

      if (mode === 'replace' && section && exists) {
        // Replace a specific section
        const current = fsSync.readFileSync(skillPath, 'utf-8');
        const sectionHeader = `## ${section}`;
        const sectionIdx = current.indexOf(sectionHeader);
        if (sectionIdx === -1) {
          // Section doesn't exist — append instead
          fsSync.writeFileSync(skillPath, current + taggedContent, 'utf-8');
        } else {
          // Find the next ## header or end of file
          const afterHeader = current.indexOf('\n## ', sectionIdx + sectionHeader.length);
          const before = current.slice(0, sectionIdx);
          const after = afterHeader !== -1 ? current.slice(afterHeader) : '';
          const newSection = `## ${section}\n[Learned: ${date}] ${reason}\n\n${content}\n`;
          fsSync.writeFileSync(skillPath, before + newSection + after, 'utf-8');
        }
      } else if (mode === 'append' || !exists) {
        // Append to existing file or create new
        if (exists) {
          const current = fsSync.readFileSync(skillPath, 'utf-8');
          fsSync.writeFileSync(skillPath, current + taggedContent, 'utf-8');
        } else {
          const header = `# ${name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — Learned Procedures\n`;
          fsSync.writeFileSync(skillPath, header + taggedContent, 'utf-8');
        }
      } else {
        throw new Error(`Invalid mode: ${mode}. Use "append" or "replace".`);
      }

      const backups = listBackups(skillPath);
      return JSON.stringify({
        ok: true,
        skill: name,
        mode,
        section: section || '(appended)',
        backupCreated: backupPath ? path.basename(backupPath) : null,
        totalBackups: backups.length,
        message: `Skill updated. ${backupPath ? 'Previous version backed up.' : 'New skill file created.'} Reason: ${reason}`,
      }, null, 2);
    },
  },

  {
    name: 'skill_rollback',
    description: 'Rollback a skill file to its previous version. Use this if a skill update broke a working procedure.',
    category: 'skills',
    permissionLevel: 'sensitive',
    params: ['name', 'version'],
    async execute({ name, version }) {
      if (!name) throw new Error('name is required');
      const skillPath = resolveSkillPath(name);
      const backups = listBackups(skillPath);

      if (backups.length === 0) {
        return `No backups found for "${name}". Cannot rollback.`;
      }

      if (version === 'list' || version === 'show') {
        return `Backups for "${name}" (${backups.length} versions):\n${backups.map((b, i) => `  ${i}: ${b.file}`).join('\n')}\n\nUse skill_rollback(name="${name}", version=0) to restore the most recent backup.`;
      }

      const idx = version != null ? parseInt(version, 10) : 0;
      if (idx < 0 || idx >= backups.length) {
        return `Invalid version ${idx}. Available: 0-${backups.length - 1} (0 = most recent backup).`;
      }

      const backup = backups[idx];

      // Backup the CURRENT version before rollback (safety net)
      createBackup(skillPath);

      // Restore
      fsSync.copyFileSync(backup.path, skillPath);

      return JSON.stringify({
        ok: true,
        skill: name,
        restoredFrom: backup.file,
        currentBackups: listBackups(skillPath).length,
        message: `Rolled back "${name}" to ${backup.file}. Current version was also backed up before rollback.`,
      }, null, 2);
    },
  },

  {
    name: 'skill_history',
    description: 'View the backup history of a skill file. Shows all saved versions with timestamps.',
    category: 'skills',
    permissionLevel: 'safe',
    params: ['name'],
    async execute({ name }) {
      if (!name) {
        // Show all skills with backup counts
        ensureHistoryDir();
        const skills = fsSync.readdirSync(SKILLS_DIR)
          .filter(f => f.endsWith('.md') && !f.startsWith('.'));
        const result = skills.map(f => {
          const backups = listBackups(path.join(SKILLS_DIR, f));
          return `  ${f.replace('.md', '').padEnd(30)} ${backups.length} backup(s)`;
        });
        return `Skill files and backup counts:\n${result.join('\n')}`;
      }
      const skillPath = resolveSkillPath(name);
      const backups = listBackups(skillPath);
      if (backups.length === 0) return `No backups for "${name}".`;
      return `Backup history for "${name}" (${backups.length} versions, newest first):\n${backups.map((b, i) => `  [${i}] ${b.file}`).join('\n')}`;
    },
  },
];

module.exports = { SKILL_TOOLS };
