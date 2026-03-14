/**
 * deliberation.js — Audio deliberation WebSocket controller
 *
 * Connects to /ws/deliberation/{sessionId} and:
 *   - Plays PCM 24kHz audio chunks for each persona
 *   - Updates a live transcript panel showing who is speaking
 *   - Renders progress through the personas/rounds
 *
 * Exports:
 *   startAudioDeliberation(sessionId, callbacks)
 *   stopAudioDeliberation()
 *
 * Callbacks:
 *   onPersonaStart(persona, role, round, color)
 *   onTranscript(persona, role, text, round, color)
 *   onPersonaEnd(persona, role, round)
 *   onComplete()
 *   onError(message)
 *   onStatus(message)
 */

import { initPlayback, playChunk, resetPlayback } from './audio.js';

const API_BASE = window.location.origin;

let _socket = null;
let _callbacks = {};

export function isActive() {
  return _socket !== null && _socket.readyState === WebSocket.OPEN;
}

export async function startAudioDeliberation(sessionId, callbacks = {}) {
  _callbacks = callbacks;

  initPlayback();

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${window.location.host}/ws/deliberation/${sessionId}`;
  _socket = new WebSocket(wsUrl);
  _socket.binaryType = 'arraybuffer';

  _socket.onopen = () => {
    console.log('AudioDeliberation WS connected');
  };

  _socket.onmessage = async (event) => {
    if (typeof event.data === 'string') {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      _handleEvent(msg);
    } else {
      // PCM audio chunk
      await playChunk(event.data);
    }
  };

  _socket.onerror = (err) => {
    console.error('AudioDeliberation WS error', err);
    _callbacks.onError?.('WebSocket error');
    _teardown();
  };

  _socket.onclose = () => {
    _teardown();
  };
}

export function stopAudioDeliberation() {
  if (_socket && _socket.readyState === WebSocket.OPEN) {
    _socket.close();
  }
  _teardown();
}

function _teardown() {
  resetPlayback();
  if (_socket) {
    _socket.onclose = null;
    if (_socket.readyState === WebSocket.OPEN || _socket.readyState === WebSocket.CONNECTING) {
      _socket.close();
    }
    _socket = null;
  }
}

function _handleEvent(msg) {
  switch (msg.type) {
    case 'status':
      _callbacks.onStatus?.(msg.message);
      break;
    case 'persona_start':
      _callbacks.onPersonaStart?.(msg.persona, msg.role, msg.round, msg.color);
      break;
    case 'transcript':
      _callbacks.onTranscript?.(msg.persona, msg.role, msg.text, msg.round, msg.color);
      break;
    case 'persona_end':
      _callbacks.onPersonaEnd?.(msg.persona, msg.role, msg.round);
      break;
    case 'persona_error':
      console.warn('PersonaError:', msg.persona, msg.message);
      _callbacks.onStatus?.(`⚠ ${msg.persona} encountered an issue — continuing...`);
      break;
    case 'deliberation_complete':
      _callbacks.onComplete?.();
      _teardown();
      break;
    case 'error':
      _callbacks.onError?.(msg.message);
      _teardown();
      break;
    default:
      break;
  }
}
