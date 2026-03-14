"""
core/llm_types.py — Provider-agnostic data types for LLM interactions.

All provider implementations accept and return these types so that agent
code never needs to import provider-specific SDKs directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


# ── Message types ──────────────────────────────────────────────────────────


@dataclass
class ImagePart:
    """A raw image to include in a multimodal message."""

    mime_type: str  # "image/png", "image/jpeg", etc.
    data: bytes


@dataclass
class MultimodalMessage:
    """A message that may contain both text and images."""

    role: Literal["user", "assistant"]
    text: str | None = None
    images: list[ImagePart] = field(default_factory=list)


# ── Audio types ────────────────────────────────────────────────────────────

# Raw PCM audio chunk (provider-agnostic).
AudioFrame = bytes
