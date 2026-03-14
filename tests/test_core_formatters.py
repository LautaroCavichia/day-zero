"""
tests/test_core_formatters.py — Tests for pitch context formatters.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from backend.core.formatters import format_pitch_context, format_pitch_context_for_research

FULL_CONTEXT = {
    "company_name": "Acme AI",
    "one_liner": "AI that writes your emails",
    "problem": "Email is slow",
    "solution": "LLM drafting",
    "target_customer": "Knowledge workers",
    "business_model": "SaaS",
    "traction": "100 users",
    "team": "2 founders",
    "ask": "$500k",
    "stage": "MVP",
}


def test_format_full_context():
    result = format_pitch_context(FULL_CONTEXT)
    assert "Acme AI" in result
    assert "AI that writes your emails" in result
    assert "Email is slow" in result
    assert "SaaS" in result
    assert "Knowledge workers" in result


def test_format_skips_blank_fields():
    ctx = {"company_name": "Test", "one_liner": "", "problem": "Big problem"}
    result = format_pitch_context(ctx)
    assert "Test" in result
    assert "Big problem" in result
    # one_liner was blank — label should not appear
    assert "One-liner:" not in result


def test_format_include_all_shows_blank_fields():
    ctx = {"company_name": "Test", "one_liner": "", "problem": "Big problem"}
    result = format_pitch_context(ctx, include_all=True)
    assert "One-liner:" in result


def test_format_none_returns_empty():
    assert format_pitch_context(None) == ""


def test_format_empty_dict_returns_empty():
    assert format_pitch_context({}) == ""


def test_format_all_blank_returns_empty():
    ctx = dict.fromkeys(FULL_CONTEXT, "")
    assert format_pitch_context(ctx) == ""


def test_format_for_research_full():
    result = format_pitch_context_for_research(FULL_CONTEXT)
    assert "Acme AI" in result
    assert result != "No pitch context provided."


def test_format_for_research_empty():
    result = format_pitch_context_for_research({})
    assert result == "No pitch context provided."


def test_format_for_research_none():
    result = format_pitch_context_for_research(None)
    assert result == "No pitch context provided."


def test_field_labels_order():
    """Ensure company name appears before stage in output."""
    result = format_pitch_context(FULL_CONTEXT)
    company_pos = result.index("Acme AI")
    stage_pos = result.index("MVP")
    assert company_pos < stage_pos
