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
      "content_text": "<ALL visible text on this slide verbatim, different text blocks separated by | characters>",
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

    # Deck analysis always uses Gemini Flash for best multimodal performance,
    # regardless of the global LLM_PROVIDER setting (e.g., Mistral has rate limits).
    from backend.providers.google_provider import GoogleProvider

    provider = GoogleProvider(api_key=api_key or settings.google_api_key)
    msg = MultimodalMessage(
        role="user",
        text=DECK_ANALYST_PROMPT,
        images=[ImagePart(mime_type="image/png", data=b) for b in slide_png_bytes],
    )

    raw = await provider.generate_json_multimodal(
        model=settings.gemini_flash_model,
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

    # Build lightweight slide metadata for SAM's interview context.
    # Each entry has index (1-based), title, and all visible text — used to
    # detect discrepancies between what the founder says and the deck.
    slide_metadata = [
        {
            "index": slide.index,
            "title": slide.title,
            "extracted_text": slide.content_text,
        }
        for slide in critique.slides
    ]
    await _store.update(session_id, {"slide_metadata": slide_metadata})

    logger.info(
        "DeckAnalyst: analysis complete for session=%s, stored %d slide images, %d slide metadata entries",
        session_id,
        len(slide_images_b64),
        len(slide_metadata),
    )
    return critique


# ── File conversion helpers ────────────────────────────────────────────────


async def _file_to_images(file_bytes: bytes, filename: str) -> list:
    """Convert PDF or PPTX bytes to a list of PIL Image objects."""
    import asyncio

    suffix = Path(filename).suffix.lower()

    if suffix == ".pptx":
        # Try LibreOffice for highest fidelity (Linux/macOS CI environments).
        # Fall back to native python-pptx + Pillow rendering on Windows or when
        # LibreOffice is not installed.
        try:
            pdf_bytes = await asyncio.get_running_loop().run_in_executor(
                None, _pptx_to_pdf_bytes, file_bytes
            )
            return await asyncio.get_running_loop().run_in_executor(
                None, _pdf_to_images, pdf_bytes
            )
        except (AgentError, FileNotFoundError, OSError):
            logger.info(
                "LibreOffice unavailable — using native python-pptx rendering"
            )
            return await asyncio.get_running_loop().run_in_executor(
                None, _pptx_to_images_native, file_bytes
            )

    if suffix == ".pdf":
        return await asyncio.get_running_loop().run_in_executor(None, _pdf_to_images, file_bytes)

    raise AgentError(f"Unsupported file type: '{suffix}'. Use PDF or PPTX.")


def _pptx_to_pdf_bytes(pptx_bytes: bytes) -> bytes:
    """Convert PPTX bytes to PDF bytes using LibreOffice.

    Raises ``FileNotFoundError`` when LibreOffice is not installed (the caller
    catches this and falls back to native rendering).
    """
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


def _pptx_to_images_native(pptx_bytes: bytes) -> list:
    """Convert PPTX bytes to PIL Images using python-pptx + Pillow.

    Used as a fallback when LibreOffice is not available.  Renders each slide
    as a 1280x720 white canvas with all text content laid out top-to-bottom —
    enough fidelity for Gemini to read text and perform analysis.
    """
    import io
    import traceback as _tb

    from PIL import Image, ImageDraw, ImageFont
    from pptx import Presentation

    W, H = 1280, 720
    PADDING = 50

    # Resolve fonts — try common system paths, fall back to PIL default.
    font_title = None
    font_body = None
    for path in [
        "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/times.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]:
        try:
            font_title = ImageFont.truetype(path, 36)
            font_body = ImageFont.truetype(path, 20)
            break
        except Exception:
            continue

    # Pillow 10+ load_default() accepts a size parameter for a scalable font.
    if font_title is None:
        try:
            font_title = ImageFont.load_default(size=36)
            font_body = ImageFont.load_default(size=20)
        except TypeError:
            # Older Pillow — load_default takes no arguments
            font_title = ImageFont.load_default()
            font_body = ImageFont.load_default()

    prs = Presentation(io.BytesIO(pptx_bytes))
    images: list = []

    for slide_idx, slide in enumerate(prs.slides):
        try:
            img = Image.new("RGB", (W, H), color=(255, 255, 255))
            draw = ImageDraw.Draw(img)
            draw.rectangle([0, 0, W, 8], fill=(30, 100, 200))

            title_texts: list[str] = []
            body_texts: list[str] = []

            for shape in slide.shapes:
                try:
                    has_tf = getattr(shape, "has_text_frame", False)
                    if not has_tf:
                        continue
                    text = shape.text_frame.text.strip()
                    if not text:
                        continue
                    ph = getattr(shape, "placeholder_format", None)
                    if ph is not None and getattr(ph, "idx", -1) == 0:
                        title_texts.append(text)
                    else:
                        body_texts.append(text)
                except Exception:
                    continue  # skip individual bad shapes

            y = PADDING
            for text in title_texts:
                y = _draw_wrapped(draw, text, font_title, (30, 80, 180), PADDING, y, W - PADDING * 2)
                y += 12
            if title_texts:
                draw.line([PADDING, y, W - PADDING, y], fill=(200, 200, 200), width=1)
                y += 16

            for text in body_texts:
                for raw_line in text.split("\n"):
                    stripped = raw_line.strip()
                    if not stripped:
                        y += 6
                        continue
                    y = _draw_wrapped(
                        draw, "• " + stripped, font_body, (50, 50, 50), PADDING, y, W - PADDING * 2
                    )
                    y += 4
                    if y > H - 40:
                        break
                y += 8
                if y > H - 40:
                    break

            images.append(img)

        except Exception as exc:
            logger.warning(
                "Native PPTX render: slide %d failed (%s) — substituting blank slide\n%s",
                slide_idx + 1,
                exc,
                _tb.format_exc(),
            )
            # Always append something so slide indices stay aligned
            images.append(Image.new("RGB", (W, H), color=(240, 240, 240)))

    return images


def _draw_wrapped(draw, text, font, color, x, y, max_width, line_spacing=6):
    """Word-wrap *text* and draw it; returns the y position after the last line."""
    words = text.split()
    if not words:
        return y
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = (current + " " + word).strip()
        try:
            bbox = draw.textbbox((0, 0), candidate, font=font)
            width = bbox[2] - bbox[0]
        except Exception:
            width = len(candidate) * 10  # rough fallback
        if width <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    for line in lines:
        try:
            draw.text((x, y), line, fill=color, font=font)
            bbox = draw.textbbox((x, y), line, font=font)
            line_h = bbox[3] - bbox[1]
        except Exception:
            draw.text((x, y), line, fill=color)
            line_h = 18
        y += line_h + line_spacing
    return y


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
