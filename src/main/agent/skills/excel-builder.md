# Excel Dashboard Builder — Agent Skill Guide

## Overview
Build professional Excel dashboards from CSV/XLSX data using the Excel Master engine.
20 tools for auto-building, adding charts/KPIs/tables, cell-level operations, and stateful editing with undo/redo.

## Workflow

### Step 1: Profile the data
```
excel_profile_data(path: "/path/to/data.csv")
```
Understand columns, types, row count, and distributions before building.

### Step 2: Auto-build a dashboard
```
excel_auto_build(path: "/path/to/data.csv")
```
Returns a `session_id` — use it with ALL subsequent excel_* tools.

### Step 3: Inspect the result
```
excel_query(session_id: "...", query: "list_objects")
excel_query(session_id: "...", query: "data_summary")
```
Discover object IDs (chart_0, table_0, kpi_row_0, etc.) for modification.

### Step 4: Modify iteratively
Add, modify, or remove objects as the user requests.

### Step 5: Save
```
excel_save(session_id: "...", output_path: "/path/to/output.xlsx")
```

## Templates

| Template | Industry | Description | Default Theme |
|----------|----------|-------------|---------------|
| executive_summary | General | Board KPIs, 2x2 charts, strategic focus | corporate_blue |
| hr_analytics | HR/People | Headcount, turnover, recruitment | hr_purple |
| dark_operational | Operations | Dense metrics, dark background | dark_mode |
| financial | Finance | P&L, budget variance, cash flow | finance_green |
| supply_chain | Logistics | Shipments, carriers, inventory | supply_green |
| marketing | Marketing | Campaigns, ROI, channels | marketing_orange |
| minimal_clean | General | Clean minimal styling | slate_minimal |

## Themes

| Key | Name | Best For |
|-----|------|----------|
| corporate_blue | Corporate Blue | Executive, general |
| hr_purple | HR Purple | People/HR data |
| dark_mode | Dark Mode | Dense operational |
| supply_green | Supply Green | Supply chain |
| finance_green | Finance Green | Financial reports |
| marketing_orange | Marketing Orange | Marketing/campaigns |
| slate_minimal | Slate Minimal | Clean, minimal |
| executive_navy | Executive Navy | C-Suite |

## Chart Types

| Type | Description |
|------|-------------|
| bar | Vertical bar chart |
| bar_horizontal | Horizontal bar chart |
| line | Line chart |
| pie | Pie chart |
| doughnut | Doughnut chart |
| area | Area chart |
| scatter | Scatter plot |
| combo | Combo chart (bar + line) |

## Tool Reference

### Build & Profile
- **excel_list_templates** — Show available templates
- **excel_list_themes** — Show available themes
- **excel_profile_data(path)** — Profile dataset before building
- **excel_auto_build(path, output_path?, template?, theme?)** — Full auto-build

### Dashboard Objects
- **excel_add_chart(session_id, type, x_column, y_columns, ...)** — Add chart
- **excel_add_kpi_row(session_id, kpis)** — Add KPI metric tiles
- **excel_add_table(session_id, table_type?, columns?, ...)** — Add data/pivot table
- **excel_add_content(session_id, content_type, text, ...)** — Add title/header/text
- **excel_modify_object(session_id, object_id, changes)** — Modify by ID
- **excel_remove_object(session_id, object_id)** — Remove by ID

### Cell-Level Operations
- **excel_write_cells(session_id, writes)** — Write values/formulas/formatting
- **excel_format_range(session_id, range, ...)** — Format cell ranges

### Excel Features
- **excel_add_feature(session_id, feature, ...)** — Conditional formatting, validation, freeze panes, zoom, merge, hyperlinks, comments, images

### Workbook Management
- **excel_sheet_op(session_id, operation, ...)** — Create/rename/delete/reorder sheets
- **excel_row_col_op(session_id, target, operation, index, ...)** — Resize/hide rows/cols
- **excel_change_theme(session_id, theme)** — Change color theme
- **excel_query(session_id, query, ...)** — Read-only inspection

### Session Control
- **excel_undo(session_id)** — Undo last action
- **excel_redo(session_id)** — Redo undone action
- **excel_save(session_id, output_path?)** — Save to XLSX

## KPI Format Reference

```json
{
  "kpis": [
    {
      "label": "Total Revenue",
      "column": "revenue",
      "aggregation": "sum",
      "format": "currency",
      "prefix": "$"
    },
    {
      "label": "Avg Order Value",
      "column": "order_value",
      "aggregation": "avg",
      "format": "decimal"
    },
    {
      "label": "Total Orders",
      "column": "order_id",
      "aggregation": "count",
      "format": "number"
    }
  ]
}
```

Aggregation options: sum, avg, count, max, min, median, distinct_count
Format options: number, currency, percentage, decimal, integer

## Conditional Formatting Reference

### 3-Color Scale
```json
{
  "feature": "conditional_format",
  "range": "C2:C50",
  "rule_type": "3_color_scale",
  "min_color": "#FF0000",
  "mid_color": "#FFFF00",
  "max_color": "#00FF00"
}
```

### Data Bars
```json
{
  "feature": "conditional_format",
  "range": "D2:D50",
  "rule_type": "data_bar",
  "bar_color": "#4472C4"
}
```

### Cell Rules
```json
{
  "feature": "conditional_format",
  "range": "E2:E50",
  "rule_type": "cell_is",
  "criteria": ">",
  "value": 100
}
```

## Position Reference

Objects can be positioned using:
- `"end"` — Append after all existing objects (default)
- `"after:chart_0"` — Insert after a specific object ID
- `"row:5"` — Insert at a specific row number

## Critical Rules

1. **Always profile first** — Call `excel_profile_data` before building to understand column names and types
2. **Use exact column names** — Column names are case-sensitive; use names from the profile
3. **Session persistence** — The `session_id` from `excel_auto_build` must be passed to ALL subsequent tools
4. **Query before modify** — Use `excel_query(query: "list_objects")` to get IDs before `excel_modify_object` or `excel_remove_object`
5. **Auto-save** — All mutation tools (add/modify/remove) automatically save and re-render the XLSX
6. **Undo safety** — 30-level undo history. Use `excel_undo` to revert mistakes
7. **Multi-sheet support** — Use the `sheet` parameter to target specific sheets; default is "Dashboard"
