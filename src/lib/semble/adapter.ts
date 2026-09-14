import type {
  Appointment,
  AppointmentType,
  AvailabilityQuery,
  AvailabilitySlot,
  BookingRequest,
  Clinician,
  Invoice,
  Message,
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
  listDocuments(patientId: string): Promise<PatientDocument[]>;
  getDocumentUrl(patientId: string, documentId: string): Promise<string | null>;
  listInvoices(patientId: string): Promise<Invoice[]>;
  listQuestionnaires(patientId: string): Promise<QuestionnaireSummary[]>;

  // --- comms --------------------------------------------------------------
  /**
   * Patient → practice message. In Semble this lands as a patient communication
   * / task for the nurse; the portal keeps its own thread view.
   */
  sendMessage(patientId: string, channel: Message["channel"], body: string): Promise<Message>;
  listMessages(patientId: string): Promise<Message[]>;
}

export class SembleAdapterError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not-found"
      | "rate-limited"
      | "slot-taken"
      | "unauthorised"
      | "not-supported"
      | "upstream",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SembleAdapterError";
  }
}
