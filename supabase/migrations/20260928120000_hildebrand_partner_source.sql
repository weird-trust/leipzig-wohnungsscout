-- Add 'hildebrand-partner' as a first-class source. Forward-only: replaces the
-- two source CHECK constraints from 20260924180000_ohne_makler_source.sql with
-- the same value set plus 'hildebrand-partner'. Existing rows are unaffected
-- (the set only grows).

alter table public.emails
  drop constraint emails_detected_source_check,
  add constraint emails_detected_source_check check (
    detected_source in ('immoscout', 'immowelt', 'kleinanzeigen', 'wg-gesucht', 'lwb', 'ohne-makler', 'hildebrand-partner', 'other')
  );

alter table public.apartments
  drop constraint apartments_source_check,
  add constraint apartments_source_check check (
    source in ('immoscout', 'immowelt', 'kleinanzeigen', 'wg-gesucht', 'lwb', 'ohne-makler', 'hildebrand-partner', 'other')
  );
