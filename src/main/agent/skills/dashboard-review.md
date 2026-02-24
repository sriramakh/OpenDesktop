# Dashboard Review & Self-Correction Skill

## Purpose
After every `office_python_dashboard` call, validate the output and automatically fix issues
until the dashboard scores ≥ 95% (≥ 24/25). This prevents silent failures from hardcoded values,
skipped framework functions, or broken chart references.

---

## When to Use
- Immediately after every successful `office_python_dashboard` call
- When the user asks to "check", "verify", or "review" a dashboard file
- When a previously built dashboard is suspected to have quality issues

---

## The Review Loop (max 3 attempts)

```
Step 1 — Build
  Call office_python_dashboard with your Python script.

Step 2 — Validate
  Call office_validate_dashboard({ path: outputPath })
  Read the score report carefully.

Step 3 — Assess
  If score == 25/25 → report GOLD STANDARD to user, done.
  If score >= 24/25 → acceptable, report score to user, done.
  If score < 24/25 → proceed to Step 4.

Step 4 — Fix & Rebuild (repeat up to 3 times)
  Apply ALL fixes from the Failed checks list (see Fix Table below).
  Rewrite the pythonScript with corrections.
  Call office_python_dashboard again with the same outputPath.
  Call office_validate_dashboard again.
  If score >= 24/25 → done.
  If still failing after 3 attempts → report to user with the specific failures.
```

---

## Fix Lookup Table

| Check Name | Category | Exact Fix |
|---|---|---|
| `dashboard_exists` | A | Call `build_dashboard_shell(wb, title, subtitle)` — it creates the "Dashboard" sheet |
| `dashboard_first` | A | Call `build_dashboard_shell()` AFTER creating all analysis sheets (it moves Dashboard to first position) |
| `data_sheet_exists` | A | Call `build_data_sheet(wb, df)` to create the "Data" sheet |
| `analysis_sheets_exist` | A | Add at least one analysis sheet (e.g. `wb.create_sheet("By Category")`) with aggregated data |
| `sheet_order_correct` | A | Create analysis sheets before calling `build_dashboard_shell()` |
| `title_banner_merged` | B | `build_dashboard_shell()` handles this automatically — make sure you call it |
| `title_banner_fill` | B | `build_dashboard_shell()` sets NAVY fill — ensure you haven't overwritten A1's fill |
| `title_font_large` | B | `build_dashboard_shell()` sets font size 24 — do not overwrite `dash['A1'].font` |
| `grid_lines_hidden` | B | `build_dashboard_shell()` hides grid lines — verify `dash.sheet_view.showGridLines = False` not reset |
| `kpi_cards_present` | B | Add ≥ 3 `kpi_card()` calls with `formula='=SUM(Data!C:C)'` on rows 6–8 |
| `kpi_all_formulas` | B | Replace every `kpi_card(..., formula=5002)` with `kpi_card(..., formula='=COUNTA(Data!A:A)-1')` |
| `charts_present` | B | Add ≥ 2 charts using `add_bar_chart()`, `add_line_chart()`, or `add_pie_chart()` |
| `kpi_reference_data` | C | KPI formulas must contain `Data!` — use `formula='=SUM(Data!C:C)'` not `=SUM(C:C)` |
| `no_hardcoded_kpis` | C | Search pythonScript for `formula=<number>` patterns and replace with Excel formula strings |
| `analysis_has_formulas` | C | At least 30% of rows in each analysis sheet must use Excel formulas like `=SUMIF(Data!B:B,A2,Data!C:C)`. Do NOT just copy Python-computed values. Use `style_analysis_row()` with formula strings. |
| `chart_refs_valid` | C | Chart data series must reference sheets that exist. Check `Reference(ws, ...)` where `ws` is a valid worksheet object from `wb` |
| `no_ref_errors_dashboard` | C | Check for typos in sheet names in Dashboard formulas; rebuild after fixing analysis sheet names |
| `no_ref_errors_analysis` | C | Fix broken cross-references in analysis sheets; use `=SUMIF(Data!B:B,A2,Data!C:C)` pattern |
| `data_has_headers` | D | `build_data_sheet(wb, df)` copies column names as headers automatically |
| `data_has_rows` | D | Ensure source file was loaded correctly with `pd.read_csv(SOURCE)` or `pd.read_excel(SOURCE)` |
| `data_header_styled` | D | `build_data_sheet()` applies NAVY fill to headers — do not overwrite row 1 fill |
| `data_no_errors` | D | Avoid placing Excel formula strings in Data sheet cells; Data sheet should contain raw values only |
| `analysis_headers_styled` | E | Call `style_analysis_header(ws, headers)` for row 1 of every analysis sheet |
| `analysis_min_rows` | E | Each analysis sheet needs ≥ 3 data rows — ensure groupby/aggregation produces enough categories |
| `analysis_no_errors` | E | Fix formula references in analysis sheets; broken `=SUMIF(...)` often means wrong column letter |

---

## Critical Rules (cause the most failures)

### Rule 1 — NEVER hardcode KPI values
```python
# ❌ WRONG — will fail kpi_all_formulas + no_hardcoded_kpis
kpi_card(dash, row=6, col=1, label='Total Revenue', formula=125000)
kpi_card(dash, row=6, col=3, label='Transactions', formula=5002)

# ✅ CORRECT — live Excel formulas
kpi_card(dash, row=6, col=1, label='Total Revenue', formula='=SUM(Data!C:C)')
kpi_card(dash, row=6, col=3, label='Transactions', formula='=COUNTA(Data!A:A)-1')
```

### Rule 2 — ALWAYS use Excel formulas in analysis sheets
```python
# ❌ WRONG — all Python-computed values, will fail analysis_has_formulas
for i, (cat, rev) in enumerate(by_cat.itertuples(), start=2):
    ws.cell(row=i, col=2).value = rev          # hardcoded Python float

# ✅ CORRECT — category labels in col A, Excel SUMIF formulas in col B
categories = df['Category'].unique()
for i, cat in enumerate(categories, start=2):
    ws.cell(row=i, column=1).value = cat
    ws.cell(row=i, column=2).value = f'=SUMIF(Data!B:B,A{i},Data!C:C)'
    ws.cell(row=i, column=3).value = f'=COUNTIF(Data!B:B,A{i})'
```

### Rule 3 — Build analysis sheets BEFORE calling build_dashboard_shell()
```python
# ✅ Correct order
ws_cat = wb.create_sheet('By Category')
# ... populate ws_cat ...
ws_month = wb.create_sheet('By Month')
# ... populate ws_month ...
dash = build_dashboard_shell(wb, 'Sales Dashboard', 'FY 2024')  # Dashboard becomes sheet[0]
```

### Rule 4 — Column references in SUMIF must match actual Data sheet columns
```python
# Get the correct column letter dynamically
col_letter = get_column_letter(df.columns.get_loc('Revenue') + 1)
ws.cell(row=i, column=2).value = f'=SUMIF(Data!B:B,A{i},Data!{col_letter}:{col_letter})'
```

---

## How to Report to User

After the final validation, always include the score in your response:

- **25/25**: "The dashboard passed all 25 Gold Standard checks — it's ready to use."
- **24/25**: "The dashboard scored 24/25 (96%) — Gold Standard quality. One minor issue: [describe]."
- **< 24/25**: "After [N] attempts, the dashboard scored [X]/25. The remaining issues are: [list]. Please review the file — the KPI values in cells [coords] may need manual correction."

---

## Quick Reference — 25 Check Names

```
A-Structure  : dashboard_exists, dashboard_first, data_sheet_exists,
               analysis_sheets_exist, sheet_order_correct
B-Layout     : title_banner_merged, title_banner_fill, title_font_large,
               grid_lines_hidden, kpi_cards_present, kpi_all_formulas, charts_present
C-Formulas   : kpi_reference_data, no_hardcoded_kpis, analysis_has_formulas,
               chart_refs_valid, no_ref_errors_dashboard, no_ref_errors_analysis
D-DataSheet  : data_has_headers, data_has_rows, data_header_styled, data_no_errors
E-Analysis   : analysis_headers_styled, analysis_min_rows, analysis_no_errors
```
