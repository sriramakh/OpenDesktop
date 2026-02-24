# Excel Dashboard Skill Guide (Python — pandas + openpyxl)

## Section 1: When to Use

Use `office_python_dashboard` (NOT `office_dashboard_xlsx`, NOT `excel_vba_dashboard`) when the user says:
- "build a dashboard", "create a dashboard", "make a dashboard"
- "create a report", "build a report", "generate a report"
- "visualize this data", "make an interactive dashboard"
- "analyze this spreadsheet", "data visualization"
- "make charts from this", "summarize this data visually"
- "build me something useful from this file"
- "turn this into a dashboard", "make this data readable"

**ALWAYS use `office_python_dashboard`** — it runs a Python script (pandas + openpyxl) in a sandboxed
subprocess and produces a polished `.xlsx` file with a Dashboard sheet, Analysis sheets, and KPI cards
backed by live Excel formulas. The output opens directly in Excel or Google Sheets with no macros required.

---

## Section 2: 6-Step Agentic Workflow

Follow these steps in order. Do not skip any step.

### Step 1 — EXPLORE

Call `office_read_csv` (or `office_read_xlsx`) on the source file.

From the output, identify and record:
- **Column names** and inferred data types (date, numeric, text, boolean)
- **Date columns**: columns that look like dates/timestamps
- **Numeric columns**: revenue, quantity, profit, score, price, amount, count, etc.
- **Categorical columns**: product, region, category, status, type — any text column with < 50 unique values
- **Row count**
- **Key relationships**: date column + numeric column → time-series charts possible

### Step 2 — IDEATE

Think out loud. Choose:

**KPIs (pick 4–6):** Total count, Sum of primary value, Rate/percentage, Average, Max/Min

**Charts (pick 3–5):**
- `add_bar_chart()` — category comparisons
- `add_line_chart()` — trends over time (only if date column exists)
- `add_pie_chart()` — composition / share (max 7 slices)

**Sheet structure:**
- Sheet 1: `Dashboard` (KPI cards + charts, no raw data)
- Sheet 2: `Data` (original data — auto-built by `build_data_sheet()`)
- Sheet 3+: one Analysis sheet per major dimension (e.g., `By Category`, `By Month`)

### Step 3 — WRITE THE PYTHON SCRIPT

Write the script using the template in Section 3. The framework pre-injects:
- `SOURCE`, `OUTPUT`, `write_result()`, all error hooks
- `pandas as pd`, `openpyxl`, all openpyxl submodules
- **All styling helpers**: `COLORS`, `CHART_PALETTE`, `h()`, `ft()`, `al()`, `brd()`, `set_col_width()`
- **All layout helpers**: `kpi_card()`, `write_section_header()`, `build_data_sheet()`, `build_dashboard_shell()`
- **All chart helpers**: `add_bar_chart()`, `add_line_chart()`, `add_pie_chart()`
- **Analysis helpers**: `style_analysis_header()`, `style_analysis_row()`

**DO NOT redefine any of the above.** Your script only provides the data-specific logic.

### Step 4 — EXECUTE

Call `office_python_dashboard` with the complete script:

```json
{
  "tool": "office_python_dashboard",
  "path": "/path/to/source.csv",
  "output": "/path/to/output_dashboard.xlsx",
  "pythonScript": "... complete script from Step 3 ..."
}
```

### Step 5 — REVIEW

If the tool returns an error:
1. Read the full traceback returned in the tool result
2. Identify the exact line/cause
3. Fix and call `office_python_dashboard` again

Common fixes:
- Column not found → use exact name from Step 1 exploration
- Wrong formula reference → recalculate column letter with `get_column_letter(df.columns.get_loc('ColName') + 1)`
- Analysis sheet name mismatch → ensure Dashboard chart references exact sheet name

### Step 6 — REPORT

After success, tell the user:
- Which sheets were created and what each one shows
- What each KPI measures
- That KPI formulas are live (auto-recalculate when Data sheet is updated)

---

## Section 3: Complete Python Script Template

> **The framework injects all imports and helpers automatically.**
> Your script must NOT redefine: `SOURCE`, `OUTPUT`, `write_result()`, `COLORS`, `CHART_PALETTE`,
> `h()`, `ft()`, `al()`, `brd()`, `set_col_width()`, `kpi_card()`, `write_section_header()`,
> `build_data_sheet()`, `build_dashboard_shell()`, `add_bar_chart()`, `add_line_chart()`,
> `add_pie_chart()`, `style_analysis_header()`, `style_analysis_row()`,
> or any `import pandas`, `import openpyxl`, etc.
>
> Your script starts immediately after the framework — just write the data logic.

```python
# ── C. Data loading ───────────────────────────────────────────────────────────
try:
    if SOURCE.lower().endswith('.csv'):
        df = pd.read_csv(SOURCE)
    else:
        df = pd.read_excel(SOURCE)

    # ← CUSTOMIZE: parse known date columns by name (safer than auto-detect)
    for col_name in ['Date', 'OrderDate', 'Entry_Date']:   # ← replace with actual names
        if col_name in df.columns:
            df[col_name] = pd.to_datetime(df[col_name], errors='coerce')

    N = len(df)
    date_cols = df.select_dtypes(include='datetime').columns.tolist()
    num_cols  = df.select_dtypes(include='number').columns.tolist()
    cat_cols  = [c for c in df.select_dtypes(include='object').columns if df[c].nunique() < 50]

    print(f'Loaded {N} rows | date: {date_cols} | num: {num_cols[:4]} | cat: {cat_cols[:4]}')

except Exception as e:
    write_result({'ok': False, 'error': f'Data load failed: {e}'}); sys.exit(1)

# ── D. Dimensions — collect unique values for analysis sheets ─────────────────
try:
    # ← CUSTOMIZE: replace with your actual column names
    CATEGORY_COL = cat_cols[0] if cat_cols else None   # e.g. 'Category', 'Region'
    VALUE_COL    = num_cols[0] if num_cols else None    # e.g. 'Revenue', 'Net_PnL'
    DATE_COL     = date_cols[0] if date_cols else None  # e.g. 'Date', 'Entry_Date'

    categories = []
    months = []

    if CATEGORY_COL:
        categories = sorted(df[CATEGORY_COL].dropna().unique().tolist())

    if DATE_COL:
        df['_Month'] = df[DATE_COL].dt.to_period('M').astype(str)
        months = sorted(df['_Month'].dropna().unique().tolist())

    # Dynamic column letters — NEVER hardcode 'B', 'C' etc.
    VALUE_LETTER    = get_column_letter(df.columns.get_loc(VALUE_COL) + 1)    if VALUE_COL    else 'B'
    CATEGORY_LETTER = get_column_letter(df.columns.get_loc(CATEGORY_COL) + 1) if CATEGORY_COL else 'A'
    MONTH_LETTER    = get_column_letter(len(df.columns))  # _Month appended last

    print(f'  Categories ({CATEGORY_COL}): {len(categories)} | Months: {len(months)}')
    print(f'  Column letters — value:{VALUE_LETTER} category:{CATEGORY_LETTER} month:{MONTH_LETTER}')

except Exception as e:
    write_result({'ok': False, 'error': f'Dimension setup failed: {e}'}); sys.exit(1)

# ── E. Data sheet — one call, always GOLD STANDARD styling ───────────────────
try:
    wb = openpyxl.Workbook()
    # ← CUSTOMIZE: list numeric columns you want Red→White→Green color scale on
    data_ws = build_data_sheet(wb, df, colorscale_cols=[VALUE_COL] if VALUE_COL else [])
except Exception as e:
    write_result({'ok': False, 'error': f'Data sheet failed: {e}'}); sys.exit(1)

# ── F. Analysis sheets — MUST be created BEFORE the Dashboard ─────────────────

# ── F1. By Category ──────────────────────────────────────────────────────────
if CATEGORY_COL and VALUE_COL and categories:
    try:
        anal = wb.create_sheet('By Category')
        headers = [CATEGORY_COL, f'Total {VALUE_COL}', 'Count', f'Avg {VALUE_COL}']
        style_analysis_header(anal, headers, color_key='NAVY')

        for r, cat in enumerate(categories, 2):
            anal.cell(r, 1, cat)
            anal.cell(r, 2).value = f'=SUMIF(Data!{CATEGORY_LETTER}:{CATEGORY_LETTER},A{r},Data!{VALUE_LETTER}:{VALUE_LETTER})'
            anal.cell(r, 2).number_format = '#,##0.00'
            anal.cell(r, 3).value = f'=COUNTIF(Data!{CATEGORY_LETTER}:{CATEGORY_LETTER},A{r})'
            anal.cell(r, 3).number_format = '#,##0'
            anal.cell(r, 4).value = f'=IFERROR(B{r}/C{r},0)'
            anal.cell(r, 4).number_format = '#,##0.00'
            style_analysis_row(anal, r, 4)

        set_col_width(anal)
        print(f'  By Category: {len(categories)} categories')

    except Exception as e:
        write_result({'ok': False, 'error': f'By Category failed: {e}'}); sys.exit(1)

# ── F2. By Month ──────────────────────────────────────────────────────────────
if DATE_COL and VALUE_COL and months:
    try:
        time_ws = wb.create_sheet('By Month')
        headers = ['Month', f'Total {VALUE_COL}', 'Count']
        style_analysis_header(time_ws, headers, color_key='TEAL')

        for r, month_str in enumerate(months, 2):
            time_ws.cell(r, 1, month_str)
            time_ws.cell(r, 2).value = f'=SUMIF(Data!{MONTH_LETTER}:{MONTH_LETTER},A{r},Data!{VALUE_LETTER}:{VALUE_LETTER})'
            time_ws.cell(r, 2).number_format = '#,##0.00'
            time_ws.cell(r, 3).value = f'=COUNTIF(Data!{MONTH_LETTER}:{MONTH_LETTER},A{r})'
            time_ws.cell(r, 3).number_format = '#,##0'
            style_analysis_row(time_ws, r, 3, alt_color='ECFDF5')

        set_col_width(time_ws)
        print(f'  By Month: {len(months)} months')

    except Exception as e:
        write_result({'ok': False, 'error': f'By Month failed: {e}'}); sys.exit(1)

# ── G. Dashboard sheet ────────────────────────────────────────────────────────
try:
    # ← CUSTOMIZE: title and subtitle
    date_range = ''
    if DATE_COL and len(df) > 0:
        mn, mx = df[DATE_COL].min(), df[DATE_COL].max()
        if pd.notna(mn): date_range = f'  |  {mn.strftime("%b %Y")} – {mx.strftime("%b %Y")}'

    dash = build_dashboard_shell(
        wb,
        title    = 'PERFORMANCE DASHBOARD',   # ← CUSTOMIZE
        subtitle = f'  {N:,} records analyzed{date_range}  |  Generated {datetime.today().strftime("%B %d, %Y")}'
    )
    # CHART_ROW = 11 is pre-defined — do NOT use a variable, use the constant directly

    # ── G1. KPI cards (row 6, each 3 columns wide → 4 cards fill 12 cols) ────
    # ← CUSTOMIZE: adapt labels and formulas to your data
    kpi_card(dash, row=6, col=1,  label='Total Records',
             formula='=COUNTA(Data!A:A)-1', fmt='#,##0', n_cols=3)

    kpi_card(dash, row=6, col=4,  label=f'Total {VALUE_COL or "Value"}',
             formula=f'=SUM(Data!{VALUE_LETTER}:{VALUE_LETTER})',
             fmt='#,##0.00', n_cols=3)

    kpi_card(dash, row=6, col=7,  label=f'Average {VALUE_COL or "Value"}',
             formula=f'=IFERROR(AVERAGE(Data!{VALUE_LETTER}:{VALUE_LETTER}),0)',
             fmt='#,##0.00', n_cols=3)

    kpi_card(dash, row=6, col=10, label=f'Max {VALUE_COL or "Value"}',
             formula=f'=IFERROR(MAX(Data!{VALUE_LETTER}:{VALUE_LETTER}),0)',
             fmt='#,##0.00', n_cols=3)

    # ── G2. Charts ────────────────────────────────────────────────────────────
    # Bar chart: Category breakdown (left, row 11)
    if categories and 'By Category' in [ws.title for ws in wb.worksheets]:
        add_bar_chart(dash, wb['By Category'],
                      title=f'{VALUE_COL} by {CATEGORY_COL}',
                      n_data_rows=len(categories),
                      data_col=2, cat_col=1,
                      anchor=f'A{CHART_ROW}',
                      color=CHART_PALETTE[0])

    # Line chart: Monthly trend (right, row 11)
    if months and 'By Month' in [ws.title for ws in wb.worksheets]:
        add_line_chart(dash, wb['By Month'],
                       title=f'{VALUE_COL or "Value"} Over Time',
                       n_data_rows=len(months),
                       data_col=2, cat_col=1,
                       anchor=f'G{CHART_ROW}',
                       color=CHART_PALETTE[2])

    # Pie chart: Category share (left, row 26)
    if categories and 'By Category' in [ws.title for ws in wb.worksheets]:
        add_pie_chart(dash, wb['By Category'],
                      title=f'Share of {VALUE_COL} by {CATEGORY_COL}',
                      n_slices=len(categories),
                      data_col=2, cat_col=1,
                      anchor=f'A{CHART_ROW + 15}')

    print('  Dashboard: done')

except Exception as e:
    write_result({'ok': False, 'error': f'Dashboard failed: {e}'}); sys.exit(1)

# ── H. Save + Report ──────────────────────────────────────────────────────────
try:
    wb.save(OUTPUT)
    sheet_names = [ws.title for ws in wb.worksheets]
    write_result({
        'ok': True, 'saved': OUTPUT, 'sheets': sheet_names,
        'summary': f'{N:,} rows | {len(sheet_names)} sheets | KPIs use live Excel formulas'
    })
    print(f'Saved: {OUTPUT}  ({" → ".join(sheet_names)})')
except Exception as e:
    write_result({'ok': False, 'error': f'Save failed: {e}'}); sys.exit(1)
```

---

## Section 4: Framework API Reference

All of these are pre-injected. Use them directly — no import or redefinition needed.

### `build_data_sheet(wb, df, colorscale_cols=[])`
Creates a professional Data sheet on `wb.active`. Blue header, alternating rows, Excel Table, optional Red→White→Green color scale on numeric columns, frozen header, auto-widths. Returns the worksheet.

### `build_dashboard_shell(wb, title, subtitle='')`
Inserts Dashboard sheet at position 0. Adds navy title banner (rows 1-3), light subtitle (row 4), "KEY METRICS" section header (row 5), KPI rows 6-8 with correct heights, spacer row 9, "CHARTS & ANALYSIS" header (row 10). Sets the global `DASH` variable and **returns only the `dash` worksheet** (NOT a tuple). Charts always start at `CHART_ROW` (pre-defined as 11).

### `kpi_card(ws, row, col, label, formula, fmt='#,##0', n_cols=2)`
Draws a KPI card spanning `n_cols` columns, 3 rows tall. Thick blue top border, muted uppercase label, 24pt bold navy value. `formula` should be an Excel formula string like `'=SUM(Data!C:C)'`. Always pass `ws` explicitly (use `dash` returned by `build_dashboard_shell`). Use keyword args: `kpi_card(dash, row=6, col=1, label='...', formula='=...')`.

### `CHART_ROW`
Pre-defined constant = `11`. Use `anchor=f'A{CHART_ROW}'` for first chart row, `anchor=f'G{CHART_ROW}'` for second, `anchor=f'A{CHART_ROW+15}'` for a third row of charts.

### `add_bar_chart(dash, source_ws, title, n_data_rows, data_col=2, cat_col=1, anchor='A11', color=None, width=14, height=9)`
Adds a clustered column BarChart. `n_data_rows` = number of category rows (not including header). `anchor` = top-left cell string.

### `add_line_chart(dash, source_ws, title, n_data_rows, data_col=2, cat_col=1, anchor='G11', color=None, width=14, height=9)`
Adds a smooth LineChart. Same signature as `add_bar_chart`.

### `add_pie_chart(dash, source_ws, title, n_slices, data_col=2, cat_col=1, anchor='A26', width=14, height=9)`
Adds a PieChart capped at 7 slices.

### `style_analysis_header(ws, headers, color_key='NAVY')`
Writes a styled header row. `color_key` accepts a key from `COLORS` dict (e.g. `'NAVY'`, `'TEAL'`, `'AMBER'`, `'ORANGE'`, `'PURPLE'`) OR a raw hex string (e.g. `'1A1A2E'` or `'#1A1A2E'`).

### `style_analysis_row(ws, row, n_cols, alt_color='EFF6FF')`
Applies alternating fill to row `row`.

### `write_section_header(ws, row, col, text, n_cols=12)`
Navy banner row spanning `n_cols` columns.

### Color and Chart constants
```python
COLORS = {
    # Core brand
    'NAVY': '1A1A2E', 'BLUE': '2E4057', 'TEAL': '048A81',
    'AMBER': 'F4A261', 'RED': 'E76F51', 'GREEN': '2ECC71',
    'LIGHT_BG': 'F5F7FA', 'CARD_BG': 'FFFFFF', 'MUTED': '94A3B8',
    'DARK_TEXT': '1E293B', 'MID_TEXT': '475569',
    # Extended palette (also available)
    'ORANGE': 'F97316', 'PURPLE': '7C3AED', 'PINK': 'EC4899',
    'CYAN': '06B6D4', 'LIME': '84CC16', 'INDIGO': '4F46E5',
    'YELLOW': 'EAB308', 'GRAY': '6B7280', 'WHITE': 'FFFFFF',
    'BLACK': '000000', 'DARK': '1E293B',
}
CHART_PALETTE = ['2E4057', 'E76F51', '048A81', 'F4A261', '6B4EFF', '2ECC71', 'E74C3C', 'F39C12']
CHART_ROW = 11   # Dashboard charts start at row 11
```

---

## Section 5: KPI Formula Library

```
Total count:           =COUNTA(Data!A:A)-1
Sum of column C:       =SUM(Data!C:C)
Average:               =AVERAGE(Data!C:C)
Max:                   =MAX(Data!C:C)
Min:                   =MIN(Data!C:C)
Win rate (col O=Yes):  =IFERROR(COUNTIF(Data!O:O,"Yes")/(COUNTA(Data!A:A)-1),0)
SUMIF by category:     =SUMIF(Data!B:B,"Category A",Data!C:C)
YTD sum:               =SUMIF(Data!A:A,">="&DATE(YEAR(TODAY()),1,1),Data!C:C)
COUNTIFS dual cond:    =COUNTIFS(Data!B:B,"Cat A",Data!D:D,">0")
```

---

## Section 6: Critical Rules

> **The framework validates your script at exit. Violations print FRAMEWORK ERROR/WARNING to the log.**

### MANDATORY — Will cause FRAMEWORK ERROR if violated:

**RULE 1: ALWAYS call `build_dashboard_shell()`**

The Dashboard sheet MUST be created with `build_dashboard_shell()`. Never create a sheet named "Dashboard" manually.

```python
# ✅ CORRECT
dash = build_dashboard_shell(wb, 'MY DASHBOARD', 'Subtitle text here')

# ❌ WRONG — never do this
dash = wb.create_sheet('Dashboard')  # bypasses all Gold Standard formatting
```

**RULE 2: KPI formulas MUST be Excel formula strings — NEVER hardcode numbers**

```python
# ✅ CORRECT — live formula, recalculates when Data changes
kpi_card(dash, row=6, col=1, label='Total Trades', formula='=COUNTA(Data!A:A)-1', n_cols=3)
kpi_card(dash, row=6, col=4, label='Net PnL',      formula='=SUM(Data!L:L)',       n_cols=3)
kpi_card(dash, row=6, col=7, label='Win Rate',      formula='=IFERROR(COUNTIF(Data!P:P,"Yes")/(COUNTA(Data!A:A)-1),0)', fmt='0.0%', n_cols=3)

# ❌ WRONG — hardcoded numbers will never update and trigger FRAMEWORK WARNING
kpi_card(dash, row=6, col=1, label='Total Trades', formula=5002)         # 🚫
ws.cell(3, 2).value = 9589458.28                                          # 🚫
```

**RULE 3: Analysis sheet values MUST be SUMIF/COUNTIF formulas — not Python-computed numbers**

```python
# ✅ CORRECT — each row is a live formula referencing the Data sheet
for r, symbol in enumerate(symbols, 2):
    anal.cell(r, 1, symbol)
    anal.cell(r, 2).value = f'=SUMIF(Data!{SYM_COL}:{SYM_COL},A{r},Data!{NET_COL}:{NET_COL})'
    anal.cell(r, 3).value = f'=COUNTIF(Data!{SYM_COL}:{SYM_COL},A{r})'

# ❌ WRONG — hardcoded aggregates computed by Python
for symbol in df['Symbol'].unique():
    net_pnl = df[df['Symbol']==symbol]['Net_PnL'].sum()   # Python does the math
    anal.cell(r, 2, net_pnl)                               # 🚫 hardcoded number
```

**RULE 4: Analysis sheets MUST be created BEFORE the Dashboard**

`build_dashboard_shell()` inserts Dashboard at position 0. Create all `By X` sheets first.

**RULE 5: Chart `data_col` is 1-indexed into the SOURCE analysis sheet columns**

```python
# Analysis sheet headers: [Symbol, Net_PnL, Trades, Win_Rate]
# Net_PnL is column 2, Trades is column 3 — ALWAYS verify before passing data_col

anal_headers = ['Symbol', 'Net_PnL', 'Trades', 'Win_Rate']
# data_col=2 → Net_PnL  ✅
# data_col=3 → Trades   (wrong if you want Net_PnL chart)
add_bar_chart(dash, wb['By Symbol'], title='Net PnL by Symbol',
              n_data_rows=len(symbols), data_col=2, cat_col=1, anchor=f'A{CHART_ROW}')
```

---

### Additional rules:

6. **DO NOT redefine framework helpers** — `COLORS`, `h()`, `ft()`, `kpi_card()`, `build_data_sheet()`,
   `build_dashboard_shell()`, `add_bar_chart()`, `add_line_chart()`, `add_pie_chart()` etc. are all
   pre-injected. Using your own versions breaks the GOLD STANDARD formatting.

7. **DO NOT re-import pandas or openpyxl** — already imported by the framework.

8. **Use dynamic column letters** — never hardcode `'B'` or `'C'`. Always:
   ```python
   val_letter = get_column_letter(df.columns.get_loc('Revenue') + 1)
   ```

9. **Date parsing** — use `pd.to_datetime(df[col], errors='coerce')` (no `infer_datetime_format` — removed in pandas 2.x).

10. **For month grouping** — use `df[date_col].dt.to_period('M').astype(str)` → produces `'2024-03'` strings
    that work correctly as SUMIF criteria.

11. **Call `set_col_width(ws)` on every analysis sheet** — already done inside `build_data_sheet()`.

---

## Section 7: Error Recovery — Exact Fixes for Recurring Failures

Read this section whenever a dashboard build fails. Each error has ONE correct fix.

---

### ERROR: `kpi_card() got an unexpected keyword argument 'subtitle'`

**Cause**: `kpi_card` has no `subtitle` parameter. The function signature is:
```python
kpi_card(row, col, label, formula, ws=DASH, fmt='#,##0', n_cols=2)
```

**Fix**: Remove `subtitle=` entirely. Use `label=` for the card title.
```python
# ❌ WRONG
kpi_card(dash, row=6, col=1, label='Revenue', formula='=SUM(Data!C:C)', subtitle='USD')

# ✅ CORRECT
kpi_card(dash, row=6, col=1, label='Revenue (USD)', formula='=SUM(Data!C:C)')
```

---

### ERROR: `'str' object is not callable` + `[FRAMEWORK ERROR] build_dashboard_shell() was never called!`

**Cause**: A variable named `build_dashboard_shell` (or `kpi_card`, `add_bar_chart`, etc.) was assigned
a string value, which overwrites the framework function of the same name.

```python
# ❌ WRONG — this overwrites the build_dashboard_shell() function!
build_dashboard_shell = "High Volume Momentum Dashboard"   # 💥 function gone
dash = build_dashboard_shell(wb, title, subtitle)          # TypeError: 'str' not callable
```

**Fix**: Use a DIFFERENT variable name for any string you want to store.
```python
# ✅ CORRECT — use 'title' or 'dashboard_title', never 'build_dashboard_shell'
title    = "High Volume Momentum Dashboard"
subtitle = "Breakout Trades Analysis — 5002 Rows"
dash = build_dashboard_shell(wb, title, subtitle)
```

**COMPLETE LIST OF FORBIDDEN VARIABLE NAMES** (framework functions — never reassign these):
```
build_dashboard_shell    kpi_card         add_bar_chart     add_line_chart
add_pie_chart            build_data_sheet write_section_header
style_analysis_header    style_analysis_row   safe_cell
DASH    COLORS    CHART_ROW    CHART_PALETTE    h    ft    al    brd
```

---

### ERROR: `'MergedCell' object attribute 'value' is read-only`

**Cause**: Writing to a cell that is part of a merged range but is not the top-left cell.
This happens when iterating over rows that contain merged regions (e.g., the Dashboard title
banner or KPI card areas) and trying to set values on every cell.

**Fix 1**: Use `safe_cell(ws, row, col)` to safely write to any cell — it automatically
resolves merged ranges and returns the writable top-left cell.

```python
# ❌ WRONG — ws.cell(row, col) returns a MergedCell for non-top-left merged cells
ws.cell(6, 2).value = '=SUM(Data!C:C)'  # 💥 if (6,2) is inside a merge

# ✅ CORRECT — safe_cell unwraps merged ranges
safe_cell(ws, 6, 2).value = '=SUM(Data!C:C)'
```

**Fix 2**: Never iterate over all cells in a range that may contain merged cells and
try to set values. Only write to top-left cells or use `safe_cell()`.

```python
# ❌ WRONG — iterating merged range and writing to every cell
for row in dash.iter_rows(min_row=6, max_row=8):
    for cell in row:
        cell.value = None  # 💥 crashes on merged cells

# ✅ CORRECT — only write to specific non-merged cells, or use safe_cell
safe_cell(dash, 6, 1).value = None  # only the cell you actually need
```

---

### ERROR: `office_analyze_xlsx` fails with `Can't find end of central directory: is this a zip file?`

**Cause**: `office_analyze_xlsx` uses ExcelJS which expects ZIP-based `.xlsx` files.
CSV files are plain text — not ZIP archives — so ExcelJS throws this error.

**Fix**: For CSV source files, call `office_read_csv` instead.
```
# ❌ WRONG for CSV files
office_analyze_xlsx({ path: "/path/to/data.csv" })

# ✅ CORRECT for CSV files
office_read_csv({ path: "/path/to/data.csv", maxRows: 20 })

# ✅ Then build the dashboard — office_python_dashboard handles CSV automatically
office_python_dashboard({ path: "/path/to/data.csv", pythonScript: "..." })
```

---

### ERROR: `[FRAMEWORK WARNING] Dashboard has ZERO Excel formulas!` or hardcoded KPIs

**Cause**: `kpi_card` was called with a Python number instead of a formula string.

```python
# ❌ WRONG — formula is a number computed by Python
total = len(df)               # Python computes 5002
kpi_card(row=6, col=1, label='Total', formula=total)   # 💥 hardcoded

# ✅ CORRECT — formula is an Excel string that Excel evaluates live
kpi_card(row=6, col=1, label='Total', formula='=COUNTA(Data!A:A)-1')
```

**Complete KPI formula patterns:**
```python
kpi_card(row=6, col=1,  label='Total Records',  formula='=COUNTA(Data!A:A)-1')
kpi_card(row=6, col=4,  label='Total Revenue',   formula='=SUM(Data!C:C)')
kpi_card(row=6, col=7,  label='Average Value',   formula='=IFERROR(AVERAGE(Data!C:C),0)')
kpi_card(row=6, col=10, label='Win Rate',         formula='=IFERROR(COUNTIF(Data!E:E,"Win")/(COUNTA(Data!A:A)-1),0)', fmt='0.0%')
```

---

### ERROR: `analysis_has_formulas` fails in validation (0% formula rows)

**Cause**: Analysis sheet rows were populated with Python-computed values instead of Excel formulas.

```python
# ❌ WRONG — Python computes values, writes static numbers
by_cat = df.groupby('Category')['Revenue'].sum()
for cat, rev in by_cat.items():
    ws.cell(r, 1, cat)
    ws.cell(r, 2, rev)   # 💥 static Python float

# ✅ CORRECT — col A = category label, col B = live SUMIF formula
categories = df['Category'].unique()
REV_COL = get_column_letter(df.columns.get_loc('Revenue') + 1)
CAT_COL = get_column_letter(df.columns.get_loc('Category') + 1)
for r, cat in enumerate(sorted(categories), 2):
    ws.cell(r, 1, cat)
    ws.cell(r, 2).value = f'=SUMIF(Data!{CAT_COL}:{CAT_COL},A{r},Data!{REV_COL}:{REV_COL})'
    ws.cell(r, 3).value = f'=COUNTIF(Data!{CAT_COL}:{CAT_COL},A{r})'
```

12. **Wrap every section in try/except** → call `write_result({'ok': False, 'error': str(e)})` + `sys.exit(1)`.

13. **Pie charts: cap at 7 slices** — `add_pie_chart()` does this automatically.
