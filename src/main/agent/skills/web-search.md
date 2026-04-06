# Web Search & Fetch Skill Guide

Last verified: 2026-04-06

4 core tools for web research, page reading, API calls, and file downloads.
Also covers `content_summarize` (1 tool) for intelligent content extraction.

---

## Tool Reference

| Tool | Permission | Parameters | Description |
|------|-----------|------------|-------------|
| `web_search` | safe | `query`\*, `maxResults` | Search the web via DuckDuckGo HTML endpoint. Returns titles, URLs, and snippets. `maxResults` default: 8. No API key required. |
| `web_fetch` | safe | `url`\*, `maxLength`, `headers` | Fetch a web page and return text content (HTML stripped). Removes scripts/styles, collapses whitespace. `maxLength` default: 50000. Supports custom `headers` object. |
| `web_fetch_json` | safe | `url`\*, `method`, `body`, `headers` | Call a JSON REST API. `method`: GET (default), POST, PUT, DELETE, PATCH. `body`: object (auto-serialized). Returns parsed JSON. Auto-sets Accept and Content-Type to application/json. |
| `web_download` | sensitive | `url`\*, `outputPath`\* | Download a file from URL to local path via curl. 60-second timeout. Use for images, documents, packages, binaries. |
| `content_summarize` | safe | `input`\*, `length`, `language`, `extract` | Summarize web pages, YouTube videos, podcasts, audio/video files, PDFs. Powered by `@steipete/summarize` CLI. `length`: short/medium/long/xl/xxl. `extract=true` returns raw text without summarizing. |

\* = required parameter

---

## When to Use Which Tool

| Task | Tool |
|------|------|
| Find information on a topic | `web_search` |
| Read an article or documentation page | `web_fetch` |
| Summarize a long article or YouTube video | `content_summarize` |
| Get raw transcript from YouTube/podcast/audio | `content_summarize` with `extract=true` |
| Call a REST API (GET/POST/PUT/DELETE) | `web_fetch_json` |
| Download an image, PDF, or binary file | `web_download` |
| Research requiring multiple sources | `web_search` (multiple queries) + `web_fetch` (read top results) |

**Rule**: For YouTube links, podcast URLs, and audio/video files, always use `content_summarize` instead of `web_fetch`. `web_fetch` cannot extract video/audio content.

---

## Procedure: Research a Topic

1. Start with a broad `web_search` query to discover what is available.
2. Refine with 2-3 additional `web_search` queries using different angles or specific terms.
3. Call `web_fetch` on the 2-4 most promising URLs to read full content.
4. Cross-verify key facts across at least 2 sources.
5. Cite URLs when presenting findings to the user.

```
Step 1: web_search  query="latest React Server Components best practices 2026"
Step 2: web_search  query="React Server Components vs Client Components performance comparison"
Step 3: web_fetch  url="https://react.dev/reference/rsc/server-components"  maxLength=30000
Step 4: web_fetch  url="https://blog.example.com/rsc-deep-dive"  maxLength=30000
Step 5: (synthesize findings, cite both URLs)
```

**Multiple queries matter**: A single search query often misses important angles. Always run at least 2 queries from different perspectives — e.g., one for the concept, one for benchmarks, one for known issues.

---

## Procedure: Fetch and Read a Web Page

1. Call `web_fetch` with the URL.
2. If the content is truncated (ends with `...[truncated]`), either:
   - Increase `maxLength` (up to 50000)
   - Use `content_summarize` with `length="xl"` or `length="xxl"` for a smart summary instead
3. If the page returns empty or minimal content, the site may be blocking the request — try adding a different User-Agent via `headers`.

```
web_fetch  url="https://docs.python.org/3/library/asyncio.html"  maxLength=40000
```

**HTML stripping**: `web_fetch` removes `<script>` and `<style>` tags, then strips all remaining HTML tags. The result is readable plain text with collapsed whitespace. It does NOT render JavaScript — single-page apps (SPAs) may return minimal content.

---

## Procedure: Call a REST API

1. Call `web_fetch_json` with the endpoint URL.
2. For authenticated APIs, pass the token via `headers`: `{"Authorization": "Bearer YOUR_TOKEN"}`.
3. For POST/PUT/PATCH, provide the `body` as an object (auto-serialized to JSON).
4. The response is parsed as JSON and pretty-printed. If parsing fails, raw text is returned.

```
GET example:
  web_fetch_json  url="https://api.github.com/repos/facebook/react"

POST example:
  web_fetch_json  url="https://api.example.com/data"  method="POST"  body={"name":"test","value":42}  headers={"Authorization":"Bearer abc123"}

PUT example:
  web_fetch_json  url="https://api.example.com/items/5"  method="PUT"  body={"status":"completed"}
```

**Default headers**: The tool auto-sets `Accept: application/json`, `Content-Type: application/json`, and `User-Agent: OpenDesktop/1.0`. Custom headers merge with (and override) these defaults.

---

## Procedure: Download a File

1. Determine the direct download URL and the desired local path.
2. Call `web_download` with `url` and `outputPath`.
3. The tool uses curl with `-sL` (silent, follow redirects). Timeout: 60 seconds.
4. Verify the download succeeded by checking the file with `fs_info` or `fs_read`.

```
web_download  url="https://example.com/report.pdf"  outputPath="/Users/alice/Desktop/report.pdf"
```

**Large files**: The 60-second timeout limits downloads to what curl can complete in that window. For very large files (>500 MB), the download may time out. There is no progress indicator.

**File type agnostic**: Works for any file type — images (PNG, JPG, SVG), documents (PDF, DOCX), archives (ZIP, TAR), binaries, etc.

---

## Procedure: Summarize Content (Articles, YouTube, Podcasts, Audio)

1. Identify the input type:
   - Web article URL → `content_summarize` with `length="medium"` or `"long"`
   - YouTube URL → `content_summarize` (auto-detects, extracts transcript + summarizes)
   - Podcast RSS/Apple Podcasts/Spotify URL → `content_summarize`
   - Local audio file (MP3, WAV, M4A) → `content_summarize` (uses Whisper transcription)
   - Local video file (MP4, WebM) → `content_summarize` (extracts audio, then Whisper)
2. Set `length` based on user needs: "short" (~900 chars), "medium" (~1800, default), "long" (~4200), "xl" (~9000), "xxl" (~17000).
3. Set `extract=true` if the user wants the raw transcript/text without summarization.
4. Set `language` for non-English output (e.g., "de", "fr", "ja").

```
Summarize a YouTube video:
  content_summarize  input="https://youtu.be/dQw4w9WgXcQ"  length="long"

Get raw transcript:
  content_summarize  input="https://youtu.be/dQw4w9WgXcQ"  extract=true

Summarize a local audio file:
  content_summarize  input="/Users/alice/recordings/meeting.mp3"  length="xl"

Summarize in French:
  content_summarize  input="https://example.com/article"  length="medium"  language="fr"
```

**Prerequisite**: Requires the summarize CLI: `npm install -g @steipete/summarize`. Config in `~/.summarize/config.json` with model + API key. If not installed, the tool returns install instructions.

---

## Best Practices

### 1. Multiple Search Queries for Thorough Research

Never rely on a single `web_search` call. Different phrasings return different results:
- Broad query: "React performance optimization"
- Specific query: "React useMemo vs useCallback benchmark 2026"
- Problem-oriented: "React re-render performance issues solutions"

### 2. Cross-Verify Facts

When the user asks a factual question, verify claims across at least 2 independent sources. If sources disagree, report the discrepancy.

### 3. Always Cite URLs

When presenting web research findings, include the source URLs. Format:
- "According to [Source Name](URL), ..."
- "Source: URL"

### 4. Respect `maxLength` Limits

`web_fetch` default is 50000 characters. For most articles, 20000-30000 is sufficient. For API documentation or long references, use the full 50000. Requesting more than needed wastes context window.

### 5. Handle Rate Limiting Gracefully

DuckDuckGo may rate-limit aggressive querying. If `web_search` returns no results unexpectedly:
- Wait briefly and retry with a rephrased query
- Try more specific search terms
- Consider whether the information might be found on a known URL directly via `web_fetch`

### 6. Use `web_fetch_json` for Structured Data

When the target is a known API endpoint (REST, GraphQL, JSON feed), use `web_fetch_json` instead of `web_fetch`. It auto-handles JSON parsing and pretty-prints the response. `web_fetch` would strip JSON structure into plain text.

### 7. Prefer `content_summarize` for Media

For YouTube, podcasts, and audio/video files, `web_fetch` returns useless HTML/metadata. Always use `content_summarize` which handles transcript extraction and intelligent summarization.

---

## Known Issues & Gotchas

### DuckDuckGo HTML Parsing

`web_search` scrapes DuckDuckGo's HTML search results page. The HTML structure may change without notice, breaking result extraction. Symptoms: empty results array despite valid queries. The regex-based parser looks for `class="result__a"` and `class="result__snippet"` elements.

### No JavaScript Rendering

`web_fetch` uses Node.js `http`/`https` modules (not a browser). Single-page applications (React, Vue, Angular) that render client-side will return minimal or empty content. For SPAs:
- Use `tabs_read` (requires the page to be open in a browser tab)
- Use `content_summarize` (may handle some SPAs via the summarize CLI)

### Response Size Limit

`web_fetch` and `web_fetch_json` enforce a 5 MB response size limit. Responses exceeding this are aborted with "Response too large (>5MB)". For large files, use `web_download` instead.

### Redirect Following

Both `web_fetch` and `web_fetch_json` follow HTTP 3xx redirects automatically by re-requesting the `Location` header URL. There is no redirect depth limit in the code, but circular redirects will eventually hit the 30-second timeout.

### Request Timeout

All HTTP requests (web_fetch, web_fetch_json, web_search) have a 30-second timeout. `web_download` has a 60-second timeout (curl-based). If a server is slow or unresponsive, the request will fail with "Request timed out".

### User-Agent String

`web_search` and `web_fetch` send `User-Agent: Mozilla/5.0 (compatible; OpenDesktop/1.0)`. `web_fetch_json` sends `User-Agent: OpenDesktop/1.0`. Some sites block non-browser User-Agents. If a site returns 403 or empty content, try passing a browser-like User-Agent via the `headers` parameter:

```
web_fetch  url="https://example.com"  headers={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
```

### Non-200 HTTP Status Codes

`web_fetch` and `web_fetch_json` throw errors for any status code outside the 200-299 range (after following redirects). The error message includes the status code and first 500 characters of the response body. Common cases:
- 403: Site blocking the request (try different User-Agent or headers)
- 404: URL not found
- 429: Rate limited (wait and retry)
- 500+: Server error (retry once, then report to user)

### `web_fetch_json` Accepts Non-JSON Responses

If the response is not valid JSON, `web_fetch_json` returns the raw response text instead of throwing. This means it can be used as a general-purpose HTTP client, but the response will not be pretty-printed.

### Custom Headers Merge, Not Replace

In `web_fetch`, custom `headers` are merged with the default User-Agent header. In `web_fetch_json`, custom headers merge with the default Accept, Content-Type, and User-Agent headers. To override a default, include it in your `headers` object with the desired value.

### `content_summarize` Timeouts

- Web/text content: 2-minute timeout
- Audio/video files: 10-minute timeout (Whisper transcription can be slow)
- If the summarize CLI is not installed, the tool returns install instructions (not an error)
- If no API key is configured, the tool returns config.json example

### `web_download` Does Not Verify Content

`web_download` does not check the HTTP status code, file integrity, or content type. A 404 page may be saved as the output file. Always verify the download with `fs_info` (check file size) or `fs_read` (check content) after downloading.
