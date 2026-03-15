// ─── MarketIntel ──────────────────────────────────────────────────────────────
// Phase 3 orchestrator component.
// States: idle (trigger CTA), running (skeleton), completed (data), failed (error+retry).
//
// Layout:
//   1. MarketSizeCard — TAM / SAM / SOM with animated bars + confidence
//   2. TailwindsHeadwinds — two-column green/red panel
//   3. CompetitorTable — sortable list with staggered entrance
//   4. PivotSuggestions — cards with precedent company + confidence

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Globe,
  Users,
  Lightbulb,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Zap,
} from "lucide-react";
import type { MarketIntel, Competitor, PivotSuggestion, TaskStatusValue } from "@/types/session";
import { useInView } from "@/hooks/useInView";
import { ScoreBar } from "@/components/ui/score-bar";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { SourceLink } from "@/components/ui/source-link";
import { PhaseShell } from "@/components/ui/phase-shell";

// ─── Market Size Card ─────────────────────────────────────────────────────────

function MarketSizeCard({ marketSize }: { marketSize: MarketIntel["market_size"] }) {
  const [ref, inView] = useInView();

  const segments = [
    { label: "TAM", sublabel: "Total Addressable", value: marketSize.tam, barPct: 1.0 },
    { label: "SAM", sublabel: "Serviceable", value: marketSize.sam, barPct: 0.55 },
    { label: "SOM", sublabel: "Obtainable", value: marketSize.som, barPct: 0.2 },
  ];

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-fade-up" : ""}`}
    >
      <div className="rounded-2xl border border-[#1A3D28]/50 bg-[#0A1F12]/30 p-5"
        style={{ boxShadow: "0 1px 0 0 rgba(200,255,0,0.04) inset, 0 4px 32px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
              <Globe className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
            </div>
            <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
              Market Size
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={marketSize.confidence} />
            {marketSize.source_url && <SourceLink url={marketSize.source_url} />}
          </div>
        </div>

        {/* TAM / SAM / SOM bars */}
        <div className="flex flex-col gap-4">
          {segments.map((seg, i) => (
            <div key={seg.label} className="flex items-center gap-4">
              {/* Label */}
              <div className="w-12 flex-shrink-0">
                <p className="text-xs font-mono font-semibold text-[#C8FF00]">{seg.label}</p>
                <p className="text-[10px] font-mono text-[#5a5a5a]">{seg.sublabel}</p>
              </div>
              {/* Bar + value */}
              <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-[#f0f0f0] leading-none">
                    {seg.value}
                  </span>
                </div>
                {inView && (
                  <ScoreBar
                    score={seg.barPct * 10}
                    max={10}
                    delay={300 + i * 120}
                    color={i === 0 ? "chartreuse" : "green"}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Analyst note */}
        {marketSize.analyst_note && (
          <p className="mt-4 text-xs text-[#5a5a5a] leading-relaxed border-t border-[#1e1e1e] pt-4">
            {marketSize.analyst_note}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tailwinds + Headwinds ────────────────────────────────────────────────────

function TailwindsHeadwinds({ whyNow }: { whyNow: MarketIntel["why_now"] }) {
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`grid grid-cols-2 gap-4 anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
    >
      {/* Tailwinds */}
      <div className="rounded-2xl border border-[#1A3D28]/60 bg-[#0A1F12]/50 p-5"
        style={{ boxShadow: "0 1px 0 0 rgba(200,255,0,0.04) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
            <TrendingUp className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Tailwinds
          </h3>
        </div>
        <ul className="flex flex-col gap-2.5">
          {whyNow.tailwinds.length === 0 ? (
            <li className="text-xs text-[#3a3a3a]">No tailwinds identified.</li>
          ) : (
            whyNow.tailwinds.map((t, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <TrendingUp className="size-3 flex-shrink-0 mt-0.5 text-[#C8FF00]/70" strokeWidth={2} />
                <span className="text-sm text-[#a0a0a0] leading-snug">{t}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Headwinds */}
      <div className="rounded-2xl border border-red-900/30 bg-red-950/10 p-5"
        style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-red-950/40 border border-red-900/30">
            <TrendingDown className="size-3 text-red-400" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Headwinds
          </h3>
        </div>
        <ul className="flex flex-col gap-2.5">
          {whyNow.headwinds.length === 0 ? (
            <li className="text-xs text-[#3a3a3a]">No headwinds identified.</li>
          ) : (
            whyNow.headwinds.map((h, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <TrendingDown className="size-3 flex-shrink-0 mt-0.5 text-red-400/70" strokeWidth={2} />
                <span className="text-sm text-[#a0a0a0] leading-snug">{h}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

// ─── Competitor Row ───────────────────────────────────────────────────────────

function CompetitorRow({
  competitor,
  animDelay,
}: {
  competitor: Competitor;
  animDelay: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-scale-up" : ""}`}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`
          w-full text-left rounded-2xl border bg-[#131313]
          transition-all duration-200
          ${expanded
            ? "border-[#C8FF00]/20 bg-[rgba(200,255,0,0.02)]"
            : "border-[#282828] hover:border-[#323232] hover:bg-[#161616]"}
        `}
        style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
      >
        <div className="flex items-center gap-4 p-4">
          {/* Name + funding */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[#f0f0f0]">{competitor.name}</span>
              {competitor.funding && (
                <span className="text-[10px] font-mono text-[#5a5a5a] bg-[#161616] border border-[#1e1e1e] rounded px-1.5 py-0.5">
                  {competitor.funding}
                </span>
              )}
            </div>
            <p className={`text-sm text-[#a0a0a0] mt-0.5 leading-snug ${expanded ? "" : "truncate"}`}>
              {competitor.description}
            </p>
          </div>

          {/* Right: confidence + source + expand */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <ConfidenceBadge confidence={competitor.confidence} showLabel={false} />
            {competitor.source_url && <SourceLink url={competitor.source_url} />}
            <ChevronRight
              className={`size-4 text-[#5a5a5a] transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
              strokeWidth={1.5}
            />
          </div>
        </div>
      </button>
    </div>
  );
}

function CompetitorTable({ competitors }: { competitors: Competitor[] }) {
  const [ref, inView] = useInView();

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
      <div className={`flex items-center justify-between mb-3 anim-hidden ${inView ? "anim-fade-up" : ""}`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
            <Users className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Competitors
          </h3>
        </div>
        <span className="text-xs font-mono text-[#5a5a5a]">{competitors.length} identified</span>
      </div>

      <div className="flex flex-col gap-2">
        {competitors.map((c, i) => (
          <CompetitorRow key={c.name} competitor={c} animDelay={i * 50} />
        ))}
      </div>
    </div>
  );
}

// ─── Pivot Suggestions ────────────────────────────────────────────────────────

function PivotCard({
  pivot,
  animDelay,
}: {
  pivot: PivotSuggestion;
  animDelay: number;
}) {
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-scale-up" : ""}`}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div className="rounded-2xl border border-amber-900/30 bg-amber-950/10 p-5 flex flex-col gap-3"
        style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 4px 24px rgba(0,0,0,0.45)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#1a1400]/60 border border-yellow-900/30 flex-shrink-0 mt-0.5">
            <Lightbulb className="size-3 text-amber-400" strokeWidth={1.5} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ConfidenceBadge confidence={pivot.confidence} showLabel={false} />
          </div>
        </div>

        {/* Suggestion */}
        <p className="text-sm font-semibold text-[#f0f0f0] leading-snug">{pivot.suggestion}</p>

        {/* Rationale */}
        <p className="text-sm text-[#a0a0a0] leading-relaxed">{pivot.rationale}</p>

        {/* Footer: precedent + source */}
          <div className="flex items-center justify-between pt-2 border-t border-amber-900/20">
          {pivot.precedent_company && (
            <span className="text-xs font-mono text-[#5a5a5a]">
              cf. <span className="text-[#a0a0a0]">{pivot.precedent_company}</span>
            </span>
          )}
          {pivot.source_url && <SourceLink url={pivot.source_url} />}
        </div>
      </div>
    </div>
  );
}

function PivotSuggestions({ pivots }: { pivots: PivotSuggestion[] }) {
  const [ref, inView] = useInView();

  if (!pivots || pivots.length === 0) return null;

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
      <div className={`flex items-center justify-between mb-3 anim-hidden ${inView ? "anim-fade-up" : ""}`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#1a1400]/60 border border-yellow-900/30">
            <Lightbulb className="size-3 text-amber-400" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Pivot Opportunities
          </h3>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {pivots.map((p, i) => (
          <PivotCard key={i} pivot={p} animDelay={i * 80} />
        ))}
      </div>
    </div>
  );
}

// ─── Running / Loading skeleton ───────────────────────────────────────────────

function MarketIntelLoading() {
  return (
    <div className="flex flex-col gap-6 pb-8 max-w-7xl mx-auto w-full animate-[fade-in_0.4s_ease_both]">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-28 rounded-md bg-[#161616] animate-pulse" />
          <div className="h-5 w-36 rounded-md bg-[#1e1e1e] animate-pulse" />
          <div className="h-3.5 w-52 rounded-md bg-[#161616] animate-pulse" />
        </div>
        <div className="h-6 w-20 rounded-full bg-[#1e1e1e] animate-pulse" />
      </div>

      {/* Market size skeleton */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 flex flex-col gap-4">
        <div className="h-3.5 w-24 rounded-md bg-[#1e1e1e] animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-12 flex-col gap-1 flex">
              <div className="h-3 w-8 rounded bg-[#1e1e1e] animate-pulse" />
              <div className="h-2.5 w-12 rounded bg-[#161616] animate-pulse" />
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-3.5 w-24 rounded-md bg-[#1e1e1e] animate-pulse" />
              <div className="h-1.5 w-full rounded-full bg-[#161616] animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Tailwinds skeleton */}
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 flex flex-col gap-3">
            <div className="h-3.5 w-20 rounded-md bg-[#1e1e1e] animate-pulse" />
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-3.5 w-full rounded-md bg-[#161616] animate-pulse" />
            ))}
          </div>
        ))}
      </div>

      {/* Competitor skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-3.5 w-24 rounded-md bg-[#1e1e1e] animate-pulse mb-2" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-4 flex items-center gap-4">
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-4 w-28 rounded-md bg-[#1e1e1e] animate-pulse" />
              <div className="h-3 w-full rounded-md bg-[#161616] animate-pulse" />
            </div>
            <div className="h-5 w-12 rounded-full bg-[#1e1e1e] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Status */}
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="w-3.5 h-3.5 rounded-full border-2 border-[#1e1e1e] border-t-[#C8FF00] animate-spin flex-shrink-0" />
        <p className="text-xs font-mono text-[#5a5a5a]">
          Researching competitors and market data… usually 30–60 seconds
        </p>
      </div>
    </div>
  );
}

// ─── Idle / CTA state ─────────────────────────────────────────────────────────

function MarketIntelIdle({
  canTrigger,
  onTrigger,
  isTriggering,
}: {
  canTrigger: boolean;
  onTrigger: () => void;
  isTriggering: boolean;
}) {
  const previews = [
    { icon: <Globe className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />, label: "TAM / SAM / SOM", desc: "Validated market sizing with analyst notes" },
    { icon: <TrendingUp className="size-3.5 text-emerald-400" strokeWidth={1.5} />, label: "Tailwinds & Headwinds", desc: "Macro timing signals for your sector" },
    { icon: <Users className="size-3.5 text-[#a0a0a0]" strokeWidth={1.5} />, label: "Competitor Map", desc: "Direct & indirect players with funding data" },
    { icon: <Lightbulb className="size-3.5 text-amber-400" strokeWidth={1.5} />, label: "Pivot Opportunities", desc: "Adjacent market angles with precedent companies" },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 px-6 animate-[phase-enter_0.4s_cubic-bezier(0.22,1,0.36,1)_both]">
      {/* Phase label + copy */}
      <div className="text-center max-w-md anim-hidden anim-fade-up anim-delay-100">
        <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase mb-3">
          Phase 3 — Market Intelligence
        </p>
        <h2 className="text-2xl font-semibold text-[#f0f0f0] font-heading mb-3">
          Validate your market
        </h2>
        <p className="text-sm text-[#5a5a5a] leading-relaxed">
          A deep research sweep on your market, competitive landscape, and timing signals — grounded with live Google Search data.
        </p>
      </div>

      {/* Feature preview grid */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg anim-hidden anim-fade-up anim-delay-200">
        {previews.map((p, i) => (
          <div
            key={p.label}
            className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-4 flex gap-3 items-start opacity-60"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[#161616] border border-[#1e1e1e] flex-shrink-0 mt-0.5">
              {p.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-[#c0c0c0]">{p.label}</p>
              <p className="text-xs text-[#5a5a5a] leading-snug mt-0.5">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-4 anim-hidden anim-fade-up anim-delay-300">
        {canTrigger ? (
          <>
            <button
              onClick={onTrigger}
              disabled={isTriggering}
              className="
                flex items-center gap-2 px-8 py-3.5 rounded-xl
                bg-[#C8FF00] text-black text-sm font-semibold
                hover:bg-[#D4FF33] transition-all duration-150
                active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                shadow-[0_0_40px_rgba(200,255,0,0.25)]
              "
            >
              {isTriggering ? (
                <>
                  <RefreshCw className="size-4 animate-spin" strokeWidth={2} />
                  Starting…
                </>
              ) : (
                <>
                  <Zap className="size-4" strokeWidth={2} />
                  Run Market Research
                </>
              )}
            </button>
            <p className="text-[11px] text-[#3a3a3a] font-mono">
              Powered by Google Search grounding · ~30–60 seconds
            </p>
          </>
        ) : (
          <p className="text-sm text-[#5a5a5a] max-w-sm text-center leading-relaxed">
            Complete the interview to enable market research.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Failed state ─────────────────────────────────────────────────────────────

function MarketIntelFailed({ error, onRetry }: { error?: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center px-6">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-red-950/40 border border-red-900/30">
        <AlertCircle className="size-5 text-red-400" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-[#f0f0f0] mb-1">Research Failed</h2>
        <p className="text-sm text-[#5a5a5a] max-w-xs leading-relaxed">
          {error ?? "Market research encountered an error."}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2a2a2a] text-sm text-[#a0a0a0] hover:border-[#3a3a3a] hover:text-[#f0f0f0] transition-colors duration-150"
      >
        <RefreshCw className="size-3.5" strokeWidth={1.5} />
        Try Again
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface MarketIntelProps {
  marketIntel: MarketIntel | null;
  status: TaskStatusValue;
  statusError?: string | null;
  /** Whether pitch context is available (enables the trigger button) */
  canTrigger: boolean;
  onTrigger: () => Promise<void>;
  onContinue?: () => void;
  nextPhaseLabel?: string;
  nextPhaseDescription?: string;
  /** Called to re-run market research when already completed */
  onRerun?: () => Promise<void>;
}

export default function MarketIntelComponent({
  marketIntel,
  status,
  statusError,
  canTrigger,
  onTrigger,
  onContinue,
  nextPhaseLabel,
  nextPhaseDescription,
  onRerun,
}: MarketIntelProps) {
  const [isTriggering, setIsTriggering] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);

  const handleTrigger = async () => {
    setIsTriggering(true);
    try {
      await onTrigger();
    } finally {
      setIsTriggering(false);
    }
  };

  const handleRerun = async () => {
    if (!onRerun) return;
    setIsRerunning(true);
    try {
      await onRerun();
    } finally {
      setIsRerunning(false);
    }
  };

  // Running state (show skeleton)
  if (status === "running") {
    return <MarketIntelLoading />;
  }

  // Failed state
  if (status === "failed") {
    return <MarketIntelFailed error={statusError} onRetry={handleTrigger} />;
  }

  // Idle or no data yet
  if (!marketIntel) {
    return (
      <MarketIntelIdle
        canTrigger={canTrigger}
        onTrigger={handleTrigger}
        isTriggering={isTriggering}
      />
    );
  }

  // Completed — full data display
  return (
    <PhaseShell
      title="Market Intelligence"
      subtitle="Grounded research on your market and competitive landscape"
      phaseLabel="Phase 3 — Market Intelligence"
      badge={
        <span className="tag-pill tag-pill-pass">
          Complete
        </span>
      }
      continueLabel={nextPhaseLabel}
      continueDescription={nextPhaseDescription}
      onContinue={onContinue}
      onRerun={onRerun ? handleRerun : undefined}
      isRerunning={isRerunning}
    >
      <MarketSizeCard marketSize={marketIntel.market_size} />
      <TailwindsHeadwinds whyNow={marketIntel.why_now} />
      {marketIntel.competitors.length > 0 && (
        <CompetitorTable competitors={marketIntel.competitors} />
      )}
      <PivotSuggestions pivots={marketIntel.pivot_suggestions} />
    </PhaseShell>
  );
}
