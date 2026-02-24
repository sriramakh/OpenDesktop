# Content Summarization Skill

## What `content_summarize` Does

The `content_summarize` tool wraps the `summarize` CLI (@steipete/summarize).
It is a single-tool solution for summarizing or extracting content from:

| Input type | Example |
|---|---|
| Web article / blog post | `https://example.com/article` |
| YouTube video | `https://youtu.be/dQw4w9WgXcQ` |
| Podcast RSS feed | `https://feeds.npr.org/500005/podcast.xml` |
| Apple Podcasts / Spotify episode | `https://podcasts.apple.com/us/podcast/...` |
| Local audio file | `/Users/alice/interviews/ep42.mp3` |
| Local video file | `/Users/alice/talks/keynote.mp4` |
| Local PDF | `/Users/alice/docs/paper.pdf` |
| Local text file | `/Users/alice/notes/draft.txt` |

The tool auto-detects input type. It uses Whisper for audio/video transcription
(local whisper.cpp → OpenAI Whisper API → fal.ai Whisper, in priority order).

---

## When to Use `content_summarize` vs Other Tools

| Situation | Tool to use |
|---|---|
| Summarize a YouTube video | `content_summarize` ✅ |
| Get a video transcript | `content_summarize` with `extract: true` ✅ |
| Summarize a podcast episode | `content_summarize` ✅ |
| Summarize an audio/video file | `content_summarize` ✅ |
| Summarize a news article or blog | `content_summarize` ✅ |
| Quick web page summary (no media) | `content_summarize` OR `web_fetch` + `llm_summarize` |
| Search the web for facts | `web_search` (not content_summarize) |
| Read raw HTML/JSON of a URL | `web_fetch` |
| Summarize a PDF with native vision | `office_pdf_ask` (Anthropic/Google) |
| Search across many PDFs | `office_search_pdfs` |

**Prefer `content_summarize` over `web_fetch + llm_summarize`** for:
- Any media file (audio, video)
- YouTube links
- Podcast URLs
- Articles on JavaScript-heavy or paywalled sites (Firecrawl fallback)
- When you want the best extraction quality in one step

---

## Parameter Reference

| Parameter | Type | Default | When to use |
|---|---|---|---|
| `input` | string | required | URL or absolute file path |
| `length` | enum | `medium` | Controls summary verbosity |
| `language` | string | English | Pass user's language (e.g. "de", "fr") |
| `extract` | boolean | false | Full text / transcript, no summarizing |
| `slides` | boolean | false | YouTube presentations: extract slide screenshots |

### Length Guide

```
short  → ~900 chars    — quick one-paragraph overview
medium → ~1800 chars   — default, 3–5 paragraph summary  (DEFAULT)
long   → ~4200 chars   — detailed summary with key points
xl     → ~9000 chars   — very detailed, near-full coverage
xxl    → ~17000 chars  — near-complete transcript / full text
```

Pick length based on user intent:
- "summarize", "what's this about" → `medium` (default)
- "detailed summary", "cover everything" → `long` or `xl`
- "full transcript", "get all the text" → `extract: true` (no length limit)
- "quick overview" → `short`

---

## Workflow Examples

### Summarize a YouTube video
```
User: "Summarize this YouTube video: https://youtu.be/abc123"

1. Call content_summarize({ input: "https://youtu.be/abc123", length: "medium" })
2. Return the summary to the user.
   Mention: transcript source (published vs Whisper), video duration if shown.
```

### Get a full video transcript
```
User: "Get the transcript of https://youtu.be/abc123"

1. Call content_summarize({ input: "https://youtu.be/abc123", extract: true })
2. Return the full transcript text.
```

### Summarize a local audio/video file
```
User: "Summarize this podcast recording: /Users/alice/podcast.mp3"

1. Call content_summarize({ input: "/Users/alice/podcast.mp3", length: "long" })
   Note: Audio files use Whisper transcription first — may take 1–5 minutes.
2. Return the summary. Tell user transcription was performed automatically.
```

### Summarize a podcast feed (latest episode)
```
User: "Summarize the latest episode of https://feeds.example.com/podcast.xml"

1. Call content_summarize({ input: "https://feeds.example.com/podcast.xml", length: "medium" })
2. Return the episode title + summary.
```

### Summarize a web article in French
```
User: (in French) "Résume cet article: https://example.com/article"

1. Call content_summarize({ input: "https://example.com/article", language: "fr" })
2. Return the French summary.
```

### Summarize a presentation video (extract slides)
```
User: "Summarize this conference talk and show me the slides: https://youtu.be/xyz"

1. Call content_summarize({ input: "https://youtu.be/xyz", length: "long", slides: true })
2. Present the summary plus any slide images/timestamps returned.
```

---

## Error Handling

### "summarize CLI not installed"
→ Tell the user: `npm install -g @steipete/summarize`

### "No API key" error
→ Tell the user to create `~/.summarize/config.json`:
```json
{
  "model": "anthropic/claude-sonnet-4-5",
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```
Supported model strings: `anthropic/claude-sonnet-4-5`, `openai/gpt-4o-mini`,
`google/gemini-2.0-flash`, `xai/grok-3`, `openrouter/:free`

### "Transcription failed" / "whisper not found"
→ Tell the user their options:
- **Local (free)**: `brew install whisper-cpp`
- **Cloud (OpenAI)**: Set `OPENAI_API_KEY` in their summarize config
- **Cloud (fal.ai)**: Set `FAL_KEY` in their summarize config

### Timeout on large files
→ Large audio/video files can take 5–10 minutes. Reassure the user and wait.
  Media timeout is 10 minutes; web/text timeout is 2 minutes.

---

## Setup Instructions (tell user if CLI not found)

```bash
# 1. Install the CLI globally
npm install -g @steipete/summarize

# 2. Configure model and API key
# Create ~/.summarize/config.json:
{
  "model": "anthropic/claude-sonnet-4-5",
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-YOUR_KEY_HERE"
  }
}

# 3. Test it works
summarize "https://example.com"

# Optional: for local audio/video transcription without API costs
brew install whisper-cpp
```

---

## Important Notes

- **Audio/video files**: Transcription happens locally by default (whisper.cpp).
  If whisper.cpp is not installed, it falls back to OpenAI Whisper API (needs key).
- **The tool is read-only** (`permissionLevel: safe`) — it never modifies any files.
- **Large files**: A 1-hour MP3 takes ~3–5 minutes with local whisper.cpp.
- **YouTube with no transcript**: Falls back to audio download + Whisper transcription.
- **PDFs**: For complex PDFs with images, `office_pdf_ask` (using Anthropic's native PDF API) may give better results than `content_summarize`.
