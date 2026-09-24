-- Store the recipient addresses of inbound emails (IncomingEmail.to).
-- Useful for debugging and, later, for per-platform inbound aliases.
alter table public.emails
  add column raw_to text[] not null default '{}';
