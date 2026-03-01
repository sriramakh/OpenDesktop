"""Slide 25 — Highlight Quote: 14 unique visual variants dispatched by UX style."""

from __future__ import annotations

from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

from pptmaster.builder.design_system import (
    SLIDE_W, SLIDE_H, MARGIN, CONTENT_TOP, FOOTER_TOP,
)
from pptmaster.builder.helpers import (
    add_textbox, add_rect, add_circle, add_line,
    add_gold_accent_line, add_slide_title, add_dark_bg, add_background,
    add_diamond, add_hexagon, add_styled_card, add_image_placeholder,
)
from pptmaster.assets.color_utils import tint, shade


def build(slide, *, theme=None) -> None:
    from pptmaster.builder.themes import DEFAULT_THEME
    t = theme or DEFAULT_THEME
    s = t.ux_style
    c = t.content

    dispatch = {
        "decorative": _decorative,
        "left-border": _left_border,
        "full-bleed-color": _full_bleed_color,
        "elevated-card": _elevated_card,
        "dark-card": _dark_card,
        "split-quote": _split_quote,
        "geometric-frame": _geometric_frame,
        "pullquote": _pullquote,
        "gradient-card": _gradient_card,
        "retro-frame": _retro_frame,
        "cinematic-overlay": _cinematic_overlay,
        "scholarly-citation": _scholarly_citation,
        "laboratory-finding": _laboratory_finding,
        "dashboard-callout": _dashboard_callout,
    }
    builder = dispatch.get(s.quote, _decorative)
    builder(slide, t, c)


def _get_quote(c):
    """Extract quote data from content dict."""
    return (
        c.get("quote_text", "Innovation distinguishes between a leader and a follower."),
        c.get("quote_attribution", "Industry Leader"),
        c.get("quote_source", "Annual Report 2025"),
    )


# ── Variant 1: CLASSIC — large decorative quotation marks, italic text ──

def _decorative(slide, t, c):
    add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, fill_color=t.light_bg)
    quote_text, attribution, source = _get_quote(c)

    # Large open quote mark
    add_textbox(slide, "\u201C", MARGIN + 200000, CONTENT_TOP - 300000,
                1500000, 1500000,
                font_size=160, bold=True, color=t.accent)

    # Quote text
    quote_left = MARGIN + 600000
    quote_w = SLIDE_W - 2 * MARGIN - 1200000
    add_textbox(slide, quote_text, quote_left, CONTENT_TOP + 700000,
                quote_w, 2500000,
                font_size=24, italic=True, color=t.primary, alignment=PP_ALIGN.LEFT)

    # Accent line
    line_y = CONTENT_TOP + 3400000
    add_gold_accent_line(slide, quote_left, line_y, 2000000,
                         thickness=2.5, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, quote_left, line_y + 200000,
                4000000, 400000,
                font_size=16, bold=True, color=t.primary)

    # Source
    add_textbox(slide, source, quote_left, line_y + 550000,
                4000000, 300000,
                font_size=12, color=t.secondary)

    # Close quote mark
    add_textbox(slide, "\u201D", SLIDE_W - MARGIN - 1500000, CONTENT_TOP + 2500000,
                1500000, 1500000,
                font_size=160, bold=True, color=t.accent, alignment=PP_ALIGN.RIGHT)


# ── Variant 2: MINIMAL — thick left border, clean text, no quote marks ──

def _left_border(slide, t, c):
    quote_text, attribution, source = _get_quote(c)
    s = t.ux_style
    m = int(MARGIN * s.margin_factor)

    # Thick left accent border
    border_left = m + 400000
    border_w = 50000
    border_top = SLIDE_H // 2 - 1200000
    border_h = 2400000
    add_rect(slide, border_left, border_top, border_w, border_h,
             fill_color=t.accent)

    # Quote text to the right of border
    text_left = border_left + border_w + 300000
    text_w = SLIDE_W - m - text_left
    add_textbox(slide, quote_text, text_left, border_top + 100000,
                text_w, 1600000,
                font_size=22, italic=True, color=t.primary, alignment=PP_ALIGN.LEFT)

    # Attribution line
    attr_y = border_top + border_h - 600000
    add_line(slide, text_left, attr_y, text_left + 1000000, attr_y,
             color=tint(t.secondary, 0.7), width=0.5)

    # Attribution name
    add_textbox(slide, attribution, text_left, attr_y + 100000,
                text_w, 350000,
                font_size=14, bold=True, color=t.primary, alignment=PP_ALIGN.LEFT)

    # Source
    add_textbox(slide, source, text_left, attr_y + 400000,
                text_w, 300000,
                font_size=11, color=t.secondary, alignment=PP_ALIGN.LEFT)


# ── Variant 3: BOLD — full-slide primary bg, large white centered text ──

def _full_bleed_color(slide, t, c):
    add_background(slide, t.primary)
    quote_text, attribution, source = _get_quote(c)

    # Large centered quote
    quote_w = SLIDE_W - 2 * MARGIN - 1000000
    quote_left = (SLIDE_W - quote_w) // 2
    quote_top = SLIDE_H // 2 - 1400000

    # Open quote mark
    add_textbox(slide, "\u201C", quote_left - 300000, quote_top - 600000,
                800000, 800000,
                font_size=80, bold=True, color=t.accent)

    # Quote text — big, bold, white
    add_textbox(slide, quote_text.upper(), quote_left, quote_top,
                quote_w, 2400000,
                font_size=30, bold=True, color="#FFFFFF", alignment=PP_ALIGN.CENTER)

    # Wide accent line below quote
    line_y = quote_top + 2600000
    line_w = 3000000
    add_gold_accent_line(slide, SLIDE_W // 2 - line_w // 2, line_y, line_w,
                         thickness=3, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, quote_left, line_y + 300000,
                quote_w, 400000,
                font_size=16, bold=True, color=t.accent, alignment=PP_ALIGN.CENTER)

    # Source
    add_textbox(slide, source, quote_left, line_y + 650000,
                quote_w, 300000,
                font_size=12, color=tint(t.primary, 0.5), alignment=PP_ALIGN.CENTER)


# ── Variant 4: ELEVATED — quote inside large floating card with shadow ──

def _elevated_card(slide, t, c):
    add_dark_bg(slide, t)
    quote_text, attribution, source = _get_quote(c)

    # Decorative circle in background
    add_circle(slide, SLIDE_W - 1200000, 1200000, 1500000,
               fill_color=tint(t.accent, 0.85))

    # Large centered card
    card_w = int(SLIDE_W * 0.65)
    card_h = 3600000
    card_left = (SLIDE_W - card_w) // 2
    card_top = (SLIDE_H - card_h) // 2

    add_styled_card(slide, card_left, card_top, card_w, card_h,
                    theme=t, accent_color=t.accent)

    # Open quote mark inside card
    add_textbox(slide, "\u201C", card_left + 200000, card_top + 200000,
                800000, 800000,
                font_size=80, bold=True, color=t.accent)

    # Quote text
    inner_left = card_left + 300000
    inner_w = card_w - 600000
    text_color = "#FFFFFF" if t.ux_style.dark_mode else t.primary
    add_textbox(slide, quote_text, inner_left, card_top + 700000,
                inner_w, 1600000,
                font_size=20, italic=True, color=text_color, alignment=PP_ALIGN.CENTER)

    # Accent line
    line_y = card_top + 2500000
    add_gold_accent_line(slide, SLIDE_W // 2 - 600000, line_y, 1200000,
                         thickness=2, color=t.accent)

    # Attribution
    sub_color = tint(t.primary, 0.55) if t.ux_style.dark_mode else t.secondary
    add_textbox(slide, attribution, inner_left, line_y + 200000,
                inner_w, 350000,
                font_size=14, bold=True, color=text_color, alignment=PP_ALIGN.CENTER)

    # Source
    add_textbox(slide, source, inner_left, line_y + 500000,
                inner_w, 300000,
                font_size=11, color=sub_color, alignment=PP_ALIGN.CENTER)


# ── Variant 5: DARK — dark bg, bordered card, neon accent quote marks ──

def _dark_card(slide, t, c):
    add_background(slide, t.primary)
    quote_text, attribution, source = _get_quote(c)

    # Grid pattern for texture
    grid_spacing = 800000
    grid_color = tint(t.primary, 0.08)
    for x in range(0, SLIDE_W, grid_spacing):
        add_line(slide, x, 0, x, SLIDE_H, color=grid_color, width=0.25)
    for y in range(0, SLIDE_H, grid_spacing):
        add_line(slide, 0, y, SLIDE_W, y, color=grid_color, width=0.25)

    # Central card with subtle border
    card_w = int(SLIDE_W * 0.70)
    card_h = 3200000
    card_left = (SLIDE_W - card_w) // 2
    card_top = (SLIDE_H - card_h) // 2

    card_fill = tint(t.primary, 0.10)
    add_rect(slide, card_left, card_top, card_w, card_h,
             fill_color=card_fill, line_color=tint(t.primary, 0.25), line_width=0.75,
             corner_radius=60000)

    # Neon accent quote marks
    add_textbox(slide, "\u201C", card_left + 150000, card_top + 100000,
                800000, 800000,
                font_size=100, bold=True, color=t.accent)

    add_textbox(slide, "\u201D", card_left + card_w - 950000, card_top + card_h - 800000,
                800000, 800000,
                font_size=100, bold=True, color=t.accent, alignment=PP_ALIGN.RIGHT)

    # Quote text
    inner_left = card_left + 300000
    inner_w = card_w - 600000
    add_textbox(slide, quote_text, inner_left, card_top + 700000,
                inner_w, 1400000,
                font_size=22, italic=True, color="#FFFFFF", alignment=PP_ALIGN.CENTER)

    # Accent line
    line_y = card_top + 2200000
    add_gold_accent_line(slide, SLIDE_W // 2 - 800000, line_y, 1600000,
                         thickness=2, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, inner_left, line_y + 200000,
                inner_w, 350000,
                font_size=14, bold=True, color=t.accent, alignment=PP_ALIGN.CENTER)

    # Source
    add_textbox(slide, source, inner_left, line_y + 500000,
                inner_w, 300000,
                font_size=11, color=tint(t.primary, 0.4), alignment=PP_ALIGN.CENTER)

    # Corner accents (neon brackets)
    sz = 150000
    add_rect(slide, card_left - 30000, card_top - 30000, sz, 4, fill_color=t.accent)
    add_rect(slide, card_left - 30000, card_top - 30000, 4, sz, fill_color=t.accent)
    add_rect(slide, card_left + card_w - sz + 30000, card_top + card_h + 30000 - 4, sz, 4,
             fill_color=t.accent)
    add_rect(slide, card_left + card_w + 30000 - 4, card_top + card_h - sz + 30000, 4, sz,
             fill_color=t.accent)


# ── Variant 6: SPLIT — left half colored with quote, right with attr ───

def _split_quote(slide, t, c):
    quote_text, attribution, source = _get_quote(c)

    split_x = int(SLIDE_W * 0.55)

    # Left panel: primary color
    add_rect(slide, 0, 0, split_x, SLIDE_H, fill_color=t.primary)

    # Right panel: light bg
    add_rect(slide, split_x, 0, SLIDE_W - split_x, SLIDE_H, fill_color=t.light_bg)

    # Accent stripe between panels
    add_rect(slide, split_x - 30000, 0, 60000, SLIDE_H, fill_color=t.accent)

    # Open quote mark on left panel
    add_textbox(slide, "\u201C", MARGIN + 100000, SLIDE_H // 2 - 1600000,
                1200000, 1200000,
                font_size=120, bold=True, color=tint(t.primary, 0.3))

    # Quote text on left panel
    quote_left = MARGIN + 200000
    quote_w = split_x - MARGIN - 400000
    add_textbox(slide, quote_text, quote_left, SLIDE_H // 2 - 600000,
                quote_w, 2000000,
                font_size=22, italic=True, color="#FFFFFF", alignment=PP_ALIGN.LEFT)

    # Right panel content — attribution section
    right_left = split_x + 200000
    right_w = SLIDE_W - split_x - MARGIN - 200000

    # Accent line
    attr_top = SLIDE_H // 2 - 300000
    add_gold_accent_line(slide, right_left, attr_top, 1500000,
                         thickness=2.5, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, right_left, attr_top + 200000,
                right_w, 500000,
                font_size=20, bold=True, color=t.primary, alignment=PP_ALIGN.LEFT)

    # Source
    add_textbox(slide, source, right_left, attr_top + 700000,
                right_w, 350000,
                font_size=13, color=t.secondary, alignment=PP_ALIGN.LEFT)

    # Decorative element on right
    add_circle(slide, SLIDE_W - MARGIN - 400000, SLIDE_H - 800000, 300000,
               fill_color=tint(t.accent, 0.85))


# ── Variant 7: GEO — quote inside geometric frame (angled corners) ─────

def _geometric_frame(slide, t, c):
    add_dark_bg(slide, t)
    quote_text, attribution, source = _get_quote(c)

    text_color = "#FFFFFF" if t.ux_style.dark_mode else t.primary
    sub_color = tint(t.primary, 0.5) if t.ux_style.dark_mode else t.secondary

    # Geometric frame: outer rectangle with thick border
    frame_w = int(SLIDE_W * 0.70)
    frame_h = 3600000
    frame_left = (SLIDE_W - frame_w) // 2
    frame_top = (SLIDE_H - frame_h) // 2

    add_rect(slide, frame_left, frame_top, frame_w, frame_h,
             line_color=t.accent, line_width=2.5)

    # Inner rectangle (slight offset for double-frame effect)
    inset = 80000
    add_rect(slide, frame_left + inset, frame_top + inset,
             frame_w - 2 * inset, frame_h - 2 * inset,
             line_color=tint(t.accent, 0.5), line_width=0.75)

    # Corner diamonds at each corner of outer frame
    diamond_sz = 80000
    corners = [
        (frame_left, frame_top),
        (frame_left + frame_w, frame_top),
        (frame_left, frame_top + frame_h),
        (frame_left + frame_w, frame_top + frame_h),
    ]
    for cx, cy in corners:
        add_diamond(slide, cx, cy, diamond_sz, fill_color=t.accent)

    # Quote text centered inside frame
    inner_left = frame_left + 300000
    inner_w = frame_w - 600000
    add_textbox(slide, quote_text, inner_left, frame_top + 500000,
                inner_w, 1800000,
                font_size=22, italic=True, color=text_color, alignment=PP_ALIGN.CENTER)

    # Horizontal accent line
    line_y = frame_top + 2500000
    line_w = 2000000
    add_gold_accent_line(slide, SLIDE_W // 2 - line_w // 2, line_y, line_w,
                         thickness=2, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, inner_left, line_y + 250000,
                inner_w, 400000,
                font_size=14, bold=True, color=text_color, alignment=PP_ALIGN.CENTER)

    # Source
    add_textbox(slide, source, inner_left, line_y + 600000,
                inner_w, 300000,
                font_size=11, color=sub_color, alignment=PP_ALIGN.CENTER)

    # Decorative hexagons in background
    add_hexagon(slide, MARGIN + 200000, MARGIN + 400000, 200000,
                fill_color=tint(t.accent, 0.15 if t.ux_style.dark_mode else 0.85))
    add_hexagon(slide, SLIDE_W - MARGIN - 300000, SLIDE_H - MARGIN - 500000, 250000,
                fill_color=tint(t.accent, 0.15 if t.ux_style.dark_mode else 0.85))


# ── Variant 8: EDITORIAL — magazine pullquote with thin rules ───────────

def _pullquote(slide, t, c):
    quote_text, attribution, source = _get_quote(c)
    s = t.ux_style
    m = int(MARGIN * s.margin_factor)

    # Content centered vertically
    content_center = SLIDE_H // 2
    quote_w = int(SLIDE_W * 0.60)
    quote_left = (SLIDE_W - quote_w) // 2

    # Top thin rule
    rule_top = content_center - 1400000
    add_line(slide, quote_left, rule_top, quote_left + quote_w, rule_top,
             color=tint(t.secondary, 0.7), width=0.5)

    # Short accent mark at start of rule
    add_line(slide, quote_left, rule_top, quote_left + 400000, rule_top,
             color=t.accent, width=1.5)

    # Quote text — large and elegant
    add_textbox(slide, quote_text, quote_left, rule_top + 200000,
                quote_w, 1800000,
                font_size=24, italic=True, color=t.primary, alignment=PP_ALIGN.LEFT)

    # Bottom thin rule
    rule_bottom = content_center + 800000
    add_line(slide, quote_left, rule_bottom, quote_left + quote_w, rule_bottom,
             color=tint(t.secondary, 0.7), width=0.5)

    # Short accent mark at end of bottom rule
    add_line(slide, quote_left + quote_w - 400000, rule_bottom,
             quote_left + quote_w, rule_bottom,
             color=t.accent, width=1.5)

    # Attribution below bottom rule — left-aligned
    add_textbox(slide, f"\u2014 {attribution}", quote_left, rule_bottom + 200000,
                quote_w, 350000,
                font_size=13, bold=True, color=t.primary, alignment=PP_ALIGN.LEFT)

    # Source
    add_textbox(slide, source, quote_left, rule_bottom + 550000,
                quote_w, 300000,
                font_size=11, color=t.secondary, alignment=PP_ALIGN.LEFT)


# ── Variant 9: GRADIENT — quote in rounded card on gradient background ──

def _gradient_card(slide, t, c):
    add_dark_bg(slide, t)
    quote_text, attribution, source = _get_quote(c)

    text_color = "#FFFFFF" if t.ux_style.dark_mode else t.primary
    sub_color = tint(t.primary, 0.55) if t.ux_style.dark_mode else t.secondary

    # Simulated gradient bands behind card
    band_count = 5
    band_h = SLIDE_H // band_count
    for i in range(band_count):
        color = tint(t.accent, 0.88 - i * 0.03)
        if t.ux_style.dark_mode:
            color = tint(t.primary, 0.02 + i * 0.02)
        add_rect(slide, 0, i * band_h, SLIDE_W, band_h + 1, fill_color=color)

    # Large soft circle decoration
    add_circle(slide, SLIDE_W // 2, SLIDE_H // 2, 2800000,
               fill_color=tint(t.accent, 0.90 if not t.ux_style.dark_mode else 0.06))

    # Rounded card
    card_w = int(SLIDE_W * 0.60)
    card_h = 3400000
    card_left = (SLIDE_W - card_w) // 2
    card_top = (SLIDE_H - card_h) // 2

    add_styled_card(slide, card_left, card_top, card_w, card_h,
                    theme=t, accent_color=t.accent)

    # Open quote
    add_textbox(slide, "\u201C", card_left + 150000, card_top + 200000,
                800000, 800000,
                font_size=72, bold=True, color=t.accent)

    # Quote text
    inner_left = card_left + 250000
    inner_w = card_w - 500000
    add_textbox(slide, quote_text, inner_left, card_top + 700000,
                inner_w, 1500000,
                font_size=20, italic=True, color=text_color, alignment=PP_ALIGN.CENTER)

    # Accent line
    line_y = card_top + 2350000
    add_gold_accent_line(slide, SLIDE_W // 2 - 600000, line_y, 1200000,
                         thickness=1.5, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, inner_left, line_y + 200000,
                inner_w, 400000,
                font_size=14, bold=True, color=text_color, alignment=PP_ALIGN.CENTER)

    # Source
    add_textbox(slide, source, inner_left, line_y + 550000,
                inner_w, 300000,
                font_size=11, color=sub_color, alignment=PP_ALIGN.CENTER)


# ── Variant 10: RETRO — quote inside double-bordered rounded frame ─────

def _retro_frame(slide, t, c):
    add_background(slide, t.light_bg)
    quote_text, attribution, source = _get_quote(c)

    # Decorative dot pattern in corner
    for row in range(4):
        for col in range(6):
            add_circle(slide, SLIDE_W - 1500000 + col * 150000,
                       400000 + row * 150000, 25000,
                       fill_color=tint(t.accent, 0.7))

    # Outer rounded frame
    frame_w = int(SLIDE_W * 0.65)
    frame_h = 3600000
    frame_left = (SLIDE_W - frame_w) // 2
    frame_top = (SLIDE_H - frame_h) // 2

    add_rect(slide, frame_left, frame_top, frame_w, frame_h,
             fill_color="#FFFFFF", line_color=t.accent, line_width=2.5,
             corner_radius=100000)

    # Inner rounded frame
    inset = 60000
    add_rect(slide, frame_left + inset, frame_top + inset,
             frame_w - 2 * inset, frame_h - 2 * inset,
             line_color=t.accent, line_width=0.75,
             corner_radius=80000)

    # Open quote mark
    add_textbox(slide, "\u201C", frame_left + 200000, frame_top + 200000,
                800000, 800000,
                font_size=80, bold=True, color=t.accent)

    # Quote text centered inside frame
    inner_left = frame_left + 300000
    inner_w = frame_w - 600000
    add_textbox(slide, quote_text, inner_left, frame_top + 700000,
                inner_w, 1600000,
                font_size=20, italic=True, color=t.primary, alignment=PP_ALIGN.CENTER)

    # Close quote
    add_textbox(slide, "\u201D", frame_left + frame_w - 1000000, frame_top + frame_h - 900000,
                800000, 800000,
                font_size=80, bold=True, color=t.accent, alignment=PP_ALIGN.RIGHT)

    # Accent line
    line_y = frame_top + 2500000
    add_gold_accent_line(slide, SLIDE_W // 2 - 600000, line_y, 1200000,
                         thickness=2, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, inner_left, line_y + 250000,
                inner_w, 400000,
                font_size=14, bold=True, color=t.primary, alignment=PP_ALIGN.CENTER)

    # Source
    add_textbox(slide, source, inner_left, line_y + 600000,
                inner_w, 300000,
                font_size=11, color=t.secondary, alignment=PP_ALIGN.CENTER)

    # Decorative dots below frame
    dot_y = frame_top + frame_h + 200000
    for d in range(5):
        add_circle(slide, SLIDE_W // 2 - 200000 + d * 100000, dot_y, 20000,
                   fill_color=t.accent)


# ── Variant 11: MAGAZINE — full-bleed image placeholder with overlay ────

def _cinematic_overlay(slide, t, c):
    quote_text, attribution, source = _get_quote(c)

    # Full-bleed image placeholder
    add_image_placeholder(slide, 0, 0, SLIDE_W, SLIDE_H,
                          label="Full-Bleed Quote Background", bg_color=t.light_bg)

    # Dark overlay covering bottom 60%
    overlay_top = int(SLIDE_H * 0.30)
    overlay_h = SLIDE_H - overlay_top
    add_rect(slide, 0, overlay_top, SLIDE_W, overlay_h, fill_color=t.primary)

    # Accent line at overlay top
    add_rect(slide, 0, overlay_top, SLIDE_W, 40000, fill_color=t.accent)

    # Large quote mark
    add_textbox(slide, "\u201C", MARGIN, overlay_top + 200000,
                1000000, 1000000,
                font_size=100, bold=True, color=t.accent)

    # Quote text — bold and large
    quote_left = MARGIN + 200000
    quote_w = SLIDE_W - 2 * MARGIN - 400000
    add_textbox(slide, quote_text, quote_left, overlay_top + 800000,
                quote_w, 1800000,
                font_size=26, bold=True, color="#FFFFFF", alignment=PP_ALIGN.LEFT)

    # Attribution line
    attr_y = overlay_top + 2800000
    add_gold_accent_line(slide, quote_left, attr_y, 1500000,
                         thickness=2, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, quote_left, attr_y + 200000,
                quote_w, 400000,
                font_size=14, bold=True, color=t.accent, alignment=PP_ALIGN.LEFT)

    # Source
    add_textbox(slide, source, quote_left, attr_y + 550000,
                quote_w, 300000,
                font_size=11, color=tint(t.primary, 0.45), alignment=PP_ALIGN.LEFT)


# ── Variant 12: SCHOLARLY — white bg, centered citation, thin rules ───────

def _scholarly_citation(slide, t, c):
    add_background(slide, "#FFFFFF")
    quote_text, attribution, source = _get_quote(c)

    quote_w = int(SLIDE_W * 0.60)
    quote_left = (SLIDE_W - quote_w) // 2
    content_center = SLIDE_H // 2

    # Top thin rule
    rule_top = content_center - 1500000
    add_line(slide, quote_left, rule_top, quote_left + quote_w, rule_top,
             color=tint(t.secondary, 0.7), width=0.5)

    # Large centered quotation
    add_textbox(slide, quote_text, quote_left, rule_top + 300000,
                quote_w, 2000000,
                font_size=24, italic=True, color=t.primary, alignment=PP_ALIGN.CENTER)

    # Bottom thin rule
    rule_bottom = content_center + 900000
    add_line(slide, quote_left, rule_bottom, quote_left + quote_w, rule_bottom,
             color=tint(t.secondary, 0.7), width=0.5)

    # Attribution in italics with em-dash
    add_textbox(slide, f"\u2014{attribution}", quote_left, rule_bottom + 250000,
                quote_w, 400000,
                font_size=14, italic=True, color=t.primary, alignment=PP_ALIGN.CENTER)

    # Source as citation reference
    add_textbox(slide, source, quote_left, rule_bottom + 600000,
                quote_w, 300000,
                font_size=11, italic=True, color=t.secondary, alignment=PP_ALIGN.CENTER)


# ── Variant 13: LABORATORY — dark bg, key finding card, accent border ─────

def _laboratory_finding(slide, t, c):
    add_background(slide, t.primary)
    quote_text, attribution, source = _get_quote(c)

    # Central accent-bordered card
    card_w = int(SLIDE_W * 0.68)
    card_h = 3400000
    card_left = (SLIDE_W - card_w) // 2
    card_top = (SLIDE_H - card_h) // 2

    # Card with accent border
    border = 30000
    add_rect(slide, card_left - border, card_top - border,
             card_w + 2 * border, card_h + 2 * border,
             fill_color=t.accent)
    add_rect(slide, card_left, card_top, card_w, card_h,
             fill_color=tint(t.primary, 0.10), corner_radius=40000)

    # "Key Finding:" prefix
    inner_left = card_left + 250000
    inner_w = card_w - 500000
    add_textbox(slide, "Key Finding:", inner_left, card_top + 250000,
                inner_w, 400000,
                font_size=13, bold=True, color=t.accent, alignment=PP_ALIGN.LEFT)

    # Quote text in white
    add_textbox(slide, quote_text, inner_left, card_top + 650000,
                inner_w, 1500000,
                font_size=20, italic=True, color="#FFFFFF", alignment=PP_ALIGN.LEFT)

    # Accent line separator
    line_y = card_top + 2350000
    add_gold_accent_line(slide, inner_left, line_y, 1500000,
                         thickness=2, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, inner_left, line_y + 200000,
                inner_w, 350000,
                font_size=14, bold=True, color=tint(t.primary, 0.5),
                alignment=PP_ALIGN.LEFT)

    # Source
    add_textbox(slide, source, inner_left, line_y + 500000,
                inner_w, 300000,
                font_size=11, color=tint(t.primary, 0.35), alignment=PP_ALIGN.LEFT)


# ── Variant 14: DASHBOARD — header band, callout card with accent border ─

def _dashboard_callout(slide, t, c):
    add_background(slide, "#FFFFFF")
    quote_text, attribution, source = _get_quote(c)

    # Accent header band
    add_rect(slide, 0, 0, SLIDE_W, 80000, fill_color=t.accent)

    # Highlighted callout card
    card_w = int(SLIDE_W * 0.65)
    card_h = 3200000
    card_left = (SLIDE_W - card_w) // 2
    card_top = (SLIDE_H - card_h) // 2

    # Subtle tinted background for card
    add_rect(slide, card_left, card_top, card_w, card_h,
             fill_color=tint(t.accent, 0.92), corner_radius=50000)

    # Accent left border on card
    add_rect(slide, card_left, card_top, 45000, card_h, fill_color=t.accent)

    # Quote text
    inner_left = card_left + 250000
    inner_w = card_w - 400000
    add_textbox(slide, quote_text, inner_left, card_top + 400000,
                inner_w, 1600000,
                font_size=22, italic=True, color=t.primary, alignment=PP_ALIGN.LEFT)

    # Accent line
    line_y = card_top + 2200000
    add_gold_accent_line(slide, inner_left, line_y, 1500000,
                         thickness=2, color=t.accent)

    # Attribution
    add_textbox(slide, attribution, inner_left, line_y + 200000,
                inner_w, 400000,
                font_size=14, bold=True, color=t.primary, alignment=PP_ALIGN.LEFT)

    # Source
    add_textbox(slide, source, inner_left, line_y + 550000,
                inner_w, 300000,
                font_size=11, color=t.secondary, alignment=PP_ALIGN.LEFT)
