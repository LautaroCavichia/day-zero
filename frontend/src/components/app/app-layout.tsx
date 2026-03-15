// ─── AppLayout ────────────────────────────────────────────────────────────────
// Root layout for the app workspace.
// Provides: fixed AppNav, collapsible AppSidebar, scrollable main content area.

import { useState, type ReactNode } from "react";
import AppNav from "@/components/app/app-nav";
import AppSidebar from "@/components/app/app-sidebar";
import GrainOverlay from "@/components/shared/grain-overlay";
import type { PhaseStatuses } from "@/hooks/useSession";
import type { WorkflowPhase } from "@/types/session";

interface AppLayoutProps {
  children: ReactNode;
  sessionName?: string;
  activePhase: WorkflowPhase;
  phaseStatuses: PhaseStatuses;
  onSelectPhase: (phase: WorkflowPhase) => void;
}

export default function AppLayout({
  children,
  sessionName,
  activePhase,
  phaseStatuses,
  onSelectPhase,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GrainOverlay />

      <AppNav
        sessionName={sessionName}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <AppSidebar
        open={sidebarOpen}
        activePhase={activePhase}
        phaseStatuses={phaseStatuses}
        onSelectPhase={onSelectPhase}
      />

      {/* Main content — offset for nav (top-14) and sidebar width */}
      <main
        className={`
          min-h-screen pt-14 transition-all duration-300
          ${sidebarOpen ? "pl-64" : "pl-16"}
        `}
      >
        <div className="h-full p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
