// ─── Dashboard Cards ──────────────────────────────────────────────────────────
// Three card variants:
//   HeroSessionCard  — full-width hero treatment for the most recent session
//   SessionCard      — compact 2-col card for the grid
//   NewSessionCard   — first card in grid, primary CTA

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Trash2,
  Loader,
  Mic,
  BarChart2,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
  Clock,
  MessageSquare,
  FileText,
} from "lucide-react";
import type { SessionSummary, ScoreBreakdown } from "@/types/session";
import { deriveSessionCardStatus } from "@/types/session";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function relativeTime(unixTs: number): string {
  const diffMs = Date.now() - unixTs * 1000;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

function verdictColor(decision: string | null): string {
  if (decision === "PASS") return "#C8FF00";
  if (decision === "SOFT PASS") return "#FACC15";
  if (decision === "NO") return "#F87171";
  return "#5a5a5a";
}

function scoreColor(score: number): string {
  if (score >= 70) return "#C8FF00";
  if (score >= 45) return "#FACC15";
  return "#F87171";
}

// ─── Verdict badge ────────────────────────────────────────────────────────────
function VerdictBadge({
  decision,
  size = "sm",
}: {
  decision: string;
  size?: "sm" | "lg";
}) {
  const map: Record<string, { label: string; cls: string }> = {
    PASS: {
      label: "PASS",
      cls: "bg-[#C8FF00]/10 text-[#C8FF00] border border-[#C8FF00]/25",
    },
    "SOFT PASS": {
      label: "SOFT PASS",
      cls: "bg-amber-400/10 text-amber-400 border border-amber-400/20",
    },
    NO: {
      label: "NO",
      cls: "bg-red-500/10 text-red-400 border border-red-500/20",
    },
  };
  const style = map[decision] ?? map["NO"];
  const sizeClass =
    size === "lg"
      ? "px-3 py-1 text-xs tracking-widest"
      : "px-2 py-0.5 text-[10px] tracking-wider";
  return (
    <span
      className={`inline-flex items-center rounded font-mono font-semibold ${sizeClass} ${style.cls}`}
    >
      {style.label}
    </span>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({
  summary,
  size = "sm",
}: {
  summary: SessionSummary;
  size?: "sm" | "lg";
}) {
  const status = deriveSessionCardStatus(summary);
  const map = {
    new: {
      icon: <Mic className={size === "lg" ? "size-3.5" : "size-3"} />,
      label: "Not started",
      cls: "text-[#5a5a5a]",
    },
    in_progress: {
      icon: <BarChart2 className={size === "lg" ? "size-3.5" : "size-3"} />,
      label: "In progress",
      cls: "text-amber-400/80",
    },
    analyzing: {
      icon: (
        <Loader
          className={`${size === "lg" ? "size-3.5" : "size-3"} animate-spin`}
        />
      ),
      label: "Analyzing",
      cls: "text-[#C8FF00]/70",
    },
    complete: {
      icon: <CheckCircle2 className={size === "lg" ? "size-3.5" : "size-3"} />,
      label: "Complete",
      cls: "text-[#C8FF00]/80",
    },
  };
  const { icon, label, cls } = map[status];
  const textSize = size === "lg" ? "text-xs" : "text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono ${textSize} ${cls}`}
    >
      {icon}
      {label}
    </span>
  );
}

// ─── Score bar row (for hero card) ────────────────────────────────────────────
function ScoreBarRow({
  label,
  value,
  max = 10,
  muted = false,
}: {
  label: string;
  value: number;
  max?: number;
  muted?: boolean;
}) {
  const pct = Math.round((value / max) * 100);
  const color =
    muted ? "#2a2a2a" : pct >= 70 ? "#C8FF00" : pct >= 45 ? "#FACC15" : "#F87171";
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-mono text-[#5a5a5a] tracking-wide uppercase w-28 flex-shrink-0 truncate">
        {label}
      </span>
      <div className="flex-1 h-[3px] bg-[#161616] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="text-[10px] font-mono w-5 text-right flex-shrink-0"
        style={{ color: muted ? "#3a3a3a" : color }}
      >
        {Math.round(value)}
      </span>
    </div>
  );
}

// ─── Phase progress dots (incomplete sessions) ────────────────────────────────
function PhaseDots({ summary }: { summary: SessionSummary }) {
  const phases = [
    {
      label: "Interview",
      done: summary.transcript_turns > 0,
      icon: <Mic className="size-3" />,
    },
    {
      label: "Deck",
      done: summary.deck_analysis_done,
      icon: <FileText className="size-3" />,
    },
    {
      label: "Market",
      done: summary.market_intel_status === "completed",
      icon: <BarChart2 className="size-3" />,
    },
    {
      label: "Deliberation",
      done: summary.deliberation_status === "completed",
      icon: <MessageSquare className="size-3" />,
    },
    {
      label: "Verdict",
      done: summary.verdict_decision != null,
      icon: <CheckCircle2 className="size-3" />,
    },
  ];
  const doneCount = phases.filter((p) => p.done).length;
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[10px] font-mono text-[#3a3a3a] tracking-widest uppercase">
        Progress — {doneCount}/5 phases
      </p>
      <div className="flex items-center gap-2">
        {phases.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono transition-colors ${
                p.done
                  ? "border-[#C8FF00]/20 bg-[#C8FF00]/5 text-[#C8FF00]/70"
                  : "border-[#1e1e1e] bg-transparent text-[#3a3a3a]"
              }`}
            >
              {p.icon}
              {p.label}
            </div>
            {i < phases.length - 1 && (
              <div
                className={`w-3 h-px ${
                  p.done ? "bg-[#C8FF00]/20" : "bg-[#1e1e1e]"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HeroSessionCard ──────────────────────────────────────────────────────────
// Full-width hero card for the most recently updated session.
// Shows full score breakdown if verdict exists, phase progress otherwise.

interface HeroSessionCardProps {
  summary: SessionSummary;
  scoreBreakdown?: ScoreBreakdown | null;
  onDelete: (id: string) => void;
}

export function HeroSessionCard({
  summary,
  scoreBreakdown,
  onDelete,
}: HeroSessionCardProps) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const companyName = summary.company_name || "Untitled Pitch";
  const oneLiner = summary.one_liner || "No description yet";
  const hasVerdict = summary.verdict_decision != null;
  const isAnalyzing =
    summary.market_intel_status === "running" ||
    summary.deliberation_status === "running";

  const handleOpen = useCallback(() => {
    navigate(`/app/session/${summary.session_id}`);
  }, [navigate, summary.session_id]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleConfirmDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleting(true);
      try {
        onDelete(summary.session_id);
      } finally {
        setDeleting(false);
        setConfirmDelete(false);
      }
    },
    [onDelete, summary.session_id]
  );

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  const accentColor = verdictColor(summary.verdict_decision);

  // Score breakdown rows (normalized 0-10 → display as 0-100)
  const scoreRows = scoreBreakdown
    ? [
        { label: "Problem clarity", value: scoreBreakdown.problem_clarity * 10 },
        { label: "Market size", value: scoreBreakdown.market_size * 10 },
        { label: "Solution strength", value: scoreBreakdown.solution_strength * 10 },
        { label: "Team", value: scoreBreakdown.team * 10 },
        { label: "Traction", value: scoreBreakdown.traction * 10 },
        { label: "Delivery", value: scoreBreakdown.delivery * 10 },
      ]
    : null;

  return (
    <div
      onClick={handleOpen}
      className={`group relative rounded-2xl border cursor-pointer overflow-hidden transition-all duration-300 ${
        hasVerdict
          ? "border-[#303030] hover:border-[#424242] bg-[#0f0f0f]"
          : "border-[#262626] hover:border-[#323232] bg-[#0b0b0b]"
      }`}
      style={{
        boxShadow: hasVerdict
          ? "0 1px 0 0 rgba(255,255,255,0.055) inset, 0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)"
          : "0 1px 0 0 rgba(255,255,255,0.035) inset, 0 6px 32px rgba(0,0,0,0.45), 0 1px 6px rgba(0,0,0,0.3)",
      }}
    >
      {/* Radial glow behind — only for completed sessions */}
      {hasVerdict && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 55% 80% at 15% 50%, ${accentColor}10 0%, transparent 62%)`,
          }}
        />
      )}

      {/* Top accent line */}
      <div
        className="h-px w-full"
        style={{
          background: hasVerdict
            ? `linear-gradient(to right, ${accentColor}60, ${accentColor}10, transparent)`
            : "#1e1e1e",
        }}
      />

      {/* Analyzing pulse at bottom */}
      {isAnalyzing && (
        <div className="absolute bottom-0 left-0 right-0 h-px">
          <div className="h-full bg-[#C8FF00]/40 animate-pulse" />
        </div>
      )}

      <div className="p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">

          {/* ── Left: identity ── */}
          <div className="flex-1 min-w-0">
            {/* Label row */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-mono text-[#3a3a3a] tracking-widest uppercase">
                Most recent
              </span>
              {summary.stage && (
                <span className="text-[10px] font-mono text-[#3a3a3a] px-2 py-0.5 rounded border border-[#1e1e1e] tracking-wider uppercase">
                  {summary.stage}
                </span>
              )}
            </div>

            {/* Company name */}
            <h2 className="text-2xl sm:text-3xl font-heading font-semibold text-[#f0f0f0] tracking-tight leading-tight mb-2 truncate">
              {companyName}
            </h2>

            {/* One-liner */}
            <p className="text-sm text-[#5a5a5a] leading-relaxed line-clamp-2 max-w-lg mb-4">
              {oneLiner}
            </p>

            {/* Last accessed */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#3a3a3a]">
              <Clock className="size-3" strokeWidth={1.5} />
              {relativeTime(summary.updated_at)}
            </div>
          </div>

          {/* ── Center: score bars or phase progress ── */}
          <div className="flex-1 min-w-0 max-w-sm">
            {hasVerdict && scoreRows ? (
              <div className="flex flex-col gap-2.5">
                {scoreRows.map((row) => (
                  <ScoreBarRow key={row.label} label={row.label} value={row.value} max={100} />
                ))}
              </div>
            ) : (
              <PhaseDots summary={summary} />
            )}
          </div>

          {/* ── Right: score + verdict + CTA ── */}
          <div className="flex flex-row lg:flex-col items-center lg:items-end gap-4 lg:gap-3 flex-shrink-0">
            {hasVerdict && summary.weighted_score != null ? (
              <div className="flex flex-col items-center lg:items-end gap-1.5">
                {/* Large score number */}
                <div className="flex items-baseline gap-1 leading-none">
                  <span
                    className="font-mono font-semibold tracking-tight"
                    style={{
                      fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
                      color: scoreColor(summary.weighted_score),
                      lineHeight: 1,
                    }}
                  >
                    {Math.round(summary.weighted_score)}
                  </span>
                  <span className="text-base font-mono text-[#3a3a3a]">/100</span>
                </div>
                <VerdictBadge decision={summary.verdict_decision!} size="lg" />
              </div>
            ) : (
              <div className="flex flex-col items-center lg:items-end gap-1.5">
                <StatusPill summary={summary} size="lg" />
              </div>
            )}

            {/* CTA button */}
            <button
              onClick={handleOpen}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                hasVerdict
                  ? "bg-[#C8FF00] text-black hover:bg-[#D4FF33]"
                  : "bg-[#161616] text-[#a0a0a0] border border-[#2a2a2a] hover:border-[#3a3a3a] hover:text-[#f0f0f0]"
              }`}
            >
              {hasVerdict ? "View results" : "Continue"}
              <ArrowRight className="size-3.5" strokeWidth={2} />
            </button>

            {/* Delete action */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 mt-1">
              {!confirmDelete ? (
                <button
                  onClick={handleDeleteClick}
                  className="p-1.5 rounded-md text-[#2a2a2a] hover:text-red-400 hover:bg-red-950/30 transition-colors"
                  title="Delete session"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : (
                <div
                  className="flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-[#5a5a5a] font-mono">Delete?</span>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={deleting}
                    className="px-2 py-1 rounded text-[10px] font-mono font-semibold bg-red-950/60 text-red-400 border border-red-900/50 hover:bg-red-950 transition-colors"
                  >
                    {deleting ? "..." : "Yes"}
                  </button>
                  <button
                    onClick={handleCancelDelete}
                    className="px-2 py-1 rounded text-[10px] font-mono font-semibold bg-[#1a1a1a] text-[#5a5a5a] border border-[#2a2a2a] hover:text-[#a0a0a0] transition-colors"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compact SessionCard (2-col grid) ─────────────────────────────────────────
interface SessionCardProps {
  summary: SessionSummary;
  onDelete: (id: string) => void;
}

export default function SessionCard({ summary, onDelete }: SessionCardProps) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const companyName = summary.company_name || "Untitled Pitch";
  const oneLiner = summary.one_liner || "No description yet";
  const hasVerdict = summary.verdict_decision != null;
  const accentColor = verdictColor(summary.verdict_decision);
  const isAnalyzing =
    summary.market_intel_status === "running" ||
    summary.deliberation_status === "running";

  const handleOpen = useCallback(() => {
    navigate(`/app/session/${summary.session_id}`);
  }, [navigate, summary.session_id]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleConfirmDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleting(true);
      try {
        onDelete(summary.session_id);
      } finally {
        setDeleting(false);
        setConfirmDelete(false);
      }
    },
    [onDelete, summary.session_id]
  );

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  return (
    <div
      onClick={handleOpen}
      className="group relative rounded-xl border border-[#272727] bg-[#0d0d0d] hover:border-[#343434] hover:bg-[#101010] transition-all duration-200 cursor-pointer overflow-hidden"
      style={{
        boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 4px 20px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)",
      }}
    >
      {/* Top accent line */}
      <div
        className="h-px w-full"
        style={{
          background: hasVerdict
            ? `${accentColor}40`
            : "#1e1e1e",
        }}
      />

      {/* Analyzing pulse */}
      {isAnalyzing && (
        <div className="absolute bottom-0 left-0 right-0 h-px">
          <div className="h-full bg-[#C8FF00]/40 animate-pulse" />
        </div>
      )}

      <div className="p-5">
        {/* Top row: avatar + name + actions */}
        <div className="flex items-start gap-3 mb-4">
          {/* Avatar */}
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#141414] border border-[#2a2a2a] flex items-center justify-center">
            <span className="text-xs font-semibold text-[#5a5a5a] font-mono uppercase">
              {companyName.charAt(0)}
            </span>
          </div>

          {/* Name + one-liner */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[#e8e8e8] font-heading leading-snug truncate mb-0.5">
              {companyName}
            </h3>
            <p className="text-[11px] text-[#5a5a5a] leading-snug line-clamp-2">
              {oneLiner}
            </p>
          </div>

          {/* Hover actions */}
          <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {!confirmDelete ? (
              <button
                onClick={handleDeleteClick}
                className="p-1.5 rounded-md text-[#3a3a3a] hover:text-red-400 hover:bg-red-950/30 transition-colors"
                title="Delete session"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : (
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="px-2 py-1 rounded text-[10px] font-mono font-semibold bg-red-950/60 text-red-400 border border-red-900/50 hover:bg-red-950 transition-colors"
                >
                  {deleting ? "..." : "Delete?"}
                </button>
                <button
                  onClick={handleCancelDelete}
                  className="px-2 py-1 rounded text-[10px] font-mono font-semibold bg-[#1a1a1a] text-[#5a5a5a] border border-[#2a2a2a] hover:text-[#a0a0a0] transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom row: score + verdict/status + time + arrow */}
        <div className="flex items-end justify-between">
          <div className="flex items-center gap-3">
            {/* Score — large mono number */}
            {summary.weighted_score != null ? (
              <div className="flex items-baseline gap-0.5 leading-none">
                <span
                  className="text-2xl font-mono font-semibold leading-none"
                  style={{ color: scoreColor(summary.weighted_score) }}
                >
                  {Math.round(summary.weighted_score)}
                </span>
                <span className="text-[10px] font-mono text-[#3a3a3a] leading-none mb-0.5">
                  /100
                </span>
              </div>
            ) : (
              <div className="flex items-baseline gap-0.5 leading-none">
                <span className="text-2xl font-mono font-semibold leading-none text-[#2a2a2a]">
                  —
                </span>
              </div>
            )}

            {/* Verdict / status + time stacked */}
            <div className="flex flex-col gap-1">
              {hasVerdict ? (
                <VerdictBadge decision={summary.verdict_decision!} />
              ) : (
                <StatusPill summary={summary} />
              )}
              <div className="flex items-center gap-1 text-[10px] font-mono text-[#3a3a3a]">
                <Clock className="size-2.5" strokeWidth={1.5} />
                {relativeTime(summary.updated_at)}
              </div>
            </div>
          </div>

          {/* Stage + open arrow */}
          <div className="flex flex-col items-end gap-1.5">
            {summary.stage && (
              <span className="text-[9px] font-mono text-[#3a3a3a] uppercase tracking-widest">
                {summary.stage}
              </span>
            )}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="size-4 text-[#C8FF00]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NewSessionCard ────────────────────────────────────────────────────────────
export function NewSessionCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative rounded-xl border border-dashed border-[#2e2e2e] bg-[#0a0a0a] hover:border-[#C8FF00]/30 hover:bg-[#C8FF00]/[0.025] transition-all duration-250 cursor-pointer overflow-hidden flex flex-col items-center justify-center gap-4 p-6"
      style={{
        minHeight: 160,
        boxShadow: "0 1px 0 0 rgba(255,255,255,0.025) inset, 0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      {/* Glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(200,255,0,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="w-10 h-10 rounded-xl border border-[#2a2a2a] group-hover:border-[#C8FF00]/25 flex items-center justify-center transition-colors duration-200 relative">
        <Sparkles
          className="size-4 text-[#3a3a3a] group-hover:text-[#C8FF00]/70 transition-colors duration-200"
          strokeWidth={1.5}
        />
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-[#3a3a3a] group-hover:text-[#f0f0f0] transition-colors duration-200 font-heading mb-0.5">
          New pitch session
        </p>
        <p className="text-xs text-[#2a2a2a] group-hover:text-[#5a5a5a] transition-colors duration-200">
          Upload a deck · pitch to Sam
        </p>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#2a2a2a] group-hover:text-[#C8FF00]/50 transition-colors duration-200">
        <ArrowUpRight className="size-3" />
        Start evaluation
      </div>
    </button>
  );
}
