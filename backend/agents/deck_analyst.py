"""
agents/deck_analyst.py — DeckAnalystAgent

Multimodal deck analysis using gemini-2.5-flash.
Accepts PDF (converted to PIL images) or PPTX (converted to PDF first).

Writes structured critique to session.state['deck_critique'].

Slide images are stored on disk via core.slide_store (two tiers):
  - "analysis" (lower DPI) — sent to Gemini for multimodal analysis
  - "display"  (higher DPI) — served to the browser UI via /slides/{index}

Session state no longer holds raw base64 image data; it only records
``slide_count`` and the ``deck_critique`` model (which contains per-slide
text used by SAM during the live interview).
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
from backend.core import slide_store

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

    Two rendering passes are performed from the same PIL images:
      1. ``analysis`` tier  — sent to Gemini for multimodal critique (lower DPI,
         keeps token count and latency low).
      2. ``display`` tier   — higher-DPI PNGs saved to disk via ``slide_store``
         so the browser UI can fetch each slide directly by URL without any
         base64 data sitting in session state.

    Session state is updated with:
      - ``deck_critique``     — full Gemini critique (per-slide text used by SAM)
      - ``slide_count``       — total number of slides (int, metadata only)
      - ``deck_analysis_done`` — True

    Args:
        session_id: Session identifier string.
        file_bytes: Raw bytes of PDF or PPTX file.
        filename: Original filename (used to detect file type).
        api_key: Gemini API key (falls back to settings).
        store: Session store (defaults to the module-level store).

    Returns:
        Validated ``DeckCritique`` Pydantic model.
    """
    import asyncio

    _store = store or ss.default_store
    logger.info("DeckAnalyst: analyzing %s for session=%s", filename, session_id)

    # Clear any previously stored slide files for this session so a re-upload
    # starts with a clean slate.
    await asyncio.get_running_loop().run_in_executor(None, slide_store.cleanup, session_id)

    images = await _file_to_images(file_bytes, filename)
    if not images:
        raise AgentError("Could not extract images from deck file")

    logger.info("DeckAnalyst: extracted %d slides from %s", len(images), filename)

    # ── Tier 1: analysis-res PNGs (sent to Gemini) ───────────────────────────
    # Render at ANALYSIS_DPI for the multimodal request.  These are kept in
    # memory only for the duration of this function.
    analysis_png_bytes: list[bytes] = await asyncio.get_running_loop().run_in_executor(
        None, _render_pil_images_to_png, images, slide_store.ANALYSIS_DPI
    )

    # ── Tier 2: display-res PNGs (served to browser) ─────────────────────────
    # Render at DISPLAY_DPI and save to disk.  Done concurrently with the
    # Gemini call below so they finish in parallel.
    async def _save_display_pngs() -> None:
        display_png_bytes: list[bytes] = await asyncio.get_running_loop().run_in_executor(
            None, _render_pil_images_to_png, images, slide_store.DISPLAY_DPI
        )
        for i, png in enumerate(display_png_bytes):
            await asyncio.get_running_loop().run_in_executor(
                None, slide_store.save, session_id, i, png, "display"
            )
        logger.info(
            "DeckAnalyst: saved %d display-res PNGs to disk for session=%s",
            len(display_png_bytes),
            session_id,
        )

    # Deck analysis always uses Gemini Flash for best multimodal performance,
    # regardless of the global LLM_PROVIDER setting (e.g., Mistral has rate limits).
    from backend.providers.google_provider import GoogleProvider

    provider = GoogleProvider(api_key=api_key or settings.google_api_key)
    msg = MultimodalMessage(
        role="user",
        text=DECK_ANALYST_PROMPT,
        images=[ImagePart(mime_type="image/png", data=b) for b in analysis_png_bytes],
    )

    # Run Gemini analysis and display-PNG saving concurrently
    gemini_task = asyncio.create_task(
        provider.generate_json_multimodal(
            model=settings.gemini_flash_model,
            messages=[msg],
        )
    )
    display_task = asyncio.create_task(_save_display_pngs())

    raw, _ = await asyncio.gather(gemini_task, display_task)

    # Always stamp the actual slide count (don't trust the model)
    raw["slide_count"] = len(images)

    critique = DeckCritique.model_validate(raw)

    # Write only lightweight metadata to session state — NO base64 image data.
    # slide_count lets the frontend know how many /slides/{index} URLs to request.
    # deck_critique.slides[i].content_text is the sole source of slide text for
    # SAM's context injection (no separate slide_metadata field needed).
    await _store.update(
        session_id,
        {
            "deck_critique": critique.model_dump(),
            "slide_count": len(images),
            "deck_analysis_done": True,
        },
    )

    logger.info(
        "DeckAnalyst: analysis complete for session=%s, %d slides (display PNGs on disk, no base64 in state)",
        session_id,
        len(images),
    )
    return critique


# ── Rendering helpers ─────────────────────────────────────────────────────


def _render_pil_images_to_png(images: list, dpi: int) -> list[bytes]:
    """Render a list of PIL Image objects to PNG bytes at the given *dpi*.

    The images are already rasterised (from either pdf2image or the native
    PPTX renderer), so "dpi" here is only used to scale them relative to the
    canonical 96-DPI baseline — higher DPI means proportionally larger pixel
    dimensions and therefore sharper output.

    In practice the images already come out of the converter at the source DPI
    (controlled by ``settings.deck_render_dpi`` for PDFs and hard-coded 96 DPI
    equivalent canvas for the native renderer).  This function simply re-saves
    them as PNG bytes at their existing resolution, which is fine because
    ``_pdf_to_images`` already honours the DPI setting and the native renderer
    uses a fixed large canvas (1280×960).  For the display tier we up-scale
    slightly to guarantee the browser gets ≥220 DPI equivalent quality.

    Args:
        images: List of PIL Image objects.
        dpi: Target dots-per-inch.  Images that are smaller than the target
             are up-scaled with LANCZOS; larger ones are kept as-is.

    Returns:
        List of PNG bytes, one entry per input image.
    """
    import io as _io
    from PIL import Image

    # Target pixel dimensions at the requested DPI (based on a 10×7.5-inch slide)
    target_w = int(10 * dpi)
    target_h = int(7.5 * dpi)

    result: list[bytes] = []
    for img in images:
        w, h = img.size
        if w < target_w or h < target_h:
            # Up-scale small images so the display tier is visually sharper
            img = img.resize((target_w, target_h), Image.LANCZOS)
        buf = _io.BytesIO()
        img.save(buf, format="PNG", optimize=False)
        result.append(buf.getvalue())
    return result


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
            return await asyncio.get_running_loop().run_in_executor(None, _pdf_to_images, pdf_bytes)
        except (AgentError, FileNotFoundError, OSError):
            logger.info("LibreOffice unavailable — using native python-pptx rendering")
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


def _extract_images_from_shape(
    shape, slide_w_emu, slide_h_emu, W, H, img_canvas, io_mod, Image_mod
):
    """Recursively extract and paste all images found inside *shape*.

    Handles:
    - Regular PICTURE shapes (shape_type 13)
    - GROUP shapes (shape_type 6) — walks children recursively
    - Any shape whose XML contains a <blipFill> element (covers SmartArt,
      diagrams, background fills, etc.)

    Returns True if at least one image was pasted.
    """
    from lxml import etree

    pasted = False

    # ── 1. Regular picture shape ──────────────────────────────────────────
    if shape.shape_type == 13:
        try:
            pic_bytes = shape.image.blob
            pic = Image_mod.open(io_mod.BytesIO(pic_bytes)).convert("RGBA")
            left_px = int(shape.left / slide_w_emu * W)
            top_px = int(shape.top / slide_h_emu * H)
            w_px = int(shape.width / slide_w_emu * W)
            h_px = int(shape.height / slide_h_emu * H)
            if w_px > 0 and h_px > 0:
                pic = pic.resize((w_px, h_px), Image_mod.LANCZOS)
                img_canvas.paste(pic.convert("RGB"), (left_px, top_px))
                pasted = True
        except Exception:
            pass

    # ── 2. Group shape — recurse into children ────────────────────────────
    elif shape.shape_type == 6:
        try:
            for child in shape.shapes:
                if _extract_images_from_shape(
                    child, slide_w_emu, slide_h_emu, W, H, img_canvas, io_mod, Image_mod
                ):
                    pasted = True
        except Exception:
            pass

    # ── 3. Any shape with an embedded blipFill (SmartArt, diagrams, etc.) ─
    if not pasted and shape.shape_type not in (13, 6):
        try:
            # namespace-agnostic search for blipFill with an r:embed attribute
            ns = {
                "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
                "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
            }
            blips = shape.element.findall(".//a:blipFill/a:blip", ns)
            r_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            for blip in blips:
                r_embed = blip.get(f"{{{r_ns}}}embed")
                if r_embed:
                    rel = shape.part.rels.get(r_embed)
                    if rel and hasattr(rel, "target_part"):
                        pic_bytes = rel.target_part.blob
                        pic = Image_mod.open(io_mod.BytesIO(pic_bytes)).convert("RGBA")
                        left_px = int(shape.left / slide_w_emu * W)
                        top_px = int(shape.top / slide_h_emu * H)
                        w_px = int(shape.width / slide_w_emu * W)
                        h_px = int(shape.height / slide_h_emu * H)
                        if w_px > 0 and h_px > 0:
                            pic = pic.resize((w_px, h_px), Image_mod.LANCZOS)
                            img_canvas.paste(pic.convert("RGB"), (left_px, top_px))
                            pasted = True
        except Exception:
            pass

    return pasted


def _pptx_to_images_native(pptx_bytes: bytes) -> list:
    """Convert PPTX bytes to PIL Images using python-pptx + Pillow.

    Used as a fallback when LibreOffice is not available.  Renders actual slide
    images (picture shapes) at their proportional positions on the canvas, then
    overlays text on top.  This gives Gemini visual context even for image-heavy
    slides that have little text.
    """
    import io
    import traceback as _tb

    from PIL import Image, ImageDraw, ImageFont
    from pptx import Presentation
    from pptx.util import Inches, Pt

    W, H = 1280, 960  # Larger canvas for better text legibility
    MIN_TEXT_CHARS = 80  # below this, slide is considered "image-heavy"
    MARGIN = 60

    # Font resolution
    font_title = None
    font_heading = None
    font_body = None
    font_small = None

    for path in [
        "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]:
        try:
            font_title = ImageFont.truetype(path, 44)
            font_heading = ImageFont.truetype(path, 28)
            font_body = ImageFont.truetype(path, 18)
            font_small = ImageFont.truetype(path, 14)
            break
        except Exception:
            continue

    # Fallback fonts if no TrueType available
    if font_title is None:
        try:
            font_title = ImageFont.load_default(size=44)
            font_heading = ImageFont.load_default(size=28)
            font_body = ImageFont.load_default(size=18)
            font_small = ImageFont.load_default(size=14)
        except TypeError:
            font_title = font_heading = font_body = font_small = ImageFont.load_default()

    prs = Presentation(io.BytesIO(pptx_bytes))
    slide_w_emu = prs.slide_width  # EMUs
    slide_h_emu = prs.slide_height  # EMUs
    images: list = []

    for slide_idx, slide in enumerate(prs.slides):
        try:
            img = Image.new("RGB", (W, H), color=(250, 250, 250))
            draw = ImageDraw.Draw(img)

            # Top accent bar
            draw.rectangle([0, 0, W, 10], fill=(25, 100, 200))

            # ── Phase 1: composite all images (pictures, groups, diagrams) ──
            has_images = False
            for shape in slide.shapes:
                if _extract_images_from_shape(
                    shape, slide_w_emu, slide_h_emu, W, H, img, io, Image
                ):
                    has_images = True

            # If images were pasted, add a semi-transparent text strip at the top
            # so text remains legible over the image background
            if has_images:
                overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                ov_draw = ImageDraw.Draw(overlay)
                ov_draw.rectangle([0, 0, W, 220], fill=(255, 255, 255, 190))
                img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
                draw = ImageDraw.Draw(img)

            # ── Phase 2: extract all text from all shapes ─────────────────────
            all_text_blocks: list[
                tuple[str, str]
            ] = []  # (text, level: "title"|"heading"|"body"|"small")

            for shape in slide.shapes:
                shape_type = shape.shape_type
                text = ""

                # Text frames
                if hasattr(shape, "text_frame") and shape.has_text_frame:
                    text = shape.text_frame.text.strip()
                    if text:
                        # Try to detect if this is a title (placeholder index 0)
                        # placeholder_format raises ValueError on non-placeholder shapes
                        try:
                            ph = shape.placeholder_format
                            ph_idx = ph.idx if ph is not None else -1
                        except (ValueError, AttributeError):
                            ph_idx = -1
                        level = "title" if ph_idx == 0 else "heading"
                        all_text_blocks.append((text, level))

                # Alt-text / description (present on diagrams, charts, SmartArt)
                try:
                    nvpr = shape.element.find(
                        ".//{http://schemas.openxmlformats.org/drawingml/2006/main}cNvPr",
                        shape.element.nsmap,
                    ) or shape.element.find(
                        ".//{http://schemas.openxmlformats.org/presentationml/2006/main}cNvPr",
                        shape.element.nsmap,
                    )
                    # Try both pml and dml namespaces for cNvPr
                    cNvPr = shape.element.find(
                        ".//{http://schemas.openxmlformats.org/presentationml/2006/main}cNvPr"
                    ) or shape.element.find(
                        ".//{http://schemas.openxmlformats.org/drawingml/2006/main}cNvPr"
                    )
                    if cNvPr is None:
                        # try the pic/sp namespace
                        cNvPr = shape.element.find(
                            ".//{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}cNvPr"
                        )
                    if cNvPr is None:
                        # generic xpath descent
                        for el in shape.element.iter():
                            if el.tag.endswith("}cNvPr") or el.tag == "cNvPr":
                                cNvPr = el
                                break
                    if cNvPr is not None:
                        descr = cNvPr.get("descr", "").strip()
                        if descr and descr not in text:
                            all_text_blocks.append((f"[Alt-text: {descr}]", "small"))
                except Exception:
                    pass

                # Charts — note their presence
                if shape_type == 3:
                    all_text_blocks.append(("[Chart]", "small"))

                # Group shapes — collect text from children recursively
                if shape_type == 6:
                    try:

                        def _collect_group_text(group, blocks):
                            for child in group.shapes:
                                if hasattr(child, "text_frame") and child.has_text_frame:
                                    t = child.text_frame.text.strip()
                                    if t:
                                        blocks.append((t, "body"))
                                if child.shape_type == 6:
                                    _collect_group_text(child, blocks)

                        _collect_group_text(shape, all_text_blocks)
                    except Exception:
                        pass

                # Tables
                if hasattr(shape, "table"):
                    try:
                        table = shape.table
                        rows = []
                        for row in table.rows:
                            cells = []
                            for cell in row.cells:
                                cell_text = cell.text.strip()
                                if cell_text:
                                    cells.append(cell_text)
                            if cells:
                                rows.append(" | ".join(cells))
                        if rows:
                            table_text = "\nTable:\n" + "\n".join(rows)
                            all_text_blocks.append((table_text, "body"))
                    except Exception:
                        pass

                # Notes
                if hasattr(slide, "notes_slide"):
                    try:
                        notes = slide.notes_slide.notes_text_frame.text.strip()
                        if notes:
                            all_text_blocks.append(("Notes: " + notes, "small"))
                    except Exception:
                        pass

            # ── Phase 3: render text overlay ──────────────────────────────────
            total_text = "".join(t for t, _ in all_text_blocks)
            image_heavy = has_images and len(total_text) < MIN_TEXT_CHARS

            if image_heavy:
                # For image-heavy slides: add a label at the bottom so Gemini
                # knows there's minimal text and should rely on the visual
                draw.rectangle([0, H - 40, W, H], fill=(25, 100, 200))
                draw.text(
                    (MARGIN, H - 30),
                    "[Image-heavy slide — visual above is the primary content]",
                    fill=(255, 255, 255),
                    font=font_small,
                )

            # Render extracted text blocks (always, even on image-heavy slides)
            y = MARGIN + 20
            max_y = H - (50 if image_heavy else MARGIN + 20)

            for text, level in all_text_blocks:
                if y > max_y:
                    draw.text((MARGIN, max_y - 30), "...", fill=(150, 150, 150), font=font_small)
                    break

                if level == "title":
                    font = font_title
                    color = (25, 60, 150)
                    spacing = 12
                elif level == "heading":
                    font = font_heading
                    color = (40, 80, 180)
                    spacing = 8
                elif level == "small":
                    font = font_small
                    color = (80, 80, 80)
                    spacing = 4
                else:
                    font = font_body
                    color = (50, 50, 50)
                    spacing = 6

                for line in text.split("\n"):
                    if not line.strip():
                        y += 8
                        continue
                    y = _draw_wrapped(draw, line, font, color, MARGIN, y, W - MARGIN * 2, spacing)
                    if y > max_y:
                        break

                y += 12  # Gap between blocks

            images.append(img)

        except Exception as exc:
            logger.warning(
                "Native PPTX render: slide %d failed (%s) — substituting blank slide\n%s",
                slide_idx + 1,
                exc,
                _tb.format_exc(),
            )
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
            # Fallback estimation if textbbox fails
            width = len(candidate) * 12

        if width <= max_width or not current:
            current = candidate
        else:
            if current:
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
            # Fallback if text rendering fails
            draw.text((x, y), line, fill=color)
            line_h = 24

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
