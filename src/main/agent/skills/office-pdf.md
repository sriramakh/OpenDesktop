# PDF Tools Skill Guide

Last verified: 2026-04-06

4 tools for reading, searching, querying, and batch-searching PDF documents. All tools accept absolute paths (or `~`-prefixed paths which resolve to the user's home directory).

---

## Tool Reference

| Tool | Permission | Description |
|------|-----------|-------------|
| `office_read_pdf` | safe | Read and extract text + tables from a PDF. Paginated output with `--- Page N / TOTAL ---` markers. Supports overview mode and page-range chunking. |
| `office_pdf_search` | safe | Search for a term/phrase inside ONE PDF. Returns matching passages with surrounding context and page numbers. |
| `office_pdf_ask` | safe | Ask a specific question about a PDF. Anthropic/Google send the entire binary natively (reads images, tables, charts). Other providers fall back to text extraction. |
| `office_search_pdfs` | safe | Batch-search ALL PDFs in a directory in ONE Python process. Returns matches grouped by file with page numbers and context. |

---

## Decision Tree: Which Tool to Use

```
User wants to...
  |
  +-- Ask a question about a PDF ("What does it say about X?")
  |     --> office_pdf_ask  (best quality, reads entire doc natively)
  |
  +-- Find a specific term/phrase in ONE PDF
  |     --> office_pdf_search
  |
  +-- Find which PDFs mention a term across many files
  |     --> office_search_pdfs  (NEVER loop office_pdf_search per file)
  |
  +-- Read/summarize a PDF
  |     +-- Small PDF (<15 pages)
  |     |     --> office_read_pdf (mode="full")
  |     |
  |     +-- Large PDF (15+ pages)
  |           --> office_read_pdf (mode="overview") first
  |           --> Then read specific page ranges with startPage/endPage
  |
  +-- Compare content across PDFs
        --> office_search_pdfs for each term, or office_pdf_ask per file
```

---

## Parameter Reference

### office_read_pdf

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the PDF file. |
| `mode` | string | no | `"full"` | `"full"` = complete text + tables. `"overview"` = first ~400 chars per page + table counts. |
| `startPage` | number | no | `1` | First page to read (1-indexed). |
| `endPage` | number | no | last page | Last page to read. Use with startPage for chunked reading. |
| `password` | string | no | - | Password for encrypted/protected PDFs. |

### office_pdf_search

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the PDF file. |
| `query` | string | yes | - | Text to search for (case-insensitive). Word, phrase, or name. |
| `maxResults` | number | no | `30` | Maximum matching passages to return. |

### office_pdf_ask

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the PDF file. |
| `question` | string | yes | - | The specific question to answer. Be precise for best results. |

### office_search_pdfs

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `directory` | string | yes | - | Absolute path to the directory containing PDFs. |
| `query` | string | yes | - | Term or phrase to search for (case-insensitive). |
| `maxResultsPerFile` | number | no | `10` | Maximum matches to return per PDF. |
| `maxFiles` | number | no | `200` | Maximum number of PDF files to scan. |
| `recursive` | boolean | no | `true` | Whether to search subdirectories recursively. |

---

## Procedure: Read a Large PDF (10+ pages)

**NEVER read a large PDF in one shot.** Use the overview-then-chunk strategy:

1. **Survey the document with overview mode:**
   ```
   office_read_pdf({ path: "/path/to/report.pdf", mode: "overview" })
   ```
   This returns the first ~400 characters of each page plus table counts. Use it to understand the document structure and identify which sections are relevant.

2. **Read specific page ranges (10-15 pages at a time):**
   ```
   office_read_pdf({ path: "/path/to/report.pdf", startPage: 1, endPage: 10 })
   office_read_pdf({ path: "/path/to/report.pdf", startPage: 11, endPage: 20 })
   ```
   For a 50-page PDF, read in chunks of 10-15 pages. Report intermediate findings to the user between chunks if appropriate.

3. **If looking for specific content, use search instead of reading everything:**
   ```
   office_pdf_search({ path: "/path/to/report.pdf", query: "revenue growth" })
   ```

---

## Procedure: Answer a Question About a PDF

Use `office_pdf_ask` -- it is the highest-quality option for Q&A:

```
office_pdf_ask({
  path: "/path/to/contract.pdf",
  question: "What are the termination clauses and notice periods?"
})
```

**How it works internally:**
- **Anthropic provider**: Sends the entire PDF binary via the `document` content type with `anthropic-beta: pdfs-2024-09-25`. The model reads all text, tables, charts, and images natively. Best quality.
- **Google provider**: Sends the PDF binary via `inline_data` with `application/pdf` MIME type. Also reads the full document natively.
- **Other providers (OpenAI, Ollama, DeepSeek)**: Falls back to extracting text with pdfplumber, truncating to ~60K characters, and sending the text to `callLLM`. Lower quality for image-heavy or table-heavy PDFs.

**When to prefer `office_pdf_ask` over manual reading:**
- The user is asking a specific question (not "read me everything")
- The PDF has complex tables, charts, or images
- The PDF is large and you do not want to read it page by page
- The user wants a comparison between sections

---

## Procedure: Search Across Multiple PDFs

**CRITICAL: NEVER loop `office_pdf_search` once per file.** Use `office_search_pdfs` instead -- it runs a single Python process that searches all PDFs at once, dramatically faster.

```
office_search_pdfs({
  directory: "/Users/alice/Documents/Research",
  query: "machine learning",
  maxResultsPerFile: 5
})
```

**Output format:**
```
[PDF Batch Search: "machine learning"]
  PDFs searched: 47 | Matches: 23

### paper_2025.pdf
  Page 3/42: ...context around the match...
  Page 17/42: ...context around the match...

### survey_overview.pdf
  Page 1/12: ...context around the match...
```

**Return fields:** `matches` (array with file, path, page, pages, match, context), `total_matches`, `searched`, `failed` (files that could not be read), `scanned` (image-only PDFs with no text layer).

---

## Procedure: Search Within a Single PDF

```
office_pdf_search({
  path: "/path/to/report.pdf",
  query: "quarterly revenue"
})
```

**Output format:**
```
[PDF Search: "quarterly revenue" -- 5 match(es) across 42 pages -- report.pdf]

--- Page 7 ---
...surrounding context with the match highlighted...

--- Page 23 ---
...surrounding context...
```

**How search works internally:**
- Uses PyMuPDF (fitz) as primary extractor, pdfplumber as fallback
- Normalizes text for cross-line matching: `re.sub(r'(\w)-\n(\w)', r'\1\2', text)` fixes hyphenated line breaks, `re.sub(r'\s+', ' ', text)` collapses whitespace
- Returns up to `contextChars` (300) characters of surrounding context per match
- Pages with fewer than 30 characters of text are flagged as scanned/image-only

---

## Extraction Pipeline (How `office_read_pdf` Works Internally)

The tool tries three strategies in order:

1. **pdfplumber** (Python, primary) -- highest quality text + table extraction. Extracts text with `x_tolerance=3, y_tolerance=3`. In full mode, also extracts tables using `lines_strict` strategy with fallback to default.
2. **pdf-parse** (Node.js, fallback) -- less accurate but no Python required. Used when pdfplumber is not installed or fails.
3. **PyMuPDF + Tesseract OCR** (scanned PDFs) -- triggered automatically when text density is below 30 characters per page. Renders pages at 2.5x resolution, runs Tesseract OCR with `--psm 1`.

**Scanned PDF detection:** If `charsPerPage < 30` after the primary extraction, the tool automatically attempts OCR via PyMuPDF + Tesseract. If Tesseract is not installed, it returns a message indicating OCR is unavailable.

---

## Known Issues & Gotchas

1. **Large PDFs in one shot**: Reading a 100+ page PDF with `mode="full"` and no page range will return an enormous amount of text that may exceed context limits. ALWAYS use overview + page-range chunking for large documents.

2. **Scanned PDFs**: If a PDF is image-based (scanned), the standard text extraction will return very little text. The tool auto-detects this and attempts OCR, but OCR requires `PyMuPDF` and `tesseract` to be installed (`brew install tesseract`).

3. **Encrypted PDFs**: Pass the `password` parameter to `office_read_pdf`. If the password is wrong, the tool will throw an error.

4. **Cross-line search**: Both `office_pdf_search` and `office_search_pdfs` normalize text to handle phrases split across lines (e.g., "aug-\nmented" becomes "augmented", whitespace collapsed to single spaces). This means searches for multi-word phrases work even when the PDF has line breaks within the phrase.

5. **`office_pdf_ask` file size limit**: Anthropic supports PDFs up to ~32 MB / ~100 pages for native document API. Google has similar limits. For extremely large PDFs, the tool falls back to text extraction, which truncates at 60K characters.

6. **`office_search_pdfs` timeout**: Batch search across many PDFs has a 10-minute timeout. For directories with hundreds of large PDFs, consider using `maxFiles` to limit the scan scope.

7. **`office_analyze_xlsx` is NOT for PDFs**: Do not use `office_analyze_xlsx` on a PDF file. It is for Excel workbooks only. Use `office_read_pdf` with `mode="overview"` for PDF structure survey.

8. **Image-only PDFs in batch search**: `office_search_pdfs` reports image-only files in its `scanned` field but does NOT OCR them. If you need to search scanned PDFs, read them individually with `office_read_pdf` (which triggers OCR) and then search the extracted text manually.

---

## Python Dependencies

| Package | Install | Used By |
|---------|---------|---------|
| `pdfplumber` | `pip install pdfplumber` | office_read_pdf (primary extractor) |
| `PyMuPDF` (fitz) | `pip install PyMuPDF` | office_pdf_search, office_search_pdfs, OCR pipeline |
| `pypdf` | `pip install pypdf` | Available but not primary |
| `tesseract` | `brew install tesseract` | OCR for scanned PDFs (optional) |
| `pdf-parse` | bundled (Node.js) | Fallback text extraction |
