"""
tests/test_core_errors.py — Tests for the custom error hierarchy.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from core.errors import (
    AgentError,
    ConfigError,
    DayZeroError,
    FileTooLargeError,
    GeminiResponseError,
    InvalidFileTypeError,
    PitchContextEmptyError,
    SessionNotFoundError,
    SessionStateError,
)


def test_base_error():
    err = DayZeroError("base message")
    assert str(err) == "base message"
    assert err.message == "base message"
    assert err.detail == "base message"


def test_base_error_with_detail():
    err = DayZeroError("short", detail="long description")
    assert err.message == "short"
    assert err.detail == "long description"


def test_session_not_found():
    err = SessionNotFoundError("abc-123")
    assert "abc-123" in str(err)
    assert err.session_id == "abc-123"
    assert isinstance(err, DayZeroError)


def test_config_error():
    err = ConfigError("key missing")
    assert isinstance(err, DayZeroError)
    assert "key missing" in err.message


def test_pitch_context_empty():
    err = PitchContextEmptyError("sess-99")
    assert err.session_id == "sess-99"
    assert "sess-99" in str(err)
    assert isinstance(err, DayZeroError)


def test_invalid_file_type():
    err = InvalidFileTypeError("deck.docx", {".pdf", ".pptx"})
    assert err.filename == "deck.docx"
    assert ".pdf" in err.allowed
    assert isinstance(err, DayZeroError)


def test_file_too_large():
    err = FileTooLargeError(60 * 1024 * 1024, 50 * 1024 * 1024)
    assert err.size_bytes > err.max_bytes
    assert isinstance(err, DayZeroError)


def test_gemini_response_error():
    err = GeminiResponseError("parse failed", raw_response="not json")
    assert err.raw_response == "not json"
    assert isinstance(err, AgentError)
    assert isinstance(err, DayZeroError)


def test_agent_error_inheritance():
    err = AgentError("agent blew up")
    assert isinstance(err, DayZeroError)


def test_session_state_error_inheritance():
    err = SessionStateError("bad state")
    assert isinstance(err, DayZeroError)


def test_repr():
    err = SessionNotFoundError("xyz")
    assert "SessionNotFoundError" in repr(err)
