import { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import Logo from "@/components/shared/logo";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 ${
        scrolled
          ? "bg-[#050505]/85 backdrop-blur-xl border-b border-[#1e1e1e]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 lg:px-12 h-16">
        <Logo className="text-xl" />

        <div className="flex items-center gap-6">
          <a
            href="#how-it-works"
            className="text-sm text-[#5a5a5a] hover:text-[#f0f0f0] transition-colors hidden sm:block"
          >
            How it works
          </a>
          <a
            href="#demo"
            className="text-sm text-[#5a5a5a] hover:text-[#f0f0f0] transition-colors hidden sm:block"
          >
            Demo
          </a>

          {/* CTA — slides in when user scrolls past hero */}
          <a
            href="/app/new"
            className={`inline-flex items-center gap-1.5 rounded-lg bg-[#C8FF00] px-4 py-2 text-xs font-semibold text-black transition-all duration-300 hover:bg-[#D4FF33] ${
              scrolled
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-1 pointer-events-none"
            }`}
            tabIndex={scrolled ? 0 : -1}
          >
            Start your pitch
            <ArrowRight className="size-3" strokeWidth={2} />
          </a>
        </div>
      </div>
    </nav>
  );
}
