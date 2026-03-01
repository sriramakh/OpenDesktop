"""Slide 1 — Cover: 11 unique visual variants dispatched by UX style."""

from __future__ import annotations

from pptx.enum.text import PP_ALIGN

from pptmaster.builder.design_system import (
    SLIDE_W, SLIDE_H, MARGIN, FONT_COVER_TITLE, FONT_SUBTITLE, FONT_CAPTION,
)
from pptmaster.builder.helpers import (
    add_background, add_textbox, add_rect, add_circle, add_line,
    add_gold_accent_line, add_triangle, add_hexagon, add_image_placeholder,
    add_diamond,
)
from pptmaster.assets.color_utils import tint, shade


def build(slide, *, theme=None, company_name: str = "") -> None:
    from pptmaster.builder.themes import DEFAULT_THEME
    t = theme or DEFAULT_THEME
    s = t.ux_style
    name = company_name or t.company_name
    c = t.content

    dispatch = {
        "geometric": _geometric,
        "clean-centered": _clean_centered,
        "split-color": _split_color,
        "hero-card": _hero_card,
        "dark-grid": _dark_grid,
        "split-dramatic": _split_dramatic,
        "angular": _angular,
        "editorial-asymmetric": _editorial_asymmetric,
        "gradient-sweep": _gradient_sweep,
        "retro-badge": _retro_badge,
        "full-bleed-image": _full_bleed_image,
        "scholarly-centered": _scholarly_centered,
        "laboratory-dark": _laboratory_dark,
        "dashboard-header": _dashboard_header,
    }
    builder = dispatch.get(s.cover, _geometric)
    builder(slide, t, name, c)


# ── Variant 1: CLASSIC — geometric shapes, dark bg, left-aligned ──────

def _geometric(slide, t, name, c):
    add_background(slide, t.primary)
    add_circle(slide, SLIDE_W - 1500000, 900000, 2000000, fill_color=shade(t.primary, 0.1))
    add_circle(slide, SLIDE_W - 600000, 2200000, 500000, fill_color=shade(t.primary, 0.15))
    add_rect(slide, SLIDE_W - 3000000, SLIDE_H - 2500000, 2800000, 120000,
             fill_color=shade(t.primary, 0.12))
    gold_y = SLIDE_H // 2 + 200000
    add_gold_accent_line(slide, MARGIN, gold_y, 3000000, thickness=3, color=t.accent)
    add_textbox(slide, name.upper(), MARGIN, 1800000, 8000000, 400000,
                font_size=FONT_CAPTION, bold=True, color=t.accent)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                MARGIN, 2200000, 8500000, 900000,
                font_size=FONT_COVER_TITLE, bold=True, color="#FFFFFF")
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                MARGIN, 3100000, 8000000, 500000,
                font_size=FONT_SUBTITLE, color=tint(t.primary, 0.7))
    add_textbox(slide, c.get("cover_date", "February 2026  |  Confidential"),
                MARGIN, gold_y + 200000, 4000000, 350000,
                font_size=FONT_CAPTION, color=tint(t.primary, 0.5))
    add_line(slide, MARGIN - 180000, 1700000, MARGIN - 180000, gold_y + 500000,
             color=t.accent, width=1.5)


# ── Variant 2: MINIMAL — white bg, centered, lots of whitespace ───────

def _clean_centered(slide, t, name, c):
    add_background(slide, "#FFFFFF")
    rule_y1 = SLIDE_H // 2 - 1000000
    rule_y2 = SLIDE_H // 2 + 1200000
    add_line(slide, SLIDE_W // 4, rule_y1, SLIDE_W * 3 // 4, rule_y1,
             color=tint(t.secondary, 0.7), width=0.5)
    add_line(slide, SLIDE_W // 4, rule_y2, SLIDE_W * 3 // 4, rule_y2,
             color=tint(t.secondary, 0.7), width=0.5)
    add_textbox(slide, name, MARGIN, rule_y1 - 500000, SLIDE_W - 2 * MARGIN, 350000,
                font_size=11, color=t.secondary, alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                MARGIN + 500000, rule_y1 + 200000,
                SLIDE_W - 2 * MARGIN - 1000000, 900000,
                font_size=38, bold=True, color=t.primary, alignment=PP_ALIGN.CENTER)
    add_gold_accent_line(slide, SLIDE_W // 2 - 400000, rule_y1 + 1150000, 800000,
                         thickness=2, color=t.accent)
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                MARGIN + 1000000, rule_y1 + 1350000,
                SLIDE_W - 2 * MARGIN - 2000000, 400000,
                font_size=14, color=t.secondary, alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_date", "February 2026"),
                MARGIN, rule_y2 + 200000, SLIDE_W - 2 * MARGIN, 300000,
                font_size=10, color=tint(t.secondary, 0.5), alignment=PP_ALIGN.CENTER)


# ── Variant 3: BOLD — split color, left half primary bg ───────────────

def _split_color(slide, t, name, c):
    split_x = int(SLIDE_W * 0.42)
    add_rect(slide, 0, 0, split_x, SLIDE_H, fill_color=t.primary)
    add_rect(slide, split_x, 0, SLIDE_W - split_x, SLIDE_H, fill_color=t.light_bg)
    add_rect(slide, split_x - 30000, 0, 60000, SLIDE_H, fill_color=t.accent)
    add_textbox(slide, name.upper(), MARGIN, SLIDE_H // 2 - 1600000,
                split_x - 2 * MARGIN, 400000,
                font_size=FONT_CAPTION, bold=True, color=t.accent)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                split_x + MARGIN, SLIDE_H // 2 - 1200000,
                SLIDE_W - split_x - 2 * MARGIN, 1200000,
                font_size=FONT_COVER_TITLE, bold=True, color=t.primary)
    add_rect(slide, split_x + MARGIN, SLIDE_H // 2 + 200000,
             3000000, 80000, fill_color=t.accent)
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                split_x + MARGIN, SLIDE_H // 2 + 500000,
                SLIDE_W - split_x - 2 * MARGIN, 500000,
                font_size=16, color=t.secondary)
    add_textbox(slide, c.get("cover_date", "February 2026"),
                MARGIN, SLIDE_H - 1200000, split_x - 2 * MARGIN, 300000,
                font_size=11, color=tint(t.primary, 0.5))


# ── Variant 4: ELEVATED — floating hero card on tinted bg ─────────────

def _hero_card(slide, t, name, c):
    add_background(slide, t.light_bg)
    add_circle(slide, SLIDE_W - 800000, 600000, 1200000,
               fill_color=tint(t.accent, 0.85))
    card_left = MARGIN + 400000
    card_top = SLIDE_H // 2 - 1800000
    card_w = SLIDE_W - 2 * MARGIN - 800000
    card_h = 3600000
    add_rect(slide, card_left + 60000, card_top + 60000, card_w, card_h,
             fill_color=shade(t.light_bg, 0.12), corner_radius=160000)
    add_rect(slide, card_left, card_top, card_w, card_h,
             fill_color="#FFFFFF", corner_radius=160000)
    add_rect(slide, card_left, card_top, card_w, 80000, fill_color=t.accent)
    add_textbox(slide, name.upper(), card_left + 300000, card_top + 300000,
                card_w - 600000, 350000,
                font_size=FONT_CAPTION, bold=True, color=t.accent, alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                card_left + 300000, card_top + 750000, card_w - 600000, 1000000,
                font_size=40, bold=True, color=t.primary, alignment=PP_ALIGN.CENTER)
    add_gold_accent_line(slide, SLIDE_W // 2 - 600000, card_top + 1800000, 1200000,
                         thickness=2.5, color=t.accent)
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                card_left + 600000, card_top + 2050000, card_w - 1200000, 500000,
                font_size=15, color=t.secondary, alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_date", "February 2026"),
                card_left + 300000, card_top + card_h - 500000, card_w - 600000, 300000,
                font_size=10, color=tint(t.secondary, 0.5), alignment=PP_ALIGN.CENTER)


# ── Variant 5: DARK — grid pattern bg, centered neon accent ───────────

def _dark_grid(slide, t, name, c):
    add_background(slide, t.primary)
    grid_spacing = 600000
    grid_color = tint(t.primary, 0.12)
    for x in range(0, SLIDE_W, grid_spacing):
        add_line(slide, x, 0, x, SLIDE_H, color=grid_color, width=0.25)
    for y in range(0, SLIDE_H, grid_spacing):
        add_line(slide, 0, y, SLIDE_W, y, color=grid_color, width=0.25)
    add_textbox(slide, name.upper(), MARGIN, 1200000, SLIDE_W - 2 * MARGIN, 400000,
                font_size=11, bold=True, color=t.accent, alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_title", "Presentation Title").upper(),
                MARGIN, 1800000, SLIDE_W - 2 * MARGIN, 1200000,
                font_size=FONT_COVER_TITLE, bold=True, color="#FFFFFF", alignment=PP_ALIGN.CENTER)
    add_gold_accent_line(slide, SLIDE_W // 2 - 1500000, 3200000, 3000000,
                         thickness=3, color=t.accent)
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                MARGIN + 1500000, 3500000, SLIDE_W - 2 * MARGIN - 3000000, 500000,
                font_size=14, color=tint(t.primary, 0.5), alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_date", "February 2026"),
                MARGIN, SLIDE_H - 1200000, SLIDE_W - 2 * MARGIN, 300000,
                font_size=10, color=tint(t.primary, 0.4), alignment=PP_ALIGN.CENTER)
    sz = 200000
    add_rect(slide, MARGIN, MARGIN, sz, 4, fill_color=t.accent)
    add_rect(slide, MARGIN, MARGIN, 4, sz, fill_color=t.accent)
    add_rect(slide, SLIDE_W - MARGIN - sz, SLIDE_H - MARGIN - 4, sz, 4, fill_color=t.accent)
    add_rect(slide, SLIDE_W - MARGIN - 4, SLIDE_H - MARGIN - sz, 4, sz, fill_color=t.accent)


# ── Variant 6: SPLIT — dramatic left/right split ──────────────────────

def _split_dramatic(slide, t, name, c):
    add_rect(slide, 0, 0, int(SLIDE_W * 0.65), SLIDE_H, fill_color=t.primary)
    add_rect(slide, int(SLIDE_W * 0.55), 0, int(SLIDE_W * 0.45), SLIDE_H,
             fill_color=t.light_bg)
    add_rect(slide, int(SLIDE_W * 0.57), 0, 80000, SLIDE_H, fill_color=t.accent)
    add_textbox(slide, name.upper(), MARGIN, 1200000, int(SLIDE_W * 0.5), 400000,
                font_size=FONT_CAPTION, bold=True, color=t.accent)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                MARGIN, 1700000, int(SLIDE_W * 0.5), 1200000,
                font_size=40, bold=True, color="#FFFFFF")
    add_gold_accent_line(slide, MARGIN, 3000000, 2500000, thickness=2.5, color=t.accent)
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                MARGIN, 3300000, int(SLIDE_W * 0.48), 500000,
                font_size=15, color=tint(t.primary, 0.6))
    rx = int(SLIDE_W * 0.75)
    add_circle(slide, rx, SLIDE_H // 2, 400000, fill_color=tint(t.accent, 0.85))
    add_circle(slide, rx + 500000, SLIDE_H // 2 - 600000, 250000,
               fill_color=tint(t.palette[0], 0.85))
    add_textbox(slide, c.get("cover_date", "February 2026"),
                int(SLIDE_W * 0.62), SLIDE_H - 1000000, int(SLIDE_W * 0.3), 300000,
                font_size=10, color=t.secondary, alignment=PP_ALIGN.CENTER)


# ── Variant 7: GEO — angular shapes, geometric patterns ───────────────

def _angular(slide, t, name, c):
    add_background(slide, t.primary)
    add_triangle(slide, SLIDE_W - 4000000, 0, 4000000, SLIDE_H,
                 fill_color=shade(t.primary, 0.1))
    add_triangle(slide, 0, SLIDE_H - 2000000, 3000000, 2000000,
                 fill_color=shade(t.primary, 0.08))
    add_hexagon(slide, SLIDE_W - 1500000, 1500000, 400000,
                fill_color=tint(t.accent, 0.3))
    add_hexagon(slide, SLIDE_W - 2200000, 2500000, 250000,
                fill_color=tint(t.accent, 0.2))
    add_diamond(slide, MARGIN + 100000, 1800000, 80000, fill_color=t.accent)
    add_textbox(slide, name.upper(), MARGIN + 350000, 1700000, 6000000, 300000,
                font_size=FONT_CAPTION, bold=True, color=t.accent)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                MARGIN, 2100000, 8000000, 1000000,
                font_size=FONT_COVER_TITLE, bold=True, color="#FFFFFF")
    add_rect(slide, MARGIN, 3200000, 2500000, 60000, fill_color=t.accent)
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                MARGIN, 3500000, 7000000, 400000,
                font_size=FONT_SUBTITLE, color=tint(t.primary, 0.6))
    add_textbox(slide, c.get("cover_date", "February 2026"),
                MARGIN, SLIDE_H - 1200000, 4000000, 300000,
                font_size=FONT_CAPTION, color=tint(t.primary, 0.4))


# ── Variant 8: EDITORIAL — asymmetric, image area, elegant ────────────

def _editorial_asymmetric(slide, t, name, c):
    add_background(slide, "#FFFFFF")
    img_w = int(SLIDE_W * 0.42)
    img_left = SLIDE_W - img_w
    add_image_placeholder(slide, img_left, 0, img_w, SLIDE_H,
                          label="Cover Image", bg_color=t.light_bg)
    content_w = img_left - MARGIN * 2
    add_line(slide, MARGIN, 1200000, MARGIN + 500000, 1200000,
             color=t.accent, width=1.5)
    add_textbox(slide, name, MARGIN, 1400000, content_w, 350000,
                font_size=11, color=t.secondary)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                MARGIN, 1900000, content_w, 1200000,
                font_size=36, bold=True, color=t.primary)
    add_line(slide, MARGIN, 3200000, MARGIN + 2000000, 3200000,
             color=tint(t.secondary, 0.7), width=0.5)
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                MARGIN, 3400000, content_w, 500000,
                font_size=14, color=t.secondary)
    add_textbox(slide, c.get("cover_date", "February 2026"),
                MARGIN, SLIDE_H - 1200000, content_w, 300000,
                font_size=10, color=tint(t.secondary, 0.5))


# ── Variant 9: GRADIENT — sweep from dark to light, elegant centered ──

def _gradient_sweep(slide, t, name, c):
    band_h = SLIDE_H // 5
    for i in range(5):
        color = tint(t.primary, i * 0.04)
        add_rect(slide, 0, i * band_h, SLIDE_W, band_h + 1, fill_color=color)
    add_circle(slide, SLIDE_W // 2, SLIDE_H // 2, 2500000,
               fill_color=tint(t.accent, 0.08))
    add_textbox(slide, name, MARGIN, 1500000, SLIDE_W - 2 * MARGIN, 350000,
                font_size=12, color=tint(t.accent, 0.6), alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                MARGIN + 800000, 2000000, SLIDE_W - 2 * MARGIN - 1600000, 1000000,
                font_size=42, bold=True, color="#FFFFFF", alignment=PP_ALIGN.CENTER)
    add_gold_accent_line(slide, SLIDE_W // 2 - 800000, 3100000, 1600000,
                         thickness=1.5, color=t.accent)
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                MARGIN + 1500000, 3350000, SLIDE_W - 2 * MARGIN - 3000000, 500000,
                font_size=14, color=tint(t.primary, 0.55), alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_date", "February 2026"),
                MARGIN, SLIDE_H - 1100000, SLIDE_W - 2 * MARGIN, 300000,
                font_size=10, color=tint(t.primary, 0.4), alignment=PP_ALIGN.CENTER)


# ── Variant 10: RETRO — warm bg, centered badge/seal ──────────────────

def _retro_badge(slide, t, name, c):
    add_background(slide, t.light_bg)
    for row in range(4):
        for col in range(6):
            x = SLIDE_W - 2000000 + col * 200000
            y = 400000 + row * 200000
            add_circle(slide, x, y, 30000, fill_color=tint(t.accent, 0.7))
    cx, cy = SLIDE_W // 2, SLIDE_H // 2 - 200000
    add_circle(slide, cx, cy, 2200000, fill_color="#FFFFFF",
               line_color=t.accent, line_width=3)
    add_circle(slide, cx, cy, 1900000, fill_color="#FFFFFF",
               line_color=t.accent, line_width=1)
    add_textbox(slide, name.upper(), cx - 1500000, cy - 900000, 3000000, 400000,
                font_size=11, bold=True, color=t.accent, alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                cx - 1500000, cy - 500000, 3000000, 900000,
                font_size=28, bold=True, color=t.primary, alignment=PP_ALIGN.CENTER)
    add_gold_accent_line(slide, cx - 600000, cy + 450000, 1200000,
                         thickness=2, color=t.accent)
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                cx - 1400000, cy + 600000, 2800000, 400000,
                font_size=12, color=t.secondary, alignment=PP_ALIGN.CENTER)
    add_textbox(slide, c.get("cover_date", "February 2026"),
                MARGIN, SLIDE_H - 900000, SLIDE_W - 2 * MARGIN, 300000,
                font_size=10, color=tint(t.secondary, 0.5), alignment=PP_ALIGN.CENTER)


# ── Variant 11: MAGAZINE — full-bleed image with bold overlay ─────────

def _full_bleed_image(slide, t, name, c):
    add_image_placeholder(slide, 0, 0, SLIDE_W, SLIDE_H,
                          label="Full-Bleed Cover Image", bg_color=t.light_bg)
    overlay_top = int(SLIDE_H * 0.5)
    add_rect(slide, 0, overlay_top, SLIDE_W, SLIDE_H - overlay_top, fill_color=t.primary)
    add_rect(slide, 0, overlay_top, SLIDE_W, 50000, fill_color=t.accent)
    add_textbox(slide, name.upper(), MARGIN, overlay_top + 250000,
                SLIDE_W - 2 * MARGIN, 350000,
                font_size=11, bold=True, color=t.accent)
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                MARGIN, overlay_top + 650000, SLIDE_W - 2 * MARGIN, 900000,
                font_size=FONT_COVER_TITLE, bold=True, color="#FFFFFF")
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                MARGIN, overlay_top + 1600000, int(SLIDE_W * 0.6), 400000,
                font_size=14, color=tint(t.primary, 0.5))
    add_textbox(slide, c.get("cover_date", "February 2026"),
                SLIDE_W - MARGIN - 3000000, overlay_top + 1600000, 3000000, 300000,
                font_size=10, color=tint(t.primary, 0.4), alignment=PP_ALIGN.RIGHT)


# ── Variant 12: SCHOLARLY — white bg, thin rules, centered, academic ──

def _scholarly_centered(slide, t, name, c):
    add_background(slide, "#FAFAF7")
    cx = SLIDE_W // 2
    cy = SLIDE_H // 2

    # Institution name at top, small caps feel
    add_textbox(slide, name, MARGIN, 1000000, SLIDE_W - 2 * MARGIN, 350000,
                font_size=11, color=t.secondary, alignment=PP_ALIGN.CENTER)

    # Thin rule above title
    rule_w = int(SLIDE_W * 0.50)
    rule_left = (SLIDE_W - rule_w) // 2
    rule_y1 = cy - 1100000
    add_line(slide, rule_left, rule_y1, rule_left + rule_w, rule_y1,
             color=tint(t.secondary, 0.6), width=0.5)

    # Cover title — centered, large, elegant
    title_w = SLIDE_W - 2 * MARGIN - 1500000
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                (SLIDE_W - title_w) // 2, cy - 900000, title_w, 1000000,
                font_size=36, bold=True, color=t.primary, alignment=PP_ALIGN.CENTER)

    # Thin rule below title
    rule_y2 = cy + 300000
    add_line(slide, rule_left, rule_y2, rule_left + rule_w, rule_y2,
             color=tint(t.secondary, 0.6), width=0.5)

    # Subtitle below lower rule
    sub_w = SLIDE_W - 2 * MARGIN - 2000000
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                (SLIDE_W - sub_w) // 2, rule_y2 + 250000, sub_w, 400000,
                font_size=14, color=t.secondary, alignment=PP_ALIGN.CENTER)

    # Date at bottom, understated
    add_textbox(slide, c.get("cover_date", "February 2026"),
                MARGIN, SLIDE_H - 1100000, SLIDE_W - 2 * MARGIN, 300000,
                font_size=10, color=tint(t.secondary, 0.5), alignment=PP_ALIGN.CENTER)


# ── Variant 13: LABORATORY — dark bg, accent bar, grid dots, data feel ─

def _laboratory_dark(slide, t, name, c):
    add_background(slide, t.primary)

    # Thin accent bar across top
    add_rect(slide, 0, 0, SLIDE_W, 50000, fill_color=t.accent)

    # Grid dots in top-right corner (lab grid)
    dot_color = tint(t.primary, 0.15)
    for row in range(6):
        for col in range(6):
            x = SLIDE_W - 2000000 + col * 250000
            y = 300000 + row * 250000
            add_circle(slide, x, y, 20000, fill_color=dot_color)

    # Company name — small, accent-colored
    add_textbox(slide, name.upper(), MARGIN, 800000, 6000000, 350000,
                font_size=FONT_CAPTION, bold=True, color=t.accent)

    # Left accent border
    add_rect(slide, MARGIN - 100000, 800000, 40000, 2800000, fill_color=t.accent)

    # Title — large, white, left-aligned
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                MARGIN, 1200000, int(SLIDE_W * 0.65), 1200000,
                font_size=FONT_COVER_TITLE, bold=True, color="#FFFFFF")

    # Subtitle — muted, monospace-feel
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                MARGIN, 2500000, int(SLIDE_W * 0.60), 500000,
                font_size=14, color=tint(t.primary, 0.5))

    # Date line with accent dash prefix
    add_textbox(slide, c.get("cover_date", "February 2026"),
                MARGIN, 3200000, 4000000, 350000,
                font_size=FONT_CAPTION, color=tint(t.primary, 0.4))

    # Bottom accent bar
    add_rect(slide, 0, SLIDE_H - 50000, SLIDE_W, 50000, fill_color=t.accent)


# ── Variant 14: DASHBOARD — gradient header band, card feel, dense ─────

def _dashboard_header(slide, t, name, c):
    add_background(slide, "#FFFFFF")
    m = int(MARGIN * 0.85)

    # Accent gradient header band
    band_h = 900000
    band_steps = 4
    step_h = band_h // band_steps
    for i in range(band_steps):
        color = shade(t.accent, i * 0.06) if i > 0 else t.accent
        add_rect(slide, 0, i * step_h, SLIDE_W, step_h + 1, fill_color=color)

    # Company name inside header band
    add_textbox(slide, name.upper(), m, 200000, SLIDE_W - 2 * m, 350000,
                font_size=11, bold=True, color="#FFFFFF")

    # Navigation dots in header (dashboard feel)
    for i in range(4):
        dot_x = SLIDE_W - m - 600000 + i * 150000
        add_circle(slide, dot_x, 450000, 30000, fill_color=tint(t.accent, 0.5))
    # Active dot
    add_circle(slide, SLIDE_W - m - 600000, 450000, 30000, fill_color="#FFFFFF")

    # Title — large, dark text on white area below header
    title_w = SLIDE_W - 2 * m - 500000
    add_textbox(slide, c.get("cover_title", "Presentation Title"),
                m, band_h + 400000, title_w, 1200000,
                font_size=FONT_COVER_TITLE, bold=True, color=t.primary)

    # Accent underline below title
    add_rect(slide, m, band_h + 1700000, 2500000, 50000, fill_color=t.accent)

    # Subtitle
    add_textbox(slide, c.get("cover_subtitle", t.tagline),
                m, band_h + 1900000, title_w, 500000,
                font_size=FONT_SUBTITLE, color=t.secondary)

    # Shadow-like card for metadata at bottom
    card_top = SLIDE_H - 1500000
    card_w = int(SLIDE_W * 0.45)
    add_rect(slide, m + 15000, card_top + 15000, card_w, 700000,
             fill_color=tint(t.secondary, 0.85), corner_radius=60000)
    add_rect(slide, m, card_top, card_w, 700000,
             fill_color="#FFFFFF", corner_radius=60000,
             line_color=tint(t.secondary, 0.7), line_width=0.5)
    add_textbox(slide, c.get("cover_date", "February 2026  |  Confidential"),
                m + 200000, card_top + 200000, card_w - 400000, 350000,
                font_size=FONT_CAPTION, color=t.secondary)
