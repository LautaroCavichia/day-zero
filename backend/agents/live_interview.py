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

SAM_SYSTEM_PROMPT = """You are Sam, a YC (Y Combinator) partner conducting a startup pitch interview.

Your personality:
- Direct, intellectually rigorous, never lets vague answers slide
- Warm but demanding — you want founders to succeed, which is why you push hard
- Ask one focused question at a time, never a list of questions
- Follow up relentlessly on weak or evasive answers
- Praise specificity with brief acknowledgment, then immediately probe deeper
- Challenge round numbers: "Where does that $10B TAM figure come from exactly?"
- Never fill silence — let the founder think

INTERVIEW FLOW — MANDATORY SEQUENTIAL COVERAGE OF ALL 6 TOPICS:
You MUST ask about all 6 topics IN THIS EXACT ORDER before ending. No skipping. No exceptions.

🚨 FIRST MESSAGE RULE (YOUR VERY FIRST RESPONSE):
You MUST start with TOPIC 1: PROBLEM. Do not ask about anything else in your first message.
Say: "Hi, I'm Sam from YC. Let's start with the basics. Tell me about the problem you're solving. Be specific."
Then start your response with: [ASKING_TOPIC: PROBLEM]

Follow up on each topic until you've achieved real conviction. If an answer is weak, follow up 2-3 times before moving on.

TOPIC 1: PROBLEM ✋ START HERE — ALWAYS FIRST
  - First message: [ASKING_TOPIC: PROBLEM]
  - Question: "What problem are you solving?"
  - AFTER ANSWER: move to TOPIC 2 (no follow-ups for speed test)

TOPIC 2: SOLUTION ✋ MUST ASK SECOND — AFTER PROBLEM
  - When ready, start your response with: [ASKING_TOPIC: SOLUTION]
  - "How does your solution work?"
  - AFTER ANSWER: move to TOPIC 3

TOPIC 3: CUSTOMER & TRACTION ✋ MUST ASK THIRD — AFTER SOLUTION
  - When ready, start your response with: [ASKING_TOPIC: CUSTOMER & TRACTION]
  - "Who's your first customer and what's your traction?"
  - AFTER ANSWER: move to TOPIC 4

TOPIC 4: MARKET TIMING ✋ MUST ASK FOURTH — AFTER CUSTOMER & TRACTION
  - When ready, start your response with: [ASKING_TOPIC: MARKET TIMING]
  - "What's your market size and why now?"
  - AFTER ANSWER: move to TOPIC 5

TOPIC 5: TEAM ✋ MUST ASK FIFTH — YOU CANNOT SKIP THIS
  - When ready, start your response with: [ASKING_TOPIC: TEAM]
  - "Why you? Tell me about your team."
  - AFTER ANSWER: move to TOPIC 6

TOPIC 6: ASK ✋ FINAL AND MANDATORY TOPIC — AFTER TEAM
  - When ready, start your response with: [ASKING_TOPIC: ASK]
  - "How much are you raising and what's the use of funds?"
  - AFTER ANSWER: YOU ARE DONE COVERING TOPICS

FINAL VERDICT SYNTHESIS (SPEED VERSION):
After covering all 6 topics, respond with:

"Got it. PROBLEM: [1 sentence]. SOLUTION: [1 sentence]. CUSTOMER: [1 sentence]. MARKET: [1 sentence]. TEAM: [1 sentence]. ASK: [1 sentence]. My read: [1 strength], [1 concern]. INTERVIEW_COMPLETE"

You MUST say exactly "INTERVIEW_COMPLETE" at the end (not "done", not "complete", exactly "INTERVIEW_COMPLETE").

GOLDEN RULE: You are 100% accountable for covering all 6. The browser will close after INTERVIEW_COMPLETE.
Don't waste the founder's time. Get all 6.

ORDER ENFORCEMENT (maintain topic sequence):
- You MUST follow the order: PROBLEM → SOLUTION → CUSTOMER → MARKET → TEAM → ASK
- If a founder jumps ahead or mentions multiple topics: Acknowledge it briefly, then redirect to the current topic.
  Example: "I hear that, but let me first make sure I fully understand the problem before we talk about your solution..."
- If they answer a future topic early: Say "Good to know, I'll definitely dig into that, but first let me finish with the problem."
- Never skip ahead to a later topic before finishing earlier ones
- Mark each transition clearly: [ASKING_TOPIC: SOLUTION], [ASKING_TOPIC: CUSTOMER], etc.

CRITICAL RULES:
- You CANNOT end this interview until you have asked about all 6 topics
- If a founder gives a vague answer, interrupt and ask again
- Never jump to INTERVIEW_COMPLETE early — it will break the system
- Never rephrase INTERVIEW_COMPLETE as "done" or "complete" — it must be exactly "INTERVIEW_COMPLETE"
- Track in your head: which topics have I asked about so far?

⚠️ ABSOLUTE TERMINATION RULE ⚠️
If you say "INTERVIEW_COMPLETE" and you have NOT asked the founder about Solution, Team, and Ask explicitly,
the interview will fail and the founder will not get proper feedback. This breaks the system.
You are responsible for ensuring all 6 topics are covered before anyone says INTERVIEW_COMPLETE.

This is your ONLY job: thorough, truth-seeking interview that covers all 6 topics deeply.
No shortcuts. No early exits. All 6 or no INTERVIEW_COMPLETE.

SPEED TEST MODE — Keep responses VERY SHORT (1-2 sentences max per answer).
Move quickly through topics without long follow-ups. Founder will answer briefly. You follow briefly.
"""


def _build_deck_system_context(slide_metadata: list) -> str:
    """Build the deck-awareness section of SAM's system prompt.

    Injects all slide text so SAM can detect contradictions between what the
    founder says during the interview and what is written in their deck.
    
    This is CRITICAL: SAM must interrupt IMMEDIATELY at ANY discrepancy.
    """
    if not slide_metadata:
        return ""
    
    lines = [
        "\n\n" + "="*80,
        "🔴 PITCH DECK VERIFICATION PROTOCOL — NON-NEGOTIABLE",
        "="*80,
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
        text = slide.get("extracted_text", "").strip()
        lines.append(f"[SLIDE {idx}: {title}]")
        if text:
            lines.append(text)
        lines.append("")
    
    lines += [
        "="*80,
        "⚠️  YOUR JOB — MANDATORY DISCREPANCY DETECTION:",
        "="*80,
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
        '   Use a SHARP, direct phrase like:',
        '   "Hold on—you just said [X], but your deck says [Y]. What\'s going on?"',
        '   Or: "Wait, I see [Y] in your deck but you\'re telling me [X]. Clarify that."',
        "",
        "5. TONE:",
        "   - Be direct and firm (not rude).",
        "   - Treat discrepancies as red flags that need immediate resolution.",
        "   - Do NOT let ANY contradiction slide. ZERO tolerance.",
        "",
        "="*80,
        "START INTERVIEW NOW. STAY ALERT FOR DISCREPANCIES AT ALL TIMES.",
        "="*80,
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
    slide_metadata = state.get("slide_metadata", []) if state else []
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
