# GitHub Integration Skill Guide

Last verified: 2026-04-06

## Overview

8 tools for interacting with the GitHub REST API via `@octokit/rest`. All API calls
go through the authenticated Octokit client with automatic error handling for 401
(bad token), 403 (rate limit / permissions), and 404 (not found).

---

## Setup

1. Generate a GitHub Personal Access Token (classic or fine-grained) at
   https://github.com/settings/tokens
2. Required scopes (classic): `repo`, `read:org`, `read:user`
   Fine-grained: Repository access for target repos with Issues (read/write),
   Pull Requests (read/write), Contents (read)
3. In OpenDesktop: **Settings > Integrations > Add Key**
   - Key name: `github`
   - Value: the token string (e.g. `ghp_xxxxxxxxxxxx`)
4. Test with: `github_list_repos` using your own username as `owner`

If the token is missing or invalid, every tool returns a clear error:
- Missing: "GitHub token not configured. Add it in Settings > Integrations with key github."
- Expired/invalid: "GitHub authentication failed. Check your token in Settings > Integrations."
- Rate limited: "GitHub rate limit or permission error: ..."

---

## Tool Reference

| Tool | Permission | Required Params | Optional Params | Returns |
|------|-----------|----------------|-----------------|---------|
| `github_list_repos` | safe | `owner` | `type` (all/owner/member), `sort` (created/updated/pushed/full_name), `limit` (default 30, max 100) | Array of repos with name, fullName, description, private, language, stars, forks, updatedAt, url |
| `github_list_issues` | safe | `owner`, `repo` | `state` (open/closed/all), `label`, `limit` (default 20, max 100) | Array of issues with number, title, state, labels, assignee, author, createdAt, updatedAt, url, body (first 500 chars) |
| `github_create_issue` | sensitive | `owner`, `repo`, `title` | `body` (markdown), `labels` (array of strings), `assignees` (array of usernames) | `{ ok, number, url, title }` |
| `github_list_prs` | safe | `owner`, `repo` | `state` (open/closed/all), `limit` (default 20, max 100) | Array of PRs with number, title, state, author, head, base, createdAt, updatedAt, url, draft |
| `github_create_pr` | sensitive | `owner`, `repo`, `title`, `head`, `base` | `body` (markdown), `draft` (boolean) | `{ ok, number, url, state }` |
| `github_get_file` | safe | `owner`, `repo`, `filePath` | `ref` (branch/tag/SHA) | `{ path, sha, size, content }` (content truncated to 50,000 chars) |
| `github_search_code` | safe | `query` | `limit` (default 10, max 30) | `{ query, total, results[] }` where each result has name, path, repository, url, sha |
| `github_comment` | sensitive | `owner`, `repo`, `issueNumber`, `body` | -- | `{ ok, id, url }` |

**Permission levels**: `safe` = read-only, no approval needed. `sensitive` = creates/modifies resources, requires user approval.

---

## Procedure: List Repositories for a User or Org

1. Call `github_list_repos` with `owner` set to the username or org name.
2. Optionally filter with `type: "owner"` (only repos they own) or sort with `sort: "stars"`.
3. The response includes star count, language, and last updated date for each repo.

```
github_list_repos({ owner: "octocat", sort: "updated", limit: 10 })
```

---

## Procedure: Browse and Triage Issues

### List open issues
```
github_list_issues({ owner: "myorg", repo: "backend", state: "open" })
```

### Filter by label
```
github_list_issues({ owner: "myorg", repo: "backend", label: "bug", limit: 50 })
```

### Get full details of a specific issue
Use `github_list_issues` to find the issue number, then read the body field (first 500 chars are included). For the full body, use `github_get_file` on `.github/ISSUE_TEMPLATE` or check via `github_comment` history.

### Create a new issue
```
github_create_issue({
  owner: "myorg",
  repo: "backend",
  title: "Fix login redirect on mobile",
  body: "## Description\nAfter login on mobile Safari, users are redirected to /dashboard instead of the deep link.\n\n## Steps to reproduce\n1. Open app link on iOS\n2. Sign in\n3. Observe redirect",
  labels: ["bug", "mobile"],
  assignees: ["janedoe"]
})
```

### Add a comment to an issue
```
github_comment({
  owner: "myorg",
  repo: "backend",
  issueNumber: 42,
  body: "Confirmed this on iOS 18.2 Safari. The redirect logic in `auth.js` line 87 doesn't account for deep links."
})
```

---

## Procedure: Review Pull Requests

### List open PRs
```
github_list_prs({ owner: "myorg", repo: "frontend", state: "open" })
```

The response includes `head` (source branch) and `base` (target branch) plus `draft` status.

### Review a PR's changed files
1. List PRs to find the PR number.
2. Read specific files from the head branch:
   ```
   github_get_file({ owner: "myorg", repo: "frontend", filePath: "src/App.jsx", ref: "feature/new-nav" })
   ```
3. Compare with the base branch version:
   ```
   github_get_file({ owner: "myorg", repo: "frontend", filePath: "src/App.jsx", ref: "main" })
   ```
4. Post review comments:
   ```
   github_comment({ owner: "myorg", repo: "frontend", issueNumber: 15, body: "LGTM. The new nav component handles edge cases well." })
   ```

Note: `github_comment` works for both issues and PRs because GitHub's API uses the same endpoint (issues and PRs share number spaces within a repo).

---

## Procedure: Create a Pull Request

1. Identify the source branch (`head`) and target branch (`base`).
2. Call `github_create_pr`:
   ```
   github_create_pr({
     owner: "myorg",
     repo: "backend",
     title: "Add rate limiting to /api/search",
     head: "feature/rate-limit",
     base: "main",
     body: "## Changes\n- Added sliding-window rate limiter\n- 100 req/min per API key\n- Returns 429 with Retry-After header\n\n## Testing\n- Unit tests added\n- Load tested with k6",
     draft: false
   })
   ```
3. The response includes the PR URL for sharing.

---

## Procedure: Search Code Across GitHub

The `github_search_code` tool uses GitHub's code search syntax.

### Basic search
```
github_search_code({ query: "useState useEffect filename:App.jsx" })
```

### Scoped to a repo
```
github_search_code({ query: "repo:myorg/backend rate_limit language:python" })
```

### Scoped to an org
```
github_search_code({ query: "org:myorg database migration" })
```

### Search by file extension
```
github_search_code({ query: "org:myorg extension:yml docker-compose" })
```

Each result includes the file name, path, repository full name, and a direct URL to view on GitHub.

---

## Procedure: Read a File from a Repository

```
github_get_file({ owner: "myorg", repo: "backend", filePath: "README.md" })
```

### Read from a specific branch or tag
```
github_get_file({ owner: "myorg", repo: "backend", filePath: "config/prod.json", ref: "v2.1.0" })
```

### Read from a specific commit
```
github_get_file({ owner: "myorg", repo: "backend", filePath: "src/server.js", ref: "abc1234" })
```

The content is base64-decoded automatically. Files larger than 50,000 characters are truncated.

---

## Common Workflows

### Workflow: Bug report to fix
1. `github_list_issues` -- find the bug report
2. `github_get_file` -- read the relevant source file
3. `github_comment` -- post analysis on the issue
4. `github_create_pr` -- open a PR with the fix (assuming code was pushed externally)
5. `github_comment` -- link the PR in the issue

### Workflow: Sprint review
1. `github_list_prs` with `state: "closed"` -- see merged PRs
2. `github_list_issues` with `state: "closed"` -- see resolved issues
3. Summarize the work done in the sprint

### Workflow: Codebase exploration
1. `github_list_repos` -- see what repos exist
2. `github_get_file` with `filePath: "README.md"` -- read the repo overview
3. `github_search_code` -- find specific patterns or functions
4. `github_get_file` -- read individual source files

---

## Known Issues & Gotchas

- **Rate limits**: GitHub allows 5,000 requests/hour for authenticated users. The tools do not
  implement pagination, so repeated calls with high `limit` values consume quota quickly.
- **`labels` and `assignees` in `github_create_issue`**: Accept both a single string and an array.
  The code normalizes a single string to `[string]` automatically.
- **`github_comment` uses `issueNumber`**: Despite the param name, this works for PRs too. GitHub
  treats PRs as a special type of issue internally.
- **File content truncation**: `github_get_file` returns at most 50,000 characters. For very large
  files, the content will be cut off silently.
- **Search rate limit**: GitHub code search has a separate, stricter rate limit (10 requests/minute
  for authenticated users). Space out `github_search_code` calls if doing batch searches.
- **Organization repos**: `github_list_repos` uses `listForUser`. For org repos, pass the org name
  as `owner` -- it works the same way via the Octokit API.
- **No pagination support**: All list tools return at most one page of results (max 100 items).
  If you need more, call with different sort/filter parameters to surface different subsets.
- **PR creation requires an existing branch**: `github_create_pr` does not push code. The `head`
  branch must already exist on the remote with commits ahead of `base`.
