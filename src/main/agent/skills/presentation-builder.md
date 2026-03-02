# Presentation Builder Skill Guide (PPT Master)

Build professional presentations with 32 slide types, 14 industry themes, 144 icons, and 14 UX styles.

---

## Workflow

1. **Understand the request**: topic, audience, purpose (pitch, report, training, etc.)
2. **Select a theme**: Match by industry or ask the user. Call `pptx_list_themes` if unsure.
3. **Plan slides**: Pick 8-25 content slides from the 32 types. Structure into 3-6 logical sections.
4. **Generate content JSON**: Follow the schema below precisely.
5. **Call `pptx_build`**: Pass content_json, theme_key, company_name, output_path.

---

## 14 Themes

| Key | Industry | UX Style | Colors | Description |
|-----|----------|----------|--------|-------------|
| `corporate` | General | classic | Navy #1B2A4A + Gold #C8A951 | Rounded cards, shadowed, top accent bars. Professional default. |
| `healthcare` | Healthcare | minimal | Teal #0F4C5C + Orange #E36414 | Swiss-clean, thin borders, sharp corners. |
| `technology` | Technology | dark | Slate #0F172A + Cyan #06B6D4 | Full dark mode, neon cyan accents. |
| `finance` | Finance | elevated | Green #14532D + Gold #D4AF37 | Pill-shaped cards, heavy shadow, Material-like. |
| `education` | Education | bold | Crimson #881337 + Tan #D4A574 | Big bold type, thick left accent bars, uppercase titles. |
| `sustainability` | Sustainability | editorial | Forest #064E3B + Amber #92400E | Magazine editorial, airy spacing, short title accents. |
| `luxury` | Luxury & Fashion | gradient | Navy #1A1A2E + Rose #B76E79 | Flowing gradient backgrounds, very rounded cards. |
| `startup` | Startup / VC | split | Purple #3B0764 + Orange #EA580C | Alternating left/right split layouts. |
| `government` | Government | geo | Navy #1E3A5F + Red #B91C1C | Angular geometric, hexagon/diamond motifs. |
| `realestate` | Real Estate | retro | Gray #374151 + Amber #D97706 | Vintage warm, decorative double borders. |
| `creative` | Creative & Media | magazine | Black #18181B + Pink #BE185D | Cinematic oversized titles, minimal decoration. |
| `academic` | Academic | scholarly | Navy #1E3A5F + Crimson #9B2335 | Serif (Georgia), thin rules, generous whitespace. |
| `research` | Research / Scientific | laboratory | Teal #0D4F4F + Amber #D97706 | Dark background, color-coded borders, data-first. |
| `report` | Reports / Analysis | dashboard | Gray #1F2937 + Teal #0891B2 | Dense analytics tiles, header bands, sidebar feel. |

### Theme selection guide
- **Pitch deck**: startup, technology, corporate
- **Financial report**: finance, report, corporate
- **Healthcare/medical**: healthcare
- **Academic/research**: academic, research
- **Creative/marketing**: creative, luxury
- **Government/public sector**: government
- **Sustainability/ESG**: sustainability
- **Real estate/property**: realestate
- **Education/training**: education

---

## 32 Selectable Slide Types

### Company & People
- **company_overview** — Mission + 4 quick facts
- **our_values** — 4 core values with descriptions
- **team_leadership** — 4 executives (name, title, bio)
- **key_facts** — 6 big headline metrics

### Executive & Summary
- **executive_summary** — 5 bullet takeaways + 3 metrics
- **kpi_dashboard** — 4 KPI cards (value, trend, progress bar)
- **infographic_dashboard** — 3 KPIs + mini chart + 4 progress bars
- **gauge_dashboard** — 3-4 donut gauge meters

### Process & Timeline
- **process_linear** — 5-step chevron flow (left to right)
- **process_circular** — 4-phase cycle diagram
- **roadmap_timeline** — 5-milestone timeline
- **milestone_roadmap** — 5-7 dated milestones on horizontal path

### Analysis & Strategy
- **swot_matrix** — 4-quadrant SWOT (3 items each)
- **comparison** — 2-option side-by-side (6 metrics)
- **matrix_quadrant** — 2x2 matrix with labeled axes
- **risk_matrix** — Color-coded risk heatmap
- **funnel_diagram** — 4-5 stage conversion funnel
- **pyramid_hierarchy** — 4-5 layer pyramid

### Charts & Data
- **bar_chart** — Grouped bars (3-8 categories, 1-4 series)
- **line_chart** — Multi-series line (3-8 periods)
- **pie_chart** — Donut/pie (3-8 segments, MUST sum to 100)
- **data_table** — 5-column x 6-row data table

### Layout & Content
- **two_column** — Left intro+bullets, right 2 sections
- **three_column** — 3 pillars/focus areas
- **highlight_quote** — Full-slide quote with attribution
- **icon_grid** — 4-6 icon+text cards in grid

### Diagrams
- **venn_diagram** — 2-3 overlapping circles
- **hub_spoke** — Central hub + 4-6 radiating spokes
- **kanban_board** — 3-column task board

### Closing
- **next_steps** — 4 action items (action, desc, owner, due)
- **call_to_action** — Bold CTA headline + 3 contacts
- **sources** — 4-8 bibliography references

---

## Content JSON Schema

```json
{
  "selected_slides": ["executive_summary", "kpi_dashboard", "bar_chart", "swot_matrix", "next_steps"],

  "sections": [
    {
      "title": "Performance Overview",
      "subtitle": "Key metrics and financial highlights",
      "slides": ["executive_summary", "kpi_dashboard"]
    },
    {
      "title": "Analysis",
      "subtitle": "Strategic assessment and trends",
      "slides": ["bar_chart", "swot_matrix"]
    },
    {
      "title": "Next Steps",
      "subtitle": "Action plan and priorities",
      "slides": ["next_steps"]
    }
  ],

  "content": {
    "cover_title": "Q4 2025 Performance Review",
    "cover_subtitle": "Driving Growth Through Innovation",
    "cover_date": "March 2026 | Confidential",

    "exec_title": "Executive Summary",
    "exec_bullets": [
      "Revenue grew 23% year-over-year to reach $4.2 billion, exceeding analyst consensus by $180 million.",
      "Operating margins expanded 280 basis points to 18.5%, driven by automation and scale efficiencies.",
      "Customer acquisition cost decreased 15% while lifetime value increased 22% across all segments.",
      "Three strategic acquisitions completed, adding $600 million in recurring revenue to the portfolio.",
      "Board approved $2 billion share repurchase program, reflecting strong cash flow generation."
    ],
    "exec_metrics": [["$4.2B", "Revenue"], ["18.5%", "Margin"], ["+23%", "YoY Growth"]],

    "kpi_title": "Key Performance Indicators",
    "kpis": [
      ["Revenue", "$4.2B", "+23%", 0.85, "\u2191"],
      ["Profit Margin", "18.5%", "+2.8pp", 0.72, "\u2191"],
      ["Customer Churn", "2.1%", "-0.8pp", 0.21, "\u2193"],
      ["NPS Score", "72", "+5pts", 0.72, "\u2191"]
    ],

    "bar_title": "Revenue by Region ($ Millions)",
    "bar_categories": ["North America", "Europe", "Asia Pacific", "Latin America"],
    "bar_series": [
      {"name": "FY 2024", "values": [1800, 1200, 800, 400]},
      {"name": "FY 2025", "values": [2200, 1400, 1000, 600]}
    ],

    "swot_title": "Strategic SWOT Analysis",
    "swot": {
      "strengths": [
        "Market-leading platform with 85% enterprise penetration in target verticals",
        "Strong recurring revenue base with 95% gross retention rate",
        "World-class engineering team with 200+ patents filed this year"
      ],
      "weaknesses": [
        "Geographic concentration with 52% revenue from North America",
        "Legacy on-premise product line declining at 8% annually",
        "Customer support satisfaction below industry benchmark at 78%"
      ],
      "opportunities": [
        "AI/ML integration could unlock $500M in new annual recurring revenue",
        "Asia Pacific expansion with new Singapore data center launching Q2",
        "Strategic partnership pipeline with three Fortune 100 companies"
      ],
      "threats": [
        "Two well-funded competitors raised $1.5B combined in 2025",
        "Regulatory changes in EU data sovereignty may increase compliance costs",
        "Macroeconomic uncertainty could slow enterprise purchasing decisions"
      ]
    },

    "next_steps_title": "Next Steps & Action Items",
    "next_steps": [
      ["Launch AI Platform Beta", "Deploy AI-powered analytics module to 50 enterprise pilot customers", "VP Engineering", "Q2 2026"],
      ["Expand APAC Operations", "Open Singapore office with 25-person team and local data center", "COO", "Q2 2026"],
      ["Customer Success Overhaul", "Implement new NPS-driven support model targeting 85+ satisfaction score", "VP Customer Success", "Q3 2026"],
      ["M&A Pipeline Execution", "Complete due diligence on two acquisition targets in data analytics space", "CFO", "Q1 2026"]
    ],

    "thankyou_contacts": [
      ["Email", "investor.relations@company.com", "mail"],
      ["Website", "www.company.com/investors", "globe"],
      ["Phone", "+1 (555) 123-4567", "phone"]
    ]
  }
}
```

---

## Content Key Reference (All Slide Types)

### company_overview
- `overview_title`: string
- `overview_mission`: string (2-3 sentences)
- `overview_facts`: 4 items `[["Label","Value"], ...]`

### our_values
- `values_title`: string
- `values`: 4 items `[["Name","Description max 100 chars"], ...]`

### team_leadership
- `team_title`: string
- `team`: 4 items `[["Full Name","Title","Bio max 120 chars"], ...]`

### key_facts
- `key_facts_title`: string
- `key_facts`: 6 items `[["$850M","Annual Revenue"], ...]`

### sources
- `sources_title`: string
- `sources_list`: 4-8 strings

### executive_summary
- `exec_title`: string
- `exec_bullets`: 5 strings (complete sentences, max 130 chars each)
- `exec_metrics`: 3 items `[["$850M","Revenue"], ...]`

### kpi_dashboard
- `kpi_title`: string
- `kpis`: 4 items `[["Name","Value","Trend%",progress_0_to_1,"arrow"], ...]`

### process_linear
- `process_title`: string
- `process_steps`: 5 items `[["Step Title","Description max 70 chars"], ...]`

### process_circular
- `cycle_title`: string
- `cycle_phases`: 4 strings

### roadmap_timeline
- `roadmap_title`: string
- `milestones`: 5 items `[["Q1 2026","Title","Description max 80 chars"], ...]`

### swot_matrix
- `swot_title`: string
- `swot`: `{"strengths":[3],"weaknesses":[3],"opportunities":[3],"threats":[3]}` (max 90 chars each)

### bar_chart
- `bar_title`: string
- `bar_categories`: 3-8 strings
- `bar_series`: `[{"name":"Label","values":[n per category]}, ...]` (1-4 series)

### line_chart
- `line_title`: string
- `line_categories`: 3-8 strings
- `line_series`: `[{"name":"Label","values":[n per category]}, ...]` (1-4 series)

### pie_chart
- `pie_title`: string
- `pie_categories`: 3-8 strings
- `pie_values`: 3-8 integers that **MUST sum to 100**
- `pie_legend`: 3-8 strings `["Enterprise (42%)", ...]`

### comparison
- `comparison_title`: string
- `comparison_headers`: `["Option A","Option B"]`
- `comparison_rows`: 6 items `[["Metric","A value","B value"], ...]`

### data_table
- `table_title`: string
- `table_headers`: 5 strings
- `table_rows`: 6 rows of 5 columns each
- `table_col_widths`: `[2.0, 1.2, 1.2, 1.2, 1.0]` (inches)

### two_column
- `two_col_title`: string
- `approach_intro`: string (1-2 sentences, max 160 chars)
- `approach_bullets`: 5 strings (max 80 chars each)
- `col2`: `[{"heading":"Short-Term","bullets":["b1","b2","b3","b4"]},{"heading":"Long-Term","bullets":["b1","b2","b3","b4"]}]`

### three_column
- `pillars_title`: string
- `pillars`: 3 items `[["Title","Description max 150 chars"], ...]`

### highlight_quote
- `quote_text`: string (2-3 sentences)
- `quote_attribution`: "Name, Title"
- `quote_source`: string

### infographic_dashboard
- `infographic_title`: string
- `infographic_kpis`: 3 items `[["$850M","Revenue"], ...]`
- `infographic_chart_title`: string
- `infographic_chart_cats`: 4 strings
- `infographic_chart_series`: `[{"name":"2025","values":[n,n,n,n]},{"name":"2026","values":[n,n,n,n]}]`
- `infographic_progress`: 4 items `[["Label",0.75], ...]` (0.0-1.0)

### next_steps
- `next_steps_title`: string
- `next_steps`: 4 items `[["Action","Description","Owner","Due Date"], ...]`

### call_to_action
- `cta_headline`: string (bold CTA, can contain \n)
- `cta_subtitle`: string
- `cta_contacts`: 3 items `[["Email","contact@company.com"],["Phone","+1 555-123-4567"],["Web","www.company.com"]]`

### funnel_diagram
- `funnel_title`: string
- `funnel_stages`: 4-5 items `[["Stage","Value","Description max 70 chars"], ...]`

### pyramid_hierarchy
- `pyramid_title`: string
- `pyramid_layers`: 4-5 items `[["Layer","Description max 80 chars"], ...]` (first = top/narrow)

### venn_diagram
- `venn_title`: string
- `venn_sets`: 2-3 items `[["Label","Description max 100 chars"], ...]`
- `venn_overlap`: string (max 60 chars)

### hub_spoke
- `hub_title`: string
- `hub_center`: string (max 25 chars)
- `hub_spokes`: 4-6 items `[["Label","Description max 80 chars"], ...]`

### milestone_roadmap
- `milestone_title`: string
- `milestone_items`: 5-7 items `[["Date","Title","Description max 80 chars"], ...]`

### kanban_board
- `kanban_title`: string
- `kanban_columns`: 3 dicts `[{"title":"To Do","cards":["task1","task2"]},{"title":"In Progress","cards":[...]},{"title":"Done","cards":[...]}]`

### matrix_quadrant
- `matrix_title`: string
- `matrix_x_axis`: string (max 20 chars)
- `matrix_y_axis`: string (max 20 chars)
- `matrix_quadrants`: 4 items `[["Label","Description"], ...]` (top-left, top-right, bottom-left, bottom-right)

### gauge_dashboard
- `gauge_title`: string
- `gauges`: 3-4 items `[["Metric","Value",0.82], ...]` (0.0-1.0)

### icon_grid
- `icon_grid_title`: string
- `icon_grid_items`: 4-6 items `[["icon_keyword","Title","Description max 90 chars"], ...]`

**Available icon keywords**: briefcase, chart, bar-chart, shield, globe, brain, ai-brain, target, rocket, handshake, lightbulb, gear, cloud, database, lock, heart, leaf, graduation, microscope, building, dollar, camera, palette, truck, people, email, phone, calendar, search, star, flag, trophy

### risk_matrix
- `risk_title`: string
- `risk_x_label`: string (max 20 chars)
- `risk_y_label`: string (max 20 chars)
- `risk_items`: 4-6 items `[["Risk Name","low|medium|high|critical","Description max 80 chars"], ...]`

---

## Slide Count Guidance

| Presentation Type | Recommended Slides | Typical Sections |
|---|---|---|
| Elevator pitch | 5-8 | Problem, Solution, Traction |
| Investor pitch deck | 10-15 | Overview, Market, Product, Traction, Team, Ask |
| Quarterly review | 12-18 | Summary, KPIs, Analysis, Outlook, Actions |
| Strategy presentation | 15-25 | Context, Analysis, Strategy, Roadmap, Actions |
| Deep-dive report | 20-30 | Exec Summary, Data, Analysis, Recommendations |
| Training/workshop | 10-20 | Intro, Content blocks, Practice, Summary |

---

## Critical Rules

1. **pie_values** must always sum to exactly 100
2. **Chart series values** count must match categories count
3. **Progress/gauge values** must be 0.0-1.0 (not percentages)
4. **KPI arrows**: use actual Unicode arrows (not emoji)
5. **No truncation**: never use "..." — write complete sentences
6. **Section subtitles**: always provide a subtitle for each section
7. **Cover is mandatory**: always include cover_title, cover_subtitle, cover_date in content
8. **Thank you is mandatory**: always include thankyou_contacts in content
