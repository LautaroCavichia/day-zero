// ─── InterviewSummary ─────────────────────────────────────────────────────────
// Standalone delivery-score card — no auto-advance.
// Used when we need a quick score summary without the full post-interview view.
// (Full post-interview view with transcript is in live-interview.tsx)

import { useRef, useEffect, useState } from "react";
import { ArrowRight, Mic, Target, Zap, AlertCircle } from "lucide-react";
import type { DeliveryScores } from "@/types/session";

// ─── Animated score bar ───────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

interface InterviewSummaryProps {
  scores: DeliveryScores | null;
  onContinue: () => void;
}

export default function InterviewSummary({ scores, onContinue }: InterviewSummaryProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] px-6">
      <div
        className="w-full max-w-md rounded-2xl border border-[#1e1e1e] bg-[#0c0c0c] p-8 shadow-[0_0_80px_rgba(200,255,0,0.04),0_0_160px_rgba(0,0,0,0.5)]
        anim-scale-up"
      >
        {/* Header */}
        <div className="mb-6 anim-hidden anim-fade-up">
          <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase mb-1">
            Interview Complete
          </p>
          <h2 className="text-xl font-semibold text-[#f0f0f0] font-heading">
            Delivery Scores
          </h2>
          <p className="text-sm text-[#5a5a5a] mt-1">
            How Sam assessed your delivery during the interview.
          </p>
        </div>

        {/* Scores */}
        {scores ? (
          <div className="flex flex-col gap-3 mb-7">
            <ScoreRow
              label="Confidence"
              value={scores.confidence}
              icon={<Zap className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />}
              delay={200}
            />
            <ScoreRow
              label="Specificity"
              value={scores.specificity}
              icon={<Target className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />}
              delay={280}
            />
            <ScoreRow
              label="Energy"
              value={scores.energy}
              icon={<Mic className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />}
              delay={360}
            />
            <ScoreRow
              label="Hesitations"
              value={scores.hesitation_count}
              icon={<AlertCircle className="size-3.5 text-[#5a5a5a]" strokeWidth={1.5} />}
              delay={440}
              isCount
            />
          </div>
        ) : (
          <div className="mb-7 py-4 text-center">
            <p className="text-sm text-[#3a3a3a]">Delivery scores not yet available.</p>
          </div>
        )}

        {/* CTA */}
        <div className="anim-hidden anim-fade-up anim-delay-500">
          <button
            onClick={onContinue}
            className="
              w-full flex items-center justify-center gap-2
              rounded-lg bg-[#C8FF00] px-4 py-3
              text-sm font-semibold text-black
              hover:bg-[#D4FF33] transition-colors duration-200
              shadow-[0_0_40px_rgba(200,255,0,0.22)]
              active:scale-[0.98]
            "
          >
            View Deck Analysis
            <ArrowRight className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
