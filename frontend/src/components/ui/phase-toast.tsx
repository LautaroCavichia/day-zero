// ─── PhaseToastContainer ──────────────────────────────────────────────────────
// Renders phase completion / failure toasts in the bottom-right corner.
// Toasts animate in and auto-dismiss after 5–8s.

import { CheckCircle2, AlertCircle, X } from "lucide-react";
import type { PhaseToast } from "@/hooks/usePhaseNotifications";

interface PhaseToastContainerProps {
  toasts: PhaseToast[];
  onDismiss: (id: string) => void;
}

export function PhaseToastContainer({ toasts, onDismiss }: PhaseToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            flex items-start gap-3 px-4 py-3 rounded-xl
            border shadow-lg backdrop-blur-sm
            max-w-xs w-72
            ${toast.exiting ? "phase-toast-exit" : "phase-toast"}
            ${
              toast.variant === "success"
                ? "bg-[#0c0c0c] border-[#1A3D28]/80"
                : "bg-[#0c0c0c] border-red-900/60"
            }
          `}
        >
          {toast.variant === "success" ? (
            <CheckCircle2 className="size-4 flex-shrink-0 text-[#C8FF00] mt-0.5" strokeWidth={2} />
          ) : (
            <AlertCircle className="size-4 flex-shrink-0 text-red-400 mt-0.5" strokeWidth={2} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[#e0e0e0] leading-snug">{toast.message}</p>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.onClick();
                  onDismiss(toast.id);
                }}
                className={`
                  mt-1.5 text-xs font-semibold
                  transition-colors duration-150
                  ${toast.variant === "success" ? "text-[#C8FF00] hover:text-[#D4FF33]" : "text-red-400 hover:text-red-300"}
                `}
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="flex-shrink-0 p-0.5 rounded text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  );
}
