// ─── Deliberation ─────────────────────────────────────────────────────────────
// Phase 4 orchestrator component.
// States: idle (trigger CTA), running (live rounds + skeleton), completed (full thread).
//
// Layout:
//   1. RoundIndicator — "Round N of 3" stepper
//   2. DebateThread — scrollable list of PersonaBubbles grouped by round
//   3. Deliberation idle/loading/failed sub-states
//
// The backend writes debate_rounds incrementally, so rounds appear live during polling.

import { useState } from "react";
import {
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Users,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Loader,
} from "lucide-react";
import type { DebateRound, TaskStatusValue } from "@/types/session";
import { useInView } from "@/hooks/useInView";
import { PhaseShell } from "@/components/ui/phase-shell";
import { SourceLink } from "@/components/ui/source-link";

// ─── Persona config ────────────────────────────────────────────────────────────

interface PersonaConfig {
  name: string;
  role: string;
  colorClass: string;   // Tailwind text color
  borderClass: string;  // Tailwind border-l color
  dotBg: string;        // Tailwind bg color for indicator dot
  scoreColor: string;   // Tailwind text color for score
}

const PERSONAS: Record<"skeptic" | "optimist" | "operator", PersonaConfig> = {
  skeptic: {
    name: "Paul",
    role: "The Skeptic",
    colorClass: "text-red-400",
    borderClass: "border-red-500/40",
    dotBg: "bg-red-500",
    scoreColor: "text-red-400",
  },
  optimist: {
    name: "Elad",
    role: "The Optimist",
    colorClass: "text-emerald-400",
    borderClass: "border-emerald-500/40",
    dotBg: "bg-emerald-500",
    scoreColor: "text-emerald-400",
  },
  operator: {
    name: "Keith",
    role: "The Operator",
    colorClass: "text-blue-400",
    borderClass: "border-blue-500/40",
    dotBg: "bg-blue-500",
    scoreColor: "text-blue-400",
  },
};

// ─── Round Indicator ──────────────────────────────────────────────────────────

function RoundIndicator({
  totalRounds,
  currentRound,
  isRunning,
}: {
  totalRounds: number;
  currentRound: number;
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
        onClick={() => setOpen((v) => !v)}
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

// ─── Persona Bubble ───────────────────────────────────────────────────────────

interface PersonaBubbleProps {
  persona: "skeptic" | "optimist" | "operator";
  dialogue: string;
  score: number;
  objections?: string[];
  thesisPoints?: string[];
  executionRisks?: string[];
  analogies?: string[];
  questions?: string[];
  operationalQuestions?: string[];
  citedSources?: string[];
  animDelay?: number;
}

function PersonaBubble({
  persona,
  dialogue,
  score,
  objections,
  thesisPoints,
  executionRisks,
  analogies,
  questions,
  operationalQuestions,
  citedSources,
  animDelay = 0,
}: PersonaBubbleProps) {
  const cfg = PERSONAS[persona];
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-fade-up" : ""}`}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <div
        className={`
          rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5
          border-l-2 ${cfg.borderClass}
        `}
      >
        {/* Header: persona name + score */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotBg}`} />
            <div>
              <span className={`text-sm font-semibold ${cfg.colorClass}`}>{cfg.name}</span>
              <span className="text-xs text-[#5a5a5a] ml-2">{cfg.role}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px] font-mono text-[#3a3a3a] uppercase">Score</span>
            <span className={`text-sm font-mono font-semibold ${cfg.scoreColor}`}>
              {score}/10
            </span>
          </div>
        </div>

        {/* Dialogue */}
        <p className="text-sm text-[#c0c0c0] leading-relaxed">{dialogue}</p>

        {/* Expandable details */}
        {objections && (
          <ExpandableList label="Objections" items={objections} colorClass="text-red-400" />
        )}
        {thesisPoints && (
          <ExpandableList label="Thesis Points" items={thesisPoints} colorClass="text-emerald-400" />
        )}
        {analogies && (
          <ExpandableList label="Analogies" items={analogies} colorClass="text-emerald-400" />
        )}
        {executionRisks && (
          <ExpandableList label="Execution Risks" items={executionRisks} colorClass="text-blue-400" />
        )}
        {questions && (
          <ExpandableList label="Questions" items={questions} colorClass="text-red-300" />
        )}
        {operationalQuestions && (
          <ExpandableList label="Operational Questions" items={operationalQuestions} colorClass="text-blue-300" />
        )}

        {/* Cited sources */}
        {citedSources && citedSources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#1e1e1e] flex flex-wrap gap-2">
            {citedSources.map((url, i) =>
              url ? <SourceLink key={i} url={url} /> : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Debate Round Group ───────────────────────────────────────────────────────

function DebateRoundGroup({
  round,
  isLast,
  isRunning,
}: {
  round: DebateRound;
  isLast: boolean;
  isRunning: boolean;
}) {
  const [ref, inView] = useInView();

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className="flex flex-col gap-4">
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

      {/* Three persona bubbles */}
      <PersonaBubble
        persona="skeptic"
        dialogue={round.skeptic.dialogue}
        score={round.skeptic.score}
        objections={round.skeptic.objections}
        questions={round.skeptic.questions}
        citedSources={round.skeptic.cited_sources}
        animDelay={0}
      />
      <PersonaBubble
        persona="optimist"
        dialogue={round.optimist.dialogue}
        score={round.optimist.score}
        thesisPoints={round.optimist.thesis_points}
        analogies={round.optimist.analogies}
        citedSources={round.optimist.cited_sources}
        animDelay={60}
      />
      <PersonaBubble
        persona="operator"
        dialogue={round.operator.dialogue}
        score={round.operator.score}
        executionRisks={round.operator.execution_risks}
        operationalQuestions={round.operator.operational_questions}
        citedSources={round.operator.cited_sources}
        animDelay={120}
      />
    </div>
  );
}

// ─── Debate Thread ────────────────────────────────────────────────────────────

function DebateThread({
  rounds,
  isRunning,
}: {
  rounds: DebateRound[];
  isRunning: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      {rounds.map((round, i) => (
        <DebateRoundGroup
          key={round.round}
          round={round}
          isLast={i === rounds.length - 1}
          isRunning={isRunning}
        />
      ))}
    </div>
  );
}

// ─── Scores Summary Bar ───────────────────────────────────────────────────────

function ScoresSummary({ rounds }: { rounds: DebateRound[] }) {
  const [ref, inView] = useInView();

  // Average scores across all rounds per persona
  const avg = (key: "skeptic" | "optimist" | "operator") => {
    if (rounds.length === 0) return 0;
    return rounds.reduce((sum, r) => sum + r[key].score, 0) / rounds.length;
  };

  const personas: { key: "skeptic" | "optimist" | "operator"; cfg: PersonaConfig }[] = [
    { key: "skeptic", cfg: PERSONAS.skeptic },
    { key: "optimist", cfg: PERSONAS.optimist },
    { key: "operator", cfg: PERSONAS.operator },
  ];

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 anim-hidden ${inView ? "anim-fade-up" : ""}`}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#161616] border border-[#1e1e1e]">
          <Users className="size-3 text-[#a0a0a0]" strokeWidth={1.5} />
        </div>
        <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
          Panel Averages
        </h3>
      </div>
      <div className="flex flex-col gap-3">
        {personas.map(({ key, cfg }) => {
          const score = avg(key);
          const pct = (score / 10) * 100;
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-28 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotBg}`} />
                <span className="text-xs text-[#a0a0a0]">{cfg.name}</span>
              </div>
              <div className="flex-1 score-bar-track">
                <div
                  className={`score-bar-fill`}
                  style={{
                    width: inView ? `${pct}%` : "0%",
                    background:
                      key === "skeptic"
                        ? "#f87171"
                        : key === "optimist"
                        ? "#34d399"
                        : "#60a5fa",
                  }}
                />
              </div>
              <span className={`text-sm font-mono font-semibold w-10 text-right flex-shrink-0 ${cfg.scoreColor}`}>
                {score.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Running / Loading skeleton ───────────────────────────────────────────────

function DeliberationLoading({ completedRounds }: { completedRounds: number }) {
  return (
    <div className="flex flex-col gap-6 pb-8 animate-[fade-in_0.4s_ease_both]">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-36 rounded-md bg-[#1e1e1e] animate-pulse" />
          <div className="h-3.5 w-48 rounded-md bg-[#161616] animate-pulse" />
        </div>
        <div className="h-6 w-20 rounded-full bg-[#1e1e1e] animate-pulse" />
      </div>

      {/* Round indicator */}
      <RoundIndicator
        totalRounds={completedRounds}
        currentRound={completedRounds + 1}
        isRunning={true}
      />

      {/* Live rounds already available */}
      {completedRounds > 0 && (
        <p className="text-xs font-mono text-[#5a5a5a]">
          Scroll down to read completed rounds while the panel continues…
        </p>
      )}

      {/* Bubble skeletons */}
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 flex flex-col gap-3"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#2a2a2a] animate-pulse" />
                <div className="h-3.5 w-20 rounded bg-[#1e1e1e] animate-pulse" />
              </div>
              <div className="h-3.5 w-10 rounded bg-[#161616] animate-pulse" />
            </div>
            <div className="h-3 w-full rounded bg-[#161616] animate-pulse" />
            <div className="h-3 w-5/6 rounded bg-[#161616] animate-pulse" />
            <div className="h-3 w-4/6 rounded bg-[#161616] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Status */}
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="w-3.5 h-3.5 rounded-full border-2 border-[#1e1e1e] border-t-[#C8FF00] animate-spin flex-shrink-0" />
        <p className="text-xs font-mono text-[#5a5a5a]">
          {completedRounds === 0
            ? "VC panel is deliberating… usually 60–90 seconds"
            : `Round ${completedRounds + 1} of 3 in progress…`}
        </p>
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
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-5 text-center px-6">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#161616] border border-[#1e1e1e]">
        <MessageSquare className="size-6 text-[#C8FF00]" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-[#f0f0f0] mb-1">VC Deliberation</h2>
        <p className="text-sm text-[#5a5a5a] max-w-sm leading-relaxed">
          {canTrigger
            ? "Three AI investors — Paul (Skeptic), Elad (Optimist), and Keith (Operator) — will debate your startup across 3 adversarial rounds."
            : "Complete the interview to unlock the VC panel deliberation."}
        </p>
      </div>

      {canTrigger && (
        <button
          onClick={onTrigger}
          disabled={isTriggering}
          className="
            flex items-center gap-2 px-5 py-2.5 rounded-xl
            bg-[#C8FF00] text-black text-sm font-semibold
            hover:bg-[#D4FF33] transition-all duration-150
            active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
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
      )}

      {/* Persona hints */}
      {canTrigger && (
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            Paul · Skeptic
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            Elad · Optimist
          </span>
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
            Keith · Operator
          </span>
        </div>
      )}
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
  /** Whether pitch context is available (enables the trigger button) */
  canTrigger: boolean;
  onTrigger: () => Promise<void>;
  onContinue?: () => void;
  nextPhaseLabel?: string;
}

export default function DeliberationComponent({
  rounds,
  status,
  statusError,
  canTrigger,
  onTrigger,
  onContinue,
  nextPhaseLabel,
}: DeliberationProps) {
  const [isTriggering, setIsTriggering] = useState(false);

  const handleTrigger = async () => {
    setIsTriggering(true);
    try {
      await onTrigger();
    } finally {
      setIsTriggering(false);
    }
  };

  const isRunning = status === "running";

  // Running: show live rounds + skeleton for next round
  if (isRunning) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        {/* Header */}
        <div className="page-load-item" style={{ animationDelay: "0ms" }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-[#f0f0f0] font-heading">VC Deliberation</h1>
              <p className="text-sm text-[#5a5a5a] mt-0.5">3-round adversarial panel debate</p>
            </div>
            <span className="tag-pill tag-pill-neutral">Live</span>
          </div>
        </div>

        <RoundIndicator
          totalRounds={rounds.length}
          currentRound={rounds.length + 1}
          isRunning={true}
        />

        {/* Already-completed rounds */}
        {rounds.length > 0 && (
          <DebateThread rounds={rounds} isRunning={true} />
        )}

        {/* Loading skeleton for current round */}
        <DeliberationLoading completedRounds={rounds.length} />
      </div>
    );
  }

  // Failed state
  if (status === "failed") {
    return <DeliberationFailed error={statusError} onRetry={handleTrigger} />;
  }

  // Idle or no data yet
  if (rounds.length === 0) {
    return (
      <DeliberationIdle
        canTrigger={canTrigger}
        onTrigger={handleTrigger}
        isTriggering={isTriggering}
      />
    );
  }

  // Completed — full thread
  return (
    <PhaseShell
      title="VC Deliberation"
      subtitle="3-round adversarial panel debate"
      badge={
        <span className="tag-pill tag-pill-pass">Complete</span>
      }
      continueLabel={nextPhaseLabel}
      onContinue={onContinue}
    >
      <RoundIndicator
        totalRounds={rounds.length}
        currentRound={3}
        isRunning={false}
      />

      <ScoresSummary rounds={rounds} />

      <DebateThread rounds={rounds} isRunning={false} />
    </PhaseShell>
  );
}
