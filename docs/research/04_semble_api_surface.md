# 04 — Semble GraphQL API surface for a patient portal (and the constraints we already paid for)

Research slice for the BBMI patient-portal redesign. Written 2026-09-11. No live API was called; every fact is cited to (a) our production Semble code for ADHD Now (`ADHDsemble/`, `ADHD-dashboard/`), (b) the Sep-9 live-introspection write-ups (`ADHD Prescription Automation/docs/`), (c) memory files, or (d) public docs at docs.semble.io / help.semble.io. Inferences are marked `[INFERRED]`.

Path shorthand: `CC/` = `C:/Users/Admin/Desktop/Work/BBM/Claude code/`.

---

## TL;DR

1. **Semble has no patient-facing API auth.** A Settings credential is a practice-scoped, long-lived key passed as `x-token`; `signIn` gives a 12-hour *staff* token; `createIntegrationToken(patient)` is a one-week token for pre-filling Semble-hosted questionnaires/online-booking, not an API credential; `Patient.sharingToken` opens Semble's own Share Portal (DOB/SMS 2FA, documents only). The portal must own identity (our auth) and map user → `semblePatientId` server-side; the practice token must never reach a browser. Verified: docs.semble.io/docs/authentication/, docs.semble.io/docs/how-to/integration-tokens/, help.semble.io/patient-share-portal-with-2fa.
2. **Everything a portal needs to READ exists:** patient profile, bookings (per patient, with date window), invoices + `paymentLinkUrl`, prescriptions + 15-minute `pdfDownloadUrl`, letters (title/body, no PDF), patient documents with a 2-hour reusable `downloadUrl`, `documentsSharedWithPatient` (the natural "what may the patient see" filter), `Booking.videoUrl`.
3. **WRITE is narrower:** create/update/delete bookings (reschedule supported via `updateBooking`), create/update patient demographics, `fillQuestionnaire`, `sendEmail`/`sendSms` (plain text, no attachments), `createPatientDocument` + PUT upload, invoice/payment mutations, `createPaymentIntentForBooking` (Semble's Stripe Connect, not ours). **No** mutation shares/sends an invoice, letter or prescription; **no** prescription mutations at all.
4. **Constraints already learned on ADHD Now and confirmed against docs:** naive Dublin wall-clock with a fake `Z`; availability windows <= 168 h; rate limit is HTTP 200 + "too often" (240 req/min; account-wide edge block under bursts); API bookings must set `sendPatientMessages` explicitly; no `Booking.createdBy`; pagination returns ~13% duplicate bookings (39% prescriptions) and drops ~1.5%; `patients(search)` is fuzzy; `Patient.numbers[].System` is the staff-facing id.
5. **Webhooks exist and are documented** (HMAC-SHA256 signed, IDs-only payloads, per-entity event catalogues incl. `booking.*`, `invoice.paid`, `prescription.created`, `letter.shared`, `questionnaire.response.received`) but are a practice-level feature that may be "disabled" and has an unspecified retry policy. Design = webhook-triggered refetch + periodic `updatedAt` reconciliation + our own cache.
6. **Biggest open decision:** which availability API BBMI's fresh tenant is on (legacy `availabilities` vs New Appointment System `availabilitySlots` with `LocalDateTime` in "practice timezone"), and whether BBMI keeps its own Stripe or adopts Semble Pay.

---

## 1. Entity-by-entity capability matrix

Legend: R = read, C = create, U = update, D = delete. "API" means via the practice token. Sources in the last column.

| Entity | R | C | U | D | Key fields for a portal | Gotchas | Evidence |
|---|---|---|---|---|---|---|---|
| **Practice / Location** | R | – | – | – | `practice{id,name,locations{id,name,servicesProvided{id}}}`; `PracticeLocation.id` = room, `.groupId` = site | Token is bound to one practice ("returns the current API user's practice"). 68 locations at ADHD Now, one room per clinician. | `CC/ADHDsemble/lib/semble.js:134-141`; docs queries/practice; docs how-to get-started-new-appointment-system |
| **User (clinician)** | R | C | U | D(soft) | `users(filters:{isClinician:true}, pagination){id fullName isDoctor servicesProvided{id} registration qualifications}` | `createUser` sends an invite; not a portal concern. | `semble.js:157-163`; `CC/ADHD-dashboard/src/server/clinical-ops/compute.ts:656-675`; memory `reference_adhd_semble_backend.md:74` |
| **Product (booking type)** | R | C | U | D | `products(pagination){id name isBookable duration price color isVideoConsultation requiresPayment requiresConfirmation}`; providers via `User.servicesProvided` and `Location.servicesProvided` | **No currency field**; ADHD Now NI products carry price 0 and are priced in Stripe. `Product` has no `deleted` field (querying it errors). `requiresConfirmation` is ignored on the API path. | `semble.js:165-171`; docs objects/product; memory `reference_adhd_semble_backend.md:52,74,86` |
| **Availability (legacy)** | R | C/U/D via `createAvailability`/`updateAvailability`/`deleteAvailability` (2026-06-22) | | | `availabilities(dateRange!, locationId!, doctorId){data{start end}}`; `availabilitySettings` = full rota, one unpaginated call | **<= 168 h per query**; docs mark it "deprecated for new integrations"; ranges ending 23:59:59 return nothing (query midnight boundaries); returns the configured weekly pattern regardless of date (filter the past yourself); naive wall-clock in, fake-`Z` out. | docs queries/availabilities; `semble.js:459-468, 1054-1057, 482-489`; `README.md:117-142` |
| **Availability (New Appointment System)** | R | – | – | – | `availabilitySlots(dateRange!, userIds, roomIds, locationIds, excludeBookingIds<=5, pagination){data{startLocal endLocal user{id} room{id}}}`; `availabilityRules` (2026-08-05) | "Only available for practices using the New Semble Appointment System" (opt-in via account manager). `startLocal/endLocal` are `LocalDateTime` = "Local wall time consistent with practice timezone. Format: YYYY-MM-DDTHH:mm:ss". `roomIds` = `PracticeLocation.id`, `locationIds` = `.groupId`; a room id passed as `locationIds` returns **empty, not an error**. ADHD Now returned zero rows from it (still on legacy). | docs queries/availability-slots; docs objects/availability-slot; docs how-to get-started-new-appointment-system; `clinical-ops/compute.ts:835-855, 912-918` |
| **Booking** | R | C | U | D(soft) | `booking(id)`, `bookings(dateRange, pagination, options{includeDeleted,createdAt,updatedAt}, filters{metadata,clinicalPathwayId})`, `bookingsById`, `Patient.bookings(start!,end!,queryOptions,pagination)`, `Patient.bookingsWithPagination`. Fields: `id start end status deleted cancellationReason doctor{} doctorName location{id name address} appointment{id title duration price} patient patientId bookingJourney{arrived consultation departed dna} createdAt updatedAt videoUrl comments reference metadata billed patientMessagesSent onlineBookingPaymentStatus clinicalPathwayId` | **No `createdBy`** (docs + Semble support May 2026). **No `patientId` filter on `bookings`** — go through `patient(id){bookings}`. `bookings(dateRange)` rejects naive datetimes ("Invalid date"), `availabilities` accepts them. Docs say the range matches "start **or** end"; we measured start-only — pad 6 h backwards either way. Cancellation = soft delete (`deleted:true`, `cancellationReason` stays empty on 13,049 rows); pass `options:{includeDeleted:true}` to see them. Confirmation email fires **at** `createBooking`. `status` enum `pending|processing|confirmed|failed`: API default `confirmed`; `pending` suppresses the email **and** hides the row; `confirmed→pending` rejected. No server-side double-booking guard on create (three guards in our code). | docs objects/booking, queries/bookings, inputs/booking-query-filters, objects/patient; `semble.js:181-203, 535-563, 589-593, 632-636`; `CC/ADHDsemble/handlers.js:416-497, 616-623`; `kpi/semble.ts:370-374`; `CC/ADHD-dashboard/docs/booked-revenue-review.md:106-114`; memory `reference_adhd_semble_backend.md:35,82-89` |
| **Booking mutations** | | `createBooking(bookingData:{patient! location! bookingType! doctor! start! end! comments payerId sendPatientMessages{confirmation reminder followup} status})` | `updateBooking(id!, bookingData:{location bookingType doctor comments start end sendPatientMessages status enforceDoubleBooking})` | `deleteBooking(id!, sendCancellationMessages, notifyPractice)` | `updateBookingMetadata` (key<=40, value<=500, <=50 keys) lets us stamp `portalUserId`/`portalBookingId` on the Semble row. | Docs say `sendPatientMessages` "defaults to true"; we measured API bookings sending nothing unless set — **always set it explicitly**. `enforceDoubleBooking` exists only on update ("strict reschedule validation (overlap + product rules)"). `updateBooking` cannot change `patient`. | docs mutations/create-booking, inputs/booking-data-input, inputs/booking-update-data-input, mutations/delete-booking, inputs/send-patient-messages-input, mutations/update-booking-metadata; `semble.js:810-839, 846-850` |
| **Patient** | R | C | U | D / archive | `patient(id)`, `patients(search, pagination, cursorPagination, options)`. Fields: `id title firstName lastName fullName dob gender sex email phones[] address{address city postcode country} numbers[{name value}] labels[{text color}] customAttributes communicationPreferences{receiveEmail receiveSMS promotionalMarketing paymentReminders privacyPolicy} sharingToken{token} onHold archived createdAt updatedAt` + sub-collections `bookings invoices(start!,end!) letters labs prescriptions(page,pageSize) consultations records patientDocuments documentsSharedWithPatient(page,pageSize=10)` | `patient(id:)` throws `Cast to ObjectId failed` for anything but a 24-hex id. `patients(search)` is fuzzy across first/last/email/dob ("Joseph" → 27 hits); never accept a non-exact match. `numbers[]{name:"System", value:"7O5PO1H46J"}` = the id staff see (present on 929/929 invoices). `labels{text}` not `title` (field error zeroes the query). `CreatePatientDataInput` has **no required fields** (`first last email dob gender sex address city postcode country phoneType phoneNumber paymentReference communicationPreferences labels customAttributes comments`). `UpdatePatientDataInput` has **no phone** (use `add/update/removePatientPhoneNumber`) and no custom attributes (separate mutations). Address fields are free text and get polluted by intake forms (22% of ADHD Now `city` values are a pharmacy). | docs objects/patient, queries/patients, how-to search-patients, inputs/create-patient-data-input, inputs/update-patient-data-input; `semble.js:205-239, 680-738`; `receipts/compute.ts:410-425`; `receipts/config.ts:376-389`; `kpi/semble.ts:619-623`; `CC/ADHD Prescription Automation/apps_script/README.md:137-146` |
| **Invoice** | R | C | U | D | `invoice(id)`, `invoices(dateRange, pagination, options)`, `Patient.invoices(start!,end!)`. Fields: `id invoiceNumber date status(active/cancelled) paidOrOutstanding(Paid/Outstanding/Void) type(invoice/creditNote/paymentOnAccount) total outstanding tax refunded lineItems[{referenceType referenceId title date quantity price total}] payments[{paymentAmount paymentSource paymentDate}] refunds[] paymentLinkUrl dateShared patient doctor{fullName title registration qualifications} patientTitle patientDob createdAt updatedAt` | `invoices(dateRange)` filters the **invoice's own date**; payments landing months later are only visible via `options:{updatedAt}` (~138 invoices change / 91 become paid per 24 h at ADHD Now). Invoices routinely **predate** the appointment (package billed up front; max gap 610 d). `LineItem.referenceType='Booking'`+`referenceId` = exact booking join, 100% populated. **No PDF/download URL on Invoice** (we render our own receipt). `dateShared` read-only; no share mutation; `paymentSource` enum reads badly (`STRIPE`). Mutations: `createInvoice addLineItem updateLineItem deleteLineItem addInvoicePayment updateInvoicePayment deleteInvoicePayment payInvoice(invoiceId!, amount, comment)` (stored card), `payInvoiceWith` (account credit), `refundPayment`, `createPaymentOnAccount`. | docs objects/invoice, mutations/pay-invoice; `receipts/compute.ts:36-41, 239-250, 299-309`; `receipts/config.ts:12-16, 160-170`; `receipts/render.ts:57-70`; memory `reference_adhd_receipts.md:19-31` |
| **Prescription** | R | – | – | – | `prescription(id)`, `prescriptions(dateRange, pagination, cursorPagination, options, filters{clinicalPathwayId})`, `Patient.prescriptions(page,pageSize)`. Fields: `id patient doctor date status comments drugs[{code drug dosage quantity repeatDetails}] items[] prescriptionType dateShared pdfDownloadUrl orders[]` | **Zero mutations** (all 128 checked). `pdfDownloadUrl` = "A time-limited URL (15 minutes) ... null if the prescription has incomplete data"; 300/300 populated, downloaded one = real PDF. `createdAt/updatedAt` "not applicable" → no `updatedAt` polling; filter by issue-date range only. **39% duplicate rows** across pages. Structured drug data is thin (`code` empty 315/315). `orders[]` = UK pharmacy-fulfilment concept, inert here. | docs objects/prescription, queries/prescriptions; `CC/ADHD Prescription Automation/docs/SEMBLE_RX_FINDINGS.md:13-25, 45-67, 184-187`; memory `reference_adhd_semble_backend.md:128-138` |
| **Letter** | R | C | U | D | `letter(id)`, `letters(dateRange, options)`, `Patient.letters`. Fields: `id deleted reviewStatus(NONE/AWAITING_REVIEW/AWAITING_CORRECTION/COMPLETED) patient doctor location date title(<=128 bytes) body recipient{id name email kind} dateShared createdAt updatedAt` | `createLetter(letterData:{patient! title! body! doctor recipient contact location date reviewStatus})` works; **no share/send mutation**, `UpdateLetterDataInput` has no `dateShared`. **No PDF url on Letter** — the portal renders `body` itself. `letter.shared` webhook exists. | docs objects/letter; `apps_script/README.md:113-121`; memory `reference_adhd_semble_backend.md:144-163`; docs webhooks/events/letter |
| **PatientDocument** | R | C (+PUT) | rename | D | `patientDocument(id)`, `patientDocuments(options)`, `Patient.patientDocuments(page,pageSize)`. Fields: `id title name(<=128) type url parent deleted dateShared dateCreated dateModified uploadUrl downloadUrl shareDetails[SharingRecipient]` | `createPatientDocument(patient!, name!, type!)` → `{data:PatientDocument, error}`; then PUT binary to `uploadUrl` ("short lived"). `downloadUrl` "Expires after two hours, reusable". No share mutation; webhook events are `patientDocument.uploadInitiated/renamed/deleted` only (no `shared`). | docs objects/patient-document, mutations/create-patient-document, objects/new-patient-document-payload, webhooks/events/patient-document |
| **documentsSharedWithPatient** | R | – | – | – | `Patient.documentsSharedWithPatient(page,pageSize){documentId consultationId recordIds title type sharedAt}`; `type` enum `invoice creditNote paymentOnAccount letter lab rx document consultation accountstatement hospitalbookingformdata` | This is the API view of what the clinic has clicked "Share" on — the only signal of patient-visibility for consultations/records (`Record.dateShared` also exists). `[INFERRED]` use it as the portal's allow-list. | docs objects/patient, objects/patient-document-sharing, enums/patient-shared-document-kind, objects/record |
| **Questionnaire** | R (templates) | fill | – | – | `questionnaire(id)`, `questionnaires(pagination, cursorPagination, options)`: template shape `id token title confirmationMessage redirectUrl styling settings header sections footer`. `fillQuestionnaire(questionnaireId!, patientId!, answers:[QuestionnaireAnswerInput!]!)` → `QuestionnaireResponsePayload`. Hosted form: `https://questionnaires.semble.io/:questionnaireToken/:integrationToken` (pre-filled). | Responses land as a **Consultation** (`Consultation{questionnaireId encounterType records[]}`; webhook `questionnaire.response.received{patientId questionnaireId consultationId}`). Reading a patient's answers back = `Patient.consultations` → `records[]` `[INFERRED — not documented as a read path]`. Answer scalar varies by question type (Relationship = object; signature = base64). | docs objects/questionnaire, mutations/fill-questionnaire, how-to integrate-questionnaires, how-to integration-tokens, objects/consultation, webhooks/events/questionnaire |
| **Consultation / Record** | R | free-text/allergy records C/U/D | | `deleteConsultation` | `Consultation{id patient date encounterType doctorName questionnaireId records[] deleted}`; `Record{id recordType title date observation ... dateShared createdAt updatedAt}` | Clinical notes — **no patient-visibility flag** beyond `dateShared`. Do not surface unless shared. | docs objects/consultation, objects/record, mutations/create-free-text-record |
| **Patient communications** | R (per patient) | `sendEmail`, `sendSms` | cancel scheduled | – | `sendEmail(patientId!, subject!, message!, dateToProcess)` → `SendEmailPayload{data:Email, error}`; `sendSms(patientId, message, dateToProcess)`; `cancelScheduledPatientCommunication(id)`; `patientCommunications(options:{patient! dateToProcess communicationType[] status[]})` | **No attachment and no template argument** (even though `Email.attachments` exists on the return type). Arrives branded from the practice sender, HTML survives. `patientCommunications` is per-patient only and "communications of type Share are not supported". Check `communicationPreferences.receiveEmail` first. SMS = €0.06/segment on BBMI's contract. | docs mutations/send-email, queries/patient-communications, inputs/patient-communication-query-options; `apps_script/README.md:54-99`; memory `reference_adhd_semble_backend.md:99-116`; memory `project_bbmi_semble_implementation.md:16` |
| **Video** | R | – | – | – | `Booking.videoUrl` ("Video consultation link"); `Product.isVideoConsultation` | Whereby-hosted, no patient account; the link normally reaches the patient via the confirmation-email auto-field. `[INFERRED]` `videoUrl` is populated for video products and can back a "Join" button; unverified when it is populated (create time vs. later). | docs objects/booking; help.semble.io/video-consultations-within-semble |
| **Webhooks** | R | C | U | D | `createWebhook(input:{url(HTTPS) eventTypes[String!]! label headers})` → `{id, secret}`; `webhooks`, `webhook(id)`; `WebhookSubscription{id secret url label eventTypes headers version createdAt updatedAt deleted deliveryPaused}` | Headers `X-Webhook-Signature: t=<unix>,v1=<hex hmac-sha256>` over `<timestamp>.<raw body>` with the secret; `X-Webhook-Timestamp`. Payload = `{subscriptionId eventId eventType identifiers{...} metadata?}` — **IDs only, no entity body**; optional keys omitted. Logs kept 30 days; failures "retried a number of times" (schedule unspecified). `updateWebhook` "Requires editWebhooks permission"; `deleteWebhook` "Rejects if webhooks are disabled" → webhooks are a practice feature flag. Event catalogue: `booking.created/updated/deleted`, `booking.patientJourney.arrived/inConsultation/completed/noShow`; `patient.*` (21 types); `invoice.created/updated/deleted/lineItems.added/removed/paid/partiallyPaid/refunded/shared/...`; `prescription.created/deleted/ordered/eprescription.generated/recordedInError/shared`; `letter.created/deleted/reviewStatus.updated/shared`; `patientDocument.uploadInitiated/renamed/deleted`; `questionnaire.response.received`; plus availability, contact, episode, lab, location, pathway, payment-on-account, product, webhook. | docs webhooks/guide, webhooks/events/*, mutations/create-webhook, update-webhook, delete-webhook; `SEMBLE_RX_FINDINGS.md:162-187` |
| **Integration token** | R | C | – | – | `createIntegrationToken(patient: ID!)` → `IntegrationTokenPayload{token}`; `integrationToken` query "fetching the integration token of a patient" | "Integration token for a patient that can be used in a questionnaire or online booking"; **valid one week**; use = append to the hosted questionnaire / online-booking URL so the patient is matched without re-entering details. It is **not** an API credential and grants no GraphQL access. | docs how-to integration-tokens, objects/integration-token, mutations/create-integration-token |
| **Labels / custom attributes** | R | C | U | D | `labels`, `addPatientLabel/removePatientLabel`, `add/update/removePatientAttribute`, `Patient.labels{text color}`, `patient.label.added/removed` webhooks | Usable as the Semble-side mirror of BBMI tier/state (e.g. a "Portal: 90-day tier" label) `[INFERRED]`. | docs category/mutations; `kpi/semble.ts:619-623` |
| **Payments (Semble Pay)** | R | C | – | – | `createPaymentIntentForBooking(bookingId!)` → `{clientSecret paymentIntentId stripeAccountId error}`; `markBookingPaymentProcessing`; `bookingTerminalPaymentStatus`; `Invoice.paymentLinkUrl` | "Creates a Stripe PaymentIntent for an existing booking so the partner can confirm payment in the browser. The booking must belong to the authenticated practice and have a payable price on its booking type product." `stripeAccountId` = practice's **connected** Stripe account → this is Semble Pay, not BBMI's existing Stripe. Recurring subscription billing is not modelled anywhere (invoices/appointment-based only). | docs mutations/create-payment-intent-for-booking, objects/create-payment-intent-for-booking-payload; release notes 2026-06-03/06-16/07-06/07-20; memory `project_bbmi_semble_implementation.md:24` |

---

## 2. Portal operations → Semble operations

| Portal need | Semble op(s) | Notes / what is NOT possible |
|---|---|---|
| **My profile (read)** | `patient(id:$semblePatientId){ title firstName lastName dob gender email phones{phoneType phoneNumber} address{...} numbers{name value} communicationPreferences{...} labels{text} onHold archived }` | Show `numbers[System]` as "Your patient ID" — it is what reception sees. Address fields may contain non-address text; sanitise before display (`receipts/config.ts:390-424`). |
| **My profile (edit)** | `updatePatient(id, patientData:{first last email dob gender address city postcode country communicationPreferences comments})`; phones via `addPatientPhoneNumber / updatePatientPhoneNumber / removePatientPhoneNumber` | Decide which fields a patient may self-edit (email/phone/address yes; name/DOB probably staff-only — identity fields). `patient.updated`/`patient.phone.*` webhooks let the portal cache invalidate. |
| **My appointments** | `patient(id){ bookings(start, end, queryOptions:{includeDeleted:false}) { id start end status appointment{title duration price} doctorName location{name} videoUrl bookingJourney{dna} comments reference billed onlineBookingPaymentStatus } }` (or `bookingsWithPagination` for `meta.totalCount`) | Convert `start/end` with `fromDublinLocalIso` before display (`semble.js:774-798`). Cancelled bookings are `deleted:true` — request `includeDeleted:true` if the UI should show "cancelled". `start!`/`end!` are required on the patient sub-field, so a "next 12 months" window is a design choice. Dedupe by `id`. |
| **Availability** | Legacy: `availabilities(dateRange<=168h, locationId, doctorId)` over the real (doctor,location) pairs from `availabilitySettings`, minus live `bookings(dateRange padded −6h)`, sliced into `Product.duration` slots, minus past/lead-time. New system: `availabilitySlots(dateRange<=168h, userIds, roomIds)` returns bookable slots directly (`startLocal/endLocal`). | Reuse the ADHDsemble engine (`semble.js:881-1094`) — it already handles chunking, rota pairs, concurrency cap, 5-min cache and booking subtraction. Legacy availability does **not** subtract bookings and does **not** filter the past. Which system BBMI's tenant is on is unknown (Open Q1). |
| **Book** | pre-checks `findDuplicateBooking`, `findExistingBookingAt` (`semble.js:639-678`) → `createBooking(bookingData:{patient location bookingType doctor start:toDublinLocalIso end:toDublinLocalIso sendPatientMessages:{confirmation reminder followup} comments})` → post-check `findOverlappingBookingForDoctor` (loser cancels with `sendCancellationMessages:false`) → `updateBookingMetadata(portalBookingId, portalUserId)` | Confirmation email is sent by Semble the moment `createBooking` succeeds (`semble.js:632-636`) — do pre-checks first. The 12-hour lead time (`semble.js:282`) is our rule, not Semble's. Payment: if BBMI keeps its own Stripe, follow ADHDsemble's PaymentIntent-first flow (`handlers.js:151-257, 341-414`); if Semble Pay, `createPaymentIntentForBooking` after a `pending` booking (Open Q2). |
| **Reschedule** | `updateBooking(id, bookingData:{start end doctor location enforceDoubleBooking:true sendPatientMessages:{confirmation:true}})` | Single mutation; Semble sends the updated confirmation if messages are on (`[INFERRED]` from `SendPatientMessagesInput` applying to "creating/updating a booking"). Re-run availability for the new slot first — `enforceDoubleBooking` is the only server-side guard and exists only here. |
| **Cancel** | `deleteBooking(id, sendCancellationMessages:true, notifyPractice:true)` | Soft delete; the row keeps `deleted:true`. BBMI cancellation-policy logic (cut-offs, fees, cooldowns) is ours — Semble has none. |
| **My documents / letters** | `patient(id){ documentsSharedWithPatient(page,pageSize){documentId title type sharedAt consultationId recordIds} }` as the allow-list; then `patientDocument(id){downloadUrl}` (2 h, reusable — proxy it), `letter(id){title body date doctor{fullName}}` (render body; no PDF), `invoice(id)`, `prescription(id){pdfDownloadUrl}` | **NOT possible:** marking something as shared via API (no share mutation for invoice/letter/prescription/document). If the portal is to show documents that staff have not clicked "Share" on, the portal defines its own visibility rule — a clinical-governance decision (Open Q4). |
| **My prescriptions + PDF** | `patient(id){ prescriptions(page,pageSize){ data{ id date status drugs{drug dosage quantity repeatDetails{repeat refills}} doctor{fullName} pdfDownloadUrl dateShared } } }`; stream the PDF server-side within 15 min | **NOT possible:** creating, re-issuing, sending to a pharmacy, or emailing the Rx from Semble. Pharmacy delivery (Healthmail) is a separate, non-Semble leg (`reference_healthmail_integration.md`). Never persist `pdfDownloadUrl`; fetch on click. |
| **My invoices / payments** | `patient(id){ invoices(start,end){ id invoiceNumber date total outstanding paidOrOutstanding type lineItems{title date total} payments{paymentAmount paymentSource paymentDate} paymentLinkUrl } }`; unpaid → link to `paymentLinkUrl` (Semble-hosted) or `payInvoice` (stored card) | **NOT possible:** an invoice PDF from the API (render our own, as `receipts/render.ts` does). BBMI's monthly membership is **not** an invoice-per-appointment model; Semble cannot bill subscriptions (`project_bbmi_semble_implementation.md:24`). Expect most portal "payments" to remain Stripe-side with Semble invoices as the clinical/financial record (Open Q2). |
| **Questionnaires / forms** | Option A (hosted): `createIntegrationToken(patient)` → link `https://questionnaires.semble.io/:questionnaireToken/:integrationToken`, embed or redirect; completion arrives as `questionnaire.response.received`. Option B (native): render `questionnaire(id){sections}` in the portal, submit via `fillQuestionnaire(questionnaireId, patientId, answers)`. | Reading answers back is via `Patient.consultations` → `records[]` `[INFERRED]`. BBMI's survey gate / Tally forms would be replaced or mirrored here (see 03_ research on the existing survey gate). |
| **Messages / notifications** | `sendEmail(patientId, subject, message)`; `sendSms(patientId, message)`; consent = `communicationPreferences.receiveEmail/receiveSMS` | **NOT possible:** attachments, templates, practice-wide message history, patient→clinic inbound messaging. A two-way "messages" feature must be built in the portal (our DB) — Semble only provides outbound comms logged on the record. |
| **Video link** | `booking(id){videoUrl}` | Show "Join video consultation" when `videoUrl` is non-null and the appointment is near; otherwise the patient relies on Semble's confirmation email. Whether `videoUrl` is set at create time is unverified (Open Q5). |
| **Identity bootstrap (sign-up → Semble)** | `patients(search:$email)` filtered to an exact case-insensitive email match (`semble.js:680-688`); else `createPatient(patientData)`; store the returned `id` | Never trust the first fuzzy result. Semble's committed HubSpot→patient integration also creates patients labelled `New HubSpot Import` (`project_bbmi_semble_implementation.md:21`) — the portal must handle "patient already exists" as the normal case. |

---

## 3. Auth model: who the portal is, and why the token stays server-side

**What Semble offers (verified against docs):**
- Settings credential: created in Settings → API Access → New, "assign a role to this"; passed as `x-token`; "Tokens are very flexible and will control what the API user has access to. For example, you can generate a token that only has access to the `patient` query, or ... bookings but not patients." Settings credentials "are not bound to a person" (docs.semble.io/docs/authentication/; help.semble.io/api-access). ADHD Now's token is a ~249-char JWT (`reference_adhd_semble_backend.md:20`).
- `signIn` mutation: staff username/password → token "valid for 12 hours" (docs authentication; help.semble.io/api-access "sign in at the start of every day").
- `createIntegrationToken(patient)`: one-week, patient-identifying token for Semble-hosted questionnaire/online-booking URLs; grants no GraphQL rights.
- `Patient.sharingToken.token`: "token used to access the patient portal" = Semble's Share Portal, whose 2FA is DOB or SMS code and whose scope is viewing shared documents (help.semble.io/patient-share-portal-with-2fa).
- There is **no** OAuth, no patient login mutation, no per-patient API scope. `practice` "returns the current API user's practice" — every token sees the whole practice.

**Consequence (design rule, not inference):**
1. The portal owns authentication (Cognito today; whatever the portal chooses). The portal DB stores `user_id → semble_patient_id` (24-hex ObjectId) plus the staff-facing `numbers[System]` value for support conversations.
2. Every Semble call is made by the portal **backend** with the practice token; every query is **scoped by the backend** to the caller's `semble_patient_id` (`patient(id:)` sub-fields, or `booking(id)` checked against `booking.patientId` before returning). A browser holding the practice token could read all ~10k patients, every invoice and every prescription in the practice, and could create/cancel any booking — the credential is practice-wide by construction. This is the same reason ADHDsemble keeps the token in Secret Manager and ADHD-dashboard in `SEMBLE_TOKEN` server env (`README.md:314-326`; `kpi/env.ts:35-40`).
3. Issue a **dedicated, least-privilege Settings credential** for the portal (role limited to the queries/mutations in section 2), separate from any ops/dashboard credential, so it can be revoked alone. The 12-hour `signIn` token is unsuitable for a service.
4. Object-level authorisation is ours: on every `booking(id)`/`invoice(id)`/`prescription(id)`/`patientDocument(id)` fetch, assert the object's `patient.id` (or `patientId`) equals the session's `semble_patient_id` before returning or proxying a download.
5. Webhook ingestion verifies `X-Webhook-Signature` (HMAC-SHA256 over `<timestamp>.<raw body>`) with the stored `secret`, rejects stale timestamps, and treats `identifiers` as untrusted ids to refetch — never as data.
6. Downloads (`pdfDownloadUrl` 15 min, `downloadUrl` 2 h) are fetched by the backend and streamed to the browser; the Semble URLs are never exposed (they are unauthenticated bearer links).

---

## 4. Sync strategy: webhook + reconciliation + cache

**Facts that constrain it**
- Webhook payloads carry ids only (`{subscriptionId eventId eventType identifiers}`), so every event costs one or more refetches (docs webhooks/events/).
- Retry schedule is unspecified ("retried a number of times"), logs are 30 days, `deliveryPaused` exists on the subscription, and the feature can be "disabled" for a practice (docs webhooks/guide; mutations/delete-webhook). So webhooks are a latency optimisation, not the source of truth.
- `QueryOptions.updatedAt` works on `bookings invoices patients letters patientDocuments products records` (docs inputs/query-options) but **not** prescriptions (`SEMBLE_RX_FINDINGS.md:184-187`).
- Pagination duplicates ~13% of bookings (13,049 rows / 11,340 ids over 180 d) and drops ~1.5%; prescriptions duplicate ~39% (`booked-revenue-review.md:110-114`; `SEMBLE_RX_FINDINGS.md:64-66`; memory `reference_adhd_semble_backend.md:172-174`). `cursorPagination` (2026-07-14) is documented on `patients`/`questionnaires`/`prescriptions` ("Use the last patient's id as cursor ... ordered by _id ascending") and `[INFERRED]` avoids the offset-drift that causes the duplicates; `bookings` docs list only `pagination`.
- Semble returns naive Dublin wall-clock tagged `Z` on `Booking.start/end` (`semble.js:746-755`; `appointments/compute.ts:115-137`); `LocalDateTime` fields on the new system are explicitly "practice timezone".

**Options**
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| A. Live pass-through (no cache) | Simplest; always current | Every page view = several Semble calls per patient; 240 rpm shared with every other integration; rate-limit flicker becomes a patient-facing bug; ~200-800 ms per call | Only for write paths and for "click to download" |
| B. Poll `updatedAt` windows | Works without webhooks; catches missed events | Not available for prescriptions; each poll pages with 13-39% dupes; latency = poll interval | Use as **reconciliation** (e.g. every 5-15 min for bookings/invoices/patients, nightly full re-read of the last 90 days) |
| C. Webhook-triggered refetch | Near-real-time; cheap (one refetch per event); event catalogue covers bookings, invoices, letters, prescriptions, questionnaires | Ids only; retries unspecified; may be disabled; must dedupe `eventId` | **Primary** path once enabled on BBMI's tenant |
| D. Portal-side cache/DB as read model | Portal pages read our DB (fast, stable, no rate-limit exposure); Semble remains system of record | Staleness window; must model tombstones (`deleted:true`) and dedupe by id | **Required** — B and C feed it |

**Recommended pipeline** `[INFERRED design, built on measured facts]`
1. On login (and on `patient.*`/`booking.*`/`invoice.*`/`prescription.*`/`letter.*` events for that patient): refetch that patient's profile, bookings (±12 months, `includeDeleted:true`), invoices (18 months, invoices predate appointments), prescriptions (`Patient.prescriptions` page 1-n), letters, shared documents; upsert by Semble id; normalise times with `fromDublinLocalIso`; store `sembleUpdatedAt`.
2. Reconcile every 10 min with `bookings(options:{updatedAt:{start:lastRun−15min}})` and `invoices(options:{updatedAt:...})`, deduped by id; nightly, re-read the last 90 days fully to catch dropped rows.
3. Prescriptions: no `updatedAt` → webhook `prescription.created/shared` plus a nightly `prescriptions(dateRange: last 45 d)` sweep, deduped.
4. Never cache `pdfDownloadUrl`/`downloadUrl`; fetch per click.
5. Idempotency: store `eventId`; ignore replays. Treat a webhook as "something changed for patient X", never as the change itself.

---

## 5. Rate-limit and latency budget

- Published limit: "240 requests per minute" (help.semble.io/api-access; `SEMBLE_RX_FINDINGS.md:187`). Rate limiting is signalled as **HTTP 200 + GraphQL error containing "too often"**, not 429 (`semble.js:18-26, 93-103`; `receipts/compute.ts:124-128`). Under sustained bursts Semble **edge-blocks the token account-wide** (nginx 403), taking every consumer on that token down (`clinical-ops/compute.ts:390-399, 790-793, 893-895`).
- Measured costs at ADHD Now: a cold month of availability was ~975 calls and timed out at 60 s; after querying only real rota pairs it is ~65 calls in ~2 s (`README.md:123-130`); a week chunk fans out ~13-70 calls and completes in ~1 s with concurrency 4-6 (`CLAUDE.md:105-108`; `semble.js:419-441, 953`).
- Retry/backoff that works: generic 200 ms × 2^n + 50% jitter; rate-limit 600 ms × 2^n + jitter; up to 6 attempts; retry 429/5xx/non-JSON/network; **never** retry schema errors (`semble.js:15-41, 114-128`). Dashboard equivalents: 1.2 s × 2^n, 5 attempts; 250 ms sleep between pages; 150 ms between page batches; hard budget of 300 requests / 45 s per build (`receipts/compute.ts:129-177`; `clinical-ops/compute.ts:414-433, 792`).
- Caching that works: reference data (practice/doctors/products) 5 min; rota pairs 30 min; availability windows 5 min (empty results too); bookings never cached on the booking path; availability chunks 6 h in Supabase for dashboards (`semble.js:276-277, 346, 413-417`; `clinical-ops/compute.ts:480-536`).
- **Portal budget guidance** `[INFERRED from the above]`: give the portal its own token so its quota is not shared with dashboards; cap concurrent Semble calls per process at 4-6 with a global semaphore; target < 20 calls per patient login (profile 1, bookings 1-2, invoices 1-2, prescriptions 1-2, letters 1, shared docs 1, product/practice from cache); availability month view = chunk into 7-day windows and cache per (doctor,location,week) for 5 min; alert when the "too often" rate exceeds ~1% of calls; expect 200-800 ms per call and 1-3 s for a month of availability warm, 5-10 s cold.

---

## 6. Proposed `SembleAdapter` (portal backend, TypeScript)

Design intent: one module owns the token, timezone normalisation, retries, dedupe and object-level authorisation. Nothing above it sees raw Semble types.

```ts
// All instants in/out of the adapter are TRUE UTC ISO strings. The adapter applies
// toDublinLocalIso() on writes and fromDublinLocalIso() on reads (ADHDsemble/lib/semble.js:756-798).
// Every method that takes `patientId` asserts the returned object belongs to that patient.

export type SembleId = string;               // 24-hex ObjectId
export type IsoUtc = string;

export interface SemblePatient {
  id: SembleId; systemRef: string | null;    // numbers[name="System"].value
  title: string | null; firstName: string; lastName: string; dob: string | null;
  gender: string | null; email: string | null;
  phones: Array<{ phoneId?: string; phoneType: string; phoneNumber: string }>;
  address: { address?: string; city?: string; postcode?: string; country?: string };
  labels: string[];                          // labels[].text
  comms: { receiveEmail: boolean; receiveSMS: boolean; promotionalMarketing: boolean; paymentReminders: boolean };
  onHold: boolean; archived: boolean; updatedAt: IsoUtc | null;
}

export interface SembleBooking {
  id: SembleId; patientId: SembleId; start: IsoUtc; end: IsoUtc;
  status: 'pending' | 'processing' | 'confirmed' | 'failed' | null;
  deleted: boolean; cancellationReason: string | null;
  product: { id: SembleId | null; title: string; duration: number; price: number | null };
  doctor: { id: SembleId | null; name: string };
  location: { id: SembleId; name: string | null };
  videoUrl: string | null; reference: string | null; comments: string | null;
  journey: { arrived?: IsoUtc; consultation?: IsoUtc; departed?: IsoUtc; dna?: IsoUtc };
  billed: boolean; paymentStatus: string | null;
  metadata: Record<string, string>; createdAt: IsoUtc | null; updatedAt: IsoUtc | null;
}

export interface SembleSlot { start: IsoUtc; end: IsoUtc; providers: Array<{ doctorId: SembleId; locationId: SembleId }> }

export interface SembleInvoice {
  id: SembleId; number: number | null; date: string | null;
  status: 'active' | 'cancelled' | string | null; paidState: 'Paid' | 'Outstanding' | 'Void' | string | null;
  type: 'invoice' | 'creditNote' | 'paymentOnAccount' | string | null;
  total: number; outstanding: number;
  lines: Array<{ title: string; date: string | null; quantity: number; price: number; total: number; bookingId: SembleId | null }>;
  payments: Array<{ amount: number; source: string | null; date: string | null }>;
  paymentLinkUrl: string | null; dateShared: IsoUtc | null; updatedAt: IsoUtc | null;
}

export interface SemblePrescription {
  id: SembleId; date: string | null; status: string | null; doctorName: string | null;
  drugs: Array<{ drug: string; dosage: string | null; quantity: string | null; repeat: boolean }>;
  dateShared: IsoUtc | null; hasPdf: boolean;   // pdfDownloadUrl != null at fetch time; never stored
}

export interface SembleLetter { id: SembleId; date: string | null; title: string; body: string; doctorName: string | null; dateShared: IsoUtc | null; reviewStatus: string | null }
export interface SembleDocument { id: SembleId; name: string; title: string | null; type: string; dateCreated: IsoUtc | null; dateShared: IsoUtc | null }
export interface SharedItem { kind: 'invoice'|'creditNote'|'paymentOnAccount'|'letter'|'lab'|'rx'|'document'|'consultation'|'accountstatement'|'hospitalbookingformdata'; documentId: SembleId; title: string; sharedAt: IsoUtc; consultationId?: string; recordIds?: SembleId[] }

export class SembleAuthzError extends Error {}   // object belongs to another patient
export class SembleRateLimited extends Error {}  // "too often" after retries exhausted
export class SembleConflict extends Error {}     // slot taken / overlap detected

export interface SembleAdapter {
  // ---- identity ----
  findPatientByExactEmail(email: string): Promise<SemblePatient | null>;      // patients(search) + exact filter
  getPatient(patientId: SembleId): Promise<SemblePatient | null>;              // patient(id); null on "Cast to ObjectId"/not found
  createPatient(input: { first: string; last: string; email: string; dob?: string; gender?: string; phoneNumber?: string; phoneType?: string; address?: string; city?: string; postcode?: string; country?: string; comms?: Partial<SemblePatient['comms']> }): Promise<SemblePatient>;
  updatePatientContact(patientId: SembleId, patch: { email?: string; address?: string; city?: string; postcode?: string; country?: string; comms?: Partial<SemblePatient['comms']> }): Promise<SemblePatient>;
  setPatientPhone(patientId: SembleId, phone: { phoneId?: string; phoneType: string; phoneNumber: string }): Promise<void>;
  addLabel(patientId: SembleId, labelId: SembleId): Promise<void>;
  removeLabel(patientId: SembleId, labelId: SembleId): Promise<void>;

  // ---- catalogue (cached 5 min) ----
  listBookableProducts(): Promise<Array<{ id: SembleId; name: string; duration: number; price: number; isVideo: boolean; requiresPayment: boolean }>>;
  getPractice(): Promise<{ id: SembleId; name: string; locations: Array<{ id: SembleId; name: string }> }>;

  // ---- availability ----
  /** Any range; adapter chunks into <=7-day windows, uses rota pairs, subtracts live bookings, drops past + leadTime. */
  getAvailability(args: { productId: SembleId; from: IsoUtc; to: IsoUtc; doctorIds?: SembleId[]; stepMinutes?: number; leadTimeMs?: number }): Promise<SembleSlot[]>;

  // ---- bookings (all patient-scoped) ----
  listBookings(patientId: SembleId, args: { from: IsoUtc; to: IsoUtc; includeCancelled?: boolean }): Promise<SembleBooking[]>;   // deduped by id
  getBooking(patientId: SembleId, bookingId: SembleId): Promise<SembleBooking | null>;   // throws SembleAuthzError on mismatch
  /** Runs dup/pre-overlap guards, createBooking with explicit sendPatientMessages, post-overlap guard (self-cancel on loss), stamps metadata. */
  createBooking(patientId: SembleId, args: { productId: SembleId; doctorId: SembleId; locationId: SembleId; start: IsoUtc; end: IsoUtc; comments?: string; notify?: { confirmation: boolean; reminder: boolean; followup: boolean }; metadata?: Record<string, string> }): Promise<SembleBooking>;
  rescheduleBooking(patientId: SembleId, bookingId: SembleId, args: { start: IsoUtc; end: IsoUtc; doctorId?: SembleId; locationId?: SembleId; notify?: boolean }): Promise<SembleBooking>;   // updateBooking(enforceDoubleBooking:true)
  cancelBooking(patientId: SembleId, bookingId: SembleId, args?: { notifyPatient?: boolean; notifyPractice?: boolean }): Promise<void>;   // deleteBooking (soft)
  setBookingMetadata(bookingId: SembleId, entries: Record<string, string>): Promise<void>;

  // ---- money ----
  listInvoices(patientId: SembleId, args: { from: string; to: string }): Promise<SembleInvoice[]>;
  getInvoice(patientId: SembleId, invoiceId: SembleId): Promise<SembleInvoice | null>;
  /** Only if BBMI adopts Semble Pay. Returns Stripe Connect details for the practice account. */
  createBookingPaymentIntent?(patientId: SembleId, bookingId: SembleId): Promise<{ clientSecret: string; paymentIntentId: string; stripeAccountId: string }>;

  // ---- documents ----
  listPrescriptions(patientId: SembleId, page?: number, pageSize?: number): Promise<SemblePrescription[]>;   // deduped by id
  /** Fetches pdfDownloadUrl at call time (15-min TTL) and streams bytes; never returns the URL. */
  streamPrescriptionPdf(patientId: SembleId, prescriptionId: SembleId): Promise<ReadableStream<Uint8Array> | null>;
  listLetters(patientId: SembleId): Promise<SembleLetter[]>;
  listDocuments(patientId: SembleId, page?: number, pageSize?: number): Promise<SembleDocument[]>;
  streamDocument(patientId: SembleId, documentId: SembleId): Promise<{ stream: ReadableStream<Uint8Array>; type: string } | null>;   // downloadUrl (2 h, reusable)
  listSharedWithPatient(patientId: SembleId, page?: number, pageSize?: number): Promise<SharedItem[]>;   // the visibility allow-list
  uploadPatientDocument(patientId: SembleId, args: { name: string; type: string; bytes: Uint8Array }): Promise<SembleDocument>;   // createPatientDocument + PUT uploadUrl

  // ---- forms ----
  getQuestionnaireTemplate(questionnaireId: SembleId): Promise<{ id: SembleId; title: string; sections: unknown[] }>;
  submitQuestionnaire(patientId: SembleId, questionnaireId: SembleId, answers: unknown[]): Promise<{ consultationId?: SembleId }>;
  hostedQuestionnaireUrl(patientId: SembleId, questionnaireToken: string): Promise<string>;   // createIntegrationToken (1-week) + URL

  // ---- comms (consent-checked) ----
  sendEmail(patientId: SembleId, subject: string, html: string, at?: IsoUtc): Promise<{ id: SembleId }>;
  sendSms(patientId: SembleId, text: string, at?: IsoUtc): Promise<{ id: SembleId }>;

  // ---- sync ----
  bookingsUpdatedSince(since: IsoUtc): Promise<SembleBooking[]>;      // bookings(options:{updatedAt}) incl. deleted, deduped
  invoicesUpdatedSince(since: IsoUtc): Promise<SembleInvoice[]>;
  patientsUpdatedSince(since: IsoUtc): Promise<Array<{ id: SembleId; updatedAt: IsoUtc }>>;
  registerWebhook(url: string, eventTypes: string[], label: string): Promise<{ id: SembleId; secret: string }>;
  verifyWebhook(headers: Record<string, string>, rawBody: string, secret: string, maxSkewSec?: number): boolean;   // HMAC-SHA256 over `${t}.${rawBody}`
}
```

Implementation notes carried over from production code: the `gql()` wrapper with "too often" detection and jittered backoff (`semble.js:43-129`); the global availability semaphore (`semble.js:419-441`); `floorUtcDay/ceilUtcDay` day-boundary querying (`semble.js:443-457`); `queryBookingsInRangeRaw` paging to a 50-page backstop (`semble.js:535-563`); `getPatientById` accepting ObjectId or System ref with exact-match-only resolution (`semble.js:695-738`); dedupe-by-id in every sweep (`receipts/compute.ts:272, 297`).

---

## 7. Implications for the new portal

**Must-have**
- Portal-owned auth; `semble_patient_id` mapping table; practice token only in backend secrets; a dedicated least-privilege Semble credential for the portal (docs authentication; help.semble.io/api-access).
- Object-level authorisation on every by-id fetch and every download proxy (section 3).
- Timezone normalisation on every read and write (`toDublinLocalIso`/`fromDublinLocalIso`), unless BBMI's tenant proves to be on the New Appointment System *and* `Booking.start/end` are shown to be true UTC there — re-measure before trusting either.
- Availability engine reused from ADHDsemble (7-day chunking, rota pairs, concurrency cap, 5-min window cache, live booking subtraction, lead-time filter).
- Explicit `sendPatientMessages` on every `createBooking`/`updateBooking`; pre-create overlap checks because Semble emails at create time.
- Dedupe by id on every paginated read; tombstone handling (`deleted:true`); `eventId` idempotency on webhooks; signature verification.
- Read model in the portal DB fed by webhooks + `updatedAt` reconciliation; live calls only for writes and downloads.
- Visibility rule for clinical content: default to `documentsSharedWithPatient` + `dateShared`; never render `records`/`consultations` unless shared.
- Prescriptions are read-only mirrors with on-demand PDF streaming; pharmacy delivery stays outside Semble.

**Must-not**
- Ship the practice token, `pdfDownloadUrl`, `downloadUrl` or `paymentLinkUrl`-derived secrets to the browser.
- Use `patients(search)` results without an exact email/id match.
- Trust `Booking.status`, `requiresConfirmation` or `bookingJourney` stamps for entitlement logic (unreliable / ignored on the API path / hand-filled; `receipts/config.ts:452-459`).
- Poll prescriptions by `updatedAt` (not supported) or sum IE/NI-style multi-currency prices (Product has no currency).
- Assume webhooks are enabled or reliable; assume Semble enforces double-booking on create.

**Decisions needed (see Open questions)**: availability API generation; Stripe ownership (BBMI Stripe vs Semble Pay) and whether Semble invoices are created for membership charges; questionnaire hosting (Semble-hosted vs portal-native); what counts as "shared with patient" for BBMI's clinical governance; whether patients may self-edit identity fields.

---

## 8. Open questions

1. **Which appointment system is BBMI's tenant on?** Legacy `availabilities` (max 168 h, deprecated for new integrations, naive wall-clock) or the New Appointment System (`availabilitySlots`/`availabilityRules`, `LocalDateTime` "practice timezone", opt-in via account manager)? Determines the whole availability layer and possibly the timezone handling. Ask Semble implementation team before 1 Sep configuration is frozen.
2. **Payments:** keep BBMI's Stripe (subscriptions, €89 funnel, tiers) and mirror charges as Semble invoices via `createInvoice`/`addInvoicePayment`, or move appointment payments to Semble Pay (`createPaymentIntentForBooking`, `stripeAccountId` = practice Connect account)? Semble cannot bill recurring memberships (`project_bbmi_semble_implementation.md:24`).
3. **Are webhooks enabled on BBMI's package**, what is the retry schedule, and is there a `patientDocument.shared`-equivalent event? (`deleteWebhook` "Rejects if webhooks are disabled"; retries unspecified.)
4. **Visibility policy:** should the portal show only items staff have shared (`documentsSharedWithPatient`), or all letters/prescriptions/invoices regardless of `dateShared`? Sharing cannot be set via API, so "share from the portal" is impossible — staff would click Share in Semble, or the portal defines its own rule.
5. **`Booking.videoUrl` population timing** and whether it is stable per booking (Whereby room) — verify on the sandbox before building a "Join" button.
6. **Does `bookings(dateRange)` really match start-or-end (docs) or start-only (measured on ADHD Now)?** Re-measure on BBMI's tenant; keep the 6-hour backward pad regardless.
7. **Sandbox access** (`open.sandbox.semble.io/graphql` exists; provisioning undocumented) — needed for E2E verification without emailing real patients (every API booking emails the patient; `deleteBooking(sendCancellationMessages:false)` avoids only the second email).
8. **Does `cursorPagination` eliminate the duplicate/drop behaviour** on `patients`/`prescriptions`, and can it be added to `bookings`?
9. **Role granularity for the portal credential:** exact list of queries/mutations a Settings-credential role can allow (docs say per-query granularity exists; the help centre does not enumerate it).
10. **Questionnaire read-back path:** confirm that a `fillQuestionnaire`/hosted submission is retrievable via `Patient.consultations{questionnaireId records}` with answer text, or whether only the PDF/consultation view exists.
11. **`UpdatePatientDataInput` has no phone fields** — confirm `updatePatientPhoneNumber` requires the `phoneId` from `Patient.phones[].phoneId`.
12. **Whether BBMI needs `Patient.numbers` beyond System** (e.g. a "BBMI member id" via `createPatientNumber` definition) to make support conversations unambiguous across HubSpot, Stripe and Semble.

---

### Source index
- `CC/ADHDsemble/lib/semble.js` (client, timezone, availability engine, guards), `CC/ADHDsemble/handlers.js` (booking flow, status notes), `CC/ADHDsemble/README.md`, `CC/ADHDsemble/CLAUDE.md`, `CC/ADHDsemble/lib/validate.js`.
- `CC/ADHD-dashboard/src/server/kpi/semble.ts`, `receipts/{compute,config,render,watcher,unbilled,mailer}.ts`, `clinical-ops/compute.ts`, `appointments/compute.ts:115-163`, `kpi/env.ts`; `CC/ADHD-dashboard/docs/booked-revenue-review.md:106-119`.
- `CC/ADHD Prescription Automation/docs/SEMBLE_RX_FINDINGS.md`, `docs/EMAIL_to_semble.md`, `apps_script/README.md`.
- Memory: `reference_adhd_semble_backend.md`, `reference_adhd_receipts.md`, `project_bbmi_semble_implementation.md`, `reference_healthmail_integration.md`, `project_adhd_prescription_automation.md`.
- Docs: https://docs.semble.io/docs/authentication/ · /docs/quick-start/ · /docs/how-to/integration-tokens/ · /docs/how-to/search-patients/ · /docs/how-to/paginate/ · /docs/how-to/integrate-questionnaires/ · /docs/how-to/availabilities/get-started-new-appointment-system/ · /docs/category/queries/ · /docs/category/mutations/ · /docs/API/objects/{patient,booking,product,invoice,prescription,letter,patient-document,patient-document-sharing,questionnaire,consultation,record,appointment,journey,booking-location,availability-slot,integration-token,sharing-token,communication-preferences,create-payment-intent-for-booking-payload,new-patient-document-payload,online-booking-configuration}/ · /docs/API/inputs/{booking-data-input,booking-update-data-input,send-patient-messages-input,query-options,pagination,cursor-pagination,date-range,booking-query-filters,create-patient-data-input,update-patient-data-input,patient-communication-query-options,availability-slots-date-range}/ · /docs/API/enums/{booking-status,patient-shared-document-kind}/ · /docs/API/queries/{availabilities,availability-slots,bookings,patients,questionnaires,patient-communications}/ · /docs/API/mutations/{create-booking,update-booking,delete-booking,send-email,create-payment-intent-for-booking,pay-invoice,fill-questionnaire,create-patient-document,create-integration-token}/ · /docs/webhooks/guide/ · /docs/webhooks/events/{booking,patient,invoice,prescription,letter,patient-document,questionnaire}/ · /docs/category/release-notes/.
- Help centre: https://help.semble.io/api-access · /patient-share-portal-with-2fa · /patient-zone · /video-consultations-within-semble · /set-up-online-booking.
