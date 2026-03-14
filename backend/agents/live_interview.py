"""
agents/live_interview.py — LiveInterviewAgent

Bridges the browser WebSocket ↔ Gemini Live API.

Audio pipeline:
  Browser (PCM 16kHz) → WS → send_realtime_input → Gemini Live
  Gemini Live → audio chunks (PCM 24kHz) → WS → Browser

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

import session_state as ss
from audio_utils import LIVE_API_INPUT_SAMPLE_RATE
from config import settings
from core.formatters import format_pitch_context
from core.gemini_client import generate_json, get_client, _translate_gemini_error
from core.models import PitchContext
from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

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

Your interview flow:
1. Brief warm intro (2-3 sentences max), then immediately ask: "So, tell me what you're building in one sentence."
2. Follow their answer by drilling into: problem clarity → customer specificity → solution differentiation → traction/evidence → team → ask
3. Classic YC probes you use naturally:
   - "Who specifically is customer number one — a named person or company?"
   - "What's your unfair advantage here?"
   - "Why hasn't Google or a well-funded startup already built this?"
   - "What do you know about this problem that others don't?"
   - "What happens if I told you your market size estimate is off by 10x?"
   - "Why you? Why now?"
4. If the founder trails off or repeats themselves, interject naturally and redirect.
5. At the end of the session, give honest, direct feedback — both strengths and the single biggest concern.

SLIDE AWARENESS:
- The founder may be presenting a pitch deck. When they advance a slide, you'll receive a message like:
  [SLIDE N: <title>] - the founder has moved to this slide.
- Reference the current slide naturally in your questions. If something on the slide is vague or bold,
  probe it immediately. E.g. "Your slide says '$50M ARR by year 3' — walk me through the assumptions."
- Don't acknowledge the slide transition mechanically. React as a live interviewer would.

Tone: Conversational, never robotic. You speak in short, punchy sentences. You think out loud sometimes.
Context: This is a simulated YC interview to help the founder prepare. Be genuinely useful, not performatively harsh.
"""


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
      - Binary frames to client → PCM 24kHz audio from Gemini
      - Text frames to client  → JSON transcript/event messages
    """
    _store = store or ss.default_store
    await websocket.accept()
    logger.info("LiveInterview WS opened: session=%s", session_id)

    await _store.update(session_id, {"live_interview_active": True})

    key = api_key or settings.google_api_key
    client = genai.Client(api_key=key)

    state = await _store.get_state(session_id)
    pitch_ctx = state.get("pitch_context", {}) if state else {}
    pitch_summary = format_pitch_context(pitch_ctx)

    system_instruction = SAM_SYSTEM_PROMPT
    if pitch_summary:
        system_instruction += (
            f"\n\nAdditional context about this founder's pitch (use this to ask specific, "
            f"targeted questions — do NOT read it back verbatim):\n{pitch_summary}"
        )

    live_config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=types.Content(parts=[types.Part(text=system_instruction)]),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        # VAD is on by default — handles interruptions natively
    )

    try:
        async with client.aio.live.connect(
            model=settings.gemini_live_model, config=live_config
        ) as gemini_session:
            logger.info("Gemini Live session established: session=%s", session_id)

            send_task = asyncio.create_task(_send_loop(websocket, gemini_session, session_id))
            recv_task = asyncio.create_task(
                _receive_loop(websocket, gemini_session, session_id, _store)
            )

            done, pending = await asyncio.wait(
                [send_task, recv_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            for task in done:
                exc = task.exception()
                if exc and not isinstance(exc, WebSocketDisconnect):
                    logger.error("LiveInterview task error: %s", exc)

    except (genai.errors.ClientError, genai.errors.ServerError) as e:
        api_err = _translate_gemini_error(e)
        logger.error("LiveInterview Gemini API error: %s", api_err)
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": api_err.message}))
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
        # Fire post-interview pipeline as background tasks (non-blocking)
        asyncio.create_task(_post_interview_pipeline(session_id, key, _store))
        try:
            await websocket.close()
        except Exception:
            pass


async def _send_loop(
    websocket: WebSocket,
    gemini_session,
    session_id: str,
) -> None:
    """Read audio/control frames from the browser and forward to Gemini."""
    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"]:
                await gemini_session.send_realtime_input(
                    audio=types.Blob(
                        data=message["bytes"],
                        mime_type=f"audio/pcm;rate={LIVE_API_INPUT_SAMPLE_RATE}",
                    )
                )

            elif "text" in message and message["text"]:
                try:
                    ctrl = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                msg_type = ctrl.get("type")

                if msg_type == "end_stream":
                    await gemini_session.send_realtime_input(audio_stream_end=True)
                    logger.info("Audio stream ended: session=%s", session_id)
                    break

                elif msg_type == "slide_change":
                    # Founder advanced to a new slide.
                    # Inject a text message into the Live session so Sam knows.
                    slide_index = ctrl.get("index", 0)
                    slide_title = ctrl.get("title", f"Slide {slide_index + 1}")
                    slide_total = ctrl.get("total", "?")
                    context_msg = (
                        f"[SLIDE {slide_index + 1} of {slide_total}: {slide_title}] "
                        f"The founder has advanced to this slide."
                    )
                    await gemini_session.send_realtime_input(text=context_msg)
                    logger.info(
                        "Slide change injected: session=%s slide=%d/%s title=%s",
                        session_id,
                        slide_index + 1,
                        slide_total,
                        slide_title,
                    )

    except WebSocketDisconnect:
        pass
    except (genai.errors.ClientError, genai.errors.ServerError) as e:
        logger.error("_send_loop Gemini API error: %s", _translate_gemini_error(e))
        raise _translate_gemini_error(e)
    except Exception as e:
        logger.error("_send_loop error: %s", e)
        raise


async def _receive_loop(
    websocket: WebSocket,
    gemini_session,
    session_id: str,
    store: ss.SessionStore,
) -> None:
    """Read responses from Gemini and forward audio + transcript to browser."""
    input_transcript_buf: list[str] = []
    output_transcript_buf: list[str] = []

    try:
        async for response in gemini_session.receive():
            content = response.server_content
            if content is None:
                continue

            # ── Audio chunks ─────────────────────────────────────────────
            if content.model_turn:
                for part in content.model_turn.parts:
                    if part.inline_data and part.inline_data.data:
                        await websocket.send_bytes(part.inline_data.data)

            # ── Transcripts ──────────────────────────────────────────────
            if content.input_transcription and content.input_transcription.text:
                text = content.input_transcription.text
                input_transcript_buf.append(text)
                await websocket.send_text(
                    json.dumps({"type": "transcript_input", "text": text, "timestamp": time.time()})
                )

            if content.output_transcription and content.output_transcription.text:
                text = content.output_transcription.text
                output_transcript_buf.append(text)
                await websocket.send_text(
                    json.dumps(
                        {"type": "transcript_output", "text": text, "timestamp": time.time()}
                    )
                )

            # ── Turn complete ─────────────────────────────────────────────
            if content.turn_complete:
                if output_transcript_buf:
                    full_output = " ".join(output_transcript_buf)
                    await store.append_transcript_turn(session_id, "Sam", full_output, time.time())
                    output_transcript_buf.clear()

                if input_transcript_buf:
                    full_input = " ".join(input_transcript_buf)
                    await store.append_transcript_turn(
                        session_id, "Founder", full_input, time.time()
                    )
                    input_transcript_buf.clear()

                await websocket.send_text(json.dumps({"type": "turn_complete"}))

            # ── Interruption ──────────────────────────────────────────────
            if content.interrupted:
                output_transcript_buf.clear()
                await websocket.send_text(json.dumps({"type": "interrupted"}))

    except WebSocketDisconnect:
        pass
    except (genai.errors.ClientError, genai.errors.ServerError) as e:
        logger.error("_receive_loop Gemini API error: %s", _translate_gemini_error(e))
        raise _translate_gemini_error(e)
    except Exception as e:
        logger.error("_receive_loop error: %s", e)
        raise


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

        client = get_client(api_key)
        raw = await generate_json(
            client=client,
            model=settings.gemini_flash_model,
            user_content=f"{_TRANSCRIPT_EXTRACTOR_PROMPT}\n\n---\nTRANSCRIPT:\n{transcript_text}\n---",
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
        from agents.market_validator import validate_market

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
        from agents.deliberation import run_deliberation

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
        client = get_client(api_key)

        raw = await generate_json(
            client=client,
            model=settings.gemini_flash_model,
            user_content=f"{_DELIVERY_SCORER_PROMPT}\n\n---\nTRANSCRIPT:\n{transcript_text}\n---",
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
