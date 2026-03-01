"""Core data models for PPT Master."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


# ── Design Profile Models ─────────────────────────────────────────────


class ColorScheme(BaseModel):
    """12 theme colors extracted from ppt/theme/theme1.xml."""

    dk1: str = Field(description="Dark 1 (typically black)")
    lt1: str = Field(description="Light 1 (typically white)")
    dk2: str = Field(description="Dark 2")
    lt2: str = Field(description="Light 2")
    accent1: str = Field(description="Accent 1 (primary brand color)")
    accent2: str = Field(description="Accent 2")
    accent3: str = Field(description="Accent 3")
    accent4: str = Field(description="Accent 4")
    accent5: str = Field(description="Accent 5")
    accent6: str = Field(description="Accent 6")
    hlink: str = Field(description="Hyperlink color")
    folHlink: str = Field(description="Followed hyperlink color")

    @property
    def accent_colors(self) -> list[str]:
        return [self.accent1, self.accent2, self.accent3,
                self.accent4, self.accent5, self.accent6]


class FontScheme(BaseModel):
    """Major (heading) and minor (body) fonts from theme."""

    major: str = Field(description="Heading font family (e.g. Bitter)")
    minor: str = Field(description="Body font family (e.g. Rubik)")
    major_bold: str = Field(default="", description="Bold variant name if different")
    minor_bold: str = Field(default="", description="Bold variant name if different")


class TextStyle(BaseModel):
    """Text formatting specification."""

    font_family: str = ""
    font_size_pt: float = 18.0
    bold: bool = False
    italic: bool = False
    color: str = ""
    alignment: str = "left"


class PlaceholderInfo(BaseModel):
    """A single placeholder within a slide layout."""

    idx: int = Field(description="Placeholder index")
    ph_type: str = Field(description="Placeholder type: title, body, pic, ftr, dt, sldNum, generic")
    name: str = ""
    left: int = Field(default=0, description="Left position in EMU")
    top: int = Field(default=0, description="Top position in EMU")
    width: int = Field(default=0, description="Width in EMU")
    height: int = Field(default=0, description="Height in EMU")
    is_vertical: bool = False


class LayoutInfo(BaseModel):
    """A slide layout with its classification and placeholders."""

    index: int = Field(description="0-based index in the template")
    name: str = Field(description="Human-readable layout name")
    content_category: str = Field(description="Classified category for matching")
    placeholders: list[PlaceholderInfo] = Field(default_factory=list)
    has_background_fill: bool = False
    background_color: str = ""

    @property
    def title_placeholders(self) -> list[PlaceholderInfo]:
        return [p for p in self.placeholders if p.ph_type == "title"]

    @property
    def body_placeholders(self) -> list[PlaceholderInfo]:
        return [p for p in self.placeholders if p.ph_type == "body"]

    @property
    def picture_placeholders(self) -> list[PlaceholderInfo]:
        return [p for p in self.placeholders if p.ph_type == "pic"]

    @property
    def content_placeholders(self) -> list[PlaceholderInfo]:
        return [p for p in self.placeholders if p.ph_type in ("body", "generic")]


class IconInfo(BaseModel):
    """An extracted icon from the toolkit."""

    name: str = Field(description="Icon identifier / label")
    source_slide: int = Field(description="Slide number in toolkit")
    shape_index: int = Field(description="Shape index on the slide")
    category: str = ""
    keywords: list[str] = Field(default_factory=list)
    xml_snippet: str = Field(default="", description="Serialized shape XML")
    width: int = 0
    height: int = 0


class SlideSize(BaseModel):
    """Presentation slide dimensions."""

    width: int = Field(description="Width in EMU")
    height: int = Field(description="Height in EMU")

    @property
    def width_inches(self) -> float:
        return self.width / 914400

    @property
    def height_inches(self) -> float:
        return self.height / 914400


class DesignProfile(BaseModel):
    """Complete design DNA extracted from a template."""

    template_name: str
    template_path: str
    slide_size: SlideSize
    colors: ColorScheme
    fonts: FontScheme
    title_style: TextStyle = Field(default_factory=TextStyle)
    body_style: TextStyle = Field(default_factory=TextStyle)
    layouts: list[LayoutInfo] = Field(default_factory=list)
    icons: list[IconInfo] = Field(default_factory=list)
    num_sample_slides: int = 0
    background_shapes: list[dict[str, Any]] = Field(default_factory=list)

    @property
    def layout_categories(self) -> dict[str, list[LayoutInfo]]:
        cats: dict[str, list[LayoutInfo]] = {}
        for layout in self.layouts:
            cats.setdefault(layout.content_category, []).append(layout)
        return cats


# ── Content Models ─────────────────────────────────────────────────────


class SlideType(str, Enum):
    """Types of slides the system can generate."""

    TITLE = "title"
    CONTENT_TEXT = "content_text"
    CONTENT_IMAGE_RIGHT = "content_image_right"
    CONTENT_IMAGE_LEFT = "content_image_left"
    TWO_COLUMN = "two_column"
    THREE_COLUMN = "three_column"
    FOUR_COLUMN = "four_column"
    KEY_METRICS = "key_metrics"
    CHART_BAR = "chart_bar"
    CHART_LINE = "chart_line"
    CHART_PIE = "chart_pie"
    CHART_DONUT = "chart_donut"
    TABLE = "table"
    TIMELINE = "timeline"
    PROFILE_GRID = "profile_grid"
    DIVIDER = "divider"
    FULL_IMAGE = "full_image"
    MISSION_VISION = "mission_vision"
    THANK_YOU = "thank_you"

    # Builder template types
    COVER = "cover"
    TABLE_OF_CONTENTS = "table_of_contents"
    SECTION_DIVIDER = "section_divider"
    COMPANY_OVERVIEW = "company_overview"
    VALUES = "values"
    KEY_FACTS = "key_facts"
    EXECUTIVE_SUMMARY = "executive_summary"
    KPI_DASHBOARD = "kpi_dashboard"
    PROCESS_LINEAR = "process_linear"
    PROCESS_CIRCULAR = "process_circular"
    ROADMAP = "roadmap"
    SWOT_MATRIX = "swot_matrix"
    COMPARISON = "comparison"
    HIGHLIGHT_QUOTE = "highlight_quote"
    INFOGRAPHIC_DASHBOARD = "infographic_dashboard"
    NEXT_STEPS = "next_steps"
    CALL_TO_ACTION = "call_to_action"


class ChartSpec(BaseModel):
    """Specification for a chart on a slide."""

    chart_type: str = Field(default="bar", description="bar, line, pie, donut, area")
    title: str = ""
    categories: list[str] = Field(default_factory=list)
    series: list[dict[str, Any]] = Field(default_factory=list,
        description="List of {name: str, values: list[float]}")
    show_legend: bool = True
    show_data_labels: bool = False


class TableSpec(BaseModel):
    """Specification for a table on a slide."""

    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    highlight_header: bool = True
    column_widths: list[float] = Field(default_factory=list,
        description="Relative column widths")


class MetricItem(BaseModel):
    """A single key metric (big number + label)."""

    value: str = Field(description="The number/value to display large")
    label: str = Field(description="Short description under the number")
    icon_keyword: str = ""
    color: str = ""


class ColumnContent(BaseModel):
    """Content for a single column in multi-column layouts."""

    heading: str = ""
    body: str = ""
    bullets: list[str] = Field(default_factory=list)
    image_prompt: str = ""
    icon_keyword: str = ""


class SlideContent(BaseModel):
    """Content for a single slide."""

    slide_type: SlideType
    title: str = Field(default="", description="Action title (sentence, not label)")
    subtitle: str = ""
    body: str = ""
    bullets: list[str] = Field(default_factory=list)
    columns: list[ColumnContent] = Field(default_factory=list)
    metrics: list[MetricItem] = Field(default_factory=list)
    chart: ChartSpec | None = None
    table: TableSpec | None = None
    image_prompt: str = Field(default="", description="Prompt to find/generate image")
    icon_keywords: list[str] = Field(default_factory=list)
    speaker_notes: str = ""
    layout_hint: str = Field(default="", description="Preferred layout name or category")

    @model_validator(mode="before")
    @classmethod
    def clean_empty_objects(cls, data: Any) -> Any:
        """Clean up empty chart/table objects that GPT sometimes returns."""
        if isinstance(data, dict):
            # Remove empty chart objects (no chart_type or no data)
            chart = data.get("chart")
            if isinstance(chart, dict):
                if not chart.get("chart_type") or not chart.get("categories"):
                    data["chart"] = None
            # Remove empty table objects
            table = data.get("table")
            if isinstance(table, dict):
                if not table.get("headers") and not table.get("rows"):
                    data["table"] = None
        return data


class PresentationOutline(BaseModel):
    """Complete presentation outline from the content engine."""

    title: str
    subtitle: str = ""
    author: str = ""
    date: str = ""
    target_audience: str = ""
    slides: list[SlideContent] = Field(default_factory=list)
    narrative_arc: str = Field(default="", description="Brief description of the story flow")
