"""Color utility functions — hex/RGB conversion, tint, shade, contrast."""

from __future__ import annotations


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert hex color string to RGB tuple."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """Convert RGB values to hex color string."""
    return f"#{r:02X}{g:02X}{b:02X}"


def tint(hex_color: str, factor: float = 0.4) -> str:
    """Lighten a color by mixing with white. Factor 0-1 (0=original, 1=white)."""
    r, g, b = hex_to_rgb(hex_color)
    r = int(r + (255 - r) * factor)
    g = int(g + (255 - g) * factor)
    b = int(b + (255 - b) * factor)
    return rgb_to_hex(r, g, b)


def shade(hex_color: str, factor: float = 0.4) -> str:
    """Darken a color by mixing with black. Factor 0-1 (0=original, 1=black)."""
    r, g, b = hex_to_rgb(hex_color)
    r = int(r * (1 - factor))
    g = int(g * (1 - factor))
    b = int(b * (1 - factor))
    return rgb_to_hex(r, g, b)


def contrast_ratio(color1: str, color2: str) -> float:
    """Calculate WCAG contrast ratio between two colors."""
    l1 = _relative_luminance(color1)
    l2 = _relative_luminance(color2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def ensure_contrast(fg: str, bg: str, min_ratio: float = 4.5) -> str:
    """Adjust foreground color to meet minimum contrast against background."""
    if contrast_ratio(fg, bg) >= min_ratio:
        return fg

    bg_lum = _relative_luminance(bg)
    if bg_lum > 0.5:
        # Dark background? No — light background, darken the foreground
        for i in range(1, 10):
            darker = shade(fg, i * 0.1)
            if contrast_ratio(darker, bg) >= min_ratio:
                return darker
        return "#000000"
    else:
        for i in range(1, 10):
            lighter = tint(fg, i * 0.1)
            if contrast_ratio(lighter, bg) >= min_ratio:
                return lighter
        return "#FFFFFF"


def palette_from_accent(accent: str, n: int = 5) -> list[str]:
    """Generate a palette of n colors from a base accent color."""
    colors = [accent]
    for i in range(1, n):
        factor = i / n
        if i % 2 == 0:
            colors.append(shade(accent, factor * 0.5))
        else:
            colors.append(tint(accent, factor * 0.5))
    return colors


def _relative_luminance(hex_color: str) -> float:
    """Calculate relative luminance per WCAG 2.0."""
    r, g, b = hex_to_rgb(hex_color)
    rs = _srgb_to_linear(r / 255.0)
    gs = _srgb_to_linear(g / 255.0)
    bs = _srgb_to_linear(b / 255.0)
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs


def _srgb_to_linear(c: float) -> float:
    if c <= 0.03928:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4
