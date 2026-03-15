// ─── LiveInterview ────────────────────────────────────────────────────────────
// Orchestrator for Phase 1: Live Interview.
// Three-state lifecycle: "pre" (ready screen) | "active" (live call) | "post" (review)
//
// "pre"  — Shows a preparation screen. No WebSocket until the user clicks Begin.
// "active" — Live call: Slides + VoiceChannel + Transcript + Coaching.
// "post"  — Read-only transcript + delivery scores + options to continue or redo.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Lightbulb,
  Mic,
  Radio,
  ArrowRight,
  RotateCcw,
  Zap,
  Target,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useLiveInterview } from "@/hooks/useLiveInterview";
import { useAudioPipeline } from "@/hooks/useAudioPipeline";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { api } from "@/services/api";
import SlideViewer from "@/components/session/slide-viewer";
import VoiceChannel from "@/components/session/voice-channel";
import ChatTranscript from "@/components/session/chat-transcript";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import type { DeliveryScores, TranscriptTurn } from "@/types/session";
import Orb from "@/components/Orb";

// ─── Coaching tips state & polling ───────────────────────────────────────────

const COACHING_POLL_MS = 18_000;

function useCoachingTips(sessionId: string, active: boolean) {
  const [tip, setTip] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTip = useRef<string | null>(null);

  const poll = useCallback(async () => {
    if (!active) return;
    try {
      const res = await api.getCoachingTip(sessionId);
      if (res.tip && res.tip !== currentTip.current) {
        currentTip.current = res.tip;
        setVisible(false);
        setTimeout(() => {
          setTip(res.tip);
          setVisible(true);
        }, 80);
      }
    } catch {
      // Coaching is non-critical — fail silently
    }
  }, [active, sessionId]);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const init = setTimeout(poll, 8_000);
    timerRef.current = setInterval(poll, COACHING_POLL_MS);
    return () => {
      clearTimeout(init);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { tip, visible };
}

// ─── CoachingTipsPanel ────────────────────────────────────────────────────────

function CoachingTipsPanel({ sessionId, active }: { sessionId: string; active: boolean }) {
  const { tip, visible } = useCoachingTips(sessionId, active);

  return (
    <div className="rounded-xl border border-[#1A3D28]/60 bg-[#0A1F12]/40 p-4 min-h-[80px] flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Lightbulb className="size-3 text-[#C8FF00]/70" strokeWidth={1.5} />
        <span className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
          Coaching
        </span>
      </div>
      {tip ? (
        <p
          className={`text-xs text-[#a0a0a0] leading-relaxed transition-opacity duration-300 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          {tip}
        </p>
      ) : (
        <p className="text-xs text-[#3a3a3a] italic">
          {active ? "Listening for coaching moments…" : "Start the interview to receive tips."}
        </p>
      )}
    </div>
  );
}

// ─── Animated score bar (used in post-interview view) ────────────────────────

function ScoreBar({ value, delay = 0 }: { value: number; delay?: number }) {
  const [width, setWidth] = useState("0%");
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const t = setTimeout(() => setWidth(`${Math.round(value * 100)}%`), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  const color =
    value >= 0.7 ? "bg-[#C8FF00]" : value >= 0.4 ? "bg-[#a0a0a0]" : "bg-red-400";

  return (
    <div className="score-bar-track flex-1">
      <div className={`score-bar-fill ${color}`} style={{ width }} />
    </div>
  );
}

// ─── Score row ────────────────────────────────────────────────────────────────

interface ScoreRowProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  delay: number;
  isCount?: boolean;
}

function ScoreRow({ label, value, icon, delay, isCount = false }: ScoreRowProps) {
  const displayValue = isCount ? String(value) : `${Math.round(value * 100)}%`;
  const valueColor = isCount
    ? value <= 3 ? "text-[#C8FF00]" : value <= 7 ? "text-[#a0a0a0]" : "text-red-400"
    : value >= 0.7 ? "text-[#C8FF00]" : value >= 0.4 ? "text-[#a0a0a0]" : "text-red-400";

  return (
    <div
      className="flex items-center gap-3 anim-hidden anim-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-[#0A1F12] border border-[#1A3D28]/60">
        {icon}
      </div>
      <span className="text-sm text-[#a0a0a0] w-28 flex-shrink-0">{label}</span>
      {!isCount && <ScoreBar value={value} delay={delay + 100} />}
      <span className={`text-sm font-mono font-semibold w-10 text-right flex-shrink-0 ${valueColor}`}>
        {displayValue}
      </span>
    </div>
  );
}

// ─── Pre-interview screen ─────────────────────────────────────────────────────

interface PreInterviewProps {
  slideCount: number;
  hasDeck: boolean;
  onBegin: () => void;
  isConnecting: boolean;
}

function PreInterviewScreen({ slideCount, hasDeck, onBegin, isConnecting }: PreInterviewProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-8 px-6 animate-[phase-enter_0.4s_cubic-bezier(0.22,1,0.36,1)_both]">
      {/* Ambient Orb */}
      <div className="relative">
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ boxShadow: "0 0 80px rgba(200,255,0,0.06), 0 0 160px rgba(200,255,0,0.03)" }}
        />
        <Orb
          hue={111}
          hoverIntensity={0.25}
          rotateOnHover={false}
          backgroundColor="#050505"
          forceHoverState={isConnecting}
        />
      </div>

      {/* Copy */}
      <div className="text-center max-w-md anim-hidden anim-fade-up anim-delay-100">
        <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase mb-3">
          Phase 1 — Live Interview
        </p>
        <h2 className="text-2xl font-semibold text-[#f0f0f0] font-heading mb-3">
          {isConnecting ? "Connecting to Sam…" : "Ready for your investor meeting?"}
        </h2>
        <p className="text-sm text-[#5a5a5a] leading-relaxed">
          Sam is an AI partner who will ask you tough, specific questions about your pitch —
          just like a real YC interview. Speak naturally and be specific.
        </p>
      </div>

      {/* Context pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 anim-hidden anim-fade-up anim-delay-200">
        {hasDeck ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0A1F12] border border-[#1A3D28]/60 text-xs text-[#C8FF00]/80 font-mono">
            <CheckCircle2 className="size-3" strokeWidth={2} />
            Sam has reviewed your {slideCount} slides
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#161616] border border-[#2a2a2a] text-xs text-[#5a5a5a] font-mono">
            <Radio className="size-3" strokeWidth={1.5} />
            Verbal pitch only — no deck uploaded
          </span>
        )}
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#161616] border border-[#2a2a2a] text-xs text-[#5a5a5a] font-mono">
          <Mic className="size-3" strokeWidth={1.5} />
          Mic will be requested on start
        </span>
      </div>

      {/* Begin button */}
      <div className="anim-hidden anim-fade-up anim-delay-300">
        <button
          onClick={onBegin}
          disabled={isConnecting}
          className={`
            flex items-center gap-2.5 px-8 py-3.5 rounded-xl
            text-sm font-semibold transition-all duration-200
            ${isConnecting
              ? "bg-[#1e1e1e] border border-[#2a2a2a] text-[#5a5a5a] cursor-not-allowed"
              : "bg-[#C8FF00] text-black hover:bg-[#D4FF33] active:scale-[0.98] shadow-[0_0_40px_rgba(200,255,0,0.25)]"}
          `}
        >
          {isConnecting ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-[#3a3a3a] border-t-[#5a5a5a] animate-spin" />
              Connecting…
            </>
          ) : (
            <>
              Begin Interview
              <ArrowRight className="size-4" strokeWidth={2} />
            </>
          )}
        </button>
      </div>

      {/* Tip */}
      {!isConnecting && (
        <p className="text-[11px] text-[#3a3a3a] font-mono anim-hidden anim-fade-up anim-delay-400">
          You can mute your mic at any time during the interview
        </p>
      )}
    </div>
  );
}

// ─── Post-interview screen ────────────────────────────────────────────────────

interface PostInterviewProps {
  scores: DeliveryScores | null;
  transcript: TranscriptTurn[];
  duration: number; // seconds
  onContinue: () => void;
  onRedo: () => void;
}

function PostInterviewScreen({ scores, transcript, duration, onContinue, onRedo }: PostInterviewProps) {
  const [showRedoConfirm, setShowRedoConfirm] = useState(false);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="flex flex-col gap-6 h-full animate-[phase-enter_0.4s_cubic-bezier(0.22,1,0.36,1)_both]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 anim-hidden anim-fade-up">
        <div>
          <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase mb-1">
            Interview Complete
          </p>
          <h2 className="text-xl font-semibold text-[#f0f0f0] font-heading">
            Your Interview
          </h2>
          {duration > 0 && (
            <p className="text-sm text-[#5a5a5a] mt-1">
              Duration: {formatDuration(duration)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowRedoConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[#5a5a5a] bg-[#161616] border border-[#2a2a2a] hover:text-[#a0a0a0] hover:bg-[#1e1e1e] transition-all duration-150"
          >
            <RotateCcw className="size-3" strokeWidth={1.5} />
            Redo
          </button>
          <button
            onClick={onContinue}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#C8FF00] text-black hover:bg-[#D4FF33] active:scale-[0.98] transition-all duration-150 shadow-[0_0_30px_rgba(200,255,0,0.2)]"
          >
            Deck Analysis
            <ArrowRight className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Two-column: scores + transcript */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Left: Delivery scores */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 flex flex-col gap-4">
            <p className="text-xs font-mono tracking-widest text-[#5a5a5a] uppercase">
              Delivery Scores
            </p>
            {scores ? (
              <div className="flex flex-col gap-3">
                <ScoreRow
                  label="Confidence"
                  value={scores.confidence}
                  icon={<Zap className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />}
                  delay={100}
                />
                <ScoreRow
                  label="Specificity"
                  value={scores.specificity}
                  icon={<Target className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />}
                  delay={180}
                />
                <ScoreRow
                  label="Energy"
                  value={scores.energy}
                  icon={<Mic className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />}
                  delay={260}
                />
                <ScoreRow
                  label="Hesitations"
                  value={scores.hesitation_count}
                  icon={<AlertCircle className="size-3.5 text-[#5a5a5a]" strokeWidth={1.5} />}
                  delay={340}
                  isCount
                />
              </div>
            ) : (
              <p className="text-xs text-[#3a3a3a] italic py-2">
                Delivery scores will appear after analysis completes.
              </p>
            )}
          </div>

          {/* Next step nudge */}
          <div className="rounded-xl border border-[#1A3D28]/40 bg-[#0A1F12]/30 p-4">
            <p className="text-xs font-mono tracking-widest text-[#5a5a5a] uppercase mb-2">
              Next
            </p>
            <p className="text-xs text-[#a0a0a0] leading-relaxed mb-3">
              Head to Deck Analysis to see slide-by-slide feedback and narrative scoring.
            </p>
            <button
              onClick={onContinue}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#C8FF00] text-black hover:bg-[#D4FF33] transition-colors duration-150"
            >
              View Deck Analysis
              <ArrowRight className="size-3" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Right: Full transcript */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <p className="text-xs font-mono tracking-widest text-[#5a5a5a] uppercase flex-shrink-0">
            Full Transcript
          </p>
          <ChatTranscript
            transcript={transcript}
            isSamSpeaking={false}
            className="flex-1"
          />
        </div>
      </div>

      {/* Redo confirm dialog */}
      <ConfirmDialog
        open={showRedoConfirm}
        title="Redo interview?"
        message="This will start a fresh conversation with Sam. Your previous transcript will be lost."
        confirmLabel="Yes, redo"
        cancelLabel="Keep this one"
        variant="danger"
        onConfirm={() => {
          setShowRedoConfirm(false);
          onRedo();
        }}
        onCancel={() => setShowRedoConfirm(false)}
      />
    </div>
  );
}

// ─── LiveInterview ────────────────────────────────────────────────────────────

export type InterviewLifecycle = "pre" | "active" | "post";

interface LiveInterviewProps {
  sessionId: string;
  /** Initial lifecycle state — "post" when returning after a completed interview */
  initialLifecycle?: InterviewLifecycle;
  /** Transcript from a previously completed interview (for post view) */
  savedTranscript?: TranscriptTurn[];
  /** Saved delivery scores (for post view) */
  savedScores?: DeliveryScores | null;
  /** Called when the interview ends so the parent can refresh session state */
  onInterviewEnded?: () => void;
  /** Called when the user wants to advance to Phase 2 from the post-interview view */
  onContinue?: () => void;
  /** Callback so parent can know whether a call is currently active (for nav guards) */
  onActiveStateChange?: (isActive: boolean) => void;
}

export default function LiveInterview({
  sessionId,
  initialLifecycle = "pre",
  savedTranscript = [],
  savedScores = null,
  onInterviewEnded,
  onContinue,
  onActiveStateChange,
}: LiveInterviewProps) {
  // ─── Lifecycle state ────────────────────────────────────────────────────────
  const [lifecycle, setLifecycle] = useState<InterviewLifecycle>(initialLifecycle);

  // ─── Slide state ────────────────────────────────────────────────────────────
  const [slides, setSlides] = useState<string[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // ─── Mic toggle state ───────────────────────────────────────────────────────
  const [isMicActive, setIsMicActive] = useState(false);

  // ─── End-call confirm dialog state ──────────────────────────────────────────
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // ─── Hooks ──────────────────────────────────────────────────────────────────
  const interview = useLiveInterview();
  const pipeline = useAudioPipeline();
  const analyser = useAudioAnalyser();

  // Track whether ended callback was already fired
  const endedFired = useRef(false);
  // Save elapsed seconds at interview end for post view
  const [finalDuration, setFinalDuration] = useState(0);

  // Coaching tips active when interview is connected / running
  const coachingActive =
    interview.status === "connected" ||
    interview.status === "sam-speaking" ||
    interview.status === "listening";

  // ─── Notify parent about active state ───────────────────────────────────────
  useEffect(() => {
    const isActive = lifecycle === "active" && (
      interview.status === "connected" ||
      interview.status === "sam-speaking" ||
      interview.status === "listening" ||
      interview.status === "connecting"
    );
    onActiveStateChange?.(isActive);
  }, [lifecycle, interview.status, onActiveStateChange]);

  // ─── beforeunload guard ─────────────────────────────────────────────────────
  useEffect(() => {
    const isLive =
      lifecycle === "active" &&
      (interview.status === "connected" ||
        interview.status === "sam-speaking" ||
        interview.status === "listening");

    if (!isLive) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [lifecycle, interview.status]);

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

  // ─── Wire audio pipeline once WS is open ────────────────────────────────────
  useEffect(() => {
    interview.onAudioChunk((chunk) => {
      pipeline.playAudioChunk(chunk);
      const node = pipeline.getPlaybackNode();
      if (node) analyser.connectSource(node);
    });
  }, [interview, pipeline, analyser]);

  // ─── Fire onInterviewEnded callback when call ends ──────────────────────────
  useEffect(() => {
    if (
      lifecycle === "active" &&
      !endedFired.current &&
      (interview.status === "ended" || interview.status === "error")
    ) {
      endedFired.current = true;
      pipeline.stopMic();
      analyser.disconnect();
      setIsMicActive(false);
      setFinalDuration(interview.elapsedSeconds);
      setLifecycle("post");
      onInterviewEnded?.();
    }
  }, [lifecycle, interview.status, interview.elapsedSeconds, pipeline, analyser, onInterviewEnded]);

  // ─── Begin interview (user clicked "Begin Interview") ───────────────────────
  const handleBegin = useCallback(() => {
    setLifecycle("active");
    endedFired.current = false;
    interview.connect(sessionId);
  }, [interview, sessionId]);

  // ─── Redo interview ──────────────────────────────────────────────────────────
  const handleRedo = useCallback(() => {
    // Clean up any lingering state
    pipeline.stopMic();
    analyser.disconnect();
    setIsMicActive(false);
    endedFired.current = false;
    setFinalDuration(0);
    setCurrentSlide(0);
    setLifecycle("pre");
  }, [pipeline, analyser]);

  // ─── Slide change → notify WS ───────────────────────────────────────────────
  const handleSlideChange = useCallback(
    (index: number) => {
      setCurrentSlide(index);
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
      // Error message is surfaced via pipeline.error
    }
  }, [isMicActive, interview, pipeline]);

  // ─── End call (after confirmation) ──────────────────────────────────────────
  const handleEndCallConfirmed = useCallback(() => {
    setShowEndConfirm(false);
    pipeline.stopMic();
    analyser.disconnect();
    interview.endInterview();
    setIsMicActive(false);
  }, [interview, pipeline, analyser]);

  // ─── Render: Pre-interview ───────────────────────────────────────────────────
  if (lifecycle === "pre") {
    return (
      <PreInterviewScreen
        slideCount={slides.length}
        hasDeck={slides.length > 0}
        onBegin={handleBegin}
        isConnecting={interview.status === "connecting"}
      />
    );
  }

  // ─── Render: Post-interview ──────────────────────────────────────────────────
  if (lifecycle === "post") {
    // Use in-memory transcript if we just finished, otherwise use saved one from session state
    const displayTranscript =
      interview.transcript.length > 0 ? interview.transcript : savedTranscript;
    const displayScores = savedScores;
    const displayDuration =
      finalDuration > 0 ? finalDuration : interview.elapsedSeconds;

    return (
      <PostInterviewScreen
        scores={displayScores}
        transcript={displayTranscript}
        duration={displayDuration}
        onContinue={() => onContinue?.()}
        onRedo={handleRedo}
      />
    );
  }

  // ─── Render: Active interview ────────────────────────────────────────────────
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

        {/* Right: Voice + Transcript + Coaching */}
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
              onEndCall={() => setShowEndConfirm(true)}
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
              className="flex-1 min-h-[160px] max-h-[280px]"
            />
          </div>

          {/* Coaching tips */}
          <div className="flex-shrink-0">
            <CoachingTipsPanel sessionId={sessionId} active={coachingActive} />
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

      {/* End call confirmation dialog */}
      <ConfirmDialog
        open={showEndConfirm}
        title="End the interview?"
        message="You won't be able to resume this conversation. Your transcript so far will be saved."
        confirmLabel="End Interview"
        cancelLabel="Continue Interview"
        variant="danger"
        onConfirm={handleEndCallConfirmed}
        onCancel={() => setShowEndConfirm(false)}
      />
    </div>
  );
}
