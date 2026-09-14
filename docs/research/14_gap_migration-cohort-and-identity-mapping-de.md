# 14 — Migration cohort and identity-mapping design (gap-fill #5)

*Research slice for the Semble-backed BBMI patient portal. Written 2026-09-11 from the KB (prod snapshot 2026-06-23), the back-end at `origin/master` (`d0666547`, 2026-09-08), the change log, memory, and research reports R02/R04/R05/R06/R09. No live API or DB call was made; no BBMI Semble token exists. Every count is a snapshot with its date. Inferences are marked [INFERRED].*

Paths used below: `BE` = `C:/Users/Admin/Desktop/Work/Projects/Clients/Beyond BMI/code/back-end` (read via `git show origin/master:`); `KB` = `Beyond BMI/BBMI_System_Knowledge_Base`; `CL` = `Beyond BMI/BBMI_Change_Log.md`; `MEM` = `~/.claude/projects/…/memory`; `R0x` = `docs/research/0x_*.md`.

---

## TL;DR

1. **Cohort: migrate "active + lapsed within 12 months" (working estimate 1,700–2,100 people [INFERRED]; measure with §3.4 SQL), not all 10,081 rows.** 10,081 patient rows exist (KB `06:932`) but only 4,177 ever had a Stripe customer (KB `06:1124`), 3,297 subscription rows exist (KB `06:1140`) and 970 patients had an active subscription on 19 Aug (CL:488). The other ~5,900 rows are leads/never-paid; loading them into a clinical EHR is data-minimisation risk with no product value. Anyone outside the cohort is migrated **lazily** at their next sign-in/purchase by the same match-or-create path new sign-ups use, so nothing is lost.
2. **Cost: do the demographic backfill ourselves through `createPatient` (contract: "Unlimited API calls (fair use)"), and do not buy Semble's €3,000/dataset migration for it.** Semble's fee is per *dataset*, not per patient (MEM `project_bbmi_semble_implementation.md:17`), migration is client-side responsibility anyway (`:26`), and `CreatePatientDataInput` has no required fields (R04 §1 Patient row). Reserve the paid service, if at all, for the one thing the API may not load — 29,080 historical clinical `notes` rows — and only if the clinic decides they must live in Semble (decision, §6).
3. **Identity: the portal gets its own immutable `portal_id`; Cognito `sub` becomes a *linked credential*, not the primary key.** Today `patients.id` **is** the sub (`BE src/entities/patients.entity.ts:26-28`), which is why re-registration is a 19-table PK migration (`patients.service.ts:388-425`) that leaves `patient_weights`, `prescriptions`, `tally_survey_*`, `patient_metrics`, `notes`, `daily_video_rooms` behind (none are in the list and none carry a FK — KB `06`), and why Martina Martin's €399 landed on a phantom sub (`QA_Test_Kit/PROD_repair-martina-martin-orphan.mjs:1-20`). The mapping table in §4 holds `cognito_sub`, `legacy_patient_id`, `semble_patient_id` (24-hex ObjectId), `semble_system_number` (what staff see), `stripe_customer_id`, `hubspot_id`, provenance and `verified_at`.
4. **Dedupe rule: exact normalised email AND DOB → link; exact email with DOB null on the Semble side (the HubSpot-import case) → link provisionally and verify DOB at first login; anything else (0 email matches with a DOB/name hit, >1 exact email, DOB conflict, archived record) → staff queue, never auto-link.** `patients(search:)` is fuzzy across name/email/dob ("Joseph" → 27 hits, MEM `reference_adhd_semble_backend.md:119`), so the search result is a candidate list, never an answer.
5. **Semble's own HubSpot importer is a second writer** (`New HubSpot Import` label, Semble id written back to a HubSpot property BBMI must create, MEM `…semble_implementation.md:21`). We close the loop by writing the Semble id into that same HubSpot property the moment *we* link or create, and by adopting importer-created records by exact email. Whether Semble's importer checks the property before creating is an open question to Semble (§10 Q1).
6. **Historical data stays portal-side**: weights (41,787 + 3,815 log), BP, height/BMI, prescription rows + 11,203 PDFs in S3 + 19,993 delivery logs + SRX tokens, 26,903 calendar events + 7,143 cancellation logs, Tally submissions (16,555 / 291,632 answers), EQ-5D/ESS/King's, Sumsub status, acknowledgements, subscriptions/Stripe links. Keyed by `legacy_patient_id`, read-only, no rewrite of 400k rows.
7. **Provisioning order for new sign-ups: identity row (email-unique anchor) → Cognito → Stripe customer + charge → Semble match-or-create → HubSpot upsert + Semble-id write-back**, each step idempotent on `portal_id`, with an outbox/reconciler that finishes stragglers. Semble creation is *after* payment: the clinical record must not fill with leads, and a Semble outage must never block sign-in (the PreSignUp lesson, KB `05c:§2.3`).

---

## 1. Population facts (what exists, with dates)

| Fact | Value | Evidence |
|---|---|---|
| `patients` rows | ~10,081 | KB `06_Database_Live.md:932` (2026-06-23) |
| Cognito users, prod patient pool `eu-west-1_IM5H7uuFL` | ~10,068 | KB `08_AWS_Infra.md:18` |
| Patients with a Stripe customer (`stripe_accounts.patient_id` UNIQUE) | ~4,177 | KB `06:1124-1139` |
| `subscriptions` rows | ~3,297 (3,303 with 991 `active`/`trialing` rows on 23 Jun) | KB `06:1140`, `06:14` |
| Duplicate `stripe_subscription_id` groups | 11 (max 7 rows for one id) | KB `06:10` |
| Patients with an **active** subscription | **970** (17-19 Aug 2026) | CL:488; `BE src/config/index.ts:186-188` |
| … of which no intake survey / members 90+ days | 175 / 151 | `config/index.ts:186-188` |
| Legacy €150 members (closed cohort) | ~150 | R07:12, R07:40 |
| `patient_settings` (one per patient who reached the app) | ~8,902 | KB `06:880` |
| `verify_identity` (Sumsub) | ~1,610 | KB `06:1255` |
| `general_practitioners` | ~2,837 | KB `06:504` |
| `calendar_events` / `event_cancelation_log` / `daily_video_rooms` | 26,903 / 7,143 / 24,383 | KB `06:270,472,320` |
| `prescriptions` / `medications` / `prescriptions_files` / `s3_file` / `prescriptions_email_logs` | 11,318 / 21,660 / 11,193 / 11,203 / 19,993 | KB `06:967,621,1006,1071,988` |
| `patient_weights` / `patient_weights_log` / `blood_pressure` / `patient_metrics` | 41,787 / 3,815 / 2,165 / 5,136 | KB `06:898,914,187,866` |
| `tally_survey_submit_info` / `tally_survey_answers` | 16,555 / 291,632 | KB `06:1200,1170` |
| `eq5d` / `epworth_sleepiness_scale` / `king_score` / `health_coaching_survey` | 8,130 / 8,130 / 1,271 / 638 | KB `06:451,427,580,550` |
| `notes` (staff clinical notes) / `ai_notes` | 29,080 / 0 | KB `06:641,127` |
| `notifications_timeline` | 25,634 | KB `06:705` |

Reading: ~59% of rows never reached Stripe; ~10% are active members today. The 10,081 vs 10,068 gap is small but non-zero — some rows have no login or vice-versa (Martina's Dec-2025 login had no row: `PROD_repair-martina-martin-orphan.mjs:4-6`).

---

## 2. Identity today — the keys and the failure modes the new design must retire

**2.1 The PK is the credential.** `patients.id` is `@PrimaryColumn uuid` and equals the Cognito sub (`BE src/entities/patients.entity.ts:26-28`; KB `00_INDEX.md` "Identity is the Cognito sub"). Both pools use email as username so `sub == username`, which is why `AdminGetUser(Username: sub)` is the existence check (`BE src/services/cognitoAdmin.service.ts:145-167`). A nullable `patients.cognito_sub` mirror exists on the entity (`patients.entity.ts:99-100`) and is written by the funnel saga (`registerWithPayment.service.ts:634-648`), with a partial unique index in the launch DDL (`BBMI_QA_Sync/QA_09_launch_DDL.sql:47,52-53`) — but nothing reads it as the key. Some subs are "v7-shaped" and fail strict UUID validators (`QA_Test_Kit/PROD_count-cognito-id-shape.mjs:1-4`); Postgres `uuid` accepts them, application validators must too.

**2.2 Re-registration = PK migration.** `createPatient` finds an existing row by `LOWER(email)` (`patients.service.ts:542-546`); if the Cognito user is gone and a cancelled subscription exists it calls `reactivatePatient` (`:568-573`), which renames the old email to `MIGRATING_<id>_<ts>@temp.internal` (`:357-360`), inserts a new row under the new sub (`:369-383`), repoints exactly 19 tables (`:388-408`), deletes the old row (`:431`), then best-effort repoints Stripe metadata (`:442`; `payment.service.ts:75-100`). **Not in the 19-table list and with no FK to `patients`** (KB `06`: `patient_weights`, `prescriptions`, `patient_metrics`, `notes`, `tally_survey_answers`, `daily_video_rooms` show no `FOREIGN KEY (patient_id)`): after every reactivation those rows keep a deleted id. This is an existing orphan population the dry-run must count (§8 item 4). "Orphan" rows (no subscription) are simply deleted (`:579-590`).

**2.3 Stripe self-heals by email.** A webhook whose customer is not in `stripe_accounts` is resolved by `lower(customer.email) = lower(patients.email)`; it repoints or links, refuses when the patient's existing customer has an active subscription, and refuses guest `gcus_` customers (`payment.service.ts:134-199`). Two metadata key conventions coexist: legacy `patientId` (`payment.service.ts:86-90`) and funnel `patient_id` (`registerWithPayment.service.ts:817,927`). Any backfill that reads Stripe must read both.

**2.4 HubSpot is keyed by email and we store no contact id.** Every write is `basicApi.update(email, …, 'email')` (`hubSpot.service.ts:56-63,140`); `createOrUpdateContact` does return `{id}` (`:263-274`) but nothing persists it (`git grep hubspotId|hubspot_id` on `origin/master src/` → no hits). The spec tells the CRM team "we upsert by email — avoid merges that change the primary email" (`Beyond BMI/BBMI_HubSpot_Integration_Spec.md:124-127`). The PreSignUp Lambda only PATCHes, never creates (KB `05c:§2.2 step 3`; MEM `reference_bbmi_support_case_patterns.md:68`).

**2.5 The phantom-sub bug is the shape of every identity failure.** A login with no row + a repeat sign-up → PreSignUp writes a row under the *new* sub, Cognito refuses the alias, the saga resolves the patient by email and charges under the phantom (`PROD_repair-martina-martin-orphan.mjs:4-13`; MEM `project_bbmi_duplicate_email_guard.md`). The qa fix refuses to charge unless `userExistsBySub(row.id)` proves the row is backed (`cognitoAdmin.service.ts:153-158`, deliberately fail-closed). The rejected alternative — silently attaching purchases to an unproven login — is the rule the new portal must keep (`duplicate_email_guard.md` "Deliberately REJECTED").

**2.6 Semble's identity surface.** A `Patient` has a 24-hex GraphQL id (`patient(id:)` throws `Cast to ObjectId failed` for anything else) **and** a staff-facing `numbers[]{name:"System", value}`; `patients(search:)` is fuzzy over first/last/email/dob; `createPatient` has no required fields; `customAttributes`, `labels`, `numbers` are writable via `addPatientAttribute`, `addPatientLabel`, `createPatientNumber`; `patient.created/updated/merged/archived` and `patient.customAttribute.*` webhooks exist (R04 §1 Patient row; R05:213-214; MEM `reference_adhd_semble_backend.md:92,117-119`). Semble has no patient login; the practice token sees the whole practice, so every read is scoped by the backend to the caller's `semble_patient_id` (R04 §3). Semble will create patients itself from HubSpot deal stages, label `New HubSpot Import`, and write the Semble id back to a HubSpot property (MEM `…semble_implementation.md:21`). Semble supports merging patients (webhook `patient.merged`) — so duplicate Semble records are a normal condition, not an error [INFERRED from the existence of the merge event].

---

## 3. Cohort recommendation

### 3.1 Options and counts

| Cohort | Definition (data) | Count | Why / why not |
|---|---|---|---|
| **A. All rows** | every `patients` row | 10,081 | ~5,900 never had a Stripe customer (10,081 − 4,177). They are leads (qualify/intake Tally submissions), not patients of record. Copying their Article-9 intake answers into an EHR they have no clinical relationship with is contrary to data minimisation and adds 10k records to a tenant the clinic must search by name every day. **No.** |
| **B. Active** | ≥1 `subscriptions` row `status='active'` (or `trialing`) with `current_period_end > now()` (+72 h grace for `sub_` rows, `tierJourney.service.ts:174-180`) | **970** (19 Aug; re-measure) | Minimum viable. Leaves the lapsed/winback population unlinked until they return. |
| **C. Active + lapsed ≤ 12 months (recommended)** | B ∪ patients whose newest subscription `current_period_end` is within the last 12 months (any status), plus €89 purchasers with a `pi_` entitlement row created in the last 12 months | **unmeasured; > 970 and ≤ ~3,300** (bounded by distinct subscribers); working estimate **1,700–2,100** [INFERRED: 3,297 rows over ~3 years of trading, churn spread evenly] | Covers `legacy_lapsed` (re-offer their old plan, never €89 — `tierJourney.service.ts:44,300-323`), the live €75 winback flow (MEM `support_case_patterns.md:53`), `ninety_day_completed` finishers choosing Ongoing Care, and the 30-day €89 prescription window. Everyone the clinic might phone this year has a Semble record on day one. |
| **D. Lazy for everyone else** | on next sign-in or purchase → §7 match-or-create | n/a | Zero pre-load cost; the same code path as new sign-ups, so it is tested by every new customer. |

**Recommendation: C + D.** Pre-create Semble patients for C; let D happen organically. Keep A entirely in the portal DB under a retention policy (a separate decision — KB `09` has no retention rule today).

### 3.2 Cost implication

- Semble's price is **per dataset**: "€3,000/dataset incl. 1 trial; €1,700+VAT per additional dataset"; migration is *excluded* from implementation and is "client-side responsibility (Semble will NOT extract from our system)"; "dataset" is undefined and "€3k vs €15k hinges on it" (MEM `project_bbmi_semble_implementation.md:17,26`). The cohort size therefore does not move Semble's invoice; the number of *kinds* of data does.
- **Demographics via API = €0 to Semble.** `createPatient(patientData:{first last email dob gender sex address city postcode country phoneType phoneNumber paymentReference communicationPreferences labels customAttributes comments})` has no required fields (R04 §1). 2,000 creates at a conservative 60/min (R04 §5 budget: 240 rpm shared; "too often" errors at HTTP 200, MEM `adhd_semble_backend.md:30`) is ~35 minutes. `createPatient` has no `sendPatientMessages` argument [INFERRED from the input type], so backfill does not email anyone — confirm on sandbox before the real run (§8 item 9).
- **The only candidate for Semble's paid service is `notes` (29,080 rows of staff clinical notes).** R04 lists `createPatientDocument`/`createLetter` and `records` as writable, but loading free-text historical notes as consultation records is unverified. If the clinic wants doctors to see pre-Semble notes inside Semble, that is one dataset (€3,000) or a PDF-per-patient upload through `createPatientDocument` for the cohort only. If not, notes stay read-only in the portal's staff view. **Decision for Art/clinic (§10 Q6).**
- Our cost is engineering time: the match-or-create path is needed for new sign-ups regardless, so the backfill is that path run in a loop plus the dry-run tooling in §8.

### 3.3 What "lapsed ≤ 12 months" means in data (so the number is reproducible)

Plan families, from `BE src/config/index.ts`: `E89_PRICE_ID` (`:124`), `NINETY_DAY_PRICE_IDS` incl. `NINETY_399_PRICE_ID`/`NINETY_450_PRICE_ID` (`:119,128-129`), `ONGOING_150/75_PRICE_ID` (`:210-211`, empty on prod), `MEMBERSHIP_PLAN_PRICE_IDS` (`:267`); legacy €150 = `price_1LVzFgBeNn0x9hADr8olz7VQ`, €75 winback = `price_1QwhloBeNn0x9hADJarF6Yn0` (MEM `reference_bbmi_cognito_provisioning.md:24`, `support_case_patterns.md:53`). Synthetic one-time rows carry a `pi_` id in `stripe_subscription_id` with an explicit `current_period_end` (€89: +1 year; €399: +90 days — `tierJourney.service.ts:110`).

### 3.4 Cohort SQL (read-only; run on a replica or through the tunnel as a read-only user)

```sql
WITH latest AS (
  SELECT s.patient_id,
         max(s.current_period_end)                                            AS last_period_end,
         bool_or(s.status IN ('active','trialing') AND s.current_period_end > now() - interval '72 hours') AS is_active,
         max(s.created)                                                       AS last_sub_created
  FROM subscriptions s GROUP BY s.patient_id)
SELECT
  count(*)                                                                    AS all_rows,
  count(*) FILTER (WHERE l.patient_id IS NOT NULL)                            AS ever_subscribed,
  count(*) FILTER (WHERE l.is_active)                                         AS cohort_b_active,
  count(*) FILTER (WHERE l.is_active OR l.last_period_end >= now() - interval '12 months'
                         OR l.last_sub_created >= now() - interval '12 months') AS cohort_c_active_or_lapsed_12m,
  count(*) FILTER (WHERE sa.patient_id IS NOT NULL)                           AS has_stripe_customer
FROM patients p
LEFT JOIN latest l ON l.patient_id = p.id
LEFT JOIN stripe_accounts sa ON sa.patient_id = p.id;
```
Also break `cohort_c` down by plan family (`stripe_plan_id`) and by `status`, and list the 11 duplicate-`stripe_subscription_id` groups so they are collapsed before counting (KB `06:10`).

---

## 4. Mapping-table DDL (portal database, Postgres)

Design rules: one row per human; `portal_id` is the only key other portal tables reference; every external id is nullable and unique; provenance and verification are first-class; Semble merges are recorded, not overwritten.

```sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE portal_patient_identity (
  portal_id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalised      citext      NOT NULL UNIQUE,          -- lower(trim(email)); the match key across all five systems
  dob                   date,                                  -- typed; patients.dob is varchar today (KB 06:942)
  cognito_sub           uuid        UNIQUE,                    -- login credential; NULL for cohort rows whose owner has not logged in to the new portal yet
  legacy_patient_id     uuid        UNIQUE,                    -- old patients.id (= sub at the time); joins all history tables (§6)
  semble_patient_id     char(24)    UNIQUE,                    -- GraphQL ObjectId; NULL until linked
  semble_system_number  varchar(32),                           -- Patient.numbers[name='System'].value — what reception sees
  stripe_customer_id    varchar(64) UNIQUE,                    -- cus_…; never gcus_ (guest) ids
  hubspot_id            varchar(32) UNIQUE,                    -- hs_object_id captured from create/search; HubSpot's key stays email
  provenance            text        NOT NULL
                        CHECK (provenance IN ('portal_signup','backfill_created','backfill_matched',
                                              'hubspot_import_adopted','semble_manual_adopted','staff_manual')),
  match_evidence        jsonb       NOT NULL DEFAULT '{}',     -- {"email":true,"dob":true|false|null,"hubspot_semble_field":true,...}
  verified_at           timestamptz,                           -- when the link was confirmed by the patient (DOB at first login) or staff
  verified_by           text,                                  -- 'patient:dob' | 'staff:<doctor_id>' | 'system:hubspot_field'
  semble_archived       boolean     NOT NULL DEFAULT false,
  review_required       boolean     NOT NULL DEFAULT false,    -- true while a queue item is open; reads still work, writes to Semble are blocked
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON portal_patient_identity (semble_system_number);
CREATE INDEX ON portal_patient_identity (review_required) WHERE review_required;

-- Semble-side merges/archives arrive as patient.merged / patient.archived webhooks (R05:213). Keep the trail.
CREATE TABLE portal_patient_identity_semble_history (
  id                    bigserial   PRIMARY KEY,
  portal_id             uuid        NOT NULL REFERENCES portal_patient_identity(portal_id),
  old_semble_patient_id char(24)    NOT NULL,
  new_semble_patient_id char(24),                              -- NULL = archived
  semble_event_id       text        UNIQUE,                    -- webhook eventId; idempotency
  occurred_at           timestamptz NOT NULL DEFAULT now()
);

-- Ambiguity never auto-resolves. One row per unresolved question, with the candidates frozen at detection time.
CREATE TABLE portal_identity_review_queue (
  id                    bigserial   PRIMARY KEY,
  portal_id             uuid        REFERENCES portal_patient_identity(portal_id),
  reason                text        NOT NULL
                        CHECK (reason IN ('multiple_exact_email','dob_conflict','email_none_dob_name_hit',
                                          'semble_archived','semble_duplicate_created','stripe_email_mismatch',
                                          'cognito_row_less_login','hubspot_field_conflict')),
  candidates            jsonb       NOT NULL,                  -- [{sembleId, systemNumber, email, dob, labels, createdAt}], never PHI beyond these
  created_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  resolved_by           text,                                  -- staff identity (doctors.id / admin group member)
  resolution            text                                   -- 'linked:<sembleId>' | 'created' | 'merged_in_semble' | 'dismissed'
);
CREATE INDEX ON portal_identity_review_queue (resolved_at) WHERE resolved_at IS NULL;
```

Notes on the columns:
- `cognito_sub uuid UNIQUE` allows many NULLs (Postgres semantics), which is exactly the cohort-before-first-login state. Re-registration becomes `UPDATE … SET cognito_sub = <new sub> WHERE portal_id = …` after proof (§7.3) — no PK migration, no 19-table loop.
- `legacy_patient_id` is how the 400k+ history rows stay readable without rewriting them: `patient_weights.patient_id = identity.legacy_patient_id`.
- `semble_system_number` is stored because support conversations happen in it (MEM `adhd_semble_backend.md:92`); it is *not* a lookup key for the API (`patient(id:)` rejects it).
- `hubspot_id` is new. Populate it from `createOrUpdateContact`'s return (`hubSpot.service.ts:267,274`) going forward and from a search-by-email during backfill; keep writing to HubSpot by email (their contract with the CRM team, spec:124-127) but detect a moved primary email by id.
- If Semble accepts a custom attribute, also write `portal_id` to the Semble patient (`addPatientAttribute`, R05:214) and put the portal id in `numbers[]` via `createPatientNumber` (R04 §8 Q12) so a Semble-side merge or staff edit can still be traced back. Treat this as belt-and-braces; the portal table is the truth (R02 §8 "mapping is portal-side only" if unwritable).

---

## 5. Dedupe rule

### 5.1 Against Semble's HubSpot import (the second writer)

Facts: Semble's committed integration creates a Semble patient when a HubSpot deal reaches a stage, labels it `New HubSpot Import`, and writes the Semble patient id to a HubSpot contact property BBMI must create before go-live (MEM `…semble_implementation.md:21`). Our HubSpot contact is created at funnel step 1 *before payment* with `lifecyclestage=lead`, keyed by email, never with health data (spec:124-130); the PreSignUp Lambda pushes only name/phone/`registered_status` (KB `05c:§2.2`), so an importer-created Semble record will most likely have **no DOB** [INFERRED — depends on which HubSpot properties Semble maps; ask, §10 Q1].

Rule, evaluated in this order before any `createPatient`:
1. **HubSpot field first.** Read our contact by email; if the Semble-id property is populated, `patient(id:)` it, assert `lower(email) == email_normalised`, and link with `provenance='hubspot_import_adopted'`, `match_evidence.hubspot_semble_field=true`, `verified_at` NULL until DOB is confirmed at first login. Email mismatch → queue `hubspot_field_conflict`.
2. **Then exact email in Semble.** `patients(search: email_normalised)` with `cursorPagination`, filter client-side to `lower(patient.email) == email_normalised` (search is fuzzy: R04 Patient row; MEM `:119`). Exactly one → apply §5.2 DOB logic. More than one → queue `multiple_exact_email` (Semble does not enforce unique email [INFERRED]; it has a merge feature).
3. **Only then create**, with `labels:[{text:"Portal backfill <yyyy-mm>"}]` (backfill) or `[{text:"Portal sign-up"}]` (live) so bulk archive/rollback is one filter, `customAttributes`/`numbers` carrying `portal_id` if writable, `communicationPreferences` copied from `patient_settings.marketing_notifications` (KB `06:880-897`).
4. **Immediately write our Semble id into the HubSpot write-back property** (the same one Semble's importer writes). This is the only lever we control against a later importer-created duplicate. Ask Semble to confirm the importer skips contacts whose property is already set (§10 Q1); if it does not, ask for the importer to be restricted to a deal stage the portal never sets, or switched off once the portal is the creator.
5. **Reconciliation catches what slips through**: any `patient.created` webhook or `patients(options:{updatedAt})` sweep row labelled `New HubSpot Import` (or with no portal label) is run through steps 1-2; an exact-email hit on an *already linked* portal row means Semble now holds two records → queue `semble_duplicate_created`, resolve by merging in Semble (which emits `patient.merged`, handled by the history table).

### 5.2 Against fuzzy `patients(search)` — the link decision table

| Exact email matches | DOB comparison | Action |
|---|---|---|
| 1 | equal | link, `provenance='backfill_matched'`, `verified_at=now()`, `verified_by='system:email+dob'` |
| 1 | Semble DOB null | link provisionally (`verified_at` NULL, `match_evidence.dob=null`); portal asks the patient to confirm DOB at first sign-in (Duality's DOB re-confirmation control, R06 §3.3) and then `updatePatient(dob)`; clinical writes (booking) blocked until verified |
| 1 | different | queue `dob_conflict` (typo in either system, or a relative sharing an inbox) — never link |
| >1 | any | queue `multiple_exact_email` |
| 0 | name+DOB fuzzy hit exists | queue `email_none_dob_name_hit` (email changed on one side) — never link, never create until resolved |
| 0 | no plausible hit | create (§5.1 step 3) |
| any | matched record `archived:true` | queue `semble_archived` (staff decides restore vs create) |

Never match on name alone, never on phone alone, never on the first search result. Portal-side `patients.dob` is a varchar (KB `06:942`); parse strictly, and treat unparsable DOB as null for matching and as a data-quality item (§8 item 2).

### 5.3 Portal-side dedupe before we even talk to Semble

Duplicate rows within our own DB are already possible (case-variant emails before BBMI-165 normalisation: `patients.service.ts:538-546`; renamed `MIGRATING_*@temp.internal` leftovers if a reactivation ever failed after step 2 but before rollback). The backfill's first pass groups `lower(trim(email))` and refuses to proceed while any group has >1 row or any email is `%@temp.internal` (§8 item 2).

---

## 6. What stays portal-side (and how it is keyed)

| Data | Rows | Stays in portal because | Key |
|---|---|---|---|
| Weights, weight log, BP, height/BMI (`patient_metrics`) | 41,787 / 3,815 / 2,165 / 5,136 | patient-entered, high-frequency, gates booking (45-day rule) — R02 §7.7; Semble observations API unverified | `legacy_patient_id` (history), `portal_id` (new) |
| Prescription rows + medications + PDFs in S3 (`s3_file`, `prescriptions_files`) + delivery logs + SRX tokens | 11,318 / 21,660 / 11,203 / 11,193 / 19,993 | Semble cannot import or send prescriptions (MEM `adhd_semble_backend.md:130-138`, R02 §7.6); historical PDFs are legal records of what was dispensed; keep the S3 objects and serve them under the same authz as Semble PDFs | `legacy_patient_id` |
| Calendar events, cancellation log, Daily rooms, reminder logs | 26,903 / 7,143 / 24,383 / 5,541 | cooldown/no-show/sequence rules need history; Semble deletes cancelled bookings and has no `createdBy` (R02 §7.3) | `legacy_patient_id`; new bookings index keyed by Semble booking id + `portal_id` |
| Tally submissions/answers, EQ-5D, ESS, King's, HC survey | 16,555 / 291,632 / 8,130 / 8,130 / 1,271 / 638 | Article-9 data with no verified Semble write path for historical answers (R02 §10 Q1); doctors' survey view needs them (MEM `reference_bbmi_doctor_survey_view.md`) | `patient_id` varchar on Tally tables — cast on join |
| Sumsub `verify_identity` | 1,610 | KYC status is a portal gate, outside Semble (R01:163) | `legacy_patient_id` |
| `patient_acknowledgements` | new (DDL `QA_13`) | point-of-sale evidence; `patient_id` is varchar (CL:137) | cast on join |
| Subscriptions, `stripe_accounts`, access codes, buddy tables | 3,297 / 4,177 | Stripe stays the biller; entitlement is portal logic (R02 §7.1) | `portal_id` going forward; `legacy_patient_id` for history |
| Notifications timeline, settings, addresses, GP | 25,634 / 8,902 / 2,975 / 2,837 | portal UX state; GP and address are also Semble fields — copy GP/address *into* Semble at create time, keep ours as the pre-Semble snapshot | `legacy_patient_id` |
| Clinical `notes` | 29,080 | **decision** (§3.2): read-only staff view in portal, or paid dataset / per-patient PDF into Semble | `legacy_patient_id` |
| `patient_activities` ledger + events + backups | 57,856 / 26,543 / ~3,900 | **retire** — derive stage from subscriptions + Semble bookings (R02 §6); keep the table frozen for audit, never read live | frozen |

Practical consequence: the portal's read model has two lanes per patient — `history` (read-only, `legacy_patient_id`) and `live` (`portal_id` + Semble ids). The UI merges them by date; nothing is rewritten.

---

## 7. Provisioning order and reconciliation

### 7.1 New sign-up (public funnel and sales-assisted)

Each step is idempotent on `portal_id`; a failure after step 3 never blocks sign-in; steps 4-5 are retried by the reconciler.

1. **Identity anchor.** `INSERT portal_patient_identity (email_normalised, dob, provenance='portal_signup')`. UNIQUE on email is the duplicate guard: on conflict, the row may be *resumed* only if `cognito_sub` is NULL **and** no Cognito user holds that email (`listUsersByEmail`, `cognitoAdmin.service.ts:170-180`); if a Cognito user exists → 409 "sign in or reset your password" (the qa rule, MEM `duplicate_email_guard.md`). Never self-heal an unproven login.
2. **Cognito user** (or the chosen IdP) → store `cognito_sub`. No PreSignUp provisioning trigger: the portal owns the row, so a downstream outage cannot block account creation (KB `05c:§2.3` risk).
3. **Stripe customer + charge.** `customers.create({email, metadata:{portal_id, patient_id: portal_id, source}})` — keep the `patient_id` key so the by-email self-heal (`payment.service.ts:134-199`) and any legacy tooling still resolve; PaymentIntent/subscription with `idempotencyKey` = `portal_id:price:paymentMethod` (pattern already in `registerWithPayment.service.ts:819,934`). Store `stripe_customer_id`.
4. **Semble match-or-create (§5)** — only after payment succeeds (leads stay in HubSpot; the clinical record holds paying/clinical patients). Store `semble_patient_id`, `semble_system_number` from `numbers[]`, labels. Write-back `portal_id` to Semble if writable.
5. **HubSpot** upsert by email (existing writers unchanged) → capture `hubspot_id`; set the Semble-id write-back property; `lifecyclestage=customer` as today (spec:98-105).
6. **Outbox row** per step 3-5 with attempt count; the reconciler (§7.2) drains it.

Sales-assisted sales (`registerWithPayment.service.ts:489-572` path today; `/sales/<key>` acknowledgements) follow the same order with `provenance='staff_manual'` and the rep recorded in `verified_by`.

### 7.2 Reconciliation job (portal backend, scheduled; the "safety net as a property of the system", KB `00_INDEX`)

Every 10 minutes:
- Drain the outbox: retry Semble create/link, HubSpot upsert, Stripe metadata for rows with any NULL external id older than 2 minutes; exponential backoff; page a human after 24 h.
- Consume `patient.created/updated/merged/archived` webhooks (ids only; refetch; dedupe on `eventId` — R04 §4): `merged` → move `semble_patient_id`, append history; `archived` → set `semble_archived`, queue if the patient is active; `updated` → if email changed on the Semble side, compare with ours → queue `stripe_email_mismatch`-style drift item rather than overwrite.
- Sweep `patients(options:{updatedAt:{start: lastRun−15min}}, cursorPagination)` (works on `patients`, R04 §4) for records without a portal label → §5.1 step 5 adoption or queue.

Nightly:
- Invariants report: every patient with an active subscription has `semble_patient_id` and `cognito_sub`; no two identity rows share a Semble id/Stripe id/HubSpot id (the unique indexes make this structural, but count violations of the *soft* ones: Stripe customer email ≠ `email_normalised`, HubSpot contact email ≠ ours, Semble email ≠ ours); rows `review_required` older than 3 business days; `patient.merged` events unapplied.
- Cohort drift: patients who *entered* cohort C since the backfill (new payers) but were not provisioned → run §5; patients who left it need nothing.
- Output mirrors `QA_Test_Kit/PROD_account_health_check.mjs` ("names the repair but never performs it", `:8-22`) — read-only report plus explicit `--apply` runbooks.

### 7.3 Re-registration and email change in the new model

- **Returning patient, new Cognito user** (forgot they had one, or the pool changed): after they prove the email (Cognito verified) *and* the DOB on file, `cognito_sub` is updated on the existing row; Semble, Stripe and HubSpot links are untouched. This replaces `reactivatePatient` entirely; the old `getPatientReregistrationStatus` classes (`patients.service.ts:295-318`) collapse into "row backed by a live Cognito user? → 409; else attach after proof".
- **Email change**: update `email_normalised` last, after Cognito (credential), Stripe (`customers.update`), Semble (`updatePatient(email)`), HubSpot (id-based update via `hubspot_id`, because email is HubSpot's key — the reason `hubspot_id` exists); one-deep rollback as today (KB `03:§7`) becomes a saga with the outbox, so a step-4 failure is retried, not orphaned.

---

## 8. Dry-run checklist (before any write to Semble prod)

Tooling pattern: read-only Node scripts against `.env.prod.local` with the prod-host guard, `--apply` for writes, as in `QA_Test_Kit/PROD_count-cognito-id-shape.mjs:10-15` and `PROD_repair-martina-martin-orphan.mjs:21-23`; identities used in Semble sandbox tests must be `qa-test@` / ZZTest-style, never AI-named (MEM `feedback_no_claude_in_test_data.md`).

1. **Cohort counts** — run §3.4; publish all / B / C with the plan-family split and the 11 duplicate-subscription groups collapsed. Sign-off number = C.
2. **Portal data quality on C** — `lower(trim(email))` groups with >1 row; emails matching `%@temp.internal` (failed reactivations); `dob` NULL or not parseable as a date; `gender` NULL (Semble `gender/sex` optional, but the €89 trigger silently skipped rows without gender before — MEM `project_bbmi_ambassador_provisioning.md`); `mobile` not E.164 (`PROD_repair-signup-phones-names.mjs` exists for exactly this class); first/last name blank or containing the email.
3. **Cognito cross-check** (`--with-cognito`): for every C row `AdminGetUser(sub)` → count row-with-no-user; `ListUsers` by email for users with no row (Martina class); `UserStatus=UNCONFIRMED` counts (MEM `support_case_patterns.md:25`). Decide: unconfirmed-but-paid rows are migrated; row-less logins are queued `cognito_row_less_login`.
4. **Orphaned history** — for each of `patient_weights`, `patient_weights_log`, `prescriptions`, `prescriptions_email_logs`, `patient_metrics`, `tally_survey_submit_info`, `tally_survey_answers`, `notes`, `daily_video_rooms`, `patient_activities_events`: `count(*) WHERE patient_id NOT IN (SELECT id FROM patients)` (no FK, excluded from the 19-table list — §2.2). These rows are unrecoverable by key (the old row's email was renamed then deleted); record the count, exclude them, keep them.
5. **Stripe** — `stripe_accounts.email` ≠ `patients.email` (lower); customers whose metadata `patientId`/`patient_id` ≠ `stripe_accounts.patient_id` (both key spellings, §2.3); `gcus_` guest payments with no customer (Art's manual €399/€89 enrolments, MEM `support_case_patterns.md:72`) — these patients have entitlement rows but no `stripe_customer_id`; that is allowed, not an error.
6. **HubSpot** — for C, search contact by email (`crm.objects.contacts.read` only, spec:91-95): capture `hs_object_id` into a staging table; report contacts missing (admin-created patients never got one — `:68`); report contacts whose Semble write-back property is already populated (Semble's importer got there first → §5.1 step 1).
7. **Semble pre-scan (needs the BBMI practice token — not yet issued, MEM `project_bbmi_patient_portal_semble.md:19`; run on `open.sandbox.semble.io` first)**: total patients; count labelled `New HubSpot Import`; exact-email collisions against C; DOB-null rate; whether `addPatientAttribute` / `createPatientNumber` accept a `portal_id`; whether `createPatient` sends any patient message; whether `patients(search:)` on an email returns non-email hits (expected yes).
8. **Simulated match run (no writes)** — classify every C row per §5.2 and print the histogram: `link_verified`, `link_provisional_dob_null`, `create`, and each queue reason. Expected queue size drives the staffing ask; if `multiple_exact_email` or `dob_conflict` exceeds ~2% investigate before proceeding.
9. **Sandbox rehearsal** — 20 synthetic patients through create / match / merge / archive / webhook consumption; then a 50-patient canary on prod from C ordered by *least* activity (lapsed first), labelled `Portal backfill <date>`; verify in the Semble UI that names, DOB, email, phone, address, GP and the label render, and that no patient received an email.
10. **Rollback** — every backfill-created Semble patient carries the label; rollback = archive by label (or Semble's bulk delete if offered) + `UPDATE portal_patient_identity SET semble_patient_id=NULL WHERE provenance='backfill_created'`. Matched rows need no rollback (we changed nothing in Semble).
11. **Reconciliation sign-off** — after the full run: C = linked + queued + skipped exactly; zero active-subscription rows unlinked; §7.2 nightly report green two nights running; the HubSpot write-back property populated for every linked row.
12. **Change log** — record What/Where/Refs/Verify/Rollback in `BBMI_Change_Log.md` as part of the run (MEM `feedback_bbmi_change_log.md`).

---

## 9. Implications for the new portal

**Must-have**
- `portal_patient_identity` (§4) as the only patient key; auth middleware resolves `token.sub → identity row → portal_id`; every Semble query scoped by `semble_patient_id` server-side (R04 §3).
- Match-or-create as one library used by sign-up, backfill, lazy migration and the reconciler; the §5.2 decision table encoded as data, with unit tests for each row.
- Provisional links (`verified_at` NULL) are readable but cannot book/send until DOB is confirmed at first sign-in; the 409 vocabulary from Duality (`PROFILE_INCOMPLETE` / `NO_CLINICAL_RECORD` / `RECORD_AMBIGUOUS`, R06 §3.3) mapped to `IDENTITY_UNLINKED` / `IDENTITY_AMBIGUOUS` / `IDENTITY_PENDING_REVIEW`.
- Staff review queue UI (or at minimum a table + runbook) for the eight queue reasons; nothing in the queue auto-resolves.
- Outbox + reconciler + nightly invariants (§7.2); webhook `eventId` idempotency; `patient.merged` handling.
- `hubspot_id` captured; Semble id written to the HubSpot property BBMI creates pre-go-live; both Stripe metadata key spellings read.
- History lane keyed by `legacy_patient_id`; no rewrite of history tables; orphan counts recorded.
- Backfill labels on Semble patients for rollback; canary before full run; read-only dry-run tooling with the prod-host guard.

**Must-not**
- Do not make `cognito_sub` or `semble_patient_id` the primary key; do not migrate PKs across tables ever again.
- Do not link on fuzzy search, name, phone, or first result; do not auto-resolve DOB conflicts or multi-matches.
- Do not create Semble patients for leads (pre-payment) or for the ~5,900 never-paid rows; do not copy Tally/intake answers into Semble for them.
- Do not attach purchases or Semble records to a login that has not proven the email (the rejected self-heal).
- Do not let a Semble/HubSpot/Stripe outage block sign-in or sign-up (no provisioning triggers in the auth path).
- Do not store `pdfDownloadUrl`; do not expose the practice token; do not run backfill without the sandbox rehearsal.

**Decisions needed**
- D-a: confirm cohort C (active + lapsed ≤12 months) and the retention rule for the ~5,900 never-paid rows.
- D-b: clinical `notes` — stay portal-side (read-only staff view) vs paid Semble dataset vs per-patient PDF upload for cohort C.
- D-c: who staffs the identity review queue (care coordinators vs engineering) and the SLA (proposed 3 business days).
- D-d: whether to ask Semble to restrict/disable their HubSpot importer once the portal is the creator of record.
- D-e: DOB confirmation at first sign-in for every migrated patient (recommended — it also verifies the link), vs only for provisional links.

---

## 10. Open questions

1. **Semble importer behaviour**: does the HubSpot→Semble import skip contacts whose Semble-id property is already populated? Which HubSpot properties does it map (DOB? phone? address?) and at which deal stage does it fire? (Ask Semble; the contract only names the label and the write-back field — MEM `…semble_implementation.md:21`.)
2. **Writable external id on `Patient`**: exact argument shapes for `addPatientAttribute` and `createPatientNumber`, and whether `numbers[]` entries other than `System` are searchable (R04 §8 Q12; R05:214). Introspect on the sandbox once a BBMI token exists.
3. **Email uniqueness in Semble**: is it enforced on `createPatient`, or does the API happily create a second record with the same email? Determines how often §5.1 step 5 fires.
4. **Does `createPatient` (or `updatePatient`) send any patient-facing message** (welcome / share-portal email)? Must be no for a 2,000-row backfill.
5. **Semble merge semantics**: after `patient.merged`, which id survives, are bookings/prescriptions re-parented, and does the `sharingToken` change?
6. **Clinical `notes` (29,080 rows)**: does the clinic want them in Semble? If yes, which API object (`records` via consultation vs `createPatientDocument`) and is that the "dataset" Semble would charge for?
7. **HubSpot contact coverage**: how many cohort-C patients have no HubSpot contact at all (admin-created class, MEM `support_case_patterns.md:68`)? The backfill can create them, but only with the CRM team's agreement on `lifecyclestage`.
8. **Unconfirmed Cognito users with paid entitlements**: migrate and force a verification at first sign-in, or exclude? (Count from §8 item 3.)
9. **Exact cohort-C count** — run §3.4 on prod (read-only) before the design freezes; this report gives bounds, not the number.
10. **Retention policy** for never-paid rows and for orphaned history rows (§8 item 4) — none exists today (KB `09`).

---

### Source index
- `BE origin/master` (`d0666547`): `src/entities/patients.entity.ts:26-28,99-100`; `src/services/patients.service.ts:246-318,333-459,526-622`; `src/services/cognitoAdmin.service.ts:145-180`; `src/services/payment.service.ts:68-100,134-199`; `src/services/registerWithPayment.service.ts:617-654,817,927`; `src/services/hubSpot.service.ts:56-63,140,263-283`; `src/services/tierJourney.service.ts:43-44,110,174-180,250,300-323`; `src/config/index.ts:119-129,182-189,210-211,267`; `src/entities/subscriptions.entity.ts`; `src/entities/patientAcknowledgement.entity.ts`.
- KB: `00_INDEX.md` (identity model), `02_Data_Model.md:105-139,318-345,425-438,490-497,582-600`, `03_Business_Logic_Flows.md:244-312`, `05c_Deployed_Cognito_and_Reconciliation.md:118-170`, `06_Database_Live.md:1-40,270-293,504-520,880-897,898-932,932-967,967-1000,1071-1090,1124-1139,1140-1158,1200-1215,1255-1275`, `07_Integrations_Webhooks.md:66-80`, `08_AWS_Infra.md:17-25`.
- `BBMI_Change_Log.md:137,294,484-492`; `BBMI_HubSpot_Integration_Spec.md:91-130`; `BBMI_QA_Sync/QA_09_launch_DDL.sql:42-53`; `QA_Test_Kit/PROD_account_health_check.mjs:1-30`, `PROD_count-cognito-id-shape.mjs:1-15`, `PROD_repair-martina-martin-orphan.mjs:1-23`.
- Memory: `project_bbmi_semble_implementation.md:13-27`, `project_bbmi_patient_portal_semble.md`, `reference_bbmi_cognito_provisioning.md`, `reference_adhd_semble_backend.md:30,92,109-138,172`, `project_bbmi_duplicate_email_guard.md`, `project_bbmi_overdue_member_experience.md`, `reference_bbmi_support_case_patterns.md:25,53,68,72,76`.
- Research: R02 §6-§10; R04 §1 (Patient row), §2 (identity bootstrap row), §3, §4, §8; R05 §1.1, :177,:213-216,:240; R06 §3.3; R07:12,40; R09 §4-C, §6 D2/D6, §7 task 5.
- Not on this PC (could not be read): the Semble contract Schedule 1 and `BBMI_Semble_Implementation_Scope_and_Call_Questions.md` (Workspace holds only `retired-app-association-backup`); the sign-up audit ledger `BBMI_SignUp_Audit_Triage_2026-09-05.md`.
