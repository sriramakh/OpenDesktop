"""Layout matcher — weighted scoring to match content to the best layout."""

from __future__ import annotations

from pptmaster.models import DesignProfile, LayoutInfo, SlideContent, SlideType


def match_layout(
    slide: SlideContent,
    profile: DesignProfile,
    used_indices: list[int] | None = None,
) -> LayoutInfo | None:
    """Find the best layout for a slide's content.

    Scoring weights:
    - Category match: 50 points
    - Placeholder fit: up to 20 points
    - Variety bonus: 10 points if not recently used
    - Layout hint match: 15 points
    """
    if used_indices is None:
        used_indices = []

    best: LayoutInfo | None = None
    best_score = -1.0

    preferred_cats = _slide_type_to_categories(slide.slide_type)

    for layout in profile.layouts:
        score = 0.0

        # Category match
        if layout.content_category in preferred_cats:
            cat_idx = preferred_cats.index(layout.content_category)
            score += 50 - (cat_idx * 10)  # Primary category gets 50, secondary 40, etc.
        else:
            continue  # Skip layouts that don't match any preferred category

        # Placeholder fit
        score += _placeholder_fit_score(slide, layout)

        # Variety bonus
        if layout.index not in used_indices[-3:]:
            score += 10

        # Layout hint match
        if slide.layout_hint and slide.layout_hint.lower() in layout.name.lower():
            score += 15

        if score > best_score:
            best_score = score
            best = layout

    # Fallback to any content_text layout
    if best is None:
        for layout in profile.layouts:
            if layout.content_category == "content_text":
                return layout

    return best


def _placeholder_fit_score(slide: SlideContent, layout: LayoutInfo) -> float:
    """Score how well the slide's content fits the layout's placeholders."""
    score = 0.0

    has_title = len(layout.title_placeholders) > 0
    has_body = len(layout.body_placeholders) > 0
    has_pic = len(layout.picture_placeholders) > 0
    num_content = len(layout.content_placeholders)

    if slide.title and has_title:
        score += 5
    if (slide.body or slide.bullets) and has_body:
        score += 5
    if slide.image_prompt and has_pic:
        score += 5

    # Multi-column fit
    if slide.columns:
        col_count = len(slide.columns)
        if num_content >= col_count:
            score += 5
        elif num_content >= col_count - 1:
            score += 2

    return score


def _slide_type_to_categories(slide_type: SlideType) -> list[str]:
    """Map a slide type to preferred layout categories."""
    mapping: dict[SlideType, list[str]] = {
        SlideType.TITLE: ["title", "divider"],
        SlideType.CONTENT_TEXT: ["content_text"],
        SlideType.CONTENT_IMAGE_RIGHT: ["content_image_right", "content_text"],
        SlideType.CONTENT_IMAGE_LEFT: ["content_image_left", "content_image_right"],
        SlideType.TWO_COLUMN: ["multi_column_2", "content_text"],
        SlideType.THREE_COLUMN: ["multi_column_3", "multi_column_2"],
        SlideType.FOUR_COLUMN: ["multi_column_4", "multi_column_3"],
        SlideType.KEY_METRICS: ["blank_canvas"],
        SlideType.CHART_BAR: ["blank_canvas", "content_text"],
        SlideType.CHART_LINE: ["blank_canvas", "content_text"],
        SlideType.CHART_PIE: ["blank_canvas", "content_text"],
        SlideType.CHART_DONUT: ["blank_canvas", "content_text"],
        SlideType.TABLE: ["blank_canvas", "content_text"],
        SlideType.TIMELINE: ["multi_column_4", "multi_column_3", "blank_canvas"],
        SlideType.PROFILE_GRID: ["profile_grid", "multi_column_4"],
        SlideType.DIVIDER: ["divider", "title"],
        SlideType.FULL_IMAGE: ["full_image", "content_image_right"],
        SlideType.MISSION_VISION: ["mission_vision", "multi_column_2"],
        SlideType.THANK_YOU: ["thank_you"],
    }
    return mapping.get(slide_type, ["content_text"])
