# 08 — Competitor patient portals: the UX bar for the new BBMI portal

*Research slice for the Semble-backed patient portal. Written 2026-09-11. Desk research only (web + local KB); no live API calls; no repo files modified. Facts are cited to a URL or `file:line`; inferences are marked **[INFERRED]**.*

---

## TL;DR

1. Every serious GLP-1 programme app (Ro, Found, Calibrate, Noom, Juniper, Voy, Numan, Second Nature, Oviva, WW) converges on the **same six-tab information architecture**: *Today/Home · Treatment (dose, refills) · Progress (weight + more) · Care team (messages, appointments) · Learn · Account/Billing*. Pharmacy-only sellers (Simple Online Pharmacy, Boots, Asda) have no app worth copying beyond the reorder flow. Irish "competitors" (myBMI, Webdoctor) are a consultation + prescription form, not a portal. BBMI's current app already has more (timeline, weight chart, video, prescriptions, KYC) than any Irish rival, but its "chat" is an email form and it has no dose/side-effect/check-in loop at all (`04a_Frontend_Patient.md:327`, `:332-333`).
2. The evidence-backed engagement levers are **weekly weigh-in and coach message frequency** — Juniper's 19,693-patient cohort found both "positively associated with both 12-month adherence and total weight loss" (eucalyptus.health). Design the home screen around those two habits, not around content volume.
3. The pattern set to adopt (section 2, 20 patterns): next-dose card, injection-site rotation, missed-dose rule, in-app dose-review request, 3-tap side-effect check-in, weekly weigh-in + trend, non-scale progress, named care team with response promise, triaged async messaging, NHS-style task list for onboarding, programme timeline with milestones, appointment cards with a timed Join button and up-front cancellation policy, prescription/refill status tracker, stage-tied learning, gated community, transparent billing panel with pre-charge reminder and one-click cancel/pause, a single-action paused state, low-friction auth with step-up, doctor-shareable report, and (later, cautiously) an AI companion.
4. The industry's #1 complaint is **billing, not medicine**: undisclosed recurring costs, cancellation funnelling, 28-day "monthly" cycles, reassessment surprises at reorder (FTC v NextMed; Noom $56M settlement; Voy/Juniper/Numan Trustpilot). BBMI must design billing transparency as a feature. Irish law adds two constraints: the **European Accessibility Act** (S.I. 2023, in force 28 Jun 2025, WCAG AA via EN 301 549) applies to private online services, and **HPRA prohibits naming prescription medicines** in public-facing promotion (disease-awareness exemption only).
5. **Semble's own portal is thinner than its marketing**: the help centre documents a link-based *Patient Share Portal* (email link + DOB/SMS 2FA, view/download documents only, no upload, no messaging), online booking (widget/URL, pay at booking, confirmation with cancel/reschedule), questionnaires (8 question types incl. file upload + signature, auto-populate the record) and browser video with a waiting room. Everything else in this document — dose loop, check-ins, progress, messaging, billing state, paused/lapsed logic — is ours to build on top of the Semble API.
6. Three stage-specific home screens are specified in section 5 (just paid €89 / mid-programme / lapsed), each with one primary action and its Semble-vs-BBMI data source.

---

## 0. Method, sources, caveats

- **Products reviewed:** Ro Body (US), Found (US), Calibrate (US), Noom Med/GLP-1 Companion (US), Juniper (UK, Eucalyptus), Voy (UK — Manual's weight-loss brand: "Voy is the rebranded weight loss arm of Manual", secondnature.io best-programme guide), Numan (UK), Oviva (UK/NHS), Second Nature (UK), Simple Online Pharmacy (UK), WW GLP-1 programme (UK); generic portals Semble, Cliniko, Jane, Healthie; tracker apps Shotsy, CareClinic, MeAgain/Pep; standards NHS digital service manual, HSE digital service manual, HSE Health App.
- **"MyTeleDoc" caveat:** myteledoc.app is a Central/Eastern-European telehealth service (Austria, Bulgaria, Croatia, North Macedonia, Romania, Slovakia — "Ireland is not listed") with no weight-loss programme (https://myteledoc.app/). Irish comparators substituted: **myBMI** (https://my-bmi.ie/) and **Webdoctor.ie** (https://www.webdoctor.ie/weight-management-services/). If Art meant a different product, see Open questions.
- **Access limits:** Apple App Store and ro.co returned 429/403 to the fetcher; Ro/Voy/Found app detail comes from vendor pages, help centres and third-party reviews, cited individually. No screenshots were captured; screen descriptions are from vendor copy and reviews.
- **BBMI stage names used below** come from the tier-journey engine: `consult_paid → consult_booked → consult_done`, `ninety_day_active`, `ninety_day_overdue`, `ninety_day_completed`, `legacy_member`, `legacy_lapsed` (memory `project_bbmi_tiered_pricing_poc.md`, `project_bbmi_overdue_member_experience.md:15,21`).

---

## 1. Common information architecture

### 1.1 The six-area pattern (who has what)

| Area | Ro Body | Found | Calibrate | Noom GLP-1 | Juniper UK | Voy | Numan | Second Nature | Oviva | Semble portal |
|---|---|---|---|---|---|---|---|---|---|---|
| **Home / Today** (next action, streak, today's tasks) | app hub "from your first provider consult to lab testing, prescriptions, and weekly coaching" | daily lesson + log weight + med reminders "5-10 minutes daily" | daily trackers reviewed with coach | Success Kit, Seeds rewards | "Progress monitoring dashboard" | "log your weight and see your progress in real time" | "Track progress, manage your treatment" | **Today** tab: "overview of your goals, habits, progress, and stories" | daily summary of nutrition | booking + documents only |
| **Treatment / medication** (dose schedule, log, refill) | "dose logging"; "erroneous dose-logging prompts" complaint | "medication reminders"; "Refills are easy" | Rx updates in-app | **SmartDose**: "Intelligent med tracking and dosing"; reminders; side-effect guides | "manage your treatment (follow a schedule, get side effect support, review your prescription)" | "titration guide", "check upcoming orders, make dose changes, and track injections in one place" | "medication reminders"; clinician "can adjust your dose, switch your medication format" | "medication management with side-effect support"; monthly clinical review | n/a (NHS pathway) | none |
| **Progress** | weight (reviewers say app lacks built-in weight tracking — clearmetabolic) | weight log | weight, food, sleep, steps, energy; smart scale | AI Body Scan (lean mass vs fat) | weight, waist, activity; wearable sync | weight graph; AI meal feedback | weight, mood, "other metrics" | **Track** tab: weight/steps/sleep toggles, line graph, total loss vs goal | photo food diary, mood, activity | none |
| **Care team / messages / appointments** | unlimited provider messaging; weekly RN coaching; monthly provider check-in | provider messaging between visits; monthly check-ins | bi-weekly 1:1 video coaching (26 sessions) | coaching | 1:1 prescriber + coach; June AI 24/7 | coach; Joy AI; "hotline Mon–Fri 9–5 or live chat 7 days" | "message your clinician and personal health coach directly" | **Chat** tab: peer group, 1:1 coach, support | coach/dietitian chat "anytime" | bookings, reminders, video; **no patient-initiated messaging documented** |
| **Learn** | step-by-step curriculum (nutrition, sleep, emotional health, exercise) | daily lessons | Four Pillars curriculum, 4 levels | Success Kit, Muscle Defense workouts | courses (nutrition, sleep, strength) | "usage guide", expert tips | expert articles | **Toolbox**: articles, recipes, meal planner, journal | learning content | none |
| **Account / billing / documents** | insurance tracking, treatment notifications | — | — | — | subscription, "cancel anytime" | dose changes + orders | pause/cancel subscription | Settings: units, notifications, subscription (NHS excluded) | — | documents (view/download), invoices, Semble Pay |

Sources: https://ro.co/weight-loss/ro-body-program/ (via search), https://www.clearmetabolic.com/reviews/ro-review/, https://www.joinfound.com/, https://www.weightsherpa.com/guides/found-weight-loss-review, https://www.joincalibrate.com/lp/coaching-and-curriculum, https://www.noom.com/med/glp1-companion/, https://www.myjuniper.co.uk/, https://apps.apple.com/gb/app/juniper-womens-weight-loss/id1661064221 (via search), https://www.joinvoy.com/weight-loss/app (via search), https://www.numan.com/weight-loss, https://www.medicspot.co.uk/weight-loss/programmes/medicspot-vs-numan, https://help.secondnature.io/en/articles/2929075-second-nature-app-overview, https://oviva.com/uk/en/, https://www.semble.io/patient-experience, https://help.semble.io/patient-share-portal-with-2fa.

### 1.2 Observations

- **Bottom-nav count is four.** Second Nature is the cleanest documented example: *Today · Track · Chat · Toolbox* (help.secondnature.io). Nobody exposes "Documents" or "Billing" as a top-level tab; they live under Account.
- **"Today" is a to-do list, not a dashboard.** Found's daily loop is "log weight, read a lesson, check medication reminders" (weightsherpa). Calibrate's daily trackers exist to be "reviewed with your accountability coach" (search summary of the App Store listing). The BBMI dashboard today is a widget wall — timeline, weight chart, blood pressure, upcoming events, lab result, order tracking, Sumsub KYC modal (`04a_Frontend_Patient.md:332-333`) — with no "what do I do today" hierarchy.
- **Treatment is a first-class area only in medication-led programmes.** Oviva (NHS lifestyle pathway) has none; Voy/Noom/Juniper make it the centre. BBMI is medication-led, so Treatment must be first-class even though dispensing is outsourced to a pharmacy (ROI email / NI SignatureRX — `04a_Frontend_Patient.md:339-340`).
- **Generic clinic portals (Semble, Jane, Cliniko, Healthie) are transactional**: appointments, forms, documents, receipts. Jane's My Account is the most complete reference list — upcoming appointments (with "Contact to Cancel" inside the notice window), a "Begin" button that appears within the hour, history, practitioner-initiated messages, intake-form banner, shared documents, contact info, cards on file, pay balance, receipts, notification preferences, active-session list (https://jane.app/guide/my-account-your-patient-client-portal). Healthie adds journaling, goals, care plans and educational prompts (https://www.gethealthie.com/patient-portal). None of them has a dose loop.

---

## 2. UX patterns worth adopting (20)

Each entry: what · who does it · why it works · BBMI note (data source: **S** = Semble object, **B** = BBMI-side).

1. **Next-dose card with countdown and one-tap log.** Shotsy: "home-screen countdown widgets keep shot day visible", "one-tap shot and pill logging", shows "when to take your next injection" and "what dosage you're currently on" (https://shotsyapp.com/glp-1-tracker/). Voy: "injection reminders, dose management" (App Store via search); Noom SmartDose. Why: a weekly injection is the single habit that determines outcomes; a visible shot day is the cheapest adherence lever. BBMI: **B** — schedule derived from the active prescription (dose strength, weekly cadence) + patient's chosen injection day; log stored BBMI-side, summarised into the Semble record at review time **[INFERRED design]**. Only render once a prescription exists (never on the €89 pre-consult screen).

2. **Injection-site rotation body map.** Shotsy: "Users select injection sites; the app automatically rotates them" and charts "progress by dosage and injection site"; CareClinic rotates "Week 1: Left abdomen, Week 2: Right thigh, Week 3: Left upper arm, Week 4: Right abdomen" and warns to avoid "the area within 2 inches of the navel" (https://careclinic.io/wegovy-app/). Why: reduces site reactions, and gives the nurse something concrete to review. BBMI: **B**, three-zone map (abdomen L/R, thigh L/R, upper arm L/R), suggested next site. Clinical sign-off needed on the rotation rule.

3. **Missed-dose rule shown at the moment it matters.** Wegovy: "take the missed dose if your next injection is more than 48 hours away; skip it if less" (https://pillo.care/blog/missed-dose-of-wegovy); Mounjaro: "take it as soon as possible within 4 days (96 hours)" (https://chequp.com/how-to-manage-a-missed-mounjaro-or-wegovy-dose-safely/). Why: the #1 panicked message to any GLP-1 clinic; answering it in-app removes a support ticket and a risk. BBMI: **B** rule engine keyed on the medication on the prescription; anything outside the window → "message the nurse" CTA. Copy must be signed off by Dr Alvin; do not ship generic rules.

4. **In-app dose-review request (titration).** Voy: "control your next dosage at any time in the Voy app… pause, stay on your current dose, or reduce it" and a "titration guide to adjust your dose quickly from your phone" (https://www.joinvoy.com/weight-loss/medications/mounjaro via search); Second Nature: "Monthly clinical reviews with dose optimization"; Simple Online Pharmacy: "clinicians reviewing every order to make sure it's still right for you" (https://www.simpleonlinepharmacy.co.uk/online-doctor/weight-loss/mounjaro/ via search). Why: dose escalation is the monthly interaction; making it a structured request (current dose, tolerability, weight trend, side effects) instead of a free-text email lets the doctor decide in one glance. BBMI: **B** request form → **S** Task/Questionnaire on the patient record; the doctor's decision writes a prescription in Semble. Respects the existing "no new/standalone scripts outside an active programme" rule (`project_bbmi_90day_booking.md:17`).

5. **Side-effect check-in on the dose timeline.** Shotsy: "Track nausea, constipation, fatigue, and more, with severity and notes… Symptoms sit on the same timeline as your doses"; WW: "Side effect tracking for clinically informed guidance" (https://www.weightwatchers.com/uk/how-it-works/glp-1-programme); Noom: "side-effect guides" + "personalized strategies… like nausea". Why: turns a scary experience into data the nurse can act on, and gives the dose-review request its evidence. BBMI: **B** 3-tap check-in (which / how bad / since when) triggered 24–48 h after each logged dose; severe answers show the emergency care card (pattern 16) and create a **S** Task for the nurse.

6. **Weekly weigh-in prompt + trend with % change and goal.** Evidence: Juniper's 19,693-patient tirzepatide cohort — "Consistent weekly weight tracking was positively associated with both 12-month adherence and total weight loss"; adherent patients lost 22.6% at 12 months (https://www.eucalyptus.health/research/juniper-uk-12-month-mounjaro-weight-loss-outcomes). Second Nature shows "your weigh-ins in line graph format… your current total weight loss and your goal weight" (help.secondnature.io). Why: the one behaviour proven to correlate with staying on treatment. BBMI already has a weight chart with % loss and a 45-day weight gate for doctor booking (`04a_Frontend_Patient.md:333`; memory `project_bbmi_tiered_pricing_poc.md` "Weight Update Required" banner). Keep the gate, but move the prompt to a Sunday-evening nudge instead of a booking-time wall. **B** store; push the latest reading to the **S** record before each consult.

7. **Progress beyond the scale.** Juniper tracks "weight, waist and activity habits"; MeAgain/Pep keep "progress photos and Journey Cards" (https://apps.apple.com/us/app/meagain-glp-1-tracker-app/id6744178534); Oviva: "celebrate more than just weight changes"; reviewer wisdom: "When the scale stalls (and it will), having photos, measurements, and logged victories reminds you that transformation is happening" (https://learnmuscles.com/blog/2025/11/27/6-best-glp-1-tracking-apps-compared-which-app-actually-works-in-2026/). Why: plateaus are where people quit. BBMI: **B** waist + optional private photos (encrypted, never shared to community) + "non-scale wins" free text the dietitian sees.

8. **Named care team with roles, registration and a response promise.** Second Nature: dietitian "available 5 days a week… responses typically same day"; Voy: "hotline Mon–Fri 9–5 or live chat 7 days a week"; Juniper prescribers "registered… with the General Pharmaceutical Council". Why: trust in a remote clinic is built by knowing exactly who is treating you and when they will answer. BBMI: **S** clinician profiles (name, role, IMC/CORU number, photo) + **B** response-time promise per channel. Supports Medical Council para 37.1 ("same standards of conduct and practice as would be expected if treating the patient in-person", Medisec factsheet Jan 2024).

9. **Triaged asynchronous messaging (not "chat").** Ro: "unlimited provider messaging"; Found: "ask questions about side effects, dosing, or lifestyle adjustments without scheduling a full visit" (weightsherpa); Jane: "Practitioners initiate conversations; patients respond only" (a limitation to avoid); Semble: no patient-initiated messaging documented (help.semble.io/patient-zone). Why: a categorised message (side effects / prescription / appointment / billing / other) routes to nurse, doctor, ops or billing without a human triage step and sets the right response expectation. BBMI today: "Support" is a contact form to support@beyondbmi.ie (`04a_Frontend_Patient.md:327`); GetStream is "configured but unwired" (`00_INDEX.md:100`). Build **B** messaging with category + SLA; mirror clinically relevant threads into **S** as notes/documents. Emergency care card pinned above the composer.

10. **Onboarding task list (NHS "complete multiple tasks" pattern).** Statuses: Completed (plain text), Not yet started (light blue tag), In progress (white), Cannot start yet (grey, unlinked, with a hint like "Complete family health history first"); "Do not use the red background colour for any status text except errors" (https://service-manual.nhs.uk/design-system/patterns/complete-multiple-tasks). Jane shows incomplete intake forms "with a banner prompting completion across the top". Why: BBMI's pre-consult checklist (questionnaire + address) already exists as a modal, and the 5 Aug first-call incident came from that checklist covering the Join button (memory `project_bbmi_survey_gate.md:33`). A task list is persistent, non-blocking, and never overlays the one button that matters. BBMI: **S** questionnaire completion + **B** email verified / address / ID check (Sumsub) / first weigh-in.

11. **Programme timeline with milestones.** Calibrate: four levels (Learning 0–3 mo, Practicing 3–6, Setting 6–9, Sustaining 9+) with bi-weekly goals (joincalibrate.com); Second Nature: phases and 12-month structure; Found: Week 1 initiation → Week 2 start → Weeks 3–4 provider check-in → Month 2+ monthly. Why: people stay when they can see where they are. BBMI already has the 8-step MDT list for `ninety_day_active` with per-step booking windows and "Your programme begins on {date}" (`BBMI_90Day_Build_Spec.md:21-34`, `:112-114`). Add a **Day X of 90** progress ring, month markers, and the two non-bookable touchpoints as info rows ("We'll call you around day 5–7", `:33-34`).

12. **Appointment card with timed Join, pre-call test and up-front policy.** Jane: "When an appointment begins within the next hour, a blue 'Begin' button enables patients to join"; inside the cancellation window appointments show "Contact to Cancel" "to prevent surprises"; "All appointments are cancellable within 3 minutes of booking" (jane.app). Semble video: pre-call test of "camera, speaker, microphone, and connection quality", waiting room where the patient "knocks" (https://help.semble.io/video-consultations-patient-guide). Semble reminders cut one clinic's non-attendance "from 12% to 3%" (https://www.semble.io/booking-questionnaires). Why: reduces no-shows and support calls; Europe/Dublin time shown (the current 90-day UI shows UTC — memory `project_bbmi_90day_booking.md:13`). BBMI: **S** booking + video link + reminders; **B** renders the card and the join window (60 min before → 2 h after, per the existing fix).

13. **Prescription / refill status tracker.** Simple Online Pharmacy: "reordering takes seconds, with your details saved and clinicians reviewing every order"; "order when you need to rather than being locked into a schedule"; resource library staged by journey ("first order", "transitioning to a higher dose", pen troubleshooting, storage) (https://care.simpleonlinepharmacy.co.uk/patient-resources). Voy: "check upcoming orders". Complaint evidence: Numan patients "being asked to complete a full reassessment when they expected a simpler renewal" (https://www.medino.com/article/best-online-pharmacy-for-weight-loss-uk). Why: the patient's real question is "where is my medicine and when will I run out". BBMI dispenses via pharmacy, so the tracker is: *Reviewed → Prescription issued → Sent to your pharmacy (which one) → Ready to collect/dispatched → Runs out on {date}* with a "request review" CTA 10 days before run-out. **S** prescription object; **B** send-to-pharmacy state (existing ROI email / NI SignatureRX flow). Mark clearly when a reassessment is required *before* the patient expects a renewal.

14. **Learning drip tied to stage, 5–10 minutes.** Found: "5-10 minute daily lessons"; Calibrate: "1-2 lessons weekly"; myBMI: "10-week educational programme"; SOP: content keyed to first order / dose transition. Why: content only helps when it arrives at the moment of need. BBMI: **B** library keyed on stage (pre-consult → first injection week → titration → plateau → coming off). Reuse existing BBMI content; do not build a curriculum first.

15. **Community — optional, gated, off the critical path.** Juniper: "private Facebook community"; Found: "exclusive in-app community"; Second Nature: "small peer group with others on similar programmes"; Numan: "does not have a built-in peer support forum" (medicspot comparison). Why: peer support helps engaged members but every provider keeps it out of the treatment loop. BBMI: Circle (external, `community.beyondbmi.ie?automatic_login=true`, `04a_Frontend_Patient.md:124`) is granted to 90-day/€150 plans and deliberately not to €89 (memory: community role removed from the €89 catalog 2026-07-14). Keep as an entry point, never as a home-screen block for €89.

16. **Care cards for "when to get help" (NHS pattern).** Three levels: non-urgent (blue, "See a GP if:"), urgent (red, "Ask for an urgent GP appointment or get help from NHS 111 if you have:"), emergency (red + dark grey, "Call 999 or go to A&E now if:"); "The card's heading should be 1 clear call to action"; research: "users scanning the page stopped to read the cards and understood what action to take" (https://service-manual.nhs.uk/design-system/patterns/help-users-decide-when-and-where-to-get-care). Why: GLP-1s have real red flags (severe abdominal pain, persistent vomiting/dehydration, gallbladder, hypoglycaemia in people on other agents); a remote clinic must safety-net every screen that touches symptoms. BBMI: Irish equivalents (GP / out-of-hours / 999 or 112 / ED); wording by Dr Alvin. **B** component, shown on messaging, side-effect check-in and the lapsed screen.

17. **Transparent billing panel with pre-charge reminder and one-click cancel/pause.** Best practice per the 18-provider comparison: Belle is "the only provider promising pre-charge renewal reminders before auto-billing"; Sesame "publishes step-by-step self-serve cancellation paths for web and app"; Henry Meds offers "three cancellation channels (portal, email, phone)" (https://www.trycora.io/blog/glp1-telehealth-cancellation-policies-compared/). Noom's settlement obligations: "separate customer action (checkbox or digital signature) to accept auto-renewal" and a "dedicated cancellation button on customer account pages" (https://www.hunton.com/hunton-retail-law-resource/fitness-app-agrees-to-pay-56-million-to-settle-class-action-alleging-dark-pattern-practices). Why: see section 3 — billing is the industry's #1 complaint. BBMI: **B** Stripe (plan, next charge date and amount, instalment 2 of 3, receipts) + Semble Pay invoices for ad-hoc items; a reminder 3 days before each €150 instalment; cancel/pause button that works.

18. **Paused / overdue state with one primary action.** BBMI's own QA design is already best-in-class here: banner "Your 90-day programme is paused" with "Pay instalment and resume" (opens the invoice, "NEVER a checkout") + "Update card or manage subscription"; 8-step card kept with a PAUSED badge and every Book locked; practice-side pause shows "contact support", never "cancelled" (memory `project_bbmi_overdue_member_experience.md:15,21`). Matches the NHS "interruption page" pattern (https://service-manual.nhs.uk/design-system/patterns). Port it unchanged to the new portal.

19. **Low-friction auth with step-up for sensitive views.** Cliniko booking: "No usernames or passwords to remember"; Semble share portal: email link + "date of birth or an SMS code" (help.semble.io/patient-share-portal-with-2fa); Jane: Google login and a list of "active sessions with browser/OS/IP details" the patient can end; HSE Health App: "verified MyGovID account is mandatory to access personal health information" (https://about.hse.ie/news/first-version-of-hse-health-app-includes-hospital-appointments-for-expectant-mothers/). Why: BBMI's patient Cognito pool has "MFA OFF" with 10,068 users (`00_INDEX.md:36`). Magic-link/passkey sign-in + SMS/TOTP step-up before documents, prescriptions and billing is the defensible middle.

20. **Shareable report for the GP.** Shotsy "exports a PDF report of your doses, side effects, and weight trends"; GLPulse "can generate detailed reports for doctors" (App Store via search). Why: Medical Council 33.9 requires a telemedicine doctor who is "not the patient's usual doctor" to "provide an update to the patient's general practitioner as soon as possible" unless the patient declines (Medisec factsheet). A patient-triggered "share my progress summary with my GP" doubles as consent capture and continuity of care. **S** letters/documents.

*(Deferred: AI companion — Juniper's "June", Voy's "Joy", both marketed as 24/7. Reviews praise availability ("very comforting") but a clinical AI answering dose questions is a regulatory and safety exposure BBMI should not take in v1. Revisit once messaging SLAs are met.)*

---

## 3. Patterns to avoid (with evidence)

| Anti-pattern | Evidence | BBMI rule |
|---|---|---|
| **Undisclosed recurring cost / fake "cancel anytime"** | FTC v NextMed: membership advertised at "$138 or $188" monthly without disclosing drug, lab or consult costs; "required one-year commitment with early termination fees"; failed "to obtain informed consent to charge consumers" (https://www.ftc.gov/news-events/news/press-releases/2025/07/...). Voy 1★: "Website say you can cancel anytime, I now they say I can't before 12 months"; 2★: "Very confusing pricing information makes it look like one price, when actually it's another" (https://uk.trustpilot.com/review/www.joinvoy.com). Juniper 1★: "£229 was taken from my card without sufficient clarity beforehand" (https://uk.trustpilot.com/review/myjuniper.co.uk). | Show total cost of the whole plan (e.g. "€450 in 3 monthly instalments of €150; instalment 2 on {date}") on the purchase screen, the confirmation, and the billing panel. Separate tick-box for auto-renewal where a plan renews. |
| **Cancellation funnelling** | "Calibrate (7-day notice), Found (~36 hours before billing)… mandate email cancellation. Mochi Health explicitly states that email cancellation is invalid"; "Sesame: 28-day billing cycle yields 13 annual charges despite 'monthly' labeling" (trycora.io). Noom class action: cancellation "requiring users to contact virtual coaches", lump-sum "up to eight months" after trial (hunton.com). | One cancel/pause button in Account; email and phone also accepted; monthly means calendar-monthly. |
| **Reassessment surprise at reorder** | Numan: "some describe being asked to complete a full reassessment when they expected a simpler renewal" (medino.com). | Tell the patient at the start of the month which review is coming and why (pattern 13). |
| **Delivery not aligned to shot day / cold chain** | Voy 1★: "Prescription left on doorstep on boiling hot day, twice!"; Juniper 1★: "Medication delivered to another address, still won't send replacement" (Trustpilot). Boots: "up to three weeks" for prescription confirmation (medino.com). | BBMI does not ship, but the prescription tracker must show pharmacy hand-off dates and the run-out date so the patient is never surprised. |
| **App as afterthought** | Ro: users describe the platform as "clunky" with "slow functionality", "erroneous dose-logging prompts", no "built-in weight tracking" (clearmetabolic.com). Found: "functional without being exceptional", "some users citing bugs in tracking features" (weightsherpa; search). Calibrate: "very complicated", "a coach who never showed up to a scheduled zoom meeting" (consumeraffairs via search). | Ship fewer screens that work. Every reminder must be derived from real data (no prompt to log a dose the patient has not been prescribed). |
| **Gates that wall out paying members** | BBMI's own finding: 970 active subscribers, 175 with no intake survey, 151 of them members 90+ days — a blanket survey block would have "wall[ed] long-standing paying members out of their own dashboard" (memory `project_bbmi_survey_gate.md:21`). Checklist overlay covered the Join button (Emma, 5 Aug). | Gate the *clinical action* (join, prescribe), never navigation; count who is affected before any gate; never overlay Join. |
| **Naming prescription medicines on public surfaces** | Irish law prohibits advertising prescription-only medicines to the public; the 2007 regulations exempt only "disease awareness campaigns" with "no reference, even indirect, to medicinal products" — HPRA cleared Novo Nordisk's campaign precisely because it named neither Ozempic nor Wegovy (https://www.thejournal.ie/obesity-advertising-ireland-hpra-6808274-Sep2025/). HPRA took down/amended 431 GLP-1 URLs in ten months (Irish Times via search). | Medication names and doses appear only behind login, in clinical context. Pricing pages, emails to leads and the €89 funnel describe "medication if clinically appropriate". Keep the existing "medication not guaranteed" tick on the €89 (Art's decision, `project_bbmi_survey_gate.md:19`). |
| **Stigmatising imagery and unsubstantiated claims** | FTC: NextMed "used deceptive before and after photos of people who were not their customers" and claimed "23% of their body weight on average" without substantiation. | No before/after imagery in the portal; outcome numbers only from BBMI's own audited data with the denominator stated. |
| **Red status colours for non-errors; vague reassurance** | NHS: "Do not use the red background colour for any status text except errors"; avoid "a good chance of recovery" — use "4 out of 5 people recover fully in a week" (https://service-manual.nhs.uk/content/how-we-write). | Status tags follow the NHS palette; numbers over adjectives. |
| **Practitioner-only messaging; "chat" that is an email form** | Jane: "Practitioners initiate conversations; patients respond only"; BBMI: `SupportComponent` is a contact form → `POST api/v1/user/email/` (`04a_Frontend_Patient.md:327`). | Patient-initiated, categorised, with SLA (pattern 9). |
| **No way to reach a human** | Juniper 1★: "No straightforward way to speak to someone on the phone"; Calibrate: "difficulty reaching live support". | Publish phone hours next to the message composer; the Day 5–7 and Day 80 calls stay human. |

---

## 4. Accessibility and trust patterns for a medical product

### 4.1 Legal and standards baseline (Ireland)

- **European Accessibility Act** — implemented in Ireland via the "Accessibility Requirements (Products and Services) Regulations 2023, coming into effect on 28 June 2025"; covers "services accessed through the internet on computers or phones… apps" and "buying and selling goods or services over the internet", for "public and private sector"; micro-enterprise exemption (≤10 employees and ≤€2m turnover); technical route is EN 301 549 → WCAG AA; penalties "on summary conviction, a class A fine of €5,000… or on indictment, fines up to €60,000" (https://reciteme.com/news/european-accessibility-act-in-ireland/, https://www.matrixinternet.ie/european-accessibility-act-2025-how-it-impacts-ux-design-and-websites/, https://accessibility.ie/). **[INFERRED]** BBMI sells services online and is unlikely to qualify as a micro-enterprise → treat WCAG 2.1 AA (EN 301 549 v3.2.1 references WCAG 2.1) as a hard requirement; confirm with counsel.
- **HSE digital service manual:** "The content we publish online must, at a minimum, meet AA standard", "we always aim for our webpages to comply with WCAG 2.1 AA" (https://service-manual.hse.ie/accessibility/meeting-eu-and-irish-accessibility-requirements). **NHS:** designs "to WCAG 2.2 AA standard (and in some cases AAA)", checks "the most commonly-used assistive technologies", and "includes people with access needs in user research" (https://service-manual.nhs.uk/accessibility-statement). Target 2.2 AA; 2.2 adds focus-not-obscured, dragging alternatives, target size 24px, consistent help, redundant entry, accessible authentication — all directly relevant to a body map, a slot picker and a login.
- **HSE Health App precedent:** "tested with users who rely on assistive technology and audited"; built with "a Patient Advisory Group" and disability organisations (about.hse.ie). BBMI should recruit 5–8 current members (including older and low-literacy users) for the same.

### 4.2 Trust patterns

1. **Clinician identity on every clinical surface** — name, role, IMC/CORU/PSI registration number, photo (pattern 8). Medical Council 2024 Guide para 37.1 (Medisec).
2. **Consent and GP update** — one-time consent to share a summary with the patient's GP, revisitable in Account (Guide para 33.9, Medisec).
3. **Safety-netting on every symptom surface** — NHS care cards (pattern 16), Irish numbers.
4. **Document security** — Semble's share portal already forces DOB or SMS 2FA on shared documents (help.semble.io/patient-share-portal-with-2fa); the new portal must not be weaker than the Semble link it replaces. Show "active sessions" like Jane.
5. **Data residency and processor disclosure** — Semble's contract is governed by English law and Semble is a UK processor (memory `project_bbmi_semble_implementation.md:17`); the privacy notice in-app must name Semble, Stripe, the pharmacy partners and Daily/video provider. Free "data extraction on exit" (same memory) supports a patient-facing "download my data" action.
6. **Price honesty** (section 3) and **"medication is not guaranteed"** before payment (existing €89 tick).
7. **Regulated-claims hygiene** — no product names outside login (HPRA), no unaudited outcome statistics.
8. **Accessible authentication** — magic link / passkey, no CAPTCHA puzzles, SMS or TOTP step-up (WCAG 2.2 SC 3.3.8).
9. **Human availability** — phone hours and the human touchpoints (Day 5–7, Day 80) shown in the timeline; "We'll call you" rows already specified (`BBMI_90Day_Build_Spec.md:33-34`).
10. **Plain-language status, never blame** — "Your instalment was unsuccessful" not "You failed to pay" (existing QA copy, memory `project_bbmi_overdue_member_experience.md:15`).

---

## 5. Recommended home screen, described in words, for three BBMI stages

Layout assumptions: mobile-first single column; four-tab bottom nav *Home · Treatment · Progress · Care* with Account under the avatar; one **primary card** per screen; everything else is secondary. Times in Europe/Dublin.

### 5.1 Stage A — just paid €89 (`consult_paid` → `consult_booked` → `consult_done`)

1. **Greeting strip** — "Hi {first name}" + care-team avatars (the three funnel doctors) with "IMC-registered" label. No streaks, no gamification.
2. **Primary card — your consultation.** If not yet booked (qa journey: pay → verify → sign in → questionnaire → book, memory `project_bbmi_survey_gate.md:11`): "Book your doctor consultation" → Semble online booking (appointment type = 25-min initial). If booked: date/time, doctor name + registration, "Add to calendar", "Reschedule / Cancel" with the notice policy printed under it, "Test your camera and mic" (Semble pre-call test), and the **Join** button rendered only from 60 min before to 2 h after start — never covered by any modal.
3. **Task list (NHS pattern)** — Email verified (Completed) · Health questionnaire (Not yet started → Semble questionnaire; required to *join*, not to book) · Address on file · ID check (Sumsub) · First weigh-in. Statuses per NHS palette; "Cannot start yet" only where a true dependency exists.
4. **What happens next** — four static steps: Consultation → Doctor's decision (medication "if clinically appropriate" — never guaranteed) → "We'll call you around day 5–7" → Your options after the consultation (90-day programme; shown as information, no price nag until `consult_done`).
5. **Baseline card** — height/weight/BMI from the funnel; "log your starting weight" if missing.
6. **Care card** — emergency/urgent/non-urgent, Irish numbers.
7. **Footer strip** — "€89 paid {date} · Receipt" (Stripe) · "Message us" (categorised, SLA shown) · phone hours.
Explicitly absent: next-dose card, community, prescriptions tab content (30-day €89 rule), any "upgrade now" hero.

Data: **S** booking, questionnaire, clinician; **B** Stripe payment, Sumsub, weight, email verification.

### 5.2 Stage B — mid-programme (`ninety_day_active`, on medication, ~day 34)

1. **Programme header** — "Day 34 of 90 · Month 2" ring; month markers; "programme begins {date}" variant while the Day-20 anchor is in the future (`BBMI_90Day_Build_Spec.md:112-114`).
2. **Primary card — next dose.** "Next injection Thu 19:00 · {dose} · suggested site: right thigh" → *Log dose* (one tap; opens site map + optional note) · *Missed a dose?* (rule for this medication, else "message the nurse").
3. **This week's check-in** — three chips: *Weigh in* (weekly; trend sparkline, % change vs start, goal), *How are you feeling?* (3-tap side-effect check), *Non-scale win* (optional). Completing all three shows a quiet "Shared with your care team".
4. **Appointments** — next appointment card (e.g. Nurse check-in) with Join/reschedule; below it the **8-step MDT list** with statuses *Booked {date} / Book now / Available from {date}* (windows anchored to programme start, `BBMI_90Day_Build_Spec.md:21-31`), plus the two info rows ("We'll call you around day 80").
5. **Prescription tracker** — Issued {date} → Sent to {pharmacy} → Ready/dispatched → "Runs out ~{date}"; *Request dose review* button becomes active 10 days before run-out or on a flagged side-effect check-in.
6. **Messages** — last care-team message + reply; "Dietitian replies within 1 working day".
7. **This week's learning** — one 5-minute item keyed to Month 2 (titration/plateau).
8. **Community** — single entry row (Circle), not a feed.
9. **Billing strip** — "Instalment 2 of 3 · €150 on {date} · Update card"; pre-charge email 3 days before.
10. **Care card** at the bottom.

Data: **S** bookings, clinicians, prescription, questionnaire/tasks, documents; **B** dose log, site map, check-ins, weight, messaging, Stripe, learning.

### 5.3 Stage C — lapsed (`ninety_day_overdue` / `legacy_lapsed` / `ninety_day_completed`)

- **Overdue instalment (`ninety_day_overdue`)** — full-width interruption card: "Your 90-day programme is paused" · "Your instalment on {date} was unsuccessful" · primary **Pay instalment and resume** (opens the open Stripe invoice — never a new checkout) · secondary **Update card or manage subscription** (billing portal). The 8-step list stays visible with a PAUSED badge and locked Book/Reschedule/Join; booked appointments listed with "held until {date}" copy (decision needed — see Open questions). Prescription tracker read-only. Care card + "Message billing" + phone hours. No dose card (clinical guidance while paused = decision needed).
- **Practice-side pause (`payment_paused`)** — same layout, copy "Your programme is paused by our team — contact support"; never the word "cancelled".
- **Ended / cancelled (`legacy_lapsed`)** — "Your membership ended on {date}" · primary **Continue your membership** (fresh checkout; legacy members re-subscribe at €150, never €89 — memory `project_bbmi_tiered_pricing_poc.md` "legacy_lapsed… NEVER €89") · **What you keep**: weight history, documents/letters (Semble share portal), prescription history read-only · **What's paused**: booking, prescriptions, messaging (except billing) · "Talk to us" (human call) · a short, non-judgemental "coming off medication" note with the care card and an HPRA-style warning not to buy GLP-1s online (https://www.hpra.ie/news-events/news/article/hpra-warns-of-health-risks-of-semaglutide-type-products-sold-illegally-online).
- **Completed 90 days (`ninety_day_completed`)** — congratulatory summary (start → now, % change, appointments attended) and the existing €150-vs-€75 chooser card; Day-80 call row shown as done.

Data: **B** tier stage + Stripe billing state (open invoice URL) drives all of this; **S** supplies documents for "what you keep".

---

## 6. Copy tone guidance

Base: NHS content standard — "We aim for a reading age of 9 to 11 years old"; plain English first, then the medical term ("piles (haemorrhoids)"); active voice; "Sentences: Maximum 20 words. Paragraphs: Maximum 3 sentences"; "factual, neutral and unambiguous"; numbers not adjectives (https://service-manual.nhs.uk/content/how-we-write). NHS inclusive-content rule: "Check with your users how they want to be described and test your content with them" (https://service-manual.nhs.uk/content/inclusive-content).

| Do | Don't | Why |
|---|---|---|
| "Your next injection is Thursday at 7pm." | "Don't forget your shot!" | Direct, no nagging; reminders should read like a calendar, not a coach. |
| "Nausea is common in the first 2 weeks. Message the nurse if you cannot keep fluids down." | "Side effects are normal, don't worry." | Specific, safety-netted (NHS: avoid vague reassurance). |
| "Your instalment on 3 Oct was unsuccessful." | "You failed to pay." / "Your account is in arrears." | No blame; matches the existing QA copy. |
| "Medication may be prescribed if the doctor decides it is right for you." | "Get your Mounjaro." | HPRA: no product names on public or pre-clinical surfaces; medication is not guaranteed. |
| "3 monthly payments of €150. Next payment 3 Oct." | "€150/month*" | Total commitment visible; billing is the industry's #1 complaint. |
| "People living with obesity", "your weight", "your starting weight" | "obese patients", "ideal weight", "cheat" | Non-stigmatising language **[INFERRED]** from NHS inclusive-content principle and person-first convention used by Irish/European obesity bodies; validate with BBMI's clinical team and members. |
| "Dr Alvin (IMC 123456) will see you." | "Your provider" | Named, registered clinician builds trust. |
| "Call 999 or 112, or go to your nearest emergency department if…" | "Seek medical attention." | NHS care-card rule: one clear call to action per card. |
| "You've logged your weight 6 weeks in a row." | "Streak: 6 🔥" / points, seeds, badges | Acknowledge the evidence-backed behaviour plainly; avoid gamified rewards (Noom Seeds) that trivialise a medical programme **[INFERRED]**. |
| "We'll call you around day 5–7 to see how you're getting on." | "Your Customer Success Manager will reach out." | Plain, human, tells the patient what will happen. |

Voice in one line: *a calm Irish clinic nurse who tells you exactly what to do next, never sells, never scolds.* Use "you/we"; avoid exclamation marks; use Dublin time and euro formatting ("€150", "3 Oct 2026, 7pm").

---

## 7. What Semble gives us vs what we must build

| Capability | Semble (documented) | New portal must add |
|---|---|---|
| Online booking | Widget/URL; choose type, clinician, location, slot; custom questions; pay at booking (Semble Pay incl. Apple/Google Pay); confirmation email/SMS with cancel/reschedule; video link; lead-time limits (https://help.semble.io/set-up-online-booking) | Tier/window rules (8-step MDT windows, Day-20 anchor), role entitlements, weight gate, join-window rendering |
| Reminders | Automated confirmation/reminder/follow-up/cancellation email + SMS templates (https://help.semble.io/appointments) | Dose, weigh-in, check-in, pre-charge reminders |
| Questionnaires | 8 question types incl. file upload + signature; answers "automatically uploaded to the relevant places in their patient record" (https://help.semble.io/overview-of-patient-questionnaires) | Task-list presentation; gating on *join* not *book* |
| Documents | Share via emailed link; DOB/SMS 2FA; view/download; "cannot upload files or send messages" (help.semble.io/patient-share-portal-with-2fa) | In-app document list, patient upload (or via questionnaire file-upload), letters to GP |
| Video | Browser-based, pre-call test, waiting room "knock" (patient guide) | Join button timing, fallback/escalation copy when the clinician is late ("no guidance" in Semble's guide) |
| Invoices/payments | Semble Pay, invoices in portal (semble.io/patient-experience) | Stripe subscription state, instalments, open-invoice resume flow, chooser |
| Messaging | Not documented for patients (help centre hubs list none) | Full patient-initiated, categorised messaging with SLA |
| Treatment loop | None | Dose schedule, log, site map, missed-dose rule, side-effect check-in, dose-review request |
| Progress | None | Weight, waist, photos, non-scale wins, trend |
| Learning / community | None | Stage-keyed content; Circle link |
| Branding | OnBrand: "emails, letters, invoices and the patient portal" with clinic logo/colours | n/a — our portal is the brand surface |

Third-party note: ClinicLink markets a patient-facing portal built on Semble (https://www.cliniclink.io/post/explore-cliniclink-semble-io-a-patient-facing-portal — page returned 404 at fetch time), which corroborates that clinics find Semble's native portal insufficient **[INFERRED]**.

---

## 8. Implications for the new portal

**Must-have**
- Four-tab IA (Home/Today · Treatment · Progress · Care) with one primary card per screen; Account under the avatar.
- Treatment loop (patterns 1–5) and weekly weigh-in + check-in (6–7) — the only evidence-linked engagement levers.
- Patient-initiated, categorised messaging with published SLA (9); Semble has none.
- NHS task list for onboarding; gates on join/prescribe only; Join never overlaid (10, 12).
- 8-step MDT timeline with windows and Day-X-of-90 progress; the QA paused/lapsed designs ported as-is (11, 18).
- Prescription tracker with pharmacy hand-off and run-out date; "review coming" warning before any reassessment (13).
- Billing panel: full-plan cost, next charge, pre-charge reminder, one-click cancel/pause, receipts (17).
- WCAG 2.2 AA target (2.1 AA legal floor under the EAA regs), assistive-tech testing with real members, care cards on symptom surfaces, clinician registration numbers, GP-update consent.
- Copy per section 6; no medication names outside authenticated clinical context.

**Must-not**
- Ship a dose reminder without a prescription behind it (Ro's "erroneous dose-logging prompts").
- Wall out existing members with new gates (175-without-survey lesson).
- Offer a fresh checkout to an overdue member; use the open invoice.
- Put community, upsell or gamified streaks on the €89 home screen.
- Depend on Semble's share-portal link as the patient's document experience — it is a one-way, session-fragile link.
- Use an AI companion for clinical questions in v1.

**Decision needed**
- Where the dose schedule lives (Semble prescription fields vs BBMI-side) and who edits it after a dose change.
- Whether booked MDT appointments survive a paused programme, and what dose guidance a paused patient sees.
- Messaging medium: build (recommended) vs Semble Tasks + email bridge; clinical threads must land in the Semble record either way.
- Community for 90-day: keep Circle external link or embed.
- Auth: Cognito magic link/passkey + step-up vs Semble-issued links only.
- Legal confirmation of EAA applicability and of HPRA rules for authenticated in-portal content.

---

## 9. Open questions

1. Which product did Art mean by "MyTeleDoc"? The one found is CEE-only with no weight programme; myBMI/Webdoctor were substituted.
2. Does BBMI want an injection-day *reminder* only, or full dose logging with a site map (clinical value vs data-entry burden)? Which medication(s) and dose ladders must the missed-dose rule cover — needs Dr Alvin's sign-off.
3. Semble API coverage for the pieces we lean on (bookings with cancel/reschedule, questionnaires, prescriptions, documents, tasks, invoices) — this slice did not test the API; cross-check with the API research slice before committing the IA.
4. Does Semble expose the "Uploaded by Questionnaire" file-upload route for patient uploads, and can a questionnaire be re-opened/edited by the patient? Not documented in the overview article.
5. EAA: is BBMI above the micro-enterprise threshold, and does counsel read the regulations as covering the authenticated portal? (Assumed yes.)
6. HPRA: confirm that dose/medication names inside the authenticated portal for *existing* patients are outside "advertising to the public" (assumed yes; the funnel and emails to leads are not).
7. Response-time promises: what SLA can the current team (nurse, dietitian, coaches, ops) actually commit to per category? The design publishes it, so it must be true.
8. Non-stigmatising vocabulary: run a 30-minute review with BBMI's clinical team and 5 members before locking copy.
9. Which outcome statistics (if any) may be shown in-app, and from what dataset — needed to avoid NextMed-style unsubstantiated claims.

---

## Sources (primary URLs used)

Programmes: https://ro.co/weight-loss/ro-body-program/ · https://www.healthline.com/nutrition/ro-review · https://www.clearmetabolic.com/reviews/ro-review/ · https://www.joinfound.com/ · https://www.weightsherpa.com/guides/found-weight-loss-review · https://www.joincalibrate.com/lp/coaching-and-curriculum · https://www.noom.com/med/glp1-companion/ · https://www.noom.com/in-the-news/noom-launches-free-version-of-its-powerful-glp-1-companion/ · https://www.myjuniper.co.uk/ · https://www.myjuniper.co.uk/articles/best-weight-loss-apps · https://www.eucalyptus.health/research/juniper-uk-12-month-mounjaro-weight-loss-outcomes · https://apps.apple.com/gb/app/juniper-womens-weight-loss/id1661064221 · https://www.joinvoy.com/weight-loss/app · https://www.joinvoy.com/weight-loss/medications/mounjaro · https://apps.apple.com/gb/app/voy-your-health-companion/id6471655955 · https://click.compare/voy/ · https://www.numan.com/weight-loss · https://www.medicspot.co.uk/weight-loss/programmes/medicspot-vs-numan · https://help.secondnature.io/en/articles/2929075-second-nature-app-overview · https://www.secondnature.io/us/mounjaro-weight-loss-programme · https://www.secondnature.io/us/guides/lifestyle/weight-loss-programmes/voy-vs-second-nature · https://www.secondnature.io/us/guides/lifestyle/best-weight-loss-programme-uk · https://www.piko.com/blog/mounjaro-uk-medical-weight-loss-programmes-comparison · https://oviva.com/uk/en/ · https://www.simpleonlinepharmacy.co.uk/online-doctor/weight-loss/mounjaro/ · https://care.simpleonlinepharmacy.co.uk/patient-resources · https://www.weightwatchers.com/uk/how-it-works/glp-1-programme · https://my-bmi.ie/ · https://www.webdoctor.ie/weight-management-services/ · https://myteledoc.app/
Trackers: https://shotsyapp.com/glp-1-tracker/ · https://careclinic.io/wegovy-app/ · https://apps.apple.com/us/app/meagain-glp-1-tracker-app/id6744178534 · https://learnmuscles.com/blog/2025/11/27/6-best-glp-1-tracking-apps-compared-which-app-actually-works-in-2026/ · https://pillo.care/blog/missed-dose-of-wegovy · https://chequp.com/how-to-manage-a-missed-mounjaro-or-wegovy-dose-safely/
Portals: https://www.semble.io/patient-experience · https://www.semble.io/booking-questionnaires · https://www.semble.io/telehealth-patient-engagement · https://help.semble.io/patient-zone · https://help.semble.io/patient-share-portal-with-2fa · https://help.semble.io/video-consultations-patient-guide · https://help.semble.io/set-up-online-booking · https://help.semble.io/overview-of-patient-questionnaires · https://help.semble.io/appointments · https://www.getapp.com/healthcare-pharmaceuticals-software/a/semble/ · https://jane.app/guide/my-account-your-patient-client-portal · https://www.cliniko.com/features/appointments/online-bookings/ · https://www.gethealthie.com/patient-portal
Standards/regulation: https://service-manual.nhs.uk/design-system/patterns · https://service-manual.nhs.uk/design-system/patterns/help-users-decide-when-and-where-to-get-care · https://service-manual.nhs.uk/design-system/patterns/complete-multiple-tasks · https://service-manual.nhs.uk/content/how-we-write · https://service-manual.nhs.uk/content/inclusive-content · https://service-manual.nhs.uk/accessibility-statement · https://service-manual.hse.ie/accessibility · https://service-manual.hse.ie/accessibility/meeting-eu-and-irish-accessibility-requirements · https://about.hse.ie/news/first-version-of-hse-health-app-includes-hospital-appointments-for-expectant-mothers/ · https://reciteme.com/news/european-accessibility-act-in-ireland/ · https://accessibility.ie/ · https://www.thejournal.ie/obesity-advertising-ireland-hpra-6808274-Sep2025/ · https://www.hpra.ie/news-events/news/article/hpra-warns-of-health-risks-of-semaglutide-type-products-sold-illegally-online · Medisec "Standalone Telemedicine" factsheet Jan 2024 (https://medisec.ie/wp-content/uploads/2026/04/Factsheet-Standalone-Telemedicine-Jan-2024-.pdf)
Complaints/enforcement: https://www.ftc.gov/news-events/news/press-releases/2025/07/ftc-takes-action-against-telemedicine-firm-nextmed-over-charges-it-used-misleading-prices-fake · https://www.hunton.com/hunton-retail-law-resource/fitness-app-agrees-to-pay-56-million-to-settle-class-action-alleging-dark-pattern-practices · https://www.trycora.io/blog/glp1-telehealth-cancellation-policies-compared/ · https://medicalfoundationofnc.org/glp1-telehealth-billing-and-cancellation-guide/ · https://www.medino.com/article/best-online-pharmacy-for-weight-loss-uk · https://uk.trustpilot.com/review/www.joinvoy.com · https://uk.trustpilot.com/review/myjuniper.co.uk
Local: `BBM/Claude code/Beyond BMI/BBMI_System_Knowledge_Base/00_INDEX.md`, `…/04a_Frontend_Patient.md`, `BBM/Claude code/Beyond BMI/BBMI_90Day_Build_Spec.md`, memory files `project_bbmi_overdue_member_experience.md`, `project_bbmi_survey_gate.md`, `project_bbmi_90day_booking.md`, `project_bbmi_tiered_pricing_poc.md`, `project_bbmi_semble_implementation.md`.
