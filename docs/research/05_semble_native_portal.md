# 05 — What Semble offers natively to patients (reuse / embed vs build)

*Research slice for the new BBMI patient portal · Blackbird Marketing · 2026-09-11*
*Sources: help.semble.io, semble.io product/legal pages, docs.semble.io (public GraphQL docs), trust.semble.io, review sites, one live look at the public login/booking surfaces in a browser. **No live API calls were made** (no BBMI token; ADHD Now's token was not used). Anything not directly evidenced is marked **[INFERRED]**.*
*Companion doc: `Beyond BMI/Workspace/BBMI_Semble_Implementation_Scope_and_Call_Questions.md` (21 Jul) — this report answers its questions 7 & 8 and sharpens 5, 6, 16, 21, 24.*

---

## TL;DR

1. **Semble has no real patient portal in the sense BBMI uses the word.** The "patient portal" is a **document share portal**: the patient gets an emailed link, proves identity with **date of birth (default) or an SMS code**, and can view/download documents the practice has shared. There is **no patient username/password, no native app, no dashboard, no appointment list, no invoice list, no messaging** in that portal. `https://app.semble.io/patient` simply redirects to the **staff** login form (observed 11 Sep 2026).
2. **Online booking is an anonymous public iframe** (`online-booking.semble.io/?token=…`). It identifies the patient by **full name + DOB match**; a mismatch **creates a new patient record**. It cannot know who is logged in, cannot enforce BBMI's entitlement/cooldown/weight/survey gates, and has no "existing patients only" mode. It is a fine acquisition funnel widget; it is the wrong tool for a members-only clinic journey.
3. **Semble Pay is not available in Ireland.** Irish practices use the **Stripe integration (own Stripe account) plus a 0.3% application fee per transaction**. Klarna/Apple Pay/Google Pay/terminals are Semble Pay features. **No recurring card billing exists natively** — "memberships" only auto-*invoice* monthly/annually, first invoice is manual, collection is by emailed payment link; "Direct debit is not available". Stripe stays BBMI's biller.
4. The **API is now much richer than our July scope doc assumed**: **webhooks exist** (HMAC-signed, ~90 event types incl. `booking.*`, `invoice.paid`, `questionnaire.response.received`, `patient.membership.updated`), there is a **sandbox** (`open.sandbox.semble.io`), `createPaymentIntentForBooking` returns a Stripe `clientSecret`, `payInvoice` "charges the patient's stored card token(s)", `fillQuestionnaire` stores answers, `createIntegrationToken` pre-identifies a patient in questionnaire links, and `Patient.sharingToken` is "Token that can be used to access the patient portal".
5. **Video is Whereby**, browser-based, no patient login, link per booking (`Booking.videoUrl`, `[Video link]` template tag), waiting room, up to 200 participants / 24 cameras. **Reuse it** — it replaces Daily.co with zero build.
6. **Automated comms are good enough to reuse for appointments**: confirmation / reminder / follow-up / cancellation / invoice-reminder / review-gathering templates, per product, email + SMS, cancellation link, tags. API bookings send them by default (`sendPatientMessages` all `true`). **No two-way messaging**: email replies go to the practice mailbox, "Patients can not respond to SMS messages".
7. **Questionnaires are decent forms, not clinical instruments**: 8 question types (incl. signature, file upload, medical-term, relationship), conditional visibility, colour styling — but **no scoring**, cannot be reordered without Semble support, identity by name+DOB or a 7-day integration token, answers land in the Consultations tab.
8. **White-label = OnBrand (premium, price unknown)**: logo + secondary asset + one brand colour across booking form, questionnaires, share portal, emails, invoices, letters. **No custom domain is documented anywhere** — every Semble-hosted patient surface will carry a `semble.io` URL.
9. **Data residency**: patient data on **AWS "UK and EU (Ireland)"** (region not chosen by us as far as documented), MongoDB **UK**, Google Cloud backups UK/EU, **SendGrid USA** (email content encrypted, metadata stored), **Whereby "Global (routed to nearest server)"**, Stripe global. ISO 27001:2022, Cyber Essentials Plus, PCI DSS v4.0.1, NHS DSPT. ToS: England & Wales law; transfers outside the UK allowed under SCC/IDTA.
10. **Recommendation in one line**: build identity, dashboard/journey, booking UI, entitlement gating, subscriptions and messaging ourselves on top of the API + webhooks; **embed/reuse** Semble's video, appointment comms templates, questionnaire storage (`fillQuestionnaire`) and the share portal for clinical documents; **do not embed** the public booking iframe inside the logged-in portal.

---

## 1. Inventory of Semble's patient-facing features

### 1.1 "Patient portal" = Patient Share Portal (documents only)

| Aspect | What the evidence says | Source |
|---|---|---|
| Entry | Practice shares a document → patient "will receive this in their email inbox" with a "view document" link. No username/password. | https://help.semble.io/patient-share-portal-with-2fa |
| Identity / 2FA | Practice-wide setting in Settings › General ("Allow secure sharing"): (1) **DOB 2FA — "default option"**; (2) SMS 2FA where mobile exists, DOB otherwise; (3) SMS only — sharing disabled for patients without a mobile. Patient enters DOB or the SMS code. | same; https://help.semble.io/overview-of-settings-semble-help-centre |
| What patients see | "shared documents only" — last shared at top, all previously shared below, download/print icon. Nothing about appointments, invoices, tasks, messages. | same |
| Session | After logout "they will need to follow the link from their email to regain access". Secure links "expire every 24 hours"; opening an expired link auto-resends a fresh one. | https://help.semble.io/how-to-share-or-email-documents |
| What can be shared | Letters, invoices, prescriptions, lab results, consultation notes; two modes — secure link (email carries "no confidential information") or plain PDF attachment (attachments "cannot be unshared"). Staff can revoke all access or unshare specific documents. | same |
| Persistence | "Archived patients retain access to their patient portal and can continue to log in"; existing payment links stay active. | https://help.semble.io/managing-patients |
| Cost | SMS 2FA = "an additional 5p charge per authentication SMS". | https://help.semble.io/sms-pricing-semble-help-centre |
| Login surface | `https://app.semble.io/patient` → redirected to `https://app.semble.io` showing "Welcome back / Log in to Semble / Email address / Password / Forgot password" — i.e. the **staff** login. No patient sign-in form exists. | Browser observation 2026-09-11 |
| API hooks | `Patient.sharingToken.token` = "Token that can be used to access the patient portal"; `Patient.documentsSharedWithPatient` lists `PatientDocumentSharing {documentId, consultationId, recordIds, title, type, sharedAt}`. Webhooks `letter.shared`, `invoice.shared`, `prescription.shared` (no generic `patientDocument.shared`). | https://docs.semble.io/docs/API/objects/patient/ ; …/objects/sharing-token/ ; …/objects/patient-document-sharing/ ; https://docs.semble.io/docs/API/inputs/create-webhook-input/ |
| Marketing claim vs reality | semble.io says patients can "cancel, reschedule and check appointment details without calling your clinic" via "a beautiful patient portal" — **no help-centre article documents any of that**; the only patient self-service for appointments is the **cancellation link in emails** (see 1.7). Treat the claim as unverified. | https://www.semble.io/platform/scheduling-software vs https://help.semble.io/patient-zone |
| User voice | "would be great to set up patients results portal" (Consultant Gynaecologist, Capterra, Jul 2022) — corroborates thinness. | https://www.capterra.com/p/181314/Semble/reviews/ |

### 1.2 Online booking (public form / iframe)

**Patient flow** (https://help.semble.io/set-up-online-booking): choose appointment type → clinician (if `showDoctors`) → slot → "Fill in your details" → "Book appointment" (pay first if enabled) → confirmation email/SMS.

**Identity:** "If a patient's full name and DOB match existing records, the booking automatically links to their file. New patients create new records." Archived patients booking online get **a new file** rather than un-archiving (same article). No login, no email-based matching, no "existing patients only" switch. **[INFERRED]** Anyone with the URL can book; this is inherently an acquisition surface.

**Configuration** (help article + `OnlineBookingConfigurationSettings`, https://docs.semble.io/docs/API/objects/online-booking-configuration-settings/): `title`, `description`, `token`, `status`, `timeSlotFrequency`, `advanceTime` ("The minimum notice for booking"), **`cancelAdvanceTime`** (online-cancellation cut-off), `weeksAhead` ("number of weeks displayed to patient"), `showDoctors`, `hideWeekend`, `onSuccessText` **or** `confirmatioNRedirect` (mutually exclusive per help), `cancellatioNRedirect`, `defaultAppointmentType`, `disclaimerText`, `customAttributes` (custom questions/tick-boxes), `hideFormFields {confirmEmail,title,gender,sex,dob,phone,comments,address}`, `patientIdNumbersToHide`, `forLocationSelection`. Which `locations`, `bookableProducts`, `doctors` appear is per form; "any number of online booking forms" (contract: "unlimited online booking forms"). Age gate: keep DOB visible and patients under the product minimum age "will be blocked from completing the booking". Clinician order = order added to the system, not configurable. No special characters in custom questions.

**Per-product flags** (https://help.semble.io/create-bookable-appointments ; `Product` object): `isBookable`, `isVideoConsultation`, `requiresPayment`, `requiresConfirmation` (manual staff confirmation; shows as outline until confirmed), `duration`, `price`. Online-booking payment mode is one of **pre-payment in full**, **card imprint** ("card details are collected as a guarantee — no charge is made"), or **none**; "Payment applies only to online bookings, not manual ones. Stripe or Semble Pay integration required."

**Embed** (https://help.semble.io/advanced-analytics-integration-with-online-booking):
```html
<iframe src="https://online-booking.semble.io/?token=TOKEN" width="100%" height="800" frameborder="0" scrolling="auto" allow="payment *"></iframe>
```
The widget `postMessage`s `{bookingStatus: 'selecting'|'selected'|'booked', bookingDuration, bookingStart, location, practitioner, productName, productPrice}` from origin `https://online-booking.semble.io` (GA4/GTM recipes given). Klarna does a full-page redirect out of the iframe (n/a in Ireland). Root URL without token shows "Booking link expired or invalid — Contact your practice to book an appointment" (observed).

**Not offered:** waitlist (mentioned only in a marketing blog, no help article — https://www.semble.io/en/blog/online-booking), patient-side reschedule UI, "book again" for a known patient, entitlement checks, per-clinician-type intervals.

### 1.3 Questionnaires

(https://help.semble.io/overview-of-patient-questionnaires ; https://help.semble.io/share-and-embed-a-patient-questionnaire ; https://docs.semble.io/docs/how-to/integration-tokens/)

- Question types: multiple choice, text, multiline text, **medical term** (auto-populates allergies/diagnoses/medications), **signature** ("automatically added to their patient summary"), date, **relationship** (contacts), **file upload** (pdf/docx/xlsx/pptx, images, mp3/wav, mp4/webm). Conditional: "Visibility depends on the answer to another question". Required fields block submit. **No scoring. Cannot reorder questionnaires or insert sections without contacting support. "clinics must never request or collect patient payment card details."**
- Identity: patient types name + DOB; exact match → answers go to the **Consultations tab** of that record; mismatch → **new patient record**. Demographics on the form are *not* written back ("no automatic demographic updates for security"; discrepancies flagged in the note).
- Pre-identified links: `https://questionnaires.semble.io/:questionnaireToken/:integrationToken` — the token comes from `createIntegrationToken` (API) or the `[[integration.token]]` placeholder in email templates; **"valid for one week"**, after which "Failed to load questionnaire".
- Styling: `QuestionnaireStyling` (8 colour fields), `QuestionnaireSettings.showLogo` + capture flags; `Questionnaire.redirectUrl`, `confirmationMessage`, `header`, `footer`.
- API: `fillQuestionnaire(questionnaireId, patientId, answers[{questionId, answer}])` stores a response server-side (signature = base64, files = `{name,type}`); webhook `questionnaire.response.received {patientId, questionnaireId, consultationId?}`.
- Auto-send at booking: product page says questionnaires can be sent "at the time of booking"; mechanically this is a confirmation-template hyperlink `[questionnaire.url]/[[integration.token]]`. No help article documents an in-portal questionnaire list.
- User voice: "Forms not fully customisable" (Director, Capterra, Feb 2025).

### 1.4 Video consultations (Whereby)

(https://help.semble.io/video-consultations-within-semble ; https://help.semble.io/video-consultations-patient-guide ; https://help.semble.io/set-up-video-consultations-semble-help-centre)

- "Video consultations are hosted by Whereby, who are in no way affiliated or associated with Semble." No app; new browser tab; Chrome recommended; avoid VPN/proxy.
- Enable by ticking *Video consultation* on the product and linking clinicians/rooms; link auto-generated per booking; delivered via the `[Video link]` auto-field in the confirmation template; exposed as `Booking.videoUrl` in the API.
- Patient flow: click "Start video consultation" → enter name (+ language) → grant mic/camera → optional pre-call test → "knock" → waiting room (clinician can message) → admitted.
- Features: waiting room, blur/virtual backgrounds, noise cancellation, chat, file share ≤15 MB, screen share (not on mobile), up to **200 participants / 24 active cameras**, participant mute/spotlight controls. Recording, link validity window, early-join and reuse are **not documented**.
- Sub-processor: Whereby — "transient storage only", location "Global (routed to nearest server)". User voice: "video calls… Sometimes they will not connect" (Practice Manager, Capterra, Apr 2022).

### 1.5 Payments — Semble Pay vs the Stripe integration

(https://help.semble.io/semble-pay-faq ; https://help.semble.io/integrating-with-semble-pay-semble-help-centre ; https://help.semble.io/integrating-stripe-with-semble-semble-help-centre ; https://www.semble.io/semble-pay)

| Capability | Semble Pay (UK) | Stripe integration (what **Ireland** gets) |
|---|---|---|
| Availability | UK mainland only. **"Semble Pay is not currently available for practices based in Ireland."** | "Irish practices will use a Stripe integration with an application fee of 0.3% on top of each transaction" — "on a €100 transaction… an additional €0.30 application fee". Connects **your own** Stripe account ("Create or login to your Stripe account"). |
| Fees | Stripe standard + **20% UK VAT**; Klarna 4.99% + 35p. Payouts every 3 business days. | Stripe standard + 0.3% application fee. |
| Online-booking pre-payment / card imprint | ✅ | ✅ ("Stripe or Semble Pay integration required") — patient can tick *Remember these card details*. |
| Payment links on invoices ("Pay Now" opens a new tab) | ✅ | ✅ (`Invoice.paymentLinkUrl` "requires integration"). |
| Card on file (staff-entered, with patient consent) → pay invoice | ✅ | ✅ |
| Apple Pay / Google Pay / **Klarna 3 interest-free instalments** | ✅ (device/account dependent) | **Not documented** for the Stripe integration — **[INFERRED]** Semble Pay-only. |
| Terminals (Stripe Reader S700) | ✅ | ❌ (not documented) |
| Refunds from inside Semble | ✅ full/partial, 5–10 working days | Available "please contact accountmanagement@semble.io" to enable |
| **Recurring / subscriptions / auto-charge** | ❌ not documented | ❌ not documented — see memberships below |
| Deposits (partial up-front) | ❌ not in FAQ; only "in full" pre-payment or card imprint | ❌ |
| Receipt branding | "generic format only" | — |
| Card data location | "stored in Stripe, and not within Semble" | same |

**Memberships** (https://help.semble.io/memberships-semble-help-centre): a *Membership* product "billed monthly or annually"; Settings › Invoice and payment › *Auto invoice*; **"the first invoice must be created manually"** then auto-invoicing runs from the next cycle; **"Direct debit is not available directly through Semble; however, if you're integrated with a payment provider, you can add a payment link to the invoices"**. No cancellation, dunning, or entitlement semantics documented. API: `addPatientMembership(patientId, membershipId, membershipStartDate, comments)`, `removePatientMembership`, `Patient.membershipName/membershipStartDateFormatted`, webhook `patient.membership.updated`, price rules can trigger on membership (`PriceAdjustmentPatientMembershipTrigger`).

**Automated invoicing & payment reminders** (https://help.semble.io/automated-invoicing-and-payment-reminders): reminders "hours, days, or months after an initial invoice", "only be delivered via email and not through SMS", "only for self-paying patients", per-patient opt-out (*Receive payments reminder*), payment link optional in template. Invoice `type` ∈ `invoice | creditNote | paymentOnAccount`; `paidOrOutstanding` ∈ `Paid | Outstanding | Void`.

**API payment surface:** `createPaymentIntentForBooking(bookingId)` → `{clientSecret, paymentIntentId, stripeAccountId}` "for confirming a booking payment on the client" (product must have a payable price); `markBookingPaymentProcessing`; **`payInvoice(invoiceId, amount?, comment?)` — "Pays an invoice by charging the patient's stored card token(s)"**; `payInvoiceWith` (account credit only); `refundPayment`; `addInvoicePayment` (record an external payment); `createPaymentOnAccount`. Whether `payInvoice` works under the Stripe integration (not only Semble Pay) is **not stated** → open question.

### 1.6 Automated & manual patient communications

(https://help.semble.io/sending-automated-emails and the per-template articles)

| Template | Trigger | Notes |
|---|---|---|
| Confirmation | "Sent immediately after an appointment is booked" for linked products | tags, HTML, optional **cancellation link**, `[Video link]`, questionnaire link |
| Reminder | scheduled N hours/days before | multiple per product; cancellation link option |
| Follow-up | N hours/days after | "No follow-up messages will be sent automatically if the appointment is marked as DNA" |
| Cancellation | when the appointment is cancelled | practice alert email optional |
| Invoice / payment reminder | on invoice creation / N after | email only, self-pay only |
| Review gathering | N after appointment | Trustpilot AFS (BCC), Doctify link, Reviews.io per-patient link; Google not supported |

Common rules: templates are linked **per product** (appointment type); "new templates… will not be automatically applied to appointments created prior"; editing a template changes already-scheduled sends; scheduled messages are visible and cancellable in the patient's Communications tab (`cancelScheduledPatientCommunication` in API). SMS: "SMS messages do not support HTML formatting"; the SMS article says **"Currently, hyperlinks are not supported for SMS"** while the reminder article says plain URLs work — **contradiction to test in sandbox**. SMS sender name 3–11 chars, no spaces; **"For Ireland (+353), sender IDs require ComReg registration before displaying the practice name; unregistered IDs default to 'Semble'"**; pricing 5p/segment GBP (contract: €0.06/segment), ~2.5 segments per message.

Manual comms (https://help.semble.io/overview-of-communications): staff send one-off email/SMS from the patient file; Communications tab logs "every email, letter, and SMS message sent or scheduled"; **"When a patient replies to an email, their response will be sent to your mailbox, not to Semble"**; **"Patients can not respond to SMS messages."** Opt-outs: `CommunicationPreferences {receiveEmail, receiveSMS, promotionalMarketing, paymentReminders, privacyPolicy.response}` — both `receiveEmail`/`receiveSMS` must be ticked to send. API: `sendSms`, `sendEmail`.

API bookings: `BookingDataInput.sendPatientMessages {confirmation, reminder, followup, cancellation}` — "All fields default to `true`"; `updateBooking(id, bookingData{start,end,doctor,location,bookingType,comments,sendPatientMessages,status,enforceDoubleBooking})`; `deleteBooking(id, sendCancellationMessages, notifyPractice)` — **hard delete, no `cancellationReason` argument** (the `Booking.cancellationReason` field is staff-UI only). This supersedes the July scope-doc line "API-created bookings do NOT send patient emails unless sendPatientMessages passed" — per current docs the default is *send*; verify in sandbox.

### 1.7 Things Semble does **not** offer patients (confirmed absences)

- Patient credentials (email+password / magic link) or a patient-level account
- Native iOS/Android app ("no app downloads or unexpected software updates" — https://www.semble.io/telehealth-patient-engagement); Semble's own blog shows a clinic **building its own patient app on the API** (https://www.semble.io/en/blog/building-patient-app)
- Appointment list / self-reschedule UI (only an emailed cancellation link with `cancelAdvanceTime` cut-off)
- Two-way messaging / secure chat / SMS replies
- Recurring card billing, dunning, partial deposits, instalments outside Klarna (UK only)
- Weight/measurement logging, progress charts, programme timeline, community — none exist
- Questionnaire scoring (ESS / EQ-5D / King's score must be computed by us)
- Custom domain for any Semble-hosted surface

---

## 2. Embeddability & white-label

| Surface | Embed mechanism | Branding | Custom domain |
|---|---|---|---|
| Online booking | iframe `online-booking.semble.io/?token=` + `allow="payment *"`; postMessage events | OnBrand colour/logo only | none documented |
| Questionnaires | link `questionnaires.semble.io/:qToken/:integrationToken`; iframe embed of questionnaires **not documented** (the "share & embed" article covers email hyperlinks only; a direct navigation to `questionnaires.semble.io` was blocked in our browser sandbox — inconclusive) | `QuestionnaireStyling` colours + `showLogo`; OnBrand | none |
| Share portal | emailed link; `Patient.sharingToken` from API **[INFERRED: can be used to construct the portal URL — format undocumented]** | OnBrand | none |
| Video | `Booking.videoUrl` — open in new tab/iframe (Whereby) | OnBrand does **not** cover video | whereby.com URL |
| Emails/SMS | Semble sends; SendGrid (USA) underneath; SMS sender ID (ComReg for +353) | OnBrand logo/colour; from-address per document category in General settings; custom sending domain **not documented** | — |

**OnBrand** (https://help.semble.io/what-is-semble-onbrand): "premium feature"; logo, secondary asset, one brand colour (auto-adjusted to WCAG 2.2 AA); applies to invoices, emails, patient portal, questionnaires, online booking, letters, documents; preview free, publish requires upgrade via accountmanagement@semble.io; **no fonts, no clinic-name override, no custom domain, no CSS**. Price not published (BBMI's Scale package sheet does not list it — check contract).

---

## 3. Semble Pay — precise support matrix for BBMI (Ireland)

**Supported for BBMI (via Stripe integration):** one-off pre-payment at online booking; card imprint at booking; card on file (consented) charged by staff or via `payInvoice` API [verify]; "Pay Now" links on invoices and in payment-reminder emails; refunds (on request); Xero sync; `createPaymentIntentForBooking` for a custom checkout on the practice's connected Stripe account.

**Not supported / not available:** Semble Pay itself; Klarna instalments; Apple/Google Pay (undocumented on Stripe integration); terminals; recurring subscription charging; dunning/failed-payment retry; deposits; direct debit/SEPA; receipt branding; card collection via questionnaires. Memberships = invoices + links, not subscriptions.

**Consequence:** BBMI's €150/mo legacy, €89 one-off and 90-day tiers **stay in Stripe as they are today**. Semble is a *record* of invoices/payments, not the billing engine. Any Semble-side invoice for a Stripe-billed period must be created and marked paid by us (`createInvoice` + `addInvoicePayment`) or left out entirely (decision needed).

---

## 4. Reminders & comms — what fires automatically and how it is controlled

- Trigger source: **product linkage** in Settings › SMS & email templates → each product's *Confirmation and Reminders* section. Whether the booking was made by staff, the iframe, or the API does not matter, provided `sendPatientMessages` flags are true (default).
- Content controls: tags (first/last name, appointment date/time, clinician, location, `[Video link]`, `[[integration.token]]`, cancellation link, hyperlinks); HTML for email only.
- Suppression: per-patient `receiveEmail`/`receiveSMS`; DNA suppresses follow-ups; `sendPatientMessages.*=false` per booking; `cancelScheduledPatientCommunication`.
- Observability: Communications tab per patient; webhooks give `booking.*` and `invoice.*` events but **no `message.sent/delivered` events** — delivery status of a reminder is not observable via API.
- Liability: ToS 13.2 "expressly excludes any and all liability" for delayed/unsent SMS (https://www.semble.io/terms-of-service).

---

## 5. Build vs embed — recommendation per feature

| Portal feature | Recommendation | Why (evidence) |
|---|---|---|
| Identity / login / session | **BUILD** (keep Cognito or replace, but ours) | Semble has no patient credentials; share portal = link + DOB/SMS; `app.semble.io/patient` is the staff login. Map `cognito_sub ↔ Patient.id` in our DB. |
| Dashboard: journey, timeline, weight chart, tier state, next actions | **BUILD** | No Semble equivalent; Semble exposes `bookings`, `consultations`, `records`, `prescriptions`, `labs`, `invoices` per patient for us to render. |
| Entitlement / booking gates (cooldowns, weight-45d, survey gate, overrides, tier) | **BUILD** (server-side, before we call `createBooking`) | Booking form has only `advanceTime`, `weeksAhead`, `cancelAdvanceTime`, age gate. Nothing conditional per patient. |
| Slot search & booking | **BUILD UI on API** (`availabilities` ≤7-day windows, `createBooking` with `sendPatientMessages` default) | Iframe is anonymous and name+DOB matched → duplicate-record and gate-bypass risk inside a logged-in portal. Keep the iframe **only** as an optional public acquisition widget if BBMI wants Semble-recorded first bookings. |
| Reschedule / cancel | **BUILD** on `updateBooking` / `deleteBooking(sendCancellationMessages:true)`; enforce our own cut-off (mirror `cancelAdvanceTime`); write cancellation reason to `Booking.comments`/metadata since the API has no reason arg | Semble offers only an emailed cancel link; `deleteBooking` is a hard delete. |
| Questionnaires (ONE questionnaire, ESS/EQ-5D/King's score, consent) | **BUILD the form UI; SUBMIT via `fillQuestionnaire`**; listen for `questionnaire.response.received` to flip the survey gate | Doctors then read answers in the Semble Consultations tab; Semble has no scoring and 7-day link expiry; our gate logic needs completion state. Signature/consent forms could alternatively be Semble-hosted links (signature type exists). |
| Clinical documents (letters, prescriptions, labs, notes) | **HYBRID**: list from `Patient.documentsSharedWithPatient` in our UI; open via Semble share portal (`sharingToken`) *or* stream via API if `PatientDocument` exposes a fetchable URL (unverified) | Share portal is secure and already built; DOB 2FA is weak — prefer our own auth if API download works. |
| Video consult "Join" | **EMBED/REUSE** `Booking.videoUrl` (Whereby) | Zero build, no patient login, replaces Daily.co. Confirm link validity window. |
| Appointment confirmations / reminders / follow-ups / cancellations | **REUSE Semble templates** (per product; SMS through Semble; register ComReg sender ID) | Fully configured in Semble; fire for API bookings by default. |
| Billing lifecycle comms (subscription renewals, failed payments, tier changes), programme nudges, weight reminders | **BUILD** (Stripe events → our sender/HubSpot) | Semble payment reminders are email-only and invoice-based; no subscription concept. |
| Payments: subscriptions, €89, tiers, saved cards | **BUILD/KEEP on Stripe**; record into Semble only where useful (`createInvoice` + `addInvoicePayment`) | Semble Pay unavailable in Ireland; no recurring charging; 0.3% fee applies to Semble-initiated charges. Decide whether Semble invoices mirror Stripe at all. |
| One-off in-portal appointment payment (if ever needed) | Option: `createPaymentIntentForBooking` + Stripe.js on the practice's connected account | Keeps Semble's `onlineBookingPaymentStatus` consistent; costs 0.3%. |
| Messaging / secure chat | **BUILD or defer** | Semble has none; replies never enter Semble. |
| Branding of Semble-hosted surfaces (emails, share portal, questionnaires) | **BUY OnBrand** if any of these stay patient-visible | Otherwise Semble logo/colours and semble.io URLs leak into the patient experience. |
| Community | unchanged (Circle) | out of scope for Semble |

---

## 6. Risks & limits

1. **Residency / transfer**: patient data on AWS "UK and EU (Ireland)" — the region for BBMI's tenant is not something we can select per docs; MongoDB "UK"; **SendGrid USA** carries email metadata for every patient email Semble sends; Whereby routes video "to nearest server"; Stripe "may transfer to USA". ToS 19.5.1 pre-authorises "transferring Personal Data outside of the UK" under SCC/IDTA; Privacy Policy relies on the ICO IDTA (21 Mar 2022); EU representative is Semble France SAS. For an Irish controller this needs a DPA with **EU** SCCs/adequacy analysis, not just the UK IDTA. (https://www.semble.io/subprocessors ; https://www.semble.io/terms-of-service ; https://www.semble.io/privacy-policy)
2. **Identity is not Semble's**: DOB-based 2FA is the default (guessable); SMS 2FA costs per send and needs ComReg sender registration for +353. Any Semble-hosted form (booking iframe, questionnaire without integration token) matches on **name + DOB** and silently **creates duplicate patients** on mismatch (typos, married names, archived patients). BBMI already has ~10k Cognito identities — the mapping table is ours to own.
3. **API constraints**: ToS 6.2.8 caps at **240 calls/minute**; availability queries ≤7-day windows and naive Dublin timestamps (from our ADHD Now experience, see scope doc §5); `deleteBooking` is a hard delete with no reason; no `createdBy`; `signIn` tokens 12 h, settings tokens non-expiring (server-side only). Sandbox exists (`open.sandbox.semble.io/graphql`) — confirm BBMI gets one.
4. **Comms edge cases**: templates not retroactive; DNA suppresses follow-ups; SMS hyperlink support contradictory; no delivery webhooks; ToS excludes SMS liability; SendGrid deliverability from a shared Semble domain (custom sending domain undocumented).
5. **Questionnaire rigidity**: no scoring, no reordering without support, 7-day token expiry, "Failed to load questionnaire" UX, no card capture (fine), demographics not written back.
6. **Payments**: Ireland excluded from Semble Pay; 0.3% application fee; `payInvoice` card charging unverified on the Stripe integration; refunds need enabling by account management; Klarna full-page redirect breaks iframe analytics (moot).
7. **Vendor signals**: Capterra/GetApp — support responsiveness complaints ("poor technical support… several weeks", Feb 2025; "unwillingness… to address the issues", Jun 2025), video connection issues, invoice-migration data loss anecdote (1/5 review). Small review base (21–54 reviews).
8. **Marketing vs docs gap**: "cancel, reschedule and check appointment details" in the portal is claimed on semble.io but absent from help.semble.io — do not design around it until Semble demonstrates it.
9. **Cost unknowns**: OnBrand price; SMS 2FA volume; per-transaction 0.3%; Connect task consumption if used for comms.

---

## 7. API surface that makes "build" realistic (reference)

- Auth: `x-token` header; prod `https://open.semble.io/graphql`, sandbox `https://open.sandbox.semble.io/graphql`; credentials are environment-scoped. (https://docs.semble.io/docs/authentication/)
- Webhooks: `createWebhook/updateWebhook/deleteWebhook`; HTTPS only; `X-Webhook-Signature: t=…,v1=HMAC_SHA256(secret, "${timestamp}.${rawBody}")`; retries then `deliveryPaused:true` + email to Technical Contact; manual requeue in Webhook Logs; payload `{subscriptionId, eventId, eventType, identifiers, metadata}` (ids only — fetch the object afterwards). Relevant events: `booking.created/updated/deleted`, `booking.patientJourney.{arrived,inConsultation,completed,noShow}`, `patient.created/updated/merged/archived`, `patient.membership.updated`, `patient.label.added/removed`, `patient.customAttribute.*`, `invoice.created/paid/partiallyPaid/refunded/shared`, `letter.shared`, `prescription.created/shared/eprescription.generated`, `lab.results.added`, `questionnaire.response.received`, `availability.*`, `product.*`. (https://docs.semble.io/docs/webhooks/guide/ ; https://docs.semble.io/docs/API/inputs/create-webhook-input/)
- Patient: `Patient {…, sharingToken, communicationPreferences, membershipName, labels, customAttributes, numbers, onHold, archived, bookings, invoices, letters, labs, prescriptions, consultations, records, patientDocuments, documentsSharedWithPatient}`; `createPatient/updatePatient`, `addPatientLabel`, `addPatientAttribute`, `addPatientAccessGroup`.
- Booking: `createBooking(bookingData{patient, location, bookingType, doctor, start, end, comments, payerId, sendPatientMessages, status})`, `updateBooking`, `deleteBooking`, `updateBookingJourney`, `updateBookingMetadata`; `Booking {videoUrl, status, onlineBookingPaymentStatus, patientMessagesSent, cancellationReason, bookingJourney, metadata}`.
- Payments: `createPaymentIntentForBooking`, `markBookingPaymentProcessing`, `payInvoice` (stored card), `payInvoiceWith` (account credit), `refundPayment`, `addInvoicePayment`, `createInvoice`, `createPaymentOnAccount`; `Invoice.paymentLinkUrl`.
- Questionnaires: `questionnaire(s)` queries, `fillQuestionnaire`, `createIntegrationToken`/`integrationToken`.
- Comms: `sendSms`, `sendEmail`, `cancelScheduledPatientCommunication`.
- Pricing engine: `createPriceProfile/PriceRule/PriceAdjustmentRule` with triggers incl. patient label, membership, metadata, discount code — **[INFERRED]** could express tier pricing for Semble-recorded invoices, but not billing.
- Connect (Workato) — 30,000 tasks/month in contract; triggers/actions list not public (https://help.semble.io/semble-automation-engine). Prefer webhooks + our own worker.

---

## 8. Open questions

**For Semble (add to the call list):**
1. Which AWS region hosts BBMI's tenant — London or Ireland — and can it be fixed to EU (Ireland)? Will Semble sign EU-GDPR SCCs (not only UK IDTA) given SendGrid (USA) and Whereby (global)?
2. Stripe integration: does it connect BBMI's **existing** live Stripe account (with running subscriptions)? Does the 0.3% application fee apply to every charge on that account or only Semble-initiated ones? Does `payInvoice` (stored card) and `createPaymentIntentForBooking` work on the Stripe integration or only Semble Pay?
3. What exactly is the "patient portal" in the sales deck — is there any appointment view / reschedule that the help centre does not document, and is it on the roadmap?
4. Share portal: URL format for `Patient.sharingToken`; token lifetime; can a link deep-link to one document; can documents be **downloaded via API** for rendering in our portal?
5. Can Semble questionnaires be iframed on `patients.beyondbmi.ie` (X-Frame-Options/CSP)? Any plan for scoring?
6. Confirm `sendPatientMessages` defaults for API bookings and whether *reminders* (scheduled) — not only confirmations — fire for API bookings (docs say yes; our July note said no).
7. SMS: are hyperlinks supported in SMS or not (docs contradict)? Will Semble register "BeyondBMI" with ComReg, and what is the lead time?
8. OnBrand price and whether it is in the Scale package; custom sending domain for emails; custom domain for booking/questionnaire pages (assume no).
9. Video: link validity window, early join, recording, and whether Whereby routing can be pinned to EU.
10. Sandbox tenant: included? Same webhook and Stripe test support?

**For Art / BBMI:**
11. Do we mirror Stripe-billed periods as Semble invoices at all (for accounting/Xero), or keep Semble clinical-only? (Drives `createInvoice`/`addInvoicePayment` work.)
12. Is the public €89 funnel to remain on our WordPress/Vercel widget + Stripe, or move to the Semble booking iframe with Stripe pre-payment (0.3% fee, duplicate-patient risk, but Semble-native record)?
13. Who owns the Cognito ↔ Semble patient-id mapping and the one-time backfill for ~10k patients (data migration is excluded from Semble's fee)?
14. Is OnBrand worth buying given the plan to keep patient-visible surfaces in our portal?

---

## Appendix — source index

Help centre: patient-share-portal-with-2fa · how-to-share-or-email-documents · managing-patients · patient-zone · set-up-online-booking · advanced-analytics-integration-with-online-booking · create-bookable-appointments · overview-of-patient-questionnaires · share-and-embed-a-patient-questionnaire · video-consultations-within-semble · video-consultations-patient-guide · set-up-video-consultations-semble-help-centre · troubleshooting-video-consultations · semble-pay-faq · integrating-with-semble-pay-semble-help-centre · integrating-stripe-with-semble-semble-help-centre · memberships-semble-help-centre · automated-invoicing-and-payment-reminders · sending-automated-emails · appointment-reminders · appointment-confirmations-and-reminders · automated-follow-up-messages-to-patients · cancellation-email-and-sms-templates · gather-reviews-through-semble · sms-pricing-semble-help-centre · overview-of-communications · overview-of-settings-semble-help-centre · what-is-semble-onbrand · semble-automation-engine · integration-settings · security-and-semble · set-up-appointment-pathways-semble-help-centre (all under https://help.semble.io/).
Product/legal: https://www.semble.io/patient-experience · /platform/scheduling-software · /telehealth-patient-engagement · /booking-questionnaires · /semble-pay · /integrations-api · /uncompromising-security · /subprocessors · /terms-of-service · /privacy-policy · /en/blog/building-patient-app · /en/blog/online-booking · https://trust.semble.io/ · https://info.semble.io/payments-billing-webinar.
API docs: https://docs.semble.io/docs/authentication/ · /docs/webhooks/guide/ · /docs/webhooks/events/booking/ · /docs/webhooks/events/questionnaire/ · /docs/API/inputs/create-webhook-input/ · /docs/API/inputs/booking-data-input/ · /docs/API/inputs/booking-update-data-input/ · /docs/API/objects/{patient, booking, product, invoice, sharing-token, patient-document-sharing, online-booking-configuration-settings, hide-form-fields, questionnaire, questionnaire-settings, questionnaire-styling, send-patient-messages, communication-preferences, privacy-policy, create-payment-intent-for-booking-payload} · /docs/API/mutations/{create-booking, update-booking, delete-booking, pay-invoice, pay-invoice-with, add-patient-membership, create-payment-intent-for-booking} · /docs/how-to/integration-tokens/ · /docs/how-to/integrate-questionnaires/ · /docs/category/mutations/.
Reviews: https://www.capterra.com/p/181314/Semble/reviews/ · https://www.capterra.co.uk/software/181314/semble · https://www.getapp.co.uk/software/2048991/heydoc · https://www.selecthub.com/p/patient-engagement-software/semble/ · https://pabau.com/blog/semble-pricing/ (competitor blog, pricing indicative only).
Browser observations (2026-09-11): `https://app.semble.io/patient` → staff login; `https://online-booking.semble.io/` → "Booking link expired or invalid".
