"""
audio_utils.py — PCM audio helpers for the Live Interview pipeline.

Sample rate constants are driven by config.settings so they can be
overridden via environment variable if needed.
"""

from __future__ import annotations

import struct

from backend.config import settings


def pcm16_to_bytes(samples: list[int]) -> bytes:
    """Convert a list of 16-bit signed PCM samples to raw bytes."""
    return struct.pack(f"<{len(samples)}h", *samples)


def bytes_to_pcm16(data: bytes) -> list[int]:
    """Convert raw bytes to a list of 16-bit signed PCM samples."""
    count = len(data) // 2
    return list(struct.unpack(f"<{count}h", data[: count * 2]))


# Convenience aliases — consumed by live_interview.py
LIVE_API_INPUT_SAMPLE_RATE: int = settings.live_api_input_sample_rate
LIVE_API_OUTPUT_SAMPLE_RATE: int = settings.live_api_output_sample_rate
