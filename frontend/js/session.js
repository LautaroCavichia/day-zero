/**
 * session.js — Session creation and state polling
 *
 * Exports:
 *   sessionId          — reactive string, null until created
 *   createSession()    — POSTs /api/session, updates DOM
 *   startPolling()     — starts 3-second poll loop on /api/session/{id}
 *   stopPolling()      — stops the loop
 *   onStateUpdate(fn)  — register a callback invoked on every poll result
 */

import { showError, dismissError } from './ui.js';

export let sessionId = null;

const API_BASE = window.location.origin;
const POLL_INTERVAL_MS = 3000;

const _listeners = [];
let _pollTimer = null;

export function onStateUpdate(fn) {
  _listeners.push(fn);
}

function _notify(state) {
  _listeners.forEach(fn => {
    try { fn(state); } catch (e) { console.error('onStateUpdate handler error:', e); }
  });
}

export async function createSession() {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/session`, { method: 'POST' });
  } catch (networkErr) {
    const msg = 'Cannot reach the server. Check that the backend is running.';
    showError(msg);
    throw new Error(msg);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || body.message || detail;
    } catch { /* ignore parse error */ }
    const msg = `Failed to create session (${res.status}): ${detail}`;
    showError(msg);
    throw new Error(msg);
  }

  dismissError(); // clear any previous banner on success
  const data = await res.json();
  sessionId = data.session_id;
  return sessionId;
}

export async function fetchState() {
  if (!sessionId) return null;
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function startPolling() {
  if (_pollTimer) return;
  _pollTimer = setInterval(async () => {
    const state = await fetchState();
    if (state) _notify(state);
  }, POLL_INTERVAL_MS);
}

export function stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}
