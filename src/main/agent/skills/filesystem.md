# Filesystem Tools Skill Guide

Last verified: 2026-04-06

13 tools for reading, writing, searching, organizing, and managing files and directories. All tools use absolute paths (or `~`-prefixed paths which resolve to the user's home directory). Protected system directories (`/System`, `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin`) are blocked.

---

## Tool Reference

### Reading & Inspection

| Tool | Permission | Description |
|------|-----------|-------------|
| `fs_read` | safe | Read file contents (text or binary). Auto-extracts PDF, DOCX, XLSX, PPTX, CSV. Falls back to OCR for scanned PDFs. If pointed at a directory, returns a listing. |
| `fs_list` | safe | List files and subdirectories with full paths, sizes, and types. Supports recursive listing. |
| `fs_tree` | safe | Visual tree view of a directory hierarchy with indentation and file sizes. |
| `fs_info` | safe | Detailed metadata: size, permissions (octal), created/modified/accessed dates, item count for dirs. |
| `fs_search` | safe | Glob-based file search with optional content grep. Returns absolute paths. |
| `fs_diff` | safe | Unified diff of a file vs its pre-modification snapshot from this session. |

### Writing & Mutation

| Tool | Permission | Description |
|------|-----------|-------------|
| `fs_write` | sensitive | Write or append to a file. Creates parent directories automatically. Takes a snapshot before writing. |
| `fs_edit` | sensitive | Find-and-replace within a file. First or all occurrences. Takes a snapshot before editing. |
| `fs_mkdir` | sensitive | Create a directory (and all parent directories). |
| `fs_undo` | sensitive | Restore a file to its snapshot from before the last write/edit/delete in this session. |

### Moving & Deleting

| Tool | Permission | Description |
|------|-----------|-------------|
| `fs_move` | dangerous | Move or rename files/directories. Supports glob patterns in source. Cross-device fallback via copy+delete. |
| `fs_delete` | dangerous | Delete a file or directory. Requires `recursive: true` for directories. Takes a snapshot of files before deleting. |
| `fs_organize` | dangerous | Sort files in a directory into category subfolders by extension. Only moves FILES, never subdirectories. |

---

## Parameter Reference

### fs_read

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to file or directory. `~` expands to home. |
| `encoding` | string | no | `"utf-8"` | File encoding. Change for non-UTF-8 text files. |
| `offset` | number | no | - | Starting line number (1-indexed). Only applies to text files. |
| `limit` | number | no | - | Maximum number of lines to read from `offset`. |

Binary formats auto-detected by extension: `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.pptx`, `.ppt`, `.rtf`, `.odt`, `.ods`, `.odp`, `.pages`, `.numbers`, `.key`, `.csv`, `.tsv`.

Max file size: 10 MB.

### fs_write

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path for the file. Parent dirs created automatically. |
| `content` | string | yes | - | Text content to write. |
| `append` | boolean | no | `false` | If true, append to existing content instead of overwriting. |

### fs_edit

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the file. |
| `find` | string | yes | - | Exact text to search for (literal string match, not regex). |
| `replace` | string | yes | - | Replacement text. Use `""` to delete the found text. |
| `all` | boolean | no | `false` | If true, replace ALL occurrences. If false, replace only the first. |

### fs_list

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Directory path to list. |
| `recursive` | boolean | no | `false` | Include subdirectory contents. |
| `maxDepth` | number | no | `3` | Max recursion depth (only when `recursive: true`). |
| `showHidden` | boolean | no | `false` | Include files starting with `.` |

Returns JSON array of objects: `{name, path, type, size, modified}`. Caps at 200 entries when recursive.

### fs_search

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `pattern` | string | yes | - | Glob pattern, e.g. `"**/*.pdf"`, `"*.txt"`, `"src/**/*.js"`. |
| `cwd` | string | yes | - | Root directory to search from. |
| `maxResults` | number | no | `50` | Max number of results. |
| `contentMatch` | string | no | - | Only return files whose content contains this string (case-insensitive). Max 2 MB per file. |
| `maxDepth` | number | no | `15` | How deep to recurse into subdirectories. |
| `dot` | boolean | no | `false` | Include hidden files/directories. |

### fs_delete

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to file or directory. |
| `recursive` | boolean | no | `false` | Must be `true` to delete directories. |

### fs_move

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `source` | string | yes | - | Source path or glob pattern (e.g. `~/Downloads/*.jpg`). |
| `destination` | string | yes | - | Destination path or directory. |

### fs_mkdir

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path for the new directory. Creates parents recursively. |

### fs_tree

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Root directory for the tree view. |
| `maxDepth` | number | no | `3` | Max depth to display. |
| `showHidden` | boolean | no | `false` | Include hidden files. |

Max 300 entries before truncation.

### fs_info

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to file or directory. |

Returns JSON: `{path, type, size, sizeHuman, created, modified, accessed, permissions, itemCount}`.

### fs_organize

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Directory to organize (e.g. `~/Downloads`). |
| `dryRun` | boolean | no | `false` | Preview the plan without moving anything. |
| `othersFolder` | string | no | `"Others"` | Name for the catch-all folder for unrecognized extensions. |
| `customRules` | object | no | - | Override or extend extension-to-category mapping. E.g. `{".log": "Logs", ".conf": "Config"}`. |

Default categories: Images, Videos, Audio, Documents, Spreadsheets, Presentations, Code, Archives, Applications, Fonts, Others.

### fs_undo

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the file to restore. |

### fs_diff

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the file to diff. |

---

## Procedure: Read a File

1. Call `fs_read` with the absolute path.
2. For text files, use `offset` and `limit` to read specific line ranges from large files.
3. For binary documents (PDF, DOCX, XLSX, PPTX), just call `fs_read` with the path -- extraction is automatic.
4. If `fs_read` is pointed at a directory, it returns a listing of non-hidden children instead of erroring.

```
fs_read({ path: "~/Documents/report.pdf" })
fs_read({ path: "~/src/app.js", offset: 50, limit: 20 })
```

---

## Procedure: Search for Files

**By filename pattern (glob):**

```
fs_search({ pattern: "**/*.pdf", cwd: "~/Documents" })
fs_search({ pattern: "**/*.{jpg,png,gif}", cwd: "~/Desktop" })
fs_search({ pattern: "**/README.md", cwd: "~/Projects", maxDepth: 10 })
```

**By file content (grep):**

```
fs_search({ pattern: "**/*.js", cwd: "~/project", contentMatch: "TODO" })
```

This reads each matching file (up to 2 MB) and filters by case-insensitive string match.

**Choosing between fs_search vs fs_list:**
- `fs_search` uses glob patterns and can search deeply (maxDepth 15). Best for finding specific files by name or extension across a directory tree.
- `fs_list` is a flat or shallow recursive listing. Best for browsing a directory's contents and seeing sizes/dates. Returns structured JSON.

---

## Procedure: Explore a Directory

**Quick overview (tree view):**

```
fs_tree({ path: "~/Projects/my-app", maxDepth: 2 })
```

Returns an indented visual tree with file sizes. Good for understanding structure at a glance. Limited to 300 entries.

**Detailed listing (JSON with metadata):**

```
fs_list({ path: "~/Desktop", recursive: true, maxDepth: 2 })
```

Returns JSON array with name, path, type, size, and modification date for each entry.

**Choosing between fs_tree vs fs_list:**
- `fs_tree` produces a human-readable indented tree. Good for communicating structure to the user.
- `fs_list` produces JSON with full metadata (size, dates, types). Good for programmatic analysis or when you need modification dates.

---

## Procedure: Edit a File

**Targeted find-and-replace (preferred for small changes):**

```
fs_edit({ path: "~/config.json", find: '"debug": false', replace: '"debug": true' })
```

**Replace all occurrences:**

```
fs_edit({ path: "~/src/app.js", find: "oldFunctionName", replace: "newFunctionName", all: true })
```

**Deleting text (replace with empty string):**

```
fs_edit({ path: "~/notes.txt", find: "DELETE THIS LINE\n", replace: "" })
```

**Full file rewrite (when changes are extensive):**

```
fs_write({ path: "~/config.json", content: '{ "debug": true, "port": 3000 }' })
```

**Appending to a file:**

```
fs_write({ path: "~/log.txt", content: "\nNew log entry", append: true })
```

---

## Procedure: Organize a Directory

1. Always preview first with `dryRun: true`:

```
fs_organize({ path: "~/Downloads", dryRun: true })
```

2. Review the plan. Then execute:

```
fs_organize({ path: "~/Downloads" })
```

3. For custom categories, use `customRules`:

```
fs_organize({
  path: "~/Downloads",
  customRules: { ".log": "Logs", ".conf": "Config", ".env": "Config" }
})
```

---

## Procedure: Review and Undo Changes

**See what changed:**

```
fs_diff({ path: "~/config.json" })
```

Returns a unified diff (like `diff -u`) comparing the snapshot taken before the last mutation against the current file.

**Undo the last change:**

```
fs_undo({ path: "~/config.json" })
```

Restores the file to the snapshot from before the most recent `fs_write`, `fs_edit`, or `fs_delete`.

---

## Procedure: Move and Rename Files

**Rename a single file:**

```
fs_move({ source: "~/Desktop/old-name.txt", destination: "~/Desktop/new-name.txt" })
```

**Move a file into a directory:**

```
fs_move({ source: "~/Desktop/photo.jpg", destination: "~/Pictures" })
```

If the destination is an existing directory, the file is moved INTO it (preserving its name).

**Batch move with glob:**

```
fs_move({ source: "~/Downloads/*.pdf", destination: "~/Documents/PDFs" })
```

The destination directory is created if it does not exist.

---

## Known Issues and Gotchas

### fs_organize only moves FILES, never directories
It reads only direct children of the target directory. Existing subdirectories are left untouched. If a directory has only subdirectories (no loose files), it returns "No files to organize."

### fs_organize skips hidden files
Files starting with `.` are excluded from organization. This is intentional.

### fs_organize default category mapping
The extension-to-category map is hardcoded. Note `.ts` maps to `Videos` (MPEG transport stream), not `Code`. If organizing a code project, override with `customRules: {".ts": "Code"}`.

### fs_search glob patterns must be relative
The `pattern` parameter is relative to `cwd`. Do NOT put absolute paths in the pattern. Example: use `pattern: "**/*.pdf"` with `cwd: "~/Documents"`, not `pattern: "/Users/alice/Documents/**/*.pdf"`.

### fs_search contentMatch reads files up to 2 MB
Files larger than 2 MB are silently skipped during content matching. For searching inside large files, use `system_exec` with `grep`.

### fs_edit uses literal string matching, not regex
The `find` parameter is an exact substring match. If the text is not found, the tool throws "Text not found in file." Make sure whitespace and line endings match exactly. Read the file first with `fs_read` to get the exact text.

### fs_edit with all: false replaces only the FIRST occurrence
When `all` is not set (or false), only the first match is replaced. If no changes result (the find/replace produces identical content), it throws "No changes made."

### fs_write overwrites by default
Without `append: true`, `fs_write` completely replaces the file. Use `fs_edit` for targeted changes.

### fs_read on binary files
Binary documents (PDF, DOCX, XLSX, PPTX, etc.) are auto-extracted to text. The tool uses a chain of strategies (native Node libraries first, then shell commands, then OCR for scanned PDFs). If all strategies fail, it falls back to `strings` command output.

### fs_read max file size is 10 MB
Files larger than 10 MB are rejected. For large text files, use `offset` and `limit` to read portions.

### fs_undo and fs_diff are session-scoped
Snapshots only exist for the current session. They are stored in `~/.cache/opendesktop/snapshots/`. Only the last 3 snapshots per file are kept. If no snapshot exists for a path, both tools throw an error.

### fs_undo is destructive and pops the snapshot
Calling `fs_undo` restores the file AND removes that snapshot from the stack. You cannot undo an undo. Use `fs_diff` first to review before undoing.

### fs_move cross-device fallback
`fs_move` first tries `rename` (fast, same volume). If that fails (cross-device), it falls back to copy + delete for files. Cross-device directory moves will fail -- use `system_exec` with `cp -r` and `rm -rf` instead.

### fs_delete takes snapshots for files only
A snapshot is created before deleting a file, so `fs_undo` can restore it. Directory deletion with `recursive: true` does NOT snapshot the full directory tree -- it is permanent.

### Path resolution
All tools resolve `~` to the user's home directory. Relative paths are resolved against `process.cwd()`. Always prefer absolute paths to avoid ambiguity.

### Protected system directories
Access to `/System`, `/Library/System`, `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin` is blocked (except paths under `.../local/`). Attempting to read, write, or delete in these directories throws "Access denied."

### fs_tree max entries
The tree view caps at 300 entries. Deeply nested or very large directories will be truncated with a "... truncated at 300 entries" message. Use `maxDepth` to control depth.

### fs_list max entries
Recursive listing caps at 200 entries. For deeper exploration, use `fs_search` or `fs_tree`.
