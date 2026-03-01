"""Slide 2 — Table of Contents: Accent numbered circles, 5 sections."""

from __future__ import annotations

from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

from pptmaster.builder.design_system import (
    SLIDE_W, SLIDE_H, MARGIN, FONT_SLIDE_TITLE, FONT_CAPTION, CONTENT_TOP,
)
from pptmaster.builder.helpers import (
    add_textbox, add_circle, add_gold_accent_line, add_line,
    add_styled_card, add_slide_title, add_dark_bg, add_background, add_rect,
)
from pptmaster.assets.color_utils import tint, shade


_STYLE_DISPATCH = {
    "scholarly": "_scholarly",
    "laboratory": "_laboratory",
    "dashboard": "_dashboard",
}


def build(slide, *, theme=None, company_name: str = "") -> None:
    from pptmaster.builder.themes import DEFAULT_THEME
    t = theme or DEFAULT_THEME
    c = t.content
    s = t.ux_style

    # Check for variant-specific dispatches
    _fn_name = _STYLE_DISPATCH.get(s.name)
    if _fn_name:
        _fn = globals()[_fn_name]
        return _fn(slide, t, c, s)

    add_dark_bg(slide, t)
    content_y = add_slide_title(slide, "Agenda", theme=t)

    sections = c.get("toc_sections", [
        ("01", "About Us", "Company overview, values, and leadership"),
        ("02", "Strategy", "Executive summary, KPIs, processes, and roadmap"),
        ("03", "Data & Insights", "Charts, comparisons, and detailed analysis"),
        ("04", "Deliverables", "Content layouts, quotes, and dashboards"),
        ("05", "Next Steps", "Action items, timelines, and closing"),
    ])

    start_y = content_y + 100000
    n_sections = len(sections)
    # Cap row_height so all sections fit above the footer
    available_h = SLIDE_H - start_y - 200000  # 200k bottom margin
    max_row_height = available_h // max(n_sections, 1)
    row_height = min(int(750000 * s.gap_factor), max_row_height)
    circle_radius = 200000
    circle_x = int(MARGIN * s.margin_factor) + 300000

    text_color = "#FFFFFF" if s.dark_mode else t.primary
    sub_color = tint(t.primary, 0.6) if s.dark_mode else t.secondary
    line_color = tint(t.primary, 0.25) if s.dark_mode else t.light_bg

    for i, (num, title, desc) in enumerate(sections):
        y = start_y + i * row_height

        add_circle(slide, circle_x, y + 180000, circle_radius, fill_color=t.accent)
        add_textbox(slide, num, circle_x - circle_radius, y + 180000 - circle_radius,
                    circle_radius * 2, circle_radius * 2,
                    font_size=18, bold=True, color="#FFFFFF",
                    alignment=PP_ALIGN.CENTER, vertical_anchor=MSO_ANCHOR.MIDDLE)

        text_left = circle_x + circle_radius + 300000
        add_textbox(slide, title, text_left, y + 30000, 6000000, 350000,
                    font_size=20, bold=True, color=text_color)
        add_textbox(slide, desc, text_left, y + 330000, 6000000, 300000,
                    font_size=FONT_CAPTION, color=sub_color)

        if i < len(sections) - 1:
            add_line(slide, text_left, y + row_height - 50000, SLIDE_W - int(MARGIN * s.margin_factor),
                     y + row_height - 50000, color=line_color, width=0.75)


# ── SCHOLARLY — white bg, "Contents" heading, thin ruled numbered list ──

def _scholarly(slide, t, c, s):
    add_background(slide, "#FAFAF7")

    sections = c.get("toc_sections", [
        ("01", "About Us", "Company overview, values, and leadership"),
        ("02", "Strategy", "Executive summary, KPIs, processes, and roadmap"),
        ("03", "Data & Insights", "Charts, comparisons, and detailed analysis"),
        ("04", "Deliverables", "Content layouts, quotes, and dashboards"),
        ("05", "Next Steps", "Action items, timelines, and closing"),
    ])

    # "Contents" heading — centered, elegant
    add_textbox(slide, "Contents", MARGIN, 600000, SLIDE_W - 2 * MARGIN, 600000,
                font_size=FONT_SLIDE_TITLE, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER)

    # Thin rule below heading
    rule_left = SLIDE_W // 4
    rule_right = SLIDE_W * 3 // 4
    add_line(slide, rule_left, 1250000, rule_right, 1250000,
             color=tint(t.secondary, 0.6), width=0.5)

    # Numbered sections with thin rules between them
    content_left = int(SLIDE_W * 0.20)
    content_w = int(SLIDE_W * 0.60)
    start_y = 1500000
    row_h = 780000

    for i, (num, title, desc) in enumerate(sections):
        y = start_y + i * row_h

        # Number — left, muted
        add_textbox(slide, num, content_left, y, 500000, 350000,
                    font_size=16, bold=True, color=t.accent)

        # Title — next to number
        add_textbox(slide, title, content_left + 550000, y, content_w - 550000, 350000,
                    font_size=18, bold=True, color=t.primary)

        # Description — below title
        add_textbox(slide, desc, content_left + 550000, y + 320000,
                    content_w - 550000, 280000,
                    font_size=FONT_CAPTION, color=t.secondary)

        # Thin rule between sections
        if i < len(sections) - 1:
            rule_y = y + row_h - 60000
            add_line(slide, content_left, rule_y, content_left + content_w, rule_y,
                     color=tint(t.secondary, 0.7), width=0.5)


# ── LABORATORY — dark bg, colored left-border cards, data-dense ─────────

def _laboratory(slide, t, c, s):
    add_background(slide, t.primary)

    sections = c.get("toc_sections", [
        ("01", "About Us", "Company overview, values, and leadership"),
        ("02", "Strategy", "Executive summary, KPIs, processes, and roadmap"),
        ("03", "Data & Insights", "Charts, comparisons, and detailed analysis"),
        ("04", "Deliverables", "Content layouts, quotes, and dashboards"),
        ("05", "Next Steps", "Action items, timelines, and closing"),
    ])

    # Top accent bar
    add_rect(slide, 0, 0, SLIDE_W, 50000, fill_color=t.accent)

    # "Agenda" heading — left, accent-colored
    add_textbox(slide, "AGENDA", MARGIN, 400000, 4000000, 500000,
                font_size=FONT_SLIDE_TITLE, bold=True, color="#FFFFFF")
    add_rect(slide, MARGIN, 900000, 1500000, 30000, fill_color=t.accent)

    # Cards with colored left borders
    start_y = 1200000
    n_sections = len(sections)
    # Compute card_h + gap so all cards fit above the bottom accent bar
    available_h = SLIDE_H - start_y - 100000  # 100k for bottom accent bar + margin
    max_per_card = available_h // max(n_sections, 1)
    gap = min(100000, max_per_card // 10)
    card_h = min(850000, max_per_card - gap)
    card_left = MARGIN
    card_w = SLIDE_W - 2 * MARGIN

    for i, (num, title, desc) in enumerate(sections):
        y = start_y + i * (card_h + gap)

        # Card background — dark, subtle
        add_rect(slide, card_left, y, card_w, card_h,
                 fill_color=tint(t.primary, 0.06))

        # Left accent border
        add_rect(slide, card_left, y, 40000, card_h,
                 fill_color=t.palette[i % len(t.palette)])

        # Number — accent colored, monospace feel
        add_textbox(slide, num, card_left + 120000, y + 150000, 500000, 350000,
                    font_size=22, bold=True, color=t.accent)

        # Title
        add_textbox(slide, title, card_left + 650000, y + 150000,
                    card_w - 800000, 350000,
                    font_size=18, bold=True, color="#FFFFFF")

        # Description
        add_textbox(slide, desc, card_left + 650000, y + 470000,
                    card_w - 800000, 280000,
                    font_size=FONT_CAPTION, color=tint(t.primary, 0.5))

    # Bottom accent bar
    add_rect(slide, 0, SLIDE_H - 50000, SLIDE_W, 50000, fill_color=t.accent)


# ── DASHBOARD — horizontal tabs at top, section cards in grid ───────────

def _dashboard(slide, t, c, s):
    add_background(slide, "#FFFFFF")
    m = int(MARGIN * 0.85)

    sections = c.get("toc_sections", [
        ("01", "About Us", "Company overview, values, and leadership"),
        ("02", "Strategy", "Executive summary, KPIs, processes, and roadmap"),
        ("03", "Data & Insights", "Charts, comparisons, and detailed analysis"),
        ("04", "Deliverables", "Content layouts, quotes, and dashboards"),
        ("05", "Next Steps", "Action items, timelines, and closing"),
    ])

    # Accent header band
    band_h = 700000
    add_rect(slide, 0, 0, SLIDE_W, band_h, fill_color=t.accent)

    # "Agenda" inside header
    add_textbox(slide, "Agenda", m, 150000, 3000000, 400000,
                font_size=FONT_SLIDE_TITLE, bold=True, color="#FFFFFF")

    # Tab-like indicators in header
    n = len(sections)
    tab_w = min(1800000, (SLIDE_W - 2 * m) // max(n, 1))
    tab_top = band_h - 60000
    for i in range(n):
        x = m + i * tab_w
        fill = "#FFFFFF" if i == 0 else tint(t.accent, 0.2)
        add_rect(slide, x, tab_top, tab_w - 60000, 60000, fill_color=fill)

    # Section cards in a grid below header
    card_area_top = band_h + 200000
    available_h = SLIDE_H - card_area_top - m
    cols = 3 if n > 3 else n
    rows = (n + cols - 1) // cols
    card_gap = 200000
    card_w = (SLIDE_W - 2 * m - (cols - 1) * card_gap) // cols
    card_h = min(1800000, (available_h - (rows - 1) * card_gap) // max(rows, 1))

    for i, (num, title, desc) in enumerate(sections):
        row = i // cols
        col = i % cols
        x = m + col * (card_w + card_gap)
        y = card_area_top + row * (card_h + card_gap)

        # Card shadow
        add_rect(slide, x + 12000, y + 12000, card_w, card_h,
                 fill_color=tint(t.secondary, 0.85), corner_radius=60000)
        # Card
        add_rect(slide, x, y, card_w, card_h,
                 fill_color="#FFFFFF", corner_radius=60000,
                 line_color=tint(t.secondary, 0.7), line_width=0.5)
        # Accent top strip
        add_rect(slide, x, y, card_w, 45000, fill_color=t.accent)

        # Number
        add_textbox(slide, num, x + 150000, y + 150000, 400000, 350000,
                    font_size=20, bold=True, color=t.accent)

        # Title
        add_textbox(slide, title, x + 150000, y + 500000,
                    card_w - 300000, 400000,
                    font_size=16, bold=True, color=t.primary)

        # Description
        add_textbox(slide, desc, x + 150000, y + 900000,
                    card_w - 300000, card_h - 1050000,
                    font_size=FONT_CAPTION, color=t.secondary)
