import { CheckIcon } from "@/components/Icons";
import type { ApartmentFeatures } from "@/lib/domain/apartment";
import {
  buildingTypeLabel,
  DISPLAY_FEATURES,
  FEATURE_LABELS,
  TRI_STATE_TEXT,
  triStateKey,
} from "@/lib/dashboard/display";

type StateKey = keyof typeof TRI_STATE_TEXT;

/** Present: high contrast. Absent: subdued. Unknown: lightest. */
const STYLE: Record<StateKey, string> = {
  yes: "text-fg",
  no: "text-muted",
  unknown: "text-faint",
};

/** ✓ present, – absent, ? unknown. The mark and the (screen-reader) text carry the meaning, not color. */
function Mark({ state }: { state: StateKey }) {
  return (
    <span aria-hidden="true" className="inline-flex w-3.5 shrink-0 justify-center font-mono">
      {state === "yes" ? <CheckIcon /> : state === "no" ? "–" : "?"}
    </span>
  );
}

interface Item {
  label: string;
  state: StateKey;
}

function items(features: ApartmentFeatures): Item[] {
  const building = buildingTypeLabel(features.buildingType);
  return [
    ...DISPLAY_FEATURES.map((feature) => ({
      label: FEATURE_LABELS[feature],
      state: triStateKey(features[feature]),
    })),
    { label: building ?? "Altbau / Neubau", state: building ? "yes" : "unknown" },
  ];
}

/**
 * Tri-state features in a fixed order, so rows can be compared by eye.
 * Compact (dashboard): on small screens the unknown ones collapse into
 * one quiet "Unbekannt: …" line. Verbose (detail page): the state is
 * also spelled out.
 */
export function FeatureList({
  features,
  verbose = false,
}: {
  features: ApartmentFeatures;
  verbose?: boolean;
}) {
  const list = items(features);

  if (verbose) {
    return (
      <ul className="divide-y divide-line border-y border-line">
        {list.map((item) => (
          <li key={item.label} className={`flex items-baseline gap-3 py-2.5 ${STYLE[item.state]}`}>
            <Mark state={item.state} />
            <span className="flex-1">{item.label}</span>
            <span className="text-sm text-faint">{TRI_STATE_TEXT[item.state]}</span>
          </li>
        ))}
      </ul>
    );
  }

  const unknown = list.filter((item) => item.state === "unknown");
  return (
    <div className="text-sm">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 lg:flex-col lg:gap-y-0.5">
        {list.map((item) => (
          <li
            key={item.label}
            className={`flex items-baseline gap-1.5 ${STYLE[item.state]} ${
              item.state === "unknown" ? "max-sm:hidden" : ""
            }`}
          >
            <Mark state={item.state} />
            <span>{item.label}</span>
            <span className="sr-only">: {TRI_STATE_TEXT[item.state]}</span>
          </li>
        ))}
      </ul>
      {unknown.length > 0 && (
        <p className="mt-1 text-faint sm:hidden">
          <span aria-hidden="true" className="font-mono">? </span>
          Unbekannt: {unknown.map((item) => item.label).join(", ")}
        </p>
      )}
    </div>
  );
}
