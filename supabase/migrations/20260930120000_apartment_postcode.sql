-- Add the listing's 5-digit German postcode as a location signal for listings
-- without a district (Immowelt, Ohne-Makler, Hildebrand & Partner alerts show
-- it). Nullable, no default: null = not stated. Existing rows stay null until
-- their email is reprocessed.

alter table public.apartments
  add column postcode text,
  add constraint apartments_postcode_check check (postcode ~ '^[0-9]{5}$');
