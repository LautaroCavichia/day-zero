/**
 * interview.js — Live WebSocket interview controller
 *
 * Exports:
 *   startInterview(sessionId, callbacks)
 *     callbacks: { onTranscript(speaker, text), onStatus(msg), onEnded(),
 *                  onCoachingTip(tip) }
 *   stopInterview()
 *   isActive()
 *   sendSlideChange(index, title, total)   — call when founder advances a slide
 */

import { startCapture, stopCapture, initPlayback, playChunk, resetPlayback } from './audio.js';
import { showToast, showError } from './ui.js';

const API_BASE = window.location.origin;

// Reconnect config
const MAX_RECONNECT_ATTEMPTS = 4;
const RECONNECT_BASE_DELAY_MS = 1500; // doubles each attempt

let _socket = null;
let _onEnded = null;
let _sessionId = null;
let _coachTimer = null;
let _callbacks = {};

// Reconnect state
let _reconnectAttempts = 0;
let _reconnectTimer = null;
let _intentionalClose = false;

export function isActive() {
  return _socket !== null && _socket.readyState === WebSocket.OPEN;
}

export async function startInterview(sessionId, { onTranscript, onStatus, onEnded, onCoachingTip }) {
  _onEnded = onEnded;
  _sessionId = sessionId;
  _callbacks = { onTranscript, onStatus, onEnded, onCoachingTip };
  _intentionalClose = false;
  _reconnectAttempts = 0;

  // Init audio playback context first (needs user gesture)
  initPlayback();

  // Start mic capture; PCM chunks go straight to socket
  await startCapture((chunk) => {
    if (_socket && _socket.readyState === WebSocket.OPEN) {
      _socket.send(chunk);
    }
  });

  _connect(sessionId);
}

function _connect(sessionId) {
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${window.location.host}/ws/live/${sessionId}`;
  _socket = new WebSocket(wsUrl);
  _socket.binaryType = 'arraybuffer';

  _socket.onopen = () => {
    _reconnectAttempts = 0;
    _callbacks.onStatus?.('connected');
    // Start periodic coaching tip requests (every 25 seconds)
    if (_callbacks.onCoachingTip && !_coachTimer) {
      _coachTimer = setInterval(() => _fetchCoachingTip(sessionId, _callbacks.onCoachingTip), 25000);
    }
  };

  _socket.onmessage = async (event) => {
    if (typeof event.data === 'string') {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      _handleTextEvent(msg);
    } else {
      await playChunk(event.data);
    }
  };

  _socket.onerror = () => {
    // onerror always fires before onclose; let onclose drive reconnect logic
  };

  _socket.onclose = (event) => {
    if (_intentionalClose) {
      _callbacks.onStatus?.('closed');
      _finalize();
      return;
    }

    // Abnormal close — attempt reconnect
    if (_reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      _reconnectAttempts++;
      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, _reconnectAttempts - 1);
      _callbacks.onStatus?.(`reconnecting (attempt ${_reconnectAttempts})...`);
      showToast(`Interview connection lost — reconnecting (${_reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`, 'warn');
      _reconnectTimer = setTimeout(() => _connect(sessionId), delay);
    } else {
      showError('Interview connection lost. Please stop and restart the interview.');
      _callbacks.onStatus?.('error');
      _finalize();
      if (_onEnded) _onEnded();
    }
  };
}

export function stopInterview() {
  _intentionalClose = true;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_socket && _socket.readyState === WebSocket.OPEN) {
    _socket.send(JSON.stringify({ type: 'end_stream' }));
  }
  _teardown();
}

/**
 * Send a slide change notification to the backend (injected into Gemini Live).
 * Call this whenever the founder navigates to a new slide.
 */
export function sendSlideChange(index, title, total) {
  if (_socket && _socket.readyState === WebSocket.OPEN) {
    _socket.send(JSON.stringify({
      type: 'slide_change',
      index,
      title,
      total,
    }));
  }
}

async function _fetchCoachingTip(sessionId, onCoachingTip) {
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/coach`, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.tip) onCoachingTip(data.tip);
  } catch (e) {
    // Coaching tips are best-effort — don't surface errors
  }
}

/** Called after a deliberate stop or after all reconnect attempts exhausted. */
function _finalize() {
  stopCapture();
  resetPlayback();
  if (_coachTimer) { clearInterval(_coachTimer); _coachTimer = null; }
  _socket = null;
  _sessionId = null;
}

function _teardown() {
  if (_coachTimer) { clearInterval(_coachTimer); _coachTimer = null; }
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  stopCapture();
  resetPlayback();
  if (_socket) {
    _socket.onclose = null; // prevent double-fire of onEnded
    if (_socket.readyState === WebSocket.OPEN || _socket.readyState === WebSocket.CONNECTING) {
      _socket.close();
    }
    _socket = null;
  }
  _sessionId = null;
}

function _handleTextEvent(msg) {
  switch (msg.type) {
    case 'transcript_input':
      _callbacks.onTranscript?.('Founder', msg.text);
      break;
    case 'transcript_output':
      _callbacks.onTranscript?.('Sam', msg.text);
      // Stop mic as soon as SAM says INTERVIEW_COMPLETE so no more audio is sent
      if (msg.text && msg.text.includes('INTERVIEW_COMPLETE')) {
        stopCapture();
      }
      break;
    case 'turn_complete':
      _callbacks.onStatus?.('turn_complete');
      break;
    case 'interrupted':
      _callbacks.onStatus?.('interrupted');
      break;
    case 'pong':
      // Heartbeat response from server — no-op
      break;
    case 'status':
      if (msg.phase === 'market_validation') {
        _callbacks.onStatus?.('Analyzing market...');
        showToast('Interview complete! Running market analysis...', 'info');
      } else if (msg.phase === 'deliberation') {
        _callbacks.onStatus?.('VC panel deliberating...');
        showToast('Market analysis done! Running VC deliberation...', 'info');
      } else if (msg.final) {
        _callbacks.onStatus?.('Complete!');
        showToast('All analysis complete! Loading results...', 'ok');
        _intentionalClose = true;
        _teardown();
        if (_onEnded) _onEnded();
      }
      break;
    case 'error':
      console.error('Interview server error:', msg.message);
      showError(`Interview error: ${msg.message}`);
      _callbacks.onStatus?.('error');
      _intentionalClose = true;
      _teardown();
      break;
    default:
      break;
  }
}
