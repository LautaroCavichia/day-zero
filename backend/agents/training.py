"""
agents/training.py — Post-interview Training Review via Gemini Flash

Analyzes the completed interview transcript against the pitch context and
deck critique, then generates per-turn annotations + ideal answers so the
founder can see exactly what they should have said.

Returns a structured TrainingReview that is stored in session state and
surfaced by the frontend Training Mode panel.
"""

from __future__ import annotations

import json
import logging

from backend.config import settings
from backend.core.llm_factory import get_provider
from backend import session_state as ss

logger = logging.getLogger(__name__)

# ── Prompt ─────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert startup pitch coach reviewing a recorded YC-style interview.

You will be given:
1. A full interview transcript (alternating Sam / Founder turns)
2. Structured pitch context extracted from the pitch
3. Optionally: a deck critique with known weaknesses

Your job: for each FOUNDER turn in the transcript, provide:
- A rating: "strong" (answer was clear, specific, compelling), 
  "weak" (answer was vague, incomplete, or missed the point),
  or "missed" (founder dodged or completely failed the question)
- A short annotation (1–2 sentences) explaining the rating
- An ideal_answer: What a top-performing founder would have said (2–4 sentences, specific, concrete)

Also provide:
- overall_summary: A 2–3 sentence summary of the founder's biggest patterns to improve
- top_improvements: A list of 3–5 specific actionable improvements

Return a JSON object in this exact format:
{
  "overall_summary": "<string>",
  "top_improvements": ["<string>", ...],
  "turns": [
    {
      "turn_index": <0-based index in full transcript array>,
      "speaker": "Founder",
      "text": "<exact founder text>",
      "question": "<the Sam question that prompted this answer, or null if opening>",
      "rating": "strong" | "weak" | "missed",
      "annotation": "<1-2 sentence coaching note>",
      "ideal_answer": "<what a strong founder would have said>"
    },
    ...
  ]
}

IMPORTANT:
- Only include FOUNDER turns in the turns array (skip Sam turns)
- Be specific and honest — founders learn from direct feedback
- ideal_answers should reference specifics from their actual pitch context
- Output ONLY the JSON object, no markdown"""


async def generate_training_review(
    session_id: str,
    api_key: str | None = None,
) -> dict:
    """
    Generate a training review for the completed interview.

    Reads transcript, pitch_context, and deck_critique from session state.
    Returns the structured review dict and stores it in session state.

    Args:
        session_id: The session to review.
        api_key: Optional API key override.

    Returns:
        The training review dict.

    Raises:
        ValueError: If session has no transcript to review.
    """
    state = await ss.default_store.require_state(session_id)

    transcript: list[dict] = state.get("live_transcript") or []
    if not transcript:
        raise ValueError("No interview transcript found — complete the live interview first.")

    pitch_context: dict = state.get("pitch_context") or {}
    deck_critique: dict | None = state.get("deck_critique")

    # ── Build context block ─────────────────────────────────────────────────
    context_parts = []

    # Pitch context summary
    if any(pitch_context.values()):
        pc_lines = [
            f"Company: {pitch_context.get('company_name', 'Unknown')}",
            f"One-liner: {pitch_context.get('one_liner', '')}",
            f"Problem: {pitch_context.get('problem', '')}",
            f"Solution: {pitch_context.get('solution', '')}",
            f"Target customer: {pitch_context.get('target_customer', '')}",
            f"Business model: {pitch_context.get('business_model', '')}",
            f"Traction: {pitch_context.get('traction', '')}",
            f"Team: {pitch_context.get('team', '')}",
            f"Ask: {pitch_context.get('ask', '')}",
            f"Stage: {pitch_context.get('stage', '')}",
        ]
        context_parts.append(
            "=== PITCH CONTEXT ===\n" + "\n".join(l for l in pc_lines if l.split(": ", 1)[-1])
        )

    # Deck critique summary (top issues + weaknesses only — don't bloat the prompt)
    if deck_critique:
        top_issues = deck_critique.get("top_issues") or []
        missing = deck_critique.get("missing_slides") or []
        if top_issues or missing:
            deck_lines = ["=== DECK WEAKNESSES ==="]
            if top_issues:
                deck_lines.append("Top issues: " + "; ".join(top_issues[:5]))
            if missing:
                deck_lines.append("Missing slides: " + ", ".join(missing[:5]))
            context_parts.append("\n".join(deck_lines))

    # Full transcript (indexed so we can reference turn_index)
    transcript_lines = ["=== INTERVIEW TRANSCRIPT ==="]
    for i, turn in enumerate(transcript):
        speaker = turn.get("speaker", "?")
        text = turn.get("text", "").strip()
        transcript_lines.append(f"[{i}] {speaker}: {text}")
    context_parts.append("\n".join(transcript_lines))

    full_prompt = _SYSTEM_PROMPT + "\n\n" + "\n\n".join(context_parts)

    # ── Call LLM ───────────────────────────────────────────────────────────
    provider = get_provider(api_key)
    try:
        raw = await provider.generate_json(
            model=settings.selected_flash_model,
            user_message=full_prompt,
        )
    except Exception as e:
        logger.error("Training review LLM call failed for session=%s: %s", session_id, e)
        raise

    # ── Validate and normalise ─────────────────────────────────────────────
    # Ensure required top-level fields exist
    if not isinstance(raw.get("turns"), list):
        raw["turns"] = []
    if not isinstance(raw.get("top_improvements"), list):
        raw["top_improvements"] = []
    raw.setdefault("overall_summary", "")

    # Clamp turn_index values and ensure ratings are valid
    valid_ratings = {"strong", "weak", "missed"}
    for turn in raw["turns"]:
        if turn.get("rating") not in valid_ratings:
            turn["rating"] = "weak"
        turn.setdefault("annotation", "")
        turn.setdefault("ideal_answer", "")
        turn.setdefault("question", None)

    # ── Persist to session state ───────────────────────────────────────────
    await ss.default_store.update(session_id, {"training_review": raw})
    logger.info(
        "Training review generated for session=%s: %d turns annotated",
        session_id,
        len(raw["turns"]),
    )

    return raw
