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

    except Exception as e:
        logger.error("LiveInterview error: %s", e)
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        await _store.update(session_id, {"live_interview_active": False})
        logger.info("LiveInterview WS closed: session=%s", session_id)
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

                if ctrl.get("type") == "end_stream":
                    await gemini_session.send_realtime_input(audio_stream_end=True)
                    logger.info("Audio stream ended: session=%s", session_id)
                    break

    except WebSocketDisconnect:
        pass
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
    except Exception as e:
        logger.error("_receive_loop error: %s", e)
        raise
