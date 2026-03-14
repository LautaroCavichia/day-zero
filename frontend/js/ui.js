/**
 * ui.js — Shared UI utilities for error/status display
 *
 * Exports:
 *   showToast(message, type)  — ephemeral notification (type: 'info'|'warn'|'error')
 *   showError(message)        — persistent error banner
 *   dismissError()            — hide the error banner
 */

const TOAST_DURATION_MS = 5000;
let _toastTimer = null;

/**
 * Show a small toast notification.
 * Requires a <div id="toast"> in the DOM (created lazily if absent).
 *
 * @param {string} message
 * @param {'info'|'warn'|'error'} [type='info']
 */
export function showToast(message, type = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = [
      'position:fixed', 'bottom:1.5rem', 'left:50%', 'transform:translateX(-50%)',
      'padding:0.6rem 1.2rem', 'border-radius:6px', 'font-size:0.875rem',
      'z-index:9999', 'pointer-events:none', 'transition:opacity 0.3s',
      'max-width:90vw', 'text-align:center',
    ].join(';');
    document.body.appendChild(el);
  }

  const colors = {
    info:  { bg: '#1e293b', text: '#e2e8f0' },
    warn:  { bg: '#78350f', text: '#fef3c7' },
    error: { bg: '#7f1d1d', text: '#fee2e2' },
  };
  const c = colors[type] || colors.info;
  el.style.background = c.bg;
  el.style.color = c.text;
  el.textContent = message;
  el.style.opacity = '1';

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.opacity = '0';
  }, TOAST_DURATION_MS);
}

/**
 * Show a persistent error banner at the top of the page.
 * Requires a <div id="error-banner"> or creates one lazily.
 *
 * @param {string} message
 */
export function showError(message) {
  let el = document.getElementById('error-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'error-banner';
    el.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0',
      'background:#7f1d1d', 'color:#fee2e2',
      'padding:0.75rem 1rem', 'font-size:0.9rem',
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'z-index:10000', 'gap:1rem',
    ].join(';');

    const text = document.createElement('span');
    text.id = 'error-banner-text';
    el.appendChild(text);

    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.style.cssText = 'background:none;border:none;color:inherit;cursor:pointer;font-size:1rem;padding:0 0.25rem;flex-shrink:0';
    btn.onclick = dismissError;
    el.appendChild(btn);

    document.body.prepend(el);
  }

  document.getElementById('error-banner-text').textContent = message;
  el.style.display = 'flex';
}

/**
 * Hide the persistent error banner.
 */
export function dismissError() {
  const el = document.getElementById('error-banner');
  if (el) el.style.display = 'none';
}
