import type { ApartmentFeatures, TriState } from "@/lib/domain/apartment";
import {
  buildingTypeLabel,
  DISPLAY_FEATURES,
  FEATURE_LABELS,
  TRI_STATE_TEXT,
  triStateKey,
} from "@/lib/dashboard/display";

const SYMBOL = { yes: "✓", no: "×", unknown: "?" } as const;

const STYLE = {
  yes: "text-fg font-medium",
  no: "text-muted",
  unknown: "text-faint",
} as const;

function FeatureItem({
  label,
  value,
  verbose,
}: {
  label: string;
  value: TriState;
  verbose: boolean;
}) {
  const key = triStateKey(value);
  return (
    <li className={`flex items-baseline gap-1.5 ${STYLE[key]}`}>
      <span aria-hidden="true" className="w-3 text-center font-mono">
        {SYMBOL[key]}
      </span>
      <span className={key === "unknown" ? "italic" : undefined}>{label}</span>
      {verbose ? (
        <span className="text-xs text-faint">{TRI_STATE_TEXT[key]}</span>
      ) : (
        <span className="sr-only">: {TRI_STATE_TEXT[key]}</span>
      )}
    </li>
  );
}

/**
 * Tri-state features: ✓ present, × explicitly absent, ? unknown. The symbol
 * and (for screen readers) text carry the meaning, not color. Unknown is
 * shown, but visually quieter.
 */
export function FeatureList({
  features,
  verbose = false,
}: {
  features: ApartmentFeatures;
  /** Show the state as words too (detail page). */
  verbose?: boolean;
}) {
  const building = buildingTypeLabel(features.buildingType);
  return (
    <ul
      className={
        verbose
          ? "grid gap-1.5 text-sm sm:grid-cols-2"
          : "flex flex-wrap gap-x-4 gap-y-1 text-sm"
      }
    >
      {DISPLAY_FEATURES.map((feature) => (
        <FeatureItem
          key={feature}
          label={FEATURE_LABELS[feature]}
          value={features[feature]}
          verbose={verbose}
        />
      ))}
      <FeatureItem
        label={building ?? "Altbau / Neubau"}
        value={building ? true : null}
        verbose={verbose}
      />
    </ul>
  );
}
