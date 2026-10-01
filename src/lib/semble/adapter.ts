import type {
  Appointment,
  AppointmentType,
  AvailabilityQuery,
  AvailabilitySlot,
  BookingRequest,
  Clinician,
  DocumentContent,
  IntakeSubmission,
  Pharmacy,
  PrescriptionSend,
  WeightLogEntry,
  NewPatient,
  Invoice,
  PatientDocument,
  PatientProfile,
  Prescription,
  QuestionnaireSummary,
  RescheduleRequest,
} from "./types";

/**
 * SembleAdapter — the ONLY way the portal talks to the clinical record.
 *
 * Design rules (learned the hard way on ADHD Now's Semble integration):
 *  1. Runs server-side only. The practice API token is practice-scoped —
 *     it can read EVERY patient — so it must never reach the browser.
 *     Every method takes the already-authenticated patient's Semble id.
 *  2. Times cross this boundary as TRUE UTC. Semble stores naive Dublin
 *     wall-clock with a fake `Z`; the GraphQL adapter converts both ways.
 *  3. Availability requests are chunked to ≤7-day windows on clean day
 *     boundaries, and the "too often" rate-limit (HTTP 200 + GraphQL error)
 *     is retried with backoff inside the adapter, never surfaced raw.
 *  4. Anything that lists (bookings, prescriptions, letters) is de-duplicated
 *     by id — Semble pagination returns ~13% duplicate rows.
 *  5. Semble cannot: bill subscriptions, gate entitlements, send an email
 *     with an attachment, create/send prescriptions, or authenticate a
 *     patient. Those live in the portal (see /lib/portal).
 */
export interface SembleAdapter {
  // --- identity / profile -------------------------------------------------
  getPatient(patientId: string): Promise<PatientProfile>;
  findPatientByEmail(email: string): Promise<PatientProfile | null>;
  /** Exact match on a custom patient number (e.g. "BBMI ID" = the Beyond BMI patient id / Cognito sub). */
  findPatientByNumber(numberName: string, value: string): Promise<PatientProfile | null>;
  /** Sets (adds or replaces) a custom patient number, creating the practice's number definition if needed. */
  setPatientNumber(patientId: string, numberName: string, value: string): Promise<void>;
  /** Creates the Semble patient for someone who has none yet (first sign-in to the portal). */
  createPatient(input: NewPatient): Promise<PatientProfile>;
  /** Copies a completed questionnaire into the clinical record once (by fingerprint). */
  recordIntake(patientId: string, intake: IntakeSubmission): Promise<{ written: boolean }>;
  /**
   * Mirrors weights into the record's "Weight log" (Semble has no Vitals API). The first call only
   * sets a baseline — history from before the link is the migration's job — and later calls add
   * each new weight once.
   */
  syncWeights(patientId: string, weights: WeightLogEntry[]): Promise<{ written: number }>;
  updatePatientContact(
    patientId: string,
    patch: Partial<Pick<PatientProfile, "phone" | "address" | "communicationPreferences">>,
  ): Promise<PatientProfile>;

  // --- care team -----------------------------------------------------------
  listClinicians(): Promise<Clinician[]>;
  listAppointmentTypes(): Promise<AppointmentType[]>;

  // --- appointments --------------------------------------------------------
  listAppointments(
    patientId: string,
    range: { fromUtc: string; toUtc: string },
  ): Promise<Appointment[]>;
  getAppointment(patientId: string, appointmentId: string): Promise<Appointment | null>;
  getAvailability(query: AvailabilityQuery): Promise<AvailabilitySlot[]>;
  /** Creates the booking with patient messages ON (Semble defaults API bookings to silent). */
  book(patientId: string, req: BookingRequest): Promise<Appointment>;
  reschedule(patientId: string, req: RescheduleRequest): Promise<Appointment>;
  cancel(patientId: string, appointmentId: string, reason?: string): Promise<void>;

  // --- clinical artefacts (read-only from the patient's side) -------------
  listPrescriptions(patientId: string): Promise<Prescription[]>;
  /** Mints a short-lived download URL (Semble: 15 min). Never cached. */
  getPrescriptionPdfUrl(patientId: string, prescriptionId: string): Promise<string | null>;

  // --- pharmacies (prescriptions the patient sends to a pharmacy of their choice) ---
  /** Pharmacies (Semble Contacts tagged portalKind=pharmacy) matching a name/town search. */
  searchPharmacies(query: string): Promise<Pharmacy[]>;
  /** One pharmacy by id — null unless it is a tagged pharmacy with an email. */
  getPharmacy(id: string): Promise<Pharmacy | null>;
  /** The patient's chosen pharmacy (Semble patient relationship of type PHARMACY). */
  getPatientPharmacy(patientId: string): Promise<Pharmacy | null>;
  setPatientPharmacy(patientId: string, pharmacy: Pharmacy): Promise<void>;
  /**
   * Portal bookkeeping of prescriptions emailed to a pharmacy, by prescription id. Fails closed: a record that
   * can't be read, or two competing claims, come back as an in-progress/uncertain claim, never as "not sent".
   */
  getPrescriptionSends(patientId: string): Promise<Record<string, PrescriptionSend>>;
  /** Claims one prescription for sending. Returns the claim id only if this is the ONLY claim on it (else backs off). */
  claimPrescriptionSend(patientId: string, prescriptionId: string, send: PrescriptionSend): Promise<string | null>;
  updatePrescriptionSend(patientId: string, claimId: string, send: PrescriptionSend): Promise<void>;
  releasePrescriptionSend(patientId: string, claimId: string): Promise<void>;
  /** A clinician-visible note in the record that the prescription went to a pharmacy. */
  recordPrescriptionSent(patientId: string, text: { title: string; detail: string }): Promise<void>;
  listDocuments(patientId: string): Promise<PatientDocument[]>;
  /** Only documents shared with this patient open; external URLs are streamed by the portal, never handed to the browser. */
  openDocument(patientId: string, documentId: string): Promise<DocumentContent | null>;
  listInvoices(patientId: string): Promise<Invoice[]>;
  listQuestionnaires(patientId: string): Promise<QuestionnaireSummary[]>;

  /*
   * Deliberately absent: patient messaging. Semble is outbound-only and gives
   * staff no cross-patient inbox, so there is nowhere for a reply to land.
   * See the note in ./types.ts.
   */
}

export class SembleAdapterError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not-found"
      /** more than one record matches where exactly one must (e.g. two patients with one email) */
      | "duplicate"
      | "rate-limited"
      | "slot-taken"
      | "unauthorised"
      | "not-supported"
      | "upstream"
      /** no answer from Semble; a read can be retried */
      | "unreachable"
      /** a write was sent but its result is unknown — the patient must check before retrying */
      | "unknown-outcome"
      /** some of a multi-step update was saved */
      | "partial",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SembleAdapterError";
  }
}
