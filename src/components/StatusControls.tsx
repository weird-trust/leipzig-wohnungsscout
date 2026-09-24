import { setApartmentFavorite, setApartmentStatus } from "@/app/actions";
import { PendingButton } from "@/components/PendingButton";
import { STATUS_LABELS } from "@/lib/dashboard/display";
import type { Apartment, ApartmentStatus } from "@/lib/domain/apartment";

/** Statuses offered as one-click actions on a dashboard row. */
const QUICK_STATUSES: readonly ApartmentStatus[] = ["seen", "applied", "viewing", "rejected"];

const BUTTON =
  "border border-line px-2 py-1 text-xs leading-none transition-colors hover:border-fg " +
  "disabled:cursor-wait disabled:opacity-60 aria-pressed:border-fg aria-pressed:bg-fg aria-pressed:text-bg";

export function FavoriteButton({ apartment }: { apartment: Pick<Apartment, "id" | "isFavorite"> }) {
  return (
    <form action={setApartmentFavorite}>
      <input type="hidden" name="id" value={apartment.id} />
      <input type="hidden" name="favorite" value={String(!apartment.isFavorite)} />
      <PendingButton
        aria-pressed={apartment.isFavorite}
        className={`${BUTTON} min-w-[5.5rem]`}
        title={apartment.isFavorite ? "Aus Favoriten entfernen" : "Als Favorit merken"}
      >
        <span aria-hidden="true">{apartment.isFavorite ? "★ " : "☆ "}</span>
        Favorit
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
      <div className="flex flex-wrap gap-1">
        {statuses.map((status) => (
          <PendingButton
            key={status}
            name="status"
            value={status}
            aria-pressed={apartment.status === status}
            className={BUTTON}
          >
            {STATUS_LABELS[status]}
          </PendingButton>
        ))}
      </div>
    </form>
  );
}
