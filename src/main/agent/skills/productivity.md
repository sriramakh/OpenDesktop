# Productivity Tools Skill Guide (Jira + Linear + Notion)

Last verified: 2026-04-06

## Overview

12 tools across three platforms for project management and knowledge management.
All tools use native HTTPS requests (no SDK dependencies) via a shared `apiRequest` helper
with a 30-second timeout. Authentication tokens are stored in the KeyStore.

| Platform | Tools | Auth Keys Required |
|----------|-------|--------------------|
| Jira | 5 (search, get, create, update status, comment) | `jira_token`, `jira_email`, `jira_url` |
| Linear | 3 (list, create, update) | `linear_token` |
| Notion | 4 (search, read, create, append) | `notion_token` |

---

## Setup: Jira

1. Generate an API token at https://id.atlassian.com/manage-profile/security/api-tokens
2. In OpenDesktop: **Settings > Integrations > Add Key**, add three entries:
   - `jira_email` -- your Atlassian account email (e.g. `alice@company.com`)
   - `jira_token` -- the API token string
   - `jira_url` -- your Jira instance URL (e.g. `https://mycompany.atlassian.net`)
3. Authentication uses HTTP Basic: `base64(email:token)` in the Authorization header.
4. The API uses Jira REST API v3 (`/rest/api/3/...`).

If any of the three keys is missing, the tool returns:
- Missing email/token: "Jira not configured. Add jira_email and jira_token in Settings > Integrations."
- Missing URL: "jira_url not configured. Add it in Settings > Integrations."

## Setup: Linear

1. Generate a Personal API Key at https://linear.app/settings/api (under "Personal API keys")
2. In OpenDesktop: **Settings > Integrations > Add Key**:
   - `linear_token` -- the API key string (e.g. `lin_api_xxxxxxxxxxxx`)
3. All Linear tools use the GraphQL API at `https://api.linear.app/graphql`.
4. The token is sent as a plain `Authorization` header (not Bearer).

If missing: "Linear token not configured. Add linear_token in Settings > Integrations."

## Setup: Notion

1. Create an integration at https://www.notion.so/my-integrations
2. Copy the "Internal Integration Token" (starts with `ntn_` or `secret_`)
3. In OpenDesktop: **Settings > Integrations > Add Key**:
   - `notion_token` -- the integration token
4. **Critical**: Share pages/databases with the integration. In Notion, open the page >
   click "..." > "Add connections" > select your integration. The integration can only
   access pages explicitly shared with it.
5. The API uses Notion API version `2022-06-28`.

If missing: "Notion token not configured. Add notion_token in Settings > Integrations."

---

## Tool Reference: Jira (5 tools)

| Tool | Permission | Required Params | Optional Params | Returns |
|------|-----------|----------------|-----------------|---------|
| `jira_search` | safe | `jql` | `maxResults` (default 20, max 50) | `{ total, returned, issues[] }` with key, summary, status, assignee, priority, type, updated |
| `jira_get_issue` | safe | `issueKey` | -- | Single issue object with key, summary, status, assignee, priority, type, created, updated, labels |
| `jira_create_issue` | sensitive | `projectKey`, `summary` | `issueType` (Task/Bug/Story/Epic, default Task), `description`, `priority` (Highest/High/Medium/Low/Lowest), `labels` (string or array) | `{ ok, key, id, url }` |
| `jira_update_status` | sensitive | `issueKey`, `status` | -- | `{ ok, issueKey, newStatus }` |
| `jira_add_comment` | sensitive | `issueKey`, `body` | -- | `{ ok, id }` |

## Tool Reference: Linear (3 tools)

| Tool | Permission | Required Params | Optional Params | Returns |
|------|-----------|----------------|-----------------|---------|
| `linear_list_issues` | safe | -- | `teamId`, `state` (e.g. "In Progress"), `limit` (default 20, max 50) | `{ count, issues[] }` with id, title, state.name, assignee.name, priority, createdAt, updatedAt, url |
| `linear_create_issue` | sensitive | `teamId`, `title` | `description` (markdown), `priority` (0=None, 1=Urgent, 2=High, 3=Medium, 4=Low), `stateId` | `{ ok, issue: { id, title, url } }` |
| `linear_update_issue` | sensitive | `issueId` | `title`, `description`, `priority`, `stateId` | `{ ok, issue: { id, title, state.name } }` |

## Tool Reference: Notion (4 tools)

| Tool | Permission | Required Params | Optional Params | Returns |
|------|-----------|----------------|-----------------|---------|
| `notion_search` | safe | `query` | `limit` (default 10, max 20) | `{ total, results[] }` with id, type (page/database), url, createdTime, title |
| `notion_read_page` | safe | `pageId` | -- | `{ id, title, content }` where content is block text joined with newlines, prefixed by block type (max 10,000 chars) |
| `notion_create_page` | sensitive | `parentId`, `title` | `content` (initial text, max 2000 chars), `parentType` ("page_id" or "database_id", default "page_id") | `{ ok, id, url }` |
| `notion_append_block` | sensitive | `pageId`, `content` | `blockType` (paragraph/heading_1/heading_2/bulleted_list_item/etc., default "paragraph") | `{ ok, blockCount }` |

---

## Procedure: Jira -- Search and Triage Issues

### Search with JQL
```
jira_search({ jql: "project = ENG AND status = Open AND priority = High" })
```

### Common JQL patterns
| Goal | JQL |
|------|-----|
| My open issues | `assignee = currentUser() AND status != Done` |
| Bugs in a project | `project = ENG AND issuetype = Bug AND status != Done` |
| Recently updated | `project = ENG AND updated >= -7d ORDER BY updated DESC` |
| Unassigned issues | `project = ENG AND assignee is EMPTY AND status = Open` |
| Sprint issues | `sprint in openSprints() AND project = ENG` |
| Text search | `project = ENG AND text ~ "login error"` |
| Created this week | `project = ENG AND created >= startOfWeek()` |

### Get full issue details
```
jira_get_issue({ issueKey: "ENG-123" })
```
Returns summary, status, assignee, priority, type, created/updated dates, and labels.

---

## Procedure: Jira -- Create and Manage Issues

### Create a task
```
jira_create_issue({
  projectKey: "ENG",
  summary: "Add rate limiting to authentication endpoint",
  issueType: "Task",
  description: "Implement sliding-window rate limiter for /api/auth. Limit: 10 attempts per minute per IP.",
  priority: "High",
  labels: ["backend", "security"]
})
```

### Create a bug report
```
jira_create_issue({
  projectKey: "ENG",
  summary: "Login page crashes on Safari 18",
  issueType: "Bug",
  description: "Steps to reproduce:\n1. Open login page in Safari 18\n2. Enter credentials\n3. Click submit\n\nExpected: Redirect to dashboard\nActual: Page crashes with white screen",
  priority: "Highest"
})
```

**Note on description format**: Jira API v3 uses Atlassian Document Format (ADF). The tool
automatically wraps your plain text description into ADF paragraph format. Markdown formatting
in the description string is NOT rendered -- it is stored as literal text.

### Transition an issue status
```
jira_update_status({ issueKey: "ENG-123", status: "In Progress" })
```
The tool fetches available transitions for the issue and matches by name (case-insensitive).
If the status name doesn't match any available transition, the error message lists all
available statuses, e.g.:
`Status "Completed" not found. Available: To Do, In Progress, In Review, Done`

### Add a comment
```
jira_add_comment({
  issueKey: "ENG-123",
  body: "Investigated the root cause. The issue is in the OAuth callback handler. Fix incoming in PR #456."
})
```
Comment body uses the same ADF wrapping (plain text in a paragraph block).

---

## Procedure: Linear -- Manage Issues

### List issues for a team
```
linear_list_issues({ teamId: "TEAM-ID-HERE", state: "In Progress", limit: 20 })
```
All parameters are optional. With no params, returns the 20 most recent issues across all teams.

### Filter by state
```
linear_list_issues({ state: "Todo" })
```
State names are exact matches against the workflow state name (e.g. "Backlog", "Todo",
"In Progress", "In Review", "Done", "Cancelled"). These vary by team configuration.

### Create an issue
```
linear_create_issue({
  teamId: "TEAM-ID-HERE",
  title: "Implement dark mode toggle",
  description: "Add a toggle in the settings page to switch between light and dark themes.\n\n## Acceptance criteria\n- Toggle persists across sessions\n- Applies immediately without page reload",
  priority: 2
})
```
Priority values: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low.

### Update an issue
```
linear_update_issue({
  issueId: "ISSUE-ID-HERE",
  priority: 1,
  stateId: "STATE-ID-FOR-IN-PROGRESS"
})
```
Only the fields you provide are updated. Omitted fields remain unchanged.

### Finding team IDs and state IDs
Linear tools require UUIDs for `teamId` and `stateId`. To find these:
1. `linear_list_issues` with no filters -- each issue in the response includes state info
2. Use the Linear web UI Settings > Teams to find team IDs
3. The GraphQL API returns IDs in all responses, so previously fetched results contain them

---

## Procedure: Notion -- Search and Read Pages

### Search for pages
```
notion_search({ query: "Q1 Planning", limit: 5 })
```
Returns pages AND databases that match the query. Each result includes:
- `id` -- the page/database UUID (use this for subsequent calls)
- `type` -- "page" or "database"
- `url` -- direct link to the Notion page
- `title` -- extracted from the title property (falls back to "(untitled)")

### Read a page's content
```
notion_read_page({ pageId: "PAGE-UUID-HERE" })
```
Returns the page title and all top-level blocks concatenated as text. Each block is prefixed
with its type in brackets, e.g.:
```
[heading_2] Project Overview
[paragraph] This document outlines the Q1 planning process.
[bulleted_list_item] Goal 1: Ship v2.0
[bulleted_list_item] Goal 2: Reduce bug backlog by 50%
```
Content is truncated to 10,000 characters. Nested blocks (children of toggles, columns, etc.)
are NOT fetched -- only top-level children of the page.

---

## Procedure: Notion -- Create and Edit Pages

### Create a page under another page
```
notion_create_page({
  parentId: "PARENT-PAGE-UUID",
  title: "Meeting Notes - April 3, 2026",
  content: "Attendees: Alice, Bob, Carol\n\nAgenda:\n1. Sprint review\n2. Q2 planning\n3. Hiring update"
})
```
The `content` parameter creates a single paragraph block with the provided text (max 2000 chars).

### Create a page in a database
```
notion_create_page({
  parentId: "DATABASE-UUID",
  title: "New Feature Spec: AI Dashboard",
  parentType: "database_id",
  content: "Initial draft of the AI dashboard feature specification."
})
```
**Note**: When creating pages in a database, the `title` property must match the database's
title property name. The tool uses the generic `title` property, which works for most databases
but may fail if the database uses a custom title column name.

### Append content to an existing page
```
notion_append_block({
  pageId: "PAGE-UUID-HERE",
  content: "Action item: Alice to prepare the Q2 budget by Friday.",
  blockType: "bulleted_list_item"
})
```

### Supported block types for `notion_append_block`
| blockType | Renders as |
|-----------|-----------|
| `paragraph` (default) | Normal paragraph text |
| `heading_1` | Large heading (H1) |
| `heading_2` | Medium heading (H2) |
| `heading_3` | Small heading (H3) |
| `bulleted_list_item` | Bullet point |
| `numbered_list_item` | Numbered item |
| `to_do` | Checkbox item |
| `quote` | Block quote |
| `callout` | Callout box |
| `code` | Code block |

Content is truncated to 2,000 characters per block. To add more content, make multiple
`notion_append_block` calls.

---

## Common Workflows

### Workflow: Morning standup summary
1. `jira_search` with `assignee = currentUser() AND status = "In Progress"` -- what you're working on
2. `jira_search` with `assignee = currentUser() AND status changed TO "Done" AFTER -1d` -- what you finished
3. `linear_list_issues` with `state: "In Progress"` -- if also using Linear
4. Summarize the results as standup notes

### Workflow: Create a bug report across platforms
1. Gather details from the user
2. `jira_create_issue` with `issueType: "Bug"` -- create in Jira
3. `notion_create_page` -- create a detailed investigation page in Notion
4. `notion_append_block` -- add sections for root cause, steps to reproduce, etc.

### Workflow: Sprint planning review
1. `jira_search` with `sprint in openSprints() AND project = ENG` -- current sprint issues
2. `jira_search` with `project = ENG AND status = Open AND priority in (High, Highest)` -- high priority backlog
3. Present a summary with issue counts by status and priority

### Workflow: Document meeting notes
1. `notion_search` for the meeting notes database or parent page
2. `notion_create_page` with the meeting title and date
3. `notion_append_block` with `blockType: "heading_2"` for each section
4. `notion_append_block` with `blockType: "bulleted_list_item"` for action items
5. Share the page URL with attendees

### Workflow: Cross-platform issue sync
1. `jira_get_issue` to read a Jira issue's details
2. `linear_create_issue` to mirror it in Linear (or vice versa)
3. `jira_add_comment` to link the Linear issue URL in the Jira ticket

---

## Known Issues & Gotchas

### Jira
- **Description is plain text only**: The tool wraps description text in ADF paragraph format.
  Rich formatting (bold, links, code blocks) is NOT supported. The text appears as-is.
- **Status transitions are workflow-dependent**: `jira_update_status` only works with statuses
  that are valid transitions from the current status. You cannot jump from "Open" to "Done"
  if the workflow requires going through "In Progress" first. The error message lists available
  transitions when a match fails.
- **Labels must pre-exist**: `jira_create_issue` with `labels` will fail silently or error if
  the label names don't exist in the Jira project. Create labels in Jira's web UI first.
- **maxResults cap**: The tool caps at 50 results per search. For large result sets, use
  more specific JQL to narrow results.
- **API v3 only**: The tool uses `/rest/api/3/`. Older Jira Server instances on API v2 may
  not be compatible (ADF format was introduced in v3).

### Linear
- **GraphQL variables for injection prevention**: The `linear_list_issues` tool uses GraphQL
  variables (not string interpolation) for `teamId` and `state` filters, preventing injection.
- **Team ID is a UUID**: You need the actual Linear team UUID, not the team key. Find it in
  Linear's team settings or from a previous API response.
- **State ID for updates**: `linear_update_issue` with `stateId` requires the workflow state
  UUID. This is different from the state name. Get it from `linear_list_issues` responses
  (each issue includes `state.name` but the ID must be obtained from the Linear web UI or API).
- **No pagination**: `linear_list_issues` returns at most 50 issues in a single call.
- **Priority is numeric**: Unlike Jira's named priorities, Linear uses numbers: 0 (None),
  1 (Urgent), 2 (High), 3 (Medium), 4 (Low). Note that 1 is the highest priority.

### Notion
- **Integration must be shared with pages**: This is the most common source of "not found"
  errors. The Notion integration can only access pages that have been explicitly shared with
  it via the page's "Add connections" menu.
- **Nested blocks not fetched**: `notion_read_page` only returns top-level blocks. Content
  inside toggles, synced blocks, column layouts, or other nested structures is not included.
  To read nested content, you would need the block IDs and additional API calls (not currently
  supported).
- **Content truncation**: `notion_read_page` truncates at 10,000 characters. `notion_create_page`
  and `notion_append_block` truncate input content at 2,000 characters per call.
- **Database page creation**: The title property must be named "title" or "Name" for
  `notion_create_page` to work correctly with databases. Custom title property names may fail.
- **API version**: The tools use Notion API version `2022-06-28`. Newer Notion features
  released after this version may not be accessible.
- **Block types in `notion_append_block`**: The tool creates a single block per call. For
  multi-block content (e.g. a bulleted list with 5 items), call `notion_append_block` five
  times with `blockType: "bulleted_list_item"`.
- **No rich text formatting**: Both `notion_create_page` and `notion_append_block` create
  plain text blocks. Bold, italic, links, mentions, and inline code are not supported.

### General
- **30-second timeout**: All API requests have a 30-second timeout. Slow network connections
  or overloaded servers may cause timeouts, returning "Request timeout".
- **HTTP error reporting**: Non-200 responses return `HTTP {status}: {first 500 chars of body}`.
  This usually includes the API's error message for debugging.
- **No retry logic**: Failed requests are not retried. Transient errors (network glitches,
  rate limits) require the user to retry the tool call.
