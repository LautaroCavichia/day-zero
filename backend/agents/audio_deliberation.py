"""
agents/audio_deliberation.py — Audio Deliberation Panel

Streams the VC deliberation as live spoken audio via Gemini Live API.

Each persona (Paul/Skeptic, Elad/Optimist, Keith/Operator, Chair/Synthesizer)
gets its own Gemini Live session. The persona speaks its analysis naturally
in character, producing PCM 24kHz audio streamed to the browser WebSocket.

Protocol (text frames to client):
  { "type": "persona_start", "persona": "Paul", "role": "Skeptic", "round": 1 }
  { "type": "transcript",    "persona": "Paul", "text": "...", "round": 1 }
  { "type": "persona_end",   "persona": "Paul" }
  { "type": "deliberation_complete" }
  { "type": "error",         "message": "..." }

Binary frames: PCM 24kHz audio for whoever is currently speaking.

Flow:
  1. Run text deliberation first (same as before) to get structured data
  2. For each round × each persona: open Gemini Live, inject the dialogue
     text as a prompt and let the model speak it (with natural variation)
  3. After all rounds: synthesizer speaks the final verdict
"""

from __future__ import annotations

import asyncio
import json
import logging

import backend.session_state as ss
from backend.agents.deliberation import run_deliberation
from backend.config import settings
from backend.core.formatters import format_pitch_context
from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# ── Persona voice configs ─────────────────────────────────────────────────────
# Gemini Live supports named voices via PrebuiltVoiceConfig.
# https://ai.google.dev/gemini-api/docs/live-guide#voice-config

PERSONAS = [
    {
        "name": "Paul",
        "role": "Skeptic",
        "voice": "Puck",  # sharp, direct
        "color": "#e53e3e",
    },
    {
        "name": "Elad",
        "role": "Optimist",
        "voice": "Charon",  # enthusiastic
        "color": "#38a169",
    },
    {
        "name": "Keith",
        "role": "Operator",
        "voice": "Fenrir",  # measured, operational
        "color": "#3182ce",
    },
    {
        "name": "Chair",
        "role": "Synthesizer",
        "voice": "Aoede",  # authoritative
        "color": "#764ba2",
    },
]

# ── Per-persona speaking prompts ──────────────────────────────────────────────


def _build_persona_speaking_prompt(persona: dict, dialogue: str, context_summary: str) -> str:
    """Build the prompt injected into a Gemini Live session for a persona."""
    return f"""You are {persona["name"]}, a VC partner in a startup investment committee.
Your role: {persona["role"]}.

You have already analyzed a startup pitch. Your analysis is below.
Speak it naturally and conversationally — as if you're actually at a board meeting.
Do NOT read it verbatim. Paraphrase, add natural speech patterns, take brief pauses.
Keep your speaking to 60-90 seconds.

PITCH CONTEXT (for reference):
{context_summary}

YOUR ANALYSIS TO DELIVER:
{dialogue}

Speak now. Start directly without preamble like "I will now speak" or "Here is my analysis"."""


def _build_synthesizer_prompt(verdict: dict, context_summary: str) -> str:
    """Build the prompt for the Chair synthesizer."""
    decision = verdict.get("decision", "NO")
    score = verdict.get("weighted_score", 0)
    thesis = verdict.get("investment_thesis", "")
    strengths = verdict.get("strengths", [])
    risks = verdict.get("risks", [])
    next_steps = verdict.get("next_steps", [])

    strengths_text = "\n".join(f"- {s}" for s in strengths[:3])
    risks_text = "\n".join(f"- {r}" for r in risks[:3])
    steps_text = "\n".join(f"- {s}" for s in next_steps[:3])

    return f"""You are the Chair of a VC investment committee delivering the final verdict.

You have heard debate from Paul (Skeptic), Elad (Optimist), and Keith (Operator).
Now deliver the committee's final investment decision — clearly, directly, and with authority.

PITCH CONTEXT:
{context_summary}

DECISION: {decision}
WEIGHTED SCORE: {score}/100

KEY STRENGTHS:
{strengths_text}

KEY RISKS:
{risks_text}

INVESTMENT THESIS:
{thesis}

NEXT STEPS FOR THE FOUNDER:
{steps_text}

Deliver this verdict as if you're speaking directly to the founder.
Be honest, direct, and end with specific actionable guidance.
Keep it to 60-90 seconds."""


# ── Core WebSocket handler ────────────────────────────────────────────────────


async def run_audio_deliberation(
    websocket: WebSocket,
    session_id: str,
    api_key: str | None = None,
    store: ss.SessionStore | None = None,
) -> None:
    """
    Main WebSocket handler for audio deliberation.
    Runs the full text deliberation pipeline, then voices each persona.
    """
    _store = store or ss.default_store
    await websocket.accept()
    logger.info("AudioDeliberation WS opened: session=%s", session_id)

    key = api_key or settings.google_api_key

    # Start heartbeat to keep connection alive during long deliberation
    heartbeat_task = asyncio.create_task(_heartbeat_loop(websocket, session_id))

    try:
        # Step 1: Check if deliberation already ran (text pipeline).
        # If not, run it now (blocking — we need the data to voice it).
        state = await _store.require_state(session_id)
        debate_rounds = state.get("debate_rounds", [])
        final_verdict = state.get("final_verdict")

        if not debate_rounds or not final_verdict:
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "status",
                        "message": "Running deliberation analysis first...",
                    }
                )
            )
            try:
                final_verdict_obj = await run_deliberation(session_id, api_key=key, store=_store)
                state = await _store.require_state(session_id)
                debate_rounds = state.get("debate_rounds", [])
                final_verdict = state.get("final_verdict")
            except Exception as e:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "message": f"Deliberation failed: {e}",
                        }
                    )
                )
                return

        # Build context summary once (used by all persona prompts)
        context_summary = format_pitch_context(state.get("pitch_context", {}))

        await websocket.send_text(
            json.dumps(
                {
                    "type": "status",
                    "message": "Starting audio deliberation...",
                    "rounds": len(debate_rounds),
                }
            )
        )

        # Step 2: Voice each round
        for round_data in debate_rounds:
            round_num = round_data.get("round", 1)

            for persona in PERSONAS[:3]:  # Paul, Elad, Keith
                role_key = persona["role"].lower()
                # Map role name to the key in round_data
                role_map = {"skeptic": "skeptic", "optimist": "optimist", "operator": "operator"}
                round_key = role_map.get(role_key)
                if not round_key:
                    continue

                persona_data = round_data.get(round_key, {})
                dialogue = persona_data.get("dialogue", "")
                if not dialogue:
                    continue

                prompt = _build_persona_speaking_prompt(persona, dialogue, context_summary)

                await _speak_persona(
                    websocket=websocket,
                    session_id=session_id,
                    persona=persona,
                    prompt=prompt,
                    round_num=round_num,
                    key=key,
                    source_dialogue=dialogue,
                )

        # Step 3: Voice the synthesizer verdict
        if final_verdict:
            chair_persona = PERSONAS[3]  # Chair
            verdict_prompt = _build_synthesizer_prompt(final_verdict, context_summary)
            await _speak_persona(
                websocket=websocket,
                session_id=session_id,
                persona=chair_persona,
                prompt=verdict_prompt,
                round_num=0,  # verdict has no round number
                key=key,
                source_dialogue=final_verdict.get("investment_thesis", ""),
            )

        await websocket.send_text(json.dumps({"type": "deliberation_complete"}))
        logger.info("AudioDeliberation complete: session=%s", session_id)

    except WebSocketDisconnect:
        logger.info("AudioDeliberation WS disconnected: session=%s", session_id)
    except Exception as e:
        logger.error("AudioDeliberation error: %s", e, exc_info=True)
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info("AudioDeliberation WS closed: session=%s", session_id)


async def _heartbeat_loop(websocket: WebSocket, session_id: str) -> None:
    """Send periodic ping frames to keep the WebSocket alive."""
    interval = settings.ws_heartbeat_interval_seconds
    try:
        while True:
            await asyncio.sleep(interval)
            await websocket.send_text(json.dumps({"type": "ping"}))
            logger.debug("AudioDeliberation heartbeat sent: session=%s", session_id)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


async def _speak_persona(
    websocket: WebSocket,
    session_id: str,
    persona: dict,
    prompt: str,
    round_num: int,
    key: str,
    source_dialogue: str,
) -> None:
    """
    Open a short Gemini Live session for one persona and stream their audio.
    Sends persona_start, transcript (chunked), audio bytes, then persona_end.
    """
    try:
        await websocket.send_text(
            json.dumps(
                {
                    "type": "persona_start",
                    "persona": persona["name"],
                    "role": persona["role"],
                    "round": round_num,
                    "color": persona["color"],
                }
            )
        )

        client = genai.Client(api_key=key)

        live_config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            system_instruction=types.Content(parts=[types.Part(text=prompt)]),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=persona["voice"])
                )
            ),
        )

        transcript_buf: list[str] = []

        async with client.aio.live.connect(
            model=settings.gemini_live_model, config=live_config
        ) as gemini_session:
            # Kick off speech with a brief user turn, then signal end of input
            await gemini_session.send_realtime_input(text="Begin.")
            await gemini_session.send_realtime_input(audio_stream_end=True)

            async for response in gemini_session.receive():
                content = response.server_content
                if content is None:
                    continue

                # Audio chunks → browser
                if content.model_turn:
                    for part in content.model_turn.parts:
                        if part.inline_data and part.inline_data.data:
                            await websocket.send_bytes(part.inline_data.data)

                # Transcript chunks → browser
                if content.output_transcription and content.output_transcription.text:
                    text = content.output_transcription.text
                    transcript_buf.append(text)
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "transcript",
                                "persona": persona["name"],
                                "role": persona["role"],
                                "text": text,
                                "round": round_num,
                                "color": persona["color"],
                            }
                        )
                    )

                if content.turn_complete:
                    break

        await websocket.send_text(
            json.dumps(
                {
                    "type": "persona_end",
                    "persona": persona["name"],
                    "role": persona["role"],
                    "round": round_num,
                    "full_transcript": " ".join(transcript_buf),
                }
            )
        )

        logger.info(
            "AudioDeliberation: %s (%s) round=%d spoke %d transcript chunks",
            persona["name"],
            persona["role"],
            round_num,
            len(transcript_buf),
        )

    except WebSocketDisconnect:
        raise
    except Exception as e:
        logger.error(
            "AudioDeliberation: _speak_persona failed for %s: %s",
            persona["name"],
            e,
            exc_info=True,
        )
        try:
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "persona_error",
                        "persona": persona["name"],
                        "message": str(e),
                    }
                )
            )
        except Exception:
            pass
