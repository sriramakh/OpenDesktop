"""Content Intelligence Engine — orchestrates AI content generation.

Pipeline: process input → build prompts → call GPT-4 → validate → plan layouts.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from pptmaster.config import get_settings
from pptmaster.models import (
    DesignProfile,
    LayoutInfo,
    PresentationOutline,
    SlideContent,
    SlideType,
)

from .input_processor import process_input
from .openai_client import OpenAIClient
from .prompt_builder import build_system_prompt, build_user_prompt
from .slide_planner import plan_layouts


def generate(
    profile: DesignProfile,
    topic: str = "",
    input_source: str | Path | None = None,
    num_slides: int = 10,
    audience: str = "",
    style_notes: str = "",
    api_key: str | None = None,
) -> tuple[PresentationOutline, list[tuple[SlideContent, LayoutInfo | None]]]:
    """Generate a presentation outline with layout assignments."""
    # 1. Process input content
    content = ""
    if input_source:
        content = process_input(input_source)
    elif topic:
        content = topic

    if not content:
        raise ValueError("No content provided. Specify a topic or input source.")

    # 2. Build prompts
    system_prompt = build_system_prompt(profile)
    user_prompt = build_user_prompt(
        content=content,
        topic=topic,
        num_slides=num_slides,
        audience=audience,
        style_notes=style_notes,
    )

    # 3. Call GPT-4
    settings = get_settings()
    client = OpenAIClient(api_key=api_key)

    # Use generous token budget for rich content
    token_budget = max(settings.max_tokens, num_slides * 800)

    raw = client.generate_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=token_budget,
        temperature=settings.temperature,
    )

    # 4. Validate and parse
    outline = _parse_outline(raw)

    # 5. Post-process: clean up titles
    _clean_titles(outline)

    # 6. Validate slide distribution
    _log_slide_distribution(outline)

    # 6. Plan layout assignments
    assignments = plan_layouts(outline.slides, profile)

    return outline, assignments


def _parse_outline(raw: dict[str, Any]) -> PresentationOutline:
    """Parse and validate the GPT-4 JSON response into a PresentationOutline."""
    try:
        return PresentationOutline.model_validate(raw)
    except Exception:
        slides_raw = raw.get("slides", [])
        slides: list[SlideContent] = []
        for s in slides_raw:
            try:
                slides.append(SlideContent.model_validate(s))
            except Exception as e:
                print(f"  [warn] Skipping invalid slide: {e}", file=sys.stderr)
                continue

        return PresentationOutline(
            title=raw.get("title", "Untitled Presentation"),
            subtitle=raw.get("subtitle", ""),
            target_audience=raw.get("target_audience", ""),
            narrative_arc=raw.get("narrative_arc", ""),
            slides=slides,
        )


def _clean_titles(outline: PresentationOutline) -> None:
    """Post-process slide titles to remove label prefixes."""
    import re
    label_prefixes = re.compile(
        r'^(Section\s*\d*\s*[:–-]\s*|Overview\s*[:–-]\s*|'
        r'Future\s+outlook\s*[:–-]\s*|Key\s+findings?\s*[:–-]\s*|'
        r'Summary\s*[:–-]\s*|Conclusion\s*[:–-]\s*|'
        r'Introduction\s*[:–-]\s*|Background\s*[:–-]\s*)',
        re.IGNORECASE,
    )
    for slide in outline.slides:
        if slide.title:
            cleaned = label_prefixes.sub('', slide.title).strip()
            if cleaned and len(cleaned) > 10:
                slide.title = cleaned[0].upper() + cleaned[1:]


def _log_slide_distribution(outline: PresentationOutline) -> None:
    """Log the distribution of slide types for debugging."""
    type_counts: dict[str, int] = {}
    visual_types = {
        SlideType.KEY_METRICS, SlideType.CHART_BAR, SlideType.CHART_LINE,
        SlideType.CHART_PIE, SlideType.CHART_DONUT, SlideType.TABLE,
        SlideType.TWO_COLUMN, SlideType.THREE_COLUMN, SlideType.FOUR_COLUMN,
    }
    visual_count = 0

    for slide in outline.slides:
        t = slide.slide_type.value
        type_counts[t] = type_counts.get(t, 0) + 1
        if slide.slide_type in visual_types:
            visual_count += 1

    total = len(outline.slides)
    visual_pct = (visual_count / total * 100) if total > 0 else 0

    print(f"  Slide types: {type_counts}", file=sys.stderr)
    print(f"  Visual slides: {visual_count}/{total} ({visual_pct:.0f}%)", file=sys.stderr)
