"""
agents/coaching.py — Real-time pitch coaching via Gemini Flash

Called periodically during a live interview to surface actionable, concise
coaching tips based on the transcript captured so far.  Runs fast (single
Gemini Flash call with a strict token budget) so it doesn't slow the UI.
"""

from __future__ import annotations

import logging

from config import settings
from core.gemini_client import generate_json, get_client

logger = logging.getLogger(__name__)

_COACHING_PROMPT = """You are a real-time pitch coach listening to a live startup interview.
Based on the transcript so far, give ONE short, specific coaching tip for the founder.

Rules:
- Maximum 1 sentence (≤ 20 words)
- Be direct and actionable — not generic
- Focus on the MOST RECENT thing the founder said that needs improving
- If the founder is doing well, surface their next gap to address
- Examples:
  - "Name a specific customer you've talked to — not 'enterprise companies'."
  - "Back up that $5B TAM with a source when Sam asks."
  - "You said 'I think maybe' three times — commit to your answers."
  - "Good traction data — now be ready to explain why it will 10x."

Return ONLY a JSON object:
{ "tip": "<your single coaching tip>", "category": "<focus|specificity|confidence|energy|traction|market|team|ask>" }

If the transcript is too short to coach on, return: { "tip": null, "category": null }
Output ONLY the JSON object."""


async def get_coaching_tip(
    transcript: list[dict],
    api_key: str | None = None,
) -> str | None:
    """
    Analyze the live transcript and return a single coaching tip string,
    or None if not enough transcript exists yet.

    Args:
        transcript: List of { speaker, text, timestamp } dicts.
        api_key: Optional Gemini API key override.

    Returns:
        A short coaching tip string, or None.
    """
    # Only use founder turns, last 10 to keep it fast
    founder_turns = [
        t["text"] for t in transcript if t.get("speaker") == "Founder" and t.get("text")
    ][-10:]

    if len(founder_turns) < 2:
        return None  # Not enough to coach yet

    transcript_text = "\n".join(f"Founder: {t}" for t in founder_turns)

    try:
        client = get_client(api_key)
        raw = await generate_json(
            client=client,
            model=settings.gemini_flash_model,
            user_content=f"{_COACHING_PROMPT}\n\n---\nTRANSCRIPT (recent founder turns):\n{transcript_text}\n---",
        )
        tip = raw.get("tip")
        logger.debug("Coaching tip: category=%s tip=%s", raw.get("category"), tip)
        return tip
    except Exception as e:
        logger.warning("get_coaching_tip failed: %s", e)
        return None
