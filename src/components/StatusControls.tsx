import { setApartmentFavorite, setApartmentStatus } from "@/app/actions";
import { ChevronIcon, StarIcon } from "@/components/Icons";
import { PendingButton } from "@/components/PendingButton";
import { STATUS_LABELS } from "@/lib/dashboard/display";
import type { Apartment, ApartmentStatus } from "@/lib/domain/apartment";

/** Statuses offered as one-click actions on a dashboard row. */
const QUICK_STATUSES: readonly ApartmentStatus[] = ["seen", "applied", "viewing", "rejected"];

/** Text-like option: the current one is marked by weight and a leading dot, not by color alone. */
const OPTION =
  "group/option flex w-full items-baseline gap-2 rounded-[4px] px-2 py-1.5 text-left text-sm text-muted " +
  "transition-colors hover:bg-surface hover:text-fg disabled:cursor-wait disabled:opacity-60 " +
  "aria-pressed:font-medium aria-pressed:text-fg";

function OptionDot() {
  return (
    <span
      aria-hidden="true"
      className="size-1.5 shrink-0 translate-y-[-0.1em] rounded-full bg-transparent group-aria-pressed/option:bg-accent"
    />
  );
}

/** Star toggle. Independent of the workflow status; see src/app/actions.ts. */
export function FavoriteButton({
  apartment,
  withLabel = false,
}: {
  apartment: Pick<Apartment, "id" | "isFavorite">;
  /** Show "Favorit" as visible text (detail page); otherwise icon only. */
  withLabel?: boolean;
}) {
  const label = apartment.isFavorite ? "Aus Favoriten entfernen" : "Als Favorit merken";
  return (
    <form action={setApartmentFavorite}>
      <input type="hidden" name="id" value={apartment.id} />
      <input type="hidden" name="favorite" value={String(!apartment.isFavorite)} />
      <PendingButton
        aria-pressed={apartment.isFavorite}
        title={label}
        className={`-m-1.5 inline-flex items-center gap-2 rounded-[4px] p-1.5 text-sm transition-colors hover:text-fg disabled:cursor-wait disabled:opacity-60 ${
          apartment.isFavorite ? "text-accent" : "text-faint"
        }`}
      >
        <StarIcon filled={apartment.isFavorite} />
        {withLabel ? (
          <span className="text-fg">{apartment.isFavorite ? "Favorit" : "Als Favorit merken"}</span>
        ) : (
          <span className="sr-only">Favorit</span>
        )}
      </PendingButton>
    </form>
  );
}

/**
 * One form, one submit button per status. Changing the status never touches
 * the favorite flag (and vice versa); see src/app/actions.ts.
 */
export function StatusButtons({
  apartment,
  statuses = QUICK_STATUSES,
}: {
  apartment: Pick<Apartment, "id" | "status">;
  statuses?: readonly ApartmentStatus[];
}) {
  return (
    <form action={setApartmentStatus} aria-label="Status ändern">
      <input type="hidden" name="id" value={apartment.id} />
      <ul className="-mx-2">
        {statuses.map((status) => (
          <li key={status}>
            <PendingButton
              name="status"
              value={status}
              aria-pressed={apartment.status === status}
              className={OPTION}
            >
              <OptionDot />
              {STATUS_LABELS[status]}
            </PendingButton>
          </li>
        ))}
      </ul>
    </form>
  );
}

/**
 * Dashboard variant: the current status as quiet text; the options open in
 * a native disclosure, so it works without JavaScript.
 */
export function StatusMenu({ apartment }: { apartment: Pick<Apartment, "id" | "status"> }) {
  return (
    <details className="group relative">
      <summary className="-m-1.5 inline-flex items-center gap-1.5 rounded-[4px] p-1.5 text-sm transition-colors hover:text-fg">
        <span className="sr-only">Status: </span>
        <span className={apartment.status === "new" ? "font-medium text-accent" : "text-muted"}>
          {STATUS_LABELS[apartment.status]}
        </span>
        <ChevronIcon className="size-3 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute top-full right-0 z-20 mt-2 w-48 rounded-md border border-line bg-bg p-2 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]">
        <p className="pb-1 text-sm text-faint">Status ändern</p>
        <StatusButtons apartment={apartment} />
      </div>
    </details>
  );
}
