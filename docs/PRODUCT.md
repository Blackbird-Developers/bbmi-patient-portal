# PRODUCT.md — Beyond BMI patient portal (Semble-backed)

*Product brief for anyone (human or agent) building screens. Distilled from `docs/research/` on 2026-09-11. Read before writing UI.*

## What this is
The new patient-facing web app for Beyond BMI, an Irish doctor-led GLP-1 weight-management clinic. It replaces the Angular app at app.beyondbmi.ie. **Semble** (UK practice-management EHR, GraphQL API) is the clinical system of record from 1 Sep 2026: patients, clinicians, availability, bookings, video links, clinical notes, letters, prescriptions, invoices, reminders. **Stripe** stays the biller. **This portal** owns identity, the patient journey, entitlement and booking rules, weight tracking, documents presentation, and billing state.

Semble has **no patient login, no dashboard, no two-way messaging, no subscription billing** — its "patient portal" is an emailed document link with DOB 2FA, and its communications are outbound only (`sendEmail` / `sendSms`, read back one patient at a time). So everything the patient sees here is ours; Semble is a back-end, and anything the portal shows has to be something Semble can actually hold (see **Out of scope for now**).

## Who uses it (personas in the demo)
| Stage (prod name) | Persona | What they need first |
|---|---|---|
| `consult_paid` | Seán, paid €89 an hour ago | Questionnaire → book the doctor consultation |
| `consult_done` | Aoife, day 12 after consult | Prescription and delivery status, week-1 check-in, and (quietly) the 90-Day offer |
| `ninety_day_active` | Ciarán, day 38 of 90, €150×3 | This week's weigh-in, MDT steps, next appointment |
| `legacy_member` (Ongoing Care €75) | Margaret, 5 months in | Quarterly review, monthly nurse, extra sessions, renewals |
| `ninety_day_overdue` | Dara, instalment failed | One action: pay the open instalment and resume |
| `ninety_day_completed` | Fiona, day 92 | Results summary + choose Ongoing Care €75 / full MDT €150 |

## The journey (client's Patient Journey Map v4.2.1 + prod as of 8 Sep 2026)
1. Website → pay €89 → verify email → sign in → **health questionnaire** → book 25-min doctor consultation (Semble availability, 5-doctor roster).
2. Consultation (Semble video) → doctor issues prescription in Semble → home delivery (Pure Pharmacy) or pharmacy of choice → nurse call day 5–7 → care-coordinator call day 21.
3. 90-Day Programme (€399 upfront or €150×3): 8 MDT appointments in month bands — Doctor M1+M3, Dietitian M1+M3, Health Coach M1/M2/M3, Nurse M2 — booked in order per role, each in a window; Day 80 results call.
4. Ongoing Care (€75/mo: quarterly doctor, monthly nurse, prescriptions; €150/mo: full MDT) + ad-hoc sessions (Doctor €80 · Coach €50 · Dietitian €60 · Nurse €40).

## Information architecture (4 tabs + account)
**Home** (one primary card per stage, task list, next appointment, this week) · **Prescriptions** (read-only list of what the doctor has issued in Semble, each with its delivery status — issued → sent to pharmacy → dispensed → runs out; nothing to download, nothing to edit) · **Progress** (weight trend, weigh-in, goal) · **Care** (who your care team is, how to reach the clinic, when to get help) · **Account** (profile, billing & plan, documents, settings).

Routes: `/` home · `/prescriptions` · `/progress` · `/care` (team + contact) · `/appointments` · `/programme` · `/book/[type]` · `/documents` · `/account` · `/account/billing` · `/plans` · `/forms/[slug]` · `/architecture` (presenter page).

## Rules the UI must respect (server-decided, UI only mirrors)
- **Never re-derive eligibility in the browser.** The server says `book-now / locked / booked / completed / missed` per step and why.
- Booking windows and allocation: 8 MDT steps, book in order per role, "Available from {date}" shown up front.
- **Paused / overdue = one primary action: "Pay instalment and resume"** (opens the open Stripe invoice — never a new checkout). Booked appointments are kept and shown; Book/Reschedule/Join locked.
- **Questionnaire gate** blocks the clinical action (booking/joining), never navigation. Never overlay the Join button.
- Join window: 60 min before → 2 h after start. Reschedule/cancel need 24 h notice (Terms); show the rule beside the button.
- €89 patients: one consultation, 30-day prescription window, no community, no upsell hero. The 90-Day offer is shown only from `consult_done`.
- Ongoing Care is only offered after `ninety_day_completed`.
- Document links are short-lived and minted on click; never cached. Prescriptions are read-only — there is nothing for the patient to download.
- Medication names appear only inside the authenticated, clinical context.

## Out of scope for now
Three things were taken out of the portal because Semble cannot back them and today's portal does not do them. They are decisions for Beyond BMI, not gaps in the build.

| Removed | Why |
|---|---|
| **Patient messaging** — threads, composer, unread badges, "message us" CTAs | Semble's communications are outbound only. A patient reply lands in the practice mailbox and never enters Semble, and communications can only be read one patient at a time, so staff have no inbox to work from. A messaging product needs its own home and its own staffing rota. |
| **The dose loop** — dose log, injection-site rotation, side-effect check-ins, titration plan, missed-dose rule, "next injection" card | Semble has no model for a patient-entered dose diary, and today's portal does not ask for one. Storing it here would make the portal the system of record for clinical data that the doctor never sees in Semble. |
| **Prescription downloads** | The script goes from the doctor to the pharmacy; the patient never handles it. The portal shows the status, not the document. |

Where a removed feature used to point somewhere, the copy now points at the care team's real contact details instead — the clinic phone and email — never at a thread.

## Voice
A calm Irish clinic nurse who tells you exactly what to do next, never sells, never scolds. Second person, no exclamation marks, numbers over adjectives ("3 monthly payments of €150 · next on 3 Oct"). Person-first language. State the entitlement and the rule together ("Doctor review · Month 3 · available from 12 Nov"). Dublin time, "€150" no space, en-IE spelling.

## Anti-references
Admin-template dashboards (Vuexy), marketing-scale type and 28px+ radii, hover-lift cards, peach/cream bento tints, gamified streaks and badges, "Take control!" copy, before/after photos, AI chat companions, fresh checkouts for overdue members, medication names on public surfaces.
