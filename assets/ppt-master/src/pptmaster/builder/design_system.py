"""Design system constants — colors, typography, grid helpers."""

from __future__ import annotations

# ── Slide Dimensions (16:9) ────────────────────────────────────────────
SLIDE_W = 12192000  # EMU
SLIDE_H = 6858000   # EMU

# ── Margins ────────────────────────────────────────────────────────────
MARGIN = 685800        # 0.75"
MARGIN_NARROW = 457200  # 0.5"
MARGIN_WIDE = 914400    # 1.0"

# ── Vertical reference points ──────────────────────────────────────────
TITLE_TOP = 274320          # 0.3" — slide title baseline
TITLE_HEIGHT = 548640       # 0.6"
CONTENT_TOP = 1371600       # 1.5" — content area starts
FOOTER_TOP = 6400800        # 7.0" — footer bar top
FOOTER_HEIGHT = 457200      # 0.5"

# ── Colors (60-30-10 rule) ─────────────────────────────────────────────
NAVY = "#1B2A4A"          # 60% — primary bg, dark text
GOLD = "#C8A951"          # 10% — accent, premium feel
SLATE = "#64748B"         # 30% — secondary text
WHITE = "#FFFFFF"
LIGHT_GRAY = "#F1F5F9"
DARK_GRAY = "#334155"

# Accent palette
ACCENT_BLUE = "#3B82F6"
ACCENT_RED = "#EF4444"
ACCENT_GREEN = "#10B981"
ACCENT_PURPLE = "#8B5CF6"
ACCENT_ORANGE = "#F59E0B"
ACCENT_TEAL = "#14B8A6"

# Tinted backgrounds (simulated transparency)
NAVY_TINT_95 = "#E8EAF0"   # Very light navy wash
NAVY_TINT_90 = "#D1D5E3"
GOLD_TINT_90 = "#F5F0DE"
GOLD_TINT_80 = "#EBE1BD"
GREEN_TINT = "#ECFDF5"
RED_TINT = "#FEF2F2"
BLUE_TINT = "#EFF6FF"
PURPLE_TINT = "#F5F3FF"

# ── Typography ─────────────────────────────────────────────────────────
FONT_FAMILY = "Inter"
FONT_FALLBACK = "Calibri"

# Size hierarchy (in points)
FONT_COVER_TITLE = 44
FONT_SECTION_TITLE = 40
FONT_SLIDE_TITLE = 28
FONT_SUBTITLE = 18
FONT_BODY = 16
FONT_CAPTION = 12
FONT_METRIC_VALUE = 48
FONT_CARD_HEADING = 18
FONT_SMALL = 10
FONT_SLIDE_NUMBER = 9


# ── Grid Helpers ───────────────────────────────────────────────────────

def col_span(n_cols: int, col_idx: int, gap: int = 228600) -> tuple[int, int]:
    """Return (left, width) for column col_idx in an n-column grid.

    Uses standard margins and equal-width columns with gaps between them.

    Args:
        n_cols: Total number of columns (1-6).
        col_idx: 0-based column index.
        gap: Gap between columns in EMU (default 0.25").

    Returns:
        (left_emu, width_emu) tuple.
    """
    total_content_w = SLIDE_W - 2 * MARGIN
    total_gap = gap * (n_cols - 1)
    col_w = (total_content_w - total_gap) // n_cols
    left = MARGIN + col_idx * (col_w + gap)
    return left, col_w


def card_positions(
    n_cols: int,
    n_rows: int,
    top: int = CONTENT_TOP,
    gap: int = 228600,
    card_height: int | None = None,
    row_gap: int | None = None,
) -> list[tuple[int, int, int, int]]:
    """Return list of (left, top, width, height) for a grid of cards.

    Args:
        n_cols: Number of columns.
        n_rows: Number of rows.
        top: Top of first row in EMU.
        gap: Gap between columns.
        card_height: Height per card. If None, auto-fills available space.
        row_gap: Gap between rows. Defaults to gap.

    Returns:
        List of (left, top, width, height) tuples, row-major order.
    """
    if row_gap is None:
        row_gap = gap

    available_h = FOOTER_TOP - top - MARGIN_NARROW
    if card_height is None:
        card_height = (available_h - row_gap * (n_rows - 1)) // n_rows

    positions = []
    for row in range(n_rows):
        for col in range(n_cols):
            left, width = col_span(n_cols, col, gap)
            y = top + row * (card_height + row_gap)
            positions.append((left, y, width, card_height))
    return positions


def content_width() -> int:
    """Full content area width (slide width minus both margins)."""
    return SLIDE_W - 2 * MARGIN


def content_area() -> tuple[int, int, int, int]:
    """Return (left, top, width, height) for the standard content area."""
    return MARGIN, CONTENT_TOP, content_width(), FOOTER_TOP - CONTENT_TOP - MARGIN_NARROW
