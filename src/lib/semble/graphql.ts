import "server-only";
import { SembleAdapterError, type SembleAdapter } from "./adapter";
import { chunkDays, fromPracticeLocalIso, isRateLimitMessage, toPracticeLocalIso } from "./time";
import type {
  Appointment,
  AppointmentType,
  AvailabilitySlot,
  Clinician,
  ClinicianRole,
  Invoice,
  PatientDocument,
  PatientProfile,
  Prescription,
  QuestionnaireSummary,
} from "./types";

/**
 * Real Semble adapter (GraphQL, https://open.semble.io/graphql, header x-token).
 *
 * STATUS: skeleton wired against the operations we already run in production
 * for another practice (patients, bookings, availabilities, products, users,
 * prescriptions, letters, invoices, sendEmail). Field selections must be
 * re-verified against BBMI's own tenant with a BBMI-owned token before go-live;
 * there is no sandbox, so the first probe is read-only by construction.
 *
 * Every rule in ./adapter.ts is implemented HERE, so the UI never sees them.
 */
export class GraphqlSembleAdapter implements SembleAdapter {
  private url = process.env.SEMBLE_GRAPHQL_URL || "https://open.semble.io/graphql";
  private token = process.env.SEMBLE_API_TOKEN || "";
  private refCache: { at: number; clinicians: Clinician[]; types: AppointmentType[] } | null = null;

  constructor() {
    if (!this.token) throw new Error("SEMBLE_API_TOKEN is required for SEMBLE_ADAPTER=graphql");
  }

  /** GraphQL call with retry on Semble's "too often" (HTTP 200 + error) rate limit. */
  private async gql<T>(query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-token": this.token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) throw new SembleAdapterError("Semble rejected the token", "unauthorised");
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join("; ");
      if (isRateLimitMessage(msg) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 200));
        return this.gql<T>(query, variables, attempt + 1);
      }
      if (isRateLimitMessage(msg)) throw new SembleAdapterError("Semble is busy, try again in a moment", "rate-limited");
      throw new SembleAdapterError(msg, "upstream");
    }
    if (!json.data) throw new SembleAdapterError("Empty response from Semble", "upstream");
    return json.data;
  }

  private static roleFromUser(u: { medicalSpecialties?: string[]; role?: string; title?: string }): ClinicianRole {
    const s = (u.medicalSpecialties ?? []).join(" ").toLowerCase();
    if (/diet/.test(s)) return "dietitian";
    if (/nurse/.test(s) || /rgn/i.test(u.title ?? "")) return "nurse";
    if (/coach/.test(s)) return "health-coach";
    if (/psych/.test(s)) return "psychologist";
    return "doctor";
  }

  private async reference() {
    if (this.refCache && Date.now() - this.refCache.at < 5 * 60_000) return this.refCache;
    const data = await this.gql<{
      users: { data: { id: string; firstName: string; lastName: string; fullName: string; title?: string; role?: string; isDoctor: boolean; medicalSpecialties?: string[]; registration?: string }[] };
      products: { data: { id: string; name: string; duration: number; price: number; isBookable: boolean; requiresPayment: boolean }[] };
    }>(`query Reference { users(pagination:{page:1,pageSize:200}) { data { id firstName lastName fullName title role isDoctor medicalSpecialties registration } }
         products(pagination:{page:1,pageSize:200}) { data { id name duration price isBookable requiresPayment } } }`);
    const clinicians: Clinician[] = data.users.data
      .filter((u) => u.isDoctor)
      .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, fullName: u.fullName, title: u.title, role: GraphqlSembleAdapter.roleFromUser(u), registration: u.registration }));
    const types: AppointmentType[] = data.products.data
      .filter((p) => p.isBookable)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        role: /diet/i.test(p.name) ? "dietitian" : /nurse/i.test(p.name) ? "nurse" : /coach/i.test(p.name) ? "health-coach" : "doctor",
        durationMinutes: p.duration,
        price: p.price,
        requiresPayment: p.requiresPayment,
      }));
    this.refCache = { at: Date.now(), clinicians, types };
    return this.refCache;
  }

  async getPatient(patientId: string): Promise<PatientProfile> {
    const d = await this.gql<{ patient: null | { id: string; firstName: string; lastName: string; email: string; phones?: { phoneNumber: string }[]; dob?: string; gender?: string; numbers?: { name: string; value: string }[]; address?: { address?: string; city?: string; postcode?: string; country?: string }; communicationPreferences?: { receiveEmail: boolean; receiveSMS: boolean; promotionalMarketing: boolean }; labels?: { name: string }[] } }>(
      `query PatientById($id: ID!) { patient(id: $id) { id firstName lastName email dob gender phones { phoneNumber } numbers { name value } address { address city postcode country } communicationPreferences { receiveEmail receiveSMS promotionalMarketing } labels { name } } }`,
      { id: patientId },
    );
    const p = d.patient;
    if (!p) throw new SembleAdapterError("Patient not found", "not-found");
    return {
      id: p.id,
      reference: p.numbers?.find((n) => n.name === "System")?.value,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phones?.[0]?.phoneNumber,
      dob: p.dob,
      gender: p.gender,
      address: p.address ? { line1: p.address.address, city: p.address.city, postcode: p.address.postcode, country: p.address.country } : undefined,
      communicationPreferences: p.communicationPreferences,
      labels: p.labels?.map((l) => l.name),
    };
  }

  async findPatientByEmail(email: string) {
    // patients(search:) is fuzzy — only an EXACT email match counts.
    const d = await this.gql<{ patients: { data: { id: string; email: string }[] } }>(
      `query Patients($s: String) { patients(search: $s, pagination:{page:1,pageSize:20}) { data { id email } } }`,
      { s: email },
    );
    const hit = d.patients.data.find((p) => p.email?.toLowerCase() === email.toLowerCase());
    return hit ? this.getPatient(hit.id) : null;
  }

  async updatePatientContact(): Promise<PatientProfile> {
    throw new SembleAdapterError("Contact updates go through the care team until updatePatient is verified on the BBMI tenant", "not-supported");
  }

  async listClinicians() {
    return (await this.reference()).clinicians;
  }
  async listAppointmentTypes() {
    return (await this.reference()).types;
  }

  private async mapBooking(b: { id: string; start: string; end: string; doctor: { id: string }; bookingType: { id: string }; deleted?: boolean; comments?: string; videoUrl?: string }): Promise<Appointment> {
    const ref = await this.reference();
    const startUtc = fromPracticeLocalIso(b.start);
    const endUtc = fromPracticeLocalIso(b.end);
    const future = new Date(startUtc).getTime() > Date.now() + 24 * 3_600_000;
    const clinician = ref.clinicians.find((c) => c.id === b.doctor.id) ?? { id: b.doctor.id, firstName: "", lastName: "", fullName: "Your clinician", role: "doctor" as const };
    const type = ref.types.find((t) => t.id === b.bookingType.id) ?? { id: b.bookingType.id, name: "Appointment", slug: "appointment", role: clinician.role, durationMinutes: 0, price: 0, requiresPayment: false };
    const status: Appointment["status"] = b.deleted ? "cancelled" : new Date(endUtc).getTime() < Date.now() ? "completed" : "confirmed";
    return { id: b.id, type, clinician, startUtc, endUtc, status, videoUrl: b.videoUrl, patientNotes: b.comments, canReschedule: status === "confirmed" && future, canCancel: status === "confirmed" && future };
  }

  async listAppointments(patientId: string, range: { fromUtc: string; toUtc: string }) {
    // Patient-scoped read: `patient(id){ bookings(start,end) }` — never the practice-wide `bookings(dateRange)`
    // (no patientId filter there). Semble matches on booking START; pad 6h back. Dedupe: ~13% duplicate rows.
    const from = new Date(new Date(range.fromUtc).getTime() - 6 * 3_600_000).toISOString();
    const seen = new Map<string, Appointment>();
    const d = await this.gql<{ patient: null | { bookings: { id: string; start: string; end: string; deleted?: boolean; comments?: string; videoUrl?: string; doctor: { id: string }; bookingType: { id: string } }[] } }>(
      `query PatientBookings($id: ID!, $from: Date!, $to: Date!) { patient(id: $id) { bookings(start: $from, end: $to, queryOptions: { includeDeleted: true }) { id start end deleted comments videoUrl doctor { id } bookingType { id } } } }`,
      { id: patientId, from: toPracticeLocalIso(from), to: toPracticeLocalIso(range.toUtc) },
    );
    for (const b of d.patient?.bookings ?? []) if (!seen.has(b.id)) seen.set(b.id, await this.mapBooking(b));
    return [...seen.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }

  async getAppointment(patientId: string, appointmentId: string) {
    const d = await this.gql<{ booking: null | { id: string; start: string; end: string; deleted?: boolean; comments?: string; patient: { id: string }; doctor: { id: string }; bookingType: { id: string } } }>(
      `query Booking($id: ID!) { booking(id: $id) { id start end deleted comments patient { id } doctor { id } bookingType { id } } }`,
      { id: appointmentId },
    );
    if (!d.booking || d.booking.patient?.id !== patientId) return null;
    return this.mapBooking(d.booking);
  }

  async getAvailability(q: { appointmentTypeId: string; fromUtc: string; toUtc: string; clinicianId?: string }): Promise<AvailabilitySlot[]> {
    const ref = await this.reference();
    const type = ref.types.find((t) => t.id === q.appointmentTypeId);
    if (!type) throw new SembleAdapterError("Unknown appointment type", "not-found");
    const clinicians = q.clinicianId ? [q.clinicianId] : ref.clinicians.filter((c) => c.role === type.role).map((c) => c.id);
    const out: AvailabilitySlot[] = [];
    for (const w of chunkDays(q.fromUtc, q.toUtc, 7)) {
      for (const doctorId of clinicians) {
        const d = await this.gql<{ availabilities: { data: { start: string; end: string; doctor: { id: string } }[] } }>(
          `query Availabilities($from: Date!, $to: Date!, $doctor: ID) { availabilities(dateRange:{start:$from,end:$to}, doctor:$doctor) { data { start end doctor { id } } } }`,
          { from: toPracticeLocalIso(w.from), to: toPracticeLocalIso(w.to), doctor: doctorId },
        );
        for (const a of d.availabilities.data) {
          // slice the window into slots of the appointment length
          let s = new Date(fromPracticeLocalIso(a.start)).getTime();
          const e = new Date(fromPracticeLocalIso(a.end)).getTime();
          const step = Math.max(type.durationMinutes, 10) * 60_000;
          while (s + step <= e) {
            if (s > Date.now() + 12 * 3_600_000) out.push({ clinicianId: a.doctor.id, startUtc: new Date(s).toISOString(), endUtc: new Date(s + step).toISOString() });
            s += step;
          }
        }
      }
    }
    return out.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }

  async book(patientId: string, req: { appointmentTypeId: string; clinicianId: string; startUtc: string; endUtc: string; patientNotes?: string; programmeStepId?: string }) {
    const d = await this.gql<{ createBooking: { data: { id: string; start: string; end: string; doctor: { id: string }; bookingType: { id: string } } | null; error?: string } }>(
      `mutation CreateBooking($b: BookingDataInput!) { createBooking(bookingData: $b, sendPatientMessages:{confirmation:true, reminder:true, followup:true}) { data { id start end doctor { id } bookingType { id } } error } }`,
      { b: { patient: patientId, doctor: req.clinicianId, bookingType: req.appointmentTypeId, start: toPracticeLocalIso(req.startUtc), end: toPracticeLocalIso(req.endUtc), comments: req.patientNotes } },
    );
    if (!d.createBooking.data) throw new SembleAdapterError(d.createBooking.error || "Booking failed", /taken|overlap/i.test(d.createBooking.error ?? "") ? "slot-taken" : "upstream");
    // Stamp provenance on the Semble row — Semble has no createdBy; this is how support can tell portal bookings apart.
    await this.gql(`mutation Stamp($id: ID!, $m: [BookingMetadataInput!]!) { updateBookingMetadata(id: $id, metadata: $m) { data { id } error } }`, {
      id: d.createBooking.data.id,
      m: [{ key: "source", value: "portal" }, { key: "portalPatientId", value: patientId }, ...(req.programmeStepId ? [{ key: "programmeStep", value: req.programmeStepId }] : [])],
    }).catch(() => undefined);
    const a = await this.mapBooking(d.createBooking.data);
    return { ...a, programmeStepId: req.programmeStepId };
  }

  async reschedule(patientId: string, req: { appointmentId: string; clinicianId: string; startUtc: string; endUtc: string }) {
    const d = await this.gql<{ updateBooking: { data: { id: string; start: string; end: string; doctor: { id: string }; bookingType: { id: string } } | null; error?: string } }>(
      `mutation UpdateBooking($id: ID!, $b: UpdateBookingDataInput!) { updateBooking(id: $id, bookingData: $b) { data { id start end doctor { id } bookingType { id } } error } }`,
      // enforceDoubleBooking is Semble's only server-side overlap guard and exists only on update.
      { id: req.appointmentId, b: { doctor: req.clinicianId, start: toPracticeLocalIso(req.startUtc), end: toPracticeLocalIso(req.endUtc), enforceDoubleBooking: true, sendPatientMessages: { confirmation: true, reminder: true, followup: true } } },
    );
    if (!d.updateBooking.data) throw new SembleAdapterError(d.updateBooking.error || "Reschedule failed", "upstream");
    return this.mapBooking(d.updateBooking.data);
  }

  async cancel(patientId: string, appointmentId: string) {
    const own = await this.getAppointment(patientId, appointmentId);
    if (!own) throw new SembleAdapterError("Appointment not found", "not-found");
    await this.gql(`mutation DeleteBooking($id: ID!) { deleteBooking(id: $id, sendCancellationMessages: true) { data { id } error } }`, { id: appointmentId });
  }

  async listPrescriptions(patientId: string): Promise<Prescription[]> {
    const ref = await this.reference();
    // Patient sub-field, not the practice-wide sweep (39% duplicate rows there). No updatedAt on prescriptions → no polling.
    const d = await this.gql<{ patient: null | { prescriptions: { data: { id: string; dateCreated: string; doctor?: { id: string }; patient: { id: string }; pdfDownloadUrl?: string | null; drugs: { drug: string; dosage?: string; quantity?: string; comments?: string }[]; dateShared?: string }[] } } }>(
      `query PatientPrescriptions($id: ID!) { patient(id: $id) { prescriptions(page: 1, pageSize: 50) { data { id dateCreated doctor { id } patient { id } pdfDownloadUrl dateShared drugs { drug dosage quantity comments } } } } }`,
      { id: patientId },
    );
    const seen = new Map<string, Prescription>();
    for (const r of d.patient?.prescriptions.data ?? []) {
      if (r.patient?.id !== patientId || seen.has(r.id)) continue;
      seen.set(r.id, {
        id: r.id,
        issuedAtUtc: fromPracticeLocalIso(r.dateCreated),
        prescriber: ref.clinicians.find((c) => c.id === r.doctor?.id) ?? { id: r.doctor?.id ?? "", firstName: "", lastName: "", fullName: "Your doctor", role: "doctor" },
        drugs: r.drugs.map((x) => ({ name: x.drug, dosage: x.dosage, quantity: x.quantity, comments: x.comments })),
        status: r.dateShared ? "sent" : "issued",
        pdfAvailable: !!r.pdfDownloadUrl,
      });
    }
    return [...seen.values()].sort((a, b) => b.issuedAtUtc.localeCompare(a.issuedAtUtc));
  }

  async getPrescriptionPdfUrl(patientId: string, prescriptionId: string) {
    const d = await this.gql<{ prescription: null | { id: string; patient: { id: string }; pdfDownloadUrl?: string | null } }>(
      `query Prescription($id: ID!) { prescription(id: $id) { id patient { id } pdfDownloadUrl } }`,
      { id: prescriptionId },
    );
    if (!d.prescription || d.prescription.patient?.id !== patientId) return null;
    return d.prescription.pdfDownloadUrl ?? null; // 15-minute URL — hand straight to the browser, never log it
  }

  async listDocuments(patientId: string): Promise<PatientDocument[]> {
    // Visibility allow-list = what staff clicked "Share" on. Sharing cannot be set via API, so the portal
    // shows only `documentsSharedWithPatient` (letters, labs, documents, invoices, rx) — a clinical-governance choice.
    const d = await this.gql<{ patient: null | { documentsSharedWithPatient: { documentId: string; title: string; type: string; sharedAt: string }[] } }>(
      `query Shared($id: ID!) { patient(id: $id) { documentsSharedWithPatient(page: 1, pageSize: 50) { documentId title type sharedAt } } }`,
      { id: patientId },
    );
    const kindOf = (t: string, title: string): PatientDocument["kind"] =>
      t === "lab" ? "lab" : /insurance/i.test(title) ? "insurance" : /plan/i.test(title) ? "plan" : /consent/i.test(title) ? "consent" : t === "letter" ? "letter" : "other";
    const seen = new Map<string, PatientDocument>();
    for (const s of d.patient?.documentsSharedWithPatient ?? []) {
      if (seen.has(s.documentId) || s.type === "invoice" || s.type === "rx") continue; // invoices/prescriptions have their own screens
      seen.set(s.documentId, { id: s.documentId, kind: kindOf(s.type, s.title), title: s.title, createdAtUtc: fromPracticeLocalIso(s.sharedAt), downloadable: s.type === "document" || s.type === "letter" });
    }
    return [...seen.values()].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
  }

  async getDocumentUrl(patientId: string, documentId: string): Promise<string | null> {
    // PatientDocument.downloadUrl = 2-hour reusable URL; letters have body only (render server-side).
    const d = await this.gql<{ patientDocument: null | { id: string; patient?: { id: string }; downloadUrl?: string | null } }>(
      `query Doc($id: ID!) { patientDocument(id: $id) { id patient { id } downloadUrl } }`,
      { id: documentId },
    );
    if (!d.patientDocument || (d.patientDocument.patient && d.patientDocument.patient.id !== patientId)) return null;
    return d.patientDocument.downloadUrl ?? null;
  }

  async listInvoices(patientId: string): Promise<Invoice[]> {
    const d = await this.gql<{ invoices: { data: { id: string; number?: string; dateCreated: string; total: number; status: string; patient: { id: string }; description?: string }[] } }>(
      `query Invoices($from: Date!, $to: Date!) { invoices(dateRange:{start:$from,end:$to}, pagination:{page:1,pageSize:100}) { data { id number dateCreated total status patient { id } } } }`,
      { from: new Date(Date.now() - 400 * 86_400_000).toISOString(), to: new Date().toISOString() },
    );
    const seen = new Map<string, Invoice>();
    for (const i of d.invoices.data) {
      if (i.patient?.id !== patientId || seen.has(i.id)) continue;
      seen.set(i.id, { id: i.id, number: i.number ?? i.id, issuedAtUtc: fromPracticeLocalIso(i.dateCreated), description: i.description ?? "Clinic invoice", amount: i.total, status: /paid/i.test(i.status) ? "paid" : "unpaid", source: "semble", downloadable: false });
    }
    return [...seen.values()];
  }

  async listQuestionnaires(): Promise<QuestionnaireSummary[]> {
    return []; // Semble questionnaires: patient-facing links are UI-issued; portal forms are portal-owned.
  }

}
