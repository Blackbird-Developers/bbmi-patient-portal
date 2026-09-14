import "server-only";
import { SembleAdapterError, type SembleAdapter } from "./adapter";
import {
  APPOINTMENTS,
  APPOINTMENT_TYPES,
  CLINICIANS,
  DOCUMENTS,
  INVOICES,
  MESSAGES,
  PATIENTS,
  PRESCRIPTIONS,
  QUESTIONNAIRES,
  clinicianById,
  now,
} from "./mock-data";
import type { Appointment, AvailabilitySlot, Message, PatientProfile } from "./types";

/**
 * In-memory Semble. Mutations persist for the life of the dev server so a
 * demo booking survives navigation. Behaviour mirrors the real adapter's
 * contract (errors, ownership checks, slot collisions).
 */
export class MockSembleAdapter implements SembleAdapter {
  private patients = new Map(PATIENTS.map((p) => [p.id, { ...p }]));
  private appts = new Map(Object.entries(APPOINTMENTS).map(([k, v]) => [k, v.map((a) => ({ ...a }))]));
  private messages = new Map(Object.entries(MESSAGES).map(([k, v]) => [k, v.map((m) => ({ ...m }))]));
  private seq = 100;

  private latency() {
    return new Promise((r) => setTimeout(r, 120 + Math.random() * 180));
  }

  async getPatient(patientId: string): Promise<PatientProfile> {
    await this.latency();
    const p = this.patients.get(patientId);
    if (!p) throw new SembleAdapterError("Patient not found", "not-found");
    return p;
  }

  async findPatientByEmail(email: string) {
    await this.latency();
    const e = email.trim().toLowerCase();
    return [...this.patients.values()].find((p) => p.email.toLowerCase() === e) ?? null;
  }

  async updatePatientContact(patientId: string, patch: Partial<PatientProfile>) {
    const p = await this.getPatient(patientId);
    const next = { ...p, ...patch };
    this.patients.set(patientId, next);
    return next;
  }

  async listClinicians() {
    await this.latency();
    return CLINICIANS;
  }

  async listAppointmentTypes() {
    await this.latency();
    return APPOINTMENT_TYPES;
  }

  async listAppointments(patientId: string, range: { fromUtc: string; toUtc: string }) {
    await this.latency();
    const list = this.appts.get(patientId) ?? [];
    const from = new Date(range.fromUtc).getTime();
    const to = new Date(range.toUtc).getTime();
    return list
      .filter((a) => {
        const s = new Date(a.startUtc).getTime();
        return s >= from && s <= to;
      })
      .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }

  async getAppointment(patientId: string, appointmentId: string) {
    await this.latency();
    return (this.appts.get(patientId) ?? []).find((a) => a.id === appointmentId) ?? null;
  }

  /** Generates a realistic rota: weekdays, role-specific hours, some slots already taken. */
  async getAvailability(q: { appointmentTypeId: string; fromUtc: string; toUtc: string; clinicianId?: string }) {
    await this.latency();
    const type = APPOINTMENT_TYPES.find((t) => t.id === q.appointmentTypeId);
    if (!type) throw new SembleAdapterError("Unknown appointment type", "not-found");
    const clinicians = CLINICIANS.filter((c) => c.role === type.role && (!q.clinicianId || c.id === q.clinicianId));
    const out: AvailabilitySlot[] = [];
    const taken = new Set(
      [...this.appts.values()].flat().filter((a) => a.status === "confirmed").map((a) => `${a.clinician.id}|${a.startUtc}`),
    );
    const leadTime = now().getTime() + 12 * 3_600_000; // 12h lead time like the live booking engine
    const from = new Date(q.fromUtc);
    const to = new Date(q.toUtc);
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      for (const c of clinicians) {
        // deterministic pseudo-rota per clinician/day
        const seed = (d.getUTCDate() * 31 + c.id.length * 7 + dow * 13) % 5;
        const startHour = c.role === "doctor" ? 8 + seed : c.role === "health-coach" ? 12 + seed : 9 + seed;
        const hours = c.role === "dietitian" ? 3 : 4;
        for (let h = 0; h < hours * 60; h += type.durationMinutes < 30 ? 30 : type.durationMinutes) {
          const s = new Date(d);
          s.setUTCHours(startHour, 0, 0, 0);
          s.setUTCMinutes(s.getUTCMinutes() + h);
          if (s.getTime() < leadTime) continue;
          // skip a few to look real
          if ((s.getUTCHours() + s.getUTCDate() + c.id.length) % 4 === 0) continue;
          const startUtc = s.toISOString();
          if (taken.has(`${c.id}|${startUtc}`)) continue;
          out.push({ clinicianId: c.id, startUtc, endUtc: new Date(s.getTime() + type.durationMinutes * 60_000).toISOString() });
        }
      }
    }
    return out.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }

  async book(patientId: string, req: { appointmentTypeId: string; clinicianId: string; startUtc: string; endUtc: string; patientNotes?: string; programmeStepId?: string }) {
    await this.getPatient(patientId);
    const type = APPOINTMENT_TYPES.find((t) => t.id === req.appointmentTypeId);
    if (!type) throw new SembleAdapterError("Unknown appointment type", "not-found");
    const clash = [...this.appts.values()].flat().find((a) => a.status === "confirmed" && a.clinician.id === req.clinicianId && a.startUtc === req.startUtc);
    if (clash) throw new SembleAdapterError("That time has just been taken", "slot-taken");
    const a: Appointment = {
      id: `bk-new-${++this.seq}`,
      type,
      clinician: clinicianById(req.clinicianId),
      startUtc: req.startUtc,
      endUtc: req.endUtc,
      status: "confirmed",
      videoUrl: `https://video.semble.io/room/bk-new-${this.seq}`,
      patientNotes: req.patientNotes,
      programmeStepId: req.programmeStepId,
      canReschedule: true,
      canCancel: true,
    };
    const list = this.appts.get(patientId) ?? [];
    list.push(a);
    this.appts.set(patientId, list);
    return a;
  }

  async reschedule(patientId: string, req: { appointmentId: string; clinicianId: string; startUtc: string; endUtc: string }) {
    const list = this.appts.get(patientId) ?? [];
    const a = list.find((x) => x.id === req.appointmentId);
    if (!a) throw new SembleAdapterError("Appointment not found", "not-found");
    if (!a.canReschedule) throw new SembleAdapterError("This appointment can no longer be moved online", "not-supported");
    a.clinician = clinicianById(req.clinicianId);
    a.startUtc = req.startUtc;
    a.endUtc = req.endUtc;
    return a;
  }

  async cancel(patientId: string, appointmentId: string) {
    const list = this.appts.get(patientId) ?? [];
    const a = list.find((x) => x.id === appointmentId);
    if (!a) throw new SembleAdapterError("Appointment not found", "not-found");
    if (!a.canCancel) throw new SembleAdapterError("This appointment can no longer be cancelled online", "not-supported");
    a.status = "cancelled";
    a.canCancel = false;
    a.canReschedule = false;
  }

  async listPrescriptions(patientId: string) {
    await this.latency();
    return (PRESCRIPTIONS[patientId] ?? []).slice().sort((a, b) => b.issuedAtUtc.localeCompare(a.issuedAtUtc));
  }

  async getPrescriptionPdfUrl(patientId: string, prescriptionId: string) {
    await this.latency();
    const rx = (PRESCRIPTIONS[patientId] ?? []).find((r) => r.id === prescriptionId);
    return rx ? `/api/demo/pdf?kind=prescription&id=${prescriptionId}` : null;
  }

  async listDocuments(patientId: string) {
    await this.latency();
    return (DOCUMENTS[patientId] ?? []).slice().sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
  }

  async getDocumentUrl(patientId: string, documentId: string) {
    await this.latency();
    const d = (DOCUMENTS[patientId] ?? []).find((x) => x.id === documentId);
    return d ? `/api/demo/pdf?kind=document&id=${documentId}` : null;
  }

  async listInvoices(patientId: string) {
    await this.latency();
    return (INVOICES[patientId] ?? []).slice().sort((a, b) => b.issuedAtUtc.localeCompare(a.issuedAtUtc));
  }

  async listQuestionnaires(patientId: string) {
    await this.latency();
    return QUESTIONNAIRES[patientId] ?? [];
  }

  async sendMessage(patientId: string, channel: Message["channel"], body: string) {
    await this.getPatient(patientId);
    const m: Message = { id: `msg-new-${++this.seq}`, from: { kind: "patient" }, sentAtUtc: now().toISOString(), channel, body, readByPatient: true };
    const list = this.messages.get(patientId) ?? [];
    list.push(m);
    this.messages.set(patientId, list);
    return m;
  }

  async listMessages(patientId: string) {
    await this.latency();
    return (this.messages.get(patientId) ?? []).slice().sort((a, b) => a.sentAtUtc.localeCompare(b.sentAtUtc));
  }
}
