"""
providers/openai_provider.py — OpenAI LLM provider.

Uses the OpenAI Chat Completions API for text generation and the
OpenAI Realtime API (gpt-4o-realtime-preview) for bidirectional
live audio streaming — making it the recommended audio alternative
to the Google Live API.

To switch to OpenAI:
    LLM_PROVIDER=openai
    OPENAI_API_KEY=<your-key>
    OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview   # default
    OPENAI_REALTIME_VOICE=alloy                     # alloy | echo | shimmer | fable | onyx | nova

Realtime API WebSocket endpoint:
    wss://api.openai.com/v1/realtime?model=<model>
    Headers: Authorization: Bearer <key>
             OpenAI-Beta: realtime=v1

Audio format: PCM 16-bit little-endian, 24000 Hz (output), 16000 Hz (input).
The browser sends raw PCM bytes; the Realtime API expects base64-encoded audio
delivered as JSON ``input_audio_buffer.append`` events.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import time
from typing import Any

import httpx

from backend.config import settings
from backend.core.errors import ConfigError, LLMProviderError, LLMResponseError, RateLimitError
from backend.core.llm_provider import LLMProvider
from backend.core.llm_types import MultimodalMessage

logger = logging.getLogger(__name__)

_OPENAI_API_BASE = "https://api.openai.com/v1"
_OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"


class OpenAIProvider(LLMProvider):
    """
    LLM provider backed by the OpenAI API.

    Text generation uses Chat Completions (``/chat/completions``).
    Live audio uses the OpenAI Realtime API over WebSocket.
    """

    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or settings.openai_api_key
        if not resolved_key:
            raise ConfigError(
                "OPENAI_API_KEY is not configured.  "
                "Set it in the .env file or as an environment variable."
            )
        self._api_key = resolved_key
        self._http = httpx.AsyncClient(
            base_url=_OPENAI_API_BASE,
            headers={
                "Authorization": f"Bearer {resolved_key}",
                "Content-Type": "application/json",
            },
            timeout=120.0,
        )

    # ── Text generation ────────────────────────────────────────────────────

    async def generate_json(
        self,
        model: str,
        user_message: str,
        system_instruction: str | None = None,
        temperature: float | None = None,
    ) -> Any:
        messages: list[dict] = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": user_message})

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"},
        }
        if temperature is not None:
            payload["temperature"] = temperature

        try:
            response = await self._http.post("/chat/completions", json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise self._translate_error(exc) from exc
        except httpx.RequestError as exc:
            raise LLMProviderError(
                f"OpenAI API request failed: {exc}", provider="openai"
            ) from exc

        text = response.json()["choices"][0]["message"]["content"]
        return _parse_json(text)

    async def generate_json_with_search(
        self,
        model: str,
        user_message: str,
        system_instruction: str | None = None,
    ) -> Any:
        """
        Web-grounded generation via Tavily search + OpenAI Chat Completions.

        Falls back to plain ``generate_json`` if no Tavily key is configured.
        """
        if not settings.tavily_api_key:
            logger.warning(
                "TAVILY_API_KEY not set — market validation will run without web search. "
                "Set TAVILY_API_KEY for grounded results."
            )
            return await self.generate_json(model, user_message, system_instruction)

        from providers.mistral_provider import _tavily_search  # shared helper

        search_context = await _tavily_search(user_message)
        augmented_message = (
            f"{user_message}\n\n"
            "---\n"
            "RECENT WEB SEARCH RESULTS (use these as sources, cite URLs):\n"
            f"{search_context}\n"
            "---"
        )
        return await self.generate_json(model, augmented_message, system_instruction)

    async def generate_json_multimodal(
        self,
        model: str,
        messages: list[MultimodalMessage],
    ) -> Any:
        """
        Call OpenAI with multimodal input (text + images as base64 data URLs).

        Compatible with GPT-4o and GPT-4o-mini vision endpoints.
        """
        api_messages: list[dict] = []
        for msg in messages:
            content: list[dict] = []
            if msg.text:
                content.append({"type": "text", "text": msg.text})
            for img in msg.images:
                b64 = base64.b64encode(img.data).decode("utf-8")
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{img.mime_type};base64,{b64}"},
                    }
                )
            api_messages.append({"role": msg.role, "content": content})

        try:
            response = await self._http.post(
                "/chat/completions",
                json={
                    "model": model,
                    "messages": api_messages,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise self._translate_error(exc) from exc
        except httpx.RequestError as exc:
            raise LLMProviderError(
                f"OpenAI API request failed: {exc}", provider="openai"
            ) from exc

        text = response.json()["choices"][0]["message"]["content"]
        return _parse_json(text)

    # ── Live audio streaming (OpenAI Realtime API) ─────────────────────────

    async def stream_live_audio(
        self,
        websocket: Any,
        model: str,
        system_instruction: str,
        session_id: str,
        store: Any = None,
    ) -> None:
        """
        Bridge browser WebSocket ↔ OpenAI Realtime API.

        Protocol differences vs Google Live API:
        - Audio frames to OpenAI must be base64-encoded inside JSON events
          (``input_audio_buffer.append``).
        - Audio frames from OpenAI arrive as base64 deltas inside
          ``response.audio.delta`` events; we decode and forward raw PCM bytes
          to the browser so the client-side audio stack is unchanged.
        - Transcription arrives via ``response.audio_transcript.done`` (AI)
          and ``conversation.item.input_audio_transcription.completed`` (user).
        """
        try:
            import websockets  # type: ignore[import-untyped]
        except ImportError as exc:
            raise LLMProviderError(
                "The 'websockets' package is required for OpenAI Realtime API.  "
                "Run: pip install websockets",
                provider="openai",
            ) from exc

        from fastapi import WebSocketDisconnect

        url = f"{_OPENAI_REALTIME_URL}?model={model}"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "OpenAI-Beta": "realtime=v1",
        }

        try:
            async with websockets.connect(url, additional_headers=headers) as openai_ws:
                logger.info("OpenAI Realtime session established: session=%s", session_id)

                # Configure the session
                await openai_ws.send(
                    json.dumps(
                        {
                            "type": "session.update",
                            "session": {
                                "modalities": ["text", "audio"],
                                "instructions": system_instruction,
                                "voice": settings.openai_realtime_voice,
                                "input_audio_format": "pcm16",
                                "output_audio_format": "pcm16",
                                "input_audio_transcription": {"model": "whisper-1"},
                                "turn_detection": {
                                    "type": "server_vad",
                                    "threshold": 0.5,
                                    "prefix_padding_ms": 300,
                                    "silence_duration_ms": 500,
                                },
                            },
                        }
                    )
                )

                send_task = asyncio.create_task(
                    self._send_loop(websocket, openai_ws, session_id)
                )
                recv_task = asyncio.create_task(
                    self._receive_loop(websocket, openai_ws, session_id, store)
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
                        logger.error("stream_live_audio task error: session=%s %s", session_id, exc)

        except Exception as exc:
            logger.error("OpenAI Realtime error: session=%s %s", session_id, exc)
            try:
                await websocket.send_text(
                    json.dumps({"type": "error", "message": str(exc)})
                )
            except Exception:
                pass

    # ── Internal helpers ───────────────────────────────────────────────────

    @staticmethod
    async def _send_loop(
        browser_ws: Any,
        openai_ws: Any,
        session_id: str,
    ) -> None:
        """Forward audio / control frames from the browser to OpenAI."""
        from fastapi import WebSocketDisconnect

        try:
            while True:
                message = await browser_ws.receive()

                if message["type"] == "websocket.disconnect":
                    break

                if "bytes" in message and message["bytes"]:
                    # OpenAI expects base64-encoded PCM inside a JSON event
                    b64_audio = base64.b64encode(message["bytes"]).decode("utf-8")
                    await openai_ws.send(
                        json.dumps(
                            {
                                "type": "input_audio_buffer.append",
                                "audio": b64_audio,
                            }
                        )
                    )

                elif "text" in message and message["text"]:
                    try:
                        ctrl = json.loads(message["text"])
                    except json.JSONDecodeError:
                        continue

                    msg_type = ctrl.get("type")

                    if msg_type == "end_stream":
                        await openai_ws.send(
                            json.dumps({"type": "input_audio_buffer.commit"})
                        )
                        logger.info("Audio stream ended: session=%s", session_id)
                        break

                    elif msg_type == "slide_change":
                        slide_index = ctrl.get("index", 0)
                        slide_title = ctrl.get("title", f"Slide {slide_index + 1}")
                        slide_total = ctrl.get("total", "?")
                        text_msg = (
                            f"[SLIDE {slide_index + 1} of {slide_total}: {slide_title}] "
                            f"The founder has advanced to this slide."
                        )
                        # Inject as a user text message into the conversation
                        await openai_ws.send(
                            json.dumps(
                                {
                                    "type": "conversation.item.create",
                                    "item": {
                                        "type": "message",
                                        "role": "user",
                                        "content": [{"type": "input_text", "text": text_msg}],
                                    },
                                }
                            )
                        )
                        await openai_ws.send(json.dumps({"type": "response.create"}))
                        logger.info(
                            "Slide change injected: session=%s slide=%d/%s title=%s",
                            session_id,
                            slide_index + 1,
                            slide_total,
                            slide_title,
                        )

        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.error("_send_loop error: session=%s %s", session_id, exc)
            raise

    @staticmethod
    async def _receive_loop(
        browser_ws: Any,
        openai_ws: Any,
        session_id: str,
        store: Any,
    ) -> None:
        """Forward OpenAI audio deltas and transcripts to the browser."""
        from fastapi import WebSocketDisconnect

        current_ai_transcript: list[str] = []

        try:
            async for raw_msg in openai_ws:
                try:
                    event = json.loads(raw_msg)
                except json.JSONDecodeError:
                    continue

                event_type: str = event.get("type", "")

                # ── Audio delta → forward raw PCM bytes ──────────────────
                if event_type == "response.audio.delta":
                    delta_b64 = event.get("delta", "")
                    if delta_b64:
                        pcm_bytes = base64.b64decode(delta_b64)
                        await browser_ws.send_bytes(pcm_bytes)

                # ── AI transcript (streaming chunks) ─────────────────────
                elif event_type == "response.audio_transcript.delta":
                    text = event.get("delta", "")
                    if text:
                        current_ai_transcript.append(text)
                        await browser_ws.send_text(
                            json.dumps(
                                {
                                    "type": "transcript_output",
                                    "text": text,
                                    "timestamp": time.time(),
                                }
                            )
                        )

                # ── AI turn finished ──────────────────────────────────────
                elif event_type == "response.audio_transcript.done":
                    full_text = event.get("transcript", "") or "".join(current_ai_transcript)
                    current_ai_transcript.clear()
                    if full_text and store:
                        await store.append_transcript_turn(
                            session_id, "Sam", full_text, time.time()
                        )
                    await browser_ws.send_text(json.dumps({"type": "turn_complete"}))

                # ── User transcript (after VAD commit) ────────────────────
                elif event_type == "conversation.item.input_audio_transcription.completed":
                    text = event.get("transcript", "")
                    if text:
                        await browser_ws.send_text(
                            json.dumps(
                                {
                                    "type": "transcript_input",
                                    "text": text,
                                    "timestamp": time.time(),
                                }
                            )
                        )
                        if store:
                            await store.append_transcript_turn(
                                session_id, "Founder", text, time.time()
                            )

                # ── Interruption ──────────────────────────────────────────
                elif event_type == "input_audio_buffer.speech_started":
                    current_ai_transcript.clear()
                    await browser_ws.send_text(json.dumps({"type": "interrupted"}))

                # ── Errors from OpenAI ────────────────────────────────────
                elif event_type == "error":
                    err_msg = event.get("error", {}).get("message", str(event))
                    logger.error("OpenAI Realtime error event: session=%s %s", session_id, err_msg)
                    await browser_ws.send_text(
                        json.dumps({"type": "error", "message": err_msg})
                    )

        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.error("_receive_loop error: session=%s %s", session_id, exc)
            raise

    # ── Error translation ──────────────────────────────────────────────────

    @staticmethod
    def _translate_error(exc: httpx.HTTPStatusError) -> LLMProviderError:
        status = exc.response.status_code
        if status == 429:
            return RateLimitError(
                "OpenAI API rate limit exceeded.  "
                "Check your plan or reduce request frequency.",
                status_code=status,
                provider="openai",
            )
        if status in (401, 403):
            return ConfigError(
                "OpenAI API authentication failed.  "
                "Verify your OPENAI_API_KEY is valid."
            )
        return LLMProviderError(
            f"OpenAI API error (HTTP {status}): {exc.response.text[:200]}",
            status_code=status,
            provider="openai",
        )

    # ── Context manager ────────────────────────────────────────────────────

    async def __aenter__(self) -> "OpenAIProvider":
        await self._http.__aenter__()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self._http.__aexit__(*args)


# ── JSON parsing ───────────────────────────────────────────────────────────


def _parse_json(raw: str) -> Any:
    text = raw.strip()
    text = re.sub(r"^<[^>]+>\s*", "", text)
    text = re.sub(r"\s*</[^>]+>$", "", text)
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if "```" in text:
            text = text.rsplit("```", 1)[0]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMResponseError(
            f"Could not parse OpenAI response as JSON: {exc}", raw_response=raw
        ) from exc
