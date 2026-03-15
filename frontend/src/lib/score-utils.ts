// ─── Score utilities ──────────────────────────────────────────────────────────
// Shared helpers for score-based color decisions.

/**
 * Returns a Tailwind text-color class for a 0–10 score.
 * >= 7.5 → chartreuse, >= 5 → muted, < 5 → red
 */
export function scoreColor(score: number): string {
  if (score >= 7.5) return "text-[#C8FF00]";
  if (score >= 5) return "text-[#a0a0a0]";
  return "text-red-400";
}

/**
 * Returns a Tailwind text-color class for a 0–100 score.
 * >= 75 → chartreuse, >= 50 → muted, < 50 → red
 */
export function scoreColor100(score: number): string {
  if (score >= 75) return "text-[#C8FF00]";
  if (score >= 50) return "text-[#a0a0a0]";
  return "text-red-400";
}
