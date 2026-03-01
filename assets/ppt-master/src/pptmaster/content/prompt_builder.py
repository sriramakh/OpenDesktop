"""GPT-4 prompt construction with design DNA encoding.

Builds system and user prompts that encode the template's design DNA,
available layouts, McKinsey-style content rules, and user requirements.
Emphasizes infographic-heavy, visually rich output.
"""

from __future__ import annotations

from pptmaster.models import DesignProfile, SlideType


def build_system_prompt(profile: DesignProfile) -> str:
    """Build the system prompt encoding design DNA and content rules."""

    layout_summary = _summarize_layouts(profile)

    colors = profile.colors
    color_desc = (
        f"Primary/accent1: {colors.accent1}, "
        f"accent2: {colors.accent2}, "
        f"accent3: {colors.accent3}, "
        f"accent4: {colors.accent4}, "
        f"accent5: {colors.accent5}, "
        f"accent6: {colors.accent6}"
    )

    return f"""You are an elite McKinsey-level presentation designer. You create INFOGRAPHIC-HEAVY, visually stunning executive presentations — NOT boring text dumps.

## CRITICAL RULES — READ CAREFULLY

### Visual-First Design
- AT LEAST 60% of slides MUST be visual/data types: key_metrics, chart_bar, chart_line, chart_pie, chart_donut, table, three_column, four_column, two_column
- NEVER use more than 2 content_text slides in a 10-slide deck
- Every slide with bullets must have MAX 4-5 bullets, each under 10 words
- Prefer key_metrics slides for any numeric data — they are the most visually impactful

### Slide Type Distribution (for a 10-slide deck)
- 1 title slide (opening)
- 1 key_metrics slide (MANDATORY — show 4 metrics with big numbers)
- 2-3 chart slides (bar, pie, line, or donut — with REALISTIC data)
- 1 table slide (comparative data)
- 1-2 multi-column slides (two_column, three_column, or four_column)
- 0-1 content_text slides (MAXIMUM — only if absolutely needed)
- 1 thank_you slide (closing)
- 0-1 divider slides (only for 12+ slide decks)

### McKinsey Content Principles
1. **Action titles**: Every title is a COMPLETE SENTENCE stating the key insight. WRONG: "Market Overview" RIGHT: "Enterprise AI spending will triple to $180B by 2027"
2. **Pyramid principle**: Lead with the conclusion, support with evidence
3. **One message per slide**: Each slide makes exactly ONE point
4. **Data richness**: Charts MUST have realistic, specific numbers (not round numbers). Use 3-6 categories and 1-3 series.
5. **Speaker notes**: 2-3 sentences of presenter talking points per slide

### Chart Data Requirements
- Bar charts: 4-6 categories, 1-2 series, specific values (e.g., 23.4, not 25)
- Pie charts: 4-6 segments that sum to 100, include an "Other" category
- Line charts: 4-6 time periods, 1-3 trend lines
- ALL charts need descriptive series names and category labels

### Key Metrics Requirements
- ALWAYS provide exactly 4 metrics
- Each metric: a punchy number (e.g., "$4.2T", "73%", "2.3x", "15M+") and a short label (3-5 words)
- Assign colors from the accent palette

### Multi-Column Requirements
- two_column: 2 columns, each with heading + 3-4 bullets
- three_column: 3 columns, each with heading + 2-3 bullets + icon_keyword
- four_column: 4 columns, each with heading + 2-3 bullets + icon_keyword
- icon_keyword should be a single common word (e.g., "chart", "globe", "shield", "people", "money", "target", "cloud", "leaf")

### Table Requirements
- 3-5 columns, 3-6 data rows
- Include a mix of text and numbers
- Headers should be clear and short

## Design DNA
- **Colors**: {color_desc}
- **Fonts**: {profile.fonts.major} (headlines) + {profile.fonts.minor} (body)

## Available Layout Categories
{layout_summary}

## Output Format
Return ONLY a JSON object:
{{
  "title": "Presentation Title",
  "subtitle": "Subtitle text",
  "target_audience": "Who this is for",
  "narrative_arc": "Story flow description",
  "slides": [
    {{
      "slide_type": "title|content_text|key_metrics|chart_bar|chart_line|chart_pie|chart_donut|table|two_column|three_column|four_column|divider|thank_you",
      "title": "Action title as complete sentence (NEVER a label)",
      "subtitle": "",
      "body": "",
      "bullets": ["bullet1", "bullet2"],
      "columns": [
        {{"heading": "...", "body": "...", "bullets": ["..."], "icon_keyword": "..."}}
      ],
      "metrics": [
        {{"value": "73%", "label": "Short Label", "icon_keyword": "", "color": ""}}
      ],
      "chart": {{
        "chart_type": "bar|line|pie|donut",
        "title": "Chart title",
        "categories": ["Cat1", "Cat2", "Cat3", "Cat4"],
        "series": [{{"name": "Series Name", "values": [10.5, 20.3, 15.7, 25.1]}}],
        "show_legend": true,
        "show_data_labels": false
      }},
      "table": {{
        "headers": ["Col1", "Col2", "Col3"],
        "rows": [["val1", "val2", "val3"]]
      }},
      "icon_keywords": [],
      "speaker_notes": "Detailed talking points for presenter"
    }}
  ]
}}

IMPORTANT REMINDERS:
- AT LEAST 60% visual slides (metrics/charts/tables/multi-column)
- NO MORE than 1-2 pure text slides in a 10-slide deck
- Every chart must have realistic specific data
- Every title must be an insight sentence, not a label
- key_metrics: exactly 4 items
- Return valid JSON only"""


def build_user_prompt(
    content: str,
    topic: str = "",
    num_slides: int = 10,
    audience: str = "",
    style_notes: str = "",
) -> str:
    """Build the user prompt with content and requirements."""

    parts: list[str] = []

    if topic:
        parts.append(f"## Topic\n{topic}")

    parts.append(f"## Slide Count\nGenerate exactly {num_slides} slides (including title and thank_you).")

    if audience:
        parts.append(f"## Target Audience\n{audience}")

    if style_notes:
        parts.append(f"## Additional Notes\n{style_notes}")

    if content and content != topic:
        max_len = 12000
        if len(content) > max_len:
            content = content[:max_len] + "\n\n[Content truncated...]"
        parts.append(f"## Source Content\n{content}")

    # Enforce visual distribution
    visual_min = max(int(num_slides * 0.6), 4)
    text_max = max(num_slides - visual_min - 2, 1)  # -2 for title+thankyou

    slide_sequence = _build_slide_sequence(num_slides)
    parts.append(f"""## MANDATORY Slide Sequence (follow this structure)
Generate EXACTLY {num_slides} slides with this distribution:
{slide_sequence}

## CRITICAL Rules
- Every title MUST be a complete INSIGHT sentence: "AI drug discovery reduces R&D costs by 40%" NOT "AI in Drug Discovery" or "Future outlook: AI potential"
- NEVER start a title with a label prefix like "Section:", "Overview:", "Future outlook:", "Key findings:" etc.
- chart data: Use specific non-round numbers (e.g., 23.7 not 25)
- three_column: MUST include icon_keyword for each column (e.g., "shield", "chart", "people", "globe", "target", "money")
- two_column: Each column MUST have a heading and 3-4 bullets
- thank_you: MUST include a subtitle (e.g., "Questions? Let's discuss")
- chart show_legend MUST be true for all charts
- Return valid JSON matching the format exactly""")

    return "\n\n".join(parts)


def _build_slide_sequence(num_slides: int) -> str:
    """Build a dynamic slide sequence based on requested count."""
    # Core sequence (always present)
    core = [
        ("title", "(MUST include a subtitle — a tagline or one-sentence summary)"),
        ("key_metrics", "(4 metrics with big numbers)"),
        ("chart_bar", "(with realistic data, 4-5 categories, 2 series)"),
        ("three_column", "(3 columns with heading, 2-3 bullets each, and icon_keyword for each)"),
        ("chart_pie", "(4-6 segments summing to 100%)"),
        ("table", "(4-5 columns, 4-5 data rows with mix of text and numbers)"),
        ("two_column", "(2 columns with heading and 3-4 bullets each)"),
        ("chart_line", "(4-5 time periods, 1-2 trend lines)"),
    ]

    # Extra slides for larger decks
    extras = [
        ("chart_donut", "(4-5 segments, shows distribution/proportion)"),
        ("four_column", "(4 columns with heading, 2 bullets each, and icon_keyword)"),
        ("content_text", "(4-5 impactful bullets, max 10 words each)"),
    ]

    # Build the sequence
    slides = list(core)

    # Add extras based on deck size (after core, before thank_you)
    extras_needed = num_slides - len(core) - 1  # -1 for thank_you
    for j in range(min(extras_needed, len(extras))):
        slides.append(extras[j])

    # If still short, add more visual slides
    while len(slides) < num_slides - 1:
        slides.append(("content_text", "(3-5 impactful bullets, max 10 words each)"))

    # Always end with thank_you
    slides.append(("thank_you", "(closing message + subtitle)"))

    lines = []
    for idx, (stype, desc) in enumerate(slides):
        lines.append(f"- Slide {idx+1}: {stype} {desc}")

    return "\n".join(lines)


def _summarize_layouts(profile: DesignProfile) -> str:
    """Summarize available layout categories with counts."""
    cats = profile.layout_categories
    lines: list[str] = []
    for cat, layouts in sorted(cats.items()):
        names = ", ".join(f'"{l.name}"' for l in layouts[:3])
        extra = f" (+{len(layouts) - 3} more)" if len(layouts) > 3 else ""
        lines.append(f"- **{cat}** ({len(layouts)}): {names}{extra}")
    return "\n".join(lines)
