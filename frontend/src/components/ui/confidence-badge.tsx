// ─── ConfidenceBadge ──────────────────────────────────────────────────────────
// Displays a confidence score (0.0–1.0) as a color-coded tag pill.
// Green ≥0.7 | Yellow 0.5–0.69 | Red <0.5

interface ConfidenceBadgeProps {
  confidence: number; // 0.0 – 1.0
  showLabel?: boolean;
}

function confidenceLabel(c: number): string {
  if (c >= 0.9) return "High";
  if (c >= 0.7) return "Good";
  if (c >= 0.5) return "Medium";
  if (c >= 0.3) return "Low";
  return "Est.";
}

function confidenceClasses(c: number): string {
  if (c >= 0.7) return "text-[#C8FF00] border-[rgba(200,255,0,0.25)] bg-[rgba(200,255,0,0.06)]";
  if (c >= 0.5) return "text-amber-400 border-amber-500/25 bg-amber-500/[0.06]";
  return "text-red-400 border-red-500/25 bg-red-500/[0.06]";
}

export function ConfidenceBadge({ confidence, showLabel = true }: ConfidenceBadgeProps) {
  const pct = Math.round(confidence * 100);
  return (
    <span className={`tag-pill ${confidenceClasses(confidence)}`}>
      {showLabel ? `${confidenceLabel(confidence)} ` : ""}{pct}%
    </span>
  );
}
