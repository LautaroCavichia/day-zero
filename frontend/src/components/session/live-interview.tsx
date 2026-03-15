// ─── LiveInterview ────────────────────────────────────────────────────────────
// Orchestrator for Phase 1: Live Interview.
// Wires together: SlideViewer, VoiceChannel, ChatTranscript, audio pipeline,
// and WebSocket lifecycle. The caller provides the sessionId; this component
// owns the full interview experience from "connecting" → "ended".

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveInterview } from "@/hooks/useLiveInterview";
import { useAudioPipeline } from "@/hooks/useAudioPipeline";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { api } from "@/services/api";
import SlideViewer from "@/components/session/slide-viewer";
import VoiceChannel from "@/components/session/voice-channel";
import ChatTranscript from "@/components/session/chat-transcript";

interface LiveInterviewProps {
  sessionId: string;
  /** Called when the interview has ended so the parent can advance the phase */
  onInterviewEnded?: () => void;
}

export default function LiveInterview({
  sessionId,
  onInterviewEnded,
}: LiveInterviewProps) {
  // ─── Slide state ────────────────────────────────────────────────────────────
  const [slides, setSlides] = useState<string[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // ─── Mic toggle state ───────────────────────────────────────────────────────
  const [isMicActive, setIsMicActive] = useState(false);

  // ─── Hooks ──────────────────────────────────────────────────────────────────
  const interview = useLiveInterview();
  const pipeline = useAudioPipeline();
  const analyser = useAudioAnalyser();

  // Track whether we've already connected (prevent double-connect in StrictMode)
  const hasConnected = useRef(false);
  // Track whether ended callback was already fired
  const endedFired = useRef(false);

  // ─── Load slides on mount ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchSlides() {
      setSlidesLoading(true);
      try {
        const resp = await api.getSlides(sessionId);
        if (!cancelled) setSlides(resp.slides ?? []);
      } catch {
        // Slides are optional — interview can proceed without them
      } finally {
        if (!cancelled) setSlidesLoading(false);
      }
    }
    fetchSlides();
    return () => { cancelled = true; };
  }, [sessionId]);

  // ─── Connect WebSocket on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (hasConnected.current) return;
    hasConnected.current = true;
    interview.connect(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ─── Wire audio pipeline once WS is open ────────────────────────────────────
  // When the interview connects, hook up the audio chunk handler so inbound
  // PCM frames are played back and analysed for Orb reactivity.
  useEffect(() => {
    interview.onAudioChunk((chunk) => {
      pipeline.playAudioChunk(chunk);
      // After first playback node is created, connect the analyser once
      const node = pipeline.getPlaybackNode();
      if (node) analyser.connectSource(node);
    });
  }, [interview, pipeline, analyser]);

  // ─── Fire onInterviewEnded callback ─────────────────────────────────────────
  useEffect(() => {
    if (
      !endedFired.current &&
      (interview.status === "ended" || interview.status === "error")
    ) {
      endedFired.current = true;
      pipeline.stopMic();
      analyser.disconnect();
      setIsMicActive(false);
      onInterviewEnded?.();
    }
  }, [interview.status, pipeline, analyser, onInterviewEnded]);

  // ─── Slide change → notify WS ───────────────────────────────────────────────
  const handleSlideChange = useCallback(
    (index: number) => {
      setCurrentSlide(index);
      // Inform Sam which slide is being viewed
      // We pass a placeholder title since we only have base64 images, not metadata
      interview.sendSlideChange(index, `Slide ${index + 1}`, slides.length);
    },
    [interview, slides.length]
  );

  // ─── Mic toggle ─────────────────────────────────────────────────────────────
  const handleToggleMic = useCallback(async () => {
    if (isMicActive) {
      pipeline.stopMic();
      setIsMicActive(false);
      return;
    }
    const ws = interview.ws;
    const audioCtx = interview.audioCtx;
    if (!ws || !audioCtx) return;
    try {
      await pipeline.startMic(ws, audioCtx);
      setIsMicActive(true);
    } catch {
      // Error message is surfaced inside pipeline.error
    }
  }, [isMicActive, interview, pipeline]);

  // ─── End call ───────────────────────────────────────────────────────────────
  const handleEndCall = useCallback(() => {
    pipeline.stopMic();
    analyser.disconnect();
    interview.endInterview();
    setIsMicActive(false);
  }, [interview, pipeline, analyser]);

  // ─── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Main two-column split */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Slide viewer */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[#a0a0a0] uppercase tracking-widest">
              Deck
            </h2>
            {slides.length > 0 && (
              <span className="text-xs font-mono text-[#5a5a5a]">
                {slides.length} slides
              </span>
            )}
          </div>
          <SlideViewer
            slides={slides}
            currentIndex={currentSlide}
            onSlideChange={handleSlideChange}
            isLoading={slidesLoading}
          />
        </div>

        {/* Right: Voice + Transcript */}
        <div className="w-[320px] flex-shrink-0 flex flex-col gap-4">
          {/* Voice channel */}
          <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5">
            <VoiceChannel
              interviewStatus={interview.status}
              pipelineStatus={pipeline.status}
              isSamSpeaking={interview.isSamSpeaking}
              audioLevel={analyser.audioLevel}
              micLevel={pipeline.micLevel}
              elapsedSeconds={interview.elapsedSeconds}
              onToggleMic={handleToggleMic}
              onEndCall={handleEndCall}
              isMicActive={isMicActive}
            />
          </div>

          {/* Transcript */}
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <h2 className="text-sm font-medium text-[#a0a0a0] uppercase tracking-widest flex-shrink-0">
              Transcript
            </h2>
            <ChatTranscript
              transcript={interview.transcript}
              isSamSpeaking={interview.isSamSpeaking}
              className="flex-1 min-h-[200px] max-h-[360px]"
            />
          </div>
        </div>
      </div>

      {/* Pipeline error banner */}
      {pipeline.error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3">
          <p className="text-xs text-red-400">{pipeline.error}</p>
        </div>
      )}

      {/* Interview error banner */}
      {interview.error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3">
          <p className="text-xs text-red-400">{interview.error}</p>
        </div>
      )}
    </div>
  );
}
