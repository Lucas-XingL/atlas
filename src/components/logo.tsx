import * as React from "react";

export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Atlas"
    >
      {/* constellation-style logomark: 5 nodes connected */}
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5">
        <line x1="6" y1="6" x2="12" y2="12" />
        <line x1="12" y1="12" x2="18" y2="7" />
        <line x1="12" y1="12" x2="17" y2="18" />
        <line x1="12" y1="12" x2="5" y2="17" />
      </g>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <circle cx="6" cy="6" r="1.4" fill="currentColor" />
      <circle cx="18" cy="7" r="1.4" fill="currentColor" />
      <circle cx="17" cy="18" r="1.4" fill="currentColor" />
      <circle cx="5" cy="17" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Logo size={22} className="text-primary" />
      <span className="font-semibold tracking-tight text-foreground">atlas</span>
    </div>
  );
}
