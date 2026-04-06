# Word Document (DOCX) Tools Skill Guide

Last verified: 2026-04-06

4 tools for reading, writing, searching, and batch-searching Word documents (.docx). All tools accept absolute paths (or `~`-prefixed paths which resolve to the user's home directory).

---

## Tool Reference

| Tool | Permission | Description |
|------|-----------|-------------|
| `office_read_docx` | safe | Read a .docx file in three modes: `text` (plain text), `html` (structured HTML), or `structured` (heading hierarchy, tables, metadata). |
| `office_write_docx` | sensitive | Create a .docx file from markdown-like content. Supports headings, bold/italic/underline, tables, lists, page breaks. |
| `office_search_docx` | safe | Search for a term/phrase inside ONE .docx file. Returns matching paragraphs with section context and style info. |
| `office_search_docxs` | safe | Batch-search ALL .docx files in a directory in ONE Python process. Returns matches grouped by file. |

---

## Decision Tree: Which Tool to Use

```
User wants to...
  |
  +-- Read a Word document
  |     +-- Just get the text content
  |     |     --> office_read_docx (format="text", default)
  |     |
  |     +-- Understand document structure before editing
  |     |     --> office_read_docx (format="structured")
  |     |
  |     +-- Get formatted HTML output
  |           --> office_read_docx (format="html")
  |
  +-- Create or overwrite a Word document
  |     --> office_write_docx
  |
  +-- Find a specific term in ONE document
  |     --> office_search_docx
  |
  +-- Find which documents mention a term across many files
        --> office_search_docxs  (NEVER loop office_search_docx per file)
```

---

## Parameter Reference

### office_read_docx

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the .docx file. |
| `format` | string | no | `"text"` | `"text"` = plain text. `"html"` = structured HTML. `"structured"` = heading hierarchy + tables + metadata. |

### office_write_docx

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to save the .docx file. Created or overwritten. |
| `content` | string | yes | - | Document content using the markdown-like syntax described below. |
| `title` | string | no | filename | Document title stored in metadata. |

### office_search_docx

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the .docx file. |
| `query` | string | yes | - | Term or phrase to search for (case-insensitive). |
| `maxResults` | number | no | `30` | Maximum matching paragraphs to return. |

### office_search_docxs

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `directory` | string | yes | - | Absolute path to the directory containing .docx files. |
| `query` | string | yes | - | Term or phrase to search for (case-insensitive). |
| `maxResultsPerFile` | number | no | `10` | Maximum matches per DOCX file. |
| `maxFiles` | number | no | `200` | Maximum number of DOCX files to scan. |
| `recursive` | boolean | no | `true` | Search subdirectories recursively. |

---

## Procedure: Read a Word Document

### Step 1: Use structured mode first to understand the document

```
office_read_docx({ path: "/path/to/report.docx", format: "structured" })
```

**Structured mode output includes:**
- Document metadata: title, author, created date, modified date
- Paragraph count and table count
- Heading hierarchy (# H1, ## H2, ### H3, etc.)
- List items marked with bullets
- Tables displayed at the end with row/column content

Use this to understand the document layout before deciding what to extract or search for.

### Step 2: Read full text if needed

```
office_read_docx({ path: "/path/to/report.docx", format: "text" })
```

Plain text mode uses mammoth for fast extraction. Good for getting all content without structure.

### Step 3: Search for specific content

```
office_search_docx({ path: "/path/to/report.docx", query: "termination clause" })
```

Prefer search over reading the entire document when looking for specific information.

---

## Procedure: Create a Word Document

### Formatting Reference

`office_write_docx` accepts a `content` string using markdown-like syntax. The following formatting is supported:

| Syntax | Result | Style |
|--------|--------|-------|
| `# Heading text` | Heading 1 | Bold, large, dark blue |
| `## Heading text` | Heading 2 | Bold, medium |
| `### Heading text` | Heading 3 | Bold, smaller |
| `#### Heading text` | Heading 4 | Bold italic, dark blue |
| `- item` or `* item` | Bullet list item | Indented with bullet |
| `1. item` | Numbered list item | Indented with number |
| `**bold text**` | **Bold** | Font bold |
| `*italic text*` | *Italic* | Font italic |
| `***bold+italic***` | ***Bold + italic*** | Font bold + italic |
| `__underline text__` | Underline | Font underlined |
| `` `code text` `` | Code | Courier New, gray background |
| `---` or `===` or `***` (alone on line) | Page break | Inserts page break |
| `\| Col1 \| Col2 \|` | Table row | Markdown pipe syntax |
| Plain text | Normal paragraph | Default body style |

### Table Syntax

Tables use standard markdown pipe syntax. The first row becomes the header with dark blue background:

```
| Name | Department | Salary |
|------|-----------|--------|
| Alice | Engineering | $95,000 |
| Bob | Marketing | $72,000 |
```

The separator row (`|------|...`) is optional but recommended. It is stripped during parsing.

### Complete Example

```
office_write_docx({
  path: "/Users/alice/Documents/quarterly-report.docx",
  title: "Q1 2026 Quarterly Report",
  content: `# Q1 2026 Quarterly Report

## Executive Summary

Revenue grew **15%** year-over-year to *$2.4 million*, driven by strong
performance in the __enterprise segment__. Key highlights:

- Customer acquisition up **22%**
- Churn rate decreased to ***1.2%***
- New product launched in March

## Financial Overview

| Metric | Q1 2025 | Q1 2026 | Change |
|--------|---------|---------|--------|
| Revenue | $2.09M | $2.40M | +15% |
| EBITDA | $410K | $520K | +27% |
| Customers | 1,250 | 1,525 | +22% |

---

## Detailed Analysis

### Revenue Breakdown

1. Enterprise: $1.44M (60%)
2. SMB: $720K (30%)
3. Consumer: $240K (10%)

### Outlook

Next quarter targets include expanding into the APAC region and launching
the \`v3.0\` platform update.`
})
```

### Inline Formatting Rules

Inline formatting markers are parsed by `parseInlineRuns()` in office.js:

- `**bold**` -- text between double asterisks becomes bold
- `*italic*` -- text between single asterisks becomes italic
- `***bold+italic***` -- text between triple asterisks becomes bold + italic
- `__underline__` -- text between double underscores becomes underlined
- `` `code` `` -- text between backticks becomes Courier New with a gray highlight
- These can appear anywhere within a heading, list item, or normal paragraph
- Nested formatting (e.g., `**bold with *italic* inside**`) is NOT supported -- use `***` for bold+italic

---

## Procedure: Search Across Multiple DOCX Files

**CRITICAL: NEVER loop `office_search_docx` once per file.** Use `office_search_docxs` instead -- it runs a single Python process, dramatically faster.

```
office_search_docxs({
  directory: "/Users/alice/Documents/Contracts",
  query: "indemnification",
  maxResultsPerFile: 5
})
```

**Output format:**
```
[DOCX Batch Search: "indemnification"]
  Documents searched: 23 | Matches: 14

### contract_vendor_A.docx
  Para #47 [Section: Legal Terms]: ...context around the match...
  Para #52 [Section: Legal Terms]: ...context around the match...

### agreement_2025.docx
  Para #12 [Section: Liability]: ...context around the match...
```

Each match includes:
- `file`: filename
- `paragraph_idx`: paragraph number (0-indexed in output, displayed as 1-indexed)
- `style`: paragraph style (Normal, Heading 1, List Paragraph, etc.)
- `heading_context`: the nearest heading above the match (walks backward through paragraphs)
- `context`: the matching paragraph plus one paragraph before and after

---

## Procedure: Search Within a Single DOCX

```
office_search_docx({
  path: "/path/to/contract.docx",
  query: "force majeure"
})
```

**Output format:**
```
[DOCX Search: "force majeure" -- 3 match(es) in contract.docx (245 paragraphs)]

--- Para #78 [Normal]
  Section: Article 12 - Liability ---
...surrounding context with paragraph before and after...

--- Para #134 [Normal]
  Section: Article 18 - Force Majeure ---
...surrounding context...
```

### How DOCX Search Works Internally

1. Opens the document with python-docx
2. Extracts all paragraphs from the body AND from table cells (both are searched)
3. Normalizes all paragraph text (fixes hyphenated breaks, collapses whitespace)
4. Joins all paragraphs into a single corpus with `' ||| '` sentinels between them
5. Searches the corpus with `re.compile(re.escape(query), re.IGNORECASE)`
6. Maps each match position back to the originating paragraph index
7. Deduplicates by paragraph index (same paragraph not shown twice)
8. For each match, walks backward to find the nearest heading for section context

---

## Workflow: Read, Analyze, Then Create

When the user asks you to work with an existing DOCX and create a modified version:

1. **Read with structured mode** to understand the layout:
   ```
   office_read_docx({ path: "/path/to/original.docx", format: "structured" })
   ```

2. **Search if looking for specific sections:**
   ```
   office_search_docx({ path: "/path/to/original.docx", query: "section 5" })
   ```

3. **Read full text** to get complete content:
   ```
   office_read_docx({ path: "/path/to/original.docx", format: "text" })
   ```

4. **Write the new document** with modifications:
   ```
   office_write_docx({
     path: "/path/to/modified.docx",
     content: "# Modified Report\n\n## Section 1\n\nUpdated content here...",
     title: "Modified Report"
   })
   ```

**Note:** `office_write_docx` always creates a new file (or overwrites). There is no in-place edit tool for DOCX. To modify a document, read it, adjust the content, and write a new file.

---

## Known Issues & Gotchas

1. **No in-place editing**: `office_write_docx` creates from scratch using jszip + XML. It does not preserve the original document's images, headers/footers, styles, or embedded objects. If you need to preserve complex formatting from an existing document, inform the user of this limitation.

2. **Structured mode requires python-docx**: The `format="structured"` option runs a Python script using `python-docx`. If `python-docx` is not installed, it will fail with an error message. Install with: `pip install python-docx`.

3. **Search includes table cells**: Both `office_search_docx` and `office_search_docxs` search body paragraphs AND table cell text. This is correct behavior -- do not assume a term is missing just because it appears in a table.

4. **Cross-paragraph matching**: The search tools normalize text across paragraph boundaries using a sentinel-joined corpus. This means phrases that span two paragraphs in the original document WILL be found.

5. **Heading styles**: `office_write_docx` creates headings using Word's built-in Heading1 through Heading4 styles with the following formatting:
   - Heading1: bold, 16pt, dark blue (#1F3864)
   - Heading2: bold, 14pt, dark blue (#1F3864)
   - Heading3: bold, 12pt, dark blue (#1F3864)
   - Heading4: bold italic, 11pt, dark blue (#1F3864)

6. **Table limitations**: Tables created by `office_write_docx` have a dark blue header row and alternating light fills. Column widths are distributed evenly. There is no support for merged cells, custom column widths, or nested tables in the write tool.

7. **Batch search timeout**: `office_search_docxs` has a 10-minute timeout. For directories with thousands of DOCX files, use `maxFiles` to limit the scan scope.

8. **Empty result from text mode**: If `office_read_docx` with `format="text"` returns very little content but you expect more, try `format="structured"` -- some documents have content primarily in tables or form fields that mammoth may not extract fully but python-docx will capture.

---

## Python Dependencies

| Package | Install | Used By |
|---------|---------|---------|
| `python-docx` | `pip install python-docx` | structured mode, search tools |
| `mammoth` | bundled (Node.js) | text and html read modes |
| `jszip` | bundled (Node.js) | office_write_docx |
