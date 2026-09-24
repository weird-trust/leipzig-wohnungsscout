/**
 * The few glyphs the interface font lacks (✓, ★), drawn to match its
 * rounded strokes. Decorative: callers always provide the text meaning.
 */

const BASE = {
  "aria-hidden": true,
  focusable: false,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function CheckIcon({ className = "size-[0.85em]" }: { className?: string }) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  );
}

export function StarIcon({ filled, className = "size-4" }: { filled: boolean; className?: string }) {
  return (
    <svg {...BASE} className={className} fill={filled ? "currentColor" : "none"}>
      <path d="M8 1.9l1.8 3.8 4.1.5-3 2.9.8 4.1L8 11.2l-3.7 2 .8-4.1-3-2.9 4.1-.5z" />
    </svg>
  );
}

export function ChevronIcon({ className = "size-3" }: { className?: string }) {
  return (
    <svg {...BASE} className={className}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
