"""
core/slide_store.py — Disk-based slide image store.

Stores rendered slide PNGs on the filesystem under the project data directory
so that they survive server restarts.  Slides are never serialised into session
state (which would bloat every read/write with megabytes of base64 data).

Directory layout:
    data/slides/<session_id>/slide_<index:03d>_<tier>.png

Two resolution tiers:
    "analysis"  — lower-res (≈150 DPI) used for Gemini multimodal analysis
    "display"   — higher-res (≈220 DPI) served to the browser UI

Thread/async safety:
    All I/O is synchronous (fast local disk writes) and is expected to be
    called from asyncio executor threads via run_in_executor.  The store
    itself holds no mutable state — it is a pure namespace over the filesystem.
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Resolve relative to this file: backend/core/slide_store.py → project root / data / slides
_BASE_DIR: Path = Path(__file__).resolve().parents[2] / "data" / "slides"

ANALYSIS_DPI = 150  # Used for Gemini multimodal analysis (keeps token count low)
DISPLAY_DPI = 220  # Used for the browser slide viewer (higher visual fidelity)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _session_dir(session_id: str) -> Path:
    return _BASE_DIR / session_id


def _slide_path(session_id: str, index: int, tier: str) -> Path:
    """Return the canonical path for a slide PNG.

    Args:
        session_id: Session identifier string.
        index: 0-based slide index.
        tier: ``"analysis"`` or ``"display"``.
    """
    return _session_dir(session_id) / f"slide_{index:03d}_{tier}.png"


# ── Public API ────────────────────────────────────────────────────────────────


def save(session_id: str, index: int, png_bytes: bytes, tier: str = "display") -> Path:
    """Write *png_bytes* to disk and return the file path.

    Creates parent directories as needed.  Overwrites any existing file for
    the same ``(session_id, index, tier)`` combination.

    Args:
        session_id: Session identifier string.
        index: 0-based slide index.
        png_bytes: Raw PNG file content.
        tier: ``"analysis"`` or ``"display"``.

    Returns:
        The :class:`~pathlib.Path` where the file was written.
    """
    path = _slide_path(session_id, index, tier)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png_bytes)
    return path


def get(session_id: str, index: int, tier: str = "display") -> bytes | None:
    """Read and return the PNG bytes for a slide, or ``None`` if not found.

    Args:
        session_id: Session identifier string.
        index: 0-based slide index.
        tier: ``"analysis"`` or ``"display"``.
    """
    path = _slide_path(session_id, index, tier)
    if not path.exists():
        return None
    return path.read_bytes()


def exists(session_id: str, index: int, tier: str = "display") -> bool:
    """Return ``True`` if the slide file exists on disk."""
    return _slide_path(session_id, index, tier).exists()


def count(session_id: str, tier: str = "display") -> int:
    """Return the number of slide files saved for *session_id* at *tier*."""
    d = _session_dir(session_id)
    if not d.exists():
        return 0
    return sum(1 for f in d.iterdir() if f.name.endswith(f"_{tier}.png"))


def cleanup(session_id: str) -> None:
    """Delete all slide files for *session_id* from disk.

    Safe to call even if no files exist.
    """
    d = _session_dir(session_id)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)
        logger.info("SlideStore: cleaned up session=%s", session_id)


def cleanup_all() -> None:
    """Delete the entire slide cache directory (all sessions).

    Intended for testing / shutdown hooks only.
    """
    if _BASE_DIR.exists():
        shutil.rmtree(_BASE_DIR, ignore_errors=True)
        logger.info("SlideStore: cleaned up all sessions under %s", _BASE_DIR)
