"""Slide 3/8/15/21/27 — Section Divider: 11 unique visual variants."""

from __future__ import annotations

from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

from pptmaster.builder.design_system import SLIDE_W, SLIDE_H, MARGIN, FONT_SECTION_TITLE, FONT_SUBTITLE
from pptmaster.builder.helpers import (
    add_background, add_textbox, add_rect, add_circle, add_line,
    add_gold_accent_line, add_triangle, add_hexagon, add_diamond,
)
from pptmaster.assets.color_utils import tint, shade


def build(slide, *, theme=None, section_number: str = "01",
          section_title: str = "Section Title", subtitle: str = "") -> None:
    from pptmaster.builder.themes import DEFAULT_THEME
    t = theme or DEFAULT_THEME
    s = t.ux_style

    dispatch = {
        "centered": _centered,
        "left-minimal": _left_minimal,
        "full-bleed": _full_bleed,
        "floating-card": _floating_card,
        "dark-accent": _dark_accent,
        "split-half": _split_half,
        "angled": _angled,
        "editorial-spread": _editorial_spread,
        "gradient-band": _gradient_band,
        "retro-ruled": _retro_ruled,
        "oversized-number": _oversized_number,
        "scholarly-ruled": _scholarly_ruled,
        "laboratory-accent": _laboratory_accent,
        "dashboard-tab": _dashboard_tab,
    }
    builder = dispatch.get(s.divider, _centered)
    builder(slide, t, section_number, section_title, subtitle)


# ── CLASSIC — centered with faded number ───────────────────────────────

def _centered(slide, t, num, title, sub):
    add_background(slide, t.primary)
    add_textbox(slide, num, SLIDE_W - 4500000, 500000, 4000000, 3500000,
                font_size=180, bold=True, color=shade(t.primary, 0.1), alignment=PP_ALIGN.RIGHT)
    y = SLIDE_H // 2 - 400000
    add_gold_accent_line(slide, MARGIN, y, 2500000, thickness=3, color=t.accent)
    add_textbox(slide, f"Section {num}", MARGIN, y + 150000, 3000000, 350000,
                font_size=14, bold=True, color=t.accent)
    add_textbox(slide, title, MARGIN, y + 500000, 8000000, 800000,
                font_size=FONT_SECTION_TITLE, bold=True, color="#FFFFFF")
    if sub:
        add_textbox(slide, sub, MARGIN, y + 1300000, 8000000, 400000,
                    font_size=FONT_SUBTITLE, color=tint(t.primary, 0.6))


# ── MINIMAL — left-aligned, thin rule, extreme whitespace ──────────────

def _left_minimal(slide, t, num, title, sub):
    add_background(slide, "#FFFFFF")
    add_line(slide, MARGIN, SLIDE_H // 2 - 800000, MARGIN + 300000, SLIDE_H // 2 - 800000,
             color=t.accent, width=1.5)
    add_textbox(slide, num, MARGIN, SLIDE_H // 2 - 600000, 1000000, 400000,
                font_size=13, bold=True, color=t.accent)
    add_textbox(slide, title, MARGIN, SLIDE_H // 2 - 200000, 8000000, 700000,
                font_size=32, bold=True, color=t.primary)
    if sub:
        add_textbox(slide, sub, MARGIN, SLIDE_H // 2 + 500000, 6000000, 350000,
                    font_size=13, color=t.secondary)
    # Thin bottom rule
    add_line(slide, MARGIN, SLIDE_H - 1200000, SLIDE_W - MARGIN, SLIDE_H - 1200000,
             color=tint(t.secondary, 0.8), width=0.5)


# ── BOLD — full-bleed color band, oversized centered ──────────────────

def _full_bleed(slide, t, num, title, sub):
    add_background(slide, t.primary)
    # Top accent strip
    add_rect(slide, 0, 0, SLIDE_W, 120000, fill_color=t.accent)
    # Bottom accent strip
    add_rect(slide, 0, SLIDE_H - 120000, SLIDE_W, 120000, fill_color=t.accent)
    # Number — oversized
    add_textbox(slide, num, MARGIN, 800000, SLIDE_W - 2 * MARGIN, 1500000,
                font_size=120, bold=True, color=t.accent, alignment=PP_ALIGN.CENTER)
    # Title centered and large
    add_textbox(slide, title.upper(), MARGIN, 2400000, SLIDE_W - 2 * MARGIN, 900000,
                font_size=FONT_SECTION_TITLE + 4, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)
    # Thick accent underline
    add_rect(slide, SLIDE_W // 2 - 1500000, 3500000, 3000000, 60000, fill_color=t.accent)
    if sub:
        add_textbox(slide, sub, MARGIN + 1000000, 3700000,
                    SLIDE_W - 2 * MARGIN - 2000000, 400000,
                    font_size=16, color=tint(t.primary, 0.5), alignment=PP_ALIGN.CENTER)


# ── ELEVATED — floating card with number badge ────────────────────────

def _floating_card(slide, t, num, title, sub):
    add_background(slide, t.light_bg)
    # Card
    card_w = int(SLIDE_W * 0.65)
    card_left = SLIDE_W // 2 - card_w // 2
    card_top = SLIDE_H // 2 - 1400000
    card_h = 2800000
    add_rect(slide, card_left + 50000, card_top + 50000, card_w, card_h,
             fill_color=shade(t.light_bg, 0.1), corner_radius=160000)
    add_rect(slide, card_left, card_top, card_w, card_h,
             fill_color="#FFFFFF", corner_radius=160000)
    # Number badge — accent circle overlapping card top
    badge_x = SLIDE_W // 2
    badge_y = card_top
    add_circle(slide, badge_x, badge_y, 280000, fill_color=t.accent)
    add_textbox(slide, num, badge_x - 200000, badge_y - 200000, 400000, 400000,
                font_size=22, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER, vertical_anchor=MSO_ANCHOR.MIDDLE)
    # Title
    add_textbox(slide, title, card_left + 300000, card_top + 500000,
                card_w - 600000, 800000,
                font_size=36, bold=True, color=t.primary, alignment=PP_ALIGN.CENTER)
    # Accent line
    add_gold_accent_line(slide, SLIDE_W // 2 - 500000, card_top + 1400000, 1000000,
                         thickness=2, color=t.accent)
    if sub:
        add_textbox(slide, sub, card_left + 400000, card_top + 1600000,
                    card_w - 800000, 400000,
                    font_size=14, color=t.secondary, alignment=PP_ALIGN.CENTER)


# ── DARK — accent border top, large centered ──────────────────────────

def _dark_accent(slide, t, num, title, sub):
    add_background(slide, t.primary)
    # Accent bar top
    add_rect(slide, 0, 0, SLIDE_W, 60000, fill_color=t.accent)
    # Corner brackets
    sz = 150000
    bw = 3
    add_rect(slide, MARGIN, MARGIN + 100000, sz, bw, fill_color=t.accent)
    add_rect(slide, MARGIN, MARGIN + 100000, bw, sz, fill_color=t.accent)
    add_rect(slide, SLIDE_W - MARGIN - sz, SLIDE_H - MARGIN - bw - 100000, sz, bw, fill_color=t.accent)
    add_rect(slide, SLIDE_W - MARGIN - bw, SLIDE_H - MARGIN - sz - 100000, bw, sz, fill_color=t.accent)
    # Number
    add_textbox(slide, num, MARGIN, SLIDE_H // 2 - 1200000, SLIDE_W - 2 * MARGIN, 800000,
                font_size=60, bold=True, color=t.accent, alignment=PP_ALIGN.CENTER)
    # Title
    add_textbox(slide, title.upper(), MARGIN, SLIDE_H // 2 - 300000,
                SLIDE_W - 2 * MARGIN, 700000,
                font_size=36, bold=True, color="#FFFFFF", alignment=PP_ALIGN.CENTER)
    if sub:
        add_textbox(slide, sub, MARGIN + 1000000, SLIDE_H // 2 + 500000,
                    SLIDE_W - 2 * MARGIN - 2000000, 400000,
                    font_size=13, color=tint(t.primary, 0.45), alignment=PP_ALIGN.CENTER)


# ── SPLIT — 50/50 split, number on colored half ──────────────────────

def _split_half(slide, t, num, title, sub):
    mid = SLIDE_W // 2
    add_rect(slide, 0, 0, mid, SLIDE_H, fill_color=t.primary)
    add_rect(slide, mid, 0, mid, SLIDE_H, fill_color="#FFFFFF")
    add_rect(slide, mid - 30000, 0, 60000, SLIDE_H, fill_color=t.accent)
    # Number on left
    add_textbox(slide, num, MARGIN, SLIDE_H // 2 - 700000, mid - 2 * MARGIN, 1400000,
                font_size=100, bold=True, color=tint(t.primary, 0.2), alignment=PP_ALIGN.CENTER)
    # Title on right
    add_textbox(slide, f"Section {num}", mid + MARGIN, SLIDE_H // 2 - 900000,
                mid - 2 * MARGIN, 350000,
                font_size=13, bold=True, color=t.accent)
    add_textbox(slide, title, mid + MARGIN, SLIDE_H // 2 - 500000,
                mid - 2 * MARGIN, 700000,
                font_size=30, bold=True, color=t.primary)
    if sub:
        add_gold_accent_line(slide, mid + MARGIN, SLIDE_H // 2 + 300000, 1500000,
                             thickness=2, color=t.accent)
        add_textbox(slide, sub, mid + MARGIN, SLIDE_H // 2 + 500000,
                    mid - 2 * MARGIN, 350000,
                    font_size=13, color=t.secondary)


# ── GEO — angled shapes, geometric emphasis ───────────────────────────

def _angled(slide, t, num, title, sub):
    add_background(slide, t.primary)
    # Angled color blocks
    add_triangle(slide, 0, 0, SLIDE_W, int(SLIDE_H * 0.3),
                 fill_color=shade(t.primary, 0.1))
    add_triangle(slide, 0, int(SLIDE_H * 0.7), SLIDE_W, int(SLIDE_H * 0.3),
                 fill_color=shade(t.primary, 0.08), rotation=180)
    # Hexagon with number
    cx = SLIDE_W // 2
    add_hexagon(slide, cx, SLIDE_H // 2 - 800000, 400000, fill_color=t.accent)
    add_textbox(slide, num, cx - 300000, SLIDE_H // 2 - 1100000, 600000, 600000,
                font_size=28, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER, vertical_anchor=MSO_ANCHOR.MIDDLE)
    # Title
    add_textbox(slide, title, MARGIN, SLIDE_H // 2, SLIDE_W - 2 * MARGIN, 700000,
                font_size=FONT_SECTION_TITLE, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)
    if sub:
        add_textbox(slide, sub, MARGIN + 1000000, SLIDE_H // 2 + 800000,
                    SLIDE_W - 2 * MARGIN - 2000000, 400000,
                    font_size=14, color=tint(t.primary, 0.5), alignment=PP_ALIGN.CENTER)


# ── EDITORIAL — asymmetric spread, elegant ────────────────────────────

def _editorial_spread(slide, t, num, title, sub):
    add_background(slide, "#FFFFFF")
    # Left accent column
    add_rect(slide, 0, 0, 100000, SLIDE_H, fill_color=t.accent)
    # Number top-left
    add_textbox(slide, num, MARGIN + 200000, 1200000, 2000000, 1000000,
                font_size=80, bold=True, color=tint(t.primary, 0.85))
    # Short rule
    add_line(slide, MARGIN + 200000, 2300000, MARGIN + 700000, 2300000,
             color=t.accent, width=1.5)
    # Title
    add_textbox(slide, title, MARGIN + 200000, 2500000, SLIDE_W - 3 * MARGIN, 800000,
                font_size=34, bold=True, color=t.primary)
    if sub:
        add_textbox(slide, sub, MARGIN + 200000, 3400000, SLIDE_W - 3 * MARGIN, 400000,
                    font_size=14, color=t.secondary)
    # Decorative line at bottom
    add_line(slide, MARGIN + 200000, SLIDE_H - 1000000, SLIDE_W - MARGIN, SLIDE_H - 1000000,
             color=tint(t.secondary, 0.8), width=0.5)


# ── GRADIENT — gradient band, refined centered ────────────────────────

def _gradient_band(slide, t, num, title, sub):
    band_h = SLIDE_H // 5
    for i in range(5):
        color = tint(t.primary, i * 0.04)
        add_rect(slide, 0, i * band_h, SLIDE_W, band_h + 1, fill_color=color)
    # Subtle circle
    add_circle(slide, SLIDE_W // 2, SLIDE_H // 2, 1800000,
               fill_color=tint(t.accent, 0.06))
    # Number
    add_textbox(slide, num, MARGIN, SLIDE_H // 2 - 1000000,
                SLIDE_W - 2 * MARGIN, 600000,
                font_size=50, bold=True, color=t.accent, alignment=PP_ALIGN.CENTER)
    # Thin line
    add_gold_accent_line(slide, SLIDE_W // 2 - 600000, SLIDE_H // 2 - 300000, 1200000,
                         thickness=1.5, color=t.accent)
    # Title
    add_textbox(slide, title, MARGIN + 500000, SLIDE_H // 2 - 100000,
                SLIDE_W - 2 * MARGIN - 1000000, 700000,
                font_size=FONT_SECTION_TITLE, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER)
    if sub:
        add_textbox(slide, sub, MARGIN + 1500000, SLIDE_H // 2 + 700000,
                    SLIDE_W - 2 * MARGIN - 3000000, 400000,
                    font_size=13, color=tint(t.primary, 0.45), alignment=PP_ALIGN.CENTER)


# ── RETRO — double horizontal rules, centered ─────────────────────────

def _retro_ruled(slide, t, num, title, sub):
    add_background(slide, t.light_bg)
    y_mid = SLIDE_H // 2
    # Double rules above and below
    add_line(slide, MARGIN, y_mid - 1200000, SLIDE_W - MARGIN, y_mid - 1200000,
             color=t.accent, width=2)
    add_line(slide, MARGIN, y_mid - 1150000, SLIDE_W - MARGIN, y_mid - 1150000,
             color=t.accent, width=0.5)
    add_line(slide, MARGIN, y_mid + 1200000, SLIDE_W - MARGIN, y_mid + 1200000,
             color=t.accent, width=0.5)
    add_line(slide, MARGIN, y_mid + 1250000, SLIDE_W - MARGIN, y_mid + 1250000,
             color=t.accent, width=2)
    # Number in circle
    add_circle(slide, SLIDE_W // 2, y_mid - 700000, 250000,
               fill_color=t.accent)
    add_textbox(slide, num, SLIDE_W // 2 - 200000, y_mid - 900000, 400000, 400000,
                font_size=22, bold=True, color="#FFFFFF",
                alignment=PP_ALIGN.CENTER, vertical_anchor=MSO_ANCHOR.MIDDLE)
    # Title
    add_textbox(slide, title, MARGIN, y_mid - 300000, SLIDE_W - 2 * MARGIN, 600000,
                font_size=34, bold=True, color=t.primary, alignment=PP_ALIGN.CENTER)
    if sub:
        add_textbox(slide, sub, MARGIN + 1000000, y_mid + 400000,
                    SLIDE_W - 2 * MARGIN - 2000000, 350000,
                    font_size=13, color=t.secondary, alignment=PP_ALIGN.CENTER)


# ── MAGAZINE — oversized number fills the slide ───────────────────────

def _oversized_number(slide, t, num, title, sub):
    add_background(slide, t.primary)
    # Gigantic number filling most of the slide
    add_textbox(slide, num, -500000, -800000, SLIDE_W, SLIDE_H + 500000,
                font_size=400, bold=True, color=shade(t.primary, 0.08),
                alignment=PP_ALIGN.CENTER)
    # Title overlay at bottom
    add_textbox(slide, title, MARGIN, SLIDE_H // 2, SLIDE_W - 2 * MARGIN, 800000,
                font_size=FONT_SECTION_TITLE + 6, bold=True, color="#FFFFFF")
    # Accent bar
    add_rect(slide, MARGIN, SLIDE_H // 2 + 900000, 2000000, 50000, fill_color=t.accent)
    if sub:
        add_textbox(slide, sub, MARGIN, SLIDE_H // 2 + 1100000, 6000000, 400000,
                    font_size=15, color=tint(t.primary, 0.5))


# ── SCHOLARLY — white bg, centered number + title, thin rules ───────────

def _scholarly_ruled(slide, t, num, title, sub):
    add_background(slide, "#FAFAF7")
    cy = SLIDE_H // 2

    # Thin rule above content
    rule_w = int(SLIDE_W * 0.45)
    rule_left = (SLIDE_W - rule_w) // 2
    rule_y1 = cy - 1000000
    add_line(slide, rule_left, rule_y1, rule_left + rule_w, rule_y1,
             color=tint(t.secondary, 0.6), width=0.5)

    # Section number — centered, muted
    add_textbox(slide, f"Section {num}", MARGIN, rule_y1 + 200000,
                SLIDE_W - 2 * MARGIN, 400000,
                font_size=13, color=t.accent, alignment=PP_ALIGN.CENTER)

    # Title — centered, elegant
    add_textbox(slide, title, MARGIN + 500000, cy - 300000,
                SLIDE_W - 2 * MARGIN - 1000000, 700000,
                font_size=FONT_SECTION_TITLE - 4, bold=True, color=t.primary,
                alignment=PP_ALIGN.CENTER)

    # Thin rule below title
    rule_y2 = cy + 600000
    add_line(slide, rule_left, rule_y2, rule_left + rule_w, rule_y2,
             color=tint(t.secondary, 0.6), width=0.5)

    if sub:
        add_textbox(slide, sub, MARGIN + 1000000, rule_y2 + 250000,
                    SLIDE_W - 2 * MARGIN - 2000000, 350000,
                    font_size=13, color=t.secondary, alignment=PP_ALIGN.CENTER)


# ── LABORATORY — dark bg, accent bar on left, large monospace number ────

def _laboratory_accent(slide, t, num, title, sub):
    add_background(slide, t.primary)

    # Accent bar top
    add_rect(slide, 0, 0, SLIDE_W, 50000, fill_color=t.accent)

    # Thick left accent bar
    bar_w = 60000
    bar_top = SLIDE_H // 2 - 1500000
    bar_h = 3000000
    add_rect(slide, MARGIN, bar_top, bar_w, bar_h, fill_color=t.accent)

    # Large section number — monospace feel, accent colored
    add_textbox(slide, num, MARGIN + bar_w + 200000, SLIDE_H // 2 - 1200000,
                2000000, 1200000,
                font_size=80, bold=True, color=t.accent)

    # Section title — large, white
    add_textbox(slide, title, MARGIN + bar_w + 200000, SLIDE_H // 2 + 100000,
                SLIDE_W - 2 * MARGIN - bar_w - 400000, 700000,
                font_size=FONT_SECTION_TITLE - 2, bold=True, color="#FFFFFF")

    if sub:
        add_textbox(slide, sub, MARGIN + bar_w + 200000, SLIDE_H // 2 + 900000,
                    SLIDE_W - 2 * MARGIN - bar_w - 400000, 400000,
                    font_size=14, color=tint(t.primary, 0.45))

    # Grid dots in bottom-right corner
    dot_color = tint(t.primary, 0.12)
    for row in range(4):
        for col in range(4):
            x = SLIDE_W - 1500000 + col * 250000
            y = SLIDE_H - 1500000 + row * 250000
            add_circle(slide, x, y, 18000, fill_color=dot_color)

    # Bottom accent bar
    add_rect(slide, 0, SLIDE_H - 50000, SLIDE_W, 50000, fill_color=t.accent)


# ── DASHBOARD — colored tab/banner at top, white body ───────────────────

def _dashboard_tab(slide, t, num, title, sub):
    add_background(slide, "#FFFFFF")
    m = int(MARGIN * 0.85)

    # Accent banner/tab at top
    banner_h = 1400000
    add_rect(slide, 0, 0, SLIDE_W, banner_h, fill_color=t.accent)

    # Section number inside banner — large, white
    add_textbox(slide, num, m, 200000, 1000000, 600000,
                font_size=36, bold=True, color="#FFFFFF")

    # Section title inside banner
    add_textbox(slide, title, m, 700000, SLIDE_W - 2 * m, 500000,
                font_size=FONT_SECTION_TITLE - 6, bold=True, color="#FFFFFF")

    # Tab indicator at bottom of banner
    tab_w = 2000000
    add_rect(slide, m, banner_h - 50000, tab_w, 50000, fill_color="#FFFFFF")

    if sub:
        # Subtitle on white area below banner
        add_textbox(slide, sub, m, banner_h + 400000,
                    SLIDE_W - 2 * m, 400000,
                    font_size=16, color=t.secondary)

    # Decorative card shadow at center of white area
    card_top = banner_h + 1200000
    card_w = int(SLIDE_W * 0.5)
    card_left = (SLIDE_W - card_w) // 2
    card_h = 500000
    add_rect(slide, card_left + 12000, card_top + 12000, card_w, card_h,
             fill_color=tint(t.secondary, 0.85), corner_radius=40000)
    add_rect(slide, card_left, card_top, card_w, card_h,
             fill_color="#FFFFFF", corner_radius=40000,
             line_color=tint(t.secondary, 0.7), line_width=0.5)
    add_textbox(slide, f"Section {num}  —  {title}",
                card_left + 200000, card_top + 120000,
                card_w - 400000, 280000,
                font_size=14, color=t.primary, alignment=PP_ALIGN.CENTER)
