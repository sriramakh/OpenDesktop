"""Generate ~150 professional flat PNG icons using GPT image API."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

# Icon categories and names
ICON_CATALOG: dict[str, list[str]] = {
    "business": [
        "briefcase", "handshake", "building", "presentation", "strategy",
        "target", "growth", "partnership", "meeting", "contract", "leadership", "innovation",
    ],
    "technology": [
        "computer", "cloud", "database", "network", "security-shield",
        "mobile", "code", "ai-brain", "server", "iot-device", "circuit", "robot",
    ],
    "finance": [
        "dollar", "chart-up", "wallet", "bank", "calculator",
        "invoice", "piggy-bank", "credit-card", "coins", "stock-market", "budget", "audit",
    ],
    "healthcare": [
        "heart", "stethoscope", "hospital", "pill", "microscope",
        "dna", "ambulance", "first-aid", "brain-health", "lungs", "blood-drop", "vaccine",
    ],
    "education": [
        "book", "graduation-cap", "pencil", "globe", "lightbulb",
        "chemistry", "atom", "telescope", "library", "certificate", "chalkboard", "backpack",
    ],
    "sustainability": [
        "leaf", "solar-panel", "wind-turbine", "recycle", "earth",
        "water-drop", "electric-car", "tree", "green-energy", "eco-house",
    ],
    "communication": [
        "email", "chat-bubble", "phone", "megaphone", "video-call",
        "satellite", "antenna", "social-media", "podcast", "newsletter",
    ],
    "people": [
        "person", "team", "community", "diversity", "family",
        "mentor", "volunteer", "customer", "employee", "speaker", "athlete", "scientist",
    ],
    "analytics": [
        "bar-chart", "pie-chart", "line-graph", "dashboard", "funnel",
        "gauge", "magnifying-glass", "data-flow", "statistics", "report", "heatmap", "scatter-plot",
    ],
    "logistics": [
        "truck", "warehouse", "shipping", "airplane", "train",
        "package", "supply-chain", "forklift", "container", "delivery",
    ],
    "security": [
        "lock", "key", "firewall", "eye", "fingerprint",
        "shield-check", "camera", "alarm", "vpn", "encryption",
    ],
    "creative": [
        "palette", "camera-creative", "music-note", "film", "brush",
        "pen-tool", "typography", "color-wheel", "design-grid", "sparkle",
    ],
    "real-estate": [
        "house", "apartment", "office-building", "crane", "blueprint",
        "floor-plan", "key-real-estate", "location-pin", "property-value", "construction",
    ],
}

ICON_STYLE_PROMPT = (
    "Flat filled icon, solid single-color fill (use {color}), no outline, no gradient, no shadow. "
    "Simple geometric shapes. Centered on transparent background. "
    "Professional icon style similar to Material Design icons. "
    "No text, no labels, no extra elements. "
    "Icon subject: {subject}"
)

# Colors per category — chosen to avoid clashing with common theme primaries.
# All are dark/saturated enough to be visible on white/light card backgrounds,
# and none match the common navy, blue, green, or teal theme primaries.
CATEGORY_COLORS = {
    "business": "#5B2C6F",     # plum — avoids navy corporate primary
    "technology": "#7C3AED",   # violet — contrasts with blue tech themes
    "finance": "#B45309",      # dark amber — contrasts with green finance themes
    "healthcare": "#BE185D",   # dark magenta — distinct from pink healthcare palettes
    "education": "#C2410C",    # burnt orange — avoids orange-on-orange
    "sustainability": "#4A1D8E",  # deep violet — avoids green-on-green clash
    "communication": "#9A3412",   # sienna — avoids cyan/teal clash
    "people": "#1A6847",       # forest green — contrasts with purple people
    "analytics": "#92400E",    # dark bronze — avoids blue analytics clash
    "logistics": "#78350F",    # dark brown — high contrast on white
    "security": "#991B1B",     # dark crimson — distinct from bright red
    "creative": "#6D28D9",     # purple — warm/creative feel, high contrast
    "real-estate": "#374151",  # slate gray — neutral, professional
}

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "icons"


def _get_client():
    """Get OpenAI client (lazy import)."""
    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError("openai package required. Install with: pip install openai")

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")

    return OpenAI(api_key=api_key)


def generate_single_icon(
    category: str,
    name: str,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    color: str = "#1B2A4A",
) -> Path:
    """Generate a single icon PNG using GPT image API.

    Returns path to the generated PNG file.
    """
    import base64

    client = _get_client()

    cat_dir = output_dir / category
    cat_dir.mkdir(parents=True, exist_ok=True)
    out_path = cat_dir / f"{name}.png"

    if out_path.exists():
        print(f"  [skip] {category}/{name}.png already exists")
        return out_path

    prompt = ICON_STYLE_PROMPT.format(color=color, subject=name.replace("-", " "))

    try:
        result = client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            n=1,
            size="1024x1024",
            quality="low",
        )

        # gpt-image-1 returns base64 data
        image_data = base64.b64decode(result.data[0].b64_json)
        out_path.write_bytes(image_data)
        print(f"  [done] {category}/{name}.png")
        return out_path
    except Exception as e:
        print(f"  [FAIL] {category}/{name}.png — {e}")
        return out_path


async def _async_generate_icon(
    sem: asyncio.Semaphore,
    category: str,
    name: str,
    output_dir: Path,
    color: str,
) -> Path:
    """Async wrapper with semaphore rate limiting."""
    async with sem:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, generate_single_icon, category, name, output_dir, color
        )


async def _async_generate_all(
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    concurrency: int = 5,
) -> list[Path]:
    """Generate all icons with async rate limiting."""
    sem = asyncio.Semaphore(concurrency)
    tasks = []

    for category, icons in ICON_CATALOG.items():
        color = CATEGORY_COLORS.get(category, "#1B2A4A")
        for name in icons:
            tasks.append(_async_generate_icon(sem, category, name, output_dir, color))

    return await asyncio.gather(*tasks)


def generate_all_icons(
    output_dir: Path | str = DEFAULT_OUTPUT_DIR,
    concurrency: int = 5,
) -> Path:
    """Generate all ~150 icons and create manifest.json.

    Args:
        output_dir: Base directory for icon output.
        concurrency: Max concurrent API calls.

    Returns:
        Path to manifest.json.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    total = sum(len(icons) for icons in ICON_CATALOG.values())
    print(f"Generating {total} icons across {len(ICON_CATALOG)} categories...")
    print(f"Output: {output_dir}")
    print(f"Concurrency: {concurrency}")
    print()

    # Run async generation
    asyncio.run(_async_generate_all(output_dir, concurrency))

    # Build manifest
    manifest: dict[str, Any] = {
        "version": "1.0",
        "total_icons": total,
        "categories": {},
    }

    for category, icons in ICON_CATALOG.items():
        cat_manifest = []
        for name in icons:
            path = output_dir / category / f"{name}.png"
            cat_manifest.append({
                "name": name,
                "file": f"{category}/{name}.png",
                "exists": path.exists(),
            })
        manifest["categories"][category] = cat_manifest

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\nManifest saved: {manifest_path}")

    # Count successful
    ok = sum(1 for cat in manifest["categories"].values() for ic in cat if ic["exists"])
    print(f"Successfully generated: {ok}/{total} icons")

    return manifest_path


def get_catalog() -> dict[str, list[str]]:
    """Return the icon catalog for reference."""
    return ICON_CATALOG.copy()
