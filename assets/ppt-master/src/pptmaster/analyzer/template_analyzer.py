"""Template Analyzer — orchestrates full design DNA extraction.

Usage:
    profile = analyze("template.pptx")
    profile = analyze("template.potx", toolkit_path="toolkit/Icons.pptx")
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pptx import Presentation

from pptmaster.config import get_settings
from pptmaster.models import (
    DesignProfile,
    SlideSize,
    TextStyle,
)

from .icon_extractor import extract_icons
from .layout_extractor import extract_layouts
from .potx_handler import ensure_openable
from .shape_extractor import extract_shapes
from .theme_extractor import extract_theme


def analyze(
    template_path: str | Path,
    toolkit_path: str | Path | None = None,
    use_cache: bool = True,
) -> DesignProfile:
    """Analyze a PPTX/POTX template and return its DesignProfile.

    Args:
        template_path: Path to the template file (.pptx or .potx).
        toolkit_path: Optional path to a toolkit PPTX with icons.
        use_cache: If True, cache the profile as JSON.

    Returns:
        A DesignProfile containing the complete design DNA.
    """
    template_path = Path(template_path)
    settings = get_settings()
    settings.ensure_dirs()

    # Check cache
    cache_key = _cache_key(template_path, toolkit_path)
    cache_file = settings.profiles_dir / f"{cache_key}.json"
    if use_cache and cache_file.exists():
        data = json.loads(cache_file.read_text())
        return DesignProfile.model_validate(data)

    # 1. Extract theme (colors + fonts) from raw ZIP
    colors, fonts = extract_theme(template_path)

    # 2. Open with python-pptx (patching if .potx)
    openable = ensure_openable(template_path)
    prs = Presentation(openable)

    # 3. Get slide dimensions
    slide_size = SlideSize(
        width=prs.slide_width,
        height=prs.slide_height,
    )

    # 4. Extract and classify layouts
    layouts = extract_layouts(prs)

    # 5. Extract background shapes
    bg_shapes = extract_shapes(prs)

    # 6. Count sample slides
    num_sample_slides = len(prs.slides)

    # 7. Build text styles from fonts
    title_style = TextStyle(
        font_family=fonts.major,
        font_size_pt=48.0,
        bold=True,
        color=colors.dk2,
    )
    body_style = TextStyle(
        font_family=fonts.minor,
        font_size_pt=20.0,
        bold=False,
        color=colors.dk2,
    )

    # 8. Extract icons from toolkit
    icons = []
    if toolkit_path:
        icons = extract_icons(toolkit_path)

    profile = DesignProfile(
        template_name=template_path.stem,
        template_path=str(template_path),
        slide_size=slide_size,
        colors=colors,
        fonts=fonts,
        title_style=title_style,
        body_style=body_style,
        layouts=layouts,
        icons=icons,
        num_sample_slides=num_sample_slides,
        background_shapes=bg_shapes,
    )

    # Cache the profile
    if use_cache:
        cache_file.write_text(profile.model_dump_json(indent=2))

    return profile


def _cache_key(template_path: Path, toolkit_path: str | Path | None) -> str:
    """Generate a deterministic cache key from file paths and modification times."""
    parts = [str(template_path), str(template_path.stat().st_mtime)]
    if toolkit_path:
        tp = Path(toolkit_path)
        parts.extend([str(tp), str(tp.stat().st_mtime)])
    raw = "|".join(parts)
    return hashlib.md5(raw.encode()).hexdigest()
