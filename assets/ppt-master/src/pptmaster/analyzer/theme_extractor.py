"""Extract color scheme and font scheme from theme XML.

Parses ppt/theme/theme1.xml directly via lxml since python-pptx
doesn't expose all theme colors.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

from lxml import etree

from pptmaster.models import ColorScheme, FontScheme

# OOXML namespaces
_NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}

_NS_RELS = "http://schemas.openxmlformats.org/package/2006/relationships"

# Theme color slot names in document order
_COLOR_SLOTS = [
    "dk1", "lt1", "dk2", "lt2",
    "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
    "hlink", "folHlink",
]


def _read_theme_xml(pptx_path: str | Path) -> bytes:
    """Read the slide-master's theme XML from a PPTX/POTX ZIP.

    Finds the correct theme by following the slide master's relationships
    rather than picking the first theme file alphabetically.
    """
    path = Path(pptx_path)
    with zipfile.ZipFile(path, "r") as zf:
        # Find the theme referenced by slideMaster1 via its .rels file
        master_rels_path = "ppt/slideMasters/_rels/slideMaster1.xml.rels"
        if master_rels_path in zf.namelist():
            rels_data = zf.read(master_rels_path).decode("utf-8")
            m = re.search(r'Target="([^"]*theme[^"]+\.xml)"', rels_data)
            if m:
                target = m.group(1)
                # Resolve relative path (../theme/theme1.xml -> ppt/theme/theme1.xml)
                if target.startswith(".."):
                    theme_path = "ppt/" + target.lstrip("./")
                else:
                    theme_path = "ppt/slideMasters/" + target
                if theme_path in zf.namelist():
                    return zf.read(theme_path)

        # Fallback: try ppt/theme/theme1.xml directly
        if "ppt/theme/theme1.xml" in zf.namelist():
            return zf.read("ppt/theme/theme1.xml")

        # Last resort: first theme file found
        for name in sorted(zf.namelist()):
            if name.startswith("ppt/theme/theme") and name.endswith(".xml"):
                return zf.read(name)

    raise FileNotFoundError(f"No theme XML found in {pptx_path}")


def _extract_color(color_elem: etree._Element) -> str:
    """Extract hex color from a theme color element.

    Handles srgbClr, sysClr, and schemeClr elements.
    """
    # Direct sRGB color
    srgb = color_elem.find("a:srgbClr", _NS)
    if srgb is not None:
        return f"#{srgb.get('val', '000000')}"

    # System color (has lastClr attribute with actual value)
    sys_clr = color_elem.find("a:sysClr", _NS)
    if sys_clr is not None:
        return f"#{sys_clr.get('lastClr', sys_clr.get('val', '000000'))}"

    return "#000000"


def extract_colors(pptx_path: str | Path) -> ColorScheme:
    """Extract the 12-color scheme from the theme XML."""
    xml_bytes = _read_theme_xml(pptx_path)
    root = etree.fromstring(xml_bytes)

    # Navigate: a:theme > a:themeElements > a:clrScheme
    clr_scheme = root.find(".//a:clrScheme", _NS)
    if clr_scheme is None:
        raise ValueError("No color scheme found in theme XML")

    colors: dict[str, str] = {}
    for slot in _COLOR_SLOTS:
        elem = clr_scheme.find(f"a:{slot}", _NS)
        if elem is not None:
            colors[slot] = _extract_color(elem)
        else:
            colors[slot] = "#000000"

    return ColorScheme(**colors)


def extract_fonts(pptx_path: str | Path) -> FontScheme:
    """Extract the font scheme (major/minor) from the theme XML."""
    xml_bytes = _read_theme_xml(pptx_path)
    root = etree.fromstring(xml_bytes)

    font_scheme = root.find(".//a:fontScheme", _NS)
    if font_scheme is None:
        raise ValueError("No font scheme found in theme XML")

    major = ""
    minor = ""

    major_font = font_scheme.find("a:majorFont/a:latin", _NS)
    if major_font is not None:
        major = major_font.get("typeface", "")

    minor_font = font_scheme.find("a:minorFont/a:latin", _NS)
    if minor_font is not None:
        minor = minor_font.get("typeface", "")

    return FontScheme(major=major, minor=minor)


def extract_theme(pptx_path: str | Path) -> tuple[ColorScheme, FontScheme]:
    """Extract both color scheme and font scheme."""
    return extract_colors(pptx_path), extract_fonts(pptx_path)
