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

The framework **pre-initializes everything** before your script runs:
- `wb` — openpyxl.Workbook, already has the Data sheet populated from SOURCE
- `df` — pandas DataFrame with all source rows already loaded
- All imports: `pandas as pd`, `numpy as np`, `openpyxl`, all openpyxl submodules
- All styling helpers: `COLORS`, `CHART_PALETTE`, `h()`, `ft()`, `al()`, `brd()`, `set_col_width()`
- All layout helpers: `kpi_card()`, `write_section_header()`, `build_dashboard_shell()`
- All chart helpers: `add_bar_chart()`, `add_line_chart()`, `add_pie_chart()`
- Analysis helpers: `build_analysis_sheet()`, `style_analysis_header()`, `style_analysis_row()`, `safe_cell()`

**Your script must NOT:**
- Create `wb = openpyxl.Workbook()` — already done
- Load `df = pd.read_csv/excel(SOURCE)` — already done
- Call `build_data_sheet(wb, df)` — already done

**Your script must:**
1. Create analysis sheets
2. Call `build_dashboard_shell(wb, title, subtitle)`
3. Add KPI cards and charts
4. Call `wb.save(OUTPUT)` + `write_result({'ok': True, ...})`

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

> **`wb`, `df`, and the Data sheet are PRE-INITIALIZED by the framework.**
> Do NOT write `wb = openpyxl.Workbook()`, `df = pd.read_csv(SOURCE)`, or `build_data_sheet(wb, df)`.
> Your script starts at step D (dimension setup) and ends at step H (save + write_result).

```python
# ── D. Dimensions — collect unique values for analysis sheets ─────────────────
# df and wb are pre-initialized. df has all rows from SOURCE.
try:
    N = len(df)

    # ← CUSTOMIZE: replace with your actual column names from the data exploration
    CATEGORY_COL = 'Exit_Reason'   # text column with < 50 unique values
    VALUE_COL    = 'Net_PnL'       # primary numeric column
    DATE_COL     = 'Entry_Date'    # date column (or None if no dates)

    # Parse dates if not already parsed
    if DATE_COL and DATE_COL in df.columns:
        df[DATE_COL] = pd.to_datetime(df[DATE_COL], errors='coerce')

    date_cols = df.select_dtypes(include='datetime').columns.tolist()
    num_cols  = df.select_dtypes(include='number').columns.tolist()

    categories = sorted(df[CATEGORY_COL].dropna().unique().tolist()) if CATEGORY_COL else []
    months = []
    if DATE_COL and DATE_COL in df.columns:
        df['_Month'] = df[DATE_COL].dt.to_period('M').astype(str)
        months = sorted(df['_Month'].dropna().unique().tolist())

    # Dynamic column letters — NEVER hardcode 'B', 'C' etc.
    VALUE_LETTER    = get_column_letter(df.columns.get_loc(VALUE_COL) + 1)    if VALUE_COL    else 'B'
    CATEGORY_LETTER = get_column_letter(df.columns.get_loc(CATEGORY_COL) + 1) if CATEGORY_COL else 'A'

    print(f'  N={N} | categories={len(categories)} | months={len(months)}')

except Exception as e:
    write_result({'ok': False, 'error': f'Dimension setup failed: {e}'}); sys.exit(1)

# ── E. Analysis sheets — MUST be created BEFORE the Dashboard ────────────────
# Option A: build_analysis_sheet() — one call from a DataFrame (recommended)
try:
    # Example: group by exit reason → Net PnL + count
    by_exit = df.groupby(CATEGORY_COL)[VALUE_COL].agg(['sum', 'count']).reset_index()
    by_exit.columns = [CATEGORY_COL, f'Total {VALUE_COL}', 'Count']
    ws_exit = build_analysis_sheet(wb, 'By Exit Reason', by_exit, color_key='NAVY')

    # Example: monthly aggregation
    if months:
        by_month = df.groupby('_Month')[VALUE_COL].agg(['sum', 'count']).reset_index()
        by_month.columns = ['Month', f'Total {VALUE_COL}', 'Trades']
        ws_month = build_analysis_sheet(wb, 'By Month', by_month, color_key='TEAL')

except Exception as e:
    write_result({'ok': False, 'error': f'Analysis sheets failed: {e}'}); sys.exit(1)

# Option B: manual with SUMIF formulas (use when you need live Excel formulas in analysis sheets)
# try:
#     ws_sym = wb.create_sheet('By Symbol')
#     symbols = sorted(df['Symbol'].dropna().unique())
#     SYM_COL = get_column_letter(df.columns.get_loc('Symbol') + 1)
#     style_analysis_header(ws_sym, ['Symbol', f'Total {VALUE_COL}', 'Count'])
#     for r, sym in enumerate(symbols, 2):
#         ws_sym.cell(r, 1, sym)
#         ws_sym.cell(r, 2).value = f'=SUMIF(Data!{SYM_COL}:{SYM_COL},A{r},Data!{VALUE_LETTER}:{VALUE_LETTER})'
#         ws_sym.cell(r, 3).value = f'=COUNTIF(Data!{SYM_COL}:{SYM_COL},A{r})'
#         style_analysis_row(ws_sym, r, 3)
#     set_col_width(ws_sym)
# except Exception as e:
#     write_result({'ok': False, 'error': f'By Symbol failed: {e}'}); sys.exit(1)

# ── F. Dashboard sheet ────────────────────────────────────────────────────────
try:
    title    = 'PERFORMANCE DASHBOARD'    # ← CUSTOMIZE
    subtitle = f'  {N:,} records | Generated {datetime.today().strftime("%B %d, %Y")}'

    dash = build_dashboard_shell(wb, title, subtitle)

    # KPI cards — row 6, each 3 columns wide (4 cards × 3 cols = 12 cols)
    kpi_card(row=6, col=1,  label='Total Trades',
             formula='=COUNTA(Data!A:A)-1', fmt='#,##0', n_cols=3)
    kpi_card(row=6, col=4,  label=f'Total {VALUE_COL}',
             formula=f'=SUM(Data!{VALUE_LETTER}:{VALUE_LETTER})',
             fmt='#,##0.00', n_cols=3)
    kpi_card(row=6, col=7,  label='Win Rate',
             formula='=IFERROR(COUNTIF(Data!O:O,"Yes")/(COUNTA(Data!A:A)-1),0)',
             fmt='0.0%', n_cols=3)
    kpi_card(row=6, col=10, label=f'Avg {VALUE_COL}',
             formula=f'=IFERROR(AVERAGE(Data!{VALUE_LETTER}:{VALUE_LETTER}),0)',
             fmt='#,##0.00', n_cols=3)

    # Charts
    add_bar_chart(dash, ws_exit,
                  title=f'{VALUE_COL} by {CATEGORY_COL}',
                  n_data_rows=len(by_exit),
                  data_col=2, cat_col=1, anchor=f'A{CHART_ROW}',
                  color=CHART_PALETTE[0])

    if months:
        add_line_chart(dash, ws_month,
                       title=f'{VALUE_COL} Over Time',
                       n_data_rows=len(by_month),
                       data_col=2, cat_col=1, anchor=f'G{CHART_ROW}',
                       color=CHART_PALETTE[2])

    add_pie_chart(dash, ws_exit,
                  title=f'Trade Count by {CATEGORY_COL}',
                  n_slices=len(by_exit),
                  data_col=3, cat_col=1, anchor=f'A{CHART_ROW + 15}')

    print('  Dashboard: done')

except Exception as e:
    write_result({'ok': False, 'error': f'Dashboard failed: {e}'}); sys.exit(1)

# ── G. Save + Report ──────────────────────────────────────────────────────────
try:
    wb.save(OUTPUT)
    write_result({
        'ok': True,
        'sheets': [ws.title for ws in wb.worksheets],
        'summary': f'{N:,} rows | KPIs use live Excel formulas'
    })
except Exception as e:
    write_result({'ok': False, 'error': f'Save failed: {e}'}); sys.exit(1)
```

---

## Section 4: Framework API Reference

All of these are pre-injected. `wb` and `df` are also pre-initialized — do not recreate them.

### Pre-initialized globals
- `wb` — `openpyxl.Workbook` with the Data sheet already built from SOURCE
- `df` — `pandas.DataFrame` with all source rows
- `N = len(df)` — compute it yourself if needed

### `build_analysis_sheet(wb, name, df_agg, color_key='BLUE')`
**Preferred** way to create analysis sheets. Creates a styled sheet from a pandas DataFrame — handles header, alternating rows, column widths. Returns the worksheet.
```python
by_exit = df.groupby('Exit_Reason')['Net_PnL'].agg(['sum','count']).reset_index()
by_exit.columns = ['Exit Reason', 'Net PnL', 'Count']
ws = build_analysis_sheet(wb, 'By Exit Reason', by_exit)
```

### `build_data_sheet(wb, df, colorscale_cols=[])`
Already called automatically. Do not call again.

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

6. **DO NOT recreate wb or df** — already initialized. Do not call `openpyxl.Workbook()`, `pd.read_csv()`, or `build_data_sheet()`.

7. **DO NOT redefine framework helpers** — `COLORS`, `h()`, `ft()`, `kpi_card()`, `build_analysis_sheet()`,
   `build_dashboard_shell()`, `add_bar_chart()`, `add_line_chart()`, `add_pie_chart()` etc. are all
   pre-injected. Using your own versions breaks the GOLD STANDARD formatting.

8. **DO NOT re-import pandas or openpyxl** — already imported by the framework.

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
