// ─── Dashboard ────────────────────────────────────────────────────────────────
// Route: /app
// Lists all past sessions and lets the user start a new one.
// Sessions are fetched from GET /api/sessions and displayed as cards
// ordered by most-recently-updated.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import GrainOverlay from "@/components/shared/grain-overlay";
import SessionCard, { NewSessionCard } from "@/components/dashboard/session-card";
import { api } from "@/services/api";
import type { SessionSummary } from "@/types/session";
import { Loader, ArrowUpRight } from "lucide-react";

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] flex items-center justify-center mb-6">
        <svg
          className="w-7 h-7 text-[#2a2a2a]"
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
      <h2 className="text-lg font-semibold text-[#f0f0f0] font-display mb-2">
        No pitch sessions yet
      </h2>
      <p className="text-sm text-[#5a5a5a] max-w-xs mb-8 leading-relaxed">
        Upload your deck and get stress-tested by Sam — an AI YC partner who
        doesn't pull punches.
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

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch session list on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { sessions } = await api.listSessions();
        if (!cancelled) setSessions(sessions);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNewSession = useCallback(() => {
    navigate("/app/new");
  }, [navigate]);

  const handleDelete = useCallback(async (sessionId: string) => {
    // Optimistic removal
    setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    try {
      await api.deleteSession(sessionId);
    } catch {
      // Re-fetch if delete failed
      try {
        const { sessions } = await api.listSessions();
        setSessions(sessions);
      } catch {
        // ignore secondary failure
      }
    }
  }, []);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <GrainOverlay />

      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-50 border-b border-[#1e1e1e] bg-background/80 backdrop-blur-md">
        <a href="/" className="flex items-center gap-2 group">
          <span className="text-sm font-semibold text-[#f0f0f0] font-display tracking-tight group-hover:text-[#C8FF00] transition-colors">
            DayZero
          </span>
        </a>
        <button
          onClick={handleNewSession}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#C8FF00] px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-[#D4FF33] transition-colors"
        >
          New session
          <ArrowUpRight className="size-3" />
        </button>
      </header>

      <main className="pt-14 min-h-screen">
        <div className="max-w-5xl mx-auto px-6 py-10">

          {/* Page title */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-[#f0f0f0] font-display">
              Your pitch sessions
            </h1>
            <p className="text-sm text-[#5a5a5a] mt-1">
              Every session is a full YC-style evaluation — interview, deck analysis, market intel, and a verdict.
            </p>
          </div>

          {/* Content */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* New session card first */}
              <NewSessionCard onClick={handleNewSession} />
              {sessions.map((s) => (
                <SessionCard key={s.session_id} summary={s} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
