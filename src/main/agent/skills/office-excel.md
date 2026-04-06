# Excel & CSV Tools Skill Guide

Last verified: 2026-04-06

9 tools for reading, writing, analyzing, charting, and converting Excel workbooks and CSV files. These are the core spreadsheet tools -- for the Excel Master session-based builder, see `excel-builder.md`. For the Python dashboard builder, see `excel-dashboard.md`.

**CRITICAL RULE: ALWAYS use Excel formulas (`=SUM`, `=IF`, `=VLOOKUP`, `=SUMIF`, etc.) instead of hardcoded values.** Spreadsheets must stay dynamic and recalculate when data changes.

---

## Tool Reference

### Reading & Analysis

| Tool | Permission | Description |
|------|-----------|-------------|
| `office_read_xlsx` | safe | Read sheet data, formulas, merged cells, column widths. Use `summaryOnly=true` for fast overview of large files. |
| `office_analyze_xlsx` | safe | Deep multi-sheet analysis: headers, data types, statistics (sum/avg/min/max/unique), sample rows, cross-sheet formula references. Use this FIRST before any other Excel operation. |
| `office_read_csv` | safe | Read/parse a CSV or TSV file. Auto-detects delimiter. Supports pagination with `startRow`/`endRow`. |

### Writing

| Tool | Permission | Description |
|------|-----------|-------------|
| `office_write_xlsx` | sensitive | Create or modify .xlsx workbooks. Bulk writes via `sheetData`, fine-grained control via `operations`. Supports formulas, financial color coding, formatting, tables. |
| `office_write_csv` | sensitive | Write data to CSV. 2D array input. Supports append mode. |

### Charts & Dashboards

| Tool | Permission | Description |
|------|-----------|-------------|
| `office_chart_xlsx` | sensitive | Embed real Excel chart objects (bar, column, line, pie, area, scatter) into a workbook. Multiple charts per call with auto-positioning. |
| `office_python_dashboard` | sensitive | Build a professionally styled dashboard from any Excel/CSV using Python (pandas + openpyxl). Follow the `excel-dashboard.md` skill guide. |
| `office_validate_dashboard` | safe | Validate a dashboard against 25 Gold Standard checks. Use immediately after `office_python_dashboard`. |

### Conversion

| Tool | Permission | Description |
|------|-----------|-------------|
| `office_csv_to_xlsx` | sensitive | Convert an entire CSV directly to .xlsx. Reads ALL rows with no LLM context limit. Use for CSVs with 300+ rows. |

---

## Decision Tree: Which Tool to Use

```
User wants to...
  |
  +-- Understand an Excel file's structure
  |     --> office_analyze_xlsx  (ALWAYS do this first)
  |
  +-- Read specific sheet data or formulas
  |     --> office_read_xlsx
  |     +-- Large file, just need structure?  --> summaryOnly=true
  |     +-- Need formulas?  --> includeFormulas=true
  |
  +-- Read a CSV/TSV
  |     +-- Small CSV (<300 rows): office_read_csv
  |     +-- Large CSV (300+ rows), need in Excel: office_csv_to_xlsx
  |
  +-- Write data to Excel
  |     +-- Bulk data with headers: office_write_xlsx (sheetData + autoFormat)
  |     +-- Precise cell control: office_write_xlsx (operations)
  |     +-- Financial model: office_write_xlsx (operations with financial_type)
  |
  +-- Create charts
  |     --> office_chart_xlsx (after office_analyze_xlsx)
  |
  +-- Build a full dashboard
  |     --> Read excel-dashboard.md skill guide first
  |     --> office_python_dashboard + office_validate_dashboard
  |
  +-- Write CSV data
        --> office_write_csv
```

**IMPORTANT: `office_analyze_xlsx` does NOT work on CSV files.** CSV files are not ZIP-based and will cause an error with ExcelJS. For CSV analysis, use `office_read_csv` or convert first with `office_csv_to_xlsx`.

---

## Parameter Reference

### office_analyze_xlsx

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the .xlsx or .xls file. NOT for CSV. |
| `sampleRows` | number | no | `5` | Number of sample data rows to show per sheet. |

### office_read_xlsx

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the Excel file. |
| `sheetName` | string | no | all sheets | Specific sheet name to read. Throws if sheet not found. |
| `maxRows` | number | no | `500` | Max rows to return per sheet. |
| `includeFormulas` | boolean | no | `false` | If true, list all cell formulas after the data. |
| `outputFormat` | string | no | `"text"` | `"text"` (tab-separated) or `"json"` (array of arrays). |
| `summaryOnly` | boolean | no | `false` | Headers + row count only (no data). Fast for large files. |

### office_write_xlsx

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path. Created if it does not exist. |
| `sheetData` | object | no | - | Bulk write: `{ "SheetName": [[row1], [row2], ...] }`. First row = headers. Values starting with `=` become formulas. |
| `autoFormat` | boolean | no | `false` | When true with `sheetData`: dark blue header, alternating row fills, frozen header, auto-sized columns. |
| `operations` | array | no | - | Fine-grained operations array. See Operations Reference below. |

### office_chart_xlsx

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the Excel file. |
| `charts` | array | yes | - | Array of chart definitions. See Charts Reference below. |

### office_read_csv

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to CSV or TSV file. |
| `delimiter` | string | no | auto-detect | Field delimiter. Auto-detects `,` vs `\t`. |
| `hasHeader` | boolean | no | `true` | Whether first row is a header row. |
| `startRow` | number | no | `1` | First data row to return (1-indexed, after header). |
| `endRow` | number | no | `200` | Last data row to return. |
| `outputFormat` | string | no | `"text"` | `"text"` or `"json"` (array of objects with headers as keys). |

### office_write_csv

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the CSV file. |
| `rows` | array | yes | - | 2D array. First row should be headers. Example: `[["Name","Age"],["Alice",30]]`. |
| `delimiter` | string | no | `","` | Field delimiter. |
| `append` | boolean | no | `false` | If true, append rows to existing file instead of overwriting. |

### office_csv_to_xlsx

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `source` | string | yes | - | Absolute path to the source CSV file. |
| `output` | string | yes | - | Absolute path for the output .xlsx file. |
| `sheetName` | string | no | `"Data"` | Name for the worksheet. |
| `autoFormat` | boolean | no | `true` | Header styling, alternating rows, frozen header, auto-sized columns. |
| `delimiter` | string | no | auto-detect | CSV field delimiter. |

### office_python_dashboard

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to source .xlsx, .xls, or .csv file. |
| `pythonScript` | string | yes | - | Complete Python script following the `excel-dashboard.md` template. |
| `outputPath` | string | no | `*_Dashboard.xlsx` | Absolute path for the output dashboard file. |

### office_validate_dashboard

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | - | Absolute path to the dashboard .xlsx file. |
| `sourcePath` | string | no | - | Path to source CSV/XLSX for cross-validation of formula column references. |

---

## Operations Reference (office_write_xlsx)

The `operations` array supports the following operation types:

### set_cell
Set a single cell's value, formula, and/or style.

```json
{
  "type": "set_cell",
  "sheet": "Summary",
  "cell": "B5",
  "value": "=SUM(Data!B2:B100)",
  "financial_type": "formula",
  "style": { "bold": true, "numFormat": "#,##0" }
}
```

- `value`: Any value. Strings starting with `=` auto-become formulas.
- `formula`: Alternative to value for explicit formulas (without leading `=`).
- `financial_type`: Applies financial color coding (see below).
- `style`: See Style Properties below.

### set_range
Write a 2D data array starting at a cell.

```json
{
  "type": "set_range",
  "sheet": "Data",
  "range": "A1",
  "data": [["Month", "Revenue"], ["Jan", "=100*12"], ["Feb", "=150*12"]]
}
```

### add_sheet
Create a new sheet, optionally with initial data.

```json
{ "type": "add_sheet", "name": "Analysis", "data": [["Metric", "Value"]] }
```

### format_range
Apply styling to a range of cells.

```json
{
  "type": "format_range",
  "sheet": "Summary",
  "range": "A1:D1",
  "style": { "bold": true, "bgColor": "1E3A5F", "fontColor": "FFFFFF", "fontSize": 12 }
}
```

### freeze_panes
Freeze rows/columns for scrolling.

```json
{ "type": "freeze_panes", "sheet": "Data", "row": 1, "col": 0 }
```

### set_column_width
Set column width (single or batch).

```json
{ "type": "set_column_width", "sheet": "Data", "col": "A", "width": 20 }
```
Or batch: `{ "type": "set_column_width", "sheet": "Data", "cols": [{"col": "A", "width": 20}, {"col": "B", "width": 15}] }`

### set_row_height
```json
{ "type": "set_row_height", "sheet": "Data", "row": 1, "height": 25 }
```

### merge_cells
```json
{ "type": "merge_cells", "sheet": "Dashboard", "range": "A1:D1" }
```

### create_table
Apply table styling with header formatting, alternating row fills, and auto-filter.

```json
{ "type": "create_table", "sheet": "Data", "range": "A1:E20", "tableName": "SalesData" }
```

### auto_fit_columns
Auto-size all columns based on content (samples first 100 rows).

```json
{ "type": "auto_fit_columns", "sheet": "Data" }
```

### auto_sum
Write a SUM formula to a target cell.

```json
{ "type": "auto_sum", "sheet": "Data", "sourceRange": "B2:B100", "targetCell": "B101" }
```

### add_comment
Add a cell comment/note.

```json
{ "type": "add_comment", "sheet": "Data", "cell": "A1", "comment": "This is the primary key column" }
```

---

## Style Properties

Used in `set_cell` style, `format_range` style, and `auto_sum` style:

| Property | Type | Example | Description |
|----------|------|---------|-------------|
| `bold` | boolean | `true` | Bold font |
| `italic` | boolean | `true` | Italic font |
| `fontSize` | number | `12` | Font size in points |
| `fontColor` | string | `"FF0000"` | Hex color without `#`. Prefix `FF` added for ARGB. |
| `fontName` | string | `"Calibri"` | Font family |
| `bgColor` | string | `"1E3A5F"` | Cell background fill color (hex without `#`). |
| `numFormat` | string | `"#,##0.00"` | Excel number format string |
| `align` | string | `"center"` | Horizontal alignment: left, center, right |
| `valign` | string | `"middle"` | Vertical alignment: top, middle, bottom |
| `wrapText` | boolean | `true` | Wrap text in cell |
| `border` | boolean/string | `true` or `"medium"` | `true` = thin border. String = border style. |

---

## Financial Color Coding Convention

When building financial models, use `financial_type` on `set_cell` operations to apply industry-standard color coding:

| financial_type | Font Color | Fill | Use For |
|---------------|------------|------|---------|
| `input` | Blue (0000FF) | none | Values the user can change (assumptions, inputs) |
| `formula` | Black (000000) | none | Calculated values using formulas |
| `cross_sheet` | Green (008000) | none | References to other sheets (`=Summary!B5`) |
| `external` | Red (FF0000) | none | References to external workbooks |
| `assumption` | Black (000000) | Yellow (FFFF00) | Key assumptions that drive the model |

**Example:**
```json
[
  { "type": "set_cell", "sheet": "Model", "cell": "B3", "value": 0.05, "financial_type": "assumption" },
  { "type": "set_cell", "sheet": "Model", "cell": "B5", "value": "=B3*B4", "financial_type": "formula" },
  { "type": "set_cell", "sheet": "Model", "cell": "B7", "value": "=Summary!C10", "financial_type": "cross_sheet" }
]
```

---

## Charts Reference (office_chart_xlsx)

Each chart definition in the `charts` array:

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `type` | string | no | `"column"` | Chart type: `column`, `bar`, `line`, `pie`, `area`, `scatter`, `stacked_column`, `stacked_bar` |
| `title` | string | no | `""` | Chart title displayed above the chart |
| `dataSheet` | string | yes | - | Sheet containing the source data |
| `dataRange` | string | yes | - | Cell range, e.g. `"A1:C13"`. First column = categories/x-axis, remaining columns = data series |
| `targetSheet` | string | no | `"Charts"` | Sheet where chart is inserted. Created if it does not exist. |
| `anchor` | string | no | auto | Top-left cell for placement, e.g. `"A1"`. Auto-assigned if omitted. |
| `xTitle` | string | no | - | X-axis label |
| `yTitle` | string | no | - | Y-axis label |
| `width` | number | no | `15` | Chart width in cm |
| `height` | number | no | `10` | Chart height in cm |

**Data range format:** The first column is ALWAYS categories/x-axis labels. All subsequent columns are data series. Row 1 contains headers (used as series names when `titles_from_data=True`).

**Example data layout for `dataRange: "A1:C13"`:**
```
| Month | Revenue | Expenses |
|-------|---------|----------|
| Jan   | 50000   | 35000    |
| Feb   | 52000   | 36000    |
...
```

**Pie charts** are special: only the first data column (column 2) is used as values. The first column provides category labels.

**Example call:**
```json
{
  "path": "/path/to/workbook.xlsx",
  "charts": [
    {
      "type": "column",
      "title": "Monthly Revenue vs Expenses",
      "dataSheet": "Data",
      "dataRange": "A1:C13",
      "targetSheet": "Charts",
      "yTitle": "Amount ($)"
    },
    {
      "type": "pie",
      "title": "Revenue by Region",
      "dataSheet": "Summary",
      "dataRange": "A1:B5",
      "targetSheet": "Charts"
    }
  ]
}
```

---

## Procedure: Standard Excel Workflow

### Step 1: Analyze the data first

ALWAYS call `office_analyze_xlsx` before any write/chart operation:

```
office_analyze_xlsx({ path: "/path/to/data.xlsx" })
```

This gives you:
- All sheet names and dimensions (rows x columns)
- Column headers, data types, and statistics
- Sample rows
- Cross-sheet formula references
- Everything needed to write correct formulas and chart ranges

### Step 2: Write data with formulas

```
office_write_xlsx({
  path: "/path/to/output.xlsx",
  sheetData: {
    "Data": [
      ["Month", "Revenue", "Expenses", "Profit"],
      ["Jan", 50000, 35000, "=B2-C2"],
      ["Feb", 52000, 36000, "=B3-C3"],
      ["Total", "=SUM(B2:B3)", "=SUM(C2:C3)", "=SUM(D2:D3)"]
    ]
  },
  autoFormat: true
})
```

### Step 3: Add charts

```
office_chart_xlsx({
  path: "/path/to/output.xlsx",
  charts: [{
    type: "column",
    title: "Revenue vs Expenses",
    dataSheet: "Data",
    dataRange: "A1:C3",
    targetSheet: "Charts"
  }]
})
```

### Step 4: Add formatting refinements if needed

```
office_write_xlsx({
  path: "/path/to/output.xlsx",
  operations: [
    { "type": "format_range", "sheet": "Data", "range": "B2:D4", "style": { "numFormat": "#,##0" } },
    { "type": "set_column_width", "sheet": "Data", "cols": [{"col": "A", "width": 12}, {"col": "B", "width": 15}] }
  ]
})
```

---

## Procedure: Large CSV to Excel

For CSVs with more than a few hundred rows, NEVER do `office_read_csv` + `office_write_xlsx` (this would truncate at 200 rows and waste context). Instead:

```
office_csv_to_xlsx({
  source: "/path/to/large-data.csv",
  output: "/path/to/large-data.xlsx",
  sheetName: "Data",
  autoFormat: true
})
```

This reads ALL rows directly, applies type coercion (numbers stay numeric), and optionally formats with header styling, alternating rows, frozen header, and auto-sized columns.

---

## Procedure: Dashboard Building

For comprehensive dashboards, follow the `excel-dashboard.md` skill guide. The abbreviated workflow:

1. **Analyze the data**: `office_analyze_xlsx` or `office_read_csv`
2. **Read the skill guide**: `fs_read` on `excel-dashboard.md` in the skills folder
3. **Design the dashboard**: KPIs, charts, analysis sheets
4. **Write the Python script**: Follow the template in the skill guide
5. **Build**: `office_python_dashboard`
6. **Validate**: `office_validate_dashboard` -- must score 24/25 or higher
7. **Fix and rebuild if needed** (see `dashboard-review.md`)

The `office_python_dashboard` tool pre-injects `SOURCE`, `OUTPUT`, `RESULT_PATH`, `write_result()`, `wb`, `df`, and the Data sheet. Your script should ONLY create analysis sheets and the dashboard sheet. Never redefine the framework variables.

---

## Known Issues & Gotchas

1. **Formulas vs hardcoded values**: NEVER write hardcoded numeric values where a formula should be. KPIs like "Total Revenue: 2400000" should be `=SUM(Data!B:B)`. The validate tool checks for this.

2. **`office_analyze_xlsx` on CSV files**: This will fail with "Can't find end of central directory" because CSVs are not ZIP archives. If passed a CSV, the tool now has a built-in fallback that uses `csv-parse` to show headers and sample rows, but it is better to use `office_read_csv` directly.

3. **sheetData formula detection**: Cell values starting with `=` in both `sheetData` 2D arrays AND `set_cell` operations are automatically stored as Excel formulas. The `=` prefix is stripped and the remainder becomes the formula text.

4. **Existing files**: `office_write_xlsx` opens existing files and merges changes. If the file exists, it reads it first with ExcelJS, then applies your `sheetData` and `operations` on top. This means you can add sheets or modify cells without losing existing content.

5. **autoFormat with sheetData**: When `autoFormat=true`, the tool applies: dark blue header row (white bold text), alternating row fills (light blue), frozen header row, and auto-sized columns (sampled from first 100 rows, capped at 45 characters width).

6. **Chart creation uses openpyxl (Python)**: `office_chart_xlsx` delegates to a Python script using openpyxl. This means charts are real Excel chart objects (not images). The Python script is run with a JSON config file, not inline arguments.

7. **Auto-positioning of charts**: If `anchor` is omitted, charts are auto-placed on the target sheet. First chart at A1, second at I1, third at A23, and so on in a 2-column grid with 22-row spacing.

8. **Number format strings**: Use Excel-compatible format strings. Common ones: `#,##0` (integer with commas), `#,##0.00` (2 decimal places), `$#,##0.00` (currency), `0.0%` (percentage), `yyyy-mm-dd` (date).

9. **Column identifiers in operations**: `set_column_width` accepts `col` (letter like "A"), `column` (letter), or `cols` (array of {col, width} objects). All three work.

10. **CSV delimiter auto-detection**: Both `office_read_csv` and `office_csv_to_xlsx` compare tab-split count vs comma-split count on the first line to auto-detect the delimiter. Override with the `delimiter` parameter if auto-detection fails.

---

## Node.js Dependencies

| Package | Used By |
|---------|---------|
| `exceljs` | office_write_xlsx, office_analyze_xlsx, office_csv_to_xlsx |
| `xlsx` (SheetJS) | office_read_xlsx |
| `openpyxl` (Python) | office_chart_xlsx, office_python_dashboard, office_validate_dashboard |
| `pandas` (Python) | office_python_dashboard |
