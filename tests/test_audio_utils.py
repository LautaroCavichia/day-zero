"""
tests/test_audio_utils.py — Tests for PCM audio helpers.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from audio_utils import (
    LIVE_API_INPUT_SAMPLE_RATE,
    LIVE_API_OUTPUT_SAMPLE_RATE,
    bytes_to_pcm16,
    pcm16_to_bytes,
)


def test_pcm16_roundtrip():
    samples = [0, 100, -100, 32767, -32768, 1000]
    data = pcm16_to_bytes(samples)
    recovered = bytes_to_pcm16(data)
    assert recovered == samples


def test_pcm16_to_bytes_length():
    """Each sample is 2 bytes."""
    samples = [0, 1, 2, 3, 4]
    data = pcm16_to_bytes(samples)
    assert len(data) == 10


def test_bytes_to_pcm16_truncates_odd_byte():
    """If data has an odd length, the last byte is dropped."""
    # 5 bytes → 2 full samples (4 bytes used)
    data = bytes([0, 0, 100, 0, 99])
    result = bytes_to_pcm16(data)
    assert len(result) == 2


def test_empty_roundtrip():
    assert pcm16_to_bytes([]) == b""
    assert bytes_to_pcm16(b"") == []


def test_sample_rates():
    """Verify the constants have the expected values from config defaults."""
    assert LIVE_API_INPUT_SAMPLE_RATE == 16000
    assert LIVE_API_OUTPUT_SAMPLE_RATE == 24000


def test_silence_is_zeros():
    """A buffer of zeros decodes to all-zero samples."""
    n = 8
    data = bytes(n * 2)
    samples = bytes_to_pcm16(data)
    assert all(s == 0 for s in samples)
