"""Icon Manager — index, search, and tint icons from the extracted catalog."""

from __future__ import annotations

import copy
import re

from lxml import etree

from pptmaster.models import IconInfo

_NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"


class IconManager:
    """Manages the icon catalog for search and retrieval."""

    def __init__(self, icons: list[IconInfo]):
        self._icons = icons
        self._by_category: dict[str, list[IconInfo]] = {}
        for icon in icons:
            self._by_category.setdefault(icon.category, []).append(icon)

    @property
    def categories(self) -> list[str]:
        return sorted(self._by_category.keys())

    @property
    def total_count(self) -> int:
        return len(self._icons)

    def search(self, query: str, limit: int = 10) -> list[IconInfo]:
        """Search icons by keyword matching against name, category, and keywords."""
        query_terms = set(re.split(r"\W+", query.lower()))
        query_terms.discard("")

        scored: list[tuple[float, IconInfo]] = []
        for icon in self._icons:
            score = _match_score(icon, query_terms)
            if score > 0:
                scored.append((score, icon))

        scored.sort(key=lambda x: -x[0])
        return [icon for _, icon in scored[:limit]]

    def get_by_category(self, category: str, limit: int = 50) -> list[IconInfo]:
        """Get icons from a specific category."""
        return self._by_category.get(category, [])[:limit]

    def get_icon_xml(self, icon: IconInfo, target_color: str = "") -> str:
        """Get the icon's XML, optionally recolored to target_color.

        Args:
            icon: The icon to retrieve.
            target_color: Hex color to tint the icon fills (e.g. "#61A150").

        Returns:
            XML string of the icon shape/group.
        """
        xml = icon.xml_snippet
        if not xml:
            return ""

        if target_color:
            xml = _recolor_xml(xml, target_color)

        return xml


# Map common icon keywords to toolkit category names
_KEYWORD_TO_CATEGORY = {
    "chart": "infographics",
    "graph": "infographics",
    "data": "infographics",
    "analytics": "infographics",
    "stats": "infographics",
    "money": "finance",
    "dollar": "finance",
    "currency": "finance",
    "bank": "finance",
    "payment": "finance",
    "invest": "finance",
    "wallet": "finance",
    "budget": "economy",
    "growth": "economy",
    "market": "economy",
    "shield": "technology",
    "security": "technology",
    "lock": "technology",
    "cloud": "technology",
    "server": "technology",
    "code": "technology",
    "computer": "technology",
    "phone": "technology",
    "device": "technology",
    "people": "teamwork",
    "team": "teamwork",
    "users": "teamwork",
    "group": "teamwork",
    "collaborate": "teamwork",
    "partner": "teamwork",
    "globe": "essential",
    "world": "essential",
    "earth": "essential",
    "target": "strategic",
    "goal": "strategic",
    "strategy": "strategic",
    "plan": "strategic",
    "vision": "strategic",
    "heart": "health",
    "medical": "health",
    "hospital": "health",
    "doctor": "health",
    "care": "health",
    "wellness": "health",
    "leaf": "essential",
    "nature": "essential",
    "green": "essential",
    "eco": "essential",
    "shop": "ecommerce",
    "cart": "ecommerce",
    "store": "ecommerce",
    "buy": "ecommerce",
    "retail": "ecommerce",
    "media": "media",
    "video": "media",
    "image": "media",
    "camera": "media",
}


def _match_score(icon: IconInfo, query_terms: set[str]) -> float:
    """Score an icon's relevance to query terms."""
    score = 0.0

    name_lower = icon.name.lower()
    cat_lower = icon.category.lower()

    for term in query_terms:
        if term in name_lower:
            score += 3.0
        if term in cat_lower:
            score += 2.0
        for kw in icon.keywords:
            if term in kw:
                score += 1.0
        # Check keyword-to-category mapping
        mapped_cat = _KEYWORD_TO_CATEGORY.get(term, "")
        if mapped_cat and mapped_cat == cat_lower:
            score += 2.0

    return score


def _recolor_xml(xml: str, target_color: str) -> str:
    """Recolor all solid fills in the XML to the target color."""
    color_val = target_color.lstrip("#")

    try:
        elem = etree.fromstring(xml.encode("utf-8") if isinstance(xml, str) else xml)
    except etree.XMLSyntaxError:
        return xml

    # Find all srgbClr elements and replace their val
    for srgb in elem.iter(f"{{{_NS_A}}}srgbClr"):
        srgb.set("val", color_val)

    # Also handle schemeClr by replacing with srgbClr
    for scheme_clr in elem.iter(f"{{{_NS_A}}}schemeClr"):
        parent = scheme_clr.getparent()
        if parent is not None:
            new_clr = etree.SubElement(parent, f"{{{_NS_A}}}srgbClr")
            new_clr.set("val", color_val)
            parent.remove(scheme_clr)

    return etree.tostring(elem, encoding="unicode")
