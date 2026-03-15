import { ArrowRight } from "lucide-react";
import { useInView } from "@/hooks/useInView";

export default function FinalCta() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3 });

  return (
    <section className="relative py-32 sm:py-40 overflow-hidden">
      {/* Subtle chartreuse radial glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(200,255,0,0.04) 0%, transparent 70%)",
        }}
      />

      <div
        ref={ref}
        className="relative mx-auto max-w-3xl px-6 text-center"
      >

        {/* The close */}
        <h2
          className={`anim-hidden font-heading font-bold tracking-tight leading-[1.08] mb-8 ${
            inView ? "anim-fade-up" : ""
          }`}
        >
          <span className="block text-[clamp(2rem,5vw,3.75rem)] text-white">
            Find out if your idea
          </span>
          <span className="block text-[clamp(2rem,5vw,3.75rem)] text-white/30">
            survives first contact.
          </span>
        </h2>

        {/* Divider */}
        <div
          className={`anim-hidden flex justify-center mb-8 ${
            inView ? "anim-fade-in anim-delay-200" : ""
          }`}
        >
          <hr className="hr-chartreuse" />
        </div>

        {/* Sub-copy */}
        <p
          className={`anim-hidden text-base text-[#a0a0a0] mb-10 ${
            inView ? "anim-fade-up anim-delay-300" : ""
          }`}
        >
          10 minutes. No signup required. An answer you can use.
        </p>

        {/* CTA */}
        <div
          className={`anim-hidden ${inView ? "anim-fade-up anim-delay-400" : ""}`}
        >
          <a
            href="/app/new"
            className="group inline-flex items-center gap-2.5 rounded-lg bg-[#C8FF00] px-9 py-4 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#D4FF33] shadow-[0_0_50px_rgba(200,255,0,0.25)] hover:shadow-[0_0_80px_rgba(200,255,0,0.40)]"
          >
            Put your idea on trial
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </a>
        </div>
      </div>
    </section>
  );
}
