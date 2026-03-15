"""
agents/live_interview.py — LiveInterviewAgent

Bridges the browser WebSocket ↔ the configured live audio provider.

Audio pipeline (Google branch):
  Browser (PCM 16kHz) → WS → GoogleProvider → Gemini Live
  Gemini Live → audio chunks (PCM 24kHz) → WS → Browser

Audio pipeline (OpenAI branch):
  Browser (PCM 16kHz) → WS → OpenAIProvider → OpenAI Realtime API
  OpenAI Realtime → audio chunks (PCM 24kHz) → WS → Browser

Text events emitted over the same WebSocket as JSON frames:
  { "type": "transcript_input",  "text": "...", "timestamp": 1.23 }
  { "type": "transcript_output", "text": "...", "timestamp": 1.23 }
  { "type": "turn_complete" }
  { "type": "interrupted" }
  { "type": "error", "message": "..." }

Audio frames emitted as raw bytes (no framing — client detects by content-type).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

import backend.session_state as ss
from backend.config import settings
from backend.core.formatters import format_pitch_context
from backend.core.llm_factory import get_provider
from backend.core.models import PitchContext
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# ── Sam's persona system prompt ────────────────────────────────────────────

SAM_SYSTEM_PROMPT = """You are Sam, a sharp YC partner conducting a real startup pitch interview.

CORE PERSONALITY:
- Direct, fast, intellectually curious — you cut through vague answers instantly
- Warm but demanding — you genuinely want founders to succeed, which is why you push hard
- You ask ONE focused question at a time, then listen
- You interrupt when something doesn't add up — don't wait politely
- You keep responses SHORT: 1-3 sentences max. This is a conversation, not a lecture
- You match the founder's energy and language — if they speak Spanish, reply in Spanish

CONVERSATION STYLE:
- Start immediately: "Hey, I'm Sam. Tell me what you're building — the problem you're solving."
- Never read back the founder's words to them
- Don't praise before probing — skip "great answer!" filler
- When an answer is weak or vague, interrupt: "Hold on — be more specific. Numbers?"
- When you get a strong answer, briefly acknowledge then immediately go deeper
- Natural speech: use contractions, short phrases, occasional "yeah", "right", "ok"
- Silence is fine — don't fill it

TOPICS TO COVER (in any natural order that fits the conversation flow):
1. PROBLEM — What pain point? Who feels it? How bad?
2. SOLUTION — How does it work? Why this approach?
3. CUSTOMER & TRACTION — Who are you selling to? Any paying customers? Revenue? Usage?
4. MARKET — How big? Why is now the right time?
5. TEAM — Why are YOU the team to build this? What's your unfair advantage?
6. ASK — How much are you raising? What does it unlock?

You don't have to follow this order rigidly — let the conversation breathe. But you MUST cover all 6 before ending.

INTERRUPTION & FOLLOW-UP RULES:
- If a number sounds round or made-up: "Where does that number come from exactly?"
- If they mention a competitor: "How are you different from [X]?"
- One follow-up per topic max — then move on. Don't over-interrogate one area.
- If they jump ahead to a later topic: acknowledge it, come back to current topic first

PACING — KEEP IT FAST:
- After a solid answer: one quick probe, then transition to next topic
- Don't wait for a perfect answer — if you've heard enough, move on
- The whole interview should feel like 8-10 minutes of sharp back-and-forth

DECK AWARENESS:
If a pitch deck was uploaded, you have access to all the slide content.
Verify claims in real-time — if the founder says something that contradicts the deck, call it out immediately:
"Wait — your deck says [X] but you just told me [Y]. Which is it?"

LANGUAGE RULE:
Respond in the same language the founder is speaking. If they switch languages mid-interview, switch with them.

ENDING THE INTERVIEW:
After you've covered all 6 topics, give a brief verbal summary:
State one strength, one concern, and your gut read on the startup.
Then say exactly: INTERVIEW_COMPLETE

Do NOT say INTERVIEW_COMPLETE until all 6 topics have been genuinely covered.
"""


def _build_deck_system_context(slide_metadata: list) -> str:
    """Build the deck-awareness section of SAM's system prompt.

    Injects all slide text so SAM can detect contradictions between what the
    founder says during the interview and what is written in their deck.

    This is CRITICAL: SAM must interrupt IMMEDIATELY at ANY discrepancy.

    Accepts slides in either format:
      - deck_critique.slides dicts: {index, title, content_text, ...}
      - legacy slide_metadata dicts: {index, title, extracted_text}
    """
    if not slide_metadata:
        return ""

    lines = [
        "\n\n" + "=" * 80,
        "🔴 PITCH DECK VERIFICATION PROTOCOL — NON-NEGOTIABLE",
        "=" * 80,
        "",
        "The founder has uploaded their pitch deck. You MUST verify EVERY factual claim",
        "they make against the deck content in REAL-TIME.",
        "",
        "BELOW IS THE COMPLETE DECK CONTENT:",
        "",
    ]

    for slide in slide_metadata:
        idx = slide.get("index", "?")
        title = slide.get("title", f"Slide {idx}")
        # Support both field names: content_text (from deck_critique) and extracted_text (legacy)
        text = (slide.get("content_text") or slide.get("extracted_text") or "").strip()
        lines.append(f"[SLIDE {idx}: {title}]")
        if text:
            lines.append(text)
        lines.append("")

    lines += [
        "=" * 80,
        "⚠️  YOUR JOB — MANDATORY DISCREPANCY DETECTION:",
        "=" * 80,
        "",
        "1. MEMORY: Above are ALL the slides. Memorize key facts: company name, numbers, claims.",
        "",
        "2. REAL-TIME VERIFICATION:",
        "   - As the founder speaks, IMMEDIATELY compare their words to the deck.",
        "   - EVERY number, company name, timeline, achievement, goal = verify.",
        "",
        "3. INTERRUPT ON ANY DISCREPANCY — NO EXCEPTIONS:",
        "   Examples (you MUST interrupt on these):",
        '   - Founder: "We raised $5M"  |  Deck says: "$2M"  →  INTERRUPT IMMEDIATELY',
        '   - Founder: "Our company is TechStart"  |  Deck says: "InnovateLabs"  →  INTERRUPT IMMEDIATELY',
        '   - Founder: "We have 100 customers"  |  Deck says: "10 customers"  →  INTERRUPT IMMEDIATELY',
        "",
        "4. HOW TO INTERRUPT:",
        "   Use a SHARP, direct phrase like:",
        '   "Hold on—you just said [X], but your deck says [Y]. What\'s going on?"',
        '   Or: "Wait, I see [Y] in your deck but you\'re telling me [X]. Clarify that."',
        "",
        "5. TONE:",
        "   - Be direct and firm (not rude).",
        "   - Treat discrepancies as red flags that need immediate resolution.",
        "   - Do NOT let ANY contradiction slide. ZERO tolerance.",
        "",
        "=" * 80,
        "START INTERVIEW NOW. STAY ALERT FOR DISCREPANCIES AT ALL TIMES.",
        "=" * 80,
    ]
    return "\n".join(lines)


async def run_live_interview(
    websocket: WebSocket,
    session_id: str,
    api_key: str | None = None,
    store: ss.SessionStore | None = None,
) -> None:
    """
    Main WebSocket handler for the live interview.

    Protocol:
      - Binary frames from client → PCM 16kHz audio to forward to Gemini
      - Text frames from client → JSON control messages:
          { "type": "end_stream" }   — graceful mic stop
          { "type": "ping" }         — keepalive
      - Binary frames to client → PCM 24kHz audio from provider
      - Text frames to client  → JSON transcript/event messages
    """
    _store = store or ss.default_store
    await websocket.accept()
    logger.info("LiveInterview WS opened: session=%s", session_id)

    await _store.update(session_id, {"live_interview_active": True})

    state = await _store.get_state(session_id)
    pitch_ctx = state.get("pitch_context", {}) if state else {}
    # Derive slide metadata from deck_critique (single source of truth)
    deck_critique = state.get("deck_critique") if state else None
    slide_metadata = []
    if deck_critique and isinstance(deck_critique, dict):
        slide_metadata = deck_critique.get("slides", [])
    pitch_summary = format_pitch_context(pitch_ctx)

    system_instruction = SAM_SYSTEM_PROMPT
    if pitch_summary:
        system_instruction += (
            f"\n\nAdditional context about this founder's pitch (use this to ask specific, "
            f"targeted questions — do NOT read it back verbatim):\n{pitch_summary}"
        )
    if slide_metadata:
        system_instruction += _build_deck_system_context(slide_metadata)
        logger.info(
            "LiveInterview: deck context injected for %d slides, session=%s",
            len(slide_metadata),
            session_id,
        )

    try:
        # Use Google provider DIRECTLY for live audio, regardless of LLM_PROVIDER setting
        from backend.providers.google_provider import GoogleProvider

        google_provider = GoogleProvider(api_key=settings.google_api_key)
        await google_provider.stream_live_audio(
            websocket=websocket,
            model=settings.gemini_live_model,
            system_instruction=system_instruction,
            session_id=session_id,
            store=_store,
            slide_metadata=slide_metadata,
        )
    except NotImplementedError as e:
        logger.warning("LiveInterview: provider does not support audio streaming: %s", e)
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    except Exception as e:
        logger.error("LiveInterview error: %s", e)
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        await _store.update(session_id, {"live_interview_active": False})
        logger.info("LiveInterview WS closed: session=%s", session_id)
        asyncio.create_task(_post_interview_pipeline(session_id, api_key, _store))
        try:
            await websocket.close()
        except Exception:
            pass


async def _send_loop(
    websocket: WebSocket,
    gemini_session,
    session_id: str,
) -> None:
    """Read audio/control frames from the browser and forward to Gemini.

    .. deprecated::
        This function is no longer called directly.  Audio bridging has moved
        into ``providers.google_provider.GoogleProvider._send_loop``.
        Kept for reference only.
    """


async def _receive_loop(  # noqa: E303
    websocket: WebSocket,
    gemini_session,
    session_id: str,
    store: ss.SessionStore,
) -> None:
    """Read responses from Gemini and forward audio + transcript to browser.

    .. deprecated::
        This function is no longer called directly.  Audio bridging has moved
        into ``providers.google_provider.GoogleProvider._receive_loop``.
        Kept for reference only.
    """


# ── Post-interview pipeline ────────────────────────────────────────────────

_TRANSCRIPT_EXTRACTOR_PROMPT = """You are an expert at extracting structured startup pitch information from interview transcripts.

Below is a live interview transcript between "Sam" (a YC partner) and "Founder".
Extract the startup's pitch context from the Founder's answers only.

Return ONLY a JSON object with these exact keys (use "" for missing fields):
{
  "company_name": "",
  "one_liner": "",
  "problem": "",
  "solution": "",
  "target_customer": "",
  "business_model": "",
  "traction": "",
  "team": "",
  "ask": "",
  "stage": ""
}

stage must be one of: "idea", "MVP", "seed", "series-a", "growth", "unknown".
Be generous — infer reasonable values from context. Output ONLY the JSON object."""


async def _post_interview_pipeline(
    session_id: str,
    api_key: str,
    store: ss.SessionStore,
) -> None:
    """
    Fired as a background task when the WebSocket closes.
    Sequentially:
      1. Extract pitch_context from the live transcript (if not already set)
      2. Score delivery
      3. Kick off market validation (fire-and-forget)
      4. Kick off deliberation (fire-and-forget, waits for pitch_context)
    """
    # Step 1: extract pitch_context from transcript
    await _extract_pitch_from_transcript(session_id, api_key, store)

    # Step 2: score delivery
    await _score_delivery(session_id, api_key, store)

    # Steps 3 & 4: fire market + deliberation in parallel (both background)
    asyncio.create_task(_trigger_market_bg(session_id, api_key, store))
    asyncio.create_task(_trigger_deliberation_bg(session_id, api_key, store))


async def _extract_pitch_from_transcript(
    session_id: str,
    api_key: str,
    store: ss.SessionStore,
) -> None:
    """
    Use Gemini to extract structured pitch_context from the live transcript.
    Only runs if pitch_context is not already populated (e.g. from /api/pitch).
    """
    try:
        state = await store.get_state(session_id)
        if not state:
            return

        # Don't overwrite if pitch was submitted via the typed form
        existing = state.get("pitch_context", {})
        if existing and any(existing.values()):
            logger.info("_extract_pitch_from_transcript: pitch_context already set, skipping")
            return

        transcript = state.get("live_transcript", [])
        if not transcript:
            logger.info("_extract_pitch_from_transcript: no transcript, skipping")
            return

        transcript_text = "\n".join(
            f"{t['speaker']}: {t['text']}" for t in transcript if t.get("text")
        )

        provider = get_provider(api_key)
        raw = await provider.generate_json(
            model=settings.selected_flash_model,
            user_message=f"{_TRANSCRIPT_EXTRACTOR_PROMPT}\n\n---\nTRANSCRIPT:\n{transcript_text}\n---",
        )

        pitch_context = PitchContext.model_validate(raw)
        await store.update(session_id, {"pitch_context": pitch_context.model_dump()})
        logger.info(
            "_extract_pitch_from_transcript: extracted pitch_context for session=%s company=%s",
            session_id,
            pitch_context.company_name or "unknown",
        )

    except Exception as e:
        logger.warning("_extract_pitch_from_transcript: failed for session=%s: %s", session_id, e)


async def _trigger_market_bg(
    session_id: str,
    api_key: str,
    store: ss.SessionStore,
) -> None:
    """Fire market validation in the background (best-effort, never blocks)."""
    try:
        from backend.agents.market_validator import validate_market

        state = await store.get_state(session_id)
        if not state:
            return
        pitch_ctx = state.get("pitch_context", {})
        if not any(pitch_ctx.values()):
            logger.info("_trigger_market_bg: no pitch_context, skipping")
            return
        await validate_market(session_id, api_key=api_key, store=store)
    except Exception as e:
        logger.warning("_trigger_market_bg: failed for session=%s: %s", session_id, e)


async def _trigger_deliberation_bg(
    session_id: str,
    api_key: str,
    store: ss.SessionStore,
) -> None:
    """Fire deliberation in the background after pitch_context is ready."""
    try:
        from backend.agents.deliberation import run_deliberation

        # Wait briefly for pitch_context extraction to finish
        import asyncio as _asyncio

        for _ in range(10):
            state = await store.get_state(session_id)
            if state and any(state.get("pitch_context", {}).values()):
                break
            await _asyncio.sleep(2)
        else:
            logger.warning("_trigger_deliberation_bg: pitch_context never populated, skipping")
            return
        await run_deliberation(session_id, api_key=api_key, store=store)
    except Exception as e:
        logger.warning("_trigger_deliberation_bg: failed for session=%s: %s", session_id, e)


# ── Delivery scoring ───────────────────────────────────────────────────────

_DELIVERY_SCORER_PROMPT = """You are analyzing a startup founder's live interview transcript to score their delivery.

Analyze ONLY the Founder's turns in this transcript. Score on these dimensions:

- confidence (0.0–1.0): Does the founder speak with conviction? Do they hedge excessively?
- specificity (0.0–1.0): Do they give concrete numbers, names, examples? Or vague generalities?
- energy (0.0–1.0): Does the text suggest engaged, enthusiastic delivery? Or flat, rote answers?
- hesitation_count (int): Count filler phrases: "um", "uh", "like", "you know", "sort of", "kind of", "I think maybe"

Return ONLY a JSON object:
{
  "confidence": <float 0-1>,
  "specificity": <float 0-1>,
  "energy": <float 0-1>,
  "hesitation_count": <int>
}"""


async def _score_delivery(
    session_id: str,
    api_key: str,
    store: ss.SessionStore,
) -> None:
    """
    Analyze the live_transcript to compute delivery scores.
    Called as a fire-and-forget task after the WebSocket closes.
    Writes to session.state['delivery_scores'].
    """
    try:
        state = await store.get_state(session_id)
        if not state:
            return

        transcript = state.get("live_transcript", [])
        if not transcript:
            return

        # Build founder-only transcript text
        founder_turns = [
            f"Founder: {t['text']}"
            for t in transcript
            if t.get("speaker") == "Founder" and t.get("text")
        ]
        if not founder_turns:
            return

        transcript_text = "\n".join(founder_turns)
        provider = get_provider(api_key)
        raw = await provider.generate_json(
            model=settings.selected_flash_model,
            user_message=f"{_DELIVERY_SCORER_PROMPT}\n\n---\nTRANSCRIPT:\n{transcript_text}\n---",
        )

        # Clamp values to valid ranges
        scores = {
            "confidence": max(0.0, min(1.0, float(raw.get("confidence", 0.0)))),
            "specificity": max(0.0, min(1.0, float(raw.get("specificity", 0.0)))),
            "energy": max(0.0, min(1.0, float(raw.get("energy", 0.0)))),
            "hesitation_count": max(0, int(raw.get("hesitation_count", 0))),
        }

        await store.update(session_id, {"delivery_scores": scores})
        logger.info("Delivery scores computed for session=%s: %s", session_id, scores)

    except Exception as e:
        logger.warning("Could not compute delivery scores for session=%s: %s", session_id, e)
