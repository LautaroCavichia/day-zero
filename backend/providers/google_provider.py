"""
providers/google_provider.py — Google / Gemini LLM provider.

Delegates text-generation work to the existing ``core/gemini_client.py``
functions so that all existing test patches (``core.gemini_client.genai.Client``)
continue to work without modification.

Audio streaming (Live Interview) uses ``google.genai``'s async Live API
directly — this is the only production-grade bidirectional audio option on
the Google branch.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from backend.config import settings
from backend.core.errors import ConfigError
from backend.core.llm_provider import LLMProvider
from backend.core.llm_types import MultimodalMessage

logger = logging.getLogger(__name__)


class GoogleProvider(LLMProvider):
    """LLM provider backed by the Google Gemini SDK."""

    def __init__(self, api_key: str | None = None) -> None:
        # Store the optional key override; actual validation happens lazily
        # inside the gemini_client helpers so that test-patches still work.
        self._api_key = api_key or settings.google_api_key or None

    # ── Text generation ────────────────────────────────────────────────────

    async def generate_json(
        self,
        model: str,
        user_message: str,
        system_instruction: str | None = None,
        temperature: float | None = None,
    ) -> Any:
        # Lazy import keeps the import resolution inside core.gemini_client's
        # namespace, so patching ``core.gemini_client.genai.Client`` still works.
        from backend.core.gemini_client import generate_json as _gc_json, get_client

        client = get_client(self._api_key)
        return await _gc_json(
            client=client,
            model=model,
            user_content=user_message,
            system_instruction=system_instruction,
            temperature=temperature,
        )

    async def generate_json_with_search(
        self,
        model: str,
        user_message: str,
        system_instruction: str | None = None,
    ) -> Any:
        from backend.core.gemini_client import generate_json_with_search as _gc_search, get_client

        client = get_client(self._api_key)
        return await _gc_search(
            client=client,
            model=model,
            user_content=user_message,
            system_instruction=system_instruction,
        )

    async def generate_json_multimodal(
        self,
        model: str,
        messages: list[MultimodalMessage],
    ) -> Any:
        from backend.core.gemini_client import generate_json_multimodal as _gc_mm, get_client
        from google.genai import types

        client = get_client(self._api_key)

        # Convert abstract MultimodalMessage → google.genai types.Part list
        parts: list[types.Part] = []
        for msg in messages:
            if msg.text:
                parts.append(types.Part(text=msg.text))
            for img in msg.images:
                parts.append(
                    types.Part(inline_data=types.Blob(data=img.data, mime_type=img.mime_type))
                )

        return await _gc_mm(client=client, model=model, parts=parts)

    # ── Live audio streaming ───────────────────────────────────────────────

    async def stream_live_audio(
        self,
        websocket: Any,
        model: str,
        system_instruction: str,
        session_id: str,
        store: Any = None,
        slide_metadata: list | None = None,
    ) -> None:
        """
        Bridge browser WebSocket ↔ Gemini Live API.

        Binary frames from the browser are PCM audio forwarded to
        Gemini.  Gemini responds with PCM 24 kHz audio chunks plus JSON
        transcript events, both forwarded back to the browser.
        """
        from backend.audio_utils import LIVE_API_INPUT_SAMPLE_RATE
        from fastapi import WebSocketDisconnect
        from google import genai
        from google.genai import types

        from backend.core.gemini_client import translate_gemini_error

        if not self._api_key:
            raise ConfigError(
                "GOOGLE_API_KEY is not configured. "
                "Set it in the .env file or as an environment variable."
            )

        client = genai.Client(api_key=self._api_key)

        live_config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            system_instruction=types.Content(parts=[types.Part(text=system_instruction)]),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            # ── Voice: give Sam a distinct, sharp, direct voice ────────────
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Puck")
                )
            ),
            # ── VAD: fast end-of-speech so Sam can respond quickly ─────────
            # END_SENSITIVITY_HIGH → detects silence after ~300-500ms (snappy)
            # START_SENSITIVITY_LOW → doesn't cut user off mid-sentence pauses
            # silence_duration_ms=500 → 0.5s of silence = turn done (was ~1s+)
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=False,
                    start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                    end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_HIGH,
                    prefix_padding_ms=200,
                    silence_duration_ms=500,
                )
            ),
            # ── Thinking: disabled for lowest-latency responses ───────────────
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )

        try:
            async with client.aio.live.connect(model=model, config=live_config) as gemini_session:
                logger.info("Gemini Live session established: session=%s", session_id)

                # Trigger Sam's greeting immediately so user doesn't wait in silence
                await gemini_session.send_client_content(
                    turns=types.Content(
                        role="user",
                        parts=[types.Part(text="[The founder has joined the call. Begin your introduction.]")],
                    ),
                    turn_complete=True,
                )

                send_task = asyncio.create_task(
                    self._send_loop(
                        websocket,
                        gemini_session,
                        session_id,
                        LIVE_API_INPUT_SAMPLE_RATE,
                        slide_metadata or [],
                    )
                )
                recv_task = asyncio.create_task(
                    self._receive_loop(websocket, gemini_session, session_id, store)
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

                # Check if interview completed
                interview_completed = False
                for task in done:
                    exc = task.exception()
                    if task == recv_task and exc is None:
                        try:
                            interview_completed = recv_task.result()
                        except Exception:
                            pass
                    elif exc and not isinstance(exc, WebSocketDisconnect):
                        logger.error("stream_live_audio task error: %s", exc)

                if interview_completed:
                    logger.info(
                        "Interview marked COMPLETE by Sam: session=%s", session_id
                    )

        except (genai.errors.ClientError, genai.errors.ServerError) as e:
            api_err = translate_gemini_error(e)
            logger.error("Gemini Live API error: session=%s %s", session_id, api_err)
            try:
                await websocket.send_text(json.dumps({"type": "error", "message": api_err.message}))
            except Exception:
                pass

    # ── Internal helpers ───────────────────────────────────────────────────

    @staticmethod
    async def _send_loop(
        websocket: Any,
        gemini_session: Any,
        session_id: str,
        input_sample_rate: int,
        slide_metadata: list | None = None,
    ) -> None:
        """Forward audio / control frames from the browser to Gemini."""
        from fastapi import WebSocketDisconnect
        from google import genai
        from google.genai import types
        from backend.core.gemini_client import translate_gemini_error

        try:
            while True:
                message = await websocket.receive()

                if message["type"] == "websocket.disconnect":
                    break

                if "bytes" in message and message["bytes"]:
                    await gemini_session.send_realtime_input(
                        audio=types.Blob(
                            data=message["bytes"],
                            mime_type=f"audio/pcm;rate={input_sample_rate}",
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

                    elif msg_type == "end_stream_mic":
                        # User muted — flush Gemini's VAD buffer so it processes
                        # any speech it captured before the mic was stopped.
                        await gemini_session.send_realtime_input(audio_stream_end=True)
                        logger.info("Mic muted — audioStreamEnd sent: session=%s", session_id)
                        # Don't break — keep the WS alive for the next unmute

                    elif msg_type == "slide_change":
                        slide_index = ctrl.get("index", 0)  # 0-based from frontend
                        slide_total = ctrl.get("total", "?")

                        _meta = slide_metadata or []
                        slide_data = (
                            _meta[slide_index] if _meta and slide_index < len(_meta) else {}
                        )
                        slide_title = slide_data.get("title", f"Slide {slide_index + 1}")
                        slide_text = (
                            slide_data.get("content_text") or slide_data.get("extracted_text") or ""
                        ).strip()

                        # Concise context injection — keeps model fast
                        context_msg = (
                            f"[SLIDE CHANGE: Now on Slide {slide_index + 1}/{slide_total} — "
                            f"{slide_title}]"
                        )
                        if slide_text:
                            context_msg += f"\n[SLIDE CONTENT: {slide_text[:800]}]"
                        context_msg += (
                            "\n[Verify the founder's claims against this slide. "
                            "Interrupt immediately on any discrepancy.]"
                        )

                        await gemini_session.send_realtime_input(text=context_msg)
                        logger.info(
                            "Slide change INJECTED: session=%s slide=%d/%s title=%s",
                            session_id,
                            slide_index + 1,
                            slide_total,
                            slide_title,
                        )

        except WebSocketDisconnect:
            pass
        except (genai.errors.ClientError, genai.errors.ServerError) as e:
            error = translate_gemini_error(e)
            logger.error("_send_loop Gemini API error: %s", error)
            raise error
        except Exception as e:
            logger.error("_send_loop error: %s", e)
            raise

    @staticmethod
    async def _receive_loop(
        websocket: Any,
        gemini_session: Any,
        session_id: str,
        store: Any,
    ) -> bool:
        """Forward Gemini audio + transcripts to the browser.

        Returns True if interview was marked INTERVIEW_COMPLETE, False otherwise.
        """
        from fastapi import WebSocketDisconnect
        from google import genai
        from backend.core.gemini_client import translate_gemini_error

        input_transcript_buf: list[str] = []
        output_transcript_buf: list[str] = []
        interview_complete = False

        try:
            while True:  # loop over turns — receive() ends after each AI turn
                async for response in gemini_session.receive():
                    content = response.server_content
                    if content is None:
                        continue

                    if content.model_turn:
                        for part in content.model_turn.parts:
                            if part.inline_data and part.inline_data.data:
                                await websocket.send_bytes(part.inline_data.data)

                    if content.input_transcription and content.input_transcription.text:
                        text = content.input_transcription.text
                        input_transcript_buf.append(text)
                        await websocket.send_text(
                            json.dumps(
                                {"type": "transcript_input", "text": text, "timestamp": time.time()}
                            )
                        )

                    if content.output_transcription and content.output_transcription.text:
                        text = content.output_transcription.text
                        output_transcript_buf.append(text)

                        # Check if Sam said interview is complete
                        if "INTERVIEW_COMPLETE" in text:
                            interview_complete = True

                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "transcript_output",
                                    "text": text,
                                    "timestamp": time.time(),
                                }
                            )
                        )

                    if content.turn_complete:
                        if output_transcript_buf and store:
                            full_output = " ".join(output_transcript_buf)
                            await store.append_transcript_turn(
                                session_id, "Sam", full_output, time.time()
                            )
                            output_transcript_buf.clear()

                        if input_transcript_buf and store:
                            full_input = " ".join(input_transcript_buf)
                            await store.append_transcript_turn(
                                session_id, "Founder", full_input, time.time()
                            )
                            input_transcript_buf.clear()

                        await websocket.send_text(json.dumps({"type": "turn_complete"}))

                        # If Sam signalled INTERVIEW_COMPLETE, notify frontend
                        # but do NOT call audio_stream_end here (conflicts with _send_loop).
                        # The user can end via the End Call button; this is a courtesy signal.
                        if interview_complete:
                            logger.info("Sam marked interview complete: session=%s", session_id)
                            try:
                                await websocket.send_text(
                                    json.dumps({"type": "interview_complete"})
                                )
                            except Exception:
                                pass
                            break

                    if content.interrupted:
                        output_transcript_buf.clear()
                        await websocket.send_text(json.dumps({"type": "interrupted"}))

                # If interview marked complete, break outer while loop too
                if interview_complete:
                    break

        except WebSocketDisconnect:
            pass
        except (genai.errors.ClientError, genai.errors.ServerError) as e:
            error = translate_gemini_error(e)
            logger.error("_receive_loop Gemini API error: %s", error)
            raise error
        except Exception as e:
            logger.error("_receive_loop error: %s", e)
            raise

        return interview_complete
