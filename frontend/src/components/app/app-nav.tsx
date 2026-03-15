// ─── AppNav ───────────────────────────────────────────────────────────────────
// Top navigation bar for the session workspace.
// Shows: logo, session title, back to dashboard link.
// (Sidebar toggle removed — navigation is now in the horizontal PhaseStepBar.)

import { LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "@/components/shared/logo";

interface AppNavProps {
  sessionName?: string;
}

export default function AppNav({ sessionName }: AppNavProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#050505]/90 backdrop-blur-xl border-b border-[#1e1e1e] flex items-center px-5 gap-4">
      {/* Logo */}
      <Link to="/" className="flex-shrink-0">
        <Logo className="text-base" />
      </Link>

      {/* Divider */}
      <span className="text-[#252525] text-lg font-light select-none">/</span>

      {/* Session name */}
      <span className="text-sm text-[#606060] truncate max-w-xs">
        {sessionName ?? "New session"}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Back to dashboard */}
      <Link
        to="/app"
        className="inline-flex items-center gap-1.5 text-xs text-[#5a5a5a] hover:text-[#f0f0f0] transition-colors"
      >
        <LayoutDashboard className="size-3" strokeWidth={1.5} />
        Dashboard
      </Link>
    </header>
  );
}
