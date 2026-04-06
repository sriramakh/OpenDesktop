# Skill Management Skill Guide

Use these 4 tools to read, update, rollback, and inspect the version history of
skill files. Skill files are markdown documents in `src/main/agent/skills/` that
contain learned procedures, workflows, and tool-specific knowledge.

---

## Tool Reference

| Tool | Purpose | Required Params | Optional Params | Permission |
|---|---|---|---|---|
| `skill_read` | Read a skill file or list all skills | -- | `name` | safe |
| `skill_update` | Update a skill with a new procedure | `name`, `content`, `reason` | `section`, `mode` | sensitive |
| `skill_rollback` | Restore a previous version | `name` | `version` | sensitive |
| `skill_history` | View backup history | -- | `name` | safe |

---

## Architecture

### File Location

All skill files live in:
```
src/main/agent/skills/*.md
```

### Backup Location

Before any update, the current version is copied to:
```
src/main/agent/skills/.history/{name}.{ISO-timestamp}.md
```

Timestamp format: `2026-04-03T14-30-00-000Z` (colons and dots replaced with dashes).

### Safety Constraints

1. Only files inside the `skills/` directory can be read or modified.
2. Every `skill_update` creates a backup of the current file FIRST.
3. Updates are append-only by default (mode="append").
4. Full section rewrites require explicit `mode="replace"`.
5. All updates are tagged with `[Learned: YYYY-MM-DD]` and a reason.
6. Path traversal is blocked -- paths outside the skills directory throw an error.

---

## Procedure: Read a Skill

### List All Available Skills

Call with no arguments:

```
skill_read({})
```

Returns:
```
Available skill files (11):
  - dashboard-review
  - excel-builder
  - excel-dashboard
  - google-connectors
  - llm-tools
  - presentation-builder
  - reminders
  - skill-management
  - social-media
  - social-media-instagram
  - summarize-content

Use skill_read(name="<skill-name>") to read a specific skill.
```

### Read a Specific Skill

```
skill_read({ name: "excel-dashboard" })
```

Accepts the name with or without `.md` extension. Returns the full file content.

If the file does not exist:
```
Skill file not found: nonexistent-skill. Use skill_read() with no args to list available skills.
```

### When to Read Skills

**ALWAYS read the relevant skill file before attempting a non-trivial task.** This
is the most important habit. Skill files contain exact procedures, selectors,
parameters, and gotchas that prevent wasted attempts.

---

## Procedure: Update a Skill

### CRITICAL SAFETY RULE

```
Test --> Succeed --> THEN Update
```

**NEVER update a skill file based on an approach that failed or is untested.**
Only record procedures that have been verified to work in the current session.

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes | -- | Skill name (e.g. "social-media-instagram") |
| `section` | string | no | -- | Section heading for the update (e.g. "Procedure: Upload Reel") |
| `content` | string | yes | -- | The new procedure content in markdown |
| `reason` | string | yes | -- | Why this update is needed |
| `mode` | enum | no | `"append"` | `"append"` adds a new section; `"replace"` overwrites an existing section |

### Mode: append (default)

Adds a new section to the end of the file. Use this when:
- Adding a brand new procedure
- Adding a new gotcha or tip
- The existing content should be preserved

```
skill_update({
  name: "social-media-instagram",
  section: "Procedure: Post Carousel",
  content: "1. Navigate to create page\n2. Click carousel option\n3. ...",
  reason: "Discovered carousel posting workflow that works reliably",
  mode: "append"
})
```

### Mode: replace

Replaces an existing section (matched by heading). Use this when:
- A procedure's steps have changed (e.g., a selector broke)
- An approach was replaced by a better one
- Information in the section is now incorrect

```
skill_update({
  name: "social-media-instagram",
  section: "Procedure: Read Feed",
  content: "Updated steps:\n1. Use new selector div[role='main']\n2. ...",
  reason: "Old selector div.feed-container no longer exists in Instagram's DOM",
  mode: "replace"
})
```

If the section heading does not exist when using `mode="replace"`, the content is
appended instead (graceful fallback).

### What Gets Written

Every update is automatically tagged:

```markdown
## Procedure: Post Carousel
[Learned: 2026-04-03] Discovered carousel posting workflow that works reliably

1. Navigate to create page
2. Click carousel option
3. ...
```

### Creating New Skill Files

If the named skill file does not exist, `skill_update` creates it with an
auto-generated header:

```markdown
# Social Media Instagram -- Learned Procedures

## Procedure: Post Carousel
[Learned: 2026-04-03] Discovered carousel posting workflow
...
```

### Response

```json
{
  "ok": true,
  "skill": "social-media-instagram",
  "mode": "append",
  "section": "Procedure: Post Carousel",
  "backupCreated": "social-media-instagram.2026-04-03T14-30-00-000Z.md",
  "totalBackups": 3,
  "message": "Skill updated. Previous version backed up. Reason: ..."
}
```

---

## Procedure: Rollback a Skill

Use this when a skill update introduced incorrect information or broke a working
procedure.

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes | -- | Skill name to rollback |
| `version` | string | no | `0` (most recent) | Version index, or `"list"` to see all backups |

### Step 1 -- List Available Backups

```
skill_rollback({ name: "social-media-instagram", version: "list" })
```

Returns:
```
Backups for "social-media-instagram" (3 versions):
  0: social-media-instagram.2026-04-03T14-30-00-000Z.md
  1: social-media-instagram.2026-04-02T10-15-00-000Z.md
  2: social-media-instagram.2026-04-01T09-00-00-000Z.md

Use skill_rollback(name="social-media-instagram", version=0) to restore the most recent backup.
```

Version 0 is always the most recent backup.

### Step 2 -- Restore a Version

```
skill_rollback({ name: "social-media-instagram", version: "0" })
```

**Important**: Before restoring, the tool backs up the CURRENT version first. This
means rollback is itself reversible -- you can rollback the rollback.

### Response

```json
{
  "ok": true,
  "skill": "social-media-instagram",
  "restoredFrom": "social-media-instagram.2026-04-03T14-30-00-000Z.md",
  "currentBackups": 4,
  "message": "Rolled back \"social-media-instagram\" to ... Current version was also backed up before rollback."
}
```

### When to Rollback

- A skill update recorded a procedure that turned out to be wrong.
- A replace-mode update accidentally removed important sections.
- The user reports that a previously working workflow is now broken.

---

## Procedure: View Skill History

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | no | -- | Skill name. Omit to see all skills with backup counts. |

### List All Skills with Backup Counts

```
skill_history({})
```

Returns:
```
Skill files and backup counts:
  dashboard-review               2 backup(s)
  excel-dashboard                5 backup(s)
  social-media-instagram         3 backup(s)
  summarize-content              0 backup(s)
```

### View History for One Skill

```
skill_history({ name: "excel-dashboard" })
```

Returns:
```
Backup history for "excel-dashboard" (5 versions, newest first):
  [0] excel-dashboard.2026-04-03T14-30-00-000Z.md
  [1] excel-dashboard.2026-04-02T10-15-00-000Z.md
  [2] excel-dashboard.2026-04-01T09-00-00-000Z.md
  [3] excel-dashboard.2026-03-28T16-45-00-000Z.md
  [4] excel-dashboard.2026-03-25T11-00-00-000Z.md
```

---

## The Update Workflow (Complete)

This is the full workflow for safely learning and recording a new procedure:

### 1. Read the Existing Skill

```
skill_read({ name: "social-media-instagram" })
```

Check if a procedure already exists for the task. If it does, follow it. Only
update if it fails or is missing.

### 2. Attempt the Task

Execute the task using the available tools. Pay close attention to what works:
exact tool names, parameter values, selectors, timing, order of operations.

### 3. Verify Success

Confirm the task completed successfully. Check the output. If it failed, do NOT
record the failed approach.

### 4. Record the Procedure

Only after verified success:

```
skill_update({
  name: "social-media-instagram",
  section: "Procedure: New Workflow Name",
  content: "Exact steps that worked...",
  reason: "Discovered this workflow works reliably after testing"
})
```

### 5. If the Update Was Wrong

If later attempts reveal the recorded procedure is incorrect:

```
skill_rollback({ name: "social-media-instagram" })
```

---

## Known Issues & Gotchas

1. **Path restriction**: All skill file paths must resolve inside `src/main/agent/skills/`. Attempting to read or write outside this directory throws: "Skill files must be inside {SKILLS_DIR}."

2. **Section matching for replace mode**: The `replace` mode matches sections by their `## Heading` text. If the section heading in the `section` parameter does not exactly match an existing heading, the content is appended instead of replacing. Headings are matched from `## {section}` to the next `## ` or end of file.

3. **Backup accumulation**: Every `skill_update` and every `skill_rollback` creates a backup. Over time, the `.history/` directory can accumulate many files. There is no automatic cleanup.

4. **Sensitive permission**: `skill_update` and `skill_rollback` require approval (permissionLevel: sensitive). The user will be prompted to approve these actions.

5. **New file auto-header**: When creating a new skill file, the name is converted to a title by replacing dashes with spaces and capitalizing words. For example, `"my-new-skill"` becomes `"# My New Skill -- Learned Procedures"`.

6. **Never update from failure**: This is the single most important rule. If a procedure failed, do NOT record it. Only record what has been verified to work. Recording failed approaches pollutes the skill file and causes future attempts to repeat the same mistakes.

7. **Append is the safe default**: When in doubt, use `mode="append"`. It preserves all existing content. Use `mode="replace"` only when you are certain the old section content is wrong.

8. **Read before every task**: Always call `skill_read` before starting a non-trivial task. The skill file may contain critical information (working selectors, parameter values, known pitfalls) that prevents wasted tool calls.

---

Last verified: 2026-04-06
