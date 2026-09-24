import { MAX_SCORE } from "@/lib/scoring";

/** The computed score as a large figure with a thin proportional rule. */
export function ScoreFigure({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const strong = score >= 80;
  return (
    <div className={size === "lg" ? "w-full" : "w-16"}>
      <p
        className={`leading-none font-semibold tabular-nums ${
          size === "lg" ? "text-7xl" : "text-4xl"
        } ${strong ? "text-accent" : "text-fg"}`}
      >
        {score}
        <span className="sr-only"> von {MAX_SCORE} Punkten</span>
      </p>
      <div aria-hidden="true" className="mt-2 h-0.5 w-full bg-line">
        <div className="h-full bg-fg" style={{ width: `${(score / MAX_SCORE) * 100}%` }} />
      </div>
      {size === "lg" && (
        <p aria-hidden="true" className="mt-1 text-xs text-muted tabular-nums">
          von {MAX_SCORE}
        </p>
      )}
    </div>
  );
}
