# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

# Leipzig Wohnungsscout

Personal apartment search dashboard for Leipzig.

## Goal

Build a small personal application that collects apartment alert emails from real-estate platforms, normalizes the listings, scores them according to personal preferences, and displays them in a dashboard.

## Stack

* Next.js App Router
* TypeScript strict mode
* Supabase / Postgres
* Tailwind CSS
* Resend Inbound Email

## Development principles

* Keep the architecture simple.
* Do not overengineer.
* Avoid unnecessary dependencies.
* Prefer explicit types and small functions.
* Avoid `any`.
* Separate parsing, normalization, persistence, scoring, and UI.
* Validate all external input.
* Unknown apartment attributes use `null`, not `false`.
* Do not guess undocumented external data structures.
* Platform-specific parsers may only be implemented from real example emails.
* Run typecheck, lint, and tests after meaningful changes.
* Fix errors before continuing.

## Product specification

Read `docs/product-spec.md` before implementing product features.

## Current scope

We are currently building V0.1.

Do not implement these unless explicitly requested:

* web scraping
* LLM-based extraction
* maps
* Telegram notifications
* push notifications
* advanced cross-platform deduplication
* generated application messages

## Email fixtures

```text
fixtures/private/emails/<platform>/   raw captures from `npm run capture:email`, untouched, gitignored
fixtures/emails/<platform>/           reviewed + redacted copies: committed, used by tests
fixtures/synthetic/                   invented data, never a platform format
```

* Raw captures contain personal data (addresses, names, search-alert links) and tracking URLs.
* Never commit anything under `fixtures/private/`, and never edit a raw capture. The capture script never overwrites.
* To create a test fixture, copy a private capture to `fixtures/emails/<platform>/`, then review and redact it by hand. Keep the listing structure intact.
* Tests and parsers use only `fixtures/emails/`.
* Do not create platform-specific parsing logic until at least one reviewed fixture exists for that platform.

## Architecture

The intended pipeline is:

```text
Inbound email
    ↓
Webhook
    ↓
Source detection
    ↓
Platform parser
    ↓
Normalization
    ↓
Feature extraction
    ↓
Scoring
    ↓
Persistence
    ↓
Dashboard
```

Keep these responsibilities separated in the codebase.

Pure core (no I/O, never imports Supabase):

* `src/lib/domain/`: `Apartment`, `NewApartment`, `ListingData`, enums, `IncomingEmail` (provider-independent), `StoredEmail`. Favorite is `isFavorite`, not an `ApartmentStatus`.
* `src/lib/sourceDetection.ts`: sender domain first, then majority of body link hosts; domains in `SOURCE_DOMAINS`.
* `src/lib/parsers/`: `parseEmail()` tries `PLATFORM_PARSERS`, then `genericParser` (returns `[]`).
  * `PLATFORM_PARSERS` currently holds only `immoscout.ts`. It parses the **plain-text** part and understands only the structure in `fixtures/emails/immoscout/alert-01.json`.
  * `immoscout.ts` stores `sourceUrl` without its query string (real alerts carry personal tracking parameters) and takes `sourceId` from `/email/expose/<digits>`.
  * `immoscout.ts` sets no structured features. That alert format has no warm rent, so ImmoScout apartments get no fingerprint.
  * Each fixture test is a regression test: changing its expectations needs a deliberate parser migration. It never throws; parser errors are returned as `failures` with status `parsed | unrecognized | failed`.
* `src/lib/features.ts`: per-feature term lists in `FEATURE_RULES`; any positive match wins, otherwise negated match → `false`, otherwise `null`.
* `src/lib/scoring.ts`: all weights in `SCORING`; returns `{ score, rawScore, breakdown }`. Scores are computed on read, not stored. The score is a ranking signal: it starts from a base score, unknown/false values are neutral, building type is not scored, and the result is clamped to 0–100. These weights deliberately supersede the "suggested weights" in `docs/product-spec.md`.
* `src/lib/fingerprint.ts`: rounding steps in `FINGERPRINT_STEPS`; returns `null` if any input is unknown.

## Database

* Schema source of truth: `supabase/migrations/` (plain SQL, Supabase CLI naming). Never change the schema in the Supabase dashboard without a matching migration.
* Tables: `emails` (raw inbound mail; `provider_message_id` unique for idempotency; `parse_status` `pending | parsed | unrecognized | failed`) and `apartments` (`email_id` → `emails` `on delete set null`).
* Value sets are CHECK constraints, not enum types. When a domain enum in `src/lib/domain/` changes, change the matching constraint in a new migration.
* Feature columns are nullable booleans with no default (null = unknown). `fingerprint` is indexed, not unique, and never used for merging.
* `unique nulls distinct (source, source_id)` is a plain constraint, not a partial index, so `upsert(onConflict: "source,source_id")` can target it.
* Scores are not stored.

Access is server-only:

* `src/lib/db/client.ts` (`import "server-only"`) builds the only client from `SUPABASE_URL` + `SUPABASE_SECRET_KEY`. There is no browser client, and nothing may use `NEXT_PUBLIC_*` for Supabase.
* RLS is enabled with no policies, and privileges are revoked from `anon`/`authenticated`; the secret key is the only access path. Do not add permissive policies.

`src/lib/db/` is the only place that knows Supabase or snake_case:

* `types.ts`: hand-written row types and `Database`. Update them with every migration.
* `mapping.ts`: every row ↔ domain conversion. Invalid stored values throw `DbMappingError`.
* `emails.ts`, `apartments.ts`: repository functions that take `db: Db` as the first argument and return domain types.
* Upserts never send `status`, `is_favorite` or `first_seen`, so re-received listings keep their workflow state. Status and favorite have separate update functions.
* Repository tests use `testing/fakeDb.ts` (a recorded fake query builder), so `npm test` needs no database.

Applying migrations to a Supabase project (no Docker needed): `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`. Alternatively paste the migration into the dashboard SQL editor. Either way, the file in the repo stays the source of truth.

Synthetic seed data lives in `fixtures/synthetic/`. It is invented, uses `source: "other"` with `synthetic-*` source ids, and must never be used as parser fixtures.

## Dashboard

Request flow: `src/proxy.ts` (Basic Auth) → Server Component page → repository (`src/lib/db/`) → domain `Apartment[]` → pure helpers in `src/lib/dashboard/` → components in `src/components/`. UI code never imports Supabase or row types, and there is no browser Supabase client.

* `src/app/page.tsx`: the dashboard. It parses `searchParams`, redirects non-canonical URLs, loads `listApartments()`, then calls `buildDashboardView()`.
* `src/app/apartments/[id]/page.tsx`: the detail page. It calls `notFound()` for unknown or malformed ids.
* Both pages call `connection()` and render per request, so `npm run build` needs no database credentials.
* `src/app/error.tsx`: shown when the database fails, so a failure never renders as an empty list.
* There is deliberately no `loading.tsx`: streaming would turn `redirect()` and `notFound()` into HTTP 200 fallbacks.
* `src/lib/dashboard/`:
  * `query.ts`: URL ↔ `DashboardQuery`, with defaults and validation.
  * `filters.ts`: tabs and filters.
  * `sorting.ts`: sorting with deterministic tie-breaks.
  * `view.ts`: combines these and scores each apartment via `scoreApartment()`.
  * `display.ts`: German labels and formatting.
  * `activeFilters.ts`: the removable filter chips.
  * `actionInput.ts`: Server Action input validation.
* Score breakdown labels come from `src/lib/scoring.ts`; never re-derive scoring in UI code.

URL conventions (all optional, parsed in `query.ts`; invalid values fall back to defaults, and the page redirects to the canonical URL):

* `tab`: `all | new | favorites | applied | viewing`. `favorites` means `isFavorite`, independent of status.
* `sort`: `score` (default) `| newest | rent | area`. Unknown numbers sort last; ties fall back to score, then newest, then id.
* `minRooms`, `maxRooms`, `minSqm`, `maxWarmRent`: numbers. They hide only apartments *known* to violate them; unknown values stay visible.
* `topFloor`, `balcony`, `bathtub`, `kitchen`: set to `1` to require the feature. Only `true` matches; unknown does not.
* `district`: exact match. `status`: an `ApartmentStatus`.

Server Actions live in `src/app/actions.ts` (`setApartmentStatus`, `setApartmentFavorite`):

* Each re-checks Basic Auth (`src/lib/auth/server.ts`), validates FormData with `actionInput.ts`, writes exactly one column, and revalidates `/` and `/apartments/[id]`.
* They work without JavaScript. `PendingButton` is the only client component, besides `error.tsx`.

`src/proxy.ts`: HTTP Basic Auth on every path except `/api/email/incoming` (authenticated only by the Resend signature) and static assets.

* Any username is accepted; only `DASHBOARD_PASSWORD` is checked (`src/lib/auth/basicAuth.ts`, constant-time).
* If `DASHBOARD_PASSWORD` is unset, every request gets 503, in every environment (fail closed).
* The matcher is covered by `src/proxy.test.ts`.

## Inbound email pipeline

```text
Resend email.received webhook (metadata only)
  → POST /api/email/incoming          src/app/api/email/incoming/route.ts (thin)
  → handleInboundWebhook()            src/lib/ingest/webhook.ts   (HTTP + retry semantics)
  → verify, parse event, fetch body   src/lib/ingest/resend.ts    (the ONLY Resend-aware module)
  → processIncomingEmail()            src/lib/ingest/pipeline.ts  (provider-independent)
      store raw email (pending) → detectSource → parseEmail → toNewApartment → upsert/insert → set parse status
```

**Verification rule: read the raw body first.**

* Call `request.text()`, then verify it with `resend.webhooks.verify()` using the `svix-id`, `svix-timestamp` and `svix-signature` headers and `RESEND_WEBHOOK_SECRET`.
* Never call `request.json()` or re-serialize the body before verifying.
* The SDK also rejects timestamps older than 5 minutes.

Retrieval:

* The webhook carries no body, so `resend.emails.receiving.get(email_id, { html_format: "cid" })` fetches it. `cid` keeps inline images out of the stored HTML.
* The response is checked with zod in `resend.ts` and mapped to `IncomingEmail`.
* `providerMessageId` is Resend's `email_id` (the idempotency key), never the RFC Message-ID.

HTTP semantics (Resend retries every non-2xx, at 5s, 5m, 30m, 2h, 5h, 10h):

* **400:** bad or missing signature, or a malformed signed payload.
* **200:** an ignored event type, a duplicate, or a processed email, including `unrecognized`, and `failed` when a parser threw.
* **502:** the Receiving API failed before anything was stored.
* **500:** missing config or a storage failure.

Responses and logs never contain email content or secrets; the `emails` table is the debugging source of truth.

Idempotency and partial failure (there are no transactions over Supabase REST):

* The raw email row is created first, and `provider_message_id` is unique.
* A redelivery whose email is already `parsed` or `unrecognized` stops. One left `pending` or `failed` is reprocessed.
* Reprocessing upserts listings that have a `sourceId`. For listings without one, it skips as many as `countApartmentsWithoutSourceId()` says are already stored for that email.
* A parser error means `parse_status = failed` with a 200 response (no retry). A storage error means `IngestionError` and a 500 (retry).

Other rules:

* **Unknown emails:** with no platform parsers, `parseEmail()` returns `[]`, so real alerts end up `unrecognized` with zero apartments. That is correct; never fabricate apartments from unknown emails.
* **Feature merge** (`src/lib/ingest/normalize.ts`): a structured `ParsedApartment.features` value wins, then the text extraction, then null. A structured `null`/`"unknown"` means "not stated".
* **Resend client:** `src/lib/ingest/resendClient.ts` is server-only and created lazily. `readResendEnv()` is only called when a request runs, so the build needs no secrets.

Fixtures:

* All fixtures use the format in `src/lib/ingest/fixtureFile.ts`.
* `capture:email` writes raw captures to the gitignored `fixtures/private/emails/<platform>/`.
* Reviewed and redacted copies go in `fixtures/emails/<platform>/` (see "Email fixtures").
* `fixtures/synthetic/emails/` holds invented test emails, never platform formats.

Reprocessing: `reprocessStoredEmail()` in `pipeline.ts` (`npm run reprocess:email`).

* It is separate from the webhook path, whose duplicate handling it does not touch.
* It loads the stored email by `provider_message_id` and re-runs source detection and the current parsers on the stored raw content. It works for any status.
* It persists through the same `processStoredEmail()` code as ingestion, always in resume mode: upsert for listings with a `sourceId`, and no re-inserting of source-id-less listings an earlier run already stored.
* It updates only `detected_source`, `parser_version`, `parse_status` and `parse_error`; raw columns are never updated.
* Use it after adding a parser, to turn earlier `unrecognized` emails into apartments.

Adding a platform parser: capture a real email, add a redacted copy to `fixtures/emails/<platform>/`, implement `ApartmentParser` in `src/lib/parsers/`, register it in `PLATFORM_PARSERS`, and add tests against the fixture.

## Commands

Requires Node 22.12+ (Vitest 5; see `engines` in `package.json`).

```text
npm run dev          # dev server on http://localhost:3000 (Basic Auth: any user + DASHBOARD_PASSWORD)
npm run build        # production build
npm run lint         # ESLint (eslint-config-next)
npm run typecheck    # next typegen && tsc --noEmit
npm test             # vitest run (all tests once)
npm run test:watch   # vitest in watch mode
npm run seed         # upsert synthetic apartments (needs .env.local)
npm run ingest:fixture -- <file.json> [--dry-run]   # run a fixture through the pipeline (--dry-run: no DB)
npm run capture:email -- <resend-email-id> <platform> # save a raw capture to fixtures/private/ (gitignored)
npm run reprocess:email -- <provider_message_id>     # re-run one stored email through the current parsers (uses the DB, never Resend)
npx vitest run src/lib/scoring.test.ts   # single test file
npx vitest run -t "name"                 # tests matching a name
```

- `typecheck` runs `next typegen` first because files use Next's generated global route types (e.g. `LayoutProps<"/">`). Plain `tsc` fails on a fresh checkout.
- Tests are `src/**/*.test.ts` and `fixtures/**/*.test.ts`, next to the module under test, in a Node environment (no jsdom). `@/*` resolves to `src/*` via tsconfig paths.
- Environment variables are listed in `.env.example`; copy it to `.env.local`. All of them are server-only.
- `seed`, `ingest:fixture`, `capture:email` and `reprocess:email` run through `tsx --conditions=react-server` so the `server-only` import resolves outside Next. `seed` is idempotent: it re-upserts the synthetic rows and resets their status/favorite.

Do not invent commands that are not defined in `package.json`.

## Next.js version

This is Next.js 16. APIs differ from older versions: request interception lives in `src/proxy.ts`, not `middleware.ts`. Check the bundled docs in `node_modules/next/dist/docs/` before using Next.js APIs. See @AGENTS.md.
