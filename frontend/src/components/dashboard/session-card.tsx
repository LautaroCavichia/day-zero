// ─── SessionCard ──────────────────────────────────────────────────────────────
// A single session summary card for the dashboard grid.
// Shows company name, verdict badge, score, relative time, and status pill.

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
} from "lucide-react";
import type { SessionSummary } from "@/types/session";
import { deriveSessionCardStatus } from "@/types/session";

// ─── Verdict badge ────────────────────────────────────────────────────────────
function VerdictBadge({ decision }: { decision: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PASS: {
      label: "PASS",
      cls: "bg-[#C8FF00]/15 text-[#C8FF00] border border-[#C8FF00]/30",
    },
    "SOFT PASS": {
      label: "SOFT PASS",
      cls: "bg-amber-400/10 text-amber-400 border border-amber-400/25",
    },
    NO: {
      label: "NO",
      cls: "bg-red-500/10 text-red-400 border border-red-500/25",
    },
  };
  const style = map[decision] ?? map["NO"];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wider ${style.cls}`}
    >
      {style.label}
    </span>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ summary }: { summary: SessionSummary }) {
  const status = deriveSessionCardStatus(summary);

  const map = {
    new: {
      icon: <Mic className="size-3" />,
      label: "Not started",
      cls: "text-[#5a5a5a]",
    },
    in_progress: {
      icon: <BarChart2 className="size-3" />,
      label: "In progress",
      cls: "text-amber-400/80",
    },
    analyzing: {
      icon: <Loader className="size-3 animate-spin" />,
      label: "Analyzing",
      cls: "text-[#C8FF00]/70",
    },
    complete: {
      icon: <CheckCircle2 className="size-3" />,
      label: "Complete",
      cls: "text-[#C8FF00]/80",
    },
  };
  const { icon, label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono ${cls}`}>
      {icon}
      {label}
    </span>
  );
}

// ─── Relative time ────────────────────────────────────────────────────────────
function relativeTime(unixTs: number): string {
  const diffMs = Date.now() - unixTs * 1000;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color =
    score >= 70 ? "#C8FF00" : score >= 45 ? "#FACC15" : "#F87171";

  return (
    <div className="relative flex items-center justify-center w-12 h-12 flex-shrink-0">
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#1e1e1e" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <span className="text-[11px] font-mono font-semibold text-[#f0f0f0]">
        {Math.round(score)}
      </span>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────
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

  const handleOpen = useCallback(() => {
    navigate(`/app/session/${summary.session_id}`);
  }, [navigate, summary.session_id]);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setConfirmDelete(true);
    },
    []
  );

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
      className="group relative rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] hover:border-[#2e2e2e] hover:bg-[#0f0f0f] transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Top accent line — color based on verdict */}
      <div
        className={`h-px w-full ${
          summary.verdict_decision === "PASS"
            ? "bg-[#C8FF00]/40"
            : summary.verdict_decision === "SOFT PASS"
            ? "bg-amber-400/40"
            : summary.verdict_decision === "NO"
            ? "bg-red-500/40"
            : "bg-[#1e1e1e]"
        }`}
      />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          {/* Company initial avatar */}
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#161616] border border-[#2a2a2a] flex items-center justify-center">
            <span className="text-sm font-semibold text-[#a0a0a0] font-mono uppercase">
              {companyName.charAt(0)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {!confirmDelete ? (
              <button
                onClick={handleDeleteClick}
                className="p-1.5 rounded-md text-[#3a3a3a] hover:text-red-400 hover:bg-red-950/30 transition-colors"
                title="Delete session"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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

        {/* Company name + one-liner */}
        <h3 className="text-sm font-semibold text-[#f0f0f0] font-display leading-snug mb-1 truncate">
          {companyName}
        </h3>
        <p className="text-xs text-[#5a5a5a] leading-snug line-clamp-2 mb-4">
          {oneLiner}
        </p>

        {/* Score + verdict row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {summary.weighted_score != null ? (
              <ScoreRing score={summary.weighted_score} />
            ) : (
              <div className="w-12 h-12 rounded-full border border-[#1e1e1e] flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] text-[#3a3a3a] font-mono">—</span>
              </div>
            )}
            <div className="flex flex-col gap-1">
              {summary.verdict_decision ? (
                <VerdictBadge decision={summary.verdict_decision} />
              ) : (
                <StatusPill summary={summary} />
              )}
              <span className="text-[10px] text-[#3a3a3a] font-mono">
                {relativeTime(summary.updated_at)}
              </span>
            </div>
          </div>

          {/* Open arrow */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight className="size-4 text-[#C8FF00]" />
          </div>
        </div>
      </div>

      {/* Stage tag */}
      {summary.stage && (
        <div className="px-5 pb-4 -mt-1">
          <span className="text-[10px] font-mono text-[#3a3a3a] uppercase tracking-wider">
            {summary.stage}
          </span>
        </div>
      )}

      {/* Analyzing pulse overlay */}
      {(summary.market_intel_status === "running" ||
        summary.deliberation_status === "running") && (
        <div className="absolute bottom-0 left-0 right-0 h-px">
          <div className="h-full bg-[#C8FF00]/40 animate-pulse" />
        </div>
      )}
    </div>
  );
}

// ─── New Session card ─────────────────────────────────────────────────────────
export function NewSessionCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative rounded-xl border border-dashed border-[#2a2a2a] bg-transparent hover:border-[#C8FF00]/30 hover:bg-[#C8FF00]/[0.02] transition-all duration-200 cursor-pointer overflow-hidden min-h-[160px] flex flex-col items-center justify-center gap-3"
    >
      <div className="w-9 h-9 rounded-lg border border-[#2a2a2a] group-hover:border-[#C8FF00]/30 flex items-center justify-center transition-colors">
        <Sparkles className="size-4 text-[#3a3a3a] group-hover:text-[#C8FF00]/60 transition-colors" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-[#3a3a3a] group-hover:text-[#a0a0a0] transition-colors">
          New pitch session
        </p>
        <p className="text-xs text-[#2a2a2a] group-hover:text-[#5a5a5a] transition-colors mt-0.5">
          Upload a deck, pitch to Sam
        </p>
      </div>
    </button>
  );
}
