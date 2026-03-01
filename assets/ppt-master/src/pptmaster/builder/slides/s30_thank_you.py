"""Slide 30 -- Thank You: 10 unique visual variants dispatched by UX style."""

from __future__ import annotations

from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

from pptmaster.builder.design_system import (
    SLIDE_W, SLIDE_H, MARGIN, FONT_SECTION_TITLE, FONT_CARD_HEADING,
    FONT_CAPTION, card_positions, col_span,
)
from pptmaster.builder.helpers import (
    add_textbox, add_rect, add_circle, add_line, add_card,
    add_gold_accent_line, add_background, add_dark_bg,
    add_styled_card, add_diamond, add_hexagon, add_triangle,
    add_image_placeholder,
)
from pptmaster.assets.color_utils import tint, shade


def build(slide, *, theme=None, company_name: str = "") -> None:
    from pptmaster.builder.themes import DEFAULT_THEME
    t = theme or DEFAULT_THEME
    s = t.ux_style
    name = company_name or t.company_name
    c = t.content

    dispatch = {
        "card-grid": _card_grid,
        "minimal-list": _minimal_list,
        "bold-centered": _bold_centered,
        "dark-grid": _dark_grid,
        "split-contact": _split_contact,
        "geo-grid": _geo_grid,
        "editorial-clean": _editorial_clean,
        "gradient-elegant": _gradient_elegant,
        "retro-badge": _retro_badge,
        "creative-bold": _creative_bold,
        "scholarly-formal": _scholarly_formal,
        "laboratory-grid": _laboratory_grid,
        "dashboard-summary": _dashboard_summary,
    }
    builder = dispatch.get(s.thankyou, _card_grid)
    builder(slide, t, name, c)


def _get_contacts(c):
    """Extract contact data from content dict."""
    return c.get("thankyou_contacts", [
        ("Email", "contact@company.com", "\u2709"),
        ("Phone", "+1 555-123-4567", "\u260E"),
        ("Website", "www.company.com", "\u2302"),
        ("Location", "New York, NY", "\u2691"),
    ])


# -- Variant 1: CLASSIC / ELEVATED -- contact cards (2x2) + decorative shapes --

def _card_grid(slide, t, name, c):
    contacts = _get_contacts(c)

    # Decorative circles
    add_circle(slide, SLIDE_W - 800000, 600000, 1200000,
               fill_color=tint(t.accent, 0.9))
    add_circle(slide, 400000, SLIDE_H - 800000, 800000,
               fill_color=tint(t.primary, 0.9))

    # "Thank You" heading
    add_textbox(slide, "Thank You", MARGIN, 600000,
                SLIDE_W - 2 * MARGIN, 900000,
                font_size=FONT_SECTION_TITLE, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER)

    add_gold_accent_line(slide, SLIDE_W // 2 - 1000000, 1500000, 2000000,
                         thickness=3, color=t.accent)

    add_textbox(slide, "We appreciate your time and look forward to the next conversation.",
                MARGIN + 1000000, 1650000,
                SLIDE_W - 2 * MARGIN - 2000000, 400000,
                font_size=16, color=t.secondary, alignment=PP_ALIGN.CENTER)

    # 2x2 contact card grid
    positions = card_positions(2, 2, top=2300000, gap=250000, card_height=1400000)

    for i, (label, value, icon) in enumerate(contacts[:4]):
        left, top, width, height = positions[i]
        add_styled_card(slide, left, top, width, height,
                        theme=t, accent_color=t.accent)
        text_color = "#FFFFFF" if t.ux_style.dark_mode else t.primary
        sub_color = tint(t.primary, 0.55) if t.ux_style.dark_mode else t.secondary

        add_circle(slide, left + 400000, top + height // 2, 200000,
                   fill_color=t.accent)
        add_textbox(slide, icon, left + 200000, top + height // 2 - 200000,
                    400000, 400000,
                    font_size=18, color="#FFFFFF",
                    alignment=PP_ALIGN.CENTER, vertical_anchor=MSO_ANCHOR.MIDDLE)
        add_textbox(slide, label, left + 700000, top + 300000,
                    width - 900000, 350000,
                    font_size=12, bold=True, color=t.accent)
        add_textbox(slide, value, left + 700000, top + 650000,
                    width - 900000, 400000,
                    font_size=FONT_CARD_HEADING, color=text_color)

    add_textbox(slide, name, MARGIN, SLIDE_H - 800000,
                SLIDE_W - 2 * MARGIN, 400000,
                font_size=FONT_CAPTION, color=t.secondary,
                alignment=PP_ALIGN.CENTER)


# -- Variant 2: MINIMAL -- clean centered "Thank You", simple contact list, thin rules --

def _minimal_list(slide, t, name, c):
    contacts = _get_contacts(c)
    s = t.ux_style
    m = int(MARGIN * s.margin_factor)

    center_y = SLIDE_H // 2
    content_w = int(SLIDE_W * 0.50)
    content_left = (SLIDE_W - content_w) // 2

    # Top thin rule
    rule_top = center_y - 2000000
    add_line(slide, content_left, rule_top, content_left + content_w, rule_top,
             color=tint(t.secondary, 0.7), width=0.5)

    # Short accent at start of rule
    add_line(slide, content_left, rule_top, content_left + 300000, rule_top,
             color=t.accent, width=1.5)

    # "Thank You" -- clean, centered
    add_textbox(slide, "Thank You", content_left, rule_top + 300000,
                content_w, 900000,
                font_size=36, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER)

    # Subtle centered accent
    add_gold_accent_line(slide, SLIDE_W // 2 - 200000, rule_top + 1300000,
                         400000, thickness=1.5, color=t.accent)

    # Simple contact list -- stacked, centered
    list_top = rule_top + 1600000
    for i, (label, value, icon) in enumerate(contacts[:4]):
        y = list_top + i * 380000
        contact_str = f"{icon}  {label}: {value}"
        add_textbox(slide, contact_str, content_left, y,
                    content_w, 320000,
                    font_size=12, color=t.secondary,
                    alignment=PP_ALIGN.CENTER)

    # Bottom thin rule
    rule_bottom = list_top + len(contacts[:4]) * 380000 + 200000
    add_line(slide, content_left, rule_bottom,
             content_left + content_w, rule_bottom,
             color=tint(t.secondary, 0.7), width=0.5)

    # Short accent at end of bottom rule
    add_line(slide, content_left + content_w - 300000, rule_bottom,
             content_left + content_w, rule_bottom,
             color=t.accent, width=1.5)

    # Company name
    add_textbox(slide, name, m, SLIDE_H - 900000,
                SLIDE_W - 2 * m, 350000,
                font_size=10, color=tint(t.secondary, 0.5),
                alignment=PP_ALIGN.CENTER)


# -- Variant 3: BOLD -- large centered text, accent block, contact row --

def _bold_centered(slide, t, name, c):
    contacts = _get_contacts(c)

    # Full primary bg
    add_background(slide, t.primary)

    # Large bold "THANK YOU" -- oversized centered
    add_textbox(slide, "THANK YOU", MARGIN, SLIDE_H // 2 - 1500000,
                SLIDE_W - 2 * MARGIN, 1600000,
                font_size=60, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)

    # Wide accent block
    block_w = 3000000
    block_h = 80000
    add_rect(slide, SLIDE_W // 2 - block_w // 2, SLIDE_H // 2 + 300000,
             block_w, block_h, fill_color=t.accent)

    # Tagline below block
    add_textbox(slide, "We appreciate your partnership.",
                MARGIN + 1000000, SLIDE_H // 2 + 600000,
                SLIDE_W - 2 * MARGIN - 2000000, 500000,
                font_size=16, color=tint(t.primary, 0.55),
                alignment=PP_ALIGN.CENTER)

    # Contact row at bottom
    contact_top = SLIDE_H - 1400000
    for i, (label, value, icon) in enumerate(contacts[:4]):
        left, width = col_span(4, i, gap=200000)
        add_textbox(slide, f"{icon} {label}", left, contact_top, width, 280000,
                    font_size=10, bold=True, color=t.accent,
                    alignment=PP_ALIGN.CENTER)
        add_textbox(slide, value, left, contact_top + 320000, width, 350000,
                    font_size=13, color=tint(t.primary, 0.5),
                    alignment=PP_ALIGN.CENTER)

    # Company name at very bottom
    add_textbox(slide, name.upper(), MARGIN, SLIDE_H - 500000,
                SLIDE_W - 2 * MARGIN, 300000,
                font_size=10, bold=True, color=tint(t.primary, 0.35),
                alignment=PP_ALIGN.CENTER)


# -- Variant 4: DARK -- dark bg, grid texture, contact cards with borders --

def _dark_grid(slide, t, name, c):
    add_background(slide, t.primary)
    contacts = _get_contacts(c)

    # Grid texture
    grid_spacing = 700000
    grid_color = tint(t.primary, 0.08)
    for x in range(0, SLIDE_W, grid_spacing):
        add_line(slide, x, 0, x, SLIDE_H, color=grid_color, width=0.25)
    for y in range(0, SLIDE_H, grid_spacing):
        add_line(slide, 0, y, SLIDE_W, y, color=grid_color, width=0.25)

    # "Thank You" -- centered, neon accent
    add_textbox(slide, "THANK YOU", MARGIN, 800000,
                SLIDE_W - 2 * MARGIN, 1000000,
                font_size=FONT_SECTION_TITLE, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)

    add_gold_accent_line(slide, SLIDE_W // 2 - 1500000, 1900000, 3000000,
                         thickness=2, color=t.accent)

    add_textbox(slide, "We look forward to working with you.",
                MARGIN + 1500000, 2050000,
                SLIDE_W - 2 * MARGIN - 3000000, 400000,
                font_size=14, color=tint(t.primary, 0.45),
                alignment=PP_ALIGN.CENTER)

    # Contact cards with thin borders
    card_top = 2800000
    card_h = 1100000
    for i, (label, value, icon) in enumerate(contacts[:4]):
        left, width = col_span(4, i, gap=200000)

        # Card with border
        add_rect(slide, left, card_top, width, card_h,
                 fill_color=tint(t.primary, 0.08),
                 line_color=tint(t.primary, 0.22), line_width=0.75,
                 corner_radius=60000)
        # Top accent bar
        add_rect(slide, left, card_top, width, 40000,
                 fill_color=t.palette[i % len(t.palette)])

        add_textbox(slide, icon, left, card_top + 200000,
                    width, 350000,
                    font_size=22, color=t.accent,
                    alignment=PP_ALIGN.CENTER)
        add_textbox(slide, label, left, card_top + 520000,
                    width, 280000,
                    font_size=10, bold=True, color=tint(t.primary, 0.4),
                    alignment=PP_ALIGN.CENTER)
        add_textbox(slide, value, left, card_top + 780000,
                    width, 300000,
                    font_size=12, color="#FFFFFF",
                    alignment=PP_ALIGN.CENTER)

    # Corner brackets
    sz = 180000
    add_rect(slide, MARGIN, MARGIN, sz, 4, fill_color=t.accent)
    add_rect(slide, MARGIN, MARGIN, 4, sz, fill_color=t.accent)
    add_rect(slide, SLIDE_W - MARGIN - sz, SLIDE_H - MARGIN - 4, sz, 4,
             fill_color=t.accent)
    add_rect(slide, SLIDE_W - MARGIN - 4, SLIDE_H - MARGIN - sz, 4, sz,
             fill_color=t.accent)

    # Company name
    add_textbox(slide, name, MARGIN, SLIDE_H - 700000,
                SLIDE_W - 2 * MARGIN, 300000,
                font_size=FONT_CAPTION, color=tint(t.primary, 0.35),
                alignment=PP_ALIGN.CENTER)


# -- Variant 5: SPLIT -- left "Thank You", right contact info panel --

def _split_contact(slide, t, name, c):
    contacts = _get_contacts(c)

    split_x = int(SLIDE_W * 0.50)

    # Left panel: primary color
    add_rect(slide, 0, 0, split_x, SLIDE_H, fill_color=t.primary)

    # Right panel: light bg
    add_rect(slide, split_x, 0, SLIDE_W - split_x, SLIDE_H, fill_color=t.light_bg)

    # Accent stripe
    add_rect(slide, split_x - 25000, 0, 50000, SLIDE_H, fill_color=t.accent)

    # Left: "Thank You" -- large and centered in the panel
    left_w = split_x - 2 * MARGIN
    add_textbox(slide, "Thank\nYou", MARGIN, SLIDE_H // 2 - 1200000,
                left_w, 2200000,
                font_size=52, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)

    # Left: accent bar below
    bar_w = 1500000
    add_rect(slide, (split_x - bar_w) // 2, SLIDE_H // 2 + 1200000,
             bar_w, 60000, fill_color=t.accent)

    # Left: company name below bar
    add_textbox(slide, name, MARGIN, SLIDE_H // 2 + 1400000,
                left_w, 350000,
                font_size=FONT_CAPTION, color=tint(t.primary, 0.5),
                alignment=PP_ALIGN.CENTER)

    # Right: "Contact Us" header
    right_left = split_x + 350000
    right_w = SLIDE_W - split_x - MARGIN - 350000

    add_textbox(slide, "Contact Us", right_left, SLIDE_H // 2 - 1400000,
                right_w, 500000,
                font_size=22, bold=True, color=t.primary)

    add_gold_accent_line(slide, right_left, SLIDE_H // 2 - 900000,
                         1200000, thickness=2, color=t.accent)

    # Right: contact items stacked
    item_top = SLIDE_H // 2 - 600000
    for i, (label, value, icon) in enumerate(contacts[:4]):
        y = item_top + i * 550000
        # Icon circle
        add_circle(slide, right_left + 180000, y + 180000, 150000,
                   fill_color=t.accent)
        add_textbox(slide, icon, right_left + 30000, y + 30000,
                    300000, 300000,
                    font_size=14, color="#FFFFFF",
                    alignment=PP_ALIGN.CENTER,
                    vertical_anchor=MSO_ANCHOR.MIDDLE)
        # Label + value
        add_textbox(slide, label, right_left + 450000, y + 20000,
                    right_w - 450000, 250000,
                    font_size=11, bold=True, color=t.accent)
        add_textbox(slide, value, right_left + 450000, y + 260000,
                    right_w - 450000, 280000,
                    font_size=14, color=t.primary)


# -- Variant 6: GEO -- geometric decorations, sharp contact cards with bottom accents --

def _geo_grid(slide, t, name, c):
    add_dark_bg(slide, t)
    contacts = _get_contacts(c)

    text_color = "#FFFFFF" if t.ux_style.dark_mode else t.primary
    sub_color = tint(t.primary, 0.5) if t.ux_style.dark_mode else t.secondary

    # Geometric decorations
    add_triangle(slide, SLIDE_W - 3000000, 0, 3000000, SLIDE_H,
                 fill_color=tint(t.primary, 0.06) if t.ux_style.dark_mode
                 else tint(t.accent, 0.08))
    add_hexagon(slide, MARGIN + 300000, MARGIN + 600000, 200000,
                fill_color=tint(t.accent, 0.2 if t.ux_style.dark_mode else 0.85))
    add_hexagon(slide, SLIDE_W - MARGIN - 400000, SLIDE_H - MARGIN - 700000, 250000,
                fill_color=tint(t.accent, 0.15 if t.ux_style.dark_mode else 0.88))

    # Diamond before heading
    add_diamond(slide, MARGIN + 100000, 900000, 80000, fill_color=t.accent)

    # "Thank You" heading
    add_textbox(slide, "Thank You", MARGIN + 350000, 700000,
                SLIDE_W - 2 * MARGIN, 900000,
                font_size=FONT_SECTION_TITLE, bold=True, color=text_color)

    # Sharp accent bar
    add_rect(slide, MARGIN + 350000, 1600000, 2000000, 50000,
             fill_color=t.accent)

    add_textbox(slide, "We look forward to our continued collaboration.",
                MARGIN + 350000, 1800000,
                SLIDE_W - 2 * MARGIN - 700000, 400000,
                font_size=14, color=sub_color)

    # Contact cards -- sharp, bordered, bottom accent
    card_top = 2500000
    card_h = 1200000
    for i, (label, value, icon) in enumerate(contacts[:4]):
        left, width = col_span(4, i, gap=200000)

        # Sharp card with thick border
        add_rect(slide, left, card_top, width, card_h,
                 fill_color=tint(t.primary, 0.06) if t.ux_style.dark_mode
                 else "#FFFFFF",
                 line_color=tint(t.primary, 0.25) if t.ux_style.dark_mode
                 else tint(t.secondary, 0.6),
                 line_width=1.5)

        # Bottom accent bar
        accent_h = 55000
        add_rect(slide, left, card_top + card_h - accent_h, width, accent_h,
                 fill_color=t.palette[i % len(t.palette)])

        # Icon
        add_textbox(slide, icon, left, card_top + 180000, width, 350000,
                    font_size=24, color=t.accent,
                    alignment=PP_ALIGN.CENTER)
        # Label
        add_textbox(slide, label.upper(), left, card_top + 520000,
                    width, 260000,
                    font_size=10, bold=True, color=sub_color,
                    alignment=PP_ALIGN.CENTER)
        # Value
        add_textbox(slide, value, left, card_top + 770000,
                    width, 300000,
                    font_size=13, color=text_color,
                    alignment=PP_ALIGN.CENTER)

    # Company name
    add_textbox(slide, name, MARGIN, SLIDE_H - 700000,
                SLIDE_W - 2 * MARGIN, 300000,
                font_size=FONT_CAPTION, color=sub_color,
                alignment=PP_ALIGN.CENTER)


# -- Variant 7: EDITORIAL -- elegant left-aligned, thin rules, clean contacts --

def _editorial_clean(slide, t, name, c):
    contacts = _get_contacts(c)
    s = t.ux_style
    m = int(MARGIN * s.margin_factor)

    content_w = int(SLIDE_W * 0.55)
    content_left = m

    # Top accent line
    accent_y = SLIDE_H // 2 - 2200000
    add_line(slide, content_left, accent_y, content_left + 500000, accent_y,
             color=t.accent, width=1.5)

    # "Thank You" -- left aligned, elegant
    add_textbox(slide, "Thank You", content_left, accent_y + 200000,
                content_w, 900000,
                font_size=36, bold=True, color=t.primary)

    # Thin rule
    rule_y = accent_y + 1200000
    add_line(slide, content_left, rule_y, content_left + content_w, rule_y,
             color=tint(t.secondary, 0.7), width=0.5)

    # Subtitle
    add_textbox(slide, "It has been a pleasure presenting to you.",
                content_left, rule_y + 200000,
                content_w, 400000,
                font_size=14, color=t.secondary)

    # Second thin rule
    rule_y2 = rule_y + 700000
    add_line(slide, content_left, rule_y2, content_left + content_w, rule_y2,
             color=tint(t.secondary, 0.7), width=0.5)

    # Contact items -- clean, stacked
    contact_top = rule_y2 + 300000
    for i, (label, value, icon) in enumerate(contacts[:4]):
        y = contact_top + i * 400000
        add_textbox(slide, f"{icon}  {label}:", content_left, y,
                    1400000, 300000,
                    font_size=11, bold=True, color=t.primary)
        add_textbox(slide, value, content_left + 1500000, y,
                    content_w - 1500000, 300000,
                    font_size=11, color=t.secondary)

    # Right side: decorative vertical rule
    vline_x = SLIDE_W - m - int(SLIDE_W * 0.25)
    add_line(slide, vline_x, m + 500000, vline_x, SLIDE_H - m - 500000,
             color=tint(t.secondary, 0.85), width=0.25)
    # Accent mark on vertical rule
    add_line(slide, vline_x, SLIDE_H // 2 - 200000,
             vline_x, SLIDE_H // 2 + 200000,
             color=t.accent, width=1.5)

    # Company name
    add_textbox(slide, name, content_left, SLIDE_H - 800000,
                content_w, 300000,
                font_size=10, color=tint(t.secondary, 0.5))


# -- Variant 8: GRADIENT -- gradient bg, centered elegant, rounded cards --

def _gradient_elegant(slide, t, name, c):
    contacts = _get_contacts(c)

    # Simulated gradient bands
    band_count = 6
    band_h = SLIDE_H // band_count
    for i in range(band_count):
        color = tint(t.primary, i * 0.03)
        add_rect(slide, 0, i * band_h, SLIDE_W, band_h + 1, fill_color=color)

    # Large soft circle decoration
    add_circle(slide, SLIDE_W // 2, SLIDE_H // 2, 2500000,
               fill_color=tint(t.accent, 0.07))

    # "Thank You" -- elegant, centered
    add_textbox(slide, "Thank You", MARGIN, 900000,
                SLIDE_W - 2 * MARGIN, 1000000,
                font_size=44, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)

    # Accent line
    line_w = 1400000
    add_gold_accent_line(slide, SLIDE_W // 2 - line_w // 2, 2000000,
                         line_w, thickness=1.5, color=t.accent)

    add_textbox(slide, "We value your time and partnership.",
                MARGIN + 1500000, 2200000,
                SLIDE_W - 2 * MARGIN - 3000000, 400000,
                font_size=14, color=tint(t.primary, 0.5),
                alignment=PP_ALIGN.CENTER)

    # Rounded contact cards in a row
    card_top = 3000000
    card_h = 1500000
    n = min(len(contacts), 4)
    for i, (label, value, icon) in enumerate(contacts[:n]):
        left, width = col_span(n, i, gap=200000)

        add_styled_card(slide, left, card_top, width, card_h,
                        theme=t, accent_color=t.accent)

        card_text_color = "#FFFFFF" if t.ux_style.dark_mode else t.primary

        # Icon
        add_textbox(slide, icon, left, card_top + 250000, width, 350000,
                    font_size=22, color=t.accent,
                    alignment=PP_ALIGN.CENTER)
        # Label
        add_textbox(slide, label, left, card_top + 600000, width, 300000,
                    font_size=10, bold=True, color=t.accent,
                    alignment=PP_ALIGN.CENTER)
        # Value
        add_textbox(slide, value, left + 80000, card_top + 900000,
                    width - 160000, 400000,
                    font_size=13, color=card_text_color,
                    alignment=PP_ALIGN.CENTER)

    # Company name
    add_textbox(slide, name, MARGIN, SLIDE_H - 700000,
                SLIDE_W - 2 * MARGIN, 300000,
                font_size=FONT_CAPTION, color=tint(t.primary, 0.4),
                alignment=PP_ALIGN.CENTER)


# -- Variant 9: RETRO -- warm bg, thank-you in decorated badge, bordered contacts --

def _retro_badge(slide, t, name, c):
    add_background(slide, t.light_bg)
    contacts = _get_contacts(c)

    # Decorative dot pattern in corner
    for row in range(4):
        for col in range(5):
            add_circle(slide, SLIDE_W - 1400000 + col * 180000,
                       400000 + row * 180000, 28000,
                       fill_color=tint(t.accent, 0.65))

    # Central badge: double-bordered circle
    cx, cy = SLIDE_W // 2, SLIDE_H // 2 - 500000
    add_circle(slide, cx, cy, 1800000, fill_color="#FFFFFF",
               line_color=t.accent, line_width=3)
    add_circle(slide, cx, cy, 1550000, fill_color="#FFFFFF",
               line_color=t.accent, line_width=1)

    # "Thank You" inside badge
    add_textbox(slide, "Thank\nYou", cx - 1200000, cy - 700000,
                2400000, 1200000,
                font_size=34, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER,
                vertical_anchor=MSO_ANCHOR.MIDDLE)

    # Accent line inside badge
    add_gold_accent_line(slide, cx - 500000, cy + 550000, 1000000,
                         thickness=2, color=t.accent)

    # Company name under badge
    add_textbox(slide, name, cx - 1000000, cy + 700000, 2000000, 350000,
                font_size=11, color=t.secondary,
                alignment=PP_ALIGN.CENTER)

    # Contact items below badge -- bordered cards in a row
    contact_top = cy + 1800000 + 400000
    contact_h = 700000
    n = min(len(contacts), 4)
    for i, (label, value, icon) in enumerate(contacts[:n]):
        left, width = col_span(n, i, gap=180000)

        add_rect(slide, left, contact_top, width, contact_h,
                 fill_color="#FFFFFF", line_color=t.accent, line_width=1.5,
                 corner_radius=80000)

        add_textbox(slide, f"{icon} {label}", left, contact_top + 100000,
                    width, 280000,
                    font_size=10, bold=True, color=t.accent,
                    alignment=PP_ALIGN.CENTER)
        add_textbox(slide, value, left + 60000, contact_top + 370000,
                    width - 120000, 280000,
                    font_size=12, color=t.primary,
                    alignment=PP_ALIGN.CENTER)

    # Decorative dots below contacts
    dot_y = contact_top + contact_h + 250000
    for d in range(5):
        add_circle(slide, SLIDE_W // 2 - 200000 + d * 100000, dot_y, 22000,
                   fill_color=t.accent)


# -- Variant 10: MAGAZINE -- bold oversized "Thank You", minimal contacts --

def _creative_bold(slide, t, name, c):
    contacts = _get_contacts(c)
    s = t.ux_style
    m = int(MARGIN * s.margin_factor)

    # Full-bleed image placeholder
    add_image_placeholder(slide, 0, 0, SLIDE_W, SLIDE_H,
                          label="Full-Bleed Thank You Background",
                          bg_color=t.light_bg)

    # Dark overlay covering bottom 65%
    overlay_top = int(SLIDE_H * 0.28)
    overlay_h = SLIDE_H - overlay_top
    add_rect(slide, 0, overlay_top, SLIDE_W, overlay_h, fill_color=t.primary)

    # Accent stripe at overlay top
    add_rect(slide, 0, overlay_top, SLIDE_W, 45000, fill_color=t.accent)

    # Oversized "THANK YOU" -- bold, left-aligned
    add_textbox(slide, "THANK\nYOU.", m, overlay_top + 300000,
                SLIDE_W - 2 * m, 2400000,
                font_size=64, bold=True, color="#FFFFFF")

    # Subtitle under heading
    add_textbox(slide, "Until next time.", m, overlay_top + 2800000,
                int(SLIDE_W * 0.5), 400000,
                font_size=16, color=tint(t.primary, 0.5))

    # Minimal contacts along bottom edge
    contact_top = SLIDE_H - 900000
    contact_strs = [f"{icon} {label}: {value}"
                    for label, value, icon in contacts[:3]]
    for i, txt in enumerate(contact_strs):
        left, width = col_span(3, i, gap=200000)
        add_textbox(slide, txt, left, contact_top, width, 350000,
                    font_size=11, color=tint(t.primary, 0.42))

    # Company name
    add_textbox(slide, name, m, SLIDE_H - 500000,
                SLIDE_W - 2 * m, 250000,
                font_size=10, color=tint(t.primary, 0.3))


# -- Variant 11: SCHOLARLY -- formal centered, thin rules, institution name --

def _scholarly_formal(slide, t, name, c):
    contacts = _get_contacts(c)
    add_background(slide, "#FAFAF7")

    cy = SLIDE_H // 2

    # Top thin rule
    rule_w = int(SLIDE_W * 0.45)
    rule_left = (SLIDE_W - rule_w) // 2
    rule_y1 = cy - 1600000
    add_line(slide, rule_left, rule_y1, rule_left + rule_w, rule_y1,
             color=tint(t.secondary, 0.6), width=0.5)

    # "Thank You" — formal, centered
    add_textbox(slide, "Thank You", MARGIN, rule_y1 + 300000,
                SLIDE_W - 2 * MARGIN, 900000,
                font_size=38, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER)

    # Short centered accent rule
    add_line(slide, SLIDE_W // 2 - 300000, cy - 200000,
             SLIDE_W // 2 + 300000, cy - 200000,
             color=t.accent, width=1.5)

    # Gracious note
    add_textbox(slide, "We appreciate your time and attention.",
                MARGIN + 1000000, cy, SLIDE_W - 2 * MARGIN - 2000000, 400000,
                font_size=14, color=t.secondary, alignment=PP_ALIGN.CENTER)

    # Bottom thin rule
    rule_y2 = cy + 700000
    add_line(slide, rule_left, rule_y2, rule_left + rule_w, rule_y2,
             color=tint(t.secondary, 0.6), width=0.5)

    # Contact info — simple stacked list, centered
    contact_top = rule_y2 + 300000
    for i, (label, value, icon) in enumerate(contacts[:4]):
        y = contact_top + i * 350000
        contact_str = f"{icon}  {label}: {value}"
        add_textbox(slide, contact_str, MARGIN, y,
                    SLIDE_W - 2 * MARGIN, 300000,
                    font_size=11, color=t.secondary,
                    alignment=PP_ALIGN.CENTER)

    # Institution / company name at bottom
    add_textbox(slide, name, MARGIN, SLIDE_H - 900000,
                SLIDE_W - 2 * MARGIN, 350000,
                font_size=11, color=tint(t.secondary, 0.5),
                alignment=PP_ALIGN.CENTER)


# -- Variant 12: LABORATORY -- dark bg, colored-border contact cards in grid --

def _laboratory_grid(slide, t, name, c):
    contacts = _get_contacts(c)
    add_background(slide, t.primary)

    # Top and bottom accent bars
    add_rect(slide, 0, 0, SLIDE_W, 50000, fill_color=t.accent)
    add_rect(slide, 0, SLIDE_H - 50000, SLIDE_W, 50000, fill_color=t.accent)

    # "THANK YOU" — left-aligned, white
    add_textbox(slide, "THANK YOU", MARGIN, 500000,
                SLIDE_W - 2 * MARGIN, 800000,
                font_size=FONT_SECTION_TITLE, bold=True, color="#FFFFFF")

    # Accent line below heading
    add_rect(slide, MARGIN, 1300000, 2000000, 35000, fill_color=t.accent)

    # Gracious note
    add_textbox(slide, "We look forward to working with you.",
                MARGIN, 1500000, int(SLIDE_W * 0.6), 400000,
                font_size=14, color=tint(t.primary, 0.45))

    # Contact cards with colored left borders — 2x2 grid
    card_w = (SLIDE_W - 2 * MARGIN - 300000) // 2
    card_h = 1200000
    gap_x = 300000
    gap_y = 200000
    grid_top = 2200000

    for i, (label, value, icon) in enumerate(contacts[:4]):
        row = i // 2
        col = i % 2
        x = MARGIN + col * (card_w + gap_x)
        y = grid_top + row * (card_h + gap_y)

        # Card background
        add_rect(slide, x, y, card_w, card_h,
                 fill_color=tint(t.primary, 0.06),
                 line_color=tint(t.primary, 0.2), line_width=0.75)

        # Colored left border
        add_rect(slide, x, y, 40000, card_h,
                 fill_color=t.palette[i % len(t.palette)])

        # Icon
        add_textbox(slide, icon, x + 120000, y + 200000, 500000, 400000,
                    font_size=24, color=t.accent)

        # Label
        add_textbox(slide, label, x + 120000, y + 580000, card_w - 250000, 280000,
                    font_size=10, bold=True, color=tint(t.primary, 0.4))

        # Value
        add_textbox(slide, value, x + 120000, y + 830000, card_w - 250000, 300000,
                    font_size=14, color="#FFFFFF")

    # Company name at bottom
    add_textbox(slide, name, MARGIN, SLIDE_H - 600000,
                SLIDE_W - 2 * MARGIN, 300000,
                font_size=FONT_CAPTION, color=tint(t.primary, 0.35),
                alignment=PP_ALIGN.CENTER)


# -- Variant 13: DASHBOARD -- summary tiles with key info + contact --

def _dashboard_summary(slide, t, name, c):
    contacts = _get_contacts(c)
    add_background(slide, "#FFFFFF")
    m = int(MARGIN * 0.85)

    # Accent gradient header band
    band_h = 800000
    band_steps = 4
    step_h = band_h // band_steps
    for i in range(band_steps):
        color = shade(t.accent, i * 0.06) if i > 0 else t.accent
        add_rect(slide, 0, i * step_h, SLIDE_W, step_h + 1, fill_color=color)

    # "Thank You" in header
    add_textbox(slide, "Thank You", m, 200000, 4000000, 400000,
                font_size=24, bold=True, color="#FFFFFF")

    # Company name in header right
    add_textbox(slide, name, SLIDE_W - m - 4000000, 200000, 4000000, 400000,
                font_size=12, color=tint(t.accent, 0.8),
                alignment=PP_ALIGN.RIGHT)

    # Gracious note below header
    add_textbox(slide, "We appreciate your time and look forward to our collaboration.",
                m, band_h + 300000, SLIDE_W - 2 * m, 400000,
                font_size=15, color=t.primary)

    # Summary metric tiles — 4 tiles across top of white area
    tile_top = band_h + 900000
    tile_h = 1100000
    n = min(len(contacts), 4)
    tile_gap = 200000
    tile_w = (SLIDE_W - 2 * m - (n - 1) * tile_gap) // max(n, 1)

    for i, (label, value, icon) in enumerate(contacts[:n]):
        x = m + i * (tile_w + tile_gap)

        # Tile shadow
        add_rect(slide, x + 10000, tile_top + 10000, tile_w, tile_h,
                 fill_color=tint(t.secondary, 0.85), corner_radius=50000)
        # Tile
        add_rect(slide, x, tile_top, tile_w, tile_h,
                 fill_color="#FFFFFF", corner_radius=50000,
                 line_color=tint(t.secondary, 0.7), line_width=0.5)
        # Accent top strip
        add_rect(slide, x, tile_top, tile_w, 40000, fill_color=t.accent)

        # Icon
        add_textbox(slide, icon, x, tile_top + 180000, tile_w, 350000,
                    font_size=22, color=t.accent,
                    alignment=PP_ALIGN.CENTER)

        # Label
        add_textbox(slide, label, x, tile_top + 520000, tile_w, 250000,
                    font_size=10, bold=True, color=t.secondary,
                    alignment=PP_ALIGN.CENTER)

        # Value
        add_textbox(slide, value, x + 60000, tile_top + 770000,
                    tile_w - 120000, 280000,
                    font_size=13, color=t.primary,
                    alignment=PP_ALIGN.CENTER)

    # Footer bar
    footer_y = SLIDE_H - 600000
    add_rect(slide, 0, footer_y, SLIDE_W, 600000, fill_color=tint(t.accent, 0.08))
    add_textbox(slide, f"{name}  |  Thank you for your time",
                m, footer_y + 150000, SLIDE_W - 2 * m, 300000,
                font_size=11, color=t.secondary, alignment=PP_ALIGN.CENTER)
