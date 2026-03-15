export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* The Zero Frame SVG Icon */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <rect
          x="12"
          y="12"
          width="76"
          height="76"
          rx="2"
          stroke="currentColor"
          strokeWidth="10"
          className="text-foreground"
        />
        <path
          d="M8 92L92 8"
          stroke="#C8FF00"
          strokeWidth="14"
          strokeLinecap="round"
        />
      </svg>
      
      <span className="font-heading font-semibold tracking-tight">
        <span className="text-foreground">Day</span>
        <span className="text-chartreuse">Zero</span>
      </span>
    </div>
  );
}

