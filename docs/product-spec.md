# Leipzig Wohnungsscout — Product Specification

## Purpose

The application is a personal apartment-search dashboard for finding a suitable apartment in Leipzig.

Instead of scraping real-estate portals directly, the first version receives apartment alert emails from existing search alerts, extracts the listing data, normalizes it, scores each apartment according to personal preferences, and displays the results in one dashboard.

The application should help answer:

* What new apartments have appeared?
* Which ones fit my preferences best?
* Which listings have I already seen?
* Which apartments have I applied for?
* Which listings are worth reacting to quickly?

## Search profile

Target location:

* Leipzig

Preferred apartment:

* 3–4 rooms
* approximately 100 m²

Acceptable area:

* approximately 80–130 m²

Budget:

* ideally no more than €1,500 warm rent
* listings slightly above this should not automatically be discarded

Building type:

* Altbau is good
* Neubau is also good

Strong preference:

* Dachgeschoss / top floor

Additional preferences:

* balcony, loggia, terrace, or roof terrace
* bathtub
* Wohnküche
* large eat-in kitchen
* open kitchen with dining area

These optional attributes must not be used as strict upstream filters because real-estate platforms often fail to encode them reliably.

They should instead influence the ranking.

## Important data rule

Unknown is different from false.

Example:

```ts
balcony: true
balcony: false
balcony: null
```

`null` means the listing does not provide enough information.

Missing information must not be interpreted as a negative feature.

## Apartment model

Each normalized apartment should support the following information.

### Source

```ts
source:
  | "immoscout"
  | "immowelt"
  | "kleinanzeigen"
  | "wg-gesucht"
  | "lwb"
  | "other"
```

Additional source fields:

```ts
sourceUrl: string | null
sourceId: string | null
```

### Core listing data

```ts
title: string

address: string | null
district: string | null

rooms: number | null
sqm: number | null

rentCold: number | null
rentWarm: number | null

floor: number | null
```

### Apartment attributes

```ts
topFloor: boolean | null

balcony: boolean | null
bathtub: boolean | null
residentialKitchen: boolean | null
elevator: boolean | null

buildingType:
  | "altbau"
  | "neubau"
  | "unknown"
```

### Listing content

```ts
description: string | null
imageUrl: string | null
```

### Metadata

```ts
firstSeen: Date
emailReceivedAt: Date

score: number
```

### Status

```ts
status:
  | "new"
  | "seen"
  | "favorite"
  | "applied"
  | "viewing"
  | "rejected"
  | "gone"
```

## Raw email information

Store enough original information to debug parser failures.

At minimum:

```ts
rawSubject: string | null
rawFrom: string | null
rawEmail: string | null
parserVersion: string | null
```

The raw email should not be displayed prominently in the normal dashboard.

## Email ingestion

Initial ingestion uses Resend Inbound Email.

Expected flow:

```text
real-estate alert
    ↓
inbound email
    ↓
Resend
    ↓
POST /api/email/incoming
    ↓
validate event
    ↓
detect platform
    ↓
parse email
    ↓
normalize listing
    ↓
extract features
    ↓
calculate score
    ↓
save apartment
```

Processing should be idempotent where reasonably possible.

Receiving the same alert twice should not create obviously duplicated rows.

## Parser architecture

Do not use one universal parser.

Expected structure:

```text
src/lib/parsers/
  index.ts
  types.ts
  generic.ts
  immoscout.ts
  immowelt.ts
  kleinanzeigen.ts
  wgGesucht.ts
  lwb.ts
```

All platform parsers implement a common contract.

Example:

```ts
interface ApartmentParser {
  canParse(input: IncomingEmail): boolean
  parse(input: IncomingEmail): ParsedApartment
}
```

The generic parser acts as a safe fallback.

A failure to recognize a platform must never crash the complete ingestion pipeline.

## Real email fixtures

Platform-specific parsing must only be developed against real emails.

Fixtures belong in:

```text
fixtures/emails/<platform>/
```

Do not invent selectors, HTML structures, URLs, or metadata fields for platforms without fixtures.

## Feature extraction

Feature extraction should be independent from the platform parsers where possible.

A parser should primarily extract:

* listing text
* structured values
* URL
* metadata

Reusable extraction helpers should then detect semantic features.

### Dachgeschoss / top floor

Relevant terms may include:

```text
Dachgeschoss
Dachgeschoß
DG
oberstes Geschoss
oberste Etage
Penthouse
```

The extractor must avoid obvious false positives where possible.

### Balcony

Relevant terms:

```text
Balkon
Loggia
Terrasse
Dachterrasse
```

### Bathtub

Relevant terms:

```text
Badewanne
Wannenbad
Bad mit Wanne
```

### Residential kitchen

Relevant terms:

```text
Wohnküche
große Küche
großzügige Küche
offene Küche
Küche mit Essbereich
Platz für einen Esstisch
Koch- und Essbereich
```

These rules are intentionally heuristic.

V0.1 does not use an LLM for semantic extraction.

## Scoring

Each apartment receives a transparent score.

Target range:

```text
0–100
```

The score is a ranking aid, not a strict eligibility calculation.

Suggested positive weights:

```text
90–110 m²                  +20
80–130 m²                  +10

Dachgeschoss               +25

Balcony / terrace          +15

Bathtub                    +10

Wohnküche                  +15

Altbau or Neubau            +5

Elevator with Dachgeschoss  +5
```

Suggested penalties:

```text
warm rent > €1,500         -15

area < 80 m²               -20

rooms outside 3–4          -20
```

Unknown optional attributes should not receive a penalty.

The scoring implementation must be easy to modify later.

Place scoring logic separately from parsing and persistence.

Example:

```text
src/lib/scoring.ts
```

## Dashboard

The main dashboard should prioritize fast evaluation of new apartments.

Main navigation:

```text
All
New
Favorites
Applied
Viewings
```

Sorting:

```text
Score
Newest
Warm rent
Area
```

Each apartment card should show, where known:

* score
* title
* district
* rooms
* sqm
* warm rent
* rent per sqm
* Dachgeschoss
* balcony
* bathtub
* Wohnküche
* elevator
* building type
* source
* first seen

Unknown features should visually differ from false features.

Example:

```text
✓ Balcony
× Balcony
? Balcony
```

## Apartment actions

Each card should support changing the apartment status.

Important actions:

```text
Favorite
Seen
Applied
Viewing
Rejected
```

There should also be a link to open the original listing.

## Apartment detail page

Route:

```text
/apartments/[id]
```

The detail page should display:

* all normalized apartment information
* complete extracted description
* source
* original listing URL
* first seen timestamp
* email received timestamp
* parser version
* status controls

Debug information can be available in a secondary section.

## Filters

Initial filters:

* rooms
* minimum sqm
* maximum warm rent
* Dachgeschoss
* balcony
* bathtub
* Wohnküche
* district
* status

Unknown optional attributes should remain visible unless the user explicitly chooses a filter that requires that attribute.

## Deduplication

Advanced cross-platform deduplication is not part of V0.1.

However, the domain model should allow a simple fingerprint.

Possible fingerprint inputs:

```text
district
rooms
sqm
warm rent
```

Example helper:

```ts
createApartmentFingerprint({
  district,
  rooms,
  sqm,
  rentWarm
})
```

Approximate matches must not automatically be merged in V0.1.

## Development fixtures

Provide test fixtures for development.

Real email examples:

```text
fixtures/emails/
```

Synthetic apartment examples may also be used for UI development, but they must be clearly separated from real platform fixtures.

## Testing

V0.1 should contain basic tests for:

* scoring
* feature extraction
* source detection
* fingerprint creation

Parser tests should be added whenever a real platform fixture is introduced.

## V0.1 scope

V0.1 includes:

* Next.js application
* Supabase schema
* apartment domain model
* Resend inbound webhook
* generic parser architecture
* raw email storage
* feature extraction
* scoring
* simple fingerprinting
* apartment list
* apartment detail view
* filters
* sorting
* apartment status management
* tests

## Explicitly out of scope for V0.1

Do not build:

* direct portal scraping
* browser automation
* AI / LLM extraction
* Telegram notifications
* push notifications
* maps
* commute calculations
* historical rent analysis
* automatic listing disappearance detection
* application message generation
* sophisticated cross-platform duplicate merging
