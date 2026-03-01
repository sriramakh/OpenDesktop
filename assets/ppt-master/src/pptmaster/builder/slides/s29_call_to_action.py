"""Slide 29 -- Call to Action: 9 unique visual variants dispatched by UX style."""

from __future__ import annotations

from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

from pptmaster.builder.design_system import (
    SLIDE_W, SLIDE_H, MARGIN, FONT_SECTION_TITLE, FONT_SUBTITLE,
    FONT_CAPTION, CONTENT_TOP, FOOTER_TOP, col_span,
)
from pptmaster.builder.helpers import (
    add_textbox, add_rect, add_circle, add_line,
    add_gold_accent_line, add_background, add_dark_bg,
    add_styled_card, add_diamond, add_hexagon, add_triangle,
    add_image_placeholder,
)
from pptmaster.assets.color_utils import tint, shade


def build(slide, *, theme=None, company_name: str = "") -> None:
    from pptmaster.builder.themes import DEFAULT_THEME
    t = theme or DEFAULT_THEME
    s = t.ux_style
    c = t.content

    dispatch = {
        "dark-centered": _dark_centered,
        "white-centered": _white_centered,
        "split-bold": _split_bold,
        "elevated-centered": _elevated_centered,
        "angular": _angular,
        "editorial-clean": _editorial_clean,
        "gradient-full": _gradient_full,
        "retro-centered": _retro_centered,
        "creative-bold": _creative_bold,
        "scholarly-clean": _scholarly_clean,
        "laboratory-clean": _laboratory_clean,
        "dashboard-clean": _dashboard_clean,
    }
    builder = dispatch.get(s.cta, _dark_centered)
    builder(slide, t, c)


def _get_cta(c):
    """Extract CTA data from content dict."""
    headline = c.get("cta_headline", "Let's Build the Future\nTogether")
    subtitle = c.get("cta_subtitle", "Ready to start? Contact us today.")
    contacts = c.get("cta_contacts", [
        ("Email", "contact@company.com"),
        ("Phone", "+1 555-123-4567"),
        ("Web", "www.company.com"),
    ])
    return headline, subtitle, contacts


# -- Variant 1: CLASSIC / DARK -- dark bg, bold CTA, dual accent lines, 3-col contacts --

def _dark_centered(slide, t, c):
    add_background(slide, t.primary)
    headline, subtitle, contacts = _get_cta(c)

    # Top accent line
    line_y = CONTENT_TOP - 200000
    add_gold_accent_line(slide, MARGIN, line_y, SLIDE_W - 2 * MARGIN,
                         thickness=2, color=t.accent)

    # Large centered CTA headline
    add_textbox(slide, headline, MARGIN, CONTENT_TOP,
                SLIDE_W - 2 * MARGIN, 1400000,
                font_size=FONT_SECTION_TITLE, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)

    # Subtitle
    sub_w = SLIDE_W - 2 * MARGIN - 2000000
    add_textbox(slide, subtitle, MARGIN + 1000000, CONTENT_TOP + 1500000,
                sub_w, 600000,
                font_size=16, color=tint(t.primary, 0.6), alignment=PP_ALIGN.CENTER)

    # Bottom accent line
    add_gold_accent_line(slide, MARGIN, CONTENT_TOP + 2300000,
                         SLIDE_W - 2 * MARGIN, thickness=2, color=t.accent)

    # 3-column contact grid
    grid_top = CONTENT_TOP + 2700000
    for i, (label, value) in enumerate(contacts[:3]):
        left, width = col_span(3, i, gap=300000)
        add_textbox(slide, label, left, grid_top, width, 350000,
                    font_size=12, bold=True, color=t.accent,
                    alignment=PP_ALIGN.CENTER)
        add_textbox(slide, value, left, grid_top + 400000, width, 350000,
                    font_size=14, color="#FFFFFF",
                    alignment=PP_ALIGN.CENTER)


# -- Variant 2: MINIMAL -- white bg, clean centered text, thin rules, minimal contacts --

def _white_centered(slide, t, c):
    headline, subtitle, contacts = _get_cta(c)
    s = t.ux_style
    m = int(MARGIN * s.margin_factor)

    # Top thin rule
    center_y = SLIDE_H // 2
    rule_top = center_y - 1800000
    rule_w = int(SLIDE_W * 0.55)
    rule_left = (SLIDE_W - rule_w) // 2

    add_line(slide, rule_left, rule_top, rule_left + rule_w, rule_top,
             color=tint(t.secondary, 0.7), width=0.5)

    # Short accent mark at center of top rule
    accent_w = 400000
    add_line(slide, SLIDE_W // 2 - accent_w // 2, rule_top,
             SLIDE_W // 2 + accent_w // 2, rule_top,
             color=t.accent, width=1.5)

    # CTA headline -- clean, centered
    head_w = SLIDE_W - 2 * m - 1000000
    head_left = (SLIDE_W - head_w) // 2
    add_textbox(slide, headline, head_left, rule_top + 300000,
                head_w, 1400000,
                font_size=34, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER)

    # Centered accent dot
    add_gold_accent_line(slide, SLIDE_W // 2 - 300000, rule_top + 1800000,
                         600000, thickness=2, color=t.accent)

    # Subtitle
    sub_w = SLIDE_W - 2 * m - 2000000
    add_textbox(slide, subtitle, (SLIDE_W - sub_w) // 2, rule_top + 2050000,
                sub_w, 500000,
                font_size=14, color=t.secondary, alignment=PP_ALIGN.CENTER)

    # Bottom thin rule
    rule_bottom = rule_top + 2800000
    add_line(slide, rule_left, rule_bottom, rule_left + rule_w, rule_bottom,
             color=tint(t.secondary, 0.7), width=0.5)

    # Contacts -- simple centered list below rule
    contact_top = rule_bottom + 300000
    contact_strs = [f"{label}: {value}" for label, value in contacts[:3]]
    contact_text = "    |    ".join(contact_strs)
    add_textbox(slide, contact_text, m, contact_top,
                SLIDE_W - 2 * m, 400000,
                font_size=11, color=t.secondary, alignment=PP_ALIGN.CENTER)


# -- Variant 3: BOLD / SPLIT -- left half accent bg with CTA, right half dark with contacts --

def _split_bold(slide, t, c):
    headline, subtitle, contacts = _get_cta(c)

    split_x = int(SLIDE_W * 0.55)

    # Left panel: accent/primary
    add_rect(slide, 0, 0, split_x, SLIDE_H, fill_color=t.accent)

    # Right panel: dark primary
    add_rect(slide, split_x, 0, SLIDE_W - split_x, SLIDE_H, fill_color=t.primary)

    # Accent stripe between panels
    add_rect(slide, split_x - 25000, 0, 50000, SLIDE_H,
             fill_color=shade(t.accent, 0.2))

    # Left panel: CTA headline
    left_margin = MARGIN + 200000
    left_w = split_x - left_margin - MARGIN
    add_textbox(slide, headline.upper(), left_margin, SLIDE_H // 2 - 1200000,
                left_w, 1600000,
                font_size=36, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.LEFT)

    # Left panel: accent bar below headline
    add_rect(slide, left_margin, SLIDE_H // 2 + 600000,
             2000000, 60000, fill_color="#FFFFFF")

    # Left panel: subtitle
    add_textbox(slide, subtitle, left_margin, SLIDE_H // 2 + 800000,
                left_w, 500000,
                font_size=14, color=tint(t.accent, 0.6))

    # Right panel: contact info vertically stacked
    right_left = split_x + 300000
    right_w = SLIDE_W - split_x - MARGIN - 300000
    contact_top = SLIDE_H // 2 - 600000

    add_textbox(slide, "GET IN TOUCH", right_left, contact_top - 500000,
                right_w, 350000,
                font_size=12, bold=True, color=t.accent)

    add_gold_accent_line(slide, right_left, contact_top - 200000,
                         1200000, thickness=2, color=t.accent)

    for i, (label, value) in enumerate(contacts[:3]):
        y = contact_top + i * 500000
        add_textbox(slide, label.upper(), right_left, y, right_w, 250000,
                    font_size=10, bold=True, color=tint(t.primary, 0.5))
        add_textbox(slide, value, right_left, y + 250000, right_w, 300000,
                    font_size=16, bold=True, color="#FFFFFF")


# -- Variant 4: ELEVATED -- light bg with large floating CTA card --

def _elevated_centered(slide, t, c):
    headline, subtitle, contacts = _get_cta(c)

    add_background(slide, t.light_bg)

    # Decorative background circles
    add_circle(slide, SLIDE_W - 900000, 700000, 1300000,
               fill_color=tint(t.accent, 0.88))
    add_circle(slide, 500000, SLIDE_H - 600000, 900000,
               fill_color=tint(t.primary, 0.92))

    # Large floating card
    card_w = int(SLIDE_W * 0.72)
    card_h = 4200000
    card_left = (SLIDE_W - card_w) // 2
    card_top = (SLIDE_H - card_h) // 2

    add_styled_card(slide, card_left, card_top, card_w, card_h,
                    theme=t, accent_color=t.accent)

    # CTA headline inside card
    inner_left = card_left + 400000
    inner_w = card_w - 800000
    text_color = "#FFFFFF" if t.ux_style.dark_mode else t.primary

    add_textbox(slide, headline, inner_left, card_top + 500000,
                inner_w, 1400000,
                font_size=34, bold=True, color=text_color,
                alignment=PP_ALIGN.CENTER)

    # Accent line
    line_y = card_top + 2000000
    add_gold_accent_line(slide, SLIDE_W // 2 - 600000, line_y, 1200000,
                         thickness=2.5, color=t.accent)

    # Subtitle
    sub_color = tint(t.primary, 0.55) if t.ux_style.dark_mode else t.secondary
    add_textbox(slide, subtitle, inner_left, line_y + 250000,
                inner_w, 500000,
                font_size=15, color=sub_color, alignment=PP_ALIGN.CENTER)

    # Contact row inside card
    contact_top = card_top + card_h - 900000
    n = min(len(contacts), 3)
    if n > 0:
        gap = 200000
        total_gap = gap * (n - 1)
        col_w = (inner_w - total_gap) // n
        for i, (label, value) in enumerate(contacts[:n]):
            x = inner_left + i * (col_w + gap)
            add_textbox(slide, label, x, contact_top, col_w, 280000,
                        font_size=10, bold=True, color=t.accent,
                        alignment=PP_ALIGN.CENTER)
            add_textbox(slide, value, x, contact_top + 300000, col_w, 300000,
                        font_size=13, color=text_color,
                        alignment=PP_ALIGN.CENTER)


# -- Variant 5: GEO -- dark bg with angular shapes, geometric CTA layout --

def _angular(slide, t, c):
    add_background(slide, t.primary)
    headline, subtitle, contacts = _get_cta(c)

    # Angular decorations
    add_triangle(slide, SLIDE_W - 3500000, 0, 3500000, SLIDE_H,
                 fill_color=shade(t.primary, 0.08))
    add_triangle(slide, 0, SLIDE_H - 2000000, 2500000, 2000000,
                 fill_color=shade(t.primary, 0.06))

    # Hexagonal decorations
    add_hexagon(slide, SLIDE_W - 1200000, 1200000, 350000,
                fill_color=tint(t.accent, 0.25))
    add_hexagon(slide, SLIDE_W - 1900000, 2000000, 200000,
                fill_color=tint(t.accent, 0.15))

    # Diamond accent before headline
    add_diamond(slide, MARGIN + 100000, CONTENT_TOP + 100000, 80000,
                fill_color=t.accent)

    # CTA headline -- left-aligned, bold
    head_left = MARGIN + 350000
    head_w = int(SLIDE_W * 0.6)
    add_textbox(slide, headline, head_left, CONTENT_TOP,
                head_w, 1400000,
                font_size=FONT_SECTION_TITLE, bold=True, color="#FFFFFF")

    # Sharp accent bar
    bar_y = CONTENT_TOP + 1600000
    add_rect(slide, head_left, bar_y, 2500000, 60000, fill_color=t.accent)

    # Subtitle
    add_textbox(slide, subtitle, head_left, bar_y + 200000,
                head_w, 500000,
                font_size=16, color=tint(t.primary, 0.55))

    # Contacts in bordered sharp cards
    card_top = bar_y + 900000
    for i, (label, value) in enumerate(contacts[:3]):
        left, width = col_span(3, i, gap=250000)
        # Sharp-cornered bordered card
        add_rect(slide, left, card_top, width, 800000,
                 fill_color=tint(t.primary, 0.08),
                 line_color=tint(t.primary, 0.2), line_width=1)
        # Bottom accent bar on each card
        add_rect(slide, left, card_top + 800000 - 50000,
                 width, 50000, fill_color=t.palette[i % len(t.palette)])
        add_textbox(slide, label.upper(), left + 150000, card_top + 150000,
                    width - 300000, 280000,
                    font_size=10, bold=True, color=t.accent)
        add_textbox(slide, value, left + 150000, card_top + 420000,
                    width - 300000, 300000,
                    font_size=14, color="#FFFFFF")


# -- Variant 6: EDITORIAL -- white bg, left-aligned CTA, elegant thin rules --

def _editorial_clean(slide, t, c):
    headline, subtitle, contacts = _get_cta(c)
    s = t.ux_style
    m = int(MARGIN * s.margin_factor)

    # Content area
    content_w = int(SLIDE_W * 0.55)
    content_left = m

    # Short accent line at top
    accent_y = SLIDE_H // 2 - 2000000
    add_line(slide, content_left, accent_y, content_left + 500000, accent_y,
             color=t.accent, width=1.5)

    # CTA headline -- left aligned, elegant
    add_textbox(slide, headline, content_left, accent_y + 200000,
                content_w, 1400000,
                font_size=32, bold=True, color=t.primary,
                alignment=PP_ALIGN.LEFT)

    # Full-width thin rule
    rule_y = accent_y + 1750000
    add_line(slide, content_left, rule_y,
             content_left + content_w, rule_y,
             color=tint(t.secondary, 0.7), width=0.5)

    # Subtitle
    add_textbox(slide, subtitle, content_left, rule_y + 200000,
                content_w, 500000,
                font_size=14, color=t.secondary, alignment=PP_ALIGN.LEFT)

    # Bottom thin rule
    rule_y2 = rule_y + 800000
    add_line(slide, content_left, rule_y2,
             content_left + content_w, rule_y2,
             color=tint(t.secondary, 0.7), width=0.5)

    # Contacts -- stacked, left-aligned below second rule
    contact_top = rule_y2 + 300000
    for i, (label, value) in enumerate(contacts[:3]):
        y = contact_top + i * 400000
        add_textbox(slide, f"{label}:", content_left, y,
                    1200000, 300000,
                    font_size=11, bold=True, color=t.primary)
        add_textbox(slide, value, content_left + 1300000, y,
                    content_w - 1300000, 300000,
                    font_size=11, color=t.secondary)

    # Right side decorative vertical rule
    vline_x = SLIDE_W - m - int(SLIDE_W * 0.25)
    add_line(slide, vline_x, m + 500000, vline_x, SLIDE_H - m - 500000,
             color=tint(t.secondary, 0.85), width=0.25)

    # Right accent mark
    add_line(slide, vline_x, SLIDE_H // 2 - 200000,
             vline_x, SLIDE_H // 2 + 200000,
             color=t.accent, width=1.5)


# -- Variant 7: GRADIENT -- gradient bg, centered CTA, elegant --

def _gradient_full(slide, t, c):
    headline, subtitle, contacts = _get_cta(c)

    # Simulated gradient bands
    band_count = 6
    band_h = SLIDE_H // band_count
    for i in range(band_count):
        color = tint(t.primary, i * 0.03)
        add_rect(slide, 0, i * band_h, SLIDE_W, band_h + 1, fill_color=color)

    # Large soft circle decoration
    add_circle(slide, SLIDE_W // 2, SLIDE_H // 2, 2600000,
               fill_color=tint(t.accent, 0.07))

    # CTA headline -- large, centered, white
    head_w = SLIDE_W - 2 * MARGIN - 1200000
    head_left = (SLIDE_W - head_w) // 2
    add_textbox(slide, headline, head_left, SLIDE_H // 2 - 1400000,
                head_w, 1400000,
                font_size=38, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)

    # Accent line
    line_w = 1600000
    line_y = SLIDE_H // 2 + 200000
    add_gold_accent_line(slide, SLIDE_W // 2 - line_w // 2, line_y, line_w,
                         thickness=1.5, color=t.accent)

    # Subtitle
    sub_w = SLIDE_W - 2 * MARGIN - 2000000
    add_textbox(slide, subtitle, (SLIDE_W - sub_w) // 2, line_y + 250000,
                sub_w, 500000,
                font_size=15, color=tint(t.primary, 0.55),
                alignment=PP_ALIGN.CENTER)

    # Contacts in a single centered row
    contact_top = line_y + 1000000
    n = min(len(contacts), 3)
    if n > 0:
        total_w = SLIDE_W - 2 * MARGIN - 1000000
        col_w = total_w // n
        start_left = (SLIDE_W - total_w) // 2
        for i, (label, value) in enumerate(contacts[:n]):
            x = start_left + i * col_w
            add_textbox(slide, label, x, contact_top, col_w, 280000,
                        font_size=10, bold=True, color=t.accent,
                        alignment=PP_ALIGN.CENTER)
            add_textbox(slide, value, x, contact_top + 300000, col_w, 350000,
                        font_size=13, color=tint(t.primary, 0.5),
                        alignment=PP_ALIGN.CENTER)


# -- Variant 8: RETRO -- warm bg, CTA in decorative bordered frame --

def _retro_centered(slide, t, c):
    add_background(slide, t.light_bg)
    headline, subtitle, contacts = _get_cta(c)

    # Decorative dot pattern in corner
    for row in range(4):
        for col in range(5):
            add_circle(slide, SLIDE_W - 1500000 + col * 180000,
                       400000 + row * 180000, 30000,
                       fill_color=tint(t.accent, 0.65))

    # Outer frame
    frame_w = int(SLIDE_W * 0.70)
    frame_h = 4000000
    frame_left = (SLIDE_W - frame_w) // 2
    frame_top = (SLIDE_H - frame_h) // 2

    add_rect(slide, frame_left, frame_top, frame_w, frame_h,
             fill_color="#FFFFFF", line_color=t.accent, line_width=2.5,
             corner_radius=100000)

    # Inner frame
    inset = 65000
    add_rect(slide, frame_left + inset, frame_top + inset,
             frame_w - 2 * inset, frame_h - 2 * inset,
             line_color=t.accent, line_width=0.75, corner_radius=80000)

    # CTA headline centered in frame
    inner_left = frame_left + 350000
    inner_w = frame_w - 700000

    add_textbox(slide, headline, inner_left, frame_top + 450000,
                inner_w, 1400000,
                font_size=30, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER)

    # Accent line
    line_y = frame_top + 1950000
    add_gold_accent_line(slide, SLIDE_W // 2 - 600000, line_y, 1200000,
                         thickness=2, color=t.accent)

    # Subtitle
    add_textbox(slide, subtitle, inner_left, line_y + 250000,
                inner_w, 500000,
                font_size=14, color=t.secondary, alignment=PP_ALIGN.CENTER)

    # Contacts inside frame, horizontal
    contact_top = frame_top + frame_h - 1000000
    n = min(len(contacts), 3)
    if n > 0:
        col_w = inner_w // n
        for i, (label, value) in enumerate(contacts[:n]):
            x = inner_left + i * col_w
            add_textbox(slide, label, x, contact_top, col_w, 280000,
                        font_size=10, bold=True, color=t.accent,
                        alignment=PP_ALIGN.CENTER)
            add_textbox(slide, value, x, contact_top + 300000, col_w, 300000,
                        font_size=12, color=t.primary,
                        alignment=PP_ALIGN.CENTER)

    # Decorative dots below frame
    dot_y = frame_top + frame_h + 250000
    for d in range(5):
        add_circle(slide, SLIDE_W // 2 - 200000 + d * 100000, dot_y, 22000,
                   fill_color=t.accent)


# -- Variant 9: MAGAZINE -- bold full-bleed style, oversized text --

def _creative_bold(slide, t, c):
    headline, subtitle, contacts = _get_cta(c)
    s = t.ux_style
    m = int(MARGIN * s.margin_factor)

    # Full-bleed image placeholder in background
    add_image_placeholder(slide, 0, 0, SLIDE_W, SLIDE_H,
                          label="Full-Bleed CTA Background", bg_color=t.light_bg)

    # Dark overlay covering bottom 65%
    overlay_top = int(SLIDE_H * 0.30)
    overlay_h = SLIDE_H - overlay_top
    add_rect(slide, 0, overlay_top, SLIDE_W, overlay_h, fill_color=t.primary)

    # Accent stripe at overlay top edge
    add_rect(slide, 0, overlay_top, SLIDE_W, 45000, fill_color=t.accent)

    # Oversized CTA headline
    add_textbox(slide, headline.upper(), m, overlay_top + 300000,
                SLIDE_W - 2 * m, 1800000,
                font_size=46, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.LEFT)

    # Subtitle
    add_textbox(slide, subtitle, m, overlay_top + 2200000,
                int(SLIDE_W * 0.6), 500000,
                font_size=15, color=tint(t.primary, 0.5))

    # Contacts along bottom edge
    contact_top = SLIDE_H - 900000
    contact_strs = [f"{label}: {value}" for label, value in contacts[:3]]
    for i, txt in enumerate(contact_strs):
        left, width = col_span(3, i, gap=200000)
        add_textbox(slide, txt, left, contact_top, width, 350000,
                    font_size=11, color=tint(t.primary, 0.45),
                    alignment=PP_ALIGN.LEFT)


# -- Variant 10: SCHOLARLY -- white bg, centered CTA, thin accent rule, minimal --

def _scholarly_clean(slide, t, c):
    headline, subtitle, contacts = _get_cta(c)
    add_background(slide, "#FAFAF7")

    cy = SLIDE_H // 2

    # Thin rule above CTA
    rule_w = int(SLIDE_W * 0.45)
    rule_left = (SLIDE_W - rule_w) // 2
    rule_y1 = cy - 1500000
    add_line(slide, rule_left, rule_y1, rule_left + rule_w, rule_y1,
             color=tint(t.secondary, 0.6), width=0.5)

    # CTA headline — centered, elegant, dark text on white
    head_w = SLIDE_W - 2 * MARGIN - 1500000
    add_textbox(slide, headline, (SLIDE_W - head_w) // 2, rule_y1 + 300000,
                head_w, 1200000,
                font_size=32, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER)

    # Short centered accent rule
    add_line(slide, SLIDE_W // 2 - 300000, cy + 100000,
             SLIDE_W // 2 + 300000, cy + 100000,
             color=t.accent, width=1.5)

    # Subtitle
    sub_w = SLIDE_W - 2 * MARGIN - 2000000
    add_textbox(slide, subtitle, (SLIDE_W - sub_w) // 2, cy + 350000,
                sub_w, 400000,
                font_size=14, color=t.secondary, alignment=PP_ALIGN.CENTER)

    # Thin rule below content
    rule_y2 = cy + 1000000
    add_line(slide, rule_left, rule_y2, rule_left + rule_w, rule_y2,
             color=tint(t.secondary, 0.6), width=0.5)

    # Contacts — simple centered line below lower rule
    contact_strs = [f"{label}: {value}" for label, value in contacts[:3]]
    contact_text = "    |    ".join(contact_strs)
    add_textbox(slide, contact_text, MARGIN, rule_y2 + 300000,
                SLIDE_W - 2 * MARGIN, 400000,
                font_size=11, color=t.secondary, alignment=PP_ALIGN.CENTER)


# -- Variant 11: LABORATORY -- dark bg, accent-bordered CTA card, centered --

def _laboratory_clean(slide, t, c):
    headline, subtitle, contacts = _get_cta(c)
    add_background(slide, t.primary)

    # Top and bottom accent bars
    add_rect(slide, 0, 0, SLIDE_W, 50000, fill_color=t.accent)
    add_rect(slide, 0, SLIDE_H - 50000, SLIDE_W, 50000, fill_color=t.accent)

    # Central card with accent left border
    card_w = int(SLIDE_W * 0.65)
    card_h = 3200000
    card_left = (SLIDE_W - card_w) // 2
    card_top = (SLIDE_H - card_h) // 2

    # Card background
    add_rect(slide, card_left, card_top, card_w, card_h,
             fill_color=tint(t.primary, 0.06),
             line_color=tint(t.primary, 0.2), line_width=0.75)

    # Accent left border on card
    add_rect(slide, card_left, card_top, 45000, card_h, fill_color=t.accent)

    # CTA headline inside card
    inner_left = card_left + 300000
    inner_w = card_w - 600000
    add_textbox(slide, headline, inner_left, card_top + 400000,
                inner_w, 1200000,
                font_size=FONT_SECTION_TITLE - 4, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)

    # Accent line inside card
    add_gold_accent_line(slide, SLIDE_W // 2 - 500000, card_top + 1700000,
                         1000000, thickness=2, color=t.accent)

    # Subtitle
    add_textbox(slide, subtitle, inner_left, card_top + 1950000,
                inner_w, 400000,
                font_size=14, color=tint(t.primary, 0.5),
                alignment=PP_ALIGN.CENTER)

    # Contact row inside card bottom
    contact_top = card_top + card_h - 700000
    for i, (label, value) in enumerate(contacts[:3]):
        col_w = inner_w // 3
        x = inner_left + i * col_w
        add_textbox(slide, label, x, contact_top, col_w, 250000,
                    font_size=10, bold=True, color=t.accent,
                    alignment=PP_ALIGN.CENTER)
        add_textbox(slide, value, x, contact_top + 280000, col_w, 300000,
                    font_size=12, color=tint(t.primary, 0.5),
                    alignment=PP_ALIGN.CENTER)


# -- Variant 12: DASHBOARD -- gradient header + centered CTA card with action items --

def _dashboard_clean(slide, t, c):
    headline, subtitle, contacts = _get_cta(c)
    add_background(slide, "#FFFFFF")
    m = int(MARGIN * 0.85)

    # Accent gradient header band
    band_h = 800000
    band_steps = 4
    step_h = band_h // band_steps
    for i in range(band_steps):
        color = shade(t.accent, i * 0.06) if i > 0 else t.accent
        add_rect(slide, 0, i * step_h, SLIDE_W, step_h + 1, fill_color=color)

    # "Call to Action" label in header
    add_textbox(slide, "CALL TO ACTION", m, 200000, 4000000, 350000,
                font_size=14, bold=True, color="#FFFFFF")

    # Main CTA card with shadow
    card_w = int(SLIDE_W * 0.70)
    card_h = 3000000
    card_left = (SLIDE_W - card_w) // 2
    card_top = band_h + 400000

    add_rect(slide, card_left + 15000, card_top + 15000, card_w, card_h,
             fill_color=tint(t.secondary, 0.85), corner_radius=80000)
    add_rect(slide, card_left, card_top, card_w, card_h,
             fill_color="#FFFFFF", corner_radius=80000,
             line_color=tint(t.secondary, 0.7), line_width=0.5)

    # Accent bar at top of card
    add_rect(slide, card_left, card_top, card_w, 50000, fill_color=t.accent)

    # Headline inside card
    inner_left = card_left + 400000
    inner_w = card_w - 800000
    add_textbox(slide, headline, inner_left, card_top + 300000,
                inner_w, 1200000,
                font_size=30, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER)

    # Accent underline
    add_rect(slide, SLIDE_W // 2 - 400000, card_top + 1550000,
             800000, 35000, fill_color=t.accent)

    # Subtitle
    add_textbox(slide, subtitle, inner_left, card_top + 1750000,
                inner_w, 400000,
                font_size=14, color=t.secondary, alignment=PP_ALIGN.CENTER)

    # Contact tiles below card
    tile_top = card_top + card_h + 300000
    tile_h = 600000
    for i, (label, value) in enumerate(contacts[:3]):
        left, width = col_span(3, i, gap=200000)
        add_rect(slide, left + 10000, tile_top + 10000, width, tile_h,
                 fill_color=tint(t.secondary, 0.85), corner_radius=40000)
        add_rect(slide, left, tile_top, width, tile_h,
                 fill_color="#FFFFFF", corner_radius=40000,
                 line_color=tint(t.secondary, 0.7), line_width=0.5)
        add_textbox(slide, label, left, tile_top + 100000, width, 250000,
                    font_size=10, bold=True, color=t.accent,
                    alignment=PP_ALIGN.CENTER)
        add_textbox(slide, value, left, tile_top + 350000, width, 250000,
                    font_size=13, color=t.primary,
                    alignment=PP_ALIGN.CENTER)
