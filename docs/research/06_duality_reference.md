# 06 — Duality patient portal as an engineering reference for the BBMI portal

**Research slice:** our previous patient-portal build (Duality Healthcare, NI) — architecture, stack, design system, compliance patterns, reusable lessons.
**Date:** 2026-09-11. **Author:** Claude (research subagent) for Art / Blackbird.
**Scope rule:** engineering patterns only. No Duality client data, commercials, personnel, account ids or hostnames are carried into this document. Vendor name "Hero Health" is kept only because the adapter pattern is unintelligible without naming the thing being adapted.

**Path shorthands used in citations (all under `C:/Users/Admin/Desktop/Work/Obsidian/ZiftiPC/`):**
- `ROOT` = `Projects/Duality/Duality` · `PORTAL` = `ROOT/duality-portal` · `DOCS` = `Projects/Duality/duality-docs` · `SNAP` = `_claude-setup/memory-snapshot` (prior-session memory notes, Mac-era, last updated 2026-07-07/08).

---

## TL;DR

1. **Duality is a thin patient portal over a third-party clinical system, built as an npm-workspaces monorepo: React 19 + Vite + Tailwind 4 + shadcn/ui SPA, a standalone Hono `/v1` JSON API, Supabase (Postgres + Auth PKCE + Storage), Stripe, AWS (S3/CloudFront + App Runner), Capacitor shell for mobile** (`PORTAL/README.md:10-16`, `ROOT/../DEPENDENCIES.md:17-31`, `DOCS/decisions/0007-one-backend-many-clients.md:18-19`).
2. **The one architectural spine is "the clinical vendor is an adapter, not the core"**: an `IntegrationLayer` interface in our domain language, one adapter per vendor, ESLint-enforced import boundary, branded ids, vendor ids confined to a mapping table (`DOCS/architecture.md:39-67`, `DOCS/decisions/0001-integration-layer-pattern.md:13`). This is exactly the shape the BBMI/Semble portal needs.
3. **No clinical data is duplicated**: reads are on-demand through the adapter; documents are short-lived signed URLs behind a DOB gate; the portal DB holds only portal-owned concepts (dependants, membership mirror, loyalty, referrals, mappings, audit log) (`DOCS/architecture.md:95-118`, `DOCS/compliance.md:93-97`).
4. **Contract-first development** (`@duality/contracts` = Zod schemas + inferred types + error envelope, plus a deterministic stub per endpoint) is what let one FE dev and one BE dev work in parallel with almost no meetings (`DOCS/CLAUDE.md:86-99`, `DOCS/daily-sync.md:30-34`).
5. **Auth/session model**: Supabase magic-link/PKCE mints the identity once; the API then sets its own httpOnly session cookie (web) or accepts a bearer token (native); patient scope is derived from the principal, never from a client-supplied id (`DOCS/decisions/0005-magic-link-auth.md:15`, `PORTAL/apps/api/README.md:51-53`, `SNAP/duality-next-session.md:16`).
6. **Identity-to-clinical-record linking was the hardest, latest-solved problem**: the vendor API could not create patients, so the portal added a profile-bootstrap step, a durable id-map table, and an "ensure-patient" match-or-create on the booking path with explicit 409 codes for incomplete/no-record/ambiguous (`SNAP/duality-next-session.md:29,31`).
7. **Design system is a written contract** (`PRODUCT.md` + `DESIGN.md` + Impeccable skill + `npx impeccable detect` gate) over vendored shadcn primitives and OKLCH tokens. The **structure** (two registers, spacing/radii/motion/a11y rules, anti-reference list, detector allow-list) is brand-neutral and reusable; the **palette and voice are Duality's and must not be reused** (`ROOT/DESIGN.md`, `ROOT/PRODUCT.md`, `ROOT/CLAUDE.md`).
8. **Compliance is enforced in code, not just policy**: RLS default-deny + FORCE, append-only audit table, PII-free payload summaries, `RedactingCallLogger`, licence-allowlist CI gate, gitleaks pre-commit, SBOM, secrets only in a managed store, `no-store` on API responses (`DOCS/database.md:41-151`, `PORTAL/SECURITY.md:11-34`).
9. **Status**: not a finished product on this machine's evidence. By 2026-07-07 it had a live staging FE + API on a custom domain, a paid signup funnel verified end-to-end by Art, native member booking shipped, and a session-rotation rewrite due — with webhooks/HubSpot/Resend/product-catalogue still blocked on client inputs (`PORTAL/apps/api/README.md:99-112`, `SNAP/duality-next-session.md:3,12-20`).
10. **Only docs exist on this PC** — zero `.ts/.tsx/.sql/.tf` files, no `.git`; the code lives in the GitHub repo. Every code-level fact below is therefore from READMEs/ADRs/memory notes, not from reading source.

---

## 0. Source caveat — what is actually on this machine

| Location | What it holds | Evidence |
|---|---|---|
| `PORTAL/` | `README.md`, `SECURITY.md`, `apps/api/README.md`, `apps/web/CAPACITOR.md`, `docs/adr/0001`, `docs/staging-environment.md`, `e2e/README.md`, `infra/aws/README.md`, `supabase/README.md`, one mp4 + poster, an **empty** directory skeleton (`apps/*/src`, `packages/*/src`, `supabase/migrations`, `scripts`, `infra/aws/bootstrap` all contain no files) | file census: 142 svg (built flag assets in `dist/`), 37 md, 7 jpg, 5 png, 1 mp4; **0** ts/tsx/sql/tf/json; no `.git` |
| `DOCS/` | handbook, architecture, compliance, conventions, database, hero-api, testing, glossary, daily-sync, `decisions/0000-0007` | complete, dated 2026-06-18 |
| `ROOT/Information/` | engineering handover brief, vendor API question list, staging booking setup worklist | complete |
| `ROOT/hero-staging-probe/` | README + one probe summary (all 12 probed paths returned 302 to an admin sign-in, i.e. every path was still a guess at 2026-06-28) | `ROOT/hero-staging-probe/output/hero-probe-summary.md:12-34` |
| `ROOT/lovable-reference/` | 7 image assets only | — |
| `SNAP/duality-*.md` | five prior-session memory notes, incl. a dense "next-session" log through 2026-07-07 | `SNAP/duality-next-session.md` |

The empty skeleton is a vault-sync artefact (the vault deliberately excludes `node_modules`, `dist`, `.env*`; source files evidently did not sync either — `Projects/RESTORE - Dependencies & Sync.md:3,27-31` documents only the dependency restore). **Anything marked [INFERRED] below is a reading of docs, not of code.**

---

## 1. Stack and repo layout

### 1.1 Stack (as locked in docs)

| Layer | Choice | Source |
|---|---|---|
| Frontend | React 19 + Vite 5 + TypeScript strict, Tailwind 4 (`@tailwindcss/vite`, `tw-animate-css`), shadcn/ui on the full `@radix-ui/*` suite, lucide-react, CVA + clsx + tailwind-merge, react-router-dom 6, react-hook-form + zod, sonner, vaul, cmdk, react-day-picker, date-fns | `DEPENDENCIES.md:23-27`, `PORTAL/README.md:10` |
| Server state | TanStack Query 5; "never `useEffect` for data fetching" | `PORTAL/README.md:11`, `DOCS/conventions.md:140-146` |
| API | **Hono 4** on `@hono/node-server`, Zod 3, one standalone versioned `/v1` service for web + Capacitor + future native | `DEPENDENCIES.md:20`, `PORTAL/apps/api/README.md:3`, `DOCS/decisions/0007-one-backend-many-clients.md:18-19` |
| Auth | Supabase Auth, PKCE, magic-link only in v1 (no passwords) — see §3 for how this drifted | `PORTAL/README.md:12`, `DOCS/decisions/0005-magic-link-auth.md:15` |
| Data | Supabase Postgres + Storage, single UK region, RLS-first | `PORTAL/README.md:13`, `DOCS/database.md:3` |
| Hosting | AWS: SPA on S3 + CloudFront (static only), API on App Runner (container, eu-west-2), Terraform in `infra/aws/` | `DOCS/decisions/0006-host-on-aws.md:16-19`, `PORTAL/infra/aws/README.md:1-3` |
| Billing | Stripe: PaymentElement inline for card capture, Customer Portal redirect for self-service | `DOCS/decisions/0002-stripe-paymentelement.md:15-16` |
| Email | Resend, React Email templates | `DOCS/decisions/0004-resend-transactional-email.md:15,28` |
| CRM | HubSpot Forms API called server-side only, never from the browser | `DOCS/decisions/0003-hubspot-forms-api.md:15-17` |
| Mobile | Capacitor 8 wrapping the same SPA; native projects not committed | `DEPENDENCIES.md:23`, `PORTAL/apps/web/CAPACITOR.md:9` |
| Tooling | ESLint 8 airbnb-typescript + prettier + jsx-a11y, Prettier 3, TS 5.6, Vitest 2, Playwright 1.61, commitlint 19, lint-staged; Node ≥ 22 | `DEPENDENCIES.md:3,17` |

Note the documented IaC contradiction: the ADR says "use AWS CDK, avoid Terraform (BUSL-1.1 not on the licence allowlist)" (`PORTAL/docs/adr/0001-hosting-aws-keep-supabase.md:39-42`, `DOCS/decisions/0006-host-on-aws.md:36`) but the shipped infra is Terraform ≥ 1.6 (`PORTAL/infra/aws/README.md:40`). Lesson: ADRs drift from reality within weeks unless re-checked.

### 1.2 Monorepo layout

```
duality-portal/                npm workspaces, single `npm install`
  packages/domain              @duality/domain — entities + branded ids, no deps (both sides)
  packages/contracts           @duality/contracts — Zod schemas + inferred types, ApiError envelope, drift guards vs domain
  packages/integration         @duality/integration — BACKEND ONLY: integration-layer.ts (seam), call-log.ts (+RedactingCallLogger),
                               ports.ts (Auth / Persistence / Storage ports), hero/ (adapter + id-map), stub/, stub-data/, dedup/, billing/, email/, hubspot/, session/
  apps/api                     Hono service: middleware → thin routes → IntegrationLayer / PersistencePort
  apps/web                     React SPA; src/{api,app,components/{ui,layout},features/<feature>,hooks,lib,pages}
  supabase/migrations          forward-only, one change per migration
  infra/aws                    Terraform (ECR, App Runner, Secrets Manager shells, IAM/OIDC)
  e2e/                         Playwright against the stub stack
```
Sources: `PORTAL/README.md:30-45`, `PORTAL/apps/api/README.md:62-67`, directory skeleton on disk (`apps/web/src/features/{admin,appointments,auth,book-visit,booking/steps,corporate,dashboard/cards,documents,family,loyalty,membership,mobile,notifications,profile,referral,signup}`), `packages/integration/src/{billing,dedup,email,hero,hubspot,session,stub,supabase}`.

Two rules that make the layout work:
- **The browser bundle never imports the vendor adapter.** The web app imports only a browser-safe subset (stub adapter + fixtures + the interface *type*) via deep aliases, never the package barrel, so `hero/*` and `node:crypto` never reach the client (`PORTAL/README.md:30-31,80-82`). A barrel re-export once leaked the adapter and the ESLint rule caught it (`DOCS/daily-sync.md:15,30`).
- **Contract-first**: for every endpoint the first artefact is the contract (Zod schema → inferred type → error variants as a discriminated union); a deterministic stub ships alongside; FE builds against the stub before BE exists (`DOCS/CLAUDE.md:86-99`). Conventions adopted package-wide: `.strict()` on request bodies, no `.default()`, `dob` on the wire → `dateOfBirth` on the entity, one-way drift guards vs domain (`SNAP/duality-team-coordination.md:14`).

### 1.3 Local-dev story
- `NEXT_PUBLIC_USE_API_STUB=true` (dev default) makes the FE factory return the stub adapter so the SPA runs with realistic synthetic data and no backend (`PORTAL/README.md:69-77`).
- The API also runs fully in-memory: `npm run dev -w @duality/api` + `Authorization: Bearer test-token` resolves to synthetic patient `p1` (`PORTAL/apps/api/README.md:5-18`).
- Playwright boots both dev servers and runs the real SPA against the stub API; protected routes render via a DEV-only bearer token; selectors are role/label based, no `data-testid`; timezone pinned to UTC (`PORTAL/e2e/README.md:3-48`).
- A fixed synthetic dataset (Sarah/Mark/Emma, three clinicians, three services, three locations, "today" = a fixed date) is shared by fixtures, screenshots and tests (`DOCS/testing.md:20-56`).

---

## 2. Integrating with the external clinical/booking system

### 2.1 The adapter seam
- Interface in **our** vocabulary: `getPatientByEmailAndDob`, `registerPatient`, `listUpcomingAppointmentsForPatient`, `listAvailableSlots`, `bookAppointment(input, idempotencyKey)`, `cancelAppointment`, `listDocumentsForPatient`, `getDocumentDownloadUrl(documentId, dob)`, `listMessages`, `sendMessage` (`DOCS/architecture.md:46-56`).
- One implementation per vendor; a stub implementation for tests/dev; a factory selects by env; ESLint `no-restricted-imports` blocks `**/hero/*` everywhere except the factory (`DOCS/conventions.md:37`, `PORTAL/apps/api/README.md:72`).
- Vendor response shapes are normalised at the boundary; vendor error codes map to typed domain errors (`AppointmentSlotTakenError`, not `SLOT_UNAVAILABLE`) (`DOCS/architecture.md:147`, `DOCS/hero-api.md:91-106`).
- Vendor ids never sit on domain entities: branded id types (`PatientId`, `HeroPatientId`) make the leak a compile error, and the mapping lives in `hero_patient_mapping` which only the adapter reads/writes (`DOCS/conventions.md:21-23`, `DOCS/database.md:181-186,203`, `PORTAL/SECURITY.md:17`).

### 2.2 Two data lanes, three ports
- Clinical data → `IntegrationLayer`; portal-owned data (dependants, loyalty, referrals, notification prefs, Stripe customer id, membership mirror) → `PersistencePort`. Both swappable behind interfaces (`PORTAL/apps/api/README.md:73-75`).
- `ports.ts` also abstracts `AuthPort` and `StoragePort`; the in-memory stubs are the default until real Supabase-backed ports are wired, and the app **fails closed** in production if they are missing (`PORTAL/README.md:40`, `PORTAL/apps/api/README.md:91-92`, `PORTAL/infra/aws/README.md:192-201`).

### 2.3 Sync model: none (on-demand reads), plus webhooks for invalidation
- Nothing clinical is cached or persisted: no clinical rows in Postgres, no clinical content in `localStorage`/`sessionStorage`, documents surfaced only as short-lived signed URLs (`DOCS/architecture.md:113-118,157`).
- Webhook design (drafted, **not shipped** — CT-010 blocked on the vendor's signing scheme): HMAC signature verified first, 401 on failure; event-id logged to `audit_log` first and repeats are no-ops; events drive TanStack Query invalidation and optional transactional email (`DOCS/hero-api.md:118-144`, `PORTAL/apps/api/README.md:105`).
- Adapter resilience rules: exponential backoff on 429 (max 3), per-endpoint budget so user-blocking booking beats background sync (`DOCS/hero-api.md:110-114`).
- Every adapter call is logged with correlation id, endpoint, duration, status — and nothing else (no names/DOB/content) — so a future second backend can be shadow-run by replay (`DOCS/hero-api.md:210-231`, `DOCS/architecture.md:126`).

### 2.4 Idempotency
- Every non-idempotent write takes an `Idempotency-Key` header; keys are composed deterministically (`book:<patient>:<slot>:<service>`), namespaced per principal (`${userId}:${key}`) after an audit found cross-user replay, and stored DB-side so they survive restarts (`DOCS/hero-api.md:78-82`, `PORTAL/apps/api/README.md:54-55,80-81`, `SNAP/duality-security-posture.md:14`, `SNAP/duality-next-session.md:31`).

### 2.5 What reality did to the design (the lessons worth the most)
- **The probe's paths were guesses**; the first run returned 302→admin-sign-in for all 12 paths (`ROOT/hero-staging-probe/output/hero-probe-summary.md:12-34`). Enumerate the real API before designing endpoints — the interface shape in `architecture.md` predates any confirmed vendor endpoint.
- **The vendor API could not create patients, could not create availability, and booking links were admin-console-only** (`SNAP/duality-next-session.md:26,29`; `ROOT/Information/hero-staging-booking-setup.md:9-10`). Consequence: an entire "ensure-patient / profile-bootstrap" sub-system had to be built late (§3.3).
- **Slot search params differed from docs** (datetimes not dates; a location filter that 404'd, so location is filtered client-side) (`SNAP/duality-next-session.md:27`).
- **The in-memory id map lost every mapping on each deploy**; the durable Supabase-backed map was added only after UAT failures (`SNAP/duality-next-session.md:29,31`). Start durable.
- **A staging FE with production booking links books real appointments** — the catalogue was env-gated only after this hazard was spotted (`ROOT/Information/hero-staging-booking-setup.md:80-83`, `SNAP/duality-hero-issues.md:18`).
- **Vendor-side duplicate patient records broke booking eligibility**; the mitigation was a portal-side normalised match (case-fold, strip hyphens/spaces; exact DOB + normalised name OR email; ambiguous → staff) before any register call (`DOCS/hero-api.md:235-246`, `ROOT/Information/Hero-API-Questions-for-Integration.md:68-75`, `SNAP/duality-next-session.md:29`).
- **Third-party error codes must be captured live, not assumed**: a migration-before-code deploy produced 502s on every valid sign-in because the guard looked for a raw Postgres code while PostgREST reports `PGRST205` (`SNAP/duality-next-session.md:14`).
- **Stripe webhook payload shape moved between API versions**; the code now dual-reads both shapes and the endpoint version is pinned deliberately (`SNAP/duality-next-session.md:35,62`).

---

## 3. Auth, session and identity mapping

### 3.1 Authentication
- v1 decision: Supabase magic-link only, no passwords, optional TOTP MFA, recovery = "request a new link" (`DOCS/decisions/0005-magic-link-auth.md:15,28-31`). The signup verification email is the first magic-link sign-in (`DOCS/decisions/0004-resend-transactional-email.md:15`).
- [INFERRED] This drifted: a change-password PR (#48) and a forgot-password page (#79) exist in the July log, so email+password was added alongside magic link (`SNAP/duality-next-session.md:33,51`). Decide the BBMI auth mode once and record it; do not let it drift silently.
- Supabase Auth URL config (Site URL + redirect allowlist for `/auth/callback` and `/reset-password`, plus `dualityapp://…` scheme for native) is a dashboard task that silently breaks magic links when missed (`PORTAL/docs/staging-environment.md:70-76`, `PORTAL/apps/web/CAPACITOR.md:133-143`).

### 3.2 Session
- The Supabase token is used **once** at sign-in (`POST /api/auth/verify-signup`); the API then issues its own httpOnly `session` cookie (web) or accepts a bearer token (native) (`PORTAL/e2e/README.md:25-27`, `PORTAL/apps/api/README.md:51`, `DOCS/decisions/0007-one-backend-many-clients.md:33-34`).
- Cookie TTL was 1 hour; BE-SF-007 replaced it with an **opaque server-side session id + sessions table, rotation on refresh, sliding expiry, per-request role re-resolution** (closes sign-out revocation and stale-role gaps) (`PORTAL/apps/web/CAPACITOR.md:167-172`, `SNAP/duality-next-session.md:16`).
- `SameSite` is derived per request from the `Origin` header: Capacitor origins (`capacitor://localhost`, `https://localhost`) → `None; Secure`; same-site web → `Lax`. The cross-site CloudFront↔App Runner setup caused "session expired" in UAT until the FE moved onto the same registrable domain (`PORTAL/docs/staging-environment.md:24-33`, `SNAP/duality-next-session.md:18,33`). Host FE and API on one registrable domain from day one.
- CSRF: allowed-origin check + `hono/csrf` + JSON `Content-Type` guard on body writes (`PORTAL/apps/api/README.md:56,82`).

### 3.3 Identity → clinical record
- Portal identity = Supabase auth user ↔ `profiles` (auto-created on first sign-in, carries `role`) (`DOCS/database.md:11`, `PORTAL/supabase/README.md:12`).
- Original design: match vendor patient by email + DOB at first sign-in; if none, register in the vendor and open a reception task (`DOCS/architecture.md:134-138`).
- What shipped: `profiles` gained `first_name/last_name/date_of_birth/phone`; an authenticated `POST /v1/me/profile-bootstrap` is called after account creation; on the **booking path** an "ensure-patient" step pages vendor patients, applies the dedup matcher, writes `hero_id_map`, or returns explicit 409s `PROFILE_INCOMPLETE` / `NO_CLINICAL_RECORD` / `RECORD_AMBIGUOUS`; `GET /me/profile` falls back to portal identity when unmapped and reads return `[]`/`null` for unmapped patients rather than 500 (`SNAP/duality-next-session.md:3,29,31`).
- **Scope model**: `/me/*` is always derived from the principal; any write carrying a `patientId` must be self or a guarded dependant else 403 (message opaque "Not found"); appointment ownership is re-checked (`PORTAL/apps/api/README.md:52-53,57-59,80-81`). This closed an IDOR found in the security audit (`SNAP/duality-security-posture.md:14`).
- **Dependants** are portal-side (spouse can have own login; child cannot); RLS lets an account holder read dependants' rows via an `EXISTS` on `dependants` (`DOCS/glossary.md:20-26`, `DOCS/database.md:73-82`).
- **Documents**: `POST /v1/documents/:id/access {dob}` → `{url, expiresAt}`; DOB re-confirmation is a DPIA-documented control and the outcome is audited (`PORTAL/apps/api/README.md:37`, `DOCS/compliance.md:95-97`).

---

## 4. Design-system approach

### 4.1 Mechanism (reusable as-is)
- Two written files govern all UI work: `PRODUCT.md` (positioning, users, voice, anti-references, non-negotiables) and `DESIGN.md` (tokens, components, motion, a11y, detector allow-list). The repo `CLAUDE.md` makes every AI session read both, pick an Impeccable command, run `npx impeccable detect src/` (exit 0 required) before a PR, and tag the PR with the command used (`ROOT/CLAUDE.md:3-16`). Conflicts with `DESIGN.md` require a separate PR to `DESIGN.md` first (`ROOT/CLAUDE.md:29`).
- **Two registers**: `mode = brand` (unauthenticated marketing, signup, post-booking confirmation) vs `mode = product` (authenticated portal). Same palette and type stack; different density, motion, imagery and copy voice; the handoff between them is designed as deliberate, not a rupture (`ROOT/PRODUCT.md:17-24`, `ROOT/CLAUDE.md:20-25`).
- Tokens live as OKLCH CSS variables in `apps/web/src/index.css` (Tailwind 4 `@theme`); `DESIGN.md` is the human-readable spec of the same values (`ROOT/DESIGN.md:5,28`, `SNAP/duality-lovable-harvest.md:12`).
- Components = vendored shadcn/ui (45 components, MIT) generated by `/impeccable init` and hand-edited to brand; `components/ui` is excluded from eslint/prettier; "do not install component libraries that overlap the shadcn primitives" (`ROOT/DESIGN.md:127`, `ROOT/CLAUDE.md:32`, `SNAP/duality-lovable-harvest.md:16-18`).
- Lovable was used for scaffolding only: the UI kit, tokens, shell and 11 screens were harvested; the TanStack Start/Cloudflare server layer was **not** adopted (unapproved sub-processor) and no components call Supabase directly (`SNAP/duality-lovable-harvest.md:10-14`).

### 4.2 Brand-neutral rules worth lifting verbatim
- Spacing steps 4/8/12/16/24/32/48/64/96; product mode lives on 8/12/16/24, brand mode on 24-64; container 1200px (`ROOT/DESIGN.md:86-93`).
- Radii logic: one radius family per composition (pill buttons, card 12, input 10, modal 16) (`ROOT/DESIGN.md:95-109`).
- Surfaces: elevation by a single brand-tinted shadow, not tint; no glassmorphism; no blur overlays (`ROOT/DESIGN.md:111-123`).
- Motion: 150/200/300 ms, quiet ease-out, page transitions 100 ms opacity only, skeletons never spinners on fetches > 200 ms, spinners only on submits after 800 ms, no hover-lift/bounce, static accents (`ROOT/DESIGN.md:173-184`).
- Feedback: toasts bottom-right desktop / top mobile, 4 s auto-dismiss on success, persist on error; tables with no zebra, sticky header, row-hover (`ROOT/DESIGN.md:165-171`).
- Iconography: Lucide, 1.5 px stroke, 16/20/24, no emoji, no medical stock icons (`ROOT/DESIGN.md:186-199`).
- Accessibility non-negotiables: WCAG 2.1 AA (AAA body where possible), 44 pt touch targets, visible 2 px focus ring never removed, skip-link on nav-bearing pages, global `prefers-reduced-motion` guard, destructive colour darkened until axe passes, autoplay > 5 s needs a pause control, errors "quiet, specific, recoverable — never 'Something went wrong'" (`ROOT/DESIGN.md:286-314`, `ROOT/PRODUCT.md:80-88`).
- Anti-references list (AI-default gradients/glassmorphism, generic patient-portal blue, NHS/GOV.UK pastiche, Stripe-dashboard mimicry, marketing slop copy, product tours) — brand-agnostic and directly applicable (`ROOT/PRODUCT.md:58-70`).
- "Detector allow-list" — a named, tagged list of intentional exceptions to the lint-like design detector (`ROOT/DESIGN.md:317-328`).
- Shell pattern: fixed sidebar collapsing to a hamburger drawer at 768 px, ARIA-labelled, active item pill, 44 px targets, root error boundary with branded fallback (stack only in dev, no PII), reusable `<LoadingSkeleton>` and `<EmptyState>` (`DOCS/daily-sync.md:19,23`).

### 4.3 Brand-specific — do NOT reuse
- The six-colour palette (Deep Green `#1F524D`, Light Green `#A6CC8A`, Charcoal, Warm Grey, Warm Peach), the circles marque/motif, the comma-pause headline + sage underline, the NI-regional voice, the naturalistic photography rule and clinic film (`ROOT/DESIGN.md:9-57,201-247`). BBMI has its own tokens (`beyondbmi-wordpress/site/css/tokens.css`: navy `#053F5C`, blue `#65A1BC`, lime `#A5DB73` accent-only; per BBMI memory `project_bbmi_patient_portal_semble.md`). Coincidentally both brands use **Poppins**, so the type hierarchy pattern (700 display / 500 UI+eyebrow / 300-400 body / uppercase micro captions) ports with only colour swaps (`ROOT/DESIGN.md:61-84`).

---

## 5. Compliance and security patterns

### 5.1 Governance in code
- Eight hard rules (no real patient data in AI tools; no data outside the jurisdiction; no new sub-processor without written authorisation; permissive-licence-only deps; no prod creds on laptops; MFA; 24 h breach notification; encryption everywhere) (`DOCS/compliance.md:9-35`). Duality's jurisdiction is the UK; for BBMI the equivalent is EU/Ireland (eu-west-1 is BBMI's existing region).
- Licence allowlist enforced by `scripts/check-licenses.mjs` in CI (parses the lockfile, hard-blocks GPL/AGPL/LGPL, documented per-package dev-only exceptions) (`PORTAL/SECURITY.md:18-27`, `PORTAL/README.md:96`).
- Secret scanning: committed `.githooks/pre-commit` (gitleaks with built-in fallback), CI re-scan, `npm audit` scoped to prod deps, CycloneDX SBOM via syft (`PORTAL/SECURITY.md:28-34`, `PORTAL/README.md:89-90`, `DOCS/daily-sync.md:30`).
- Sub-processor gates are literal env flags: HubSpot writes only when `HUBSPOT_SUBPROCESSOR_AUTHORIZED=true`; staging keeps it unset (`PORTAL/docs/staging-environment.md:63-66`).

### 5.2 Database
- Every table `ENABLE` + `FORCE ROW LEVEL SECURITY`, default-deny, explicit owner-scoped policies on `auth.uid()`; mapping/sync tables have **no** policy so only the service role can touch them; admin bypass reviewed line-by-line (`DOCS/database.md:45-95`, `PORTAL/supabase/README.md:21-28`).
- `audit_log` DDL: `actor_id/actor_role/action/target_type/target_id/correlation_id/payload_summary jsonb (NO Personal Data)/ip/user_agent`; `UPDATE`/`DELETE` policies `USING (false)`; actor-or-admin select; 6-year retention; erasure deletes personal data but keeps audit rows (`DOCS/database.md:102-151,255-258`).
- One external system = one mapping table; forward-only, one-change-per-migration; generated types committed; no business logic in triggers; no soft deletes; no multi-tenant (`DOCS/database.md:176-203,206-226,296-301`).
- Every new policy ships with a test that the intended user can and others cannot (`DOCS/database.md:97-100`).

### 5.3 API hardening (findings from a 5-lens adversarial audit, all fixed)
Cancel-appointment IDOR → ownership check; stub auth on by default → fail-closed in production; idempotency key not namespaced → `${userId}:${key}`; redaction value-blind → key-name **and** value-level scrubbing (email/URL/NHS number/JWT) applied to error messages and the audit sink; rate limiter spoofable via XFF + unbounded map → trusted-proxy IP, bounded eviction, per-principal; no body limit → 64 KB; `onError` echoed domain messages → code-keyed static messages; no CSP/CSRF/cookie policy → `secureHeaders` + `hono/csrf`; unvalidated query + non-strict write schemas → Zod `.strict()`; branded ids without format → regex (`SNAP/duality-security-posture.md:14`, `PORTAL/apps/api/README.md:78-85`).

### 5.4 Logging and data minimisation
- `RedactingCallLogger` strips PII/clinical/auth fields — and `url/link/href/title` after it was found logging signed document URLs in cleartext (`PORTAL/SECURITY.md:11-16`, `SNAP/duality-team-coordination.md:16`).
- Structured JSON logs (Pino), opaque ids only, correlation id on every request and propagated through adapter calls; domain errors return an envelope with `correlationId` (`DOCS/conventions.md:165-171`, `PORTAL/apps/api/README.md:57-59`). Known gap: domain errors returned without logging made their correlation ids unfindable in CloudWatch (`SNAP/duality-next-session.md:14`).
- `Cache-Control: no-store` on all API responses; CDN caches static assets only (`PORTAL/SECURITY.md:40-41`, `DOCS/decisions/0006-host-on-aws.md:35`).

### 5.5 Deployment security
- Secrets exist only as empty Secrets Manager shells in IaC; values pasted by a human once; App Runner reads them at task start (a value change needs a redeploy); instance role can read exactly those ARNs (`PORTAL/infra/aws/README.md:119-148`).
- CI deploys via GitHub OIDC scoped to one repo + one ref, can only push to one ECR repo and start one deployment; ECR tags immutable; App Runner auto-deploy off (`PORTAL/infra/aws/README.md:103,215-222`).
- Staging runs with `API_ENV=production` so it exercises the same fail-closed posture (secure cookies, CORS fails closed, stub refused, `heroReady` boot check) while pointing at test backends — but this **defeats the code-side `sk_live` guard**, so the Stripe key must be manually verified as `sk_test_` (`PORTAL/infra/aws/README.md:192-201`, `SNAP/duality-next-session.md:64`).

### 5.6 Article 9 awareness
Marketing on health-journey data is special-category processing needing a DPIA + explicit-consent condition and a written sub-processor authorisation before any CRM sync is built (`ROOT/Information/Hero-API-Questions-for-Integration.md:56-66`). Directly relevant to BBMI's HubSpot/Klaviyo-style flows.

---

## 6. Copy vs avoid for the BBMI portal

### COPY (with reasons)
1. **Adapter seam + ESLint boundary + factory + branded ids + mapping table** — BBMI's Semble adapter must be swappable and the Semble id must never leak into domain entities; also lets a mock Semble adapter run the local prototype Art asked for (`DOCS/architecture.md:39-67`).
2. **Two data lanes / ports** (`IntegrationLayer` for clinical, `PersistencePort` for portal-owned) — BBMI keeps subscriptions, tier, community/ambassador state, 90-day programme state, which Semble cannot model (`PORTAL/apps/api/README.md:73-75`).
3. **Contract-first `packages/contracts` (Zod + inferred types + error envelope) + deterministic per-endpoint stubs** — enables parallel FE/BE and a runnable local demo (`DOCS/CLAUDE.md:86-99`).
4. **`/me/*` scoping from the principal; ownership re-checks; idempotency keys namespaced per user; error envelope with `correlationId`** (`PORTAL/apps/api/README.md:51-59`).
5. **Fail-closed production wiring** (stub auth refused, adapter readiness check at boot) (`PORTAL/infra/aws/README.md:192-201`).
6. **RLS default-deny + FORCE, append-only audit log with PII-free `payload_summary`, per-policy tests, one mapping table per external system** (`DOCS/database.md:41-151`).
7. **RedactingCallLogger with value-level scrubbing incl. URLs** — Semble prescription/document PDF URLs are exactly the kind of thing that would otherwise land in logs (`PORTAL/SECURITY.md:11-16`).
8. **DOB-gated, expiring document access endpoint returning `{url, expiresAt}`** — maps directly onto Semble's 15-minute PDF URLs (`PORTAL/apps/api/README.md:37`).
9. **Licence-allowlist CI gate, gitleaks pre-commit, SBOM, npm audit** — cheap and already scripted (`PORTAL/SECURITY.md:18-34`).
10. **Secrets-shell IaC + OIDC deploy + immutable tags + `no-store`** (`PORTAL/infra/aws/README.md:103-148`).
11. **Synthetic-only dataset with a fixed "today", stub-stack Playwright e2e, role-based selectors, UTC pin, axe in component tests** (`DOCS/testing.md:20-56,206-215`, `PORTAL/e2e/README.md`).
12. **`PRODUCT.md` + `DESIGN.md` + repo `CLAUDE.md` + Impeccable detect gate; brand/product registers; anti-reference list; detector allow-list; spacing/radii/motion/a11y rules; shell + skeleton/empty-state components** — swap only the tokens and voice (`ROOT/CLAUDE.md`, `ROOT/DESIGN.md:86-199,286-328`, `ROOT/PRODUCT.md:58-88`).
13. **Team rituals**: `docs/daily-sync.md` read on every AI-session start, numbered ADRs in the same PR as the change, ClickUp task ids in PRs, Conventional Commits + commitlint, squash merges (`DOCS/CLAUDE.md:15-22,121-135`, `DOCS/conventions.md:50-100`).
14. **Environment-gate anything that can create real records** (booking catalogue, CRM writes) and pin those flags in the deploy workflow, not just in env vars (`ROOT/Information/hero-staging-booking-setup.md:80-83`, `SNAP/duality-next-session.md:39`).
15. **Durable id-map and DB-backed idempotency from the first deploy** — the in-memory versions lost state on every roll (`SNAP/duality-next-session.md:29,31`).

### AVOID (with reasons)
1. **Duality's palette, marque, motif, headline treatment, voice, photography/film rules** — client brand; BBMI has its own tokens (`ROOT/DESIGN.md:9-57,201-247`).
2. **Designing the interface before enumerating the vendor API** — the first probe confirmed nothing and the vendor lacked patient-create, availability-create and link APIs; the ensure-patient subsystem was a late, expensive add (`ROOT/hero-staging-probe/output/hero-probe-summary.md:12-34`, `SNAP/duality-next-session.md:26,29`). For Semble we already have a verified gotcha list from other work; use it, and probe only with a BBMI-owned token.
3. **Cross-site FE/API hosting** (CDN domain vs API domain) — caused the "session expired" UAT round and a `SameSite=None` workaround that Safari/Incognito still block (`SNAP/duality-next-session.md:33`). Put `app.` and `api.` under one registrable domain from day one.
4. **1-hour non-refreshing session cookie** — unacceptable on mobile; go straight to the opaque server-side session with rotation + sliding expiry (`PORTAL/apps/web/CAPACITOR.md:167-172`, `SNAP/duality-next-session.md:16`).
5. **Letting ADRs and code diverge** (CDK vs Terraform; magic-link-only vs passwords) — re-verify ADRs at each milestone (`PORTAL/docs/adr/0001…:39-42` vs `PORTAL/infra/aws/README.md:40`).
6. **`API_ENV=production` on staging without a separate billing-env guard** — it silently disabled the `sk_live` check (`SNAP/duality-next-session.md:64`). Split "security posture" from "which Stripe mode" into two env vars.
7. **Guarding third-party error codes from memory** — capture the real error first (`PGRST205` lesson, `SNAP/duality-next-session.md:14`).
8. **Terraform** if a strict permissive-licence policy applies (BUSL-1.1) — BBMI has no such contractual gate today, so this is a decision, not a rule (`DOCS/decisions/0006-host-on-aws.md:36`).
9. **`NEXT_PUBLIC_*` env prefix in a Vite app** — kept "per request", flagged as cleanup; use `VITE_*` (`PORTAL/README.md:76-78`).
10. **Duplicating the Duality domain model wholesale** — dependants/loyalty/referrals/family plans are Duality product concepts; BBMI's are tiers, 90-day programme, ambassadors, community access. Copy the *shape* (domain package, statuses as small enums with a conform step), not the entities (`DOCS/glossary.md`, `DOCS/daily-sync.md:31,34`).

### ADAPT WITH CARE
- Stripe PaymentElement inline + Customer Portal redirect is a good split, but BBMI already has a live Stripe catalogue with tiered pricing and known catalogue-import hazards (see BBMI memory `reference_bbmi_support_case_patterns.md`); reuse the pattern, not the provisioning code (`DOCS/decisions/0002-stripe-paymentelement.md:15-29`).
- Webhook handler design (HMAC first, event-id dedup, cache invalidation) is sound but untested in Duality — Semble may not offer patient-facing webhooks at all (open question §9).

---

## 7. How far along is Duality? (finished product vs prototype)

Chronology reconstructed from the docs and the July memory log (client identifiers omitted):

| Date (2026) | State | Evidence |
|---|---|---|
| 09 Jun | ADRs 0001-0005 accepted; docs suite written | `DOCS/decisions/000[1-5]*.md:3-4` |
| 18 Jun | Monorepo skeleton; FE PRs #1-#3 (lint/hooks, app shell, dashboard on stub); 5 contracts merged (48 tests); ADR 0006/0007 | `DOCS/daily-sync.md:13-34` |
| 19 Jun | API README: appointments/documents/family/membership/persistence shipped on the in-memory stub; webhooks + Stripe catalogue blocked | `PORTAL/apps/api/README.md:99-112` |
| 28 Jun | Staging API probe run — all paths unconfirmed | `ROOT/hero-staging-probe/output/hero-probe-summary.md:3-34` |
| 03-04 Jul | Vendor staging populated by admin-UI automation (33 types, 5 locations, 33 links, rota → 47k slots); App Runner API live; FE live on CloudFront; CORS applied | `ROOT/Information/hero-staging-booking-setup.md:93-101`, `SNAP/duality-next-session.md:41-49` |
| 05 Jul | Billing summary shipped; Stripe webhook live with real secret; **paid signup funnel verified E2E by Art** (signup → test card → webhook → active membership); UAT rounds 1-2 fixed cookies, schema validation, unmapped-patient 500s; native member booking build merged | `SNAP/duality-next-session.md:3,29-37` |
| 06 Jul | Vendor platform bug root-caused (availability form ignores location) and a staging workaround shipped; slot-param fixes | `SNAP/duality-next-session.md:26-27` |
| 07 Jul | Custom domains for FE and API live (same-site cookies → `Lax`); corporate schema migration applied; login-502 saga resolved; mobile cross-site cookie mode verified; BE-SF-007 session rewrite designed, due 09 Jul; FE store-release build planned 10 Jul | `SNAP/duality-next-session.md:12-20` |
| 08 Jul | Last vault sync of the project folder on this PC | file mtimes |

**Verdict:** as of the last evidence (2026-07-07/08) Duality was a **working, staging-deployed product past two UAT rounds with the money path proven end-to-end** — well beyond a prototype — but **not a finished, production-live product**: session rotation, refresh for native, Hero webhooks, Resend/HubSpot sub-processor sign-offs, Stripe product catalogue/Customer Portal config, dependant native booking, and the production "member-before-any-clinical-record" story were all open (`PORTAL/apps/api/README.md:104-112`, `SNAP/duality-next-session.md:3,29`). The contractual go-live target was mid-July; whether it was met is **not knowable from this machine** (§9).

Test footprint at the last count: 617 tests in the API/integration packages, 19 in web, plus 6 Playwright journeys (`SNAP/duality-next-session.md:29`, `DOCS/daily-sync.md:19`, `PORTAL/e2e/README.md:8-15`).

---

## 8. Implications for the new BBMI portal

**Must-have (carry over):**
- Semble behind an `IntegrationLayer`-style interface with a mock adapter for the local demo and a real adapter selected by env; Semble ids only in a durable mapping table; branded ids; ESLint boundary (§2.1, §6-COPY-1/15).
- Portal-owned identity (Semble's token is practice-scoped with no patient auth — same situation as Duality's API-key model) with an explicit profile-bootstrap → match-or-create → 409-coded gate on first booking (§3.3).
- Single standalone versioned API used by web now and any mobile wrapper later; cookie + bearer; same registrable domain for FE and API (§3.2, §6-AVOID-3).
- RLS default-deny, append-only audit, PII-free logs with URL scrubbing, DOB-gated expiring document links (§5.2-5.4).
- Contract-first + stubs + synthetic dataset + stub-stack e2e (§1.3, §6-COPY-3/11).
- A `PRODUCT.md`/`DESIGN.md`/`CLAUDE.md` trio with BBMI tokens and voice; brand vs product registers; the a11y and motion rules unchanged (§4).

**Must-not:**
- No Duality brand assets, colours, motif or copy (§4.3).
- No Duality client data, hostnames, ids or synthetic-dataset names in BBMI artefacts (keep-separate rule in vault `CLAUDE.md:19`).
- No use of another client's Semble token for BBMI probing (BBMI memory `project_bbmi_patient_portal_semble.md`).
- No clinical content persisted in the portal DB or browser storage (§2.3).

**Decision needed (Art):**
1. Hosting/region: Duality's AWS-App-Runner + Supabase split vs BBMI's existing AWS estate (eu-west-1) — and whether Supabase (new sub-processor for BBMI) or Cognito/RDS already in the BBMI stack.
2. Auth mode: magic-link only vs email+password (Duality drifted to both). BBMI patients already have Cognito identities — migrate or re-enrol?
3. IaC tool (Terraform vs CDK) — Duality's ADR/reality split shows this must be decided once.
4. Whether Semble supports outbound webhooks at all; if not, TanStack Query polling/`staleTime` strategy replaces the invalidation design.
5. Which Duality *product* concepts have BBMI analogues (dependants → none?; loyalty → tiers; referral → ambassador comp) so the domain package is designed, not copied.

---

## 9. Open questions

1. Did Duality go live, and on what date? No evidence on this PC after 2026-07-08; the answer is in the GitHub repo / ClickUp, not the vault.
2. Was BE-SF-007 (server-side sessions with rotation) shipped as designed? If yes, its `sessions` table + rotation code is the single most reusable auth artefact and should be pulled from the repo, not re-derived.
3. Does `packages/integration/src/session` (dir modified 2026-07-08 22:18, empty on disk) contain that session implementation? Needs a repo checkout to confirm.
4. Does Semble expose any event/webhook mechanism usable for cache invalidation, or is the portal polling-only?
5. Can the Semble API create patients (Duality's vendor could not)? This decides whether BBMI needs the same ensure-patient/staff-handoff subsystem.
6. Does BBMI's compliance posture (Irish/EU, Medical Council rather than RQIA/NHS) impose a licence allowlist, sub-processor register, or audit-retention period comparable to Duality's 6 years? If not, which of §5 is policy vs. just good practice.
7. Is the Impeccable skill available on this Windows machine's Claude Code setup? The Duality design gate depends on it (`ROOT/CLAUDE.md:15`).
8. Which BBMI screens are brand-mode (public signup/qualify funnel, already live in the Angular app + WordPress) vs product-mode (new portal) — the register boundary decides how much of the current funnel is rebuilt.
