"""Stateful presentation session — holds gen_result and provides mutation methods."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class PresentationSession:
    """Wraps presentation state (selected_slides, sections, content) with mutation methods.

    The gen_result dict that _build_selective_pptx expects:
        {
            "selected_slides": [...],
            "sections": [{"title": ..., "subtitle": ..., "slides": [...]}, ...],
            "content": {...all content keys...},
        }
    """

    def __init__(
        self,
        gen_result: dict[str, Any],
        theme_key: str,
        company_name: str,
        topic: str,
        output_path: str | Path,
        provider: str = "openai",
    ):
        self.selected_slides: list[str] = list(gen_result["selected_slides"])
        self.sections: list[dict[str, Any]] = [
            {
                "title": s["title"],
                "subtitle": s.get("subtitle", ""),
                "slides": list(s.get("slides", [])),
            }
            for s in gen_result["sections"]
        ]
        self.content: dict[str, Any] = dict(gen_result.get("content", {}))
        self.theme_key = theme_key
        self.company_name = company_name
        self.topic = topic
        self.output_path = Path(output_path)
        self.provider = provider
        self._dirty = False  # True when unsaved changes exist

    # ── Read ──────────────────────────────────────────────────────────

    @property
    def gen_result(self) -> dict[str, Any]:
        """Return gen_result dict suitable for _build_selective_pptx."""
        return {
            "selected_slides": self.selected_slides,
            "sections": self.sections,
            "content": self.content,
        }

    def get_state(self) -> str:
        """Return a human-readable summary of the current presentation."""
        lines = [
            f"Topic: {self.topic}",
            f"Company: {self.company_name}",
            f"Theme: {self.theme_key}",
            f"Output: {self.output_path}",
            f"Content slides: {len(self.selected_slides)}",
            "",
        ]
        for i, sec in enumerate(self.sections):
            lines.append(f"Section {i + 1}: {sec['title']}")
            if sec.get("subtitle"):
                lines.append(f"  Subtitle: {sec['subtitle']}")
            for slide_type in sec.get("slides", []):
                lines.append(f"  • {slide_type}")
            lines.append("")
        return "\n".join(lines).rstrip()

    # ── Mutations ─────────────────────────────────────────────────────

    def add_slide(
        self,
        slide_type: str,
        after: str | None = None,
        section_title: str | None = None,
        instruction: str = "",
    ) -> str:
        """Add a slide. Generates content for it. Returns status message."""
        from pptmaster.builder.ai_builder import _BUILDER_MAP

        if slide_type not in _BUILDER_MAP:
            available = sorted(_BUILDER_MAP.keys())
            return (
                f"Unknown slide type '{slide_type}'. "
                f"Available: {available}"
            )

        if slide_type in self.selected_slides:
            return f"'{slide_type}' is already in the presentation."

        # Add to selected_slides list
        if after and after in self.selected_slides:
            idx = self.selected_slides.index(after)
            self.selected_slides.insert(idx + 1, slide_type)
        else:
            self.selected_slides.append(slide_type)

        # Add to the right section
        placed = False

        if section_title:
            for sec in self.sections:
                if sec["title"].lower() == section_title.lower():
                    slides = sec.setdefault("slides", [])
                    if after and after in slides:
                        slides.insert(slides.index(after) + 1, slide_type)
                    else:
                        slides.append(slide_type)
                    placed = True
                    break

        if not placed and after:
            for sec in self.sections:
                slides = sec.get("slides", [])
                if after in slides:
                    slides.insert(slides.index(after) + 1, slide_type)
                    placed = True
                    break

        if not placed:
            self.sections[-1].setdefault("slides", []).append(slide_type)

        # Generate content for the new slide
        self._generate_slide_content(slide_type, instruction)
        self._dirty = True
        return f"Added '{slide_type}' to the presentation."

    def remove_slide(self, slide_type: str) -> str:
        """Remove a slide type from the presentation."""
        if slide_type not in self.selected_slides:
            return f"'{slide_type}' is not in the presentation."

        self.selected_slides.remove(slide_type)
        for sec in self.sections:
            slides = sec.get("slides", [])
            if slide_type in slides:
                slides.remove(slide_type)

        self._dirty = True
        return f"Removed '{slide_type}' from the presentation."

    def move_slide(self, slide_type: str, after: str | None = None) -> str:
        """Move a slide after another slide, or to the front if after=None."""
        if slide_type not in self.selected_slides:
            return f"'{slide_type}' is not in the presentation."

        # Remove from current positions
        self.selected_slides.remove(slide_type)
        for sec in self.sections:
            slides = sec.get("slides", [])
            if slide_type in slides:
                slides.remove(slide_type)
                break

        # Reinsert
        if after and after in self.selected_slides:
            self.selected_slides.insert(
                self.selected_slides.index(after) + 1, slide_type
            )
            for sec in self.sections:
                slides = sec.get("slides", [])
                if after in slides:
                    slides.insert(slides.index(after) + 1, slide_type)
                    break
        else:
            self.selected_slides.insert(0, slide_type)
            if self.sections:
                self.sections[0].setdefault("slides", []).insert(0, slide_type)

        self._dirty = True
        return f"Moved '{slide_type}'."

    def update_content(self, slide_type: str, updates: dict[str, Any]) -> str:
        """Directly update specific content keys."""
        self.content.update(updates)
        self._dirty = True
        keys = list(updates.keys())
        return f"Updated content for '{slide_type}': {keys}"

    def regenerate_slide(self, slide_type: str, instruction: str = "") -> str:
        """Regenerate content for a slide via LLM."""
        if slide_type not in self.selected_slides:
            return f"'{slide_type}' is not in the presentation."
        self._generate_slide_content(slide_type, instruction)
        self._dirty = True
        return f"Regenerated content for '{slide_type}'."

    def set_theme(self, theme_key: str) -> str:
        """Change the visual theme."""
        from pptmaster.builder.themes import THEME_MAP

        if theme_key not in THEME_MAP:
            return (
                f"Unknown theme '{theme_key}'. "
                f"Available: {sorted(THEME_MAP.keys())}"
            )
        self.theme_key = theme_key
        self._dirty = True
        return f"Theme changed to '{theme_key}'."

    def rename_section(self, old_title: str, new_title: str) -> str:
        """Rename a section."""
        for sec in self.sections:
            if sec["title"].lower() == old_title.lower():
                sec["title"] = new_title
                self._dirty = True
                return f"Renamed section '{old_title}' → '{new_title}'."
        titles = [s["title"] for s in self.sections]
        return f"Section '{old_title}' not found. Sections: {titles}"

    def add_section(self, title: str, subtitle: str = "") -> str:
        """Add a new empty section."""
        self.sections.append({"title": title, "subtitle": subtitle, "slides": []})
        self._dirty = True
        return f"Added section '{title}'."

    # ── Build ─────────────────────────────────────────────────────────

    def rebuild(self) -> Path:
        """Build/rebuild the PPTX from current state. Returns output path."""
        from pptmaster.builder.ai_builder import _build_selective_pptx
        from pptmaster.builder.themes import get_theme

        theme = get_theme(self.theme_key)
        result_path = _build_selective_pptx(
            self.gen_result, theme, self.company_name, self.output_path
        )
        self._dirty = False
        return result_path

    # ── Internal ─────────────────────────────────────────────────────

    def _generate_slide_content(self, slide_type: str, instruction: str = "") -> None:
        """Generate content for one slide type via LLM and merge into self.content."""
        from pptmaster.content.builder_content_gen import SLIDE_CATALOG
        from pptmaster.content.llm_client import LLMClient

        if slide_type not in SLIDE_CATALOG:
            return  # No catalog entry — slide uses hardcoded defaults

        catalog_entry = SLIDE_CATALOG[slide_type]
        content_keys_str = json.dumps(catalog_entry["content_keys"], indent=2)

        section_context = ""
        for sec in self.sections:
            if slide_type in sec.get("slides", []):
                section_context = f"\nSection: {sec['title']}"
                break

        instruction_line = (
            f"\nSpecial instruction: {instruction}" if instruction else ""
        )

        user_prompt = (
            f"Generate content for a single '{slide_type}' slide.\n\n"
            f"Presentation topic: {self.topic}\n"
            f"Company: {self.company_name}"
            f"{section_context}"
            f"{instruction_line}\n\n"
            f"Slide type: {slide_type}\n"
            f"Description: {catalog_entry['description']}\n\n"
            f"Return a JSON object with exactly these keys:\n{content_keys_str}\n\n"
            "Rules:\n"
            "- Complete sentences only — never truncate with '…' or '...'\n"
            "- Content must relate specifically to the topic and company\n"
            "- Follow the format and length constraints for each key exactly"
        )

        system = (
            "You are a professional presentation content writer. "
            "Return ONLY a valid JSON object — no markdown fences, no explanation."
        )

        client = LLMClient(provider=self.provider)
        try:
            slide_content = client.generate_json(system, user_prompt, max_tokens=3000)
            self.content.update(slide_content)
        except Exception:
            pass  # Leave content unchanged — slide renders with defaults
