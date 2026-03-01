"""Map SlideType to layout content_categories and enforce variety."""

from __future__ import annotations

from pptmaster.models import DesignProfile, LayoutInfo, SlideContent, SlideType

# Map each slide type to preferred layout categories (in order of preference)
_TYPE_TO_CATEGORIES: dict[SlideType, list[str]] = {
    SlideType.TITLE: ["title"],
    SlideType.CONTENT_TEXT: ["content_text", "content_image_right"],
    SlideType.CONTENT_IMAGE_RIGHT: ["content_image_right", "content_text"],
    SlideType.CONTENT_IMAGE_LEFT: ["content_image_left", "content_image_right"],
    SlideType.TWO_COLUMN: ["multi_column_2", "multi_column_3"],
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


def plan_layouts(
    slides: list[SlideContent],
    profile: DesignProfile,
) -> list[tuple[SlideContent, LayoutInfo | None]]:
    """For each slide, find the best matching layout from the profile.

    Returns a list of (slide_content, layout_info) tuples.
    Uses variety enforcement to avoid consecutive duplicate layouts.
    """
    cats = profile.layout_categories
    used_recently: list[int] = []  # Track last N layout indices used
    results: list[tuple[SlideContent, LayoutInfo | None]] = []

    for slide in slides:
        preferred_cats = _TYPE_TO_CATEGORIES.get(slide.slide_type, ["content_text"])

        best_layout: LayoutInfo | None = None
        best_score = -1

        for cat in preferred_cats:
            candidates = cats.get(cat, [])
            for layout in candidates:
                score = _score_layout(slide, layout, used_recently)
                if score > best_score:
                    best_score = score
                    best_layout = layout

        # If no match found, try any content_text layout
        if best_layout is None:
            for layout in cats.get("content_text", []):
                best_layout = layout
                break

        if best_layout is not None:
            used_recently.append(best_layout.index)
            if len(used_recently) > 3:
                used_recently.pop(0)

        results.append((slide, best_layout))

    return results


def _score_layout(
    slide: SlideContent,
    layout: LayoutInfo,
    used_recently: list[int],
) -> float:
    """Score a layout for a given slide content.

    Scoring:
    - Category match: base 50 points
    - Placeholder fit: up to 20 points
    - Variety bonus: 10 points if not recently used
    - Layout hint match: 15 points if matches
    """
    score = 50.0  # Base score for being in the right category

    # Placeholder fit scoring
    has_title = len(layout.title_placeholders) > 0
    has_body = len(layout.body_placeholders) > 0
    has_pic = len(layout.picture_placeholders) > 0

    if slide.title and has_title:
        score += 5
    if (slide.body or slide.bullets) and has_body:
        score += 5
    if slide.slide_type in (SlideType.CONTENT_IMAGE_RIGHT, SlideType.CONTENT_IMAGE_LEFT) and has_pic:
        score += 10

    # Multi-column fit
    if slide.columns:
        num_cols = len(slide.columns)
        body_count = len(layout.body_placeholders)
        if body_count >= num_cols:
            score += 10
        elif body_count > 0:
            score += 5

    # Variety bonus
    if layout.index not in used_recently:
        score += 10

    # Layout hint match
    if slide.layout_hint and slide.layout_hint.lower() in layout.name.lower():
        score += 15

    return score
