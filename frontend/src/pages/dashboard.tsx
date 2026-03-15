// ─── Dashboard ────────────────────────────────────────────────────────────────
// Route: /app
// Shows most-recent session as a hero card, the rest in a 2-col grid.
// Includes search (live filter), sort, and an "In Progress" filter chip.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import GrainOverlay from "@/components/shared/grain-overlay";
import SessionCard, {
  HeroSessionCard,
  NewSessionCard,
} from "@/components/dashboard/session-card";
import { api } from "@/services/api";
import type { ScoreBreakdown, SessionSummary } from "@/types/session";
import { deriveSessionCardStatus } from "@/types/session";
import {
  Loader,
  ArrowUpRight,
  Search,
  ChevronDown,
  X,
} from "lucide-react";

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = "last_accessed" | "score_high" | "score_low";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "last_accessed", label: "Last accessed" },
  { key: "score_high", label: "Score: high → low" },
  { key: "score_low", label: "Score: low → high" },
];

function sortSessions(sessions: SessionSummary[], key: SortKey): SessionSummary[] {
  const copy = [...sessions];
  switch (key) {
    case "last_accessed":
      return copy.sort((a, b) => b.updated_at - a.updated_at);
    case "score_high":
      return copy.sort((a, b) => (b.weighted_score ?? -1) - (a.weighted_score ?? -1));
    case "score_low":
      return copy.sort((a, b) => (a.weighted_score ?? 101) - (b.weighted_score ?? 101));
    default:
      return copy;
  }
}

// ─── Sort dropdown ────────────────────────────────────────────────────────────

function SortDropdown({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (k: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = SORT_OPTIONS.find((o) => o.key === value)!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] text-xs font-mono text-[#a0a0a0] hover:border-[#2e2e2e] hover:text-[#f0f0f0] transition-colors"
      >
        {current.label}
        <ChevronDown
          className={`size-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] shadow-xl z-50 overflow-hidden">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                onChange(opt.key);
                setOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 text-xs font-mono transition-colors hover:bg-[#161616] ${opt.key === value
                ? "text-[#C8FF00]"
                : "text-[#a0a0a0] hover:text-[#f0f0f0]"
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-28 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] flex items-center justify-center mb-6">
        <svg
          className="w-6 h-6 text-[#2a2a2a]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-[#f0f0f0] font-heading tracking-tight mb-2">
        No pitch sessions yet
      </h2>
      <p className="text-sm text-[#5a5a5a] max-w-xs mb-8 leading-relaxed">
        Upload your deck and get stress-tested by Sam — a YC-style AI investor
        who doesn't pull punches.
      </p>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-2 rounded-lg bg-[#C8FF00] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#D4FF33] transition-colors"
      >
        Start your first pitch
        <ArrowUpRight className="size-4" />
      </button>
    </div>
  );
}

// ─── No results state (search/filter returned nothing) ────────────────────────
function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <p className="text-sm text-[#5a5a5a] mb-3">
        No sessions matching{" "}
        <span className="text-[#a0a0a0] font-mono">"{query}"</span>
      </p>
      <button
        onClick={onClear}
        className="text-xs font-mono text-[#C8FF00]/70 hover:text-[#C8FF00] transition-colors"
      >
        Clear search
      </button>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search / sort / filter state
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_accessed");
  const [showInProgressOnly, setShowInProgressOnly] = useState(false);

  // Hero card score breakdown (fetched lazily for most recent session)
  const [heroScoreBreakdown, setHeroScoreBreakdown] =
    useState<ScoreBreakdown | null>(null);

  // Fetch session list on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { sessions } = await api.listSessions();
        if (!cancelled) setSessions(sessions);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load sessions"
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch score breakdown for the hero session (most recent by updated_at)
  const heroSession = useMemo(() => {
    if (!sessions.length) return null;
    return [...sessions].sort((a, b) => b.updated_at - a.updated_at)[0];
  }, [sessions]);

  useEffect(() => {
    if (!heroSession || !heroSession.verdict_decision) return;
    let cancelled = false;
    api
      .getVerdict(heroSession.session_id)
      .then((v) => {
        if (!cancelled && v.score_breakdown) {
          setHeroScoreBreakdown(v.score_breakdown);
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [heroSession?.session_id, heroSession?.verdict_decision]);

  const handleNewSession = useCallback(() => {
    navigate("/app/new");
  }, [navigate]);

  const handleDelete = useCallback(async (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    try {
      await api.deleteSession(sessionId);
    } catch {
      try {
        const { sessions } = await api.listSessions();
        setSessions(sessions);
      } catch {
        // ignore secondary failure
      }
    }
  }, []);

  // ── Derived: filtered + sorted session list ──
  const filteredSessions = useMemo(() => {
    let result = sessions;

    // Filter: in progress only
    if (showInProgressOnly) {
      result = result.filter((s) => {
        const status = deriveSessionCardStatus(s);
        return status !== "complete";
      });
    }

    // Search: company name or one-liner
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          (s.company_name ?? "").toLowerCase().includes(q) ||
          (s.one_liner ?? "").toLowerCase().includes(q)
      );
    }

    return sortSessions(result, sortKey);
  }, [sessions, query, sortKey, showInProgressOnly]);

  // The hero is always the most recently accessed session (pre-filter)
  // The grid shows everything else (filtered), minus the hero session
  const gridSessions = useMemo(() => {
    if (!heroSession) return filteredSessions;
    return filteredSessions.filter(
      (s) => s.session_id !== heroSession.session_id
    );
  }, [filteredSessions, heroSession]);

  const heroVisible =
    heroSession &&
    filteredSessions.some((s) => s.session_id === heroSession.session_id);

  const hasActiveFilters = showInProgressOnly || query.trim().length > 0;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <GrainOverlay />

      {/* ── Atmospheric background glow ── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "linear-gradient(to top right, rgba(200,255,0,0.14) 0%, transparent 55%)",
        }}
      />

      {/* ── Nav ── */}
      <header className="fixed top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-50 border-b border-[#1e1e1e] bg-[#050505]/90 backdrop-blur-xl">
        <a href="/" className="flex items-center gap-2 group">
          <span className="text-sm font-semibold text-[#f0f0f0] font-heading tracking-tight group-hover:text-[#C8FF00] transition-colors">
            Day<span className="text-[#C8FF00]">Zero</span>
          </span>
        </a>
        <button
          onClick={handleNewSession}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#C8FF00] px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-[#D4FF33] active:scale-95 transition-all duration-150 shadow-[0_0_20px_rgba(200,255,0,0.15)]"
        >
          New session
          <ArrowUpRight className="size-3" />
        </button>
      </header>

      <main className="relative z-10 pt-14 min-h-screen">
        <div className="max-w-7xl mx-auto px-6 py-10">

          {/* ── Page header ── */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-[#f0f0f0] font-heading tracking-tight">
              Pitch sessions
            </h1>
            <p className="text-sm text-[#5a5a5a] mt-1">
              Full YC-style evaluation — interview, deck, market intel, and a verdict.
            </p>
          </div>

          {/* ── Loading / error ── */}
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-[#5a5a5a] py-16">
              <Loader className="size-4 animate-spin" />
              Loading sessions...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 max-w-md">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState onNew={handleNewSession} />
          ) : (
            <>
              {/* ── Hero card (most recent, always shown above filters) ── */}
              {heroSession && (
                <div className="mb-10 anim-fade-up">
                  <HeroSessionCard
                    summary={heroSession}
                    scoreBreakdown={heroScoreBreakdown}
                    onDelete={handleDelete}
                  />
                </div>
              )}

              {/* ── Toolbar: search + sort + filter chip ── */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
                {/* Search */}
                <div className="relative flex-1 w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#3a3a3a] pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by company or pitch..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full h-9 pl-8 pr-8 rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] text-xs font-mono text-[#f0f0f0] placeholder:text-[#3a3a3a] hover:border-[#2e2e2e] focus:border-[#C8FF00]/30 focus:outline-none transition-colors"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3a3a3a] hover:text-[#a0a0a0] transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                {/* Filter chip */}
                <button
                  onClick={() => setShowInProgressOnly((v) => !v)}
                  className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border text-xs font-mono transition-all duration-150 ${showInProgressOnly
                    ? "border-[#C8FF00]/30 bg-[#C8FF00]/8 text-[#C8FF00]"
                    : "border-[#1e1e1e] bg-[#0c0c0c] text-[#5a5a5a] hover:border-[#2e2e2e] hover:text-[#a0a0a0]"
                    }`}
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${showInProgressOnly ? "bg-[#C8FF00]" : "bg-[#3a3a3a]"
                      }`}
                  />
                  In progress
                </button>

                {/* Spacer */}
                <div className="flex-1 hidden sm:block" />

                {/* Sort */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#3a3a3a] tracking-wide hidden sm:block">
                    SORT
                  </span>
                  <SortDropdown value={sortKey} onChange={setSortKey} />
                </div>

                {/* Clear all filters */}
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setShowInProgressOnly(false);
                    }}
                    className="text-[10px] font-mono text-[#3a3a3a] hover:text-[#C8FF00]/60 transition-colors tracking-wide"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* ── Session count label ── */}
              {sessions.length > 1 && (
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-mono text-[#3a3a3a] tracking-wide">
                    {filteredSessions.length === sessions.length
                      ? `${sessions.length - 1} other session${sessions.length - 1 !== 1 ? "s" : ""}`
                      : `${gridSessions.length} result${gridSessions.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
              )}

              {/* ── Grid ── */}
              {!heroVisible && filteredSessions.length === 0 ? (
                <NoResults
                  query={query || "In Progress"}
                  onClear={() => {
                    setQuery("");
                    setShowInProgressOnly(false);
                  }}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* New session card — always first */}
                  <NewSessionCard onClick={handleNewSession} />

                  {gridSessions.map((s) => (
                    <SessionCard
                      key={s.session_id}
                      summary={s}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
