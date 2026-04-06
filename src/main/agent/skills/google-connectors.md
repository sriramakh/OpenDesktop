# Google Connectors Skill Guide

Use these 5 tools to access the user's Google Drive, Gmail, and Calendar data.
All tools are read-only (safe permission) and require the user to complete OAuth2
sign-in before first use.

---

## Tool Reference

| Tool | Service | Purpose | Required Params | Optional Params | Permission |
|---|---|---|---|---|---|
| `connector_drive_search` | Drive | Search files by name, type, or query | `query` | `maxResults` | safe |
| `connector_drive_read` | Drive | Read text content of a file by ID | `fileId` | `mimeType` | safe |
| `connector_gmail_search` | Gmail | Search emails by Gmail query syntax | `query` | `maxResults` | safe |
| `connector_gmail_read` | Gmail | Read full email content by message ID | `messageId` | -- | safe |
| `connector_calendar_events` | Calendar | List events in a date range | -- | `timeMin`, `timeMax`, `maxResults` | safe |

---

## Setup Requirements

### 1. Environment Variables

The app must have Google OAuth2 credentials configured:

- `GOOGLE_CLIENT_ID` -- OAuth2 client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` -- OAuth2 client secret

Without these, the connector button will not work.

### 2. User Connection Flow

1. User clicks the connector plug button in the chat input area.
2. A per-service Connect/Disconnect panel appears (Drive, Gmail, Calendar).
3. User clicks "Connect" for the desired service.
4. A browser window opens to Google's OAuth consent page.
5. User grants read-only access.
6. A local HTTP callback captures the authorization code.
7. The code is exchanged for access/refresh tokens, stored in `{userData}/google-tokens.json`.
8. The connector button shows "Connected" status.

### 3. Scopes (Read-Only)

| Service | OAuth2 Scope |
|---|---|
| Drive | `https://www.googleapis.com/auth/drive.readonly` |
| Gmail | `https://www.googleapis.com/auth/gmail.readonly` |
| Calendar | `https://www.googleapis.com/auth/calendar.readonly` |

All access is strictly read-only. No tools can create, modify, or delete Google data.

---

## Procedure: Search Google Drive

### Step 1 -- Check Connection

Every connector tool checks `google.isConnected(service)` first. If the user is
not connected, the tool returns:

> "Not connected to Google Drive. Ask the user to click the connector button and sign in first."

If you see this message, tell the user to connect via the plug button.

### Step 2 -- Search for Files

```
connector_drive_search({
  query: "name contains 'quarterly report'",
  maxResults: 10
})
```

### Drive Query Syntax

The `query` parameter uses the Google Drive API v3 search syntax:

| Query | Finds |
|---|---|
| `name contains 'report'` | Files with "report" in the name |
| `name = 'Budget 2026.xlsx'` | Exact filename match |
| `mimeType = 'application/pdf'` | All PDF files |
| `mimeType = 'application/vnd.google-apps.document'` | Google Docs |
| `mimeType = 'application/vnd.google-apps.spreadsheet'` | Google Sheets |
| `modifiedTime > '2026-01-01T00:00:00'` | Files modified after a date |
| `name contains 'invoice' and mimeType = 'application/pdf'` | Combine conditions |
| `'me' in owners` | Files owned by the user |
| `fullText contains 'budget'` | Full-text content search |

### Step 3 -- Read File Content

Use the `id` from search results to read the file:

```
connector_drive_read({
  fileId: "1abc2def3ghi4jkl",
  mimeType: "application/vnd.google-apps.document"
})
```

- **Google Docs**: Automatically exported as plain text.
- **Other files**: Downloaded as raw content (binary files will be truncated).
- **Content limit**: Response is capped at 20,000 characters.

### Typical Workflow: Find and Read a Drive Document

```
1. connector_drive_search({ query: "name contains 'project plan'" })
   --> returns list with id, name, mimeType, webViewLink

2. connector_drive_read({ fileId: "1abc...", mimeType: "application/vnd.google-apps.document" })
   --> returns the plain text content

3. Present the content or use llm_summarize to condense it.
```

---

## Procedure: Search and Read Gmail

### Step 1 -- Search Emails

```
connector_gmail_search({
  query: "from:boss@example.com is:unread",
  maxResults: 5
})
```

### Gmail Query Syntax

Uses standard Gmail search operators:

| Query | Finds |
|---|---|
| `from:alice@example.com` | Emails from Alice |
| `to:me` | Emails sent to the user |
| `subject:invoice` | Emails with "invoice" in subject |
| `is:unread` | Unread emails |
| `is:starred` | Starred emails |
| `has:attachment` | Emails with attachments |
| `after:2026/03/01 before:2026/04/01` | Emails in a date range |
| `label:work` | Emails with a specific label |
| `in:inbox` | Inbox only |
| `from:boss@example.com subject:review` | Combine operators |

### Search Results

Returns up to 5 email summaries (even if `maxResults` is higher, details are
fetched for the first 5 only):

```json
[
  {
    "id": "18e1a2b3c4d5e6f7",
    "subject": "Q1 Budget Review",
    "from": "Alice Smith <alice@example.com>",
    "date": "Mon, 31 Mar 2026 09:15:00 -0700",
    "snippet": "Please review the attached budget spreadsheet..."
  }
]
```

### Step 2 -- Read Full Email

Use the `id` from search results:

```
connector_gmail_read({ messageId: "18e1a2b3c4d5e6f7" })
```

Returns full email content:

```json
{
  "id": "18e1a2b3c4d5e6f7",
  "subject": "Q1 Budget Review",
  "from": "Alice Smith <alice@example.com>",
  "to": "user@example.com",
  "date": "Mon, 31 Mar 2026 09:15:00 -0700",
  "body": "Hi team, please review the attached..."
}
```

- **Body extraction**: Prefers `text/plain` MIME part. Falls back through multipart parts.
- **Content limit**: Body is capped at 10,000 characters.
- **Attachments**: Not downloaded. Only the text body is returned.

### Typical Workflow: Check Unread Emails

```
1. connector_gmail_search({ query: "is:unread in:inbox" })
   --> returns list of unread emails with IDs and snippets

2. connector_gmail_read({ messageId: "18e1a..." })
   --> returns the full body of a specific email

3. Summarize or act on the content.
```

---

## Procedure: Check Calendar Events

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `timeMin` | string | no | now | Start of range, ISO 8601 (e.g. `"2026-04-03T00:00:00Z"`) |
| `timeMax` | string | no | 7 days from now | End of range, ISO 8601 |
| `maxResults` | number | no | 10 | Maximum events to return (max 50) |

### Examples

**This week's events (default):**
```
connector_calendar_events({})
```

**Specific date range:**
```
connector_calendar_events({
  timeMin: "2026-04-07T00:00:00Z",
  timeMax: "2026-04-11T23:59:59Z"
})
```

**Today only:**
```
connector_calendar_events({
  timeMin: "2026-04-03T00:00:00Z",
  timeMax: "2026-04-03T23:59:59Z"
})
```

### Response Format

```json
[
  {
    "summary": "Team Standup",
    "start": "2026-04-03T09:00:00-07:00",
    "end": "2026-04-03T09:30:00-07:00",
    "location": "Zoom",
    "description": "Daily sync - review sprint progress..."
  }
]
```

- Events are sorted by start time.
- Recurring events are expanded into individual instances (`singleEvents: true`).
- Description is capped at 200 characters.
- All-day events return a date string (`"2026-04-03"`) instead of a datetime.

---

## Common Workflows

### "What's on my calendar today?"

```
connector_calendar_events({
  timeMin: "<today>T00:00:00",
  timeMax: "<today>T23:59:59"
})
```

### "Find that document about X in my Drive"

```
1. connector_drive_search({ query: "fullText contains 'X'" })
2. connector_drive_read({ fileId: "<id from results>" })
```

### "Check my recent emails from Alice"

```
1. connector_gmail_search({ query: "from:alice@example.com", maxResults: 5 })
2. connector_gmail_read({ messageId: "<id>" })  // for each email of interest
```

### "Summarize my unread emails"

```
1. connector_gmail_search({ query: "is:unread in:inbox", maxResults: 5 })
2. For each: connector_gmail_read({ messageId: "<id>" })
3. llm_summarize({ text: combinedBodies, format: "bullets" })
```

---

## Known Issues & Gotchas

1. **"Not connected" errors**: If any connector tool returns the "Not connected" message, the user must click the connector plug button in the chat input and sign in. The agent cannot initiate OAuth -- it requires user interaction in the browser.

2. **Environment variables required**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set. Without them, the OAuth flow cannot start. These come from a Google Cloud Console project with the relevant APIs enabled (Drive API, Gmail API, Calendar API).

3. **Token expiry**: Access tokens expire after ~1 hour. The connector auto-refreshes using the stored refresh token. If refresh fails (e.g., user revoked access), the tool will return an error and the user needs to reconnect.

4. **Gmail detail limit**: `connector_gmail_search` fetches full metadata for only the first 5 results, even if `maxResults` is set higher. The list endpoint returns IDs for all matches, but detail calls are batched to 5 for performance.

5. **maxResults cap**: All tools cap `maxResults` at 50, regardless of the value passed.

6. **Drive search query format**: The `query` parameter must use the Google Drive API v3 query syntax, not plain text. `name contains 'report'` works; just `report` does not.

7. **Binary files via Drive**: `connector_drive_read` returns raw content. Binary files (images, ZIP, etc.) will return garbled text. It works best with Google Docs (exported as text), plain text files, and CSV.

8. **Read-only access**: All scopes are read-only. You cannot send emails, create Drive files, or create calendar events through these tools.

9. **Primary calendar only**: `connector_calendar_events` queries the user's primary calendar. Shared or secondary calendars are not included.

---

Last verified: 2026-04-06
