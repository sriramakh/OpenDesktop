"""Image handling — resize, crop, and format conversion for slide placement."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image


def resize_to_fit(
    image_path: str | Path,
    max_width: int,
    max_height: int,
    output_format: str = "PNG",
) -> io.BytesIO:
    """Resize an image to fit within max dimensions, preserving aspect ratio.

    Args:
        image_path: Path to the source image.
        max_width: Maximum width in pixels.
        max_height: Maximum height in pixels.
        output_format: Output format (PNG, JPEG).

    Returns:
        BytesIO buffer containing the resized image.
    """
    img = Image.open(image_path)

    # Convert RGBA to RGB for JPEG
    if output_format.upper() == "JPEG" and img.mode in ("RGBA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "RGBA":
            bg.paste(img, mask=img.split()[3])
        else:
            bg.paste(img)
        img = bg

    img.thumbnail((max_width, max_height), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format=output_format)
    buf.seek(0)
    return buf


def crop_to_ratio(
    image_path: str | Path,
    target_ratio: float,
    output_format: str = "PNG",
) -> io.BytesIO:
    """Crop an image to a target aspect ratio (width/height), centered.

    Args:
        image_path: Path to the source image.
        target_ratio: Desired width/height ratio.
        output_format: Output format.

    Returns:
        BytesIO buffer containing the cropped image.
    """
    img = Image.open(image_path)
    w, h = img.size
    current_ratio = w / h

    if current_ratio > target_ratio:
        # Too wide, crop sides
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    elif current_ratio < target_ratio:
        # Too tall, crop top/bottom
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))

    buf = io.BytesIO()
    img.save(buf, format=output_format)
    buf.seek(0)
    return buf


def emu_to_pixels(emu: int, dpi: int = 96) -> int:
    """Convert EMU (English Metric Units) to pixels at given DPI."""
    return int(emu / 914400 * dpi)


def pixels_to_emu(pixels: int, dpi: int = 96) -> int:
    """Convert pixels to EMU at given DPI."""
    return int(pixels * 914400 / dpi)
