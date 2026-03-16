import Logo from "@/components/shared/logo";

export default function Footer() {
  return (
    <footer className="border-t border-[#1a1a1a] py-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">

          {/* Brand */}
          <div>
            <Logo className="text-xl mb-2" />
            <p className="text-xs text-[#5a5a5a] max-w-xs leading-relaxed">
              Your idea, under real scrutiny.
            </p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-8">
            <a
              href="#how-it-works"
              className="text-xs text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
            >
              How it works
            </a>
            <a
              href="#demo"
              className="text-xs text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
            >
              Demo
            </a>
            <a
              href="/app/new"
              className="text-xs text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
            >
              Start
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-[#1a1a1a] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[11px] font-mono text-[#5a5a5a]">
            &copy; {new Date().getFullYear()} DayZero.
          </p>
          <a
            href="https://zonda.one"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-[#3a3a3a] hover:text-[#ff6200] transition-colors"
          >
            Developed by zonda.one
          </a>
        </div>
      </div>
    </footer>
  );
}
