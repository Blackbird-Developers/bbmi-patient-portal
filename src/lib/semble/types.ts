/**
 * Domain types the portal works with. These are OUR shapes, not Semble's raw
 * GraphQL types: the adapter maps Semble → these, so the UI never depends on
 * Semble field names (which have bitten us before: naive Dublin wall-clock
 * timestamps with a fake `Z`, `numbers[].System` as the staff-facing id, etc).
 *
 * Everything time-related is a true UTC ISO string at this boundary.
 */

export type ClinicianRole =
  | "doctor"
  | "nurse"
  | "dietitian"
  | "health-coach"
  | "psychologist"
  | "care-coordinator";

export interface Clinician {
  /** Semble User.id */
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title?: string; // "Dr", "RGN", "RD"
  role: ClinicianRole;
  /** e.g. "Obesity medicine", "Registered dietitian" */
  specialty?: string;
  registration?: string; // IMC / NMBI / CORU number — shown on letters
  avatarUrl?: string;
  bio?: string;
}

export interface PatientProfile {
  /** Semble Patient.id (24-hex ObjectId) — never shown to the patient */
  id: string;
  /** Semble staff-facing reference from Patient.numbers[name="System"] — this IS shown (support conversations) */
  reference?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dob?: string; // YYYY-MM-DD
  gender?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    county?: string;
    postcode?: string; // Eircode
    country?: string;
  };
  communicationPreferences?: {
    receiveEmail: boolean;
    receiveSMS: boolean;
    promotionalMarketing: boolean;
  };
  /** Named labels in Semble — the portal may read plan labels from here in a Semble-only world */
  labels?: string[];
}

export interface AppointmentType {
  /** Semble BookingType (Product) id */
  id: string;
  name: string;
  role: ClinicianRole;
  durationMinutes: number;
  /** EUR — 0 when included in the patient's plan */
  price: number;
  requiresPayment: boolean;
  /** internal, e.g. "doctor-review", "dietitian-initial" */
  slug: string;
}

export type AppointmentStatus =
  | "confirmed"
  | "pending"
  | "completed"
  | "cancelled"
  | "no-show";

export interface Appointment {
  /** Semble Booking.id */
  id: string;
  type: AppointmentType;
  clinician: Clinician;
  /** true UTC ISO */
  startUtc: string;
  endUtc: string;
  status: AppointmentStatus;
  /** Semble video link (Booking.videoUrl / meeting link) when the appointment is online */
  videoUrl?: string;
  /** free-text from the patient at booking time */
  patientNotes?: string;
  /** which programme step this satisfies, if any (portal-owned mapping) */
  programmeStepId?: string;
  /** can the patient still self-reschedule / cancel (portal policy: >24h before start) */
  canReschedule: boolean;
  canCancel: boolean;
}

export interface AvailabilitySlot {
  clinicianId: string;
  startUtc: string;
  endUtc: string;
}

export interface AvailabilityQuery {
  appointmentTypeId: string;
  /** inclusive UTC day boundaries; adapter chunks into ≤7-day Semble windows */
  fromUtc: string;
  toUtc: string;
  /** restrict to one clinician (continuity of care) */
  clinicianId?: string;
}

export type PrescriptionStatus = "issued" | "sent" | "dispensed" | "expired" | "cancelled";

export interface PrescriptionDrug {
  name: string; // e.g. "Mounjaro (tirzepatide) 5 mg"
  dosage?: string; // "Inject 5 mg subcutaneously once weekly"
  quantity?: string; // "4 pens"
  comments?: string;
}

export interface Prescription {
  /** Semble Prescription.id */
  id: string;
  issuedAtUtc: string;
  prescriber: Clinician;
  drugs: PrescriptionDrug[];
  status: PrescriptionStatus;
  /** Semble gives a 15-minute signed URL; the portal fetches it on demand, never stores it */
  pdfAvailable: boolean;
  /** pharmacy / delivery this script went to (portal-owned record) */
  fulfilment?: {
    method: "home-delivery" | "pharmacy";
    pharmacyName?: string;
    dispatchedAtUtc?: string;
    trackingNote?: string;
  };
  /** portal-derived: repeat due date / expiry */
  reviewDueUtc?: string;
}

export type DocumentKind = "letter" | "insurance" | "lab" | "plan" | "consent" | "other";

export interface PatientDocument {
  /** Semble Letter.id or PatientDocument.id */
  id: string;
  kind: DocumentKind;
  title: string;
  createdAtUtc: string;
  author?: Clinician;
  /** true when a download URL can be minted server-side on request */
  downloadable: boolean;
  summary?: string;
}

export type InvoiceStatus = "paid" | "unpaid" | "refunded" | "void";

export interface Invoice {
  /** Semble Invoice.id — or a Stripe charge id for portal-billed items */
  id: string;
  number: string;
  issuedAtUtc: string;
  description: string;
  amount: number; // EUR
  status: InvoiceStatus;
  source: "semble" | "stripe";
  downloadable: boolean;
}

export interface QuestionnaireSummary {
  id: string;
  title: string;
  /** portal slug e.g. "pre-consult-screening", "ess-eq5d", "hc-quality" */
  slug: string;
  status: "not-started" | "in-progress" | "completed";
  dueForStepId?: string;
  completedAtUtc?: string;
  /** Semble-hosted form link when Semble owns the form */
  externalUrl?: string;
}

export interface Message {
  id: string;
  /** who wrote it */
  from: { kind: "patient" } | { kind: "clinician"; clinician: Clinician } | { kind: "system" };
  sentAtUtc: string;
  subject?: string;
  body: string;
  readByPatient: boolean;
  /** e.g. "clinical" (nurse async support), "admin" */
  channel: "clinical" | "admin";
}

export interface BookingRequest {
  appointmentTypeId: string;
  clinicianId: string;
  startUtc: string;
  endUtc: string;
  patientNotes?: string;
  programmeStepId?: string;
}

export interface RescheduleRequest {
  appointmentId: string;
  clinicianId: string;
  startUtc: string;
  endUtc: string;
}
