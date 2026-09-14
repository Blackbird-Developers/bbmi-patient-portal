# 07 — The product model the new portal must present
## Plans, tiers, the 90-day programme, the MDT schedule, pricing, and the overdue/lapsed member states

*Research slice for the Semble-backed patient portal. Compiled 2026-09-11 from the deployed code (`back-end` `origin/master` = `d0666547`, 8 Sep 2026; `beyondbmi-front-end` `origin/master` = `cd22a9d3`, 8 Sep 2026), the Workspace design docs, the change log, and the client's Patient Journey Map. Nothing here was read from the local working trees (they sit on stale feature branches); every code citation is against the remote branch named. No live API was called.*

**⚠️ Source caveat — `Index_4.html.html` is not on this PC.** The build spec names it the source of truth (`BBMI_90Day_Build_Spec.md:4`) and my Jul-20 memory locates it at `C:\Users\Admin\Downloads\Index_4.html.html`, but a full-profile search (Desktop, Downloads, Documents, OneDrive, other drives, excluding node_modules) finds no copy. What survives: (a) the previous revision `Workspace/External/BBMI_Patient_Journey_Map_v4_2_1.html` (text dump already in this folder as `00_client_patient_journey_map_v4_2_1.txt`, cited below by line); (b) the recorded diff between v4.2.1 and Index_4 (`memory/project_bbmi_90day_booking.md:17`): Day 5–7 call reassigned **Nurse → Customer Support**, Day 80 + Ongoing-Care Nurse → **Sales Care Coordinator**, prescription policy tightened to *"no new/standalone scripts outside an active programme"*; plus Art's Jul-9 relay (`memory/project_bbmi_tiered_pricing_poc.md:69`): the Day 5–7 check-in is **also** a 90-day touchpoint, non-clinical (Monika), anchored on `bbmi_ninety_day_start_date`; (c) the spec itself, which was written from Index_4 and states the schedule verbatim; (d) the shipped dashboard, which was built to the spec and verified against Index_4 on QA on 2026-07-16 (`memory/project_bbmi_90day_booking.md:13`). Sections 2–3 therefore describe Index_4 through those four proxies. **Recover the file from Art before the portal's dashboard is signed off.**

---

## TL;DR

1. **Four sellable products, one journey.** €89 one-time consultation → 90-Day Programme (€399 upfront one-time, or €450 as 3×€150 monthly subscription that auto-cancels after month 3) → a finisher's chooser between €75/mo Ongoing Care and €150/mo Full Membership. The ~150 legacy €150 members are a fifth, closed cohort that must never be routed through the €89 journey (`tierJourney.service.ts:35-44`, `:294-299`).
2. **The 90-day programme sells exactly 8 MDT appointments** — Doctor ×2 (M1, M3), Dietitian ×2 (M1, M3), Health Coach ×3 (M1, M2, M3), Nurse ×1 (M2) — plus two phone touchpoints the portal only *describes* (Day 5–7 check-in, Day 80 retention call). Bookable all on day one; each opens no earlier than its month window; same-role appointments book in order; the allocation is capped server-side (`config/index.ts:245-250`, `activities.service.ts:365-410`, `:1711-1723`).
3. **Programme clock = the "Day-20 anchor"**: `max(purchase, pre-purchase consult + 20 days)`; the €399 entitlement runs anchor+90, the €450×3 subscription runs purchase+3 calendar months. Direct 90-day buyers (no consult) anchor on purchase (`activities.service.ts:1581-1615`, `tierJourney.service.ts:637-645`).
4. **Member state is a server-derived stage machine** with nine stages (`none, consult_paid, consult_booked, consult_done, ninety_day_active, ninety_day_overdue, ninety_day_completed, legacy_member, legacy_lapsed`) exposed by `GET /api/v1/user/tier-journey/status`. The FE never decides eligibility. **All nine stages are live on prod since the 8 Sep release** (`BBMI_Change_Log.md:129-141`).
5. **Overdue ≠ lapsed ≠ paused.** A mid-programme failed instalment is `ninety_day_overdue` (programme *paused*, pay the open Stripe invoice — never a new checkout); a legacy member not paid up is `legacy_lapsed` with three sub-cases (on hold / paused by practice / cancelled-ended). Booking and joining lock; the dashboard says what happened and carries pay/continue (`journey-banner.component.html:73-184`).
6. **What is NOT true on prod today:** the attendance (join) gate is unarmed (`ATTENDANCE_GATE_ENFORCE_FROM` absent from `prod-backend-deployment.yaml`), the finisher chooser is dark (no `ONGOING_*` price ids on prod → "Our team will be in touch"), the Nurse step's booked state is never shown (FE maps no nurse activity), the €89 "one consult" is unenforced (no cadence row → default 2.5-month doctor cooldown), and no `appoinment_intervals` rows exist for the €89/90-day prices.
7. **The funnel changed on 8 Sep:** nothing is booked at payment any more for any plan. Journey = pay → verify email → sign in → questionnaire → book (`register-pay-page.component.ts:214-233`; change log `:186-191`). The portal's first screen after sign-in must therefore be the questionnaire gate, then "you're ready to book".
8. **Portal implication in one line:** present the journey as a stage-driven checklist (identity → questionnaire → the 8 MDT slots in month bands → Day 80 → chooser), keep every gate server-side, and treat Stripe invoice state — not "subscription active" — as the money signal.

---

## 1. Plans and tiers — price, what it includes, entitlements, cadence

### 1.1 The catalogue (prod ids)

| Product | Stripe object (LIVE) | Charge shape | Entitlement window | Cognito groups granted (prod) | Source |
|---|---|---|---|---|---|
| **€89 Onboarding Consultation** | `price_1TeAOyBeNn0x9hADPv5xvJOv` on `prod_UdRHmpb7aldqj1` | one-time PaymentIntent (`pi_` row) | `current_period_end` = purchase **+1 year** | `doctor, prescription, survey` — community deliberately removed 14 Jul | `prod-backend-deployment.yaml:422-423`; `registerWithPayment.service.ts:966-967`; `memory/project_bbmi_tiered_pricing_poc.md:108` |
| **90-Day Programme — €399 upfront** | `price_1ToQY1BeNn0x9hADyoJUoTcv` on `prod_Uo2d5AhoIznevl` | one-time (`pi_` row) — decided 6 Jul, never recurring | anchor **+90 days** (funnel: purchase+90) | same 6 roles as legacy €150 incl. `community` (cloned) | `prod-backend-deployment.yaml:442-447`; `tierJourney.service.ts:637-645`; `registerWithPayment.service.ts:960-965`; `PROD_90day_catalog_seed.sql:4-6,27-39` |
| **90-Day Programme — €450 as 3×€150** | `price_1ToQY1BeNn0x9hADjJcp7Zj9` (recurring €150/mo) | real subscription (`sub_`), `cancel_at = start + 3 calendar months` set inline at signup and by webhook | until Stripe cancels at month 3 (~92 days) | same 6 roles | `payment.service.ts:547-593`; `registerWithPayment.service.ts:751-815`; `memory/…poc.md:147` |
| **Ongoing Care €75/mo** ("Maintenance") | `price_1QwhloBeNn0x9hADJarF6Yn0` / `prod_RqOYOddBikyoyL` | recurring subscription | monthly | 4 roles: `community, doctor, prescription, survey` (no dietician / health coach); 239 active via CS winback on 10 Jul | `memory/…poc.md:163`; `membership-pricing.component.html:333-345` |
| **Full Membership €150/mo** (legacy "Premium/Membership") | `price_1LVzFgBeNn0x9hADr8olz7VQ` | recurring subscription | monthly, 30-day cancellation notice | full set (`doctor, health-coach, dietician, nurse, prescription, community, survey` [+`psychologist` in the pool]) — "6 vs 8" never confirmed from prod `roles_products` | `prod-backend-deployment.yaml:452-453`; `BBMI_450_vs_150_Analysis.md:14`; `membership-pricing.component.html:128-129` |
| Ad-hoc expert sessions (Phase 3 only) | none created | per-session: Doctor €80 (20 min) · Health Coach €50 (25) · Dietitian €60 (25) · Nurse €40 (25) | — | — | journey map `00_client…txt:719, 1376-1395`; "platform adhoc infra EXISTS, needs prices" `memory/…poc.md:70` |
| Internal access codes (100 % comp) | no Stripe | synthetic `pi_comp_` row through the real provisioning | as the comped plan | as the comped plan | `tierJourney.service.ts:446-554`; **dark on prod** (`ENABLE_ACCESS_CODES` absent; FE box `*ngIf="false"` `membership-pricing.component.html:412-413`) |
| Buddy programme (€45 each once both convert) | Stripe coupon `BBMI_BUDDY_15X3` | retro-settlement | — | — | `config/index.ts:147-159`; **dark on prod** |

Decisions that fix the shape (do not re-open): €399 and €450×3 are **one product, two prices** — the map's "€450 upfront saves €49" box is stale (`memory/…poc.md:70`; map `00_client…txt:405`); €150 members stay on €150 permanently, new customers only get the tiers (`BBMI_450_vs_150_Analysis.md:5`); finishers get a **chooser** (€150 or €75), not an auto-continue (`memory/…poc.md:11`); the €75 plan is a continuation, "never offered or presented during the €89 consultation or 90-Day Programme stages" (map `:1216`).

Population facts worth designing for: 970 patients with an active subscription on 17 Aug, 175 of them with no intake survey, 151 members 90+ days (`config/index.ts:186-188`); "the ~150 legacy members" is the cohort the survey-cohort switch protects (`survey-tally.component.ts:33`); 9 live 90-day members on 5 Aug (`BBMI_Change_Log.md:1980`); 239 €75 winback members (`memory/…poc.md:163`).

### 1.2 What each plan includes (the client's own service tables)

- **€89 (Month 1, days 1–30)** — 30-min video specialist consultation (Day 0); Day 5–7 follow-up call (10 min; Nurse in v4.2.1, **Customer Support in Index_4**); Day 21 Care/Health Coordinator phone call presenting the 90-day; async nurse support (4-business-hour response); prescription issued at consultation and managed by the doctor; Pure Pharmacy home delivery; insurance documentation; HubSpot comms (`00_client…txt:459-505`). Platform reality: the €89 prescription is valid **30 days from the appointment**, after which a €89-only patient cannot create or send prescriptions until they upgrade (`tierJourney.service.ts:376-409`; `E89_PRESCRIPTION_VALID_DAYS` `config/index.ts:231`) — this is the code form of Index_4's "no standalone scripts outside an active programme".
- **90-Day Programme (M1–M3)** — Doctor 10-min video M1+M3 (titration/dose review); Dietitian 45-min video M1+M3 with a personalised nutrition plan (email/PDF within 48 h of the M1 consult); Nurse 10-min video M2; Health Coach 30-min video every month; async nurse support; prescription management throughout; web app + community (weight logging, medication tracking, content library, peer group); insurance documentation M1 (~€230 reclaim); HubSpot sequences (`00_client…txt:615-684`). The €89→90-day upgrade card promises "for 90 days: Doctor appointments & prescriptions · Health-coach & dietician support · Community access · All programme content & surveys" (`membership-pricing.component.html:309-315`).
- **Ongoing Care €75/mo** — quarterly doctor (10 min), monthly nurse check-in, async dietitian and coach (48 h), prescription renewal at each quarterly review, reactive nurse support, community, home delivery, monthly billing "cancel any time" (`00_client…txt:1306-1365`). Platform gap: the €75 price grants **no dietician/health-coach group** (`memory/…poc.md:163`) — consistent with "async" support only, but the app has no async-messaging feature; async care is a Semble/HubSpot promise the portal must surface somehow.
- **Full Membership €150/mo** — "continue full 90-Day MDT structure" (`00_client…txt:1226`; chooser copy `membership-pricing.component.html:352-358`).

### 1.3 Booking allowances, cadence and cooldowns

- **Legacy engine (members, €75, €150):** cooldown before the next appointment of a role, keyed by `appoinment_intervals.stripe_plan_id`; defaults when no row exists = `health coach: 1, doctor: 2.5, dietician: 3` months (`appointmentIntervals.entity.ts:25-35`; `activities.service.ts:642-693`). The cooldown is anchored on the previous appointment's *completion* (`activities.service.ts:494-524`).
- **Prod cadence rows: exactly one (`premium` → the €150 price).** `PROD_90day_catalog_seed.sql:41-49` staged rows for the €89 and both 90-day prices, but the 5 Aug prod read found "exactly one row" (`BBMI_Change_Log.md:1986-1987`) and the deployed code still comments "no appoinment_intervals row exists for €89 or for either 90-day price" (`activities.service.ts:463`). Consequence: **€89 "one consult" is not enforced** — a €89 buyer holds `doctor` for a year under a 2.5-month cooldown (~4 consults/yr) (`memory/…poc.md:130`).
- **90-day engine (replaces the cooldown, does not stack):** while a live 90-day row exists, the legacy cooldown is skipped and the programme month-windows govern (`activities.service.ts:460-479`, shipped to prod 5 Aug, `BBMI_Change_Log.md:1872-1878`). Windows and allocation come from `NINETY_DAY_SCHEDULE` (§2). A finisher (period end passed) reverts to normal rules (`activities.service.ts:1669-1673`).
- **Weight gate:** a stale last weight blocks the Doctor booking for everyone ("Weight Update Required"; case-insensitive since Jul-16) (`memory/…poc.md:29`); the Aideen Lynch €75 case was a 489-day-stale weight (`BBMI_Change_Log.md:1351`).
- **Questionnaire gate:** one intake questionnaire for all plans (short form `NpQ8Kl`, slug `surv`, for every non-legacy stage; the ~150 legacy members keep the long form) (`survey-tally.component.ts:31-45`; `environment.prod.ts:23`; `prod-backend-deployment.yaml:436-437`). It gates **attending** (join) for everyone and, for patients who signed up on/after **2026-08-24**, blocks the whole app until submitted (`SURVEY_GATE_ENFORCE_FROM`, `prod-backend-deployment.yaml:411-412`; `memory/project_bbmi_survey_gate.md:21-32`).

---

## 2. The 90-day MDT schedule

### 2.1 The 8 bookable appointments (spec table, mirrors Index_4)

| # | Step label (as rendered) | Role | Month | Window offset (months from anchor) | Client duration/format | Allocation |
|---|---|---|---|---|---|---|
| 1 | Doctor — initial review | Doctor | 1 | 0 | 10-min video | Doctor 2 of 2 |
| 2 | Dietitian — initial review | Dietician | 1 | 0 | 45-min video (+ nutrition plan PDF ≤48 h) | Dietitian 2 of 2 |
| 3 | Health Coach — session 1 | Health Coach | 1 | 0 | 30-min video | HC 3 of 3 |
| 4 | Nurse — check-in | Nurse | 2 | 1 | 10-min video | Nurse 1 of 1 |
| 5 | Health Coach — session 2 | Health Coach | 2 | 1 | 30-min video | |
| 6 | Doctor — final review | Doctor | 3 | 2 | 10-min video | |
| 7 | Dietitian — follow-up | Dietician | 3 | 2 | 45-min video | |
| 8 | Health Coach — session 3 | Health Coach | 3 | 2 | 30-min video | |

Sources: `BBMI_90Day_Build_Spec.md:21-30`; `config/index.ts:245-250` (`doctor:[0,2], dietician:[0,2], 'health coach':[0,1,2], nurse:[1]`); `ninety-day-steps.component.ts:111-139`; durations `00_client…txt:615-649`.

**Not booked in the app — information rows only:** *Day 5–7 check-in call* ("Our team will call you") and *Day 80 review call* ("Our team will call you") (`ninety-day-steps.component.ts:115-121, 132-138`; spec `:32-35, :71`). Index_4 owners: Day 5–7 = Customer Support / Monika via HubSpot task (non-clinical; clinical concerns triage to Nurse); Day 80 = Sales Care Coordinator via Aircall, window Day 78–82 (`00_client…txt:1688-1693`; `memory/…poc.md:69`).

### 2.2 The rules the engine enforces (live on prod)

- **Anchor.** `programmeStart` = purchase (the *counting* boundary — excludes a pre-upgrade €89 consult); `programmeBegins` = the Day-20 anchor `max(purchase, latest pre-purchase doctor consult slot + 20 days)`; purchases before **2026-07-21** are grandfathered on purchase (`activities.service.ts:1581-1615`, `:1674-1681`; `config/index.ts:226`). Direct 90-day buyers have no consult → anchor = purchase.
- **Earliest date per step** = anchor + offset(role, N) where N = how many of that role are already booked in-programme; windows are *earliest-only* (no upper cap in v1) (`activities.service.ts:1711-1723`; spec `:70`). "Months" are the app's `addMonthsInterval` (fractional months → days), while Art's stated intent is **30-day blocks** (D0–29 = M1, D30–59 = M2, D60–89 = M3) (`memory/…poc.md:147`) — [INFERRED] a minor divergence the portal can settle by using the 30-day blocks explicitly.
- **Enforcement points:** availability search clamps the lower bound and shows a 4-week window from it (`availability.service.ts:693-698`); event creation is a hard floor with the message *"This {role} appointment can be booked from {date} onward."* (`calendar.service.ts:498-502`).
- **Order:** occurrence N unlocks only once N−1 of the same role are booked; Art confirmed "book-in-order" (`ninety-day-steps.component.ts:238-243`; `memory/project_bbmi_90day_booking.md:13`).
- **Allocation cap:** refused with *"Your 90-day programme includes {n} {Role} appointment(s), and you have already booked {used}. Please contact support if you need another."*; counts the max of the activity ledger and role-based calendar events so a staff role change can't grant a second slot (`activities.service.ts:365-410`; eligibility endpoint reason `programme_allocation_used` `:1083-1103`).
- **Reschedule** excludes the event being moved from the count (`activities.service.ts:1696-1701`).
- **Nurse.** Backend: Nurse = activity 8, allocation 1, window M2 (`activities.service.ts:1410-1412, 1734-1735`); a real nurse check-in was booked on prod on 14 Aug (`activities.service.ts:384-386`). Front end: the step is enabled (no `comingSoon` flag set), but `roleActivityIndex` has no `nurse` entry, so `isBooked()` is always false — **the Nurse row never shows "Scheduled for" after booking** (`ninety-day-steps.component.ts:141-146, 213-217`). The spec's placeholder `NURSE_STAFF_ID` was never introduced (grep of `origin/master`: none).
- **Booked-state statuses:** prod FE counts anything not `cancelled` as booked, so a **no-show still reads as booked** and hides the Book button — fixed on qa only by an allow-list `scheduled | rescheduled | completed` (`origin/qa` `61cf037`, "a missed appointment is not a booking", 9 Sep).

### 2.3 Programme end and what follows

- €450×3 ends by Stripe `cancel_at` → `customer.subscription.deleted` strips groups; €399 simply ages past `current_period_end` (no Stripe object) (`payment.service.ts:534-544`; `tierJourney.service.ts:256-269`).
- **Completed** = period end passed **and** created + 85 days passed (so a day-5 refund or a mid-programme cancel is "ended early", never a finisher) (`tierJourney.service.ts:270-275`; label logic `payment.service.ts:1167-1192`; HubSpot stamper sweeps every 6 h `ninetyDayCompletionSweeper.ts:26-29`).
- A finisher's booked programme appointments persist after the subscription closes (spec `:107-109`); a €399 finisher keeps the 6 groups until a new subscription **replaces** them (`payment.service.ts:662-677`).
- Day-80 retention call → chooser; runway: the chooser "must exist by first buyer's Day ~80" (`memory/…poc.md:11`) — it exists in code but is **dark on prod** (§6).

---

## 3. The dashboard / timeline design (Index_4 as implemented)

The dashboard is one page: **pre-consult checklist modal → journey banner → left column journey card → right column weight tracker + weight history** (`dashboard.component.html:7-62`). Blood-pressure card removed for all patients (product decision 15 Jul, `:43`).

### 3.1 Journey banner (top of dashboard, one card per stage) — `journey-banner.component.html`
- `consult_paid`, survey missing: eyebrow WHAT'S NEXT · "Your consultation is paid — one step first" · "Complete your quick health questionnaire to unlock booking." · [Start questionnaire] (`:4-17`). Survey done: "You're ready to book" · "Book your €89 doctor consultation." · [Book your consultation] (`:19-30`).
- `consult_booked`: YOUR NEXT APPOINTMENT · "Your consultation is booked" · date/time · "Complete your questionnaire before your appointment." if still missing (`:34-46`).
- `consult_done`: "Consultation complete ✓" · "Start your 90-day programme to continue your care." · [See your 90-day options] (`:49-60`).
- `ninety_day_active`: subtle green "90-day programme active — {n} days remaining" (`:63-67`).
- `ninety_day_overdue`: ACTION NEEDED · "Your 90-day programme is paused" · "Your instalment of €{amount} was unsuccessful. Pay your missed instalment to resume — your appointments and progress are kept." · "While the programme is paused you can't book or join appointments." · [Pay instalment and resume] (Stripe hosted invoice) · [Update card or manage subscription] (billing portal); practice-paused variant: "Payment collection on your programme has been paused by our team. Please contact support@beyondbmi.ie" (`:73-115`).
- `legacy_lapsed`: (a) on hold — "Your membership is on hold" · "Your last payment of €{amount} was unsuccessful. Pay it to keep your membership — your appointments and history are kept." · [Pay and continue] · [Update card or manage subscription]; (b) paused by the practice — "Your membership is paused … contact support"; (c) cancelled/ended — "Your membership was cancelled" / "Your membership is not active" · "It ended on {date}. You can't book or join appointments until it's active again. Your history and results are kept." · [Continue your membership] (fresh checkout on their own plan) · [Manage subscription] (`:121-184`).
- `ninety_day_completed`: "Your 90-Day Programme is complete 🎉" · "Choose how you'd like to continue your care." · [See your options] (`:187-198`).
- Nothing renders for `none` or `legacy_member`.

### 3.2 The 90-day steps card (replaces the legacy timeline for `ninety_day_active` and `ninety_day_overdue`) — `ninety-day-steps.component.html`
- Header: "Hi {name} — your 90-day programme" + red **Paused** badge when overdue (`dashboard.component.html:15-25`).
- Info banner while the anchor is in the future: "Your programme begins on {Weekday, Mon d} — you can book all your appointments now, with dates available from then." (`:4-9`).
- Red banner when paused: "Booking is paused until your missed instalment is paid. Appointments you've already booked are kept, but you won't be able to join them until it's paid." (`:12-17`).
- Two gate rows: **Verify identity** ("Before you start" · Verified / [Verify identity] → Sumsub modal) and **Complete health survey** ("Before you start" · Survey complete / [Take survey]) (`:23-67`).
- Ten rows in chronological order (§2.1 + the two info rows), each: label, sub-label "Month 1 / Day 5–7 / Month 2 / Month 3 / Day 80"; state = "Scheduled for **HH:mm d MMM y**" once booked, else [Book] → `/appointments/booking/{role}` (disabled while paused, while an earlier same-role step is unbooked, or `comingSoon`), info rows show "Our team will call you" in italics (`:69-107`). Booked times render in UTC, not Dublin (open polish, `memory/project_bbmi_90day_booking.md:13`).
- Each step's *earliest date* is not shown on the card — the calendar reveals it (spec §7 endpoint "8 steps, each with {role, label, booked?, date?, earliestBookableDate}" was proposed but not built, `BBMI_90Day_Build_Spec.md:87`).

### 3.3 The legacy timeline (everyone else) — `timeline.component.html`
Rows: **Payment** (Subscribe / "Membership Active" / "€89 consultation" / "Consultation complete — see your 90-day options" / "Payment Paused" / "Membership not Active"; [Manage Subscription] for recurring plans only) (`:23-62`); **Identity Verification** (`:63-83`); **Complete Health Survey** (button disabled unless payment active) (`:84-111`); **Book Doctor Appointment** with Book Call / "Completed {date}" / "Scheduled for {date}" + Reschedule + Join Call (Expired after the slot) / "Next Appointment will be able {date}" cooldown line (`:112-174`); **Book Health Coach Appointment** and **Book Dietician Appointment** (hidden for €89 consult buyers) (`:176-300`). Every Book/Reschedule/Join is disabled by `isLapsed()` for the lapsed stages.

### 3.4 The /pricing journey page — `membership-pricing.component.html`
- Legacy stages (`legacy_member`, `legacy_lapsed`, `ninety_day_overdue`) get the **billing-issue header** when money is owed ("Your instalment was unsuccessful" / "Your last payment was unsuccessful" / "Your payment was not completed" + amount outstanding + [Pay instalment and resume]/[Submit payment] + [Update card or manage subscription]) or the original single €150 plan card ("Pricing Plans", "*Our program requires a 30-day notice for cancellation.", "Your current plan") (`:26-143`).
- New patients get **"Your Beyond BMI Journey"** with a per-stage subtitle, a 3-step stepper (done/active/locked), an "activating your access…" banner after Stripe returns, and a stage card: `none` → €89 offer card ("Initial Doctor Consultation · Everything starts with a conversation · €89 one-time" + 4 bullets + [Start with a consultation · €89] + "After your consultation you can continue with our 90-Day Programme — €450 in 3 monthly payments, or €399 paid upfront."); `consult_paid` → [Book appointment] ("Completing your appointment unlocks the 90-Day Programme."); `consult_booked` → date + [View my appointments] ("Once your doctor marks the visit complete, the 90-Day Programme unlocks right here."); `consult_done` → two option cards "3 monthly payments €150 × 3 — €450 total… Ends automatically — no ongoing subscription" and "Pay upfront €399 one-time — Save €51 — our best value" + the includes grid; `ninety_day_active` → progress bar, "{n} days remaining · until {date}", variant label, [Go to my appointments]; `ninety_day_completed` → "Ongoing Care €75/month — Stay on track: doctor reviews, prescriptions and community" vs "Full Membership €150/month — Everything in the programme continues" or, when unarmed, "Our team will be in touch shortly about continuing your care." (`:146-406`).

### 3.5 Pre-consultation checklist modal (consult stages only)
"Before your consultation — Your doctor needs these completed before your appointment:" **Health questionnaire** (Completed / [Start questionnaire]) and **Home address** ("Needed for your prescription." / inline Irish address form) · [Do it later] unless mandatory, where the footer reads "Your questionnaire is required before your consultation — it lets your doctor prepare so your appointment is a conversation, not a checklist." (`pre-consult-checklist.component.html:5-89`). Hidden from 60 min before to 2 h after the consult so it never covers Join (the 5 Aug first-call incident, `memory/…poc.md:14`).

### 3.6 Appointments page
Lapsed banner: "Your membership isn't active, so booking and joining appointments are paused. Go to your dashboard to pay or continue your membership."; payment-paused banner: "Booking is temporarily unavailable because your payment is paused…" (`appointments.component.html:8-22`). The route guard sends lapsed/overdue members back to the dashboard with the same message and **fails open** (`entitlement.guard.ts:28-39, 66-85`).

---

## 4. Member states — derivation and what the patient sees

All stages derive from `subscriptions` rows + doctor-role `calendar_events`, recomputed on every call (`tierJourney.service.ts:164-374`). Precedence: active 90-day → overdue 90-day → legacy active → 90-day completed → legacy lapsed → €89 states → none.

| Stage | Rule (server) | Dashboard | /pricing | Book | Join | Prod? |
|---|---|---|---|---|---|---|
| `none` | no active €89 row, no legacy row, no 90-day row | legacy timeline "Subscribe" | €89 offer | — | — | live |
| `consult_paid` | active `pi_` €89 row, no doctor event | banner "one step first"/"ready to book"; checklist | [Book appointment] | doctor only (funnel roster of 5 doctors, `prod-backend-deployment.yaml:428-429`) | — | live |
| `consult_booked` | doctor event `scheduled`/`rescheduled` | banner with date; timeline Reschedule/Join | date + [View my appointments] | no (button hidden) | yes (after questionnaire) | live |
| `consult_done` | doctor event `completed` | "Consultation complete ✓ → See your 90-day options"; Book Call hidden | €399 / €150×3 chooser (`canUpgrade`) | none on €89 | — | live |
| `ninety_day_active` | 90-day row `active` & paid up (72 h grace for `sub_`, none for `pi_`) | 90-day steps card, "{n} days remaining" | progress card | 8 steps in windows | yes | live (armed 15 Jul) |
| ↳ *programme not started* | `programmeBegins` in the future (early payer, Day-20) | "Your programme begins on {date} — you can book all your appointments now…" | same | calendars clamped to anchor | — | live |
| `ninety_day_overdue` | 90-day row `past_due/unpaid/incomplete/payment_paused` **with a future period end** | red "programme is paused" banner; steps card with **Paused** badge, every Book locked, booked dates kept | "Your instalment was unsuccessful" + pay open invoice | refused (402: `findEntitlingSubscription` needs `active`) | **allowed on prod today** — join gate unarmed | live 8 Sep (`BBMI_Change_Log.md:137`) |
| `ninety_day_completed` | 90-day row period end passed AND created+85 d passed | "complete 🎉 → See your options" | €75 vs €150 chooser, or "Our team will be in touch" when unarmed | reverts to normal rules; a €399 finisher still holds 6 groups | — | live; **chooser dark** |
| `legacy_member` | any active non-tier row (€150, €75, …) paid up | legacy timeline "Membership Active" | original plan card, "Your current plan" | per cooldown | yes | live |
| `legacy_lapsed` (a) on hold | newest legacy row `past_due/unpaid/incomplete` | "membership is on hold" + pay open invoice | billing header | locked | prod: allowed (gate unarmed); qa: refused | live 8 Sep |
| `legacy_lapsed` (b) paused | `payment_paused`/`paused` | "paused by our team — contact support" | plan card | locked | not a hard lapse → join allowed | live |
| `legacy_lapsed` (c) cancelled/ended | `canceled`/`incomplete_expired` | "Your membership was cancelled · It ended on {date}" + [Continue your membership] | plan card + `<app-membership-checkout>` (fresh subscription) | locked | hard lapse → guard blocks join | live |
| *reactivated* | no explicit stage — paying the open invoice flips the row back to `active` via `customer.subscription.updated` (groups re-added `payment.service.ts:770-774`); a cancelled member's "Continue" is a **new** subscription | returns to the stage above | | | | [INFERRED transition — no dedicated copy exists] |

What Stripe `past_due` does to a member on prod: row → `past_due`, **all Cognito groups stripped**, activity 2 → `past_due`, HubSpot status updated; `invoice.payment_failed` / `charge.failed` are log-only — **no in-app dunning email** (`payment.service.ts:753-783, 926-964`; `memory/project_bbmi_overdue_member_experience.md:13`). Because the `MembershipGuard` admits any Cognito group and cancelled members keep `community`, cancelled legacy members reach the dashboard — that is why the lapsed banner exists (`journey-banner.component.html:117-120`). The client's own policy text says "Clinical access maintained for 7 days pending resolution… paused after 7 days… subscription cancelled if unresolved after 14 days" (`00_client…txt:552-558, 825-832`) — **the platform has no grace period at all**; access stops on the first failed charge (`BBMI_450_vs_150_Analysis.md:20-24`). Whether a card update can self-heal depends on the Stripe dunning "after final retry" setting (leave past_due / mark unpaid = yes; cancel = no, and a mid-programme cancelled €150×3 then derives as `none` = the €89 offer — open gap, `memory/…overdue…md:23`).

Two more states the portal must handle that are not tier stages: **survey-blocked** (signed up on/after 2026-08-24 and no questionnaire → app-wide block except `/survey`, `/support`, `/pricing`, `/checkout`, `/account-email-verify`; fail open; never block someone lacking the `survey` group) (`memory/project_bbmi_survey_gate.md:23-31`), and **email-unverified** (Cognito sign-up awaiting the link; "Check your email — We've sent a confirmation link to {email}…" + resend with 30 s cooldown) (`register-pay-page.component.html:415-436`).

---

## 5. The €89 funnel handoff into the portal

### 5.1 Entry points (all converge on the same saga)
Website widget on beyondbmi.ie (`/book-assessment…`, BMI ≥27 gate, lead capture, `?plan=` links); the app's logged-out `/sign-up` wizard with `?plan=onboarding-89 | ninety-399 | ninety-450 | 90-day` (chooser) (`plan-catalog.ts:35-88`); the sales-assisted link (BBMI-818: salesperson registers the patient on the call, no password step, set-password email afterwards) (`registerWithPayment.service.ts:490-512, 1001-1009`); the `/qualify` results page revealing the €89 calendar; access codes `?access=CODE` (dark on prod). The backend refuses any price not on `PUBLIC_SIGNUP_PRICE_IDS` = €89 + (when `ENABLE_PUBLIC_90DAY=true`, which prod is) the two 90-day prices (`config/index.ts:141-145`; `registerWithPayment.service.ts:412-413`).

### 5.2 What happens at payment (prod, since 8 Sep)
1. Wizard = 3 steps **Your details / Account creation / Payment** — no appointment step, no weight field; €89 buyers must tick the "does not guarantee medication" notice (audit row in `patient_acknowledgements` — **table not yet created on prod**, write is try/caught) (`BBMI_Change_Log.md:173-178, 186-191`). Button: "Pay €89 & join" / "Pay €399 & join" / "Pay €150 & join" (`register-pay-page.component.ts:240-243`). Copy under it: "You will book your appointments from your dashboard once you are signed up." (`.html:407`).
2. SetupIntent confirmed → Cognito `signUp` → `register-with-payment` saga in ONE DB transaction: patient enrichment, **no slot claim** (only if a slot token is present — the FE sends none: `planRequiresSlot()` returns `false`, `.ts:231-233`; BE `:583-591, 657-709`), charge (PI for €89/€399; subscription with inline `cancel_at` for €150×3, 3-D Secure re-entry supported), `subscriptions` row (`pi_` +1 yr for €89, +90 d for 90-day; `sub_` for instalments), `patient_addresses` row (`:958-990`).
3. Post-commit, log-and-continue: activity 2 active, activities 1/4/5/6/7(/8) unlocked, Cognito groups from `roles_products`, HubSpot lifecycle → `customer` + `payment_value` + funnel telemetry, buddy claim (`:1031-1071`).
4. Confirmation text: "Your payment is confirmed. Sign in and book your consultation from your dashboard." / "…your {plan} is active. Sign in to book your appointments from your dashboard." (`.ts:250-255`) → "Check your email" panel → `/verify` → `confirmSignUp` + auto sign-in (`.ts:732-742`).

### 5.3 What the portal must show first after sign-in
1. **Questionnaire gate** (app-wide for post-24-Aug sign-ups) — the pre-booking and pre-attending requirement; one short form; height/weight captured here (the "Current Height:/Current Weight:" bridge shipped 8 Sep, `BBMI_Change_Log.md:139`).
2. Dashboard with the `consult_paid` banner "Your consultation is paid — one step first" → after the survey, "You're ready to book" → the doctor calendar limited to the funnel roster; for 90-day buyers, the 90-day steps card with all 8 Book buttons and (for early payers) the "programme begins on" banner.
3. The pre-consult checklist (questionnaire + home address for the prescription).
4. Then `consult_booked` (date, Join) → doctor marks completed → `consult_done` → the €399/€150×3 chooser (`POST /tier-journey/checkout`, Stripe Checkout, `?checkout=success` poller + forced Cognito session refresh so the new groups reach the token without re-login, `memory/…poc.md:157`).

CRM contract to preserve (HubSpot contact properties written by the platform): `lifecyclestage`, `payment_value`, `bbmi_funnel_stage`, `bbmi_selected_slot`, `bbmi_appointment_datetime`, `bbmi_consult_completed_date`, `bbmi_no_show_date`, `bbmi_ninety_day_start_date` (= the Day-20 anchor), `bbmi_90_day_completion_status`, Stripe status mirror (`registerWithPayment.service.ts:287-296, 1062-1065`; `tierJourney.service.ts:677-678`; `payment.service.ts:684-688`; `ninetyDayCompletionSweeper.ts:14-15`). Index_4's CRM touchpoints (early-payer email, Day-20 welcome guide, Day-21 call exclusion, Day-80 call) all key off `bbmi_ninety_day_start_date` (`BBMI_90Day_Build_Spec.md:118-126`).

---

## 6. Live on prod vs QA-only vs planned (as of 2026-09-11)

| Item | Status | Evidence |
|---|---|---|
| €89 funnel (web + app), 5-doctor roster, 5-min slot hold | **prod** | `prod-backend-deployment.yaml:395-403, 428-429` |
| 90-day tier armed (both live prices, catalog + roles seeded) | **prod** since 15 Jul | `prod-backend-deployment.yaml:438-447` |
| Public 90-day sign-up links (`?plan=ninety-399/450/90-day`) | **prod** (`ENABLE_PUBLIC_90DAY='true'`, 24 Aug) | `:417-418`; change log `:186-191` |
| 8-step MDT dashboard, month windows, order rule, allocation cap, Day-20 anchor, 90-day replaces cooldown | **prod** (Jul 16/20, Aug 5, Sep 1/8 releases) | `activities.service.ts:365-410, 460-479, 1581-1723`; change log `:1872-1878` |
| Nine-stage machine incl. `ninety_day_overdue`, `legacy_lapsed` reason+date, `billingIssue`, 72 h grace, entitlement guard, kg/lbs | **prod** 8 Sep | `BBMI_Change_Log.md:129-150` |
| New journey: no booking at payment, questionnaire is the only booking gate, 90-day parity, medication tick | **prod** 8 Sep (FE `cd22a9d`) | change log `:144-149` |
| Survey gate app-wide block (from 2026-08-24) + join gate | **prod** | `prod-backend-deployment.yaml:411-412` |
| Attendance/payment join gate (`ATTENDANCE_GATE_ENFORCE_FROM`) | code on prod, **switch unset** → off; QA armed `2026-08-01` | prod manifest has no such key; `deploy/3-backend-deployment.tpl.yaml:122-123` |
| Finisher chooser €75/€150 (`ONGOING_*_PRICE_ID`) | code on prod, **dark** (no ids) → "Our team will be in touch"; QA needs a test €75 price too | prod manifest has no `ONGOING_*`; `membership-pricing.component.html:368-376` |
| No-show ≠ booked on the steps card | **qa only** (`61cf037`, 9 Sep) | FE `origin/qa` diff |
| Access-code box on /pricing | **qa only** (prod `*ngIf="false"`) | `membership-pricing.component.html:412-413` vs qa diff |
| Buddy programme, access codes backend | **dark on prod** | `config/index.ts:147-164`; QA template `:87-95` |
| `patient_acknowledgements` table | **missing on prod** (audit record lost, sign-up unaffected) | change log `:173-178` |
| `appoinment_intervals` rows for €89 / 90-day prices | **not on prod** (staged in `PROD_90day_catalog_seed.sql:41-49`, prod read found one row) | change log `:1986-1987`; `activities.service.ts:463` |
| Nurse booked-state on the steps card; Dublin-time display; earliest-date shown per step | **not built** | `ninety-day-steps.component.ts:141-146`; spec `:87` |
| ±7-day *latest* cap, MDT quota by 30-day blocks, HubSpot Day 5–7/Day 21/Day 80 workflows, prescription-renewal automation, ad-hoc session prices, in-app dunning email, grace period, reconciliation of Cognito vs DB | **planned / client-side / never built** | spec `:70`; `00_client…txt:1532-1596`; `BBMI_450_75_Config_Runbook.md:93-95` |
| Semble | **nothing** — every "Semble" in the map is served today by Cronofy + Daily.co + the BBMI DB | spec `:5`; `memory/project_bbmi_90day_booking.md:19` |

---

## 7. Recommendations — how the new portal should present the journey

1. **Keep the stage machine as the portal's single "what am I" call, but move its inputs to Semble.** Today it reads `subscriptions` + doctor `calendar_events` (`tierJourney.service.ts:164-174, 333-343`). In the new world the money facts still live in Stripe (keep `billingIssue`'s open-invoice model — pay the existing invoice, never a new checkout) and the clinical facts (booked/completed/no-show per role) come from Semble bookings. Preserve the nine stage names; the FE, HubSpot and staff labels already speak them.
2. **Render one checklist, in month bands, for the whole programme** — identity → questionnaire → M1 {Doctor, Dietitian, HC} → Day 5–7 (info) → M2 {Nurse, HC} → M3 {Doctor, Dietitian, HC} → Day 80 (info) → "choose how to continue". Show each step's **earliest bookable date** on the row (the spec's proposed endpoint, never built) so the window rule is explained before the patient opens a calendar, and show the allocation ("2 of 2 doctor reviews") so the cap is never a surprise.
3. **Make "booked" an allow-list** (`scheduled|rescheduled|completed`) from day one — the prod card still counts no-shows as booked (`61cf037` only on qa). Semble's booking statuses will need the same explicit mapping.
4. **Show the programme clock explicitly:** purchase date, "programme begins" (Day-20 anchor), day N of 90, ends-on, and — for €150×3 — the next instalment date. The Day-20 rule is invisible today except when it bites.
5. **Design the three money states as first-class screens** (paused programme / membership on hold / cancelled-ended) with the pay-open-invoice action and the practice-paused variant, and lock Book, Reschedule and Join consistently across dashboard, appointments page and deep links (the 4 Sep lesson: a locked dashboard alone was bypassable via /appointments). Decide with Art whether the client's promised 7-day grace becomes real (none exists today).
6. **Do not let the questionnaire gate become a wall for the installed base**: scope any mandatory step by sign-up date or plan, fail open on error, and always leave `/survey`, `/support`, `/pricing`, `/checkout`, email-verify reachable (`memory/project_bbmi_survey_gate.md:27-32`).
7. **Treat Nurse as a first-class role** (booking, booked state, allocation) — it exists on the backend and in Semble's staff model; the current FE half-built it.
8. **Present the €89 as "one consultation, 30-day prescription window, then upgrade"** — and enforce the single consult in the new portal (per-purchase allowance), closing the 2.5-month-cooldown leak, rather than carrying `appoinment_intervals` forward.
9. **The finisher chooser must be live before the first cohort's Day 80**; until then the copy is "Our team will be in touch". If Semble takes over billing for Ongoing Care, keep the *replace-groups-not-merge* rule when a €399 finisher starts a €75 plan (`payment.service.ts:662-677`).
10. **Keep the CRM property contract** (§5.3) or the Day-20/Day-80 HubSpot workflows silently stop.
11. **Recover `Index_4.html.html`** and diff it against §2–3 before UI sign-off; the copy in §3 is what shipped, not necessarily the map's final wording.

---

## Open questions

1. Where is `Index_4.html.html`? (Not on this PC; the spec and memory cite `Downloads`.) Does it change anything beyond the three recorded diffs?
2. Is the €150 legacy role set 6 or 8 groups (the prod `roles_products` row was never read)? The 90-day rows clone whatever it is.
3. Grace period on a failed 90-day instalment: keep the platform's instant cut-off, or build the client's 7-day / 14-day policy (`00_client…txt:552-558`)? Where does the dunning email come from (Stripe's own, HubSpot, or the portal)?
4. Stripe dunning "after final retry" setting on the live account — leave past_due (self-healing by card update) or cancel (mid-programme cancel → `none` → €89 re-offer)?
5. Will Semble own bookings *and* entitlements, or only bookings? The month-window and allocation logic must live wherever the calendar is (today: `availability.service.ts` + `calendar.service.ts`).
6. "Months" for the 90-day windows: the app's fractional-month math or Art's 30-day blocks (D0–29/30–59/60–89)?
7. Should the ±7-day *latest* window and the "same week as the M1 doctor" dietitian rule (`00_client…txt:1646-1651`) be enforced, or stay advisory?
8. Ongoing Care's "async dietitian/coach support (48 h)" — which system carries it (Semble messaging? HubSpot?) since the €75 plan grants no dietician/coach group?
9. Ad-hoc sessions (€80/€50/€60/€40): build now (Semble booking + Stripe per-session) or defer with Phase 3?
10. `patient_acknowledgements` DDL on prod, the €75 test price for QA, and the prod Tally form id for the approved questionnaire (`BBMI_Change_Log.md:227-246`) — all still owed by Art.
11. Does the €399 finisher's 6-group entitlement persisting until a new subscription (no Stripe object to strip) matter once Semble gates clinical access?

---

## Appendix A — prod configuration the portal inherits (`prod-backend-deployment.yaml`, `origin/master`)
`ENABLE_COMBINED_REGISTRATION='true'` (:395) · `ENABLE_PUBLIC_BOOKING='true'` (:397) · `SLOT_HOLD_MINUTES='5'` (:402) · `SURVEY_GATE_ENFORCE_FROM='2026-08-24'` (:411) · `ENABLE_PUBLIC_90DAY='true'` (:417) · `E89_PRICE_ID='price_1TeAOyBeNn0x9hADPv5xvJOv'` (:422) · `E89_DOCTOR_ID`= 5 doctor ids (:428) · `ADDITIONAL_INTAKE_SURVEY_FORM_IDS='NpQ8Kl'` (:436) · `NINETY_DAY_PRICE_IDS='price_1ToQY1BeNn0x9hADjJcp7Zj9,price_1ToQY1BeNn0x9hADyoJUoTcv'` (:442) · `NINETY_450_PRICE_ID` / `NINETY_399_PRICE_ID` (:444-447) · `MEMBERSHIP_PLAN_PRICE_IDS='price_1LVzFgBeNn0x9hADr8olz7VQ'` (:452). Absent (defaults): `NINETY_DAY_DAY20_FROM` (=2026-07-21), `ONGOING_150_PRICE_ID`, `ONGOING_75_PRICE_ID`, `ATTENDANCE_GATE_ENFORCE_FROM`, `ENABLE_BUDDY_PROGRAMME`, `ENABLE_ACCESS_CODES`, `E89_PRESCRIPTION_VALID_DAYS` (=30). FE prod: `E89_SURVEY_PATH='surv'`, live price ids (`environment.prod.ts:23-31`).

## Appendix B — endpoints and shapes the FE consumes today
`GET /api/v1/user/tier-journey/status` → `ITierStatus` (`tierJourney.service.ts:46-99`); `POST /api/v1/user/tier-journey/checkout {tier: e89|ninety_450|ninety_399|ongoing_150|ongoing_75, accessCode?}` (`tierJourney.dto.ts:4-17`); timeline payload = `patient_activities` indexed 1..8 (2 = payment, 3 = identity, 4 = survey, 5 = HC, 6 = Doctor, 7 = Dietician, 8 = Nurse) (`activities.service.ts:1410, 1725-1738`); booking eligibility reasons incl. `programme_allocation_used` with `allocationAllowed/allocationUsed` (`activities.service.ts:987-1003, 1083-1103`); `GET /api/v1/user/survey-gate` → `{submitted, required}`; `GET /api/v1/user/payemnts/plans` (typo is real) for the legacy plan card.
