# 01 — The current patient web app: feature inventory and the patient's day-to-day experience

**Research slice for the new Semble-backed patient portal.** Written 2026-09-11.

**Sources and provenance.** Every code fact below was read from the deployed branches of `beyondbmi-front-end`, not the local working tree:
- `origin/master` = **production** (`cd22a9d`, 8 Sep 2026 — "being signed out is not the same as having no membership"). All `file:line` cites are against this commit unless marked `qa`.
- `origin/qa` = `61cf037`, 9 Sep; only **6 files** ahead of master (pipeline failure alarm, `ninety-day-steps` allow-list of booked statuses, access-code box un-hidden on /pricing, `E89_SURVEY_PATH` set to `"surv"` on QA, ReferralHero snippet removed from `index.html`).
- The local checkout sits on feature branch `port/signin-qa` (72 files off qa) and was **not** used.
- KB doc `Workspace/BBMI_System_Knowledge_Base/04a_Frontend_Patient.md` was read in full. It dates from June and **pre-dates** the €89 funnel, `/sign-up`, the tier-journey stages, the 90-day card, the survey block and the entitlement guards. Where this document and 04a disagree, this document is current. 04a remains correct on stack, auth internals, HTTP layer, build/deploy and the orphaned modules.

Paths are relative to `C:/Users/Admin/Desktop/Work/Projects/Clients/Beyond BMI/code/beyondbmi-front-end/`.

---

## TL;DR

1. The app is an **Angular 14 / Vuexy admin-theme SPA** on S3, authenticated by **Cognito via Amplify**, talking to the Node monolith at `bend.beyondbmi.ie` (`environment.prod.ts:16`). Nothing in it is Semble-aware.
2. Since June it has grown a **second front door**: `/sign-up` is a 3-step wizard (details → account → inline Stripe Payment Element) that creates the Cognito user and charges €89 / €399 / 3×€150 in one atomic backend call (`register-pay-page.component.ts:736-901`). The old `/qualify` → `/register` → `/pricing` path still exists for legacy members.
3. The patient's world is governed by a **server-derived "tier stage"** (`tier-journey.service.ts:7-15`): `none | consult_paid | consult_booked | consult_done | ninety_day_active | ninety_day_overdue | ninety_day_completed | legacy_member | legacy_lapsed`. The dashboard, /pricing, the Appointments page and two route guards all branch on it.
4. **Six guards** sit between login and any page: `AuthGuard`, `MembershipGuard` (Cognito groups = paywall), `SurveyBlockGuard` (app-wide hold at the questionnaire), `EntitlementGuard` (lapsed/overdue → dashboard), `IntakeSurveyGuard` (no booking/joining without the questionnaire), `HcQualitySurveyGuard`. All Cognito-backed guards are wrapped in a 12 s deadline because unsettled promises produced the recurring "white screen" (`guard-deadline.ts:34`).
5. Day-to-day the patient does five things: **log weight** (weekly, mandatory modal), **see the next step** (journey banner / timeline / 90-day card), **book / reschedule / cancel / join** video calls (Cronofy picker + Daily.co), **send a prescription to a pharmacy** (ROI Healthmail email or NI SignatureRX), and **read back their questionnaire**. Support is a `mailto:` link.
6. Legacy/dead surface is large: blood pressure card (removed), lab results / order tracking / activation kit (orphaned blood-test product), `content` and `account-profile` shells ("works!" placeholders), web push (token discarded), GetStream key, HubSpot meeting iframes on /qualify, the €150 legacy plan card.
7. **Every gate the new portal must honour is a server rule** (survey scope, entitlement, booking windows, weight staleness, 2 h cancellation). The Angular app only mirrors them; that is the correct posture to keep when Semble becomes the system of record.

---

## 1. The guard stack (read this before the screen table)

Root route wiring: `src/app/app.module.ts:30-143`. Every authenticated module is loaded under `canActivate: [AuthGuard, MembershipGuard, SurveyBlockGuard]` + `canActivateChild: [SurveyBlockGuard]` except: `survey` (Auth+Membership only — it is the way out of the block), `memberships`/`/pricing` (Auth only — paywall must be reachable), `support` and `account-profile` (no survey block; `/account-email-verify` is deliberately un-blocked because it consumes a one-time email link, `account-profile-routing.module.ts:16-22`).

| Guard | What it checks | Fail → | Evidence |
|---|---|---|---|
| `AuthGuard` | `Auth.currentAuthenticatedUser({bypassCache:true})`; optional `data.roles` must be in `cognito:groups` (`survey`, `prescription`) | `/login?targetUrl=…`; role miss → `/dashboard` + toast | `auth.guard.ts:53`; `survey-routing.module.ts:17`; `prescription-routing.module.ts:24` |
| `NoAuthGuard` (`canMatch`+`canActivate`) | Logged-in users skipped past auth + sign-up routes | `/dashboard` | `app.module.ts:45-46, 53-54` |
| `MembershipGuard` (**the paywall**) | Any `cognito:groups`; for `/appointments/booking/{doctor\|health-coach\|dietician\|nurse}` the matching group; one silent `refreshSession` (5 s cap) if groups missing; `/appointments/join/*` always allowed | `/pricing` + toast "We couldn't confirm an active membership"; not-authenticated → `/login?targetUrl` | `membership.guard.ts:40, ~107, 143, 157` |
| `SurveyBlockGuard` (BBMI-816) | `GET api/v1/user/survey-gate` → `{submitted, required}`; server decides scope (sign-ups after `SURVEY_GATE_ENFORCE_FROM`) | modal "Health Questionnaire Request" → `/survey`; cold load goes straight to `/survey` | `survey-block.guard.ts:40`; `survey-gate.service.ts:142, 180`; `survey.service.ts:39` |
| `EntitlementGuard` (4 Sep) | `GET tier-journey/status`; blocks `ninety_day_overdue` (booking+join) and `legacy_lapsed` (booking; join only on hard lapse); 8 s timeout, **fails open** | `/dashboard` + toast | `entitlement.guard.ts:28, 58, 83`; `appointment-routing.module.ts:47, 72, 92` |
| `IntakeSurveyGuard` (BBMI-813) | `GET survey-info` false → prompt; contexts `booking` / `join`; fails open | modal → `/survey`, or back to `/appointments` | `intake-survey.guard.ts:27`; `survey-gate.service.ts:32` |
| `HcQualitySurveyGuard` | `GET survey/health-coach-survey` `{show, survey}` before health-coach booking | first/repeatable HC Tally survey | `hc-quality-survey.guard.ts:45` |
| `EssAndEq5dGuard` | `GET survey/ess-eq5d` — **no longer on the booking route** (Dr Alvin, 2 Sep: one questionnaire only); route kept reachable | — | `ess-and-eq5d.guard.ts:34`; `appointment-routing.module.ts:35-46` |
| `LeaveVideoCallGuard` | `canDeactivate` prompts only when a call frame exists | confirm | `video.component.ts:64` |

Guard order on the doctor booking route is deliberate: `AuthGuard → EntitlementGuard → IntakeSurveyGuard → HcQualitySurveyGuard` so a lapsed member is not walked through the questionnaire towards a booking the server will 402 (`appointment-routing.module.ts:32-47`).

---

## 2. Screen-by-screen inventory

### 2a. Logged-out / acquisition

| Route | Purpose | Patient sees / does | Backend | Notes |
|---|---|---|---|---|
| `/qualify` | BMI qualification | Tally `qualify` form in an **iframe** (`qualify-survey.component.html:16`); on `Tally.FormSubmitted` payload → `localStorage.form` (`.ts:26`). Then a dark "Your Personalised Plan" page: testimonial, **HubSpot meeting iframe** `meetings-eu1.hubspot.com/beyondbmi/test-care-coordinator-` (`.html:44`), the **€89 "Meet your obesity specialist" offer card** (was-€200, Trustpilot 4.8, `specialist-offer-card.component.html:61-77`) whose CTA reveals the in-page slot picker; picking a slot → `/sign-up?plan=onboarding-89&slot&ref&src=web` (`.ts:167`) | none (client-side BMI); `GET hubspot/check-existing-user/{email}` in the `/register` resolver (`qualify-survey.service.ts:61`) | Cookie-wall rescue banner because Tally lives on tally.so. Prefill of the wizard from qualify answers: `qualify-prefill.service.ts:25`. |
| `/sign-up` (`?plan=onboarding-89 \| ninety-399 \| ninety-450 \| 90-day`, `?access=CODE`, `?slot&ref`, UTM/gclid/fbclid) | **Single-page register + pay** (BBMI-610/817) | Standalone auth card, no chrome. `90-day` key shows a chooser (€399 upfront vs 3×€150, `plan-catalog.ts:36-62`). Then numbered steps: **Your details** (name, personal email — work domains rejected, +353/+44/+1 mobile, address/city/county/Eircode, DOB ≥18, gender, marketing consent, 18+ declaration `.ts:389`) → **Account** (optional username, Cognito-policy password with rules stated up front) → **Payment** (Stripe **Payment Element inline**, deferred `mode:"setup"` `.ts:114`; €89-only "does not guarantee medication" notice + tick `.html:334`, `.ts:385`; Terms tick gates Pay). Right column: order summary card. After success: "Check your email" panel with 30 s-cooldown resend (`.html:420`). Back-navigation to completed steps allowed (7 Sep). | `POST auth/check-email-available` (`register-pay.service.ts:47`) → `POST auth/lead-capture` (HubSpot lead before payment, `:76`) → `POST auth/registration-intent` (`:67`) → `stripe.confirmSetup` → `Auth.signUp(autoSignIn)` (`.ts:744`) → `POST auth/register-with-payment` (`:71`), with a 3-D Secure re-entry path (`.ts:809`). Slot machinery: `GET public/availability?month=`, `POST public/hold-slot` (`:34, 43`) — **inert since 31 Aug**: `planRequiresSlot()` returns `false` (`.ts:231`), nothing is booked at payment. | Draft persisted in `localStorage["sign-up-draft"]` for 24 h, passwords stripped (`register-pay-draft.service.ts:14`). GTM `dataLayer` events mirror the website widget (`funnel-analytics.service.ts`). Prices are env-driven Stripe price ids (`environment.prod.ts:28-31`). |
| `/register` | Legacy sign-up | Prefilled from `localStorage.form` / query params; password min 6 (`register.component.ts:49`) — weaker than Cognito's real policy; → `/register-thank-you` (`:167`) | Cognito `Auth.signUp` | Still the "Create an account" link from `/login`. |
| `/login` | Sign in | Email + password; Cognito error codes translated to patient copy (`login.component.ts:137`); unconfirmed users get a "send the verification email again" link keyed on the error **code** | Cognito `Auth.signIn` → `GET api/v1/user` | If the profile fetch fails the session is kept and the patient is sent to `/pricing` (lapsed-member fix, `auth.service.ts:242`). |
| `/verify?email&accessCode` | Email confirmation link | Auto-confirms and shows "confirmed"; `+` in emails repaired | Cognito `confirmSignUp` (`verify.component.ts:33`) | autoSignIn is enabled at sign-up so the session can resume here. |
| `/forgot-password`, `/reset-password` | Password reset | Code-based reset | Cognito | — |
| `/sso-bridge#access_token&id_token&return_to` | Token hand-off from another surface | Writes Cognito tokens straight into `localStorage` under Amplify's keys (`sso-bridge.component.ts:64`), strips the fragment, navigates to `return_to` | none | No guard; [INFERRED] used by the staff portal / test tooling to impersonate a session. |
| `/qa-test-links` | Tester helper | Lists public €89 slots and mints `/sign-up` links; **redirects home on production builds** (`qa-test-links.component.ts:151`) | `GET public/availability?date=` | — |

### 2b. Core authenticated screens

| Route | Purpose | Patient sees / does | Backend | Guards |
|---|---|---|---|---|
| `/dashboard` | Home | See §4. Pre-consult checklist modal, journey banner, **either** the 90-day MDT card **or** the legacy timeline, Weight tracker, Weight History chart. Mandatory weekly weight modal (`dashboard.component.ts:130, 154`). | `tier-journey/status`, `activities`, `survey-info`, `measurements/weights/last`, `measurements/history`, `identity/session`, `customer-portal-session`, `address` | Auth, Membership, SurveyBlock |
| `/appointments` | Appointment list | `ngx-datatable` (`appointments.component.html:30`): role, status badge, start, **Join Call** (until `end`), **Reschedule**, **Cancel** (≥2 h before start, SweetAlert confirm, `appointments.component.ts:141`), **Book Again** after `noshow`/`cancelled-rescheduling` (`:79`). "Book appointment" goes to the doctor for consult-stage patients, health-coach for members (`:120`). Lapsed/paused/payment-paused → red banner, all booking entry points hidden. | `GET events` (resolver), `DELETE events/{id}` (`appointments.service.ts:39`), `activities`, `tier-journey/status` | Auth, Membership, SurveyBlock |
| `/appointments/booking/:role` (`doctor`, `health-coach`, `dietician`, `nurse`) | Book | "Checking your booking eligibility…" then **Cronofy Elements DateTimePicker** (`staff-availability.component.ts:305`, `data_center:"uk"`, window now+2 h → +6 months `:251`) beside an **"Anyone / named clinician"** picker (`staff.component.html:7`). Eligibility banners: `2_week_treatment_delay`, `tier_cooldown`, `weight_stale` (non-blocking), `programme_allocation_used` (hides the calendar) (`.html:20, 36, 55, 78`). Dietician < 14 days after account creation → custom "we recommend ~2 weeks after starting medication" confirm (`.ts:375`). Success card "An invitation has been emailed to you". | `GET availabilities/{role}` (Cronofy `element_token` + members), `GET medical-staff/{role}`, `GET booking-eligibility/{role}` (`availability.service.ts:107`), `POST events/{role}` | Auth, Entitlement, IntakeSurvey, HcQualitySurvey (+ Membership group check upstream) |
| `/appointments/reschedule/:role/:eventId` | Reschedule | Same picker, `?excludeEventId`, previous clinician preselected | `GET events/reschedule/{id}`, `PUT events/{id}` | Auth, Entitlement |
| `/appointments/join/:room` | Video call | "Room will be available 5 minutes before starting time" (`video.component.html:7`); Daily.co prebuilt frame (`video.component.ts:153`) with themed colours; connecting overlay, camera/mic error overlay with Retry + Daily help link; token fetched by the component (not a resolver) so failures render in front of the patient | `GET appointments/{room}` → Daily token | Entitlement (join), IntakeSurvey (join); MembershipGuard explicitly bypassed |
| `/appointments/survey/ess-and-eq5d`, `/first-health-coach-survey`, `/repeatable-health-coach-survey` | Clinical instruments | Tally iframe via the shared wrapper (`?patient_id=`, `tally-survey-wrapper.component.ts:62`) | — | Ess/HC guards |
| `/survey` | Intake questionnaire | Banner explaining why they were sent here (join / booking / app-wide), then the Tally form; cohort decides slug: legacy members → long `survey`, everyone else → `E89_SURVEY_PATH` (`"surv"` on prod, `environment.prod.ts:23`; `survey-tally.component.ts:45`). On `Tally.FormSubmitted` the page **polls `survey-info` 3× at 3 s** (`survey.component.ts:25`) then "Thank you for submitting the survey" + Continue (`.html:35`). | `GET survey-info` (`survey.service.ts:24`) | Auth + `roles: survey` |
| `/health-records` | Read back answers | Sections of question → answer badges; "You have to complete survey first" empty state (`health-records.component.html:46`) | `GET health-records` | Auth, Membership, SurveyBlock |
| `/prescriptions` | Prescription list | Table: #id, prescribed by, created, status ("Prescription has been sent" / "Incorrect email address"); eye icon lazy-loads medications + instructions inline (`prescription.component.ts:51`); **Send to Pharmacy** for `draft`/`error` rows; actions column frozen right for mobile (`.html:83, 88`) | `GET prescriptions`, `GET prescriptions/{id}` | Auth, Membership, SurveyBlock |
| `/prescriptions/send/:id` | Dispatch to pharmacy | Three methods (`send-email.component.ts:47`): **Collection** (ROI Healthmail address typed + validated live, or NI McNallys/Corrys addresses), **Delivery (from Ire)** = Pure Pharmacy Bray Healthmail (`:45`, €3 delivery copy), **Delivery (from N.Ire)** = SignatureRX pharmacy dropdown. Success page. | `GET prescriptions/validate-pharmacy-email?email=` (`prescriptions-send-email.service.ts:35`), `POST prescriptions/mail/send` (`:28`), `GET prescriptions/pharmacies/search`, `POST prescriptions/signaturerx/send` (`:48`) | Auth + `roles: prescription` |
| `/pricing` | Tier journey / paywall | Legacy stages → old single "Pricing Plans" card (€/month, Stripe Checkout redirect `membership-checkout.component.ts:26`) or a **"payment failed" card with Stripe's hosted-invoice link** (never a new checkout). New stages → "Your Beyond BMI Journey" 3-step stepper: €89 consult → doctor appointment → 90-day (3×€150 or €399 "Save €51", `.html:150, 289`); `ninety_day_completed` → €75 Ongoing Care / €150 Full Membership chooser (`:333`). Back from Stripe `?checkout=success` polls status 10× at 3 s and force-refreshes the Cognito session so new groups land (`membership-pricing.component.ts:64, 254`). Access-code box hidden on prod (`.html:413`), shown on qa. | `GET tier-journey/status` (`tier-journey.service.ts:90`), `POST tier-journey/checkout {tier, accessCode?}` (`:101`), `POST customer-portal-session` (`membership.service.ts:19`), `GET payemnts/plans` (`:40`) | Auth only |
| `/checkout/success` | Static "Membership Created" | Back to dashboard | none | none |
| `/support` | Support | **No form.** A card: "We're here to help", urgent-symptoms notice, `mailto:support@beyondbmi.ie?subject=Support Request` (`support.component.html:13`). The email-form component + `POST api/v1/user/email/` still exist in code but the template does not render the form (`support.component.ts:55`, `support.service.ts:13`). | — | Auth, Membership |
| `/personal-information` ("My Details" in the avatar menu, `navbar.component.html:42`) | Read-only profile | DOB, phone, email, address, gender, ethnicity, occupation, GP name/email (`personal-information.component.html:62, 76`). **No edit.** | `GET personal-information` | Auth, Membership, SurveyBlock |
| `/account-email-verify` | Resend verification code | Submit handler is commented out (`verify-email.component.ts:56`); only resend works. The layout's "Action required: verify your email" alert is commented out (`vertical-layout.component.html:16`). | Cognito resend | Auth, Membership |
| `/knowledge-base` | Help | One button → Zendesk help centre in a new tab (`knowledge-base.component.ts:15`). **Not in the menu.** | — | Auth, Membership, SurveyBlock |
| `/account-profile`, `/content` | Shells | Render "account-profile works!" / "content works!" (`account-profile.component.html:1`, `content.component.html:1`) | — | — |
| Community (menu item) | External | `https://community.beyondbmi.ie?automatic_login=true`, new tab (`menu.ts:44-53`) | — | — |

Sidebar menu is exactly six items: Dashboard, Health Records, Support, Appointments, Prescriptions, Community (`src/app/menu/menu.ts:3-54`). The navbar has the logo, the patient's initials/name, "My Details" and "Logout" (`navbar.component.html:42-44`). Logout is `Auth.signOut({global:true})` + `localStorage.clear()` (`auth.service.ts:374`).

### 2c. Third-party surfaces the patient actually touches

Tally (3 iframes: qualify, intake, HC/ESS surveys), HubSpot meetings iframe (`/qualify` only), Stripe (Payment Element on `/sign-up`; hosted Checkout, hosted invoice and Customer Portal from `/pricing` and the dashboard), Cronofy Elements (booking), Daily.co (video), Sumsub Web SDK (identity modal, `sumsub.component.ts:63`), Zendesk (link), Circle-style community (link). Page-level trackers in `index.html`: GTM, Google Ads `AW-11120362708` (`:44`), FigPii (`:40`), HubSpot chat loader (`:78`, `loadImmediately:false`), ReferralHero (`:89`, removed on qa).

---

## 3. The end-to-end journey, gate by gate

### Tier stages (the spine)
`tier-journey.service.ts:7-15`. The stage is **always computed server-side**; the FE never decides eligibility. Consumers: `DashboardComponent`, `JourneyBannerComponent`, `TimelineComponent`, `PreConsultChecklistComponent`, `NinetyDayStepsComponent` (via parent), `AppointmentsComponent`, `SurveyTallyComponent`, `MembershipPricingComponent`, `EntitlementGuard`.

### Journey A — new €89 patient (the funnel Art specified: pay → verify → sign in → questionnaire → book)
1. `/qualify` (Tally, optional) or a marketing link → `/sign-up?plan=onboarding-89`.
2. Wizard: details (email availability gate + HubSpot lead) → account → pay. Backend creates Cognito user + patient + PaymentIntent atomically; **no appointment is reserved** (`register-pay-page.component.ts:215-231`).
3. "Check your email" → `/verify` link → `/login`.
4. First navigation: `SurveyBlockGuard` asks `survey-gate`; a post-cutoff patient is **held at `/survey`** (cold load goes straight there, `survey-gate.service.ts:180`). Stage `consult_paid`; dashboard would show the journey banner "Your consultation is paid — one step first" and the pre-consult checklist (questionnaire + home address, `pre-consult-checklist.component.ts:67, 78, 138`).
5. Questionnaire submitted → poll → "Continue" → dashboard banner "You're ready to book" → `/appointments/booking/doctor` (Entitlement → IntakeSurvey → HcQuality guards) → Cronofy → `POST events/doctor`. Stage `consult_booked`; banner shows the date; checklist becomes **mandatory** if the questionnaire is still missing but **hides entirely from T-60 min to T+120 min** so it can never cover Join Call.
6. Join from the dashboard timeline (button enabled from 5 min before start, `timeline.component.ts:193`), the Appointments page or the upcoming-events widget → `/appointments/join/:room` (IntakeSurvey join-gate, backend token gate).
7. Doctor marks the visit complete → stage `consult_done` → banner "Consultation complete — see your 90-day options" → `/pricing` chooser → Stripe Checkout → `?checkout=success` polling → groups refreshed → stage `ninety_day_active`.

### Journey B — direct 90-day buyer
`/sign-up?plan=90-day` (chooser) or `ninety-399` / `ninety-450` (tagged channel `sales`, `register-pay-page.component.ts:287-294`). Same wizard minus the medication tick. Lands as `ninety_day_active` with the Day-20 policy: programme begins `max(purchase, consult+20d)`, calendars clamped server-side, dashboard shows "Your programme begins on …" (`ninety-day-steps.component.html:4-9`). One questionnaire (the short one) applies to them too since 7 Sep.

### Journey C — legacy €150 member (~150 people)
Stage `legacy_member`. Dashboard shows the **legacy timeline** (Payment / Identity Verification / Health Survey / Doctor / Health Coach / Dietician rows, `timeline.component.html:56-244`). They keep the long intake form, the HC quality survey gate, weight-staleness and cooldown banners, `/pricing` shows the old single plan card + "Manage Subscription" (Stripe portal). ESS/EQ-5D is no longer compulsory for them either.

### Journey D — lapsed / overdue
- `legacy_lapsed` (cancelled, ended, practice-paused, or renewal failed): journey banner says **what** happened and offers pay-open-invoice / update card / continue via `/pricing` (`journey-banner.component.html:175`); timeline buttons locked (`timeline.component.ts:86`); Appointments page shows a red banner and hides Book/Reschedule/Join; `EntitlementGuard` refuses booking, and joining on a hard lapse. `MembershipGuard` still admits them because they keep the `community` group.
- `ninety_day_overdue`: the 90-day card stays visible with a "Paused" badge and every Book locked; banner "Pay instalment and resume" links Stripe's hosted invoice — never a new checkout (`journey-banner.component.html:102`).
- `ninety_day_completed`: banner + `/pricing` chooser (€75 / €150).

### Cross-cutting rules the patient feels
- Weight: mandatory modal when no weight in the last 7 days and `settings.weightTracker` is on; "Enter weight" is the only option (`dashboard.component.ts:154`); 50–400 kg bounds (`weight-tracker.component.ts:31`); unit preference persisted (`:114`); once logged, "You can input your weight again on {date}" (`weight-tracker.component.html:46`). "Don't ask me again" PUTs `settings/single-update`, a route that is not registered on the backend (`weight-tracker-modal.component.html:22`, `weight-tracker.service.ts:27`).
- Identity: Sumsub modal from the timeline / 90-day card; statuses `submitted|approved|review|onHold` count as done (`verify-identity.service.ts`).
- Address: the funnel never collected it before the checklist; now collected at sign-up **and** patchable from the checklist (`POST address`).
- Cancellation: patient may cancel any upcoming appointment up to 2 h before start; backend frees the slot and resets the activity so they can rebook.

---

## 4. Dashboard information architecture

`dashboard.component.html:1-68`, two columns on `lg`:

```
[modal] Pre-consultation checklist   (consult_paid / consult_booked only; questionnaire + address)   :7
[full ] Journey banner               (consult_*, ninety_day_*, legacy_lapsed; nothing for none/legacy_member) :8
[left ] EITHER "Hi {name} — your 90-day programme" card → <app-ninety-day-steps>  (ninety_day_active|overdue) :15-25
        OR     "Hi {name} — here's your journey"     card → <app-timeline>          (everyone else)           :27-42
        (Blood-pressure card removed 15 Jul 2026)                                                             :43
[right] "Weight tracker" card → <app-weight-tracker>                                                         :46-53
        "Weight History" card + "Update last weight" button → <app-patient-chart>                            :54-62
```

- **Timeline** (`timeline.component.html`): rows keyed by `activities[n]` from `GET api/v1/user/activities` — `[2]` payment, `[3]` identity, `[4]` survey, `[5]` health coach, `[6]` doctor, `[7]` dietician. Each appointment row shows Book Call / Scheduled for … + Reschedule + Join Call (5-min window, "Expired" after end) / Completed / "Next appointment will be able {relative time}". Consult-stage patients get "€89 consultation" instead of "Membership Active", no HC/dietician rows, and no Book button after `consult_done` (`timeline.component.ts:58-90`).
- **90-day card** (`ninety-day-steps.component.ts:111-131`): Verify identity + Complete health survey gates, then the fixed MDT schedule — Doctor initial (M1), Dietitian initial (M1), Health Coach 1 (M1), Day 5–7 team call (info), Nurse check-in (M2), Health Coach 2 (M2), Doctor final (M3), Dietitian follow-up (M3), Health Coach 3 (M3), Day 80 review call (info). Booked-state derived from the same activities payload (`roleActivityIndex` doctor 6 / HC 5 / dietician 7, `:142`); occurrence N unlocks after N−1 booked (`:238`); events before `programmeStart` ignored. On master a cancelled event is the only excluded status (`:257`); **qa fixes this to an allow-list** (`scheduled|rescheduled|completed`) because a no-show still counted as booked.
- **Weight chart** (`patient-chart.component.ts:47`): chart.js line of `measurements/history` with % change and total change tiles; empty state "No weight recorded yet" (`.html:45`).
- **Not rendered anywhere on the dashboard** although declared in the module: `upcoming-events` ("Join Call" list, `.html:32`), `recent-lab-result` ("Explore New Test", links `/lab-result/{id}` which has no route, `.html:37`), `order-tracking`, `blood-pressure`.

Data dependencies of one dashboard load: `tier-journey/status` (×3 — dashboard, banner, timeline each call it), `activities` (×1–2), `survey-info`, `measurements/weights/last`, `measurements/history`, plus `api/v1/user` from the auth service. There is no shared cache; each widget subscribes independently.

---

## 5. Core value vs legacy / dead

| Feature | Verdict | Why |
|---|---|---|
| Sign-up + pay in one page (inline Stripe, 3DS, resume-after-refresh, email-taken guidance) | **Keep — core** | This is the acquisition funnel; three weeks of incident-driven hardening are encoded in it. |
| Tier-stage-driven "what's next" (banner / stepper) | **Keep — core** | The single most useful thing a patient sees; replaces reading a timeline. |
| Intake questionnaire gate (app-wide hold + join gate) | **Keep — core (clinical)** | Dr Alvin: no consultation without the intake answers. Server-scoped. |
| Booking with eligibility rules (windows, cooldown, allocation, weight staleness) | **Keep — core** | Rules live server-side; the FE just explains them. |
| Video join with resilient token fetch + device-error help | **Keep — core** | First-call incident (5 Aug) made this load-bearing. |
| Cancel ≥2 h / reschedule / rebook after no-show | **Keep** | Ops-driven, recent. |
| Weight tracker (weekly, mandatory) + chart | **Keep** | Clinical signal used by the weight-staleness booking gate. |
| Prescription list + send-to-pharmacy (ROI Healthmail / Pure / NI SignatureRX) | **Keep — but redesign against Semble prescribing** | The dispatch paths are BBMI-specific pharmacy logistics, not a Semble concern. |
| Health records read-back | **Keep (simplify)** | Patients expect to see what they submitted. |
| Lapsed / overdue handling (pay open invoice, never re-checkout) | **Keep** | Billing correctness; hard-won. |
| Identity verification (Sumsub) | **Keep — decision needed** | Required for GLP-1 prescribing; stays outside Semble. |
| Stripe Customer Portal link | **Keep** | Self-serve card/invoice management. |
| Legacy timeline (activities[2..7]) | **Replace** | Tier-unaware; only exists because ~150 legacy members are not on the new journey. |
| `/qualify` Tally + HubSpot meeting iframes | **Drop from the portal** | Pre-sale; belongs on the website. HubSpot callback calendar is a separate concern (see memory `reference_bbmi_qualify_callback_calendar`). |
| `/register` legacy form | **Drop** | Superseded by `/sign-up`; weaker validation. |
| `/pricing` legacy €150 plan card, `payemnts/plans` | **Drop/absorb** | Only for `legacy_member`. |
| Support page | **Rebuild** | It is a mailto link. |
| `/personal-information` | **Rebuild as editable profile** | Read-only, no password change, no contact update. |
| `account-profile`, `content`, `knowledge-base` | **Drop** | Placeholders / a single external link. |
| Blood pressure, lab results, order tracking, activation kit, `video` module, `questionnaire` module | **Drop** | Removed or orphaned blood-test product. |
| Web push (FCM), GetStream key, Veriff SDK, Typeform embed | **Drop** | Dead. |
| ESS/EQ-5D + HC quality surveys | **Decision needed** | No longer compulsory for doctors; HC gate untouched by Art's instruction. |
| `/sso-bridge`, `/qa-test-links` | **Tooling only** | Keep an equivalent for support impersonation if wanted. |

---

## 6. UX pain points visible in the code

1. **Admin-template chrome for a patient product.** Vuexy vertical menu, navbar, `ngx-datatable` tables with "Show 10/25/50 entries" (`appointments.component.html:76-88`, `prescription.component.html:105-117`), Bootstrap 4 cards everywhere; `app-config.ts:21` still points at the theme's logo path. Auth pages hide the chrome per component (`login.component.ts`, `register-pay-page.component.ts:164-173`). The footer is switched off globally (`app-config.ts:41`), which is the only reason its "Blood Brothers" link (`footer.component.html:5`) is invisible.
2. **Three separate iframes for questionnaires** (Tally) with a `patient_id` hidden field and a `window.message` listener; completion is detected by **polling `survey-info` three times** because the Tally webhook is asynchronous (`survey.component.ts:25`). Cookie-blocking browsers get a grey wall (`qualify-survey.component.html:2-15`).
3. **Guard-driven redirects instead of UI states.** Being lapsed, un-surveyed or un-provisioned is expressed as bounces (`/pricing`, `/survey`, `/dashboard`) with toasts. The code comments record the consequences: white screens (four separate fixes, `guard-deadline.ts:1-33`), a lapsed member parked on the sign-in page (`app.module.ts:172-185`), a patient sent to /pricing with her appointment link lost (`membership.guard.ts:63-75`).
4. **Paywall = Cognito group membership**, which arrives by webhook; the FE compensates with silent token refreshes and 10×3 s polling on `/pricing` (`membership-pricing.component.ts:64`). A cancelled member keeps `community`, so the paywall admits them and a second guard had to be built.
5. **Two dashboards in one** (timeline vs 90-day card) and **three consumers each fetching `tier-journey/status`**; no shared state.
6. **Booking calendar is Cronofy's widget**, restyled via a colour map (`staff-availability.component.ts:325-334`), with heavy `console.log` debug left in production paths (`:213-262`). The eligibility check is a separate round trip that gates rendering ("Checking your booking eligibility…").
7. **Join Call window logic is client-side** (5 min before start, until end) and duplicated in the timeline and the list.
8. **Prescription dispatch is prose-heavy**: pharmacy instructions, Pure Pharmacy contact details and delivery pricing are hardcoded in the template (`send-email.component.html:105-120`); placeholder pharmacy lists still exist in code (`send-email.component.ts:210`).
9. **Support is a mailto**; the email-form component is dead weight behind it.
10. **No profile editing, no password change while logged in, no email/phone change**; the email-verify page's submit is commented out (`verify-email.component.ts:56`).
11. **Global interceptor toasts** on 400/402/403/404/409/500 (`error.interceptor.ts:49-51`) mean errors surface as generic toasts unless a screen handles the `ApiError` itself; the sign-up wizard had to bypass the interceptor entirely for its public calls (`register-pay.service.ts:14-24`).
12. **Legacy `/register` accepts 6-char passwords** while Cognito requires 8 + symbol; the new wizard mirrors the pool policy (`cognito-password.validator.ts`, referenced `register-pay-page.component.ts:8-12`).
13. **Session hygiene**: logout wipes all `localStorage` (including any sign-up draft) and the survey-gate cache; the SSO bridge writes raw tokens into `localStorage`.
14. **"Don't ask me again" for weight never persisted** (backend route missing) — the only reason it was harmless is that the modal is now mandatory anyway.
15. Legacy naming leaks: the login title is "Welcome to Beyondbmi! 👋" (`login.component.html:9`); the internal app/Cognito codename is still "blood-brothers"/"BloodBrothers" (KB 04a §1).

---

## 7. Implications for the new portal

**Must-have (parity or better)**
- A server-computed **journey stage** endpoint remains the spine; the portal renders one "what's next" surface from it instead of a timeline + banner + card trio.
- **All gates stay server-side** and the portal only mirrors them: questionnaire scope, entitlement, booking windows / cooldowns / allocation, weight staleness, 2 h cancellation, join-token ownership. Never re-derive eligibility in the browser.
- Booking must support **per-role calendars with clinician choice ("Anyone" or named)**, the four eligibility reasons, and reschedule/cancel/rebook. Semble bookings replace Cronofy events, but the patient-facing rules are BBMI's.
- Video join must render in every state (connecting / joined / error) and must never be walled off by a stale entitlement claim.
- Weight logging with unit preference and a history chart; the weight-staleness gate depends on it.
- Prescription list + **three dispatch paths** (Healthmail email, Pure delivery, SignatureRX NI) unless Semble's prescribing changes the pharmacy logistics.
- Lapsed/overdue handling that links Stripe's **open hosted invoice**, never a fresh checkout.
- The `/sign-up` funnel (inline Payment Element, 3DS re-entry, resume-after-refresh, email-taken guidance, personal-email rule, 18+ declaration, €89 medication notice, channel tagging, GTM event parity) — or a faithful re-implementation; the marketing widget and `/qualify` hand off to it with `?plan&slot&ref&src&utm_*`.
- Identity verification (Sumsub) entry point.
- Read-back of questionnaire answers.

**Must-not**
- Do not route patients through iframes for core flows if avoidable; if Tally stays, the completion signal must be a webhook the portal can observe, not a 3× poll.
- Do not rely on Cognito groups as the paywall; the current design needed three compensating mechanisms.
- Do not ship guards that can leave the router without an activated route (the white-screen class).
- Do not re-create the admin-template navigation; six menu items and an avatar menu is the whole IA today.
- Do not carry over the orphaned blood-test product, blood pressure, web push, GetStream, Veriff, `content`/`account-profile` shells, or the legacy `/register`.

**Decisions needed**
- Which of Cognito / Semble / a new IdP owns patient identity in the new portal (the SSO bridge and Amplify token storage assume Cognito).
- Whether the ~150 legacy members are migrated onto the tier-journey model so the timeline can die.
- Whether the intake questionnaire moves from Tally into the portal (or Semble questionnaires), and which single form is canonical (`E89_SURVEY_PATH` vs long `survey`).
- Whether ESS/EQ-5D and the HC quality surveys survive at all.
- Whether identity verification stays with Sumsub.
- What replaces the Zendesk link and the mailto support page (Semble has no patient messaging surface [INFERRED — verify in the Semble slice]).

---

## 8. Feature-parity checklist for the new portal

| # | Capability | Today (evidence) | Parity requirement | Semble-relevant? |
|---|---|---|---|---|
| 1 | Sign-up + pay (€89 / €399 / 3×€150), inline card, 3DS, resume | `/sign-up`, `register-pay-page.component.ts` | Must | Patient creation → Semble patient |
| 2 | Email verification + resend, password reset | Cognito pages | Must | IdP decision |
| 3 | Journey stage → next action | `tier-journey/status`, banner, stepper | Must | Stage derives from bookings + Stripe |
| 4 | App-wide questionnaire hold (server-scoped) + join gate | `SurveyBlockGuard`, `IntakeSurveyGuard` | Must | Questionnaire source decision |
| 5 | Pre-consult checklist (questionnaire + address) | `pre-consult-checklist.component.ts` | Must | Address → Semble patient record |
| 6 | Book per role with clinician choice, 6-month horizon | Cronofy picker + `app-staff` | Must | Semble availability/bookings |
| 7 | Eligibility reasons: 2-week delay, cooldown, weight stale, allocation used | `staff-availability.component.html:20-87` | Must | Rules stay BBMI-side |
| 8 | Dietician <14-day warning | `staff-availability.component.ts:375` | Should | — |
| 9 | Reschedule with clinician preselected | `/appointments/reschedule` | Must | Semble booking update |
| 10 | Cancel ≥2 h, rebook after no-show | `appointments.component.ts:79, 141` | Must | Semble booking cancel |
| 11 | Appointment list with statuses | `ngx-datatable` | Must (redesign) | Semble bookings |
| 12 | Join video (Daily.co) with 5-min window, error handling | `video.component.ts` | Must | Video stays outside Semble [INFERRED] |
| 13 | 90-day MDT schedule card with occurrence locking, Day-20 policy, paused state | `ninety-day-steps.component.ts` | Must | Bookings counted per role |
| 14 | Weight log (weekly, mandatory), unit preference, chart | `weight-tracker.*`, `patient-chart.*` | Must | Could write to Semble observations [decision] |
| 15 | Identity verification (Sumsub) | `sumsub.component.ts` | Must (decision on vendor) | Outside Semble |
| 16 | Prescription list + inline detail | `prescription.component.*` | Must | Semble prescriptions |
| 17 | Send Rx: ROI Healthmail (validated), Pure delivery, NI SignatureRX | `send-email.component.*` | Must (re-scope) | Semble may change dispatch |
| 18 | Health records read-back | `health-records.component.*` | Should | Questionnaire source |
| 19 | Pricing / upgrade chooser, ongoing-care chooser | `/pricing` | Must | Stripe stays |
| 20 | Lapsed / overdue: hosted invoice, portal, continue | journey banner, `/pricing` | Must | Stripe stays |
| 21 | Stripe Customer Portal | `customer-portal-session` | Must | — |
| 22 | Access codes (comped sign-ups) | hidden on prod, live on qa | Should (flagged) | — |
| 23 | Support | mailto | Must (rebuild) | Decision |
| 24 | Profile view; **edit** (missing today) | `/personal-information` | Must (new) | Semble patient update |
| 25 | Community link | menu | Should | — |
| 26 | Funnel analytics events (GTM parity with website widget) | `funnel-analytics.service.ts` | Must | — |
| 27 | Support impersonation / SSO bridge | `/sso-bridge` | Should | IdP decision |
| 28 | Push notifications, in-app chat | absent / dead | Decision | — |
| 29 | Blood pressure, lab results, order tracking | removed / orphaned | Drop | — |

---

## 9. Open questions

1. Is `/sso-bridge` used by the staff portal or only by test tooling? (No caller in this repo; the route has no guard.)
2. `E89_SURVEY_PATH` is `"surv"` on prod and `""` on qa (`environment.prod.ts:23` vs `environment.qa.ts:23`) — is the short form actually live for new €89 patients on prod, and is `"surv"` the intended Tally slug?
3. The `SurveyBlockGuard` scope depends on the backend `SURVEY_GATE_ENFORCE_FROM`; what is its prod value and how many active patients are currently inside the block?
4. Which activities index carries the **nurse** appointment? `roleActivityIndex` has no nurse entry, so the nurse step can never show "Scheduled for".
5. The dashboard-declared `upcoming-events` widget is not rendered; was it removed deliberately (it links `/appointments/join/{id}` directly)?
6. Does anything still call `POST api/v1/user/email/` (the support form) or is the endpoint free to retire?
7. Is the "Community" (`community.beyondbmi.ie?automatic_login=true`) SSO still working, and does it depend on the Cognito session?
8. Are the HC quality surveys and ESS/EQ-5D to be carried into the new portal at all (Art: HC "we won't touch those yet")?
9. `weight-tracker.service.ts:27` PUTs `settings/single-update`, which the modal comment says is not registered on the backend — confirm, since `persistUnitPreference()` uses the same route.
10. How is `medicationAck` consumed downstream (Stripe metadata? DB column?) — it is sent as `medicationAckBy: 'patient'` and matters for refund disputes.
