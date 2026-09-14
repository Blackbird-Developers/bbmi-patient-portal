# PRODUCT.md — Beyond BMI patient portal (Semble-backed)

*Product brief for anyone (human or agent) building screens. Distilled from `docs/research/` on 2026-09-11. Read before writing UI.*

## What this is
The new patient-facing web app for Beyond BMI, an Irish doctor-led GLP-1 weight-management clinic. It replaces the Angular app at app.beyondbmi.ie. **Semble** (UK practice-management EHR, GraphQL API) is the clinical system of record from 1 Sep 2026: patients, clinicians, availability, bookings, video links, clinical notes, letters, prescriptions, invoices, reminders. **Stripe** stays the biller. **This portal** owns identity, the patient journey, entitlement and booking rules, the treatment loop (dose, side effects, weight), messaging, documents presentation, and billing state.

Semble has **no patient login, no dashboard, no messaging, no subscription billing** — its "patient portal" is an emailed document link with DOB 2FA. So everything the patient sees here is ours; Semble is a back-end.

## Who uses it (personas in the demo)
| Stage (prod name) | Persona | What they need first |
|---|---|---|
| `consult_paid` | Seán, paid €89 an hour ago | Questionnaire → book the doctor consultation |
| `consult_done` | Aoife, day 12 after consult, on 2.5 mg | Dose loop, nurse messaging, and (quietly) the 90-Day offer |
| `ninety_day_active` | Ciarán, day 38 of 90, €150×3 | Next dose, this week's weigh-in, MDT steps, next appointment |
| `legacy_member` (Ongoing Care €75) | Margaret, 5 months in | Quarterly review, monthly nurse, extra sessions, renewals |
| `ninety_day_overdue` | Dara, instalment failed | One action: pay the open instalment and resume |
| `ninety_day_completed` | Fiona, day 92 | Results summary + choose Ongoing Care €75 / full MDT €150 |

## The journey (client's Patient Journey Map v4.2.1 + prod as of 8 Sep 2026)
1. Website → pay €89 → verify email → sign in → **health questionnaire** → book 25-min doctor consultation (Semble availability, 5-doctor roster).
2. Consultation (Semble video) → doctor issues prescription in Semble → home delivery (Pure Pharmacy) or pharmacy of choice → nurse call day 5–7 → care-coordinator call day 21.
3. 90-Day Programme (€399 upfront or €150×3): 8 MDT appointments in month bands — Doctor M1+M3, Dietitian M1+M3, Health Coach M1/M2/M3, Nurse M2 — booked in order per role, each in a window; Day 80 results call.
4. Ongoing Care (€75/mo: quarterly doctor, monthly nurse, prescriptions; €150/mo: full MDT) + ad-hoc sessions (Doctor €80 · Coach €50 · Dietitian €60 · Nurse €40).

## Information architecture (4 tabs + account)
**Home** (one primary card per stage, task list, next appointment, this week) · **Treatment** (next dose, dose log, side-effect check-in, prescriptions & delivery tracker, dose-review request) · **Progress** (weight trend, weigh-in, goal, non-scale wins) · **Care** (care team, appointments, MDT programme steps, booking, messages) · **Account** (profile, billing & plan, documents, settings).

Routes: `/` home · `/treatment` · `/progress` · `/care` (team + messages) · `/appointments` · `/programme` · `/book/[type]` · `/documents` · `/account` · `/account/billing` · `/plans` · `/forms/[slug]` · `/architecture` (presenter page).

## Rules the UI must respect (server-decided, UI only mirrors)
- **Never re-derive eligibility in the browser.** The server says `book-now / locked / booked / completed / missed` per step and why.
- Booking windows and allocation: 8 MDT steps, book in order per role, "Available from {date}" shown up front.
- **Paused / overdue = one primary action: "Pay instalment and resume"** (opens the open Stripe invoice — never a new checkout). Booked appointments are kept and shown; Book/Reschedule/Join locked.
- **Questionnaire gate** blocks the clinical action (booking/joining), never navigation. Never overlay the Join button.
- Join window: 60 min before → 2 h after start. Reschedule/cancel need 24 h notice (Terms); show the rule beside the button.
- €89 patients: one consultation, 30-day prescription window, no community, no upsell hero. The 90-Day offer is shown only from `consult_done`.
- Ongoing Care is only offered after `ninety_day_completed`.
- Prescription PDF links are short-lived and minted on click; never cached.
- Medication names appear only inside the authenticated, clinical context.

## Voice
A calm Irish clinic nurse who tells you exactly what to do next, never sells, never scolds. Second person, no exclamation marks, numbers over adjectives ("3 monthly payments of €150 · next on 3 Oct"). Person-first language. State the entitlement and the rule together ("Doctor review · Month 3 · available from 12 Nov"). Dublin time, "€150" no space, en-IE spelling.

## Anti-references
Admin-template dashboards (Vuexy), marketing-scale type and 28px+ radii, hover-lift cards, peach/cream bento tints, gamified streaks and badges, "Take control!" copy, before/after photos, AI chat companions, fresh checkouts for overdue members, medication names on public surfaces.
