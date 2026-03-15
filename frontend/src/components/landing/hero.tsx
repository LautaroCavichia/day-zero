import { ArrowRight, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import ColorBends from "@/components/ColorBends";
import CardSwap, { Card } from "@/components/CardStack";

/* ─── Verdict card data ─── */
const verdictCards = [
  {
    score: "61",
    label: "CONDITIONAL PASS",
    labelType: "neutral" as const,
    critique: "Unit economics unclear. TAM overstated 3x. Revisit before Series A.",
    category: "Market Validation",
    icon: AlertTriangle,
    iconColor: "text-yellow-400",
    details: [
      { name: "Market size", val: 58 },
      { name: "Defensibility", val: 44 },
      { name: "Team fit", val: 72 },
    ],
  },
  {
    score: "38",
    label: "DOES NOT PASS",
    labelType: "fail" as const,
    critique: "No evidence of PMF. Three direct competitors with 18-month head start.",
    category: "VC Deliberation",
    icon: TrendingDown,
    iconColor: "text-red-400",
    details: [
      { name: "Differentiation", val: 30 },
      { name: "Traction", val: 25 },
      { name: "Narrative", val: 55 },
    ],
  },
  {
    score: "82",
    label: "STRONG PASS",
    labelType: "pass" as const,
    critique: "Founder–market fit is exceptional. Go-to-market is specific and testable.",
    category: "Live Interview",
    icon: CheckCircle2,
    iconColor: "text-chartreuse",
    details: [
      { name: "Problem clarity", val: 88 },
      { name: "GTM strategy", val: 78 },
      { name: "Competition", val: 81 },
    ],
  },
];

/* ─── Score bar sub-component ─── */
function ScoreBar({ name, val }: { name: string; val: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-mono text-[#5a5a5a] tracking-wide uppercase">
          {name}
        </span>
        <span className="text-[10px] font-mono text-[#a0a0a0]">{val}</span>
      </div>
      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{ width: `${val}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Individual verdict card content ─── */
function VerdictCardContent({
  card,
}: {
  card: (typeof verdictCards)[0];
}) {
  const Icon = card.icon;
  return (
    <div className="flex flex-col h-full p-5 gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono text-[#5a5a5a] tracking-widest uppercase mb-1">
            {card.category}
          </p>
          <div className="verdict-score">{card.score}<span className="text-[#5a5a5a] text-lg font-mono">/100</span></div>
        </div>
        <div className="mt-1">
          <span className={`tag-pill tag-pill-${card.labelType}`}>
            {card.label}
          </span>
        </div>
      </div>

      {/* Critique */}
      <p className="text-xs text-[#a0a0a0] leading-relaxed border-l-2 border-[#1e1e1e] pl-3 flex-1">
        "{card.critique}"
      </p>

      {/* Score bars */}
      <div className="space-y-2.5">
        {card.details.map((d) => (
          <ScoreBar key={d.name} name={d.name} val={d.val} />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-[#1a1a1a]">
        <Icon className={`size-3 ${card.iconColor}`} strokeWidth={1.5} />
        <span className="text-[10px] font-mono text-[#5a5a5a] tracking-wide">
          DayZero analysis
        </span>
      </div>
    </div>
  );
}

/* ─── Hero ─── */
export default function Hero() {

  return (
    <section
      style={{
        position: "relative",
        height: "100vh",
        minHeight: 640,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        background: "#050505",
      }}
    >
      {/* ColorBends background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <ColorBends
          colors={["#C8FF00", "#0A1F12", "#1A3D28"]}
          rotation={0}
          speed={0.2}
          scale={1.5}
          frequency={1}
          warpStrength={1}
          mouseInfluence={0.1}
          parallax={0.05}
          noise={0.2}
          transparent
          autoRotate={0}
        />
      </div>

      {/* Dark overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: "rgba(5,5,5,0.55)",
          pointerEvents: "none",
        }}
      />

      {/* Content wrapper — max-w-7xl, asymmetric split */}
      <div
        style={{ position: "relative", zIndex: 2, width: "100%" }}
        className="mx-auto max-w-7xl px-6 lg:px-12"
      >
        <div className="flex items-center justify-between gap-12">

          {/* ── Left: Text column ── */}
          <div className="flex-1 max-w-[580px]">


            {/* Headline — typographic poster style */}
            <h1 className="font-heading font-bold tracking-tight leading-[1.06] mb-8">
              <span
                className={`page-load-item block text-[clamp(2.6rem,5.5vw,4.5rem)] text-white`}
                style={{ animationDelay: "160ms" }}
              >
                Your startup idea
              </span>
              <span
                className={`page-load-item block text-[clamp(2.6rem,5.5vw,4.5rem)] text-chartreuse italic`}
                style={{ animationDelay: "260ms" }}
              >
                sounds great.
              </span>
              <span
                className={`page-load-item block text-[clamp(1.5rem,3vw,2.25rem)] text-white/40 font-normal mt-2`}
                style={{ animationDelay: "360ms" }}
              >
                Let's find out if it actually is.
              </span>
            </h1>

            {/* Descriptor */}
            <p
              className={`page-load-item text-base text-[#a0a0a0] leading-relaxed max-w-md mb-10`}
              style={{ animationDelay: "460ms" }}
            >
              A simulated VC panel that interrogates your idea across four rounds
              — interview, deck critique, market research, and deliberation.{" "}
              <span className="text-white/60">Not encouragement.</span>
            </p>

            {/* CTAs */}
            <div
              className={`page-load-item flex flex-col sm:flex-row items-start gap-3`}
              style={{ animationDelay: "560ms" }}
            >
              <a
                href="/app/new"
                className="group inline-flex items-center gap-2 rounded-lg bg-[#C8FF00] px-7 py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#D4FF33] shadow-[0_0_40px_rgba(200,255,0,0.22)] hover:shadow-[0_0_70px_rgba(200,255,0,0.35)]"
              >
                Put your idea on trial
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </a>
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-lg border border-white/12 px-7 py-3.5 text-sm text-white/50 transition-all duration-200 hover:text-white/80 hover:border-white/25 backdrop-blur-sm"
              >
                Watch the demo
              </a>
            </div>

            {/* Social proof line */}
            <p
              className={`page-load-item mt-8 text-xs font-mono text-[#5a5a5a] tracking-wide`}
              style={{ animationDelay: "660ms" }}
            >
              10 min · no signup required · real answers
            </p>
          </div>

          {/* ── Right: CardSwap verdict cards ── */}
          <div
            className={`hidden lg:block relative flex-shrink-0 page-load-item`}
            style={{
              width: 340,
              height: 420,
              animationDelay: "400ms",
            }}
          >
            <CardSwap
              width={300}
              height={340}
              cardDistance={50}
              verticalDistance={55}
              delay={4000}
              pauseOnHover
              skewAmount={4}
              easing="elastic"
            >
              {verdictCards.map((card, i) => (
                <Card key={i}>
                  <VerdictCardContent card={card} />
                </Card>
              ))}
            </CardSwap>
          </div>
        </div>
      </div>

      {/* Bottom fade to background */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 160,
          zIndex: 3,
          pointerEvents: "none",
          background: "linear-gradient(to bottom, transparent, #050505)",
        }}
      />
    </section>
  );
}
