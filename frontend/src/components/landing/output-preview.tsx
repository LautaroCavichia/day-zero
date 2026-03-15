import { useInView } from "@/hooks/useInView";
import { ShieldAlert, TrendingUp, Users, Layers } from "lucide-react";

const categories = [
  { label: "Market opportunity", score: 58, icon: TrendingUp },
  { label: "Team & founder fit", score: 82, icon: Users },
  { label: "Product differentiation", score: 44, icon: Layers },
  { label: "Risk profile", score: 61, icon: ShieldAlert },
];

const keyFindings = [
  { type: "risk", text: "TAM validated at $780M — 3x smaller than claimed" },
  { type: "risk", text: "No evidence of PMF in current cohort" },
  { type: "pass", text: "Founder–market fit is exceptional and credible" },
  { type: "neutral", text: "GTM strategy requires narrower ICP definition" },
];

function CategoryRow({
  item,
  animate,
  delay,
}: {
  item: (typeof categories)[0];
  animate: boolean;
  delay: number;
}) {
  const Icon = item.icon;
  return (
    <div
      className={`anim-hidden ${animate ? "anim-fade-up" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-[#5a5a5a]" strokeWidth={1.5} />
          <span className="text-xs text-[#a0a0a0]">{item.label}</span>
        </div>
        <span className="text-sm font-mono text-white">{item.score}</span>
      </div>
      <div className="score-bar-track">
        <div
          className="score-bar-fill transition-none"
          style={{
            width: animate ? `${item.score}%` : "0%",
            transition: animate
              ? `width 1.4s cubic-bezier(0.22,1,0.36,1) ${delay + 200}ms`
              : "none",
          }}
        />
      </div>
    </div>
  );
}

export default function OutputPreview() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.15 });
  const [headerRef, headerInView] = useInView<HTMLDivElement>({ threshold: 0.4 });

  return (
    <section className="relative py-24 sm:py-32">

      {/* Section header */}
      <div ref={headerRef} className="mx-auto max-w-6xl px-6 mb-16">
        <div className={`anim-hidden text-center ${headerInView ? "anim-fade-up" : ""}`}>
          <p className="text-sm font-mono text-chartreuse tracking-widest uppercase mb-4">
            The output
          </p>
          <h2 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-white mb-4">
            This is what a DayZero report looks like.
          </h2>
          <p className="text-base text-[#a0a0a0] max-w-xl mx-auto">
            Not a list of suggestions. A scored verdict with specific evidence,
            sourced claims, and minority opinions.
          </p>
        </div>
      </div>

      {/* Report mockup */}
      <div
        ref={ref}
        className={`mx-auto max-w-3xl px-6 anim-hidden ${inView ? "anim-scale-up" : ""}`}
      >
        <div className="rounded-2xl border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden shadow-[0_0_100px_rgba(200,255,0,0.04),0_0_200px_rgba(0,0,0,0.6)]">

          {/* Report header bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a] bg-[#0c0c0c]">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="size-2.5 rounded-full bg-[#1e1e1e]" />
                <div className="size-2.5 rounded-full bg-[#1e1e1e]" />
                <div className="size-2.5 rounded-full bg-[#1e1e1e]" />
              </div>
              <span className="text-xs font-mono text-[#5a5a5a] tracking-wide">
                dayzero · analysis report · v3
              </span>
            </div>
            <span className="tag-pill tag-pill-neutral">CONDITIONAL PASS</span>
          </div>

          {/* Report body */}
          <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-8">

            {/* Left: Overall score + categories */}
            <div>
              {/* Big score */}
              <div className="mb-6">
                <p className="text-[10px] font-mono text-[#5a5a5a] tracking-widest uppercase mb-2">
                  Overall score
                </p>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`verdict-score anim-hidden ${
                      inView ? "anim-fade-in anim-delay-200" : ""
                    }`}
                    style={{ fontSize: "clamp(3rem,6vw,4.5rem)" }}
                  >
                    61
                  </span>
                  <span className="text-xl font-mono text-[#5a5a5a]">/100</span>
                </div>
              </div>

              {/* Category scores */}
              <div className="space-y-4">
                {categories.map((cat, i) => (
                  <CategoryRow
                    key={cat.label}
                    item={cat}
                    animate={inView}
                    delay={i * 80}
                  />
                ))}
              </div>
            </div>

            {/* Right: Key findings */}
            <div>
              <p className="text-[10px] font-mono text-[#5a5a5a] tracking-widest uppercase mb-4">
                Key findings
              </p>
              <div className="space-y-3">
                {keyFindings.map((finding, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 anim-hidden ${
                      inView ? "anim-fade-up" : ""
                    }`}
                    style={{ animationDelay: `${200 + i * 80}ms` }}
                  >
                    <div
                      className={`mt-1.5 size-1.5 rounded-full flex-shrink-0 ${
                        finding.type === "pass"
                          ? "bg-chartreuse"
                          : finding.type === "risk"
                          ? "bg-red-400"
                          : "bg-[#5a5a5a]"
                      }`}
                    />
                    <p className="text-sm text-[#a0a0a0] leading-relaxed">
                      {finding.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* VC quote */}
              <div
                className={`mt-6 p-4 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] anim-hidden ${
                  inView ? "anim-fade-up anim-delay-500" : ""
                }`}
              >
                <p className="text-xs text-[#a0a0a0] leading-relaxed italic">
                  "The founder knows this space deeply, but the unit economics
                  conversation got evasive. That's the flag for me."
                </p>
                <p className="text-[10px] font-mono text-[#5a5a5a] mt-2">
                  — Benchmark persona, Round 2
                </p>
              </div>

              {/* Sourced claims count */}
              <div
                className={`mt-4 flex items-center gap-2 anim-hidden ${
                  inView ? "anim-fade-in anim-delay-600" : ""
                }`}
              >
                <span className="text-xs font-mono text-chartreuse">14</span>
                <span className="text-xs text-[#5a5a5a]">claims verified against external sources</span>
              </div>
            </div>
          </div>

          {/* Report footer */}
          <div className="px-6 sm:px-8 py-4 border-t border-[#1a1a1a] flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#5a5a5a]">
              Generated in 8m 42s · 4 rounds · 3 personas
            </span>
            <span className="text-[10px] font-mono text-[#5a5a5a]">
              DayZero · Mar 2026
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
