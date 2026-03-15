// ─── useAudioAnalyser ─────────────────────────────────────────────────────────
// Connects a Web Audio AnalyserNode to compute a normalized RMS audio level
// (0.0–1.0) from a playback AudioContext's output. Feed the result into Orb's
// `audioLevel` prop to make the orb pulse in sync with AI voice output.

import { useCallback, useRef, useState } from "react";

interface UseAudioAnalyserReturn {
  /** Normalized audio level 0.0–1.0, updated ~every animation frame */
  audioLevel: number;
  /** Connect an AudioNode (e.g. the source playing AI audio) to the analyser */
  connectSource: (node: AudioNode) => void;
  /** Disconnect and stop analysis */
  disconnect: () => void;
}

/**
 * Hook that reads an AnalyserNode's frequency data and produces a smooth
 * 0–1 audio level value suitable for driving the Orb's visual reactivity.
 *
 * Usage:
 *   const { audioLevel, connectSource } = useAudioAnalyser();
 *   // When you create a BufferSource or MediaStreamSource to play AI audio:
 *   connectSource(myAudioSourceNode);
 *   // Pass audioLevel to <Orb audioLevel={audioLevel} />
 */
export function useAudioAnalyser(): UseAudioAnalyserReturn {
  const [audioLevel, setAudioLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return; // already running

    const tick = () => {
      const analyser = analyserRef.current;
      const data = dataRef.current;
      if (!analyser || !data) {
        rafRef.current = null;
        return;
      }

      analyser.getByteFrequencyData(data);

      // Compute RMS from frequency bin magnitudes
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        const normalized = data[i] / 255;
        sumSq += normalized * normalized;
      }
      const rms = Math.sqrt(sumSq / data.length);

      // Apply a mild curve to make quiet passages less jumpy and peaks dramatic
      // rms is typically in 0–0.5 range for normal speech; scale to 0–1
      const scaled = Math.min(1, rms * 2.5);

      setAudioLevel(scaled);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const connectSource = useCallback(
    (node: AudioNode) => {
      const ctx = node.context as AudioContext;

      // Create (or reuse) analyser on the same AudioContext
      if (!analyserRef.current || analyserRef.current.context !== ctx) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;        // 128 frequency bins — lightweight
        analyser.smoothingTimeConstant = 0.75; // smooth transitions
        analyserRef.current = analyser;
        dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      }

      node.connect(analyserRef.current);
      startLoop();
    },
    [startLoop]
  );

  const disconnect = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* ignore */ }
      analyserRef.current = null;
    }
    dataRef.current = null;
    setAudioLevel(0);
  }, []);

  return { audioLevel, connectSource, disconnect };
}
