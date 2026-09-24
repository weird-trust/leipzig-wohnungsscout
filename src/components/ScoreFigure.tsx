import { MAX_SCORE } from "@/lib/scoring";

/** The computed score as a large, light typographic figure: "94 /100". */
export function ScoreFigure({ score }: { score: number }) {
  return (
    <p className="flex items-baseline gap-1 leading-none">
      <span
        className={`font-mono text-xl font-light tracking-[-0.06em] tabular-nums ${
          score > 0 ? "text-fg" : "text-faint"
        }`}
      >
        {score}
      </span>
      <span aria-hidden="true" className="font-mono text-sm text-faint tabular-nums">
        /{MAX_SCORE}
      </span>
      <span className="sr-only">von {MAX_SCORE} Punkten</span>
    </p>
  );
}
