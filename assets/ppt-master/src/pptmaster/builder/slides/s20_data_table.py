"""Slide 20 — Data Table: Styled table via add_table()."""

from __future__ import annotations

from pptmaster.builder.design_system import SLIDE_W, SLIDE_H, MARGIN, FONT_CAPTION, CONTENT_TOP
from pptmaster.builder.helpers import add_textbox, add_rect, add_line, add_gold_accent_line, add_styled_card, add_slide_title, add_dark_bg, add_background
from pptmaster.builder.slides._chart_helpers import profile_from_theme
from pptmaster.models import TableSpec
from pptmaster.composer.table_renderer import add_table
from pptmaster.assets.color_utils import tint, shade


def build(slide, *, theme=None) -> None:
    from pptmaster.builder.themes import DEFAULT_THEME
    t = theme or DEFAULT_THEME
    c = t.content

    s = t.ux_style

    _STYLE_DISPATCH = {"scholarly": _scholarly, "laboratory": _laboratory, "dashboard": _dashboard}
    _fn = _STYLE_DISPATCH.get(s.name)
    if _fn:
        return _fn(slide, t)

    add_dark_bg(slide, t)

    content_top = add_slide_title(slide, c.get("table_title", "Financial Summary"), theme=t)

    text_color = "#FFFFFF" if s.dark_mode else t.primary
    sub_color = tint(t.primary, 0.6) if s.dark_mode else t.secondary

    spec = TableSpec(
        headers=c.get("table_headers", ["Metric", "FY 2024", "FY 2025", "FY 2026", "Change"]),
        rows=c.get("table_rows", [["Revenue", "$690M", "$780M", "$850M", "+9%"]]),
        highlight_header=True,
        column_widths=c.get("table_col_widths", [2.0, 1.2, 1.2, 1.2, 1.0]),
    )
    add_table(slide, spec, profile_from_theme(t),
              left=MARGIN, top=content_top + 100000, width=SLIDE_W - 2 * MARGIN, height=4200000)


# ── Variant: scholarly ────────────────────────────────────────────────

def _scholarly(slide, t):
    """White bg, 'Table 3:' caption above the table, thin rule lines framing it."""
    c = t.content
    m = MARGIN
    title = c.get("table_title", "Financial Summary")

    add_background(slide, "#FFFFFF")
    content_y = add_slide_title(slide, title, theme=t)

    # Table caption
    caption = f"Table 3: {title}"
    add_textbox(slide, caption, m, content_y + 20000,
                SLIDE_W - 2 * m, 300000,
                font_size=FONT_CAPTION, italic=True, color=t.secondary)

    table_top = content_y + 350000
    table_h = 4000000
    rule_color = tint(t.secondary, 0.5)

    # Thin rule above table
    add_line(slide, m, table_top - 30000, SLIDE_W - m, table_top - 30000,
             color=rule_color, width=0.5)

    spec = TableSpec(
        headers=c.get("table_headers", ["Metric", "FY 2024", "FY 2025", "FY 2026", "Change"]),
        rows=c.get("table_rows", [["Revenue", "$690M", "$780M", "$850M", "+9%"]]),
        highlight_header=True,
        column_widths=c.get("table_col_widths", [2.0, 1.2, 1.2, 1.2, 1.0]),
    )
    add_table(slide, spec, profile_from_theme(t),
              left=m, top=table_top, width=SLIDE_W - 2 * m, height=table_h)

    # Thin rule below table
    add_line(slide, m, table_top + table_h + 30000, SLIDE_W - m, table_top + table_h + 30000,
             color=rule_color, width=0.5)

    # Source note
    add_textbox(slide, "Source: Internal data", m, table_top + table_h + 60000,
                SLIDE_W - 2 * m, 250000,
                font_size=9, italic=True, color=tint(t.secondary, 0.6))


# ── Variant: laboratory ──────────────────────────────────────────────

def _laboratory(slide, t):
    """Dark bg, table rendered with dark theme profile."""
    c = t.content
    m = MARGIN
    title = c.get("table_title", "Financial Summary")

    add_background(slide, t.primary)
    content_y = add_slide_title(slide, title, theme=t)

    # Colored accent line below title
    add_line(slide, m, content_y + 30000, SLIDE_W - m, content_y + 30000,
             color=t.accent, width=2.0)

    spec = TableSpec(
        headers=c.get("table_headers", ["Metric", "FY 2024", "FY 2025", "FY 2026", "Change"]),
        rows=c.get("table_rows", [["Revenue", "$690M", "$780M", "$850M", "+9%"]]),
        highlight_header=True,
        column_widths=c.get("table_col_widths", [2.0, 1.2, 1.2, 1.2, 1.0]),
    )
    add_table(slide, spec, profile_from_theme(t),
              left=m, top=content_y + 150000, width=SLIDE_W - 2 * m, height=4200000)


# ── Variant: dashboard ───────────────────────────────────────────────

def _dashboard(slide, t):
    """White bg with accent header band, table with tighter spacing."""
    c = t.content
    m = int(MARGIN * 0.85)
    title = c.get("table_title", "Financial Summary")

    add_background(slide, "#FFFFFF")

    # Accent header band
    add_rect(slide, 0, 0, SLIDE_W, 750000, fill_color=t.primary)
    add_textbox(slide, title, m, 150000, SLIDE_W - 2 * m, 450000,
                font_size=22, bold=True, color="#FFFFFF")
    add_gold_accent_line(slide, m, 700000, 600000, color=t.accent)

    spec = TableSpec(
        headers=c.get("table_headers", ["Metric", "FY 2024", "FY 2025", "FY 2026", "Change"]),
        rows=c.get("table_rows", [["Revenue", "$690M", "$780M", "$850M", "+9%"]]),
        highlight_header=True,
        column_widths=c.get("table_col_widths", [2.0, 1.2, 1.2, 1.2, 1.0]),
    )
    add_table(slide, spec, profile_from_theme(t),
              left=m, top=850000, width=SLIDE_W - 2 * m, height=5500000)
