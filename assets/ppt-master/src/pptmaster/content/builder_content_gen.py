"""AI content generator for the 30-slide builder pipeline.

The LLM decides which slides to include based on topic depth, then produces
content only for the selected slides.  Cover and Thank You are always included.
"""

from __future__ import annotations

import copy
import json
from typing import Any

# Lazy imports to avoid pulling in heavy deps (openai, pydantic-settings)
# when only _validate_content / build_from_content is needed.
def _get_settings():
    from pptmaster.config import get_settings as _gs
    return _gs()

def _get_llm_client():
    from pptmaster.content.llm_client import LLMClient as _LC
    return _LC

# ── Slide catalog — every selectable slide type ──────────────────────

SLIDE_CATALOG: dict[str, dict[str, Any]] = {
    "company_overview": {
        "description": "Company mission statement and 4 quick facts",
        "content_keys": {
            "overview_title": "string — slide title (default: 'Company Overview')",
            "overview_mission": "string, 2-3 sentences about company mission",
            "overview_facts": '4 items: [["Label","Value"], ...] e.g. [["Founded","2005"],["Employees","2500+"]]',
        },
    },
    "our_values": {
        "description": "4 core company values with descriptions",
        "content_keys": {
            "values_title": "string — slide title (default: 'Our Values')",
            "values": '4 items: [["Value Name","One complete sentence, max 100 chars"], ...]',
        },
    },
    "team_leadership": {
        "description": "Leadership team — 4 executives with names, titles, bios",
        "content_keys": {
            "team_title": "string — slide title (default: 'Leadership Team')",
            "team": '4 items: [["Full Name","Job Title","One-line bio, max 120 chars, complete sentence"], ...]',
        },
    },
    "key_facts": {
        "description": "6 big headline statistics/metrics in large font",
        "content_keys": {
            "key_facts_title": "string — slide title (default: 'Key Facts & Figures')",
            "key_facts": '6 items: [["$850M","Annual Revenue"], ...]',
        },
    },
    "sources": {
        "description": "Bibliography/references slide — 4-8 cited sources",
        "content_keys": {
            "sources_title": "string — slide title, e.g. 'Sources & References'",
            "sources_list": '4-8 strings: ["Author (Year). Title. Publication.", ...]',
        },
    },
    "executive_summary": {
        "description": "5 bullet points summarizing key takeaways + 3 headline metrics",
        "content_keys": {
            "exec_title": "string — slide title (default: 'Executive Summary')",
            "exec_bullets": "5 strings, each a complete sentence, max 130 chars each",
            "exec_metrics": '3 items: [["$850M","Revenue"], ...]',
        },
    },
    "kpi_dashboard": {
        "description": "4-KPI dashboard with values, trends, and progress bars",
        "content_keys": {
            "kpi_title": "string — slide title (default: 'KPI Dashboard')",
            "kpis": '4 items: [["KPI Name","Value","+23%",0.85,"↑"], ...] — progress is 0.0-1.0',
        },
    },
    "process_linear": {
        "description": "5-step linear process flow (left to right)",
        "content_keys": {
            "process_title": "string — slide title (default: 'Our Process')",
            "process_steps": '5 items: [["Step Title (max 25 chars)","Description max 70 chars, complete sentence"], ...]',
        },
    },
    "process_circular": {
        "description": "4-phase circular/cycle diagram",
        "content_keys": {
            "cycle_title": "string — slide title (default: 'Continuous Improvement Cycle')",
            "cycle_phases": '4 strings: ["Plan","Execute","Review","Improve"]',
        },
    },
    "roadmap_timeline": {
        "description": "5-milestone timeline/roadmap",
        "content_keys": {
            "roadmap_title": "string — slide title (default: 'Strategic Roadmap')",
            "milestones": '5 items: [["Q1 2026","Title max 30 chars","Description max 80 chars, complete sentence"], ...]',
        },
    },
    "swot_matrix": {
        "description": "SWOT analysis — 4 quadrants, 3 items each",
        "content_keys": {
            "swot_title": "string — slide title (default: 'SWOT Analysis')",
            "swot": '{"strengths":["phrase max 90 chars","...","..."],"weaknesses":[...],"opportunities":[...],"threats":[...]} — 3 items each quadrant, each a complete phrase',
        },
    },
    "bar_chart": {
        "description": "Grouped bar chart with 3-8 categories and 1-4 series",
        "content_keys": {
            "bar_title": "string — chart title",
            "bar_categories": "3-8 strings",
            "bar_series": '[{"name":"FY 2025","values":[n per category]}, ...] — 1-4 series',
        },
    },
    "line_chart": {
        "description": "Line chart with 3-8 time periods and 1-4 series",
        "content_keys": {
            "line_title": "string — chart title",
            "line_categories": "3-8 strings (time periods)",
            "line_series": '[{"name":"Revenue","values":[n per category]}, ...] — 1-4 series',
        },
    },
    "pie_chart": {
        "description": "Pie/donut chart — 3-8 segments that MUST sum to 100",
        "content_keys": {
            "pie_title": "string — chart title",
            "pie_categories": "3-8 segment names",
            "pie_values": "3-8 integers that SUM TO 100",
            "pie_legend": '3-8 strings: ["Enterprise (42%)", ...]',
        },
    },
    "comparison": {
        "description": "Side-by-side comparison table — 2 options across 6 metrics",
        "content_keys": {
            "comparison_title": "string — slide title (default: 'Comparison')",
            "comparison_headers": '["Option A","Option B"]',
            "comparison_rows": '6 items: [["Metric","A value","B value"], ...]',
        },
    },
    "data_table": {
        "description": "5-column data table with 6 rows",
        "content_keys": {
            "table_title": "string",
            "table_headers": "5 strings",
            "table_rows": "6 rows, each 5 columns: [['col1','col2','col3','col4','col5'], ...]",
            "table_col_widths": "[2.0, 1.2, 1.2, 1.2, 1.0] — 5 floats in inches",
        },
    },
    "two_column": {
        "description": "Two-column layout — intro text + approach bullets on left, 2 themed sections on right",
        "content_keys": {
            "two_col_title": "string — slide title (default: 'Strategic Priorities')",
            "approach_intro": "string, 1-2 complete sentences, max 160 chars",
            "approach_bullets": "5 strings, each max 80 chars, complete phrases",
            "col2": '[{"heading":"Short-Term Goals","bullets":["b1 max 80 chars","b2","b3","b4"]},{"heading":"Long-Term Vision","bullets":["b1","b2","b3","b4"]}]',
        },
    },
    "three_column": {
        "description": "Three pillars/columns — 3 key offerings or focus areas",
        "content_keys": {
            "pillars_title": "string — slide title (default: 'Key Focus Areas')",
            "pillars": '3 items: [["Pillar Title max 30 chars","Description 1-2 complete sentences max 150 chars"], ...]',
        },
    },
    "highlight_quote": {
        "description": "Full-slide inspirational quote with attribution",
        "content_keys": {
            "quote_text": "string, 2-3 sentences",
            "quote_attribution": '"Name, Title"',
            "quote_source": "string — source reference",
        },
    },
    "infographic_dashboard": {
        "description": "Mixed infographic: 3 KPIs + mini bar chart + 4 progress bars",
        "content_keys": {
            "infographic_title": "string — slide title (default: 'Performance Dashboard')",
            "infographic_kpis": '3 items: [["$850M","Revenue"], ...]',
            "infographic_chart_title": "string",
            "infographic_chart_cats": "4 strings",
            "infographic_chart_series": '[{"name":"2025","values":[n x4]},{"name":"2026","values":[n x4]}]',
            "infographic_progress": '4 items: [["Phase label",0.75], ...] — progress 0.0-1.0',
        },
    },
    "next_steps": {
        "description": "4 action items with owner and due date",
        "content_keys": {
            "next_steps_title": "string — slide title (default: 'Next Steps & Action Items')",
            "next_steps": '4 items: [["Action Title max 35 chars","Description max 100 chars complete sentence","Owner","Due Date"], ...]',
        },
    },
    "call_to_action": {
        "description": "Bold CTA headline with contact details",
        "content_keys": {
            "cta_headline": 'string — bold CTA, can have \\n',
            "cta_subtitle": "string — supporting sentence",
            "cta_contacts": '3 items: [["Email","contact@company.com"],["Phone","+1 (555) 123-4567"],["Web","www.company.com"]]',
        },
    },
    # ── New slide types (s31-s40) ──────────────────────────────────────
    "funnel_diagram": {
        "description": "4-5 stage conversion funnel showing progressive narrowing",
        "content_keys": {
            "funnel_title": "string — slide title (default: 'Conversion Funnel')",
            "funnel_stages": '4-5 items: [["Stage Name max 25 chars","Value/Metric max 20 chars","Description max 70 chars complete sentence"], ...]',
        },
    },
    "pyramid_hierarchy": {
        "description": "4-5 layer pyramid showing hierarchical structure (top=narrow, bottom=wide)",
        "content_keys": {
            "pyramid_title": "string — slide title (default: 'Strategic Hierarchy')",
            "pyramid_layers": '4-5 items: [["Layer Name max 25 chars","Description max 80 chars complete sentence"], ...]  — first item is the top/narrow layer',
        },
    },
    "venn_diagram": {
        "description": "2-3 overlapping circles showing relationships and synergies",
        "content_keys": {
            "venn_title": "string — slide title (default: 'Synergy Analysis')",
            "venn_sets": '2-3 items: [["Set Label max 20 chars","Description max 100 chars complete sentence"], ...]',
            "venn_overlap": "string — what the overlap represents, max 60 chars",
        },
    },
    "hub_spoke": {
        "description": "Central hub with 4-6 radiating spoke elements",
        "content_keys": {
            "hub_title": "string — slide title (default: 'Core Capabilities')",
            "hub_center": "string — label for the central hub, max 25 chars",
            "hub_spokes": '4-6 items: [["Spoke Label max 20 chars","Description max 80 chars complete sentence"], ...]',
        },
    },
    "milestone_roadmap": {
        "description": "5-7 dated milestones on a horizontal timeline path",
        "content_keys": {
            "milestone_title": "string — slide title (default: 'Project Milestones')",
            "milestone_items": '5-7 items: [["Date max 12 chars","Title max 30 chars","Description max 80 chars complete sentence"], ...]',
        },
    },
    "kanban_board": {
        "description": "3-column kanban board (To Do / In Progress / Done) with task cards",
        "content_keys": {
            "kanban_title": "string — slide title (default: 'Project Board')",
            "kanban_columns": '3 dicts: [{"title":"To Do","cards":["task max 60 chars","task2"]}, {"title":"In Progress","cards":[...]}, {"title":"Done","cards":[...]}]',
        },
    },
    "matrix_quadrant": {
        "description": "2x2 matrix with labeled axes and four quadrants",
        "content_keys": {
            "matrix_title": "string — slide title (default: 'Strategic Matrix')",
            "matrix_x_axis": "string — horizontal axis label (e.g. 'Impact'), max 20 chars",
            "matrix_y_axis": "string — vertical axis label (e.g. 'Effort'), max 20 chars",
            "matrix_quadrants": '4 items: [["Quadrant Label max 25 chars","Description max 100 chars complete sentence"], ...]  — order: top-left, top-right, bottom-left, bottom-right',
        },
    },
    "gauge_dashboard": {
        "description": "3-4 donut gauge meters showing progress toward targets",
        "content_keys": {
            "gauge_title": "string — slide title (default: 'Performance Gauges')",
            "gauges": '3-4 items: [["Metric Name","Display Value",0.82], ...]  — third element is 0.0-1.0 progress',
        },
    },
    "icon_grid": {
        "description": "4-6 icon+text cards in a grid showing key capabilities or features",
        "content_keys": {
            "icon_grid_title": "string — slide title (default: 'Key Capabilities')",
            "icon_grid_items": '4-6 items: [["icon_name","Title max 25 chars","Description max 90 chars complete sentence"], ...]  — icon_name is a keyword like "chart","shield","globe"',
        },
    },
    "risk_matrix": {
        "description": "Color-coded risk assessment grid with positioned risk items",
        "content_keys": {
            "risk_title": "string — slide title (default: 'Risk Assessment Matrix')",
            "risk_x_label": "string — horizontal axis (e.g. 'Likelihood'), max 20 chars",
            "risk_y_label": "string — vertical axis (e.g. 'Impact'), max 20 chars",
            "risk_items": '4-6 items: [["Risk Name max 30 chars","low|medium|high|critical","Description max 80 chars complete sentence"], ...]',
        },
    },
}

# Slides that are always included (not selectable by LLM)
_ALWAYS_SLIDES = {"cover", "toc", "section_divider", "thank_you"}

# All selectable slide type names
ALL_SLIDE_TYPES = list(SLIDE_CATALOG.keys())


# ── System prompt ─────────────────────────────────────────────────────

def _build_system_prompt() -> str:
    """Build system prompt with full slide catalog."""
    slide_docs = []
    for stype, info in SLIDE_CATALOG.items():
        keys_doc = "\n".join(
            f"      {k}: {v}" for k, v in info["content_keys"].items()
        )
        slide_docs.append(
            f"  - **{stype}**: {info['description']}\n    Content keys:\n{keys_doc}"
        )
    catalog_text = "\n".join(slide_docs)

    return f"""\
You are a world-class business presentation content strategist and writer.

Given a topic, company name, industry, and audience, you must:
1. DECIDE which slides to include — pick only the ones that are relevant and
   valuable for this specific topic.  A pitch deck may need 12 slides; a deep
   financial review may need 25.  Choose wisely.
2. ORGANIZE the selected slides into logical sections.
3. GENERATE the content for every selected slide.

## Available slide types (pick from these)

{catalog_text}

## Always-included slides (do NOT list these in selected_slides)
- **cover**: Title slide — you provide cover_title, cover_subtitle, cover_date
- **toc**: Auto-generated from your sections
- **section_divider**: Auto-inserted before each section
- **thank_you**: Closing slide — you provide thankyou_contacts

## Output JSON schema

```
{{
  "selected_slides": ["executive_summary", "kpi_dashboard", "bar_chart", ...],

  "sections": [
    {{
      "title": "Section Title",
      "subtitle": "One-line description",
      "slides": ["executive_summary", "kpi_dashboard"]
    }},
    ...
  ],

  "content": {{
    "cover_title": "Bold Headline (max 60 chars)",
    "cover_subtitle": "Supporting line (max 80 chars)",
    "cover_date": "February 2026  |  Confidential",

    "thankyou_contacts": [
      ["Email", "contact@company.com", "✉"],
      ["Phone", "+1 (555) 123-4567", "☎"],
      ["Website", "www.company.com", "⌂"],
      ["Location", "City, State", "⚑"]
    ],

    ... content keys for each selected slide ...
  }}
}}
```

## CRITICAL rules
1. **selected_slides** must only contain slide type names from the catalog above.
2. Every slide in selected_slides must have ALL its content keys in the "content" object.
3. Every slide listed in a section must also appear in selected_slides.
4. pie_values MUST be 3-8 integers that sum to 100. pie_categories and pie_legend must match in length.
5. Chart arrays can vary in size (3-8 items); other arrays must match the described counts.
6. Chart series "values" arrays must match the number of categories.
7. kpis and infographic_progress values must be floats between 0.0 and 1.0.
8. Invent realistic, plausible data that fits the topic. Be specific, not generic.
9. Output ONLY the JSON object — no markdown fences, no commentary.
10. Minimum 8 slides (not counting cover/toc/dividers/thankyou), maximum 33.
11. For every slide you select, provide a contextually appropriate title via the *_title key. Don't use generic corporate titles like 'Our Services' for non-corporate topics.
12. NEVER truncate text with "…" or "...". Every string must be a complete sentence or phrase. If content is long, write shorter complete text — do not trail off mid-sentence. Respect the max character limits specified in each content_key description.
"""


_SYSTEM_PROMPT = _build_system_prompt()


def _build_user_prompt(
    topic: str,
    company_name: str,
    industry: str,
    audience: str,
    additional_context: str,
) -> str:
    parts = [f"Topic: {topic}", f"Company: {company_name}"]
    if industry:
        parts.append(f"Industry: {industry}")
    if audience:
        parts.append(f"Target audience: {audience}")
    if additional_context:
        parts.append(f"Additional context: {additional_context}")
    parts.append(
        "\nDecide which slides are most relevant, organize them into sections, "
        "and generate all content."
    )
    return "\n".join(parts)


# ── Validation / coercion ─────────────────────────────────────────────

def _ensure_list_length(lst: list, target: int, default_item: Any) -> list:
    if len(lst) > target:
        return lst[:target]
    while len(lst) < target:
        lst.append(copy.deepcopy(default_item))
    return lst


def _ensure_tuple_width(lst: list[list], width: int) -> list[list]:
    for i, item in enumerate(lst):
        if not isinstance(item, (list, tuple)):
            lst[i] = [str(item)] + [""] * (width - 1)
        else:
            item = list(item)
            # Flatten any nested lists (LLM sometimes double-nests)
            flat = []
            for elem in item:
                if isinstance(elem, (list, tuple)):
                    flat.extend(str(e) for e in elem)
                else:
                    flat.append(elem)
            item = flat
            if len(item) < width:
                item = item + [""] * (width - len(item))
            elif len(item) > width:
                item = item[:width]
            # Ensure all elements are strings (except known numeric positions)
            lst[i] = item
    return lst


def _fix_pie(content: dict[str, Any]) -> None:
    """Normalise pie chart data — 3-8 segments summing to 100."""
    values = content.get("pie_values", [])
    cats = content.get("pie_categories", [])

    # Coerce to ints, clamp to 3-8
    values = [int(v) for v in values[:8]]
    while len(values) < 3:
        values.append(0)

    # Normalise sum to 100
    total = sum(values)
    if total != 100 and total > 0:
        factor = 100 / total
        values = [max(1, int(round(v * factor))) for v in values]
        diff = 100 - sum(values)
        values[values.index(max(values))] += diff

    n = len(values)
    # Match categories to values length
    cats = cats[:n]
    while len(cats) < n:
        cats.append("Other")

    content["pie_values"] = values
    content["pie_categories"] = cats
    content["pie_legend"] = [f"{cats[i]} ({values[i]}%)" for i in range(n)]


def _fix_chart_series(series: list[dict], n_categories: int,
                      min_series: int = 1, max_series: int = 4) -> list[dict]:
    """Fix chart series — keep LLM's series count (clamped to min/max),
    ensure each series' values array matches n_categories."""
    if not isinstance(series, list):
        series = []
    # Clamp number of series
    series = series[:max_series]
    while len(series) < min_series:
        series.append({"name": f"Series {len(series)+1}", "values": [0] * n_categories})
    for s in series:
        vals = s.get("values", [])
        vals = [v if isinstance(v, (int, float)) else 0 for v in vals]
        vals = vals[:n_categories]
        while len(vals) < n_categories:
            vals.append(0)
        s["values"] = vals
    return series


# Content-key level validation rules: key -> (list_length, inner_width)
_LENGTH_RULES: dict[str, tuple[int, int | None]] = {
    "overview_facts": (4, 2),
    "values": (4, 2),
    "team": (4, 3),
    "key_facts": (6, 2),
    "exec_bullets": (5, None),
    "exec_metrics": (3, 2),
    "kpis": (4, 5),
    "process_steps": (5, 2),
    "cycle_phases": (4, None),
    "milestones": (5, 3),
    "comparison_rows": (6, 3),
    "table_headers": (5, None),
    "table_rows": (6, 5),
    "table_col_widths": (5, None),
    "approach_bullets": (5, None),
    "pillars": (3, 2),
    "infographic_kpis": (3, 2),
    "infographic_chart_cats": (4, None),
    "infographic_progress": (4, 2),
    "next_steps": (4, 4),
    "cta_contacts": (3, 2),
    "thankyou_contacts": (4, 3),
}

# Minimal defaults for keys that need padding
_KEY_DEFAULTS: dict[str, Any] = {
    "overview_facts": ["", ""],
    "values": ["", ""],
    "team": ["", "", ""],
    "key_facts": ["", ""],
    "exec_bullets": "",
    "exec_metrics": ["", ""],
    "kpis": ["KPI", "0", "0%", 0.5, "\u2191"],
    "process_steps": ["Step", ""],
    "cycle_phases": "Phase",
    "milestones": ["Q1 2026", "Milestone", ""],
    "comparison_rows": ["Metric", "", ""],
    "table_headers": "Column",
    "table_rows": ["", "", "", "", ""],
    "table_col_widths": 1.2,
    "approach_bullets": "",
    "pillars": ["Pillar", ""],
    "infographic_kpis": ["0", ""],
    "infographic_chart_cats": "Q1",
    "infographic_progress": ["Phase", 0.5],
    "next_steps": ["Action", "", "", ""],
    "cta_contacts": ["", ""],
    "thankyou_contacts": ["", "", ""],
}


# Dynamic-range chart keys: key -> (min_len, max_len)
_DYNAMIC_RANGE_RULES: dict[str, tuple[int, int]] = {
    "bar_categories": (3, 8),
    "line_categories": (3, 8),
    "pie_categories": (3, 8),
    "pie_values": (3, 8),
    "pie_legend": (3, 8),
    "sources_list": (4, 8),
    # New slide types
    "funnel_stages": (3, 6),
    "pyramid_layers": (3, 6),
    "venn_sets": (2, 3),
    "hub_spokes": (4, 6),
    "milestone_items": (5, 7),
    "gauges": (3, 4),
    "icon_grid_items": (4, 6),
    "risk_items": (4, 6),
}


def _enforce_dynamic_ranges(content: dict[str, Any]) -> None:
    """Clamp dynamic-range arrays to [min, max] instead of forcing exact length."""
    for key, (lo, hi) in _DYNAMIC_RANGE_RULES.items():
        val = content.get(key)
        if val is None or not isinstance(val, list):
            continue
        if len(val) > hi:
            content[key] = val[:hi]
        elif len(val) < lo:
            # Pad with sensible defaults
            if key == "bar_categories" or key == "line_categories":
                while len(val) < lo:
                    val.append(f"Category {len(val)+1}")
            elif key == "pie_categories":
                while len(val) < lo:
                    val.append("Other")
            elif key == "pie_values":
                while len(val) < lo:
                    val.append(0)
            elif key == "pie_legend":
                while len(val) < lo:
                    val.append("Other (0%)")
            elif key == "sources_list":
                while len(val) < lo:
                    val.append("Source to be confirmed.")
            content[key] = val


def _flatten_nested_content(content: dict[str, Any]) -> dict[str, Any]:
    """Flatten LLM responses that nest content by slide type.

    The LLM sometimes returns:
        {"executive_summary": {"exec_bullets": [...], "exec_metrics": [...]}}
    instead of flat:
        {"exec_bullets": [...], "exec_metrics": [...]}

    This merges nested dicts whose keys are slide type names into the top level.
    """
    # All known content keys that slide builders actually read
    _KNOWN_CONTENT_KEYS = set(_LENGTH_RULES.keys()) | set(_DYNAMIC_RANGE_RULES.keys()) | {
        "cover_title", "cover_subtitle", "cover_date",
        "overview_title", "overview_mission", "overview_facts",
        "values_title", "team_title", "key_facts_title",
        "exec_title", "kpi_title", "process_title", "cycle_title",
        "roadmap_title", "swot_title", "comparison_title",
        "two_col_title", "pillars_title", "approach_title",
        "infographic_title", "next_steps_title",
        "sources_title",
        "bar_title", "line_title", "pie_title",
        "table_title", "approach_intro",
        "quote_text", "quote_attribution", "quote_source",
        "infographic_chart_title",
        "cta_headline", "cta_subtitle",
        "comparison_headers", "swot",
        # New slide type keys
        "funnel_title", "funnel_stages",
        "pyramid_title", "pyramid_layers",
        "venn_title", "venn_sets", "venn_overlap",
        "hub_title", "hub_center", "hub_spokes",
        "milestone_title", "milestone_items",
        "kanban_title", "kanban_columns",
        "matrix_title", "matrix_x_axis", "matrix_y_axis", "matrix_quadrants",
        "gauge_title", "gauges",
        "icon_grid_title", "icon_grid_items",
        "risk_title", "risk_x_label", "risk_y_label", "risk_items",
    }
    # Slide type names that might appear as nesting keys
    _SLIDE_TYPE_KEYS = set(SLIDE_CATALOG.keys())

    flat = {}
    for key, val in content.items():
        if isinstance(val, dict) and key in _SLIDE_TYPE_KEYS:
            # This is a nested slide-type dict — merge its contents up
            for inner_key, inner_val in val.items():
                flat[inner_key] = inner_val
        elif isinstance(val, dict) and key == "swot":
            # SWOT is legitimately a dict — keep it
            flat[key] = val
        elif isinstance(val, dict) and key not in _KNOWN_CONTENT_KEYS:
            # Unknown dict key — might be a nested slide group, merge up
            for inner_key, inner_val in val.items():
                if inner_key in _KNOWN_CONTENT_KEYS or inner_key in _SLIDE_TYPE_KEYS:
                    if isinstance(inner_val, dict) and inner_key in _SLIDE_TYPE_KEYS:
                        # Double nesting
                        for k2, v2 in inner_val.items():
                            flat[k2] = v2
                    else:
                        flat[inner_key] = inner_val
        else:
            flat[key] = val
    return flat


def _validate_content(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate and coerce content keys present in the dict.

    Only validates keys that actually exist — doesn't force-fill missing
    slide content.  The selected_slides list controls what gets built.
    """
    content = raw.get("content", raw)

    # Flatten nested slide-type groupings
    content = _flatten_nested_content(content)

    # Normalize common alternative key names → canonical builder key names.
    # This prevents silent content loss when users pass content with slightly
    # different key names (e.g. via build_from_content or external tools).
    _KEY_ALIASES: dict[str, str] = {
        # Executive Summary
        "exec_summary_title": "exec_title",
        "executive_summary_title": "exec_title",
        "exec_summary_text": "exec_bullets",
        "exec_summary_points": "exec_bullets",
        "exec_summary_bullets": "exec_bullets",
        "exec_summary_metrics": "exec_metrics",
        # KPI
        "kpi_cards": "kpis",
        "kpi_items": "kpis",
        # Next Steps
        "next_title": "next_steps_title",
        "next_items": "next_steps",
        # Facts
        "facts_items": "key_facts",
        "facts_title": "key_facts_title",
        # Sources
        "sources_items": "sources_list",
        # Call to Action
        "cta_body": "cta_subtitle",
        "cta_contact": "cta_contacts",
        # Thank You
        "thankyou_message": "thankyou_contacts",
        "thankyou_contact": "thankyou_contacts",
        # Comparison
        "comparison_title": "comparison_title",
        "comparison_columns": "comparison_headers",
        "comparison_rows": "comparison_rows",
        # Roadmap
        "roadmap_milestones": "milestones",
        # Table
        "data_table_title": "table_title",
        # Pie
        "pie_segments": "pie_categories",
    }
    for alias, canonical in _KEY_ALIASES.items():
        if alias in content and canonical not in content:
            content[canonical] = content.pop(alias)

    # Coerce string → list for keys that expect lists (e.g. exec_bullets)
    for key in ("exec_bullets", "next_steps", "sources_list"):
        val = content.get(key)
        if isinstance(val, str) and val:
            # Split a paragraph into sentences or lines
            lines = [s.strip() for s in val.replace("\n\n", "\n").split("\n") if s.strip()]
            if len(lines) <= 1:
                # Single paragraph — split on sentence boundaries
                import re as _re
                lines = [s.strip() for s in _re.split(r'(?<=[.!?])\s+', val) if s.strip()]
            content[key] = lines

    # Coerce string contacts → list of tuples
    for key in ("cta_contacts", "thankyou_contacts"):
        val = content.get(key)
        if isinstance(val, str) and val:
            # Single string like "info@test.com | +1 555-1234"
            parts = [p.strip() for p in val.split("|") if p.strip()]
            content[key] = [(p, "") for p in parts] if len(parts) > 1 else [("Contact", val)]

    # Enforce array lengths for keys that are present
    for key, (target, inner_w) in _LENGTH_RULES.items():
        val = content.get(key)
        if val is None:
            continue
        # Coerce dicts to list-of-lists (LLM sometimes returns dicts)
        if isinstance(val, dict) and inner_w is not None:
            val = [[str(k), str(v)] for k, v in val.items()]
            content[key] = val
        elif isinstance(val, dict):
            val = list(val.values())
            content[key] = val
        # Coerce list-of-dicts to list-of-lists
        if isinstance(val, list) and val and isinstance(val[0], dict) and inner_w is not None:
            content[key] = [list(str(v) for v in d.values())[:inner_w] for d in val]
            val = content[key]
        if isinstance(val, list):
            default_item = _KEY_DEFAULTS.get(key, "")
            content[key] = _ensure_list_length(val, target, copy.deepcopy(default_item))
            if inner_w is not None and content[key]:
                content[key] = _ensure_tuple_width(content[key], inner_w)

    # Fix SWOT if present
    swot = content.get("swot")
    if isinstance(swot, dict):
        for k in ("strengths", "weaknesses", "opportunities", "threats"):
            items = swot.get(k, [])
            if not isinstance(items, list):
                items = []
            swot[k] = _ensure_list_length(items, 3, "")

    # Fix comparison_headers if present
    ch = content.get("comparison_headers")
    if ch is not None:
        if not isinstance(ch, (list, tuple)) or len(ch) < 2:
            content["comparison_headers"] = ["Option A", "Option B"]
        else:
            content["comparison_headers"] = list(ch[:2])

    # Enforce dynamic ranges (charts, sources)
    _enforce_dynamic_ranges(content)

    # Fix pie if present
    if "pie_values" in content:
        _fix_pie(content)

    # Fix chart series if present — match to actual category count
    if "bar_series" in content:
        n_bar = len(content.get("bar_categories", []))
        content["bar_series"] = _fix_chart_series(content["bar_series"], max(n_bar, 3))
    if "line_series" in content:
        n_line = len(content.get("line_categories", []))
        content["line_series"] = _fix_chart_series(content["line_series"], max(n_line, 3))
    if "infographic_chart_series" in content:
        content["infographic_chart_series"] = _fix_chart_series(
            content["infographic_chart_series"], 4, min_series=2, max_series=2,
        )

    # Fix col2 if present
    col2 = content.get("col2")
    if isinstance(col2, list) and len(col2) >= 2:
        content["col2"] = col2[:2]
        for item in content["col2"]:
            if "bullets" not in item:
                item["bullets"] = [""] * 4
            else:
                item["bullets"] = _ensure_list_length(item["bullets"], 4, "")
            if "heading" not in item:
                item["heading"] = "Section"

    # Clamp KPI progress floats
    for kpi in content.get("kpis", []):
        if isinstance(kpi, list) and len(kpi) >= 4:
            try:
                kpi[3] = max(0.0, min(1.0, float(kpi[3])))
            except (ValueError, TypeError):
                kpi[3] = 0.5

    # Clamp infographic progress
    for item in content.get("infographic_progress", []):
        if isinstance(item, list) and len(item) >= 2:
            try:
                item[1] = max(0.0, min(1.0, float(item[1])))
            except (ValueError, TypeError):
                item[1] = 0.5

    # Fix table_col_widths
    widths = content.get("table_col_widths")
    if widths is not None:
        content["table_col_widths"] = [
            float(w) if isinstance(w, (int, float)) else 1.2 for w in widths[:5]
        ]
        while len(content["table_col_widths"]) < 5:
            content["table_col_widths"].append(1.2)

    # ── New slide type fixers ──────────────────────────────────────────

    # Fix funnel_stages — ensure inner width of 3
    fs = content.get("funnel_stages")
    if isinstance(fs, list) and fs:
        content["funnel_stages"] = _ensure_tuple_width(fs, 3)

    # Fix pyramid_layers — ensure inner width of 2
    pl = content.get("pyramid_layers")
    if isinstance(pl, list) and pl:
        content["pyramid_layers"] = _ensure_tuple_width(pl, 2)

    # Fix venn_sets — ensure inner width of 2
    vs = content.get("venn_sets")
    if isinstance(vs, list) and vs:
        content["venn_sets"] = _ensure_tuple_width(vs, 2)

    # Fix hub_spokes — ensure inner width of 2
    hs = content.get("hub_spokes")
    if isinstance(hs, list) and hs:
        content["hub_spokes"] = _ensure_tuple_width(hs, 2)

    # Fix milestone_items — ensure inner width of 3
    mi = content.get("milestone_items")
    if isinstance(mi, list) and mi:
        content["milestone_items"] = _ensure_tuple_width(mi, 3)

    # Fix kanban_columns — ensure list of dicts with title+cards
    kc = content.get("kanban_columns")
    if isinstance(kc, list):
        fixed_cols = []
        for col in kc[:3]:
            if isinstance(col, dict):
                col.setdefault("title", "Column")
                col.setdefault("cards", [])
                if not isinstance(col["cards"], list):
                    col["cards"] = [str(col["cards"])]
                fixed_cols.append(col)
            elif isinstance(col, (list, tuple)) and len(col) >= 2:
                fixed_cols.append({"title": str(col[0]), "cards": list(col[1:])})
        while len(fixed_cols) < 3:
            fixed_cols.append({"title": "Column", "cards": []})
        content["kanban_columns"] = fixed_cols[:3]

    # Fix matrix_quadrants — ensure inner width of 2
    mq = content.get("matrix_quadrants")
    if isinstance(mq, list) and mq:
        content["matrix_quadrants"] = _ensure_tuple_width(mq[:4], 2)
        while len(content["matrix_quadrants"]) < 4:
            content["matrix_quadrants"].append(["Quadrant", ""])

    # Fix gauges — ensure inner width of 3, clamp progress float
    ga = content.get("gauges")
    if isinstance(ga, list) and ga:
        content["gauges"] = _ensure_tuple_width(ga, 3)
        for g in content["gauges"]:
            try:
                g[2] = max(0.0, min(1.0, float(g[2])))
            except (ValueError, TypeError, IndexError):
                if len(g) >= 3:
                    g[2] = 0.5

    # Fix icon_grid_items — ensure inner width of 3
    igi = content.get("icon_grid_items")
    if isinstance(igi, list) and igi:
        content["icon_grid_items"] = _ensure_tuple_width(igi, 3)

    # Fix risk_items — ensure inner width of 3
    ri = content.get("risk_items")
    if isinstance(ri, list) and ri:
        content["risk_items"] = _ensure_tuple_width(ri, 3)
        # Normalize severity values
        valid_severities = {"low", "medium", "high", "critical"}
        for item in content["risk_items"]:
            if len(item) >= 2 and str(item[1]).lower() not in valid_severities:
                item[1] = "medium"
            elif len(item) >= 2:
                item[1] = str(item[1]).lower()

    # ── Text length enforcement ─────────────────────────────────────
    # Truncate strings that are too long for their fixed-size text boxes.
    # This prevents overflow while keeping font sizes consistent.
    _truncate_strings(content)

    return content


# Max character limits per content key.
# Derived from box dimensions and font sizes used in slide builders.
_CHAR_LIMITS: dict[str, int] = {
    # String fields (direct truncation)
    "cover_title": 80,
    "cover_subtitle": 120,
    "cover_date": 50,
    "overview_title": 50,
    "overview_mission": 300,
    "values_title": 50,
    "team_title": 50,
    "key_facts_title": 50,
    "exec_title": 50,
    "bar_title": 60,
    "line_title": 60,
    "pie_title": 60,
    "table_title": 60,
    "comparison_title": 60,
    "roadmap_title": 60,
    "swot_title": 50,
    "infographic_title": 60,
    "cta_title": 50,
    "cta_body": 200,
    "approach_title": 60,
    "col2_title": 60,
    "col3_title": 60,
    "next_steps_title": 60,
    "funnel_title": 60,
    "pyramid_title": 60,
    "venn_title": 60,
    "hub_spoke_title": 60,
    "milestone_title": 60,
    "kanban_title": 60,
    "matrix_title": 60,
    "gauge_title": 60,
    "icon_grid_title": 60,
    "risk_title": 60,
    "hub_center": 30,
    "venn_overlap": 60,
}

# Per-element character limits for list items.
# Key -> list of max chars per tuple position.
_ITEM_CHAR_LIMITS: dict[str, list[int]] = {
    "overview_facts": [25, 20],
    "values": [30, 120],
    "team": [30, 40, 80],
    "key_facts": [15, 30],
    "exec_bullets": [150],
    "exec_metrics": [15, 25],
    "kpis": [25, 15, 10, None, 5],  # None = skip (float)
    "process_steps": [30, 100],
    "cycle_phases": [30],
    "milestones": [15, 30, 80],
    "comparison_rows": [25, 25, 25],
    "next_steps": [40, 80, 25, 25],
    "cta_contacts": [40, 60],
    "thankyou_contacts": [30, 40, 50],
    "sources_list": [200],
    "funnel_stages": [30, 15, 80],
    "pyramid_layers": [30, 120],
    "venn_sets": [25, 100],
    "hub_spokes": [25, 80],
    "milestone_items": [15, 30, 80],
    "gauges": [25, 15, None],  # None = skip (float)
    "icon_grid_items": [20, 25, 80],
    "risk_items": [30, 10, 80],
    "pillars": [30, 120],
    "infographic_kpis": [15, 25],
    "infographic_progress": [30, None],
    "approach_bullets": [150],
}


def _truncate_strings(content: dict[str, Any]) -> None:
    """Truncate text values to fit their slide builder text boxes."""
    # Direct string fields
    for key, limit in _CHAR_LIMITS.items():
        val = content.get(key)
        if isinstance(val, str) and len(val) > limit:
            content[key] = val[:limit - 1] + "\u2026"  # ellipsis

    # SWOT items
    swot = content.get("swot")
    if isinstance(swot, dict):
        for k in ("strengths", "weaknesses", "opportunities", "threats"):
            items = swot.get(k, [])
            if isinstance(items, list):
                swot[k] = [
                    (s[:75] + "\u2026" if isinstance(s, str) and len(s) > 76 else s)
                    for s in items
                ]

    # Bullet lists and tuple lists
    for key, limits in _ITEM_CHAR_LIMITS.items():
        val = content.get(key)
        if not isinstance(val, list):
            continue
        for item in val:
            if isinstance(item, list):
                for j, lim in enumerate(limits):
                    if lim is None or j >= len(item):
                        continue
                    if isinstance(item[j], str) and len(item[j]) > lim:
                        item[j] = item[j][:lim - 1] + "\u2026"
            elif isinstance(item, str):
                lim = limits[0] if limits else 150
                if lim and len(item) > lim:
                    val[val.index(item)] = item[:lim - 1] + "\u2026"


def _validate_structure(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate top-level structure: selected_slides, sections, content."""
    # Extract selected_slides
    selected = raw.get("selected_slides", [])
    if not isinstance(selected, list) or not selected:
        # Fallback: if no selected_slides, assume all content keys imply slides
        selected = list(SLIDE_CATALOG.keys())

    # Filter to valid slide types only
    selected = [s for s in selected if s in SLIDE_CATALOG]

    # Extract sections
    sections = raw.get("sections", [])
    if not isinstance(sections, list):
        sections = []

    # Validate sections reference only selected slides
    valid_sections = []
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        sec_slides = sec.get("slides", [])
        sec_slides = [s for s in sec_slides if s in selected]
        if sec_slides:
            valid_sections.append({
                "title": sec.get("title", "Section"),
                "subtitle": sec.get("subtitle", ""),
                "slides": sec_slides,
            })

    # If no valid sections, auto-group selected slides
    if not valid_sections:
        valid_sections = [{"title": "Overview", "subtitle": "", "slides": selected}]

    # Ensure every selected slide is in a section
    sectioned = {s for sec in valid_sections for s in sec["slides"]}
    unsectioned = [s for s in selected if s not in sectioned]
    if unsectioned:
        valid_sections.append({
            "title": "Additional",
            "subtitle": "",
            "slides": unsectioned,
        })

    # Extract and validate content
    content = raw.get("content", {})
    if not isinstance(content, dict):
        content = {}

    # Cover and thank-you defaults
    content.setdefault("cover_title", "Presentation")
    content.setdefault("cover_subtitle", "")
    content.setdefault("cover_date", "2026  |  Confidential")
    content.setdefault("thankyou_contacts", [
        ["Email", "contact@company.com", "\u2709"],
        ["Phone", "+1 (555) 123-4567", "\u260E"],
        ["Website", "www.company.com", "\u2302"],
        ["Location", "", "\u2691"],
    ])

    content = _validate_content(content)

    return {
        "selected_slides": selected,
        "sections": valid_sections,
        "content": content,
    }


# ── Public API ────────────────────────────────────────────────────────

def generate_builder_content(
    topic: str,
    company_name: str = "Acme Corp",
    industry: str = "General",
    audience: str = "",
    additional_context: str = "",
    provider: str = "minimax",
    api_key: str | None = None,
) -> dict[str, Any]:
    """Generate slide selection + content for the builder pipeline.

    Returns::

        {
            "selected_slides": ["executive_summary", "kpi_dashboard", ...],
            "sections": [{"title": "...", "subtitle": "...", "slides": [...]}, ...],
            "content": { ... validated content keys ... },
        }
    """
    settings = _get_settings()
    LLMClient = _get_llm_client()
    client = LLMClient(provider=provider, api_key=api_key)

    user_prompt = _build_user_prompt(
        topic, company_name, industry, audience, additional_context,
    )

    raw = client.generate_json(
        system_prompt=_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        max_tokens=settings.builder_max_tokens,
        temperature=settings.temperature,
    )

    return _validate_structure(raw)
