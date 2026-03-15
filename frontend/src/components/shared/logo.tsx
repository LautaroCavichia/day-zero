export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-heading font-semibold tracking-tight select-none ${className}`}
    >
      <span className="text-foreground">Day</span>
      <span className="text-chartreuse">Zero</span>
    </span>
  );
}
