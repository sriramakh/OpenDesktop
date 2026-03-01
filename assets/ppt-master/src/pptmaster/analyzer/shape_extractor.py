"""Extract non-placeholder shapes and background info from templates."""

from __future__ import annotations

from typing import Any

from lxml import etree
from pptx import Presentation


_NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
_NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
_NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def extract_shapes(prs: Presentation) -> list[dict[str, Any]]:
    """Extract notable non-placeholder shapes from slide master and layouts.

    Returns a list of shape descriptors with type, position, and styling info.
    """
    shapes: list[dict[str, Any]] = []

    for master in prs.slide_masters:
        master_elem = master._element

        # Extract shapes from the master's shape tree
        sp_tree = master_elem.find(f".//{{{_NS_P}}}cSld/{{{_NS_P}}}spTree")
        if sp_tree is None:
            sp_tree = master_elem.find(f".//{{{_NS_P}}}cSld")

        if sp_tree is not None:
            for sp in sp_tree.findall(f"{{{_NS_P}}}sp"):
                shape_info = _parse_shape(sp, "master")
                if shape_info:
                    shapes.append(shape_info)

            # Also look for group shapes
            for grp in sp_tree.findall(f"{{{_NS_P}}}grpSp"):
                shape_info = _parse_group_shape(grp, "master")
                if shape_info:
                    shapes.append(shape_info)

            # And pictures (logo etc.)
            for pic in sp_tree.findall(f"{{{_NS_P}}}pic"):
                shape_info = _parse_picture(pic, "master")
                if shape_info:
                    shapes.append(shape_info)

    return shapes


def _parse_shape(sp: etree._Element, source: str) -> dict[str, Any] | None:
    """Parse a shape element into a descriptor dict."""
    # Skip placeholder shapes
    nvPr = sp.find(f".//{{{_NS_P}}}nvPr")
    if nvPr is not None:
        ph = nvPr.find(f"{{{_NS_P}}}ph")
        if ph is not None:
            return None

    name_elem = sp.find(f".//{{{_NS_P}}}cNvPr")
    if name_elem is None:
        name_elem = sp.find(f".//{{{_NS_A}}}cNvPr")

    name = name_elem.get("name", "") if name_elem is not None else ""

    xfrm = sp.find(f".//{{{_NS_A}}}xfrm")
    pos = _parse_xfrm(xfrm) if xfrm is not None else {}

    # Detect fill type
    fill_type = "none"
    solid_fill = sp.find(f".//{{{_NS_A}}}solidFill")
    if solid_fill is not None:
        fill_type = "solid"

    return {
        "type": "shape",
        "source": source,
        "name": name,
        "fill_type": fill_type,
        **pos,
    }


def _parse_group_shape(grp: etree._Element, source: str) -> dict[str, Any] | None:
    """Parse a group shape."""
    name_elem = grp.find(f".//{{{_NS_P}}}cNvPr")
    name = name_elem.get("name", "") if name_elem is not None else ""

    child_count = len(grp.findall(f"{{{_NS_P}}}sp")) + len(grp.findall(f"{{{_NS_A}}}sp"))

    return {
        "type": "group",
        "source": source,
        "name": name,
        "child_count": child_count,
    }


def _parse_picture(pic: etree._Element, source: str) -> dict[str, Any] | None:
    """Parse a picture element (e.g., logo)."""
    name_elem = pic.find(f".//{{{_NS_P}}}cNvPr")
    if name_elem is None:
        name_elem = pic.find(f".//{{{_NS_A}}}cNvPr")
    name = name_elem.get("name", "") if name_elem is not None else ""

    xfrm = pic.find(f".//{{{_NS_A}}}xfrm")
    pos = _parse_xfrm(xfrm) if xfrm is not None else {}

    return {
        "type": "picture",
        "source": source,
        "name": name,
        **pos,
    }


def _parse_xfrm(xfrm: etree._Element) -> dict[str, int]:
    """Parse position and extent from an xfrm element."""
    result: dict[str, int] = {}
    off = xfrm.find(f"{{{_NS_A}}}off")
    if off is not None:
        result["left"] = int(off.get("x", 0))
        result["top"] = int(off.get("y", 0))
    ext = xfrm.find(f"{{{_NS_A}}}ext")
    if ext is not None:
        result["width"] = int(ext.get("cx", 0))
        result["height"] = int(ext.get("cy", 0))
    return result
