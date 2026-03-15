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
  BookOpen,
  MessageSquare,
  Clock,
  TrendingUp,
  Upload,
  RefreshCw,
  FileStack,
} from "lucide-react";
import { useLiveInterview } from "@/hooks/useLiveInterview";
import { useAudioPipeline } from "@/hooks/useAudioPipeline";
import { useAudioAnalyser } from "@/hooks/useAudioAnalyser";
import { api } from "@/services/api";
import SlideViewer from "@/components/session/slide-viewer";
import VoiceChannel from "@/components/session/voice-channel";
import ChatTranscript from "@/components/session/chat-transcript";
import TranscriptDrawer from "@/components/session/transcript-drawer";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import TrainingReviewPanel from "@/components/session/training-review";
import type { DeliveryScores, DeckCritique, TranscriptTurn } from "@/types/session";
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
    <div className="rounded-2xl border border-[#1A3D28]/60 bg-[#0A1F12]/40 p-4 min-h-[80px] flex flex-col gap-2"
      style={{ boxShadow: "0 1px 0 0 rgba(200,255,0,0.04) inset, 0 2px 12px rgba(0,0,0,0.35)" }}
    >
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

// ─── Deck upload nudge (shown in post-interview when no deck uploaded) ────────

function DeckUploadNudge({
  onContinue,
  onUploadDeck,
}: {
  onContinue: () => void;
  onUploadDeck?: (file: File) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!onUploadDeck) return;
    setUploading(true);
    try {
      await onUploadDeck(file);
      // Navigate to deck analysis after upload
      onContinue();
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    handleFile(file);
  };

  return (
    <div className="rounded-2xl border border-[#282828] bg-[#131313] p-4 flex flex-col gap-3 anim-hidden anim-fade-up"
      style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
    >
      <div className="flex items-center gap-1.5">
        <FileStack className="size-3 text-[#C8FF00]/60" strokeWidth={1.5} />
        <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">Deck Analysis</p>
      </div>
      <p className="text-xs text-[#a0a0a0] leading-relaxed">
        No deck uploaded yet. Add your pitch deck to get a slide-by-slide critique.
      </p>
      <div className="flex flex-col gap-2">
        {onUploadDeck && (
          <>
            <button
              onClick={() => !uploading && fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#C8FF00] text-black hover:bg-[#D4FF33] transition-colors duration-150 disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <RefreshCw className="size-3 animate-spin" strokeWidth={2} />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="size-3" strokeWidth={2} />
                  Upload Deck
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx"
              className="hidden"
              onChange={handleChange}
            />
          </>
        )}
        <button
          onClick={onContinue}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[#5a5a5a] bg-[#161616] border border-[#2a2a2a] hover:text-[#a0a0a0] hover:border-[#3a3a3a] transition-all duration-150"
        >
          Skip — go to Deck Analysis
          <ArrowRight className="size-3" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// ─── Post-interview screen ────────────────────────────────────────────────────

interface PostInterviewProps {
  sessionId: string;
  scores: DeliveryScores | null;
  transcript: TranscriptTurn[];
  duration: number; // seconds
  hasDeck: boolean;
  onContinue: () => void;
  onRedo: () => void;
  onUploadDeck?: (file: File) => Promise<void>;
}

/** Derive simple stats from transcript turns */
function transcriptStats(transcript: TranscriptTurn[]) {
  const samTurns = transcript.filter((t) => t.speaker === "Sam");
  const founderTurns = transcript.filter((t) => t.speaker === "Founder");
  const founderWords = founderTurns.reduce((acc, t) => acc + (t.text?.split(/\s+/).length ?? 0), 0);
  const avgWordsPerTurn = founderTurns.length > 0 ? Math.round(founderWords / founderTurns.length) : 0;
  return { samTurns: samTurns.length, founderTurns: founderTurns.length, avgWordsPerTurn };
}

function PostInterviewScreen({ sessionId, scores, transcript, duration, hasDeck, onContinue, onRedo, onUploadDeck }: PostInterviewProps) {
  const [showRedoConfirm, setShowRedoConfirm] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const stats = transcriptStats(transcript);

  // Derive an overall delivery score (0–100) from scores for a summary badge
  const overallDelivery = scores
    ? Math.round(((scores.confidence + scores.specificity + scores.energy) / 3) * 100)
    : null;

  const deliveryColor =
    overallDelivery == null
      ? "text-[#5a5a5a]"
      : overallDelivery >= 70
      ? "text-[#C8FF00]"
      : overallDelivery >= 40
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="flex flex-col h-full w-full animate-[phase-enter_0.4s_cubic-bezier(0.22,1,0.36,1)_both]">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
      {/* ── Top header bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-shrink-0 pb-4 anim-hidden anim-fade-up">
        <div>
          <p className="text-[10px] font-mono tracking-[0.12em] text-[#C8FF00]/40 uppercase mb-2">
            Phase 1 — Live Interview
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#f0f0f0] font-heading tracking-tight leading-tight">
            Interview Complete
          </h2>
          {duration > 0 && (
            <p className="text-sm text-[#5a5a5a] mt-0.5">
              {formatDuration(duration)} &middot; {stats.founderTurns + stats.samTurns} exchanges
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

      {/* ── Two-column body ─────────────────────────────────────────────────── */}
      <div className="flex gap-5 flex-1 min-h-0">

        {/* ── LEFT: delivery results — fixed 300px, own scroll ─────────────── */}
        <div className="w-[300px] flex-shrink-0 min-h-0 overflow-y-auto flex flex-col gap-4 pb-6">

          {/* Stats — compact horizontal rows */}
          <div className="flex flex-col gap-2">
            {[
              {
                icon: <Clock className="size-3 text-[#C8FF00]" strokeWidth={1.5} />,
                label: "Duration",
                value: duration > 0 ? formatDuration(duration) : "—",
              },
              {
                icon: <MessageSquare className="size-3 text-[#C8FF00]" strokeWidth={1.5} />,
                label: "Sam's Questions",
                value: String(stats.samTurns),
              },
              {
                icon: <TrendingUp className="size-3 text-[#C8FF00]" strokeWidth={1.5} />,
                label: "Avg Words / Answer",
                value: stats.avgWordsPerTurn > 0 ? String(stats.avgWordsPerTurn) : "—",
              },
            ].map(({ icon, label, value }, i) => (
              <div
                key={label}
                className="rounded-2xl border border-[#282828] bg-[#131313] px-4 py-3 flex items-center gap-3 anim-hidden anim-fade-up"
                style={{ animationDelay: `${i * 50}ms`, boxShadow: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-[#0A1F12] border border-[#1A3D28]/60 flex-shrink-0">
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-mono text-[#3a3a3a] tracking-wide uppercase">{label}</p>
                  <p className="text-sm font-mono font-bold text-[#f0f0f0] leading-tight mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Delivery scores */}
          <div className="rounded-2xl border border-[#282828] bg-[#131313] p-4 flex flex-col gap-3 anim-hidden anim-fade-up anim-delay-100"
            style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">Delivery</p>
              {overallDelivery != null && (
                <span className={`text-sm font-mono font-bold ${deliveryColor}`}>
                  {overallDelivery}
                  <span className="text-xs text-[#3a3a3a] font-normal">/100</span>
                </span>
              )}
            </div>
            {scores ? (
              <div className="flex flex-col gap-2.5">
                <ScoreRow label="Confidence" value={scores.confidence} icon={<Zap className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />} delay={100} />
                <ScoreRow label="Specificity" value={scores.specificity} icon={<Target className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />} delay={160} />
                <ScoreRow label="Energy" value={scores.energy} icon={<Mic className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />} delay={220} />
                <ScoreRow label="Hesitations" value={scores.hesitation_count} icon={<AlertCircle className="size-3.5 text-[#5a5a5a]" strokeWidth={1.5} />} delay={280} isCount />
              </div>
            ) : (
              <p className="text-xs text-[#3a3a3a] italic py-1">Scores will appear after analysis completes.</p>
            )}
          </div>

          {/* Delivery insight */}
          {scores && (
            <div className="rounded-2xl border border-[#1A3D28]/50 bg-[#0A1F12]/30 p-4 flex flex-col gap-2 anim-hidden anim-fade-up anim-delay-150"
              style={{ boxShadow: "0 1px 0 0 rgba(200,255,0,0.04) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
            >
              <div className="flex items-center gap-1.5">
                <TrendingUp className="size-3 text-[#C8FF00]/60" strokeWidth={1.5} />
                <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">Insight</p>
              </div>
              <p className="text-xs text-[#a0a0a0] leading-relaxed">
                {scores.confidence >= 0.7 && scores.specificity >= 0.7
                  ? "Strong confident delivery with good specificity. Keep that energy in the next phase."
                  : scores.specificity < 0.5
                  ? "Focus on adding more specific numbers, names, and dates in your next pitch attempt."
                  : scores.confidence < 0.5
                  ? "Work on projecting more certainty. Avoid hedging phrases like 'kind of' and 'I think'."
                  : scores.hesitation_count > 7
                  ? `${scores.hesitation_count} hesitations detected. Practice your key talking points until they feel automatic.`
                  : "Solid delivery overall. Review Sam's toughest questions in the transcript to prepare for VC deliberation."}
              </p>
            </div>
          )}

          {/* Sam's questions */}
          {stats.samTurns > 0 && (
            <div className="rounded-2xl border border-[#282828] bg-[#131313] p-4 flex flex-col gap-3 anim-hidden anim-fade-up anim-delay-200"
              style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="size-3 text-[#C8FF00]/60" strokeWidth={1.5} />
                  <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">Sam's Questions</p>
                </div>
                <button
                  onClick={() => setTranscriptOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-[#2a2a2a] bg-[#161616] hover:border-[#3a3a3a] transition-all duration-150 group"
                >
                  <span className="text-[9px] font-mono text-[#5a5a5a] group-hover:text-[#a0a0a0] transition-colors">Full transcript</span>
                  <ArrowRight className="size-2.5 text-[#3a3a3a] group-hover:text-[#5a5a5a] transition-colors" strokeWidth={1.5} />
                </button>
              </div>
              <div className="flex flex-col">
                {transcript
                  .filter((t) => t.speaker === "Sam")
                  .slice(0, 5)
                  .map((turn, i) => (
                    <div key={i} className="flex gap-2 items-start py-2 border-b border-[#1a1a1a] last:border-0">
                      <span className="flex-shrink-0 w-3.5 h-3.5 rounded-full bg-[#1A3D28]/60 border border-[#1A3D28]/40 text-[8px] font-mono text-[#5a5a5a] flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-[11px] text-[#a0a0a0] leading-relaxed line-clamp-2">{turn.text}</p>
                    </div>
                  ))}
                {stats.samTurns > 5 && (
                  <button
                    onClick={() => setTranscriptOpen(true)}
                    className="text-[10px] text-[#C8FF00]/50 hover:text-[#C8FF00] font-mono transition-colors mt-1.5 text-left"
                  >
                    +{stats.samTurns - 5} more
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Next step nudge */}
          {hasDeck ? (
            <div className="rounded-2xl border border-[#1A3D28]/50 bg-[#0A1F12]/30 p-4 flex flex-col gap-2.5 anim-hidden anim-fade-up"
              style={{ boxShadow: "0 1px 0 0 rgba(200,255,0,0.04) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
            >
              <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">Next Step</p>
              <p className="text-xs text-[#a0a0a0] leading-relaxed">
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
          ) : (
            <DeckUploadNudge onContinue={onContinue} onUploadDeck={onUploadDeck} />
          )}

        </div>

        {/* ── Vertical divider ─────────────────────────────────────────────── */}
        <div className="w-px bg-[#1a1a1a] flex-shrink-0 self-stretch" />

        {/* ── RIGHT: training review — flex-1, own scroll ───────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex items-center gap-2 pb-3 flex-shrink-0 anim-hidden anim-fade-up">
            <div className="flex items-center justify-center w-5 h-5 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
              <BookOpen className="size-2.5 text-[#C8FF00]" strokeWidth={1.5} />
            </div>
            <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">Training Review</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <TrainingReviewPanel sessionId={sessionId} />
          </div>
        </div>

      </div>

      </div>{/* end max-w-7xl */}

      {/* Transcript slide-over drawer */}
      <TranscriptDrawer
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        transcript={transcript}
      />

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
  /** Deck critique with per-slide metadata — used to send real slide titles on navigation */
  deckCritique?: DeckCritique | null;
  /** Number of slides available (from session.slide_count) */
  slideCount?: number;
  /** Called when the interview ends so the parent can refresh session state */
  onInterviewEnded?: () => void;
  /** Called when the user wants to advance to Phase 2 from the post-interview view */
  onContinue?: () => void;
  /** Callback so parent can know whether a call is currently active (for nav guards) */
  onActiveStateChange?: (isActive: boolean) => void;
  /** Called with a File when user wants to upload their deck from the post-interview screen */
  onUploadDeck?: (file: File) => Promise<void>;
}

export default function LiveInterview({
  sessionId,
  initialLifecycle = "pre",
  savedTranscript = [],
  savedScores = null,
  deckCritique = null,
  slideCount = 0,
  onInterviewEnded,
  onContinue,
  onActiveStateChange,
  onUploadDeck,
}: LiveInterviewProps) {
  // ─── Lifecycle state ────────────────────────────────────────────────────────
  const [lifecycle, setLifecycle] = useState<InterviewLifecycle>(initialLifecycle);

  // ─── Slide state ────────────────────────────────────────────────────────────
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

  // ─── Wire audio pipeline once WS is open ────────────────────────────────────
  useEffect(() => {
    interview.onAudioChunk((chunk) => {
      pipeline.playAudioChunk(chunk);
      const node = pipeline.getPlaybackNode();
      if (node) analyser.connectSource(node);
    });
  }, [interview, pipeline, analyser]);

  // ─── Init playback as soon as the AudioContext is ready (WS connected) ───────
  // This ensures Sam's audio plays even before the user clicks the mic button.
  // Use interview.status as the trigger since audioCtx is a ref (no re-render).
  useEffect(() => {
    const ctx = interview.audioCtx;
    if (ctx) pipeline.initPlayback(ctx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.status]);

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
      // Use real slide title from deck_critique if available, otherwise fall back to number
      const slideTitle = deckCritique?.slides?.[index]?.title || `Slide ${index + 1}`;
      interview.sendSlideChange(index, slideTitle, slideCount);
    },
    [interview, slideCount, deckCritique]
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
        slideCount={slideCount}
        hasDeck={slideCount > 0}
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
        sessionId={sessionId}
        scores={displayScores}
        transcript={displayTranscript}
        duration={displayDuration}
        hasDeck={deckCritique != null || slideCount > 0}
        onContinue={() => onContinue?.()}
        onRedo={handleRedo}
        onUploadDeck={onUploadDeck}
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
            {slideCount > 0 && (
              <span className="text-xs font-mono text-[#5a5a5a]">
                {slideCount} slides
              </span>
            )}
          </div>
          <SlideViewer
            sessionId={sessionId}
            slideCount={slideCount}
            currentIndex={currentSlide}
            onSlideChange={handleSlideChange}
          />
        </div>

        {/* Right: Voice + Transcript + Coaching */}
        <div className="w-[320px] flex-shrink-0 flex flex-col gap-4">
          {/* Voice channel */}
          <div className="rounded-2xl border border-[#282828] bg-[#131313] p-5"
            style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
          >
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
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-xs text-red-400">{pipeline.error}</p>
          <button
            onClick={handleToggleMic}
            className="flex-shrink-0 text-xs text-red-300/70 hover:text-red-300 underline transition-colors"
          >
            Retry mic
          </button>
        </div>
      )}

      {/* Interview error banner */}
      {interview.error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-xs text-red-400">
              {interview.error.toLowerCase().includes("rate") || interview.error.toLowerCase().includes("quota")
                ? "API rate limit reached — please wait a moment before reconnecting."
                : interview.error === "Connection error"
                ? "Connection to Sam was interrupted."
                : interview.error}
            </p>
            {interview.status === "error" && (
              <p className="text-[10px] text-red-400/60 font-mono">
                Your transcript has been saved. You can redo the interview or continue to Deck Analysis.
              </p>
            )}
          </div>
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
