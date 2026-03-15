import { Mic, FileText, Search, Users } from "lucide-react";
import { useInView } from "@/hooks/useInView";

const steps = [
  {
    number: "01",
    icon: Mic,
    title: "Live interview",
    description:
      "A simulated YC partner fires questions at you in real-time. Voice-based. No scripts. You answer for your idea, not a prepared deck.",
    detail: "Evaluates: clarity, conviction, founder–market fit",
  },
  {
    number: "02",
    icon: FileText,
    title: "Deck critique",
    description:
      "Slide-by-slide teardown of your pitch deck. Narrative scoring, missing-slide detection, and the one line that kills deals.",
    detail: "Evaluates: story arc, missing evidence, investor red flags",
  },
  {
    number: "03",
    icon: Search,
    title: "Market validation",
    description:
      "Competitor mapping, TAM/SAM/SOM sizing, and pivot suggestions. Every claim is sourced and scored — not taken at face value.",
    detail: "Evaluates: market size accuracy, defensibility, timing",
  },
  {
    number: "04",
    icon: Users,
    title: "VC deliberation",
    description:
      "Three distinct VC personas debate your idea across three rounds, then deliver a scored verdict. They disagree with each other.",
    detail: "Evaluates: overall investability, key risks, exit potential",
  },
];

function Step({
  step,
  index,
}: {
  step: (typeof steps)[0];
  index: number;
}) {
  const isEven = index % 2 === 1;
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  const Icon = step.icon;

  return (
    <div
      ref={ref}
      className={`relative flex items-start gap-8 lg:gap-16 ${
        isEven ? "lg:flex-row-reverse" : "lg:flex-row"
      } flex-col`}
    >
      {/* ── Text side ── */}
      <div
        className={`flex-1 anim-hidden ${
          inView
            ? isEven
              ? "anim-fade-right anim-delay-100"
              : "anim-fade-left anim-delay-100"
            : ""
        }`}
      >
        {/* Step number + icon */}
        <div className="flex items-center gap-4 mb-5">
          <span className="step-number">{step.number}</span>
          <div className="inline-flex items-center justify-center size-9 rounded-lg bg-[#0A1F12] border border-[#1A3D28]/60">
            <Icon className="size-4 text-chartreuse" strokeWidth={1.5} />
          </div>
        </div>

        <h3 className="text-2xl sm:text-3xl font-heading font-semibold tracking-tight text-white mb-3">
          {step.title}
        </h3>
        <p className="text-base text-[#a0a0a0] leading-relaxed mb-4 max-w-md">
          {step.description}
        </p>
        <p className="text-xs font-mono text-[#5a5a5a] tracking-wide">
          {step.detail}
        </p>
      </div>

      {/* ── Visual side: mock output card ── */}
      <div
        className={`flex-1 flex ${isEven ? "lg:justify-start" : "lg:justify-end"} justify-start anim-hidden ${
          inView
            ? isEven
              ? "anim-fade-left anim-delay-200"
              : "anim-fade-right anim-delay-200"
            : ""
        }`}
      >
        <StepCard step={step} />
      </div>
    </div>
  );
}

function StepCard({ step }: { step: (typeof steps)[0] }) {
  const Icon = step.icon;

  // Unique mock content per step
  const mockContent: Record<string, React.ReactNode> = {
    "01": (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <div className="size-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-mono text-[#5a5a5a] tracking-wide">LIVE · 02:14</span>
        </div>
        <MockLine label="Q:" text="What's your unfair advantage over Notion?" accent />
        <MockLine label="A:" text="We're building for ops teams, not knowledge workers..." />
        <MockLine label="Q:" text="You said $2B TAM — walk me through the math." accent />
        <div className="pt-2 border-t border-[#1a1a1a]">
          <span className="text-[10px] font-mono text-[#5a5a5a]">Clarity score updating...</span>
        </div>
      </div>
    ),
    "02": (
      <div className="space-y-2.5">
        <div className="text-[10px] font-mono text-[#5a5a5a] tracking-wide mb-3">SLIDE ANALYSIS · 12 slides</div>
        <SlideRow label="Problem statement" score={88} status="pass" />
        <SlideRow label="Market size" score={42} status="fail" note="TAM math unverified" />
        <SlideRow label="Business model" score={61} status="warn" />
        <SlideRow label="Traction" score={29} status="fail" note="Missing" />
        <SlideRow label="Team" score={91} status="pass" />
      </div>
    ),
    "03": (
      <div className="space-y-3">
        <div className="text-[10px] font-mono text-[#5a5a5a] tracking-wide mb-3">MARKET RESEARCH · 8 sources</div>
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-[#a0a0a0]">Claimed TAM</span>
          <span className="text-sm font-mono text-red-400">$2.4B <span className="text-[10px]">overstated</span></span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-[#a0a0a0]">Validated TAM</span>
          <span className="text-sm font-mono text-chartreuse">$780M</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-[#a0a0a0]">Direct competitors</span>
          <span className="text-sm font-mono text-white">4 identified</span>
        </div>
        <div className="pt-2 border-t border-[#1a1a1a] text-[10px] font-mono text-[#5a5a5a]">
          Sources: Pitchbook, CB Insights, G2 +5 more
        </div>
      </div>
    ),
    "04": (
      <div className="space-y-3">
        <div className="text-[10px] font-mono text-[#5a5a5a] tracking-wide mb-3">ROUND 3 OF 3 · FINAL VERDICT</div>
        <VCLine name="Andreessen (skeptic)" verdict="NO" reason="Market too crowded" />
        <VCLine name="Sequoia (neutral)" verdict="PASS" reason="Founder fit exceptional" />
        <VCLine name="Benchmark (thesis)" verdict="NO" reason="Unit economics unclear" />
        <div className="pt-2 border-t border-[#1a1a1a] flex justify-between items-center">
          <span className="text-xs text-[#a0a0a0]">Final score</span>
          <span className="text-xl font-mono font-semibold text-chartreuse">61<span className="text-xs text-[#5a5a5a]">/100</span></span>
        </div>
      </div>
    ),
  };

  return (
    <div className="w-full max-w-sm rounded-2xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 shadow-[0_0_60px_rgba(0,0,0,0.5)]">
      {/* Card header */}
      <div className="flex items-center gap-2 pb-4 mb-4 border-b border-[#1a1a1a]">
        <div className="inline-flex items-center justify-center size-7 rounded-md bg-[#0A1F12]">
          <Icon className="size-3.5 text-chartreuse" strokeWidth={1.5} />
        </div>
        <span className="text-xs font-mono text-[#a0a0a0] tracking-wide">{step.title}</span>
      </div>
      {mockContent[step.number]}
    </div>
  );
}

/* ── Micro helpers ── */
function MockLine({ label, text, accent }: { label: string; text: string; accent?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className={`text-[11px] font-mono flex-shrink-0 ${accent ? "text-chartreuse" : "text-[#5a5a5a]"}`}>
        {label}
      </span>
      <span className="text-[11px] text-[#a0a0a0] leading-relaxed">{text}</span>
    </div>
  );
}

function SlideRow({
  label,
  score,
  status,
  note,
}: {
  label: string;
  score: number;
  status: "pass" | "fail" | "warn";
  note?: string;
}) {
  const colors = { pass: "text-chartreuse", fail: "text-red-400", warn: "text-yellow-400" };
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-[#a0a0a0] truncate block">{label}</span>
        {note && <span className="text-[10px] text-[#5a5a5a]">{note}</span>}
      </div>
      <span className={`text-[11px] font-mono flex-shrink-0 ${colors[status]}`}>{score}</span>
    </div>
  );
}

function VCLine({ name, verdict, reason }: { name: string; verdict: string; reason: string }) {
  const isPass = verdict === "PASS";
  return (
    <div className="flex items-start gap-3">
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 border ${
          isPass
            ? "text-chartreuse border-chartreuse/20 bg-chartreuse/5"
            : "text-red-400 border-red-400/20 bg-red-400/5"
        }`}
      >
        {verdict}
      </span>
      <div className="min-w-0">
        <span className="text-[11px] text-[#a0a0a0] block truncate">{name}</span>
        <span className="text-[10px] text-[#5a5a5a]">{reason}</span>
      </div>
    </div>
  );
}

/* ── Section ── */
export default function Features() {
  const [headerRef, headerInView] = useInView<HTMLDivElement>({ threshold: 0.4 });

  return (
    <section id="how-it-works" className="relative py-24 sm:py-32">

      {/* Section header */}
      <div
        ref={headerRef}
        className="mx-auto max-w-6xl px-6 mb-20"
      >
        <div className={`anim-hidden ${headerInView ? "anim-fade-up" : ""}`}>
          <p className="text-sm font-mono text-chartreuse tracking-widest uppercase mb-4">
            How it works
          </p>
          <h2 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-white max-w-xl">
            Four rounds of scrutiny.
            <span className="text-white/30"> One honest verdict.</span>
          </h2>
        </div>
      </div>

      {/* Steps */}
      <div className="mx-auto max-w-6xl px-6">
        <div className="space-y-24 sm:space-y-32">
          {steps.map((step, i) => (
            <Step key={step.number} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
