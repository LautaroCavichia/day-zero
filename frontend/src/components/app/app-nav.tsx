// ─── AppNav ───────────────────────────────────────────────────────────────────
// Top navigation bar for the session workspace.
// Shows: sidebar toggle, logo, session title, back to dashboard link.

import { LayoutDashboard, PanelLeft } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "@/components/shared/logo";

interface AppNavProps {
  sessionName?: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function AppNav({
  sessionName,
  sidebarOpen,
  onToggleSidebar,
}: AppNavProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#050505]/90 backdrop-blur-xl border-b border-[#1e1e1e] flex items-center px-4 gap-4">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-[#5a5a5a] hover:text-[#f0f0f0] hover:bg-[#161616] transition-all duration-200"
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        <PanelLeft
          className={`size-4 transition-transform duration-300 ${sidebarOpen ? "" : "rotate-180"}`}
          strokeWidth={1.5}
        />
      </button>

      {/* Logo */}
      <Link to="/" className="flex-shrink-0">
        <Logo className="text-base" />
      </Link>

      {/* Divider */}
      <span className="text-[#2a2a2a] text-lg font-light select-none">/</span>

      {/* Session name */}
      <span className="text-sm text-[#a0a0a0] truncate max-w-xs">
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
