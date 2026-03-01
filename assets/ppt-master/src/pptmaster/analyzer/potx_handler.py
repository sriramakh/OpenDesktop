"""Patch .potx files so python-pptx can open them.

python-pptx expects .pptx content-type but .potx uses a template content-type.
We patch [Content_Types].xml in-memory to swap the content-type.
"""

from __future__ import annotations

import io
import shutil
import zipfile
from pathlib import Path


_POTX_CT = "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml"
_PPTX_CT = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"


def patch_potx_to_pptx(potx_path: str | Path) -> io.BytesIO:
    """Read a .potx file and return an in-memory BytesIO with .pptx content-type.

    This allows python-pptx to open template files without error.
    """
    potx_path = Path(potx_path)
    buf = io.BytesIO()

    with zipfile.ZipFile(potx_path, "r") as zin, zipfile.ZipFile(buf, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "[Content_Types].xml":
                content = data.decode("utf-8")
                content = content.replace(_POTX_CT, _PPTX_CT)
                data = content.encode("utf-8")
            zout.writestr(item, data)

    buf.seek(0)
    return buf


def is_potx(path: str | Path) -> bool:
    """Check if a file is a .potx template."""
    return Path(path).suffix.lower() == ".potx"


def ensure_openable(path: str | Path) -> str | io.BytesIO:
    """Return the path if .pptx, or a patched BytesIO if .potx."""
    if is_potx(path):
        return patch_potx_to_pptx(path)
    return str(path)


def potx_to_pptx_file(potx_path: str | Path, output_path: str | Path) -> Path:
    """Convert a .potx to a .pptx file on disk."""
    output_path = Path(output_path)
    buf = patch_potx_to_pptx(potx_path)
    output_path.write_bytes(buf.getvalue())
    return output_path
