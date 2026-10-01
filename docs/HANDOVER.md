# Handover — Beyond BMI patient portal (30 Sep 2026)

For a new Claude session, e.g. front-end work. The hard rules are in `/CLAUDE.md`. Read them first; they are not optional.

## 1. What this is
The new patient portal for Beyond BMI (an obesity clinic in Ireland). It replaces the old Angular patient app (app.beyondbmi.ie).
- **Semble** is the clinical system clinicians work in. The portal reads from and writes to Semble's GraphQL API for everything the patient sees about their care.
- **Beyond BMI's own AWS backend** (Express + Cognito + Stripe) keeps account, sign-in, plan, payments and journey stage. The portal only calls its **existing** endpoints; AWS is frozen, see CLAUDE.md.

Stack: Next.js 16.3 (App Router, server components and server actions), React 19.2, Tailwind v4, lucide-react. Nothing is persisted by the portal itself.

- **Repo:** GitHub `Blackbird-Developers/bbmi-patient-portal`, branch `main`.
- **Local clone on Art's Mac:** `~/Desktop/Work/Obsidian/ZiftiPC/Projects/Beyond BMI/bbmi-patient-portal`.
- **Hosting:** unconfirmed. `DEPLOY.md` (14 Sep) is out of date and describes a Vercel demo project. Nobody has checked whether pushing `main` deploys anything, so **ask Art before any push**. Never run `vercel` or set Vercel env vars.

## 2. Two modes
| | Real mode (what matters) | Demo mode |
|---|---|---|
| Env | `PORTAL_AUTH=cognito`, `SEMBLE_ADAPTER=graphql` | `PORTAL_AUTH=demo`, `SEMBLE_ADAPTER=mock` |
| Sign-in | QA Cognito (pool `eu-west-1_pcB1yvtaf`, public client `5s3aesglete1rdq22vfeu3qfj5`), server-side SRP | the six demo patients, any password |
| Data | QA backend `https://backend.qa.beyondbmi.ie/api/v1` plus the Semble **sandbox** | in-memory mock (`src/lib/semble/mock*.ts`, `src/lib/portal/store.ts`) |
| In code | `user.backend` is set; `authMode() === "cognito"` | `user.backend` is undefined |

**There is a third mode — beware.** `PORTAL_AUTH=demo` **with** `SEMBLE_ADAPTER=graphql` signs in by email allow-list (`PORTAL_ALLOWED_EMAILS`) with no password and writes to the **real sandbox**, while `user.backend` is still undefined. `.env.local` sets `graphql`, so **always set both variables** when starting demo mode. To know whether Semble is real, use `sembleMode()` (`lib/semble/index.ts`), not `user.backend`.

**Which mode is running?** Port 3051 = real, 3052 = demo. The real login asks for email and password. Mock demo shows six persona buttons. Allow-list mode says it's connected to the Semble sandbox. The left-rail "Demo" panel appears only with demo auth. A safe env check that prints no secrets: `grep -E "^(PORTAL_AUTH|SEMBLE_ADAPTER)=" .env.local`.

Every real-mode difference branches on `user.backend` or `authMode()`. **Keep demo mode working:** it is used for presenting. `docs/PRESENTING.md` is Art's demo script. Don't rename, restage or remove the six personas, or change their seeded stages, dates, prices or flows, without Art. Re-run its steps after touching shared components. `PLANS` in `store.ts` is also shown in real mode. In real mode some demo-only things are hidden or return 404: the `/architecture` page, the persona switcher, demo PDFs, the simulated ID check and the GP consent toggle.

## 3. Run it
`.env.local` already exists on Art's Mac, set for real mode. It holds the Semble sandbox token and the session secret: **never print or commit it**. `.env.example` lists every variable with comments. The variables in use are:
- `SEMBLE_ADAPTER`, `SEMBLE_GRAPHQL_URL`, `SEMBLE_API_TOKEN`, `SEMBLE_PRACTICE_TZ`;
- `PORTAL_AUTH`, `PORTAL_SESSION_SECRET`, `PORTAL_ALLOWED_EMAILS`, `PORTAL_DEMO_QUICK_LOGIN`;
- `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`;
- `BBMI_API_URL`, `BBMI_TALLY_URL`, `BBMI_E89_SURVEY_PATH` (which Tally form the €89 patients get).

Optional variables the code reads: `SEMBLE_LOCATION_ID`, `PORTAL_WEIGHT_STALE_DAYS` (default 45), `BBMI_PRICE_ONGOING_75` / `BBMI_PRICE_ONGOING_150`. `PORTAL_ALLOW_PRODUCTION` must stay unset. The `STRIPE_*` entries in `.env.example` are unused placeholders.

```bash
npm install
npm run dev -- --port 3051                                        # real mode (uses .env.local)
SEMBLE_ADAPTER=mock PORTAL_AUTH=demo npm run dev -- --port 3052   # demo mode
```
- In the Claude desktop app, the launch configs in `~/Desktop/Work/BBM/Claude code/.claude/launch.json` are `bbmi-portal-semble` (3051) and `bbmi-portal-mock` (3052). Use `preview_start`.
  - They are found only when the session runs in `~/Desktop/Work/BBM/Claude code`. Don't add a launch.json to the repo.
  - Ignore the old `bbmi-portal` (3050) entry, `start-portal.cmd` and port 3050 in README/PRESENTING.md. They date from the Windows setup.
- **Only one `next dev` per folder:** Next 16 refuses a second one. Stop one mode before starting the other.
- The desktop app stops idle dev servers. If Art says "localhost not working", restart it.
- **Restart after** editing `mock*.ts`, the `store.ts` seeds, `graphql.ts` or any env var. The adapter, the demo store and the caches live on `globalThis` and outlive hot reload. Demo bookings and weights last until a restart. Semble products and clinicians are cached for 5 minutes.
- **Real-mode test login:** `tech+sembletest@blackbird.marketing`. **Art has the password and signs in himself.** It is a QA account at stage `consult_paid`, linked to the Semble sandbox patient "Ernest Hajdini".

**Checks before calling anything done:**
```bash
npx tsc --noEmit
npx eslint src --quiet
npx next build      # safe while a dev server runs (dev builds into .next/dev)
```
**How pages get their data:**
- The layout and pages call `requireUser()` (`lib/auth.ts`), then `loadJourney(user)`, which is React-cached per request.
- In real mode `cognitoUser()` calls `loadBbmiPatient()`, cached for **15 s** per patient.
- After a change, call `invalidatePatient(user.userId)` and `revalidatePath("/", "layout")`.
- For the stage shown to the patient, use `loadJourney(user).state`, not `user.membership.state`.

**Real-mode actions that WRITE somewhere:**
- **Book / Move / Cancel:** Semble, and Semble emails the patient.
- **Log weight:** a permanent QA AWS row, plus Semble.
- **Save contact details:** Semble. A changed address is also added to the backend (POST `/user/address`, an existing endpoint, capped at 6 addresses).
- **Questionnaire:** Tally → QA AWS → copied to Semble.
- **Plans / Pay:** QA Stripe checkout.
- **Change password** and **Sign out everywhere:** QA Cognito.

Even **loading a real-mode page can write to Semble**: it links or creates the patient, sets the BBMI ID, and copies the questionnaire and weights in the background. So sign in only with the documented test login. Claude browses read-only; each write needs Art's OK.

Then prove it in the running app:
- **Demo mode:** load every changed page and confirm no server errors.
- **Real mode:** ask Art to sign in and click through. Check the Semble side with the probe script (section 8).

## 4. Code map
```
src/lib/semble/
  adapter.ts     SembleAdapter interface + SembleAdapterError (codes: not-found, duplicate, slot-taken, unknown-outcome…)
  graphql.ts     the real adapter: reference data (products, clinicians, rooms), availability, book/reschedule/cancel,
                 bookings → Appointment (status from bookingJourney), prescriptions, documents, invoices,
                 createPatient/setPatientNumber, recordIntake (questionnaire copy), syncWeights (weight log)
  mock.ts, mock-data.ts   demo adapter
  link.ts        finds or creates the Semble patient for a Beyond BMI patient (custom patient number "BBMI ID" = Cognito sub)
  time.ts        Semble's naive Dublin wall-clock ↔ UTC helpers
  index.ts       getSemble(); refuses the mock adapter in cognito mode
src/lib/bbmi/
  client.ts, api.ts   typed calls to the Beyond BMI backend (Cognito ACCESS token as Bearer)
  patient.ts          loadBbmiPatient(): builds PortalPatient (plan, stage facts, weights, tasks) + links Semble + background syncs
  intake-sync.ts      copies the Tally health questionnaire (GET /user/health-records) into Semble
  weight-sync.ts      mirrors backend weights into Semble's "Weight log (Beyond BMI)"
src/lib/portal/
  journey.ts     loadJourney(user): effective stage (Semble can move consult_booked/done), upcoming/past, programme,
                 care team (from the patient's own Semble bookings), what the patient can do (can.*)
  gates.ts       booking rules Semble doesn't enforce (plan groups, questionnaire first, 45-day weight, one per role, 90-day windows)
  programme.ts   90-Day Programme steps and windows
  store.ts       PLANS (hard-coded plan copy/prices) + demo data
src/lib/auth.ts, session.ts, cognito.ts   sign-in, AES-GCM session cookie (refresh token only), token cache/refresh, password change, global sign-out
src/lib/background.ts                    inBackground(): Next after() so Semble copies survive the response
src/app/actions.ts, auth-actions.ts      server actions (book, reschedule, cancel, log weight, checkout, billing portal…)
src/app/(portal)/*                       pages: home, appointments, book/[type], programme, progress, prescriptions,
                                         documents, care, plans, account (+billing, password), forms/[slug] (Tally embed)
src/app/api/documents/[id]               streams a shared Semble document (the Semble URL never reaches the browser)
src/app/{checkout/success,pricing,dashboard,join/[id]}   compatibility routes for links the old app/Stripe/emails still use
src/components/{ui,features,shell}       design-system primitives, feature cards, app shell
docs/DESIGN.md (design contract; tokens in src/app/globals.css), docs/PRODUCT.md (scope), docs/research/ (background)
```
`README.md` is partly out of date. It describes demo stage/weights in Semble mode, but real mode now takes these from the backend. Trust this file.

## 5. Semble facts (measured; don't re-derive)
- **Locations and bookability:**
  - Practice "locations" are **rooms**.
  - A product (appointment type) is bookable only if it is ticked under the room's **Services provided**. This is UI-only; the API can't set it.
  - Our sandbox room is **Ernesttest**.
- **Tags and times:**
  - Products carry metadata `portalSlug`/`portalRole`; clinicians carry `portalRoles`.
  - Booking `start`/`end` are **naive Dublin wall-clock with a fake `Z`**. Prescription dates and `sharedAt` are true UTC. `dob` comes back as a midnight timestamp. Country must be ISO-2.
  - `availabilitySlots` subtracts existing bookings.
- **Booking behaviour:**
  - `createBooking` has **no double-booking guard**: the second booking of a slot was accepted in a 30 Sep test. The portal re-reads the diary just before booking.
  - A `pending` booking blocks the slot and never expires on its own.
  - **Attendance** = `bookingJourney { arrived consultation departed dna }`. Semble has no "completed" status. The portal treats an ended booking as attended unless `dna` is set.
  - An attendance change moves `Booking.updatedAt`.
  - **Video:** `videoUrl` exists at creation for video products (`Product.isVideoConsultation`). Phone products get none.
- **Payments:** bookings through the API are always confirmed and never invoiced by Semble. Payments stay in Stripe.
- **Confirmations/reminders:**
  - These come from **Semble templates**: Settings → SMS and Email Templates (**Active**), linked **per product** (Products → "Confirmation and Cancellation messages" / "Reminders").
  - They were activated in the sandbox on 30 Sep. The reminder goes 24 h before. Both carry the join link **and a "Cancel booking" link** (open decision, below).
  - Bookings made before activation get no reminders.
- **Clinical records:**
  - There is **no API** for Vitals, Problems, Medical history or creating questionnaires.
  - `createFreeTextRecord` / `createAllergyRecord` work; `consultationId` groups records. Free-text records read back as `Record.title` (the question) and `Record.term` (the answer).
- **Other API limits:** clinical pathways aren't public API yet. Documents can't be shared with a patient by API; staff do it in the UI. Measured rate limit about 240 requests/minute. Paging returns about 13% duplicate rows, so de-duplicate by id.
- **Bookkeeping markers** live in patient custom attributes: "Beyond BMI questionnaire" and "Beyond BMI weight log". Leave them alone.

## 6. Current state — verified end to end with Art in the running app
Working:
- QA sign-in, change password, sign out on all devices.
- Profile and contact details read from and written to Semble. A changed address also goes to the backend's address list.
- Book, move and cancel into Semble. A staff booking made in Semble shows in the portal.
- "Did not attend" in Semble → the portal shows **Missed** + **Book again**.
- Health questionnaire → Semble (one consultation plus allergy records).
- Each logged weight → Semble's weight log.
- The Semble video link on the home and appointments cards (from 1 h before).
- *(Proven by script, not yet in the app)* Semble confirmation + 24 h reminder emails. `probe-confirm.mjs` made exactly the portal's `createBooking` call after the templates were switched on (30 Sep ~13:25 UTC). No booking has yet been made in the running portal since then. Thu 1 Oct 09:00 was made before, so it has no emails.
- Care team from the patient's own bookings.

The Join button has not yet been pressed live. Art has a portal booking **Thu 1 Oct 09:00 Dublin** to try it.

**Sandbox test data** (log: `Workspace/BBMI_Semble_Sandbox_Log.md`):
- **Linked test patient:** "Ernest Hajdini" `6abb69d04d91ea5d793f7725` (system number `6CX3VWIT1J`, BBMI ID = the QA login's Cognito sub). Bookings:
  - 30 Sep 10:00 (DNA);
  - Thu 1 Oct 09:00 (portal);
  - Thu 1 Oct 10:00 (Semble UI);
  - Fri 2 Oct 09:30 (Semble UI, no clinician).
- **Unlinked test patient** for API probes: `6aba4ac194813ab75b1d6df4`. It has no Cognito login, but its email is on the allow-list used by the third mode (§2).
- **Clinician:** Ernest Hajdini `6aa11cb66985b4434c8db5cd`. **Room:** Ernesttest `6aba5514824b480b104152d8`.

## 7. Pending portal work — none applied; Art decides what gets done
The full evidence and file references are in `Workspace/BBMI_AWS_Semble_Boundary_Audit.md` (67-row table, every problem double-checked). The most useful for front-end work:

| # | What | Where |
|---|---|---|
| N1 | The stage line under the patient's name in the sidebar, and the Account tag, show the **raw AWS stage** ("Consultation paid") while the rest of the app uses the Semble-corrected stage. Pass `j.state` from `(portal)/layout.tsx` into AppShell, and use `loadJourney(user).state` on Account | `components/shell/app-shell.tsx:32`, `app/(portal)/layout.tsx`, `app/(portal)/account/page.tsx:63` |
| N2 | A booking that exists only in AWS (the €89 funnel still books AWS's diary) is invisible. Show a "call the care team" callout when AWS says booked but Semble has none | `lib/portal/journey.ts` (stage override ~122-130), appointments page |
| N3 | Weights: read the chart, history and 45-day gate from Semble's weight log (`Record.title/term`). Write to Semble immediately, not on the next load. **Keep** the AWS POST (the live app uses it) | `progress/page.tsx`, `gates.ts:38,89-93`, `weight-sync.ts`, `actions.ts` logWeightAction |
| N4 | "Annual doctor review due" from the patient's attended Semble doctor bookings, with a guard for members whose history isn't in Semble yet | `bbmi/patient.ts` tasksFrom, `journey.ts` |
| N5 | Product facts from Semble: names, durations, phone vs video. Cards say "· video" even for phone calls | `components/features/appointment-card.tsx:23`, `book/[type]/page.tsx`, `slot-picker.tsx`, `programme.ts`, `store.ts` |
| N6 | GP: copy once to Semble (`addPatientRelationship`), then read `patientRelationships` | `account/page.tsx` (GP line), `bbmi/patient.ts` (facts.gp) |
| N7 | The sleep/quality-of-life (ESS/EQ-5D) and health-coach questionnaires never reach Semble | `forms/[slug]`, new sync like intake-sync |
| N8 | The coordinator "Joanna Bridgett" is hard-coded. Read it from Semble users (`portalRoles` coordinator) | `app/(portal)/care/page.tsx` |
| N9 | The home prescription card uses `prescriptions[0]`, which may be cancelled. Pick the newest non-cancelled | `journey.ts:~176`, `app/(portal)/page.tsx` |
| N10 | Height, goal and BMI: store them as Semble free-text records. In real mode they show as "—" placeholders today | `progress/page.tsx:41-44`, `journey.ts` |
| N11 | Double-booking guard: after `createBooking`, re-read the clinician's diary. If another live booking overlaps and ours is later, delete ours and show "that time has just been taken". Semble sends the confirmation within seconds, so decide with Art whether the delete sends a cancellation (`sendCancellationMessages: true`) | `lib/semble/graphql.ts` book() |
| — | **Plans and prices from Stripe** (Art decided): replace `PLANS` literals. The AWS plans endpoint only returns legacy plans, so this needs a read-only way to fetch Stripe prices | `lib/portal/store.ts`, `plans/page.tsx`, `billing/page.tsx`, home plan card |
| — | The Join button disappears when the appointment's end time passes. It should stay until start + 2 h, which the appointments FAQ already promises (`appointments/page.tsx:240`, untrue today) | `graphql.ts` mapBooking (`ended ? "completed"`), `journey.ts` isUpcoming, `appointment-card.tsx` joinWindow, `appointments/rows.tsx` |
| — | Cosmetic: history rows show the weekday twice ("WED, / Wed, 30 Sept") | `components/features/appointment-card.tsx` AppointmentRow |
| — | Copy: documents page "links expire after 2 hours" is wrong; the plan terms line says "€150" for the €135 referral | `documents/page.tsx`, `billing/page.tsx:42` |

**Rules for copy:** in real mode, don't promise anything Semble or AWS doesn't do. There is no messaging, no content library, no fixed reminder times, no delivery-vs-collection claim, and no pen-storage advice until the clinic signs it off.

**Parked AWS work (do NOT do it):** B1–B8 in the audit — AWS reading Semble, the €89 funnel booking into Semble, reminders and SMS Lambdas, prescriptions delivery, retiring the old diary.

## 7b. Prescriptions to the patient's chosen pharmacy (built 1 Oct, tested in the sandbox)
- **Pharmacy directory:** Semble Contacts tagged `portalKind=pharmacy`. Load them with `node scripts/import-pharmacies.mjs <file.csv> [--write]`. It de-duplicates by email, is safe to re-run, and refuses production without a flag.
  - Test pharmacies: "ZZTest Pharmacy (Blackbird test)" → tech+clinic@blackbird.marketing, and "ZZTest Pharmacy 2" → tech+clinic2@.
  - Art's manager has a spreadsheet of about 10,000 ROI pharmacies with Healthmail addresses. It needs de-duplicating before import (Ireland has roughly 1,900 pharmacies).
- **Patient choice:** a Semble patient relationship of type PHARMACY. A change is add-then-remove, because `updatePatientRelationship` rejects company contacts. Only the portal's own entries (source `contact` + directory id) are replaced.
- **Send** (`lib/pharmacy/send.ts`): emails Semble's prescription PDF to the pharmacy (`lib/mail.ts`: SMTP with TLS, or the dev outbox `.outbox/*.eml`). Once per prescription.
  - **Lock:** one claim attribute per prescription ("Beyond BMI prescription send <id>"). A send goes ahead only when its claim is the only one. An unclear outcome is never retried, and the patient is told to call the care team.
  - **Checks:** a 10-minute minimum and a 30-day maximum prescription age (`PORTAL_RX_SEND_MAX_AGE_DAYS`); Semble status active/issued/signed; the plan includes prescriptions and isn't overdue or lapsed; the button's pharmacy must still be the chosen one.
  - A clinician note "Prescription emailed to pharmacy" goes on the record.
- **Not yet:** real SMTP. It needs `PORTAL_MAIL_TRANSPORT=smtp` plus `PORTAL_SMTP_*` and `PORTAL_MAIL_FROM` in `.env.local`. For Healthmail recipients the sender must be Beyond BMI's own domain (an HSE Connected Agency). Pharmacist and compliance sign-off is still needed on the PDF format and on sending on the doctor's behalf.

## 8. Checking Semble from the terminal
`~/Desktop/Work/Projects/Clients/Beyond BMI/Workspace/semble-probe/q.mjs` runs a GraphQL query against the **sandbox**. It reads the token from the portal's `.env.local` and refuses anything that isn't the sandbox.
```bash
cd ~/Desktop/Work/Projects/Clients/Beyond\ BMI/Workspace/semble-probe
node q.mjs '{ patient(id:"6abb69d04d91ea5d793f7725"){ bookingsWithPagination(start:"2026-09-01T00:00:00Z", end:"2026-12-31T00:00:00Z", pagination:{page:1,pageSize:50}){ data{ id start status videoUrl bookingJourney{ dna } } } } }'
```
Send only `query` operations. `q.mjs` does **not** block mutations. **Writes change the shared sandbox:** only with Art's OK, only on the test patients, with messages off and clean-up afterwards, and logged in the sandbox log.
- `probe-5.mjs` is the silent example: messages off, cleans up after itself.
- `probe-confirm.mjs` deliberately sends a confirmation and temporarily changes the test patient's email. Don't reuse it without Art's OK.

## 9. Decisions
**Made (Art):**
- Work on `main`.
- Patient messaging dropped.
- Video = Semble (Daily dropped).
- Sign-in and business data = Beyond BMI AWS (QA for now).
- Plans and prices = Stripe.
- Reminders = Semble.
- Semble does the migration, and the portal serves migrated patients.
- Prescribing moves to Semble once it's live, tested first.

**Open:**
- **The "Cancel booking" link** in Semble's emails goes around the portal's 24 h / €89 rules. Keep it, or remove the tag from the templates.
- AI consult summaries: the old ones came from Daily recordings.
- The staff routine while AWS is frozen.
- Weights in AWS during the freeze (recommended: keep).
- Tally vs portal forms.
- When the Semble record is created. Today it happens on the first portal page load after the AWS stage leaves "none", so a buyer who never opens the portal has no Semble record.
- Content sign-off: phone and hours, marketing stats, coordinator, clinician photos.

## 10. Where everything else lives (Art's Mac)
- **`~/Desktop/Work/Projects/Clients/Beyond BMI/Workspace/`**:
  - `BBMI_AWS_Semble_Boundary_Audit.md` — the table, plan, test plan and go-live checklist;
  - `BBMI_Semble_Questions.md` — Art's list for the Semble meeting, with what we answered ourselves;
  - `BBMI_Semble_Sandbox_Log.md` — every sandbox write, with rollback;
  - `BBMI_Semble_Migration_Prep.md`.
- **Vault note:** `~/Desktop/Work/Obsidian/ZiftiPC/Clients/Beyond BMI/Semble Patient Portal.md`.
- **Beyond BMI's other repos:** `~/Desktop/Work/Projects/Clients/Beyond BMI/code/` (back-end, Angular app, Lambdas…). Read-only for you: AWS is frozen.
