"""Shared helper to create a DesignProfile matching a builder theme."""

from __future__ import annotations

from pptmaster.builder.design_system import SLIDE_W, SLIDE_H
from pptmaster.models import DesignProfile, ColorScheme, FontScheme, SlideSize


def profile_from_theme(theme) -> DesignProfile:
    """Return a DesignProfile for use with existing chart/table renderers."""
    p = theme.palette
    # Use all 6 palette colors for accent slots — these are designed for
    # chart/data visualization and should be visually distinct from each other.
    # Avoids the old issue where accent1=primary, accent2=accent could duplicate
    # palette entries, giving pie/donut charts too few distinct colors.
    defaults = ["#3B82F6", "#10B981", "#EF4444", "#8B5CF6", "#F59E0B", "#14B8A6"]
    return DesignProfile(
        template_name=f"{theme.company_name} Template",
        template_path="",
        slide_size=SlideSize(width=SLIDE_W, height=SLIDE_H),
        colors=ColorScheme(
            dk1=theme.primary, lt1="#FFFFFF", dk2=theme.secondary, lt2=theme.light_bg,
            accent1=p[0] if len(p) > 0 else defaults[0],
            accent2=p[1] if len(p) > 1 else defaults[1],
            accent3=p[2] if len(p) > 2 else defaults[2],
            accent4=p[3] if len(p) > 3 else defaults[3],
            accent5=p[4] if len(p) > 4 else defaults[4],
            accent6=p[5] if len(p) > 5 else defaults[5],
            hlink=p[0] if p else defaults[0],
            folHlink=p[3] if len(p) > 3 else defaults[3],
        ),
        fonts=FontScheme(major=theme.font, minor=theme.font),
    )


def builder_profile() -> DesignProfile:
    """Backward-compatible: return default corporate theme profile."""
    from pptmaster.builder.themes import DEFAULT_THEME
    return profile_from_theme(DEFAULT_THEME)
