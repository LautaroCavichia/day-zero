"""
agents/deck_analyst.py — DeckAnalystAgent

Multimodal deck analysis using gemini-2.5-flash.
Accepts PDF (converted to PIL images) or PPTX (converted to PDF first).

Writes structured critique to session.state['deck_critique'].
"""

from __future__ import annotations

import io
import logging
from pathlib import Path

import backend.session_state as ss
from backend.config import settings
from backend.core.errors import AgentError
from backend.core.llm_factory import get_provider
from backend.core.llm_types import ImagePart, MultimodalMessage
from backend.core.models import DeckCritique

logger = logging.getLogger(__name__)

DECK_ANALYST_PROMPT = """You are an expert pitch deck reviewer — a former design partner at a top VC firm.
You think visually and care deeply about narrative flow, not just content.

You will receive the slides of a startup pitch deck as images. Analyze each slide carefully.

Provide your analysis as a JSON object with this exact structure:
{
  "narrative_arc_score": <float 0-10>,
  "visual_clarity_score": <float 0-10>,
  "slide_count": <int>,
  "slides": [
    {
      "index": <int, 1-based>,
      "title": "<inferred slide title>",
      "critique": "<specific, actionable critique — 2-3 sentences>",
      "score": <float 0-10>
    }
  ],
  "missing_slides": ["<slide type that should exist but doesn't>"],
  "top_issues": ["<top 3-5 most critical issues with the deck overall>"],
  "strengths": ["<top 2-3 genuine strengths>"],
  "overall_summary": "<2-3 sentence overall assessment>"
}

Be specific and actionable. Reference actual content from the slides, not generic advice.
Evaluate: hook slide, problem clarity, solution clarity, traction proof, team slide, ask slide.
Output ONLY the JSON object, no markdown fences, no extra text."""


async def analyze_deck(
    session_id: str,
    file_bytes: bytes,
    filename: str,
    api_key: str | None = None,
    store: ss.SessionStore | None = None,
) -> DeckCritique:
    """
    Analyze a pitch deck file and write results to session state.

    Also stores slide images (base64 PNG) in session state under 'slide_images'
    so the live interview can send each slide to Gemini as the founder presents.

    Args:
        session_id: ADK session ID.
        file_bytes: Raw bytes of PDF or PPTX file.
        filename: Original filename (used to detect file type).
        api_key: Gemini API key (falls back to settings).
        store: Session store (defaults to the module-level store).

    Returns:
        Validated ``DeckCritique`` Pydantic model.
    """
    import base64

    _store = store or ss.default_store
    logger.info("DeckAnalyst: analyzing %s for session=%s", filename, session_id)

    images = await _file_to_images(file_bytes, filename)
    if not images:
        raise AgentError("Could not extract images from deck file")

    logger.info("DeckAnalyst: extracted %d slides from %s", len(images), filename)

    # Convert all images to PNG bytes first so we can reuse them
    slide_png_bytes: list[bytes] = [_pil_to_bytes(img) for img in images]

    provider = get_provider(api_key)
    msg = MultimodalMessage(
        role="user",
        text=DECK_ANALYST_PROMPT,
        images=[ImagePart(mime_type="image/png", data=b) for b in slide_png_bytes],
    )

    raw = await provider.generate_json_multimodal(
        model=settings.selected_flash_model,
        messages=[msg],
    )

    # Always stamp the actual slide count (don't trust the model)
    raw["slide_count"] = len(images)

    critique = DeckCritique.model_validate(raw)

    # Store slide images as base64 strings so the live interview can use them.
    # We cap at 150 DPI PNG which is typically 50-200 KB/slide — acceptable for
    # session state given the hackathon's in-memory store.
    slide_images_b64 = [base64.b64encode(b).decode("utf-8") for b in slide_png_bytes]

    await _store.update(
        session_id,
        {
            "deck_critique": critique.model_dump(),
            "deck_analysis_done": True,
            "slide_images": slide_images_b64,  # list of base64 PNG strings
        },
    )

    logger.info(
        "DeckAnalyst: analysis complete for session=%s, stored %d slide images",
        session_id,
        len(slide_images_b64),
    )
    return critique


# ── File conversion helpers ────────────────────────────────────────────────


async def _file_to_images(file_bytes: bytes, filename: str) -> list:
    """Convert PDF or PPTX bytes to a list of PIL Image objects."""
    import asyncio

    suffix = Path(filename).suffix.lower()

    if suffix == ".pptx":
        file_bytes = await asyncio.get_running_loop().run_in_executor(
            None, _pptx_to_pdf_bytes, file_bytes
        )
        suffix = ".pdf"

    if suffix == ".pdf":
        return await asyncio.get_running_loop().run_in_executor(None, _pdf_to_images, file_bytes)

    raise AgentError(f"Unsupported file type: '{suffix}'. Use PDF or PPTX.")


def _pptx_to_pdf_bytes(pptx_bytes: bytes) -> bytes:
    """Convert PPTX bytes to PDF bytes using LibreOffice."""
    import os
    import subprocess
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        pptx_path = os.path.join(tmpdir, "deck.pptx")
        pdf_path = os.path.join(tmpdir, "deck.pdf")

        with open(pptx_path, "wb") as f:
            f.write(pptx_bytes)

        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                tmpdir,
                pptx_path,
            ],
            capture_output=True,
            timeout=settings.libreoffice_timeout_seconds,
        )

        if result.returncode != 0:
            raise AgentError(
                "LibreOffice conversion failed. "
                "Install with: brew install libreoffice (macOS) or "
                "apt install libreoffice (Linux). "
                "Alternatively, upload a PDF directly."
            )

        with open(pdf_path, "rb") as f:
            return f.read()


def _pdf_to_images(pdf_bytes: bytes) -> list:
    """Convert PDF bytes to a list of PIL Image objects via pdf2image."""
    from pdf2image import convert_from_bytes

    return convert_from_bytes(
        pdf_bytes,
        dpi=settings.deck_render_dpi,
        fmt="png",
    )


def _pil_to_bytes(img) -> bytes:
    """Convert a PIL Image to PNG bytes."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
