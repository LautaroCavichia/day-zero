// ─── Deliberation ─────────────────────────────────────────────────────────────
// Phase 4 orchestrator component.
// States: idle (trigger CTA), running (live rounds + skeleton), completed (full thread).
//
// Completed layout:
//   1. Overview panel — score trajectories, consensus bar
//   2. 3-column persona layout — one column per persona showing arc across all rounds
//
// The backend writes debate_rounds incrementally, so rounds appear live during polling.

import { useState } from "react";
import {
  RefreshCw,
  AlertCircle,
  Users,
  Loader,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
} from "lucide-react";
import type { DebateRound, TaskStatusValue } from "@/types/session";
import { useInView } from "@/hooks/useInView";
import { PhaseShell } from "@/components/ui/phase-shell";
import { SourceLink } from "@/components/ui/source-link";

// ─── Persona config ────────────────────────────────────────────────────────────

interface PersonaConfig {
  name: string;
  role: string;
  colorClass: string;
  borderClass: string;
  dotBg: string;
  scoreColor: string;
  bgClass: string;
  colBg: string;
}

const PERSONAS: Record<"skeptic" | "optimist" | "operator", PersonaConfig> = {
  skeptic: {
    name: "Paul",
    role: "The Skeptic",
    colorClass: "text-red-400",
    borderClass: "border-red-500/40",
    dotBg: "bg-red-500",
    scoreColor: "text-red-400",
    bgClass: "bg-red-950/10",
    colBg: "bg-red-950/5 border-red-900/20",
  },
  optimist: {
    name: "Elad",
    role: "The Optimist",
    colorClass: "text-emerald-400",
    borderClass: "border-emerald-500/40",
    dotBg: "bg-emerald-500",
    scoreColor: "text-emerald-400",
    bgClass: "bg-emerald-950/10",
    colBg: "bg-emerald-950/5 border-emerald-900/20",
  },
  operator: {
    name: "Keith",
    role: "The Operator",
    colorClass: "text-blue-400",
    borderClass: "border-blue-500/40",
    dotBg: "bg-blue-500",
    scoreColor: "text-blue-400",
    bgClass: "bg-blue-950/10",
    colBg: "bg-blue-950/5 border-blue-900/20",
  },
};

type PersonaKey = "skeptic" | "optimist" | "operator";

// ─── Round Indicator ──────────────────────────────────────────────────────────

function RoundIndicator({
  totalRounds,
  isRunning,
}: {
  totalRounds: number;
  isRunning: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((r) => {
          const isDone = r <= totalRounds;
          const isActive = isRunning && r === totalRounds + 1;
          return (
            <div
              key={r}
              className={`
                flex items-center justify-center w-5 h-5 rounded-full
                text-[10px] font-mono font-semibold
                transition-all duration-300
                ${isDone
                  ? "bg-[#C8FF00] text-black"
                  : isActive
                    ? "bg-[#C8FF00]/20 border border-[#C8FF00]/50 text-[#C8FF00] animate-pulse"
                    : "bg-[#161616] border border-[#2a2a2a] text-[#3a3a3a]"
                }
              `}
            >
              {r}
            </div>
          );
        })}
      </div>
      <span className="text-xs font-mono text-[#5a5a5a]">
        {isRunning
          ? `Round ${Math.min(totalRounds + 1, 3)} in progress…`
          : `${totalRounds} / 3 rounds complete`}
      </span>
    </div>
  );
}

// ─── Expandable bullet list ───────────────────────────────────────────────────

function ExpandableList({
  label,
  items,
  colorClass,
}: {
  label: string;
  items: string[];
  colorClass: string;
}) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase hover:text-[#a0a0a0] transition-colors duration-150"
      >
        <ChevronDown
          className={`size-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
        {label} ({items.length})
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-[400px] opacity-100 mt-2" : "max-h-0 opacity-0"}`}
      >
        <ul className="flex flex-col gap-1.5 pl-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span className={`text-[10px] mt-0.5 flex-shrink-0 ${colorClass}`}>▸</span>
              <span className="text-xs text-[#a0a0a0] leading-snug">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Score sparkline (mini trend line using divs) ─────────────────────────────

function ScoreTrend({ scores, colorClass }: { scores: number[]; colorClass: string }) {
  if (scores.length === 0) return null;

  const last = scores[scores.length - 1];
  const first = scores[0];
  const delta = last - first;

  const TrendIcon =
    delta > 0.4 ? TrendingUp : delta < -0.4 ? TrendingDown : Minus;

  return (
    <div className="flex items-center gap-2">
      {/* Mini bar sparkline */}
      <div className="flex items-end gap-0.5 h-5">
        {scores.map((score, i) => (
          <div
            key={i}
            className={`w-3 rounded-sm transition-all duration-700 opacity-80 ${colorClass.replace("text-", "bg-")}`}
            style={{ height: `${Math.round((score / 10) * 100)}%` }}
          />
        ))}
      </div>
      <TrendIcon
        className={`size-3 ${delta > 0.4 ? "text-[#C8FF00]" : delta < -0.4 ? "text-red-400" : "text-[#5a5a5a]"}`}
        strokeWidth={2}
      />
    </div>
  );
}

// ─── Persona column round card ────────────────────────────────────────────────

interface PersonaRoundCardProps {
  persona: PersonaKey;
  round: DebateRound;
  roundIndex: number;
  isLast: boolean;
  isRunning: boolean;
}

function PersonaRoundCard({ persona, round, roundIndex, isLast, isRunning }: PersonaRoundCardProps) {
  const cfg = PERSONAS[persona];
  const [expanded, setExpanded] = useState(roundIndex === 0);
  const data = round[persona];

  const objections = persona === "skeptic" ? (round.skeptic.objections ?? []) : [];
  const questions = persona === "skeptic" ? (round.skeptic.questions ?? []) : [];
  const thesisPoints = persona === "optimist" ? (round.optimist.thesis_points ?? []) : [];
  const analogies = persona === "optimist" ? (round.optimist.analogies ?? []) : [];
  const executionRisks = persona === "operator" ? (round.operator.execution_risks ?? []) : [];
  const operationalQuestions = persona === "operator" ? (round.operator.operational_questions ?? []) : [];
  const citedSources = data.cited_sources ?? [];

  return (
    <div className={`rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#0f0f0f] transition-colors duration-150"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#3a3a3a] uppercase tracking-widest">
            Round {round.round}
          </span>
          {isLast && isRunning && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[#C8FF00]/50">
              <Loader className="size-2.5 animate-spin" strokeWidth={1.5} />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-mono font-bold ${cfg.scoreColor}`}>
            {data.score}
            <span className="text-[10px] font-normal text-[#3a3a3a]">/10</span>
          </span>
          <ChevronDown
            className={`size-3.5 text-[#3a3a3a] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            strokeWidth={1.5}
          />
        </div>
      </button>

      {/* Body */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          expanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4 border-t border-[#1a1a1a] pt-3 flex flex-col gap-3">
          <p className="text-xs text-[#c0c0c0] leading-relaxed">{data.dialogue}</p>

          {/* Expandable detail lists */}
          {objections.length > 0 && (
            <ExpandableList label="Objections" items={objections} colorClass="text-red-400" />
          )}
          {questions.length > 0 && (
            <ExpandableList label="Questions" items={questions} colorClass="text-red-300" />
          )}
          {thesisPoints.length > 0 && (
            <ExpandableList label="Thesis Points" items={thesisPoints} colorClass="text-emerald-400" />
          )}
          {analogies.length > 0 && (
            <ExpandableList label="Analogies" items={analogies} colorClass="text-emerald-400" />
          )}
          {executionRisks.length > 0 && (
            <ExpandableList label="Execution Risks" items={executionRisks} colorClass="text-blue-400" />
          )}
          {operationalQuestions.length > 0 && (
            <ExpandableList label="Op. Questions" items={operationalQuestions} colorClass="text-blue-300" />
          )}

          {/* Cited sources */}
          {citedSources.length > 0 && (
            <div className="pt-2 border-t border-[#1a1a1a] flex flex-wrap gap-1.5">
              {citedSources.map((url, i) =>
                url ? <SourceLink key={i} url={url} /> : null
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Persona column (for completed layout) ────────────────────────────────────

function PersonaColumn({
  persona,
  rounds,
}: {
  persona: PersonaKey;
  rounds: DebateRound[];
}) {
  const cfg = PERSONAS[persona];
  const [ref, inView] = useInView();
  const scores = rounds.map((r) => r[persona].score);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`flex flex-col gap-3 anim-hidden ${inView ? "anim-fade-up" : ""}`}
    >
      {/* Column header */}
      <div className={`rounded-xl border ${cfg.colBg} p-4 flex flex-col gap-2`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dotBg}`} />
            <div>
              <p className={`text-sm font-semibold ${cfg.colorClass}`}>{cfg.name}</p>
              <p className="text-[10px] text-[#5a5a5a] font-mono">{cfg.role}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-xl font-mono font-bold ${cfg.scoreColor}`}>
              {avgScore.toFixed(1)}
            </p>
            <p className="text-[9px] font-mono text-[#3a3a3a] uppercase tracking-wide">avg / 10</p>
          </div>
        </div>
        {scores.length > 1 && (
          <ScoreTrend scores={scores} colorClass={cfg.scoreColor} />
        )}
      </div>

      {/* Round cards */}
      <div className="flex flex-col gap-2">
        {rounds.map((round, i) => (
          <PersonaRoundCard
            key={round.round}
            persona={persona}
            round={round}
            roundIndex={i}
            isLast={i === rounds.length - 1}
            isRunning={false}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Overview panel (completed state) ────────────────────────────────────────

function OverviewPanel({ rounds }: { rounds: DebateRound[] }) {
  const [ref, inView] = useInView();

  const personas: PersonaKey[] = ["skeptic", "optimist", "operator"];
  const avgAll = personas.reduce((sum, p) => {
    const avg = rounds.reduce((s, r) => s + r[p].score, 0) / rounds.length;
    return sum + avg;
  }, 0) / personas.length;

  // Consensus: how close are the three personas to each other in final round?
  const lastRound = rounds[rounds.length - 1];
  const lastScores = [lastRound.skeptic.score, lastRound.optimist.score, lastRound.operator.score];
  const maxDelta = Math.max(...lastScores) - Math.min(...lastScores);
  const consensusLevel = maxDelta <= 1.5 ? "High" : maxDelta <= 3 ? "Moderate" : "Divided";
  const consensusColor =
    consensusLevel === "High"
      ? "text-[#C8FF00]"
      : consensusLevel === "Moderate"
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 anim-hidden ${inView ? "anim-fade-up" : ""}`}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
          <Users className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
        </div>
        <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
          Panel Overview
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Panel average */}
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-mono text-[#3a3a3a] uppercase tracking-widest">
            Panel Avg
          </p>
          <p className="text-2xl font-mono font-bold text-[#f0f0f0]">
            {avgAll.toFixed(1)}
            <span className="text-sm text-[#3a3a3a] font-normal">/10</span>
          </p>
        </div>

        {/* Per-persona averages */}
        <div className="flex flex-col gap-2 col-span-1">
          <p className="text-[10px] font-mono text-[#3a3a3a] uppercase tracking-widest">
            Per Persona
          </p>
          {personas.map((p) => {
            const cfg = PERSONAS[p];
            const avg = rounds.reduce((s, r) => s + r[p].score, 0) / rounds.length;
            return (
              <div key={p} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dotBg}`} />
                <span className="text-[10px] text-[#5a5a5a] w-10">{cfg.name}</span>
                <div className="flex-1 h-1 rounded-full bg-[#1a1a1a] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${cfg.dotBg.replace("bg-", "bg-")}`}
                    style={{ width: inView ? `${(avg / 10) * 100}%` : "0%" }}
                  />
                </div>
                <span className={`text-[10px] font-mono ${cfg.scoreColor} w-6 text-right`}>
                  {avg.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Consensus */}
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-mono text-[#3a3a3a] uppercase tracking-widest">
            Consensus
          </p>
          <p className={`text-lg font-mono font-bold ${consensusColor}`}>{consensusLevel}</p>
          <p className="text-[10px] text-[#3a3a3a] font-mono leading-snug">
            {consensusLevel === "High"
              ? "Panel largely agrees"
              : consensusLevel === "Moderate"
              ? "Some disagreement"
              : "Sharp disagreement"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Running / Loading skeleton ───────────────────────────────────────────────

function DeliberationLoading({ completedRounds }: { completedRounds: number }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Bubble skeletons — one per persona */}
      <div className="grid grid-cols-3 gap-4">
        {[PERSONAS.skeptic, PERSONAS.optimist, PERSONAS.operator].map((cfg, i) => (
          <div
            key={cfg.name}
            className={`rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-4 flex flex-col gap-3`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${cfg.dotBg} opacity-30 animate-pulse`} />
              <div className="h-3 w-16 rounded bg-[#1e1e1e] animate-pulse" />
            </div>
            <div className="h-3 w-full rounded bg-[#161616] animate-pulse" />
            <div className="h-3 w-5/6 rounded bg-[#161616] animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-[#161616] animate-pulse" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 py-2">
        <div className="w-3 h-3 rounded-full border-2 border-[#1e1e1e] border-t-[#C8FF00] animate-spin flex-shrink-0" />
        <p className="text-xs font-mono text-[#5a5a5a]">
          {completedRounds === 0
            ? "VC panel is deliberating… usually 60–90 seconds"
            : `Round ${completedRounds + 1} of 3 in progress…`}
        </p>
      </div>
    </div>
  );
}

// ─── Running: live 3-col view for in-progress rounds ─────────────────────────

function LiveRoundRow({
  round,
  isLast,
  isRunning,
}: {
  round: DebateRound;
  isLast: boolean;
  isRunning: boolean;
}) {
  const [ref, inView] = useInView();
  const personas: PersonaKey[] = ["skeptic", "optimist", "operator"];

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className="flex flex-col gap-3">
      {/* Round label */}
      <div className={`flex items-center gap-3 anim-hidden ${inView ? "anim-fade-up" : ""}`}>
        <span className="text-[10px] font-mono tracking-widest text-[#3a3a3a] uppercase">
          Round {round.round}
        </span>
        <div className="flex-1 h-px bg-[#1e1e1e]" />
        {isLast && isRunning && (
          <div className="flex items-center gap-1.5">
            <Loader className="size-3 text-[#C8FF00]/50 animate-spin" strokeWidth={1.5} />
            <span className="text-[10px] font-mono text-[#C8FF00]/50">In progress</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {personas.map((persona, i) => {
          const cfg = PERSONAS[persona];
          const data = round[persona];
          return (
            <div
              key={persona}
              className={`rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] border-l-2 ${cfg.borderClass} p-4 flex flex-col gap-2 anim-hidden ${inView ? "anim-fade-up" : ""}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${cfg.dotBg}`} />
                  <span className={`text-xs font-semibold ${cfg.colorClass}`}>{cfg.name}</span>
                </div>
                <span className={`text-xs font-mono font-bold ${cfg.scoreColor}`}>{data.score}/10</span>
              </div>
              <p className="text-xs text-[#a0a0a0] leading-relaxed line-clamp-4">{data.dialogue}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Idle / CTA state ─────────────────────────────────────────────────────────

function DeliberationIdle({
  canTrigger,
  onTrigger,
  isTriggering,
}: {
  canTrigger: boolean;
  onTrigger: () => void;
  isTriggering: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-8 px-6 animate-[phase-enter_0.4s_cubic-bezier(0.22,1,0.36,1)_both]">
      {/* Phase label + copy */}
      <div className="text-center max-w-md anim-hidden anim-fade-up anim-delay-100">
        <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase mb-3">
          Phase 4 — VC Deliberation
        </p>
        <h2 className="text-2xl font-semibold text-[#f0f0f0] font-heading mb-3">
          The panel deliberates
        </h2>
        <p className="text-sm text-[#5a5a5a] leading-relaxed">
          Three AI investors debate your startup across 3 adversarial rounds — escalating pressure each round — to reach an investment decision.
        </p>
      </div>

      {/* Persona trio visual */}
      <div className="flex items-end gap-3 anim-hidden anim-fade-up anim-delay-200">
        {[PERSONAS.skeptic, PERSONAS.optimist, PERSONAS.operator].map((cfg) => (
          <div
            key={cfg.name}
            className={`flex flex-col items-center gap-2 px-5 py-4 rounded-xl border ${cfg.colBg} opacity-70`}
          >
            <div className={`w-3 h-3 rounded-full ${cfg.dotBg}`} />
            <p className={`text-xs font-semibold ${cfg.colorClass}`}>{cfg.name}</p>
            <p className="text-[10px] text-[#5a5a5a] text-center leading-snug max-w-[80px]">{cfg.role}</p>
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
                  <Users className="size-4" strokeWidth={2} />
                  Start Deliberation
                </>
              )}
            </button>
            <p className="text-[11px] text-[#3a3a3a] font-mono">~60–90 seconds · results stream in live</p>
          </>
        ) : (
          <p className="text-sm text-[#5a5a5a] max-w-sm text-center leading-relaxed">
            Complete the interview to unlock the VC panel deliberation.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Failed state ─────────────────────────────────────────────────────────────

function DeliberationFailed({ error, onRetry }: { error?: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center px-6">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-red-950/40 border border-red-900/30">
        <AlertCircle className="size-5 text-red-400" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-[#f0f0f0] mb-1">Deliberation Failed</h2>
        <p className="text-sm text-[#5a5a5a] max-w-xs leading-relaxed">
          {error ?? "The VC panel encountered an error during deliberation."}
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

interface DeliberationProps {
  rounds: DebateRound[];
  status: TaskStatusValue;
  statusError?: string | null;
  canTrigger: boolean;
  onTrigger: () => Promise<void>;
  onContinue?: () => void;
  nextPhaseLabel?: string;
  nextPhaseDescription?: string;
  onRerun?: () => Promise<void>;
}

export default function DeliberationComponent({
  rounds,
  status,
  statusError,
  canTrigger,
  onTrigger,
  onContinue,
  nextPhaseLabel,
  nextPhaseDescription,
  onRerun,
}: DeliberationProps) {
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

  const isRunning = status === "running";

  // ── Running state ──────────────────────────────────────────────────────────
  if (isRunning) {
    return (
      <div className="flex flex-col gap-6 pb-8 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="page-load-item" style={{ animationDelay: "0ms" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase mb-1">
                Phase 4 — VC Deliberation
              </p>
              <h1 className="text-lg font-semibold text-[#f0f0f0] font-heading">VC Deliberation</h1>
              <p className="text-sm text-[#5a5a5a] mt-0.5">3-round adversarial panel debate</p>
            </div>
            <span className="tag-pill tag-pill-neutral">Live</span>
          </div>
        </div>

        <RoundIndicator totalRounds={rounds.length} isRunning={true} />

        {/* Already-completed rounds in 3-col layout */}
        {rounds.length > 0 && (
          <div className="flex flex-col gap-6">
            {rounds.map((round, i) => (
              <LiveRoundRow
                key={round.round}
                round={round}
                isLast={i === rounds.length - 1}
                isRunning={true}
              />
            ))}
          </div>
        )}

        {/* Loading skeleton for current round */}
        <DeliberationLoading completedRounds={rounds.length} />
      </div>
    );
  }

  // ── Failed state ───────────────────────────────────────────────────────────
  if (status === "failed") {
    return <DeliberationFailed error={statusError} onRetry={handleTrigger} />;
  }

  // ── Idle / no data ─────────────────────────────────────────────────────────
  if (rounds.length === 0) {
    return (
      <DeliberationIdle
        canTrigger={canTrigger}
        onTrigger={handleTrigger}
        isTriggering={isTriggering}
      />
    );
  }

  // ── Completed — 3-column persona layout ───────────────────────────────────
  return (
    <PhaseShell
      title="VC Deliberation"
      subtitle="3-round adversarial panel debate"
      phaseLabel="Phase 4 — VC Deliberation"
      badge={
        <span className="tag-pill tag-pill-pass">Complete</span>
      }
      continueLabel={nextPhaseLabel}
      continueDescription={nextPhaseDescription}
      onContinue={onContinue}
      onRerun={onRerun ? handleRerun : undefined}
      isRerunning={isRerunning}
    >
      <RoundIndicator totalRounds={rounds.length} isRunning={false} />

      <OverviewPanel rounds={rounds} />

      {/* 3-column persona layout */}
      <div className="grid grid-cols-3 gap-4">
        <PersonaColumn persona="skeptic" rounds={rounds} />
        <PersonaColumn persona="optimist" rounds={rounds} />
        <PersonaColumn persona="operator" rounds={rounds} />
      </div>
    </PhaseShell>
  );
}
