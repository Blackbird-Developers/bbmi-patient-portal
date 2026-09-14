# Beyond BMI — patient portal prototype (Semble-backed)

A runnable, presentable prototype of the new Beyond BMI patient portal that treats **Semble** as the clinical system of record and keeps identity, journey, rules and billing state in the portal. It shows only what Semble can actually back — see `docs/PRODUCT.md` → *Out of scope for now*. Built 11 Sep 2026 by Blackbird.

## Run it

```bash
npm install
npm run dev -- --port 3050
```

Open http://localhost:3050 → sign in as any of the six demo patients (buttons under the login form, or type their email; any password works in mock mode).

| Patient | Journey stage (prod name) | What it demonstrates |
|---|---|---|
| Seán Murphy | `consult_paid` | Paid €89 an hour ago → questionnaire gate → book the doctor consultation |
| Aoife Byrne | `consult_done` | Day 12 after the consultation: prescription and delivery status, 30-day prescription window, week-1 check-in, quiet 90-Day offer |
| Ciarán Walsh | `ninety_day_active` | Day 38 of 90, €150 × 3: MDT steps with windows, weekly weigh-in, next instalment |
| Margaret O'Sullivan | `legacy_member` (Ongoing Care €75) | Quarterly doctor, monthly nurse, extra sessions |
| Dara Kelly | `ninety_day_overdue` | Instalment failed → paused, one action: pay the open invoice and resume |
| Fiona Nolan | `ninety_day_completed` | Results summary → choose Ongoing Care €75 / full MDT €150 |

The **Demo: switch patient** panel at the bottom of the left rail jumps between them. `/architecture` is the presenter page (system diagram, who-owns-what, Semble facts, roadmap, decisions).

## What is real vs mocked

- **Real**: the journey engine (`src/lib/portal/journey.ts`), the 90-day programme windows and ordering (`programme.ts`), the booking flow against the adapter interface, forms, weight tracking, every member state and its copy, the design system.
- **Mocked**: Semble (in-memory adapter with synthetic patients, clinicians, bookings, prescriptions, letters, invoices — names are fictional), Stripe (plan changes mutate the in-memory store), authentication (a cookie holding the demo user id).
- **Removed, not mocked**: patient messaging (Semble's communications are outbound only — a patient reply never enters Semble and staff have no inbox) and dose tracking (no Semble model for a patient-entered dose diary, and today's portal does not ask for one). Prescriptions are read-only with no download: the script goes from the doctor to the pharmacy. Rather than demo something the client cannot ship, these are gone from the screens and written up in `docs/PRODUCT.md`.
- `SEMBLE_ADAPTER=graphql` + `SEMBLE_API_TOKEN` switches to the real adapter skeleton (`src/lib/semble/graphql.ts`). It has **not** been run against a BBMI tenant — no BBMI token exists yet. Never point it at another client's practice.

## Layout

```
docs/PRODUCT.md, docs/DESIGN.md      the contract every screen follows
docs/research/                       8 deep-read reports + the client's journey map (source of the design)
src/lib/semble/                      adapter interface, mock + GraphQL implementations, Dublin↔UTC time helpers
src/lib/portal/                      portal-owned domain: states, plans, programme schedule, demo store, journey view-model
src/app/(portal)/                    routes: / prescriptions progress care appointments programme book/[type] documents account plans forms/[slug] architecture
src/components/ui, features, shell   design-system primitives, journey widgets, app shell
```

## Rules baked in (from the research)

- Semble has no patient auth and its token is practice-wide → the token never reaches the browser; every query is scoped to the signed-in patient's Semble id.
- Semble returns naive Dublin wall-clock tagged as UTC → converted both ways in the adapter; availability is chunked into ≤7-day windows; "too often" rate limits are retried; paginated reads are de-duplicated by id.
- All eligibility (stage, windows, allocation, gates, paused states) is decided server-side; the UI only mirrors it.
- Overdue members get the open Stripe invoice, never a fresh checkout. Ongoing Care is offered only after `ninety_day_completed`. The €89 stage never shows an upsell hero or community.
- Document links are minted on click (15-minute Semble URLs) and never cached; prescriptions are read-only, with nothing for the patient to download.
