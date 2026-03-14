"""
core/formatters.py — Shared text formatters for pitch context.

Both the live_interview and market_validator agents need to convert
a pitch_context dict into a readable string.  This was duplicated
before; now there is one authoritative formatter.
"""

from __future__ import annotations

_FIELD_LABELS: list[tuple[str, str]] = [
    ("company_name", "Company"),
    ("one_liner", "One-liner"),
    ("problem", "Problem"),
    ("solution", "Solution"),
    ("target_customer", "Target customer"),
    ("business_model", "Business model"),
    ("traction", "Traction"),
    ("team", "Team"),
    ("ask", "Funding ask"),
    ("stage", "Stage"),
]


def format_pitch_context(ctx: dict | None, *, include_all: bool = False) -> str:
    """
    Convert a ``pitch_context`` dict to a human-readable multi-line string.

    Args:
        ctx: The pitch_context dict (may be None or empty).
        include_all: If True, include all fields even if empty.
                     If False (default), skip blank fields.

    Returns:
        A formatted string, or an empty string if no data is present.
    """
    if not ctx:
        return ""

    lines: list[str] = []
    for key, label in _FIELD_LABELS:
        value = ctx.get(key, "")
        if value or include_all:
            lines.append(f"{label}: {value}")

    return "\n".join(lines)


def format_pitch_context_for_research(ctx: dict | None) -> str:
    """
    Format pitch_context for the market validator prompt.
    Returns ``"No pitch context provided."`` if the context is empty.
    """
    text = format_pitch_context(ctx)
    return text if text else "No pitch context provided."
