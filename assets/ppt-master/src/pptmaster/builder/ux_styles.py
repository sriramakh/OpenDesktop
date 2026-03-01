"""UX Style definitions — 11 unique visual styles for template generation.

Each style controls card appearance, layout parameters, typography treatment,
and variant keys that dispatch to completely different slide layouts for
high-impact slides (cover, divider, KPI, process, timeline, quote, CTA, thank you).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class UXStyle:
    """Visual/UX parameters that make each template fundamentally unique."""

    name: str

    # ── Card appearance ────────────────────────────────────────────────
    card_radius: int = 80000          # EMU: 0=sharp, 80000=rounded, 200000=pill
    card_shadow: bool = True
    card_shadow_offset: int = 27432   # EMU: shadow offset (~0.03")
    card_accent: str = "top"          # "top", "left", "bottom", "full", "none"
    card_border: bool = False
    card_border_width: float = 0.75   # pt

    # ── Layout ─────────────────────────────────────────────────────────
    margin_factor: float = 1.0        # Multiplier for standard margins
    gap_factor: float = 1.0           # Multiplier for standard gaps

    # ── Title treatment ────────────────────────────────────────────────
    title_align: str = "left"         # "left" or "center"
    title_accent: bool = True         # Accent line under title
    title_accent_width: int = 1500000 # EMU: width of title accent line
    title_scale: float = 1.0          # Multiplier for title font size
    title_caps: bool = False          # Uppercase titles

    # ── Background mode ────────────────────────────────────────────────
    dark_mode: bool = False           # If True, ALL content slides get dark bg

    # ── High-impact slide variant keys ─────────────────────────────────
    cover: str = "geometric"
    divider: str = "centered"
    process: str = "chevron"
    timeline: str = "horizontal"
    quote: str = "decorative"
    cta: str = "dark-centered"
    thankyou: str = "card-grid"
    kpi: str = "cards-row"

    # ── New diagram variant keys ─────────────────────────────────────
    funnel: str = "stacked"
    pyramid: str = "layered"
    venn: str = "overlapping"
    hub_spoke: str = "radial"
    milestone: str = "arrow-path"
    kanban: str = "card-columns"
    matrix: str = "quadrant-grid"
    gauge: str = "arc-row"
    icon_grid: str = "card-icons"
    risk: str = "heatmap"


# ═══════════════════════════════════════════════════════════════════════
# 11 Unique UX Styles
# ═══════════════════════════════════════════════════════════════════════

CLASSIC = UXStyle(
    name="classic",
    # Cards: rounded, shadowed, top accent bar
    card_radius=80000, card_shadow=True, card_accent="top",
    # Layout: standard spacing
    # Title: left-aligned with gold accent line
    title_align="left", title_accent=True, title_accent_width=1500000,
    # Variants: default look
    cover="geometric", divider="centered", process="chevron",
    timeline="horizontal", quote="decorative", cta="dark-centered",
    thankyou="card-grid", kpi="cards-row",
    # New diagram variants
    funnel="stacked", pyramid="layered", venn="overlapping",
    hub_spoke="radial", milestone="arrow-path", kanban="card-columns",
    matrix="quadrant-grid", gauge="arc-row", icon_grid="card-icons",
    risk="heatmap",
)

MINIMAL = UXStyle(
    name="minimal",
    # Cards: sharp corners, no shadow, thin border, no accent bar
    card_radius=0, card_shadow=False, card_accent="none",
    card_border=True, card_border_width=0.5,
    # Layout: extra whitespace
    margin_factor=1.25, gap_factor=1.3,
    # Title: left, short thin accent
    title_align="left", title_accent=True, title_accent_width=600000,
    # Variants: Swiss design
    cover="clean-centered", divider="left-minimal", process="numbered-line",
    timeline="dot-line", quote="left-border", cta="white-centered",
    thankyou="minimal-list", kpi="stat-line",
    # New diagram variants
    funnel="outline", pyramid="numbered", venn="labeled-rings",
    hub_spoke="clean-lines", milestone="dot-timeline", kanban="list-minimal",
    matrix="labeled-grid", gauge="thin-arc", icon_grid="list-icons",
    risk="dot-matrix",
)

BOLD = UXStyle(
    name="bold",
    # Cards: sharp, no shadow, thick left accent bar
    card_radius=0, card_shadow=False, card_accent="left",
    card_border=False,
    # Title: centered, large, uppercase, wide accent
    title_align="center", title_accent=True, title_accent_width=3000000,
    title_scale=1.15, title_caps=True,
    # Variants: big and bold
    cover="split-color", divider="full-bleed", process="block-steps",
    timeline="bold-blocks", quote="full-bleed-color", cta="split-bold",
    thankyou="bold-centered", kpi="large-numbers",
    # New diagram variants
    funnel="bold-gradient", pyramid="block-pyramid", venn="bold-overlap",
    hub_spoke="pentagon-hub", milestone="block-arrows", kanban="bold-columns",
    matrix="color-blocks", gauge="bold-arc", icon_grid="bold-cards",
    risk="bold-heatmap",
)

ELEVATED = UXStyle(
    name="elevated",
    # Cards: very rounded (pill), heavy shadow, top accent
    card_radius=160000, card_shadow=True, card_shadow_offset=45720,
    card_accent="top", card_border=False,
    # Layout: slightly more spacious
    margin_factor=1.1, gap_factor=1.15,
    # Title: left with accent
    title_align="left", title_accent=True, title_accent_width=1200000,
    # Variants: Material-like floating
    cover="hero-card", divider="floating-card", process="floating-circles",
    timeline="cascading-cards", quote="elevated-card", cta="elevated-centered",
    thankyou="card-grid", kpi="elevated-cards",
    # New diagram variants
    funnel="floating-funnel", pyramid="floating-pyramid", venn="soft-overlap",
    hub_spoke="floating-hub", milestone="floating-path", kanban="floating-cards",
    matrix="floating-quad", gauge="floating-arc", icon_grid="floating-icons",
    risk="floating-heatmap",
)

DARK = UXStyle(
    name="dark",
    # Cards: subtle radius, no shadow, thin border
    card_radius=60000, card_shadow=False, card_accent="top",
    card_border=True, card_border_width=0.5,
    # Title: centered, uppercase
    title_align="center", title_accent=True, title_accent_width=2000000,
    title_caps=True,
    # ALL slides dark
    dark_mode=True,
    # Variants: dashboard/tech
    cover="dark-grid", divider="dark-accent", process="progress-bar",
    timeline="vertical-glow", quote="dark-card", cta="dark-centered",
    thankyou="dark-grid", kpi="dark-cards",
    # New diagram variants
    funnel="dark-funnel", pyramid="dark-pyramid", venn="glow-overlap",
    hub_spoke="dark-radial", milestone="glow-path", kanban="dark-board",
    matrix="dark-grid", gauge="glow-arc", icon_grid="dark-icons",
    risk="dark-heatmap",
)

SPLIT = UXStyle(
    name="split",
    # Cards: moderate radius, shadow, left accent
    card_radius=40000, card_shadow=True, card_accent="left",
    # Title: left with line accent
    title_align="left", title_accent=True, title_accent_width=1500000,
    # Variants: consistent split layouts
    cover="split-dramatic", divider="split-half", process="alternating-sides",
    timeline="zigzag", quote="split-quote", cta="split-bold",
    thankyou="split-contact", kpi="split-kpi",
    # New diagram variants
    funnel="split-funnel", pyramid="split-pyramid", venn="split-venn",
    hub_spoke="split-hub", milestone="alternating-milestone", kanban="split-board",
    matrix="split-quad", gauge="split-gauge", icon_grid="split-icons",
    risk="split-risk",
)

GEO = UXStyle(
    name="geo",
    # Cards: sharp, no shadow, thick border, bottom accent
    card_radius=0, card_shadow=False, card_accent="bottom",
    card_border=True, card_border_width=1.5,
    # Title: left with accent
    title_align="left", title_accent=True, title_accent_width=1000000,
    # Variants: angular/geometric
    cover="angular", divider="angled", process="hexagonal",
    timeline="diamond", quote="geometric-frame", cta="angular",
    thankyou="geo-grid", kpi="angular-cards",
    # New diagram variants
    funnel="angular-funnel", pyramid="angular-pyramid", venn="hex-overlap",
    hub_spoke="hex-hub", milestone="diamond-path", kanban="geo-board",
    matrix="angular-grid", gauge="angular-arc", icon_grid="hex-icons",
    risk="angular-heatmap",
)

EDITORIAL = UXStyle(
    name="editorial",
    # Cards: sharp, no shadow, subtle top accent
    card_radius=0, card_shadow=False, card_accent="top",
    card_border=False,
    # Layout: airy
    margin_factor=1.15, gap_factor=1.25,
    # Title: left, short accent, elegant
    title_align="left", title_accent=True, title_accent_width=500000,
    # Variants: magazine editorial
    cover="editorial-asymmetric", divider="editorial-spread",
    process="editorial-flow", timeline="editorial-vertical",
    quote="pullquote", cta="editorial-clean",
    thankyou="editorial-clean", kpi="editorial-stats",
    # New diagram variants
    funnel="editorial-funnel", pyramid="editorial-pyramid", venn="editorial-venn",
    hub_spoke="editorial-hub", milestone="editorial-path", kanban="editorial-board",
    matrix="editorial-grid", gauge="editorial-arc", icon_grid="editorial-icons",
    risk="editorial-heatmap",
)

GRADIENT = UXStyle(
    name="gradient",
    # Cards: very rounded, soft shadow, no accent bar
    card_radius=120000, card_shadow=True, card_shadow_offset=36576,
    card_accent="none", card_border=False,
    # Title: centered, slightly larger
    title_align="center", title_accent=True, title_accent_width=2000000,
    title_scale=1.1,
    # Variants: gradient/flowing
    cover="gradient-sweep", divider="gradient-band",
    process="gradient-circles", timeline="gradient-flow",
    quote="gradient-card", cta="gradient-full",
    thankyou="gradient-elegant", kpi="gradient-cards",
    # New diagram variants
    funnel="gradient-funnel", pyramid="gradient-pyramid", venn="gradient-venn",
    hub_spoke="gradient-hub", milestone="gradient-path", kanban="gradient-board",
    matrix="gradient-grid", gauge="gradient-arc", icon_grid="gradient-icons",
    risk="gradient-heatmap",
)

RETRO = UXStyle(
    name="retro",
    # Cards: rounded, shadow, thick decorative border
    card_radius=100000, card_shadow=True,
    card_accent="none", card_border=True, card_border_width=2.0,
    # Title: centered with accent
    title_align="center", title_accent=True, title_accent_width=1800000,
    # Variants: vintage/warm
    cover="retro-badge", divider="retro-ruled",
    process="retro-badges", timeline="retro-vertical",
    quote="retro-frame", cta="retro-centered",
    thankyou="retro-badge", kpi="retro-badges",
    # New diagram variants
    funnel="retro-funnel", pyramid="retro-pyramid", venn="retro-venn",
    hub_spoke="retro-hub", milestone="retro-path", kanban="retro-board",
    matrix="retro-grid", gauge="retro-arc", icon_grid="retro-icons",
    risk="retro-heatmap",
)

MAGAZINE = UXStyle(
    name="magazine",
    # Cards: sharp, no shadow, no border, no accent — content speaks
    card_radius=0, card_shadow=False, card_accent="none",
    card_border=False,
    # Layout: tighter for magazine feel
    margin_factor=0.9, gap_factor=0.85,
    # Title: left, oversized, no accent line
    title_align="left", title_accent=False, title_scale=1.25,
    # Variants: creative/cinematic
    cover="full-bleed-image", divider="oversized-number",
    process="creative-bubbles", timeline="mosaic",
    quote="cinematic-overlay", cta="creative-bold",
    thankyou="creative-bold", kpi="magazine-blocks",
    # New diagram variants
    funnel="creative-funnel", pyramid="creative-pyramid", venn="creative-venn",
    hub_spoke="creative-hub", milestone="mosaic-path", kanban="creative-board",
    matrix="creative-grid", gauge="creative-arc", icon_grid="creative-icons",
    risk="creative-heatmap",
)


# ═══════════════════════════════════════════════════════════════════════
# 3 New Differentiated UX Styles (academic, research, report)
# ═══════════════════════════════════════════════════════════════════════

SCHOLARLY = UXStyle(
    name="scholarly",
    # Cards: no shadow, thin horizontal rules as separators, no decorative accents
    card_radius=0, card_shadow=False, card_accent="none",
    card_border=True, card_border_width=0.5,
    # Layout: generous whitespace, serif spacing feel
    margin_factor=1.3, gap_factor=1.4,
    # Title: left, thin short accent, centered compositions
    title_align="left", title_accent=True, title_accent_width=400000,
    title_scale=0.95, title_caps=False,
    # Variants: academic/scholarly feel
    cover="scholarly-centered", divider="scholarly-ruled",
    process="scholarly-numbered", timeline="scholarly-timeline",
    quote="scholarly-citation", cta="scholarly-clean",
    thankyou="scholarly-formal", kpi="scholarly-stats",
    # New diagram variants — scholarly: thin rules, numbered, figure captions
    funnel="scholarly-funnel", pyramid="scholarly-pyramid", venn="scholarly-venn",
    hub_spoke="scholarly-hub", milestone="scholarly-path", kanban="scholarly-board",
    matrix="scholarly-grid", gauge="scholarly-arc", icon_grid="scholarly-icons",
    risk="scholarly-heatmap",
)

LABORATORY = UXStyle(
    name="laboratory",
    # Cards: subtle radius, no shadow, color-coded left border
    card_radius=30000, card_shadow=False, card_accent="left",
    card_border=True, card_border_width=0.75,
    # Layout: data-dense but organized
    margin_factor=1.0, gap_factor=0.95,
    # Title: left, medium accent, data-first
    title_align="left", title_accent=True, title_accent_width=800000,
    title_scale=1.0, title_caps=False,
    # Dark mode for lab/research feel
    dark_mode=True,
    # Variants: dark background, data-first, monospace elements
    cover="laboratory-dark", divider="laboratory-accent",
    process="laboratory-flow", timeline="laboratory-timeline",
    quote="laboratory-finding", cta="laboratory-clean",
    thankyou="laboratory-grid", kpi="laboratory-metrics",
    # New diagram variants — laboratory: grid overlays, evidence boxes, data-coded
    funnel="laboratory-funnel", pyramid="laboratory-pyramid", venn="laboratory-venn",
    hub_spoke="laboratory-hub", milestone="laboratory-path", kanban="laboratory-board",
    matrix="laboratory-grid", gauge="laboratory-arc", icon_grid="laboratory-icons",
    risk="laboratory-heatmap",
)

DASHBOARD = UXStyle(
    name="dashboard",
    # Cards: moderate radius, subtle shadow, no accent bar (clean tile look)
    card_radius=50000, card_shadow=True, card_shadow_offset=18288,
    card_accent="none", card_border=True, card_border_width=0.5,
    # Layout: dense, smaller margins for max data
    margin_factor=0.85, gap_factor=0.8,
    # Title: left, gradient header band feel
    title_align="left", title_accent=True, title_accent_width=600000,
    title_scale=0.9, title_caps=False,
    # Variants: dashboard-heavy, dense KPI tiles, sidebar feel
    cover="dashboard-header", divider="dashboard-tab",
    process="dashboard-steps", timeline="dashboard-timeline",
    quote="dashboard-callout", cta="dashboard-clean",
    thankyou="dashboard-summary", kpi="dashboard-tiles",
    # New diagram variants — dashboard: dense, metric tiles, gradient headers
    funnel="dashboard-funnel", pyramid="dashboard-pyramid", venn="dashboard-venn",
    hub_spoke="dashboard-hub", milestone="dashboard-path", kanban="dashboard-board",
    matrix="dashboard-grid", gauge="dashboard-arc", icon_grid="dashboard-icons",
    risk="dashboard-heatmap",
)


# ═══════════════════════════════════════════════════════════════════════
# Lookup
# ═══════════════════════════════════════════════════════════════════════

STYLE_MAP: dict[str, UXStyle] = {
    "classic": CLASSIC,
    "minimal": MINIMAL,
    "bold": BOLD,
    "elevated": ELEVATED,
    "dark": DARK,
    "split": SPLIT,
    "geo": GEO,
    "editorial": EDITORIAL,
    "gradient": GRADIENT,
    "retro": RETRO,
    "magazine": MAGAZINE,
    "scholarly": SCHOLARLY,
    "laboratory": LABORATORY,
    "dashboard": DASHBOARD,
}


def get_style(name: str = "classic") -> UXStyle:
    """Get a UX style by name. Falls back to CLASSIC."""
    return STYLE_MAP.get(name, CLASSIC)
