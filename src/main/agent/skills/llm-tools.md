# LLM Tools Skill Guide

Use these 4 tools to delegate subtasks to the configured LLM provider. All are safe
(no approval needed) and call the same model the agent is running on via `callLLM`.

---

## Tool Reference

| Tool | Purpose | Required Params | Optional Params | Permission |
|---|---|---|---|---|
| `llm_query` | General Q&A, reasoning, analysis | `prompt` | `systemPrompt`, `temperature` | safe |
| `llm_summarize` | Condense long text into key points | `text` | `maxLength`, `format` | safe |
| `llm_extract` | Pull structured JSON from unstructured text | `text` | `schema`, `instructions` | safe |
| `llm_code` | Generate or modify code | `instruction` | `language`, `existingCode`, `context` | safe |

---

## When to Use Each Tool

| Situation | Tool |
|---|---|
| Answer a factual question or reason about a topic | `llm_query` |
| Explain or analyze something in the conversation | `llm_query` |
| Summarize a long document, article, or text block | `llm_summarize` |
| Extract names, dates, amounts, or entities from text | `llm_extract` |
| Parse an invoice, receipt, or structured document into JSON | `llm_extract` |
| Write a new function, script, or code snippet | `llm_code` |
| Refactor or modify existing code | `llm_code` with `existingCode` |
| Translate code between languages | `llm_code` with `existingCode` + target `language` |

### When NOT to Use These Tools

- Do NOT use `llm_summarize` for YouTube, podcasts, or media files. Use `content_summarize` instead.
- Do NOT use `llm_query` for web searches. Use `web_search` instead.
- Do NOT use `llm_code` then manually write the file. Instead, write code directly with `fs_write` or `fs_edit` when you already know what to write.
- These tools call the LLM as a subtask. If the agent can answer directly, just answer -- no need to delegate to itself.

---

## Procedure: llm_query

General-purpose LLM call for reasoning, analysis, and Q&A.

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `prompt` | string | yes | -- | The question or instruction to send |
| `systemPrompt` | string | no | "You are a helpful assistant. Be concise and accurate." | Custom system prompt to guide behavior |
| `temperature` | number | no | 0.7 | Sampling temperature (0 = deterministic, 1 = creative) |

### Examples

**Simple question:**
```
llm_query({ prompt: "What are the key differences between REST and GraphQL?" })
```

**With custom system prompt:**
```
llm_query({
  prompt: "Analyze this error: ECONNREFUSED 127.0.0.1:5432",
  systemPrompt: "You are a DevOps expert. Diagnose the issue and suggest fixes.",
  temperature: 0.3
})
```

**Low temperature for factual precision:**
```
llm_query({
  prompt: "Convert 72 degrees Fahrenheit to Celsius. Show the formula.",
  temperature: 0
})
```

---

## Procedure: llm_summarize

Condenses long text into a concise summary. Three output formats available.

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `text` | string | yes | -- | The text to summarize |
| `maxLength` | number | no | 500 | Target summary length in characters |
| `format` | enum | no | "bullets" | `"bullets"`, `"paragraph"`, or `"structured"` |

### Format Behavior

- `"bullets"` -- bullet-point list of key takeaways (default, best for quick scans)
- `"paragraph"` -- single concise paragraph (best for embedding in reports)
- `"structured"` -- headings + sections (best for long or multi-topic text)

### Examples

**Bullet summary of a document:**
```
llm_summarize({ text: fileContents, format: "bullets", maxLength: 300 })
```

**Paragraph for a report:**
```
llm_summarize({ text: meetingNotes, format: "paragraph", maxLength: 800 })
```

**Structured summary of a long document:**
```
llm_summarize({ text: whitePaper, format: "structured", maxLength: 1500 })
```

### Typical Workflow

1. Read a file with `fs_read` or `office_read_pdf`.
2. Pass the content to `llm_summarize`.
3. Present the summary to the user.

---

## Procedure: llm_extract

Extracts structured data from unstructured text. Returns valid JSON.

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `text` | string | yes | -- | Source text to extract from |
| `schema` | object | no | -- | JSON schema describing the desired structure |
| `instructions` | string | no | -- | Additional extraction guidance |

### How It Works

1. The tool sends the text to the LLM with a data-extraction system prompt.
2. If `schema` is provided, the LLM is told to match that structure.
3. If `instructions` is provided, it is appended to the system prompt.
4. The result is parsed: the tool looks for a JSON code block or a raw JSON object/array.
5. Returns the extracted JSON string (or raw LLM output if parsing fails).

### Examples

**Extract contacts from an email:**
```
llm_extract({
  text: emailBody,
  schema: { names: ["string"], emails: ["string"], phones: ["string"] },
  instructions: "Extract all contact information mentioned in the email."
})
```

**Parse an invoice:**
```
llm_extract({
  text: invoiceText,
  schema: {
    vendor: "string",
    invoice_number: "string",
    date: "string",
    line_items: [{ description: "string", quantity: "number", amount: "number" }],
    total: "number"
  }
})
```

**Extract without a schema (free-form):**
```
llm_extract({
  text: jobPosting,
  instructions: "Extract the job title, company, location, salary range, and required skills as JSON."
})
```

### Tips

- Providing a `schema` significantly improves output consistency.
- For complex documents, combine with `office_read_pdf` or `office_read_docx` to get the text first.
- The tool auto-strips markdown code fences from the JSON output.

---

## Procedure: llm_code

Generates or modifies code. Returns only the code by default (no explanations).

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `instruction` | string | yes | -- | What to build or how to modify the code |
| `language` | string | no | "javascript" | Target language (e.g. "python", "bash", "sql", "rust") |
| `existingCode` | string | no | -- | Current code to modify or refactor |
| `context` | string | no | -- | Additional context (codebase conventions, dependencies, etc.) |

### Examples

**Generate a new function:**
```
llm_code({
  instruction: "Write a function that validates an email address using a regex",
  language: "python"
})
```

**Modify existing code:**
```
llm_code({
  instruction: "Add error handling and input validation",
  language: "javascript",
  existingCode: "function divide(a, b) { return a / b; }",
  context: "This is a utility function used in a financial calculator. Must handle division by zero."
})
```

**Translate between languages:**
```
llm_code({
  instruction: "Convert this Python script to JavaScript (Node.js)",
  language: "javascript",
  existingCode: pythonScript
})
```

### Typical Workflow

1. Read existing code with `fs_read`.
2. Pass it to `llm_code` with modification instructions.
3. Write the result with `fs_write` or `fs_edit`.

---

## Known Issues & Gotchas

1. **Token limits**: All 4 tools pass content through `callLLM`. Very large texts (>100k chars) may hit the model's context limit. For huge documents, chunk the input or use `llm_summarize` on sections.

2. **Model dependency**: These tools use whatever LLM provider is currently configured (Anthropic, OpenAI, Gemini, Ollama, etc.). Output quality depends on the active model.

3. **llm_extract JSON parsing**: The tool tries to extract JSON from the response by looking for code fences or bare `{}`/`[]` blocks. If the LLM returns narrative text with embedded JSON, parsing may fail and the raw text is returned instead.

4. **llm_code returns code only**: The system prompt instructs "Only output the code, no explanations unless explicitly asked." If the user wants explanations, include that in the `instruction` parameter.

5. **temperature matters**: For factual queries and code generation, use low temperature (0-0.3). For creative writing or brainstorming, use higher values (0.7-1.0). Default is 0.7.

6. **Self-delegation anti-pattern**: Do not call `llm_query` just to answer something you can answer directly. These tools exist for subtask delegation (e.g., summarize a file's content, extract data from a document, generate code to be saved).

---

Last verified: 2026-04-06
