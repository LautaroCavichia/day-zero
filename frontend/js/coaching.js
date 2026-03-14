/**
 * coaching.js — Coaching tip display module (frontend-only display)
 *
 * Receives coaching tip strings (from interview.js onCoachingTip callback)
 * and displays them in a designated container as a toast-style notification
 * that fades out after a few seconds, while also maintaining a small history.
 *
 * Exports:
 *   initCoaching(containerId)  — set up the container
 *   showTip(tip)               — display a new tip
 *   resetCoaching()            — clear tips and hide container
 */

let _containerId = null;
let _tips = [];
let _fadeTimer = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function initCoaching(containerId) {
  _containerId = containerId;
  _tips = [];
  _render();
}

export function showTip(tip) {
  if (!tip) return;
  _tips.unshift(tip);        // newest first
  if (_tips.length > 5) _tips.pop();   // keep last 5
  _render();

  // Highlight the latest tip briefly
  if (_fadeTimer) clearTimeout(_fadeTimer);
  const container = document.getElementById(_containerId);
  if (!container) return;
  const latest = container.querySelector('.coaching-tip-latest');
  if (latest) {
    latest.style.background = '#fef3c7';
    latest.style.borderLeftColor = '#f59e0b';
    _fadeTimer = setTimeout(() => {
      if (latest) {
        latest.style.background = '#f0fdf4';
        latest.style.borderLeftColor = '#86efac';
      }
    }, 3000);
  }
}

export function resetCoaching() {
  _tips = [];
  if (_fadeTimer) { clearTimeout(_fadeTimer); _fadeTimer = null; }
  const container = _containerId ? document.getElementById(_containerId) : null;
  if (container) container.innerHTML = '';
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function _render() {
  const container = document.getElementById(_containerId);
  if (!container) return;

  if (_tips.length === 0) {
    container.innerHTML = `
      <p style="color:#a0aec0;font-size:0.85rem;font-style:italic">
        Coaching tips will appear here during your pitch...
      </p>`;
    return;
  }

  let html = '';
  _tips.forEach((tip, i) => {
    const isLatest = i === 0;
    html += `
      <div class="coaching-tip ${isLatest ? 'coaching-tip-latest' : ''}" style="
        padding:10px 14px;border-radius:8px;font-size:0.88rem;margin-bottom:8px;
        background:${isLatest ? '#f0fdf4' : '#f7fafc'};
        border-left:4px solid ${isLatest ? '#86efac' : '#e2e8f0'};
        color:${isLatest ? '#14532d' : '#718096'};
        transition:background 0.5s,border-left-color 0.5s">
        ${isLatest ? '<strong style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;color:#16a34a">Latest tip</strong><br>' : ''}
        ${tip}
      </div>`;
  });

  container.innerHTML = html;
}
