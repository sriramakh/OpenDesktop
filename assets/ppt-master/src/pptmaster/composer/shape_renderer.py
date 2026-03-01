"""Shape rendering — icons, separators, and background rectangles."""

from __future__ import annotations

from lxml import etree
from pptx.dml.color import RGBColor
from pptx.util import Pt, Emu

from pptmaster.assets.color_utils import hex_to_rgb
from pptmaster.models import DesignProfile, IconInfo


_NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
_NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
_NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def add_separator_line(
    slide,
    profile: DesignProfile,
    left: int | None = None,
    top: int | None = None,
    width: int | None = None,
    color: str = "",
) -> None:
    """Add a thin horizontal separator line to a slide."""
    sw = profile.slide_size.width
    sh = profile.slide_size.height

    if left is None:
        left = int(sw * 0.04)
    if top is None:
        top = int(sh * 0.18)
    if width is None:
        width = int(sw * 0.92)

    line_color = color or profile.colors.accent1
    r, g, b = hex_to_rgb(line_color)

    connector = slide.shapes.add_connector(
        1,  # MSO_CONNECTOR_TYPE.STRAIGHT
        Emu(left), Emu(top),
        Emu(left + width), Emu(top),
    )
    connector.line.color.rgb = RGBColor(r, g, b)
    connector.line.width = Pt(1.0)


def add_background_rect(
    slide,
    profile: DesignProfile,
    color: str = "",
    left: int = 0,
    top: int = 0,
    width: int | None = None,
    height: int | None = None,
) -> None:
    """Add a filled rectangle shape as a background element."""
    if width is None:
        width = profile.slide_size.width
    if height is None:
        height = profile.slide_size.height

    fill_color = color or profile.colors.accent1
    r, g, b = hex_to_rgb(fill_color)

    shape = slide.shapes.add_shape(
        1,  # MSO_SHAPE.RECTANGLE
        Emu(left), Emu(top), Emu(width), Emu(height),
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor(r, g, b)
    shape.line.fill.background()  # No outline

    # Send to back
    sp_tree = slide._element.find(f".//{{{_NS_P}}}cSld/{{{_NS_P}}}spTree")
    if sp_tree is not None:
        sp = shape._element
        sp_tree.remove(sp)
        # Insert after grpSpPr (index 1, since 0 is nvGrpSpPr)
        sp_tree.insert(2, sp)


def clone_icon(
    slide,
    icon: IconInfo,
    left: int,
    top: int,
    width: int | None = None,
    height: int | None = None,
    color: str = "",
) -> None:
    """Clone an icon's XML into a slide at the specified position.

    Serializes the icon's XML, adjusts position/size, optionally recolors,
    and appends to the slide's shape tree.
    """
    if not icon.xml_snippet:
        return

    xml = icon.xml_snippet
    if color:
        from pptmaster.assets.icon_manager import _recolor_xml
        xml = _recolor_xml(xml, color)

    try:
        elem = etree.fromstring(xml.encode("utf-8") if isinstance(xml, str) else xml)
    except etree.XMLSyntaxError:
        return

    # Adjust position
    xfrm = elem.find(f".//{{{_NS_A}}}xfrm")
    if xfrm is None:
        # Try in spPr
        sp_pr = elem.find(f"{{{_NS_A}}}spPr")
        if sp_pr is None:
            sp_pr = elem.find(f".//{{{_NS_A}}}grpSpPr")
        if sp_pr is not None:
            xfrm = sp_pr.find(f"{{{_NS_A}}}xfrm")

    if xfrm is not None:
        off = xfrm.find(f"{{{_NS_A}}}off")
        if off is not None:
            off.set("x", str(left))
            off.set("y", str(top))

        if width is not None and height is not None:
            ext = xfrm.find(f"{{{_NS_A}}}ext")
            if ext is not None:
                ext.set("cx", str(width))
                ext.set("cy", str(height))

    # Append to slide's shape tree
    sp_tree = slide._element.find(f".//{{{_NS_P}}}cSld/{{{_NS_P}}}spTree")
    if sp_tree is not None:
        sp_tree.append(elem)
