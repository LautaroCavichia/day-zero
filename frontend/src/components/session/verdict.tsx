// ─── Verdict ──────────────────────────────────────────────────────────────────
// Phase 5 orchestrator component.
// Climax of the entire session. Staged reveal:
//   1. Dark overlay with "Calculating verdict…" (500ms)
//   2. VerdictBadge scales up with glow + subtle shake (1000ms mark)
//   3. Score counts up (1500ms)
//   4. Score breakdown bars fill in stagger
//   5. Rest fades up on scroll via useInView
//
// States: pending (deliberation still running), available (data ready).

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  Target,
  Lightbulb,
  BookOpen,
  List,
  ChevronDown,
  Lock,
  Loader,
} from "lucide-react";
import type { FinalVerdict, ScoreBreakdown, SourceCitation, TaskStatusValue } from "@/types/session";
import { useInView } from "@/hooks/useInView";
import { ScoreBar } from "@/components/ui/score-bar";
import { CountUp } from "@/components/ui/count-up";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { SourceLink } from "@/components/ui/source-link";
import { scoreColor } from "@/lib/score-utils";

// ─── Decision color helpers ───────────────────────────────────────────────────

function decisionConfig(decision: string) {
  switch (decision) {
    case "PASS":
      return {
        label: "PASS",
        bg: "bg-[#C8FF00]",
        text: "text-black",
        border: "border-[#C8FF00]/40",
        glow: "0 0 80px rgba(200,255,0,0.18), 0 0 200px rgba(200,255,0,0.08)",
        icon: <CheckCircle2 className="size-8 text-black" strokeWidth={2} />,
        tagClass: "tag-pill-pass",
      };
    case "SOFT PASS":
      return {
        label: "SOFT PASS",
        bg: "bg-amber-400",
        text: "text-black",
        border: "border-amber-400/40",
        glow: "0 0 80px rgba(251,191,36,0.15), 0 0 200px rgba(251,191,36,0.06)",
        icon: <AlertCircle className="size-8 text-black" strokeWidth={2} />,
        tagClass: "tag-pill-neutral",
      };
    default: // NO
      return {
        label: "NO",
        bg: "bg-red-500",
        text: "text-white",
        border: "border-red-500/40",
        glow: "0 0 80px rgba(239,68,68,0.15), 0 0 200px rgba(239,68,68,0.06)",
        icon: <XCircle className="size-8 text-white" strokeWidth={2} />,
        tagClass: "tag-pill-fail",
      };
  }
}

// ─── Verdict Badge (the dramatic reveal element) ──────────────────────────────

function VerdictBadge({
  verdict,
  revealed,
}: {
  verdict: FinalVerdict;
  revealed: boolean;
}) {
  const cfg = decisionConfig(verdict.decision);

  return (
    <div
      className={`
        flex flex-col items-center gap-4 py-8
        transition-all duration-700 ease-out
        ${revealed ? "opacity-100 scale-100" : "opacity-0 scale-90"}
      `}
      style={{
        boxShadow: revealed ? cfg.glow : "none",
      }}
    >
      {/* Big badge pill */}
      <div
        className={`
          flex items-center gap-3 px-8 py-4 rounded-2xl
          ${cfg.bg} ${cfg.border} border-2
          ${revealed ? "animate-[verdict-shake_0.5s_0.1s_ease_both]" : ""}
        `}
      >
        {cfg.icon}
        <span
          className={`font-mono font-bold text-3xl tracking-tight ${cfg.text}`}
          style={{ letterSpacing: "-0.04em" }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Score */}
      <div className="flex flex-col items-center gap-1">
        <div className="verdict-score text-center">
          {revealed ? (
            <CountUp value={verdict.weighted_score} decimals={0} delay={400} duration={1400} />
          ) : (
            "0"
          )}
          <span className="text-2xl text-[#3a3a3a] font-mono">/100</span>
        </div>
        <span className="text-xs font-mono tracking-widest text-[#5a5a5a] uppercase">
          Weighted Score
        </span>
      </div>
    </div>
  );
}

// ─── Score Breakdown ──────────────────────────────────────────────────────────

const SCORE_LABELS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "problem_clarity", label: "Problem Clarity" },
  { key: "market_size", label: "Market Size" },
  { key: "solution_strength", label: "Solution" },
  { key: "team", label: "Team" },
  { key: "traction", label: "Traction" },
  { key: "delivery", label: "Delivery" },
];

function ScoreBreakdownChart({ breakdown }: { breakdown: ScoreBreakdown }) {
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`rounded-2xl border border-[#1A3D28]/40 bg-[#0A1F12]/20 p-5 anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
      style={{ boxShadow: "0 1px 0 0 rgba(200,255,0,0.04) inset, 0 4px 32px rgba(0,0,0,0.5)" }}
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
          <Target className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
        </div>
        <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
          Score Breakdown
        </h3>
      </div>

      <div className="flex flex-col gap-4">
        {SCORE_LABELS.map(({ key, label }, i) => {
          const val = breakdown[key];
          return (
            <div key={key} className="flex items-center gap-4">
              <span className="text-sm text-[#a0a0a0] w-36 flex-shrink-0">{label}</span>
              <div className="flex-1">
                <ScoreBar score={val} max={10} delay={inView ? 200 + i * 100 : 9999} />
              </div>
              <span className={`text-sm font-mono font-semibold w-8 text-right flex-shrink-0 ${scoreColor(val)}`}>
                {val.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Investment Thesis ────────────────────────────────────────────────────────

function InvestmentThesis({ thesis }: { thesis: string }) {
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
    >
      <div className="rounded-2xl border border-[#1A3D28]/60 bg-[#0A1F12]/50 p-5"
        style={{ boxShadow: "0 1px 0 0 rgba(200,255,0,0.04) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
            <BookOpen className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Investment Thesis
          </h3>
        </div>
        <p className="text-sm text-[#a0a0a0] leading-relaxed">{thesis}</p>
      </div>
    </div>
  );
}

// ─── Strengths + Risks ────────────────────────────────────────────────────────

function StrengthsRisks({
  strengths,
  risks,
}: {
  strengths: string[];
  risks: string[];
}) {
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`grid grid-cols-2 gap-4 anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
    >
      {/* Strengths */}
      <div className="rounded-2xl border border-[#1A3D28]/60 bg-[#0A1F12]/50 p-5"
        style={{ boxShadow: "0 1px 0 0 rgba(200,255,0,0.04) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
            <CheckCircle2 className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Strengths
          </h3>
        </div>
        <ul className="flex flex-col gap-2.5">
          {strengths.map((s, i) => (
            <li key={i} className="flex gap-2.5 items-start">
              <CheckCircle2 className="size-3 flex-shrink-0 mt-0.5 text-[#C8FF00]/70" strokeWidth={2} />
              <span className="text-sm text-[#a0a0a0] leading-snug">{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Risks */}
      <div className="rounded-2xl border border-red-900/30 bg-red-950/10 p-5"
        style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-red-950/40 border border-red-900/30">
            <AlertCircle className="size-3 text-red-400" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Key Risks
          </h3>
        </div>
        <ul className="flex flex-col gap-2.5">
          {risks.map((r, i) => (
            <li key={i} className="flex gap-2.5 items-start">
              <AlertCircle className="size-3 flex-shrink-0 mt-0.5 text-red-400/70" strokeWidth={2} />
              <span className="text-sm text-[#a0a0a0] leading-snug">{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Pivot Recommendation ─────────────────────────────────────────────────────

function PivotRecommendation({ pivot }: { pivot: string }) {
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
    >
      <div className="rounded-2xl border border-amber-900/30 bg-[#1a1400]/40 p-5"
        style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#1a1400]/60 border border-yellow-900/30">
            <Lightbulb className="size-3 text-amber-400" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Recommended Pivot
          </h3>
        </div>
        <p className="text-sm text-[#a0a0a0] leading-relaxed">{pivot}</p>
      </div>
    </div>
  );
}

// ─── Next Steps ───────────────────────────────────────────────────────────────

function NextSteps({ steps }: { steps: string[] }) {
  const [ref, inView] = useInView();

  if (!steps || steps.length === 0) return null;

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
    >
      <div className="rounded-2xl border border-[#2a2a2a] bg-[#0e0e0e] p-5"
        style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
            <List className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Next Steps
          </h3>
        </div>
        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#0A1F12] border border-[#1A3D28]/60 text-[10px] font-mono text-[#C8FF00]/70 flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-[#a0a0a0] leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── Sources Panel ────────────────────────────────────────────────────────────

function SourcesPanel({ sources }: { sources: SourceCitation[] }) {
  const [open, setOpen] = useState(false);
  const [ref, inView] = useInView();

  if (!sources || sources.length === 0) return null;

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 rounded-2xl border border-[#2a2a2a] bg-[#0e0e0e] hover:border-[#1A3D28]/60 hover:bg-[#0A1F12]/20 transition-colors duration-150"
      >
        <span className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
          {sources.length} Sources Cited
        </span>
        <ChevronDown
          className={`size-4 text-[#5a5a5a] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${open ? "max-h-[600px] opacity-100 mt-2" : "max-h-0 opacity-0"}`}
      >
          <div className="rounded-2xl border border-[#1e1e1e] bg-[#0c0c0c] divide-y divide-[#1e1e1e]">
          {sources.map((source, i) => (
            <div key={i} className="px-5 py-3 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#a0a0a0] leading-snug">{source.claim}</p>
                {source.date && (
                  <p className="text-[10px] font-mono text-[#3a3a3a] mt-0.5">{source.date}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <ConfidenceBadge confidence={source.confidence} showLabel={false} />
                {source.url && <SourceLink url={source.url} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Pending state ────────────────────────────────────────────────────────────

function VerdictPending({ deliberationStatus }: { deliberationStatus: TaskStatusValue }) {
  const isRunning = deliberationStatus === "running";

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-5 text-center px-6">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#161616] border border-[#1e1e1e]">
        {isRunning ? (
          <Loader className="size-6 text-[#C8FF00] animate-spin" strokeWidth={1.5} />
        ) : (
          <Lock className="size-6 text-[#3a3a3a]" strokeWidth={1.5} />
        )}
      </div>
      <div>
        <h2 className="text-base font-semibold text-[#f0f0f0] mb-1">
          {isRunning ? "Deliberation in Progress" : "Awaiting Deliberation"}
        </h2>
        <p className="text-sm text-[#5a5a5a] max-w-sm leading-relaxed">
          {isRunning
            ? "The VC panel is deliberating. The verdict will appear here automatically when all rounds are complete."
            : "Complete the VC deliberation to unlock the final verdict."}
        </p>
      </div>
      {isRunning && (
        <div className="flex items-center gap-1.5 text-xs font-mono text-[#C8FF00]/50">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C8FF00]/50 animate-pulse inline-block" />
          Deliberating…
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface VerdictProps {
  verdict: FinalVerdict | null;
  deliberationStatus: TaskStatusValue;
}

export default function VerdictComponent({ verdict, deliberationStatus }: VerdictProps) {
  const [revealPhase, setRevealPhase] = useState<"hidden" | "overlay" | "badge" | "done">("hidden");
  const revealFired = useRef(false);

  // Trigger staged reveal when verdict becomes available
  useEffect(() => {
    if (!verdict || revealFired.current) return;
    revealFired.current = true;

    // Phase 1: start with overlay
    setRevealPhase("overlay");

    // Phase 2: show badge with glow after 800ms
    const t1 = setTimeout(() => setRevealPhase("badge"), 800);
    // Phase 3: unlock scroll content after badge animation
    const t2 = setTimeout(() => setRevealPhase("done"), 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [verdict]);

  if (!verdict) {
    return <VerdictPending deliberationStatus={deliberationStatus} />;
  }

  return (
    <div className="flex flex-col gap-8 pb-10 max-w-7xl mx-auto w-full">
      {/* Page header */}
      <div className="page-load-item" style={{ animationDelay: "0ms" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono tracking-[0.12em] text-[#C8FF00]/40 uppercase mb-2">
              Phase 5 — Final Verdict
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#f0f0f0] font-heading tracking-tight leading-tight">Final Verdict</h1>
            <p className="text-sm text-[#5a5a5a] mt-1.5 leading-relaxed">Investment decision from the VC panel</p>
          </div>
          <span className={`tag-pill ${decisionConfig(verdict.decision).tagClass} mt-1 flex-shrink-0`}>
            {verdict.decision}
          </span>
        </div>
      </div>

      {/* ── Staged reveal section ── */}
      <div
        className={`
          relative rounded-2xl border overflow-hidden
          transition-all duration-700
          ${decisionConfig(verdict.decision).border}
          ${revealPhase === "overlay" || revealPhase === "hidden" ? "bg-[#0a0a0a]" : "bg-[#0c0c0c]"}
        `}
      >
        {/* Overlay phase: "calculating" message */}
        {revealPhase === "overlay" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0a0a0a] animate-[fade-in_0.3s_ease_both]">
            <div className="w-4 h-4 rounded-full border-2 border-[#1e1e1e] border-t-[#C8FF00] animate-spin" />
            <p className="text-xs font-mono text-[#5a5a5a] tracking-widest uppercase">
              Calculating verdict…
            </p>
          </div>
        )}

        <VerdictBadge
          verdict={verdict}
          revealed={revealPhase === "badge" || revealPhase === "done"}
        />
      </div>

      {/* ── Content revealed after badge ── */}
      <div
        className={`
          flex flex-col gap-6
          transition-all duration-700
          ${revealPhase === "done" ? "opacity-100" : "opacity-0 pointer-events-none select-none"}
        `}
      >
        <ScoreBreakdownChart breakdown={verdict.score_breakdown} />
        <InvestmentThesis thesis={verdict.investment_thesis} />
        <StrengthsRisks strengths={verdict.strengths} risks={verdict.risks} />
        {verdict.recommended_pivot && (
          <PivotRecommendation pivot={verdict.recommended_pivot} />
        )}
        <NextSteps steps={verdict.next_steps} />
        <SourcesPanel sources={verdict.all_sources} />
      </div>
    </div>
  );
}
