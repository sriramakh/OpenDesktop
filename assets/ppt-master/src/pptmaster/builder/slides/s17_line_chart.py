"""Slide 17 — Line Chart: Multi-series line chart with trend data."""

from __future__ import annotations

from pptmaster.builder.design_system import SLIDE_W, SLIDE_H, MARGIN, FONT_CAPTION, CONTENT_TOP
from pptmaster.builder.helpers import add_textbox, add_rect, add_line, add_gold_accent_line, add_styled_card, add_slide_title, add_dark_bg, add_background
from pptmaster.builder.slides._chart_helpers import profile_from_theme
from pptmaster.models import ChartSpec
from pptmaster.composer.chart_renderer import add_chart
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

    content_top = add_slide_title(slide, c.get("line_title", "Growth Trends"), theme=t)

    text_color = "#FFFFFF" if s.dark_mode else t.primary
    sub_color = tint(t.primary, 0.6) if s.dark_mode else t.secondary

    spec = ChartSpec(
        chart_type="line", title="",
        categories=c.get("line_categories", ["2022", "2023", "2024", "2025", "2026"]),
        series=c.get("line_series", [{"name": "Revenue", "values": [520, 610, 690, 780, 850]}]),
        show_legend=True, show_data_labels=False,
    )
    add_chart(slide, spec, profile_from_theme(t),
              left=MARGIN, top=content_top + 100000, width=SLIDE_W - 2 * MARGIN, height=4500000)


# ── Variant: scholarly ────────────────────────────────────────────────

def _scholarly(slide, t):
    """White bg, 'Figure 3:' caption, thin rule frame around chart."""
    c = t.content
    m = MARGIN
    title = c.get("line_title", "Growth Trends")

    add_background(slide, "#FFFFFF")
    content_y = add_slide_title(slide, title, theme=t)

    # Figure caption
    caption = f"Figure 3: {title}"
    add_textbox(slide, caption, m, content_y + 20000,
                SLIDE_W - 2 * m, 300000,
                font_size=FONT_CAPTION, italic=True, color=t.secondary)

    chart_top = content_y + 350000
    chart_h = 4200000
    rule_color = tint(t.secondary, 0.5)

    # Thin rule above chart
    add_line(slide, m, chart_top - 30000, SLIDE_W - m, chart_top - 30000,
             color=rule_color, width=0.5)

    spec = ChartSpec(
        chart_type="line", title="",
        categories=c.get("line_categories", ["2022", "2023", "2024", "2025", "2026"]),
        series=c.get("line_series", [{"name": "Revenue", "values": [520, 610, 690, 780, 850]}]),
        show_legend=True, show_data_labels=False,
    )
    add_chart(slide, spec, profile_from_theme(t),
              left=m, top=chart_top, width=SLIDE_W - 2 * m, height=chart_h)

    # Thin rule below chart
    add_line(slide, m, chart_top + chart_h + 30000, SLIDE_W - m, chart_top + chart_h + 30000,
             color=rule_color, width=0.5)

    # Source caption below
    add_textbox(slide, "Source: Internal data", m, chart_top + chart_h + 60000,
                SLIDE_W - 2 * m, 250000,
                font_size=9, italic=True, color=tint(t.secondary, 0.6))


# ── Variant: laboratory ──────────────────────────────────────────────

def _laboratory(slide, t):
    """Dark bg, accent line below title, chart rendered with dark profile."""
    c = t.content
    m = MARGIN
    title = c.get("line_title", "Growth Trends")

    add_background(slide, t.primary)
    content_y = add_slide_title(slide, title, theme=t)

    # Colored accent line below title
    add_line(slide, m, content_y + 30000, SLIDE_W - m, content_y + 30000,
             color=t.accent, width=2.0)

    spec = ChartSpec(
        chart_type="line", title="",
        categories=c.get("line_categories", ["2022", "2023", "2024", "2025", "2026"]),
        series=c.get("line_series", [{"name": "Revenue", "values": [520, 610, 690, 780, 850]}]),
        show_legend=True, show_data_labels=False,
    )
    add_chart(slide, spec, profile_from_theme(t),
              left=m, top=content_y + 150000, width=SLIDE_W - 2 * m, height=4500000)


# ── Variant: dashboard ───────────────────────────────────────────────

def _dashboard(slide, t):
    """White bg with accent header band, chart rendered larger."""
    c = t.content
    m = int(MARGIN * 0.85)
    title = c.get("line_title", "Growth Trends")

    add_background(slide, "#FFFFFF")

    # Accent header band
    add_rect(slide, 0, 0, SLIDE_W, 750000, fill_color=t.primary)
    add_textbox(slide, title, m, 150000, SLIDE_W - 2 * m, 450000,
                font_size=22, bold=True, color="#FFFFFF")
    add_gold_accent_line(slide, m, 700000, 600000, color=t.accent)

    spec = ChartSpec(
        chart_type="line", title="",
        categories=c.get("line_categories", ["2022", "2023", "2024", "2025", "2026"]),
        series=c.get("line_series", [{"name": "Revenue", "values": [520, 610, 690, 780, 850]}]),
        show_legend=True, show_data_labels=False,
    )
    add_chart(slide, spec, profile_from_theme(t),
              left=m, top=850000, width=SLIDE_W - 2 * m, height=5500000)
