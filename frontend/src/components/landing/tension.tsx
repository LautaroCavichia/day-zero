import { useInView } from "@/hooks/useInView";

export default function Tension() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });

  return (
    <section className="relative py-28 sm:py-36 overflow-hidden">
      {/* Subtle radial glow behind the text */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(200,255,0,0.03) 0%, transparent 70%)",
        }}
      />

      <div ref={ref} className="mx-auto max-w-4xl px-6 text-center">

        {/* Main quote */}
        <blockquote
          className={`anim-hidden font-heading font-medium leading-[1.2] tracking-tight mb-10 ${
            inView ? "anim-fade-up anim-delay-0" : ""
          }`}
        >
          <span
            className="block text-[clamp(1.5rem,3.5vw,2.5rem)] text-white/30 mb-2"
          >
            Your friends will say "great idea."
          </span>
          <span
            className="block text-[clamp(1.5rem,3.5vw,2.5rem)] text-white/30 mb-2"
          >
            Your mom will say "go for it."
          </span>
          <span
            className="block text-[clamp(1.6rem,3.8vw,2.7rem)] text-white/80"
          >
            Neither of them is writing the check.
          </span>
        </blockquote>

        {/* Chartreuse divider */}
        <div
          className={`anim-hidden flex justify-center mb-8 ${
            inView ? "anim-fade-in anim-delay-300" : ""
          }`}
        >
          <hr className="hr-chartreuse" />
        </div>

        {/* Positioning line */}
        <p
          className={`anim-hidden text-base sm:text-lg text-[#a0a0a0] leading-relaxed max-w-2xl mx-auto ${
            inView ? "anim-fade-up anim-delay-400" : ""
          }`}
        >
          DayZero simulates the meeting that matters — before you walk into it.
          Experienced investor perspectives, applied to your specific idea,
          delivered without the social obligation to be kind.
        </p>

      </div>
    </section>
  );
}
