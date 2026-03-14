/**
 * slides.js — Slide viewer module
 *
 * Loads slide images from the backend after a deck upload and renders
 * a simple prev/next navigator. When the founder advances a slide,
 * an optional callback is invoked so interview.js can inject slide
 * context into the live Gemini session.
 *
 * Exports:
 *   initSlides(sessionId, containerId, onSlideChange)
 *     containerId   — id of the DOM element to mount the viewer into
 *     onSlideChange — (index, title, total) => void   (optional)
 *   resetSlides()   — hide viewer and clear state
 *   getCurrentSlide() — returns { index, title, total } or null
 */

const API_BASE = window.location.origin;

let _slides = [];       // array of base64 PNG strings
let _index = 0;
let _sessionId = null;
let _containerId = null;
let _onSlideChange = null;

// Attempt to derive a slide title from its position (fallback).
function _defaultTitle(index, total) {
  return `Slide ${index + 1} of ${total}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load all slide images for the session and render the viewer.
 * @param {string} sessionId
 * @param {string} containerId  — id of the wrapper element
 * @param {Function} [onSlideChange]  — called with (index, title, total)
 */
export async function initSlides(sessionId, containerId, onSlideChange) {
  _sessionId = sessionId;
  _containerId = containerId;
  _onSlideChange = onSlideChange || null;
  _index = 0;

  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<p style="color:#718096;font-size:0.9rem">Loading slides...</p>';

  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/slides`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _slides = data.slides || [];
  } catch (e) {
    container.innerHTML = `<p style="color:#e53e3e;font-size:0.88rem">Could not load slides: ${e.message}</p>`;
    return;
  }

  if (_slides.length === 0) {
    container.innerHTML = '<p style="color:#718096;font-size:0.9rem">No slides available.</p>';
    return;
  }

  _render(container);
  _notifyChange();
}

export function resetSlides() {
  _slides = [];
  _index = 0;
  _sessionId = null;
  const container = _containerId ? document.getElementById(_containerId) : null;
  if (container) container.innerHTML = '';
}

export function getCurrentSlide() {
  if (!_slides.length) return null;
  return {
    index: _index,
    title: _defaultTitle(_index, _slides.length),
    total: _slides.length,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function _render(container) {
  const total = _slides.length;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="position:relative;background:#1a1a2e;border-radius:8px;overflow:hidden;text-align:center">
        <img id="slide-img"
             src="data:image/png;base64,${_slides[_index]}"
             alt="Slide ${_index + 1}"
             style="max-width:100%;max-height:340px;object-fit:contain;display:block;margin:0 auto" />
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <button id="slide-prev-btn" class="btn btn-ghost"
                style="padding:8px 14px;font-size:0.85rem" ${_index === 0 ? 'disabled' : ''}>
          ← Prev
        </button>
        <span id="slide-counter" style="font-size:0.88rem;color:#718096;font-weight:600">
          ${_index + 1} / ${total}
        </span>
        <button id="slide-next-btn" class="btn btn-ghost"
                style="padding:8px 14px;font-size:0.85rem" ${_index === total - 1 ? 'disabled' : ''}>
          Next →
        </button>
      </div>
    </div>`;

  document.getElementById('slide-prev-btn').addEventListener('click', () => _navigate(-1));
  document.getElementById('slide-next-btn').addEventListener('click', () => _navigate(1));
}

function _navigate(delta) {
  const total = _slides.length;
  const next = _index + delta;
  if (next < 0 || next >= total) return;
  _index = next;
  _updateView();
  _notifyChange();
}

function _updateView() {
  const total = _slides.length;
  const img = document.getElementById('slide-img');
  const counter = document.getElementById('slide-counter');
  const prevBtn = document.getElementById('slide-prev-btn');
  const nextBtn = document.getElementById('slide-next-btn');

  if (img) img.src = `data:image/png;base64,${_slides[_index]}`;
  if (img) img.alt = `Slide ${_index + 1}`;
  if (counter) counter.textContent = `${_index + 1} / ${total}`;
  if (prevBtn) prevBtn.disabled = _index === 0;
  if (nextBtn) nextBtn.disabled = _index === total - 1;
}

function _notifyChange() {
  if (_onSlideChange) {
    const title = _defaultTitle(_index, _slides.length);
    _onSlideChange(_index, title, _slides.length);
  }
}
