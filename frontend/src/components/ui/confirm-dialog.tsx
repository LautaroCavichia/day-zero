// ─── ConfirmDialog ────────────────────────────────────────────────────────────
// Reusable confirmation modal with dark overlay.
// Used for destructive actions (ending calls, navigating away, redoing interview).

import { useEffect } from "react";
import { X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" = red confirm button (default), "default" = chartreuse */
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Trap Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fade-in_0.15s_ease_both]"
        onClick={onCancel}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-[#2a2a2a] bg-[#0c0c0c] p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-[scale-up_0.2s_cubic-bezier(0.22,1,0.36,1)_both]">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-lg text-[#5a5a5a] hover:text-[#a0a0a0] hover:bg-[#1e1e1e] transition-colors"
          aria-label="Close"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>

        {/* Title */}
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-[#f0f0f0] font-heading mb-2 pr-8"
        >
          {title}
        </h2>

        {/* Message */}
        <p className="text-sm text-[#5a5a5a] leading-relaxed mb-6">{message}</p>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#a0a0a0] bg-[#161616] border border-[#2a2a2a] hover:bg-[#1e1e1e] hover:text-[#f0f0f0] transition-all duration-150"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`
              px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.97]
              ${variant === "danger"
                ? "bg-[#2a0a0a] border border-[#4a1515] text-red-400 hover:bg-[#3a0a0a] hover:text-red-300"
                : "bg-[#C8FF00] text-black hover:bg-[#D4FF33]"}
            `}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
