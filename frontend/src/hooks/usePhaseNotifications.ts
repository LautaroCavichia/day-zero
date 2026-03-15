// ─── usePhaseNotifications ────────────────────────────────────────────────────
// Watches session state transitions and fires toast notifications when
// background tasks (market intel, deliberation) complete or fail.
//
// Uses a simple ref-based "previous status" comparison to detect transitions.

import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskStatusValue } from "@/types/session";

export interface PhaseToast {
  id: string;
  message: string;
  variant: "success" | "error";
  exiting: boolean;
  /** Optional action shown as a button inside the toast */
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function usePhaseNotifications(
  marketStatus: TaskStatusValue | undefined,
  deliberationStatus: TaskStatusValue | undefined,
  onNavigateToMarket?: () => void,
  onNavigateToDeliberation?: () => void,
) {
  const [toasts, setToasts] = useState<PhaseToast[]>([]);
  const prevMarket = useRef<TaskStatusValue | undefined>(marketStatus);
  const prevDelib = useRef<TaskStatusValue | undefined>(deliberationStatus);

  const dismiss = useCallback((id: string) => {
    // Mark as exiting first so the exit animation plays
    setToasts((ts) => ts.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts((ts) => ts.filter((t) => t.id !== id));
    }, 280);
  }, []);

  const push = useCallback(
    (message: string, variant: "success" | "error", action?: PhaseToast["action"]) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((ts) => [...ts, { id, message, variant, exiting: false, action }]);
      // Auto-dismiss after 8s (slightly longer when there's an action)
      setTimeout(() => dismiss(id), action ? 8000 : 5000);
    },
    [dismiss],
  );

  useEffect(() => {
    const prev = prevMarket.current;
    if (prev === "running" && marketStatus === "completed") {
      push(
        "Market research complete",
        "success",
        onNavigateToMarket
          ? { label: "View results →", onClick: onNavigateToMarket }
          : undefined,
      );
    } else if (prev === "running" && marketStatus === "failed") {
      push("Market research failed", "error");
    }
    prevMarket.current = marketStatus;
  }, [marketStatus, push, onNavigateToMarket]);

  useEffect(() => {
    const prev = prevDelib.current;
    if (prev === "running" && deliberationStatus === "completed") {
      push(
        "VC deliberation complete",
        "success",
        onNavigateToDeliberation
          ? { label: "View verdict →", onClick: onNavigateToDeliberation }
          : undefined,
      );
    } else if (prev === "running" && deliberationStatus === "failed") {
      push("VC deliberation failed", "error");
    }
    prevDelib.current = deliberationStatus;
  }, [deliberationStatus, push, onNavigateToDeliberation]);

  return { toasts, dismiss };
}
