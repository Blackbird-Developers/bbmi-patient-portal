import "server-only";
import { SembleAdapterError, type SembleAdapter } from "./adapter";
import { chunkDays, fromPracticeLocalIso, fromPracticeLocalNaive, isRateLimitMessage, toPracticeLocalIso } from "./time";
import {
  CLINICIAN_ROLES,
  hasRole,
  type Appointment,
  type AppointmentType,
  type AvailabilitySlot,
  type Clinician,
  type ClinicianRole,
  type DocumentContent,
  type Invoice,
  type PatientDocument,
  type PatientProfile,
  type Prescription,
  type QuestionnaireSummary,
} from "./types";

/**
 * Real Semble adapter (GraphQL, header x-token). Production is
 * https://open.semble.io/graphql; the BBMI sandbox practice is
 * https://open.sandbox.semble.io/graphql (set SEMBLE_GRAPHQL_URL).
 *
 * Every operation validates against the schema of the "Beyond BMI (Sandbox)"
 * practice (introspected 2026-09-28), and the read paths have been run
 * against it. Every rule in ./adapter.ts is implemented HERE, so the UI never
 * sees them.
 *
 * Configuration lives in Semble, not in this file:
 *  - Appointment types are Semble products tagged with metadata
 *    `portalSlug` (e.g. "doctor-review") and `portalRole` (e.g. "dietitian").
 *    When any product carries `portalSlug`, only tagged products are offered.
 *  - A clinician's roles come from user metadata `portalRoles`
 *    ("doctor" or "nurse,health-coach"). When any clinician carries it, only
 *    tagged clinicians are offered; otherwise every practitioner is, with the
 *    role guessed from their specialties.
 */

type Meta = { key: string; value: string }[] | null | undefined;
const meta = (m: Meta, key: string) => m?.find((x) => x.key === key)?.value?.trim() || undefined;
const asRoles = (v?: string): ClinicianRole[] =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ClinicianRole => (CLINICIAN_ROLES as readonly string[]).includes(s));

type RawBooking = {
  id: string;
  start: string;
  end: string;
  deleted?: boolean | null;
  status?: string | null;
  comments?: string | null;
  videoUrl?: string | null;
  doctor?: { id: string } | null;
  appointment?: { id: string } | null;
  patientId?: string | null;
  metadata?: Meta;
};
const BOOKING_FIELDS = "id start end deleted status comments videoUrl patientId doctor { id } appointment { id } metadata { key value }";

/** Semble stores ISO 3166-1 alpha-2 country codes and rejects anything longer on update. */
const COUNTRY_CODES: Record<string, string> = { ireland: "IE", "republic of ireland": "IE", "northern ireland": "GB", "united kingdom": "GB", uk: "GB", "great britain": "GB" };
const COUNTRY_NAMES: Record<string, string> = { IE: "Ireland", GB: "United Kingdom" };
const toCountryCode = (c?: string) => {
  const v = (c ?? "").trim();
  if (!v) return "IE";
  if (/^[a-z]{2}$/i.test(v)) return v.toUpperCase();
  const code = COUNTRY_CODES[v.toLowerCase()];
  if (!code) throw new SembleAdapterError(`Unsupported country: ${v}`, "upstream");
  return code;
};
const fromCountryCode = (c?: string | null) => (c ? (COUNTRY_NAMES[c.toUpperCase()] ?? c) : undefined);

/** Minimum notice for online booking, and the reschedule/cancel cut-off (Terms: 24 h). */
const LEAD_TIME_MS = 12 * 3_600_000;
const CHANGE_CUTOFF_MS = 24 * 3_600_000;

export class GraphqlSembleAdapter implements SembleAdapter {
  private url = process.env.SEMBLE_GRAPHQL_URL || "https://open.semble.io/graphql";
  private token = process.env.SEMBLE_API_TOKEN || "";
  private refCache: { at: number; clinicians: Clinician[]; types: AppointmentType[]; locationId: string } | null = null;

  constructor() {
    if (!this.token) throw new Error("SEMBLE_API_TOKEN is required for SEMBLE_ADAPTER=graphql");
  }

  /**
   * GraphQL call. Retries Semble's "too often" rate limit (HTTP 200 + error), and
   * network failures where the connection was never made — safe even for mutations,
   * because the request never reached Semble. Anything else is not retried.
   */
  private async gql<T>(query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-token": this.token },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      const code = (e as { cause?: { code?: string } })?.cause?.code ?? "";
      if (/UND_ERR_CONNECT_TIMEOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(code) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        return this.gql<T>(query, variables, attempt + 1);
      }
      throw new SembleAdapterError("Semble could not be reached", "upstream", e);
    }
    if (res.status === 401 || res.status === 403) throw new SembleAdapterError("Semble rejected the token", "unauthorised");
    const json = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join("; ");
      if (isRateLimitMessage(msg) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 200));
        return this.gql<T>(query, variables, attempt + 1);
      }
      if (isRateLimitMessage(msg)) throw new SembleAdapterError("Semble is busy, try again in a moment", "rate-limited");
      if (json.errors.some((e) => e.extensions?.code === "UNAUTHENTICATED")) throw new SembleAdapterError("Semble rejected the token", "unauthorised");
      throw new SembleAdapterError(msg, "upstream");
    }
    if (!json.data) throw new SembleAdapterError("Empty response from Semble", "upstream");
    return json.data;
  }

  private static roleFromUser(u: { medicalSpecialties?: string[] | null; title?: string | null }): ClinicianRole {
    const s = (u.medicalSpecialties ?? []).join(" ").toLowerCase();
    if (/diet/.test(s)) return "dietitian";
    if (/nurs/.test(s) || /rgn/i.test(u.title ?? "")) return "nurse";
    if (/coach/.test(s)) return "health-coach";
    if (/psych/.test(s)) return "psychologist";
    return "doctor";
  }

  private static roleFromProductName(name: string): ClinicianRole {
    return /diet/i.test(name) ? "dietitian" : /nurse/i.test(name) ? "nurse" : /coach/i.test(name) ? "health-coach" : "doctor";
  }

  private async reference() {
    if (this.refCache && Date.now() - this.refCache.at < 5 * 60_000) return this.refCache;
    const data = await this.gql<{
      users: { data: { id: string; firstName: string; lastName: string; fullName: string; title?: string | null; isDoctor?: boolean | null; deleted?: boolean | null; medicalSpecialties?: string[] | null; registration?: string | null; positionTitle?: string | null; metadata?: Meta }[] };
      products: { data: { id: string; name: string; productType?: string | null; status?: string | null; duration?: number | null; price?: number | null; isBookable?: boolean | null; requiresPayment?: boolean | null; metadata?: Meta }[] };
      practice: { locations: { id: string; name: string }[] | null };
    }>(`query Reference {
          users(pagination:{page:1,pageSize:200}) { data { id firstName lastName fullName title isDoctor deleted medicalSpecialties registration positionTitle metadata { key value } } }
          products(pagination:{page:1,pageSize:200}) { data { id name productType status duration price isBookable requiresPayment metadata { key value } } }
          practice { locations { id name } } }`);

    // Availability and booking both need a location. BBMI is one virtual clinic; override with SEMBLE_LOCATION_ID if that changes.
    const locationId = process.env.SEMBLE_LOCATION_ID || data.practice.locations?.[0]?.id;
    if (!locationId) throw new SembleAdapterError("Semble practice has no location configured", "upstream");

    // Like products: once any clinician is tagged with portalRoles, only tagged clinicians are offered.
    const practitioners = data.users.data.filter((u) => u.isDoctor && !u.deleted);
    const taggedUsers = practitioners.filter((u) => asRoles(meta(u.metadata, "portalRoles") ?? meta(u.metadata, "portalRole")).length);
    const clinicians: Clinician[] = (taggedUsers.length ? taggedUsers : practitioners)
      .map((u) => {
        const tagged = asRoles(meta(u.metadata, "portalRoles") ?? meta(u.metadata, "portalRole"));
        const roles = tagged.length ? tagged : [GraphqlSembleAdapter.roleFromUser(u)];
        return {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          fullName: u.fullName,
          title: u.title ?? undefined,
          role: roles[0],
          roles,
          specialty: u.positionTitle ?? undefined,
          registration: u.registration ?? undefined,
        };
      });

    const bookable = data.products.data.filter((p) => p.isBookable && p.productType === "appointment" && (!p.status || p.status === "active"));
    const tagged = bookable.filter((p) => meta(p.metadata, "portalSlug"));
    const types: AppointmentType[] = (tagged.length ? tagged : bookable).map((p) => ({
      id: p.id,
      name: p.name,
      slug: meta(p.metadata, "portalSlug") ?? p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      role: asRoles(meta(p.metadata, "portalRole"))[0] ?? GraphqlSembleAdapter.roleFromProductName(p.name),
      durationMinutes: p.duration ?? 30,
      price: p.price ?? 0,
      requiresPayment: !!p.requiresPayment,
    }));

    this.refCache = { at: Date.now(), clinicians, types, locationId };
    return this.refCache;
  }

  /* ------------------------------------------------------------------ patient */

  async getPatient(patientId: string): Promise<PatientProfile> {
    const d = await this.gql<{ patient: null | { id: string; firstName: string; lastName: string; email: string; phones?: { phoneNumber: string }[] | null; dob?: string | null; gender?: string | null; numbers?: { name: string; value: string }[] | null; address?: { address?: string | null; city?: string | null; postcode?: string | null; country?: string | null } | null; communicationPreferences?: { receiveEmail: boolean; receiveSMS: boolean; promotionalMarketing: boolean } | null; labels?: { text: string }[] | null } }>(
      `query PatientById($id: ID!) { patient(id: $id) { id firstName lastName email dob gender phones { phoneNumber } numbers { name value } address { address city postcode country } communicationPreferences { receiveEmail receiveSMS promotionalMarketing } labels { text } } }`,
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
      // Semble sends a date of birth as midnight with a Z; the portal wants the calendar date only.
      dob: p.dob ? p.dob.slice(0, 10) : undefined,
      gender: p.gender ?? undefined,
      // Semble keeps one free-text address line; line 2 and county are folded into it on write.
      address: p.address && (p.address.address || p.address.city || p.address.postcode) ? { line1: p.address.address ?? undefined, city: p.address.city ?? undefined, postcode: p.address.postcode ?? undefined, country: fromCountryCode(p.address.country) } : undefined,
      communicationPreferences: p.communicationPreferences ?? undefined,
      labels: p.labels?.map((l) => l.text),
    };
  }

  async findPatientByEmail(email: string) {
    // patients(search:) is fuzzy — only an EXACT email match counts, and two exact matches is a duplicate we refuse to guess between.
    const e = email.trim().toLowerCase();
    const d = await this.gql<{ patients: { data: { id: string; email?: string | null }[] } }>(
      `query Patients($s: String) { patients(search: $s, pagination:{page:1,pageSize:20}) { data { id email } } }`,
      { s: e },
    );
    const hits = [...new Set(d.patients.data.filter((p) => p.email?.trim().toLowerCase() === e).map((p) => p.id))];
    if (hits.length > 1) throw new SembleAdapterError("More than one Semble patient has this email", "upstream");
    return hits[0] ? this.getPatient(hits[0]) : null;
  }

  async updatePatientContact(patientId: string, patch: Partial<Pick<PatientProfile, "phone" | "address" | "communicationPreferences">>): Promise<PatientProfile> {
    const patientData: Record<string, unknown> = {};
    if (patch.address) {
      const a = patch.address;
      patientData.address = [a.line1, a.line2, a.county].filter(Boolean).join(", ");
      patientData.city = a.city ?? "";
      patientData.postcode = a.postcode ?? "";
      patientData.country = toCountryCode(a.country);
    }
    if (patch.communicationPreferences) patientData.communicationPreferences = patch.communicationPreferences;
    if (Object.keys(patientData).length) {
      const d = await this.gql<{ updatePatient: { data: { id: string } | null; error?: string | null } }>(
        `mutation UpdatePatient($id: ID!, $p: UpdatePatientDataInput!) { updatePatient(id: $id, patientData: $p) { data { id } error } }`,
        { id: patientId, p: patientData },
      );
      if (!d.updatePatient.data) throw new SembleAdapterError(d.updatePatient.error || "Could not update your details", "upstream");
    }
    if (patch.phone) {
      const cur = await this.gql<{ patient: null | { phones?: { phoneId: string; phoneType?: string | null; phoneNumber?: string | null }[] | null } }>(
        `query Phones($id: ID!) { patient(id: $id) { phones { phoneId phoneType phoneNumber } } }`,
        { id: patientId },
      );
      if (!cur.patient) throw new SembleAdapterError("Patient not found", "not-found");
      const first = cur.patient.phones?.[0];
      if (first?.phoneNumber !== patch.phone) {
        const d = first
          ? await this.gql<{ updatePatientPhoneNumber: { data: { id: string } | null; error?: string | null } }>(
              `mutation UpdatePhone($id: ID!, $ph: ID!, $n: String!, $t: String) { updatePatientPhoneNumber(patientId: $id, phoneId: $ph, phoneData: { phoneNumber: $n, phoneType: $t }) { data { id } error } }`,
              { id: patientId, ph: first.phoneId, n: patch.phone, t: first.phoneType ?? "Mobile" },
            ).then((r) => r.updatePatientPhoneNumber)
          : await this.gql<{ addPatientPhoneNumber: { data: { id: string } | null; error?: string | null } }>(
              `mutation AddPhone($id: ID!, $n: String!) { addPatientPhoneNumber(patientId: $id, phoneData: { phoneNumber: $n, phoneType: "Mobile" }) { data { id } error } }`,
              { id: patientId, n: patch.phone },
            ).then((r) => r.addPatientPhoneNumber);
        if (!d.data) throw new SembleAdapterError(d.error || "Could not update your phone number", "upstream");
      }
    }
    return this.getPatient(patientId);
  }

  /* ------------------------------------------------------------------ care team */

  async listClinicians() {
    return (await this.reference()).clinicians;
  }
  async listAppointmentTypes() {
    return (await this.reference()).types;
  }

  /* ------------------------------------------------------------------ appointments */

  private async mapBooking(b: RawBooking): Promise<Appointment> {
    const ref = await this.reference();
    const startUtc = fromPracticeLocalIso(b.start);
    const endUtc = fromPracticeLocalIso(b.end);
    const doctorId = b.doctor?.id ?? "";
    const clinician = ref.clinicians.find((c) => c.id === doctorId) ?? { id: doctorId, firstName: "", lastName: "", fullName: "Your clinician", role: "doctor" as const };
    const typeId = b.appointment?.id ?? "";
    const type = ref.types.find((t) => t.id === typeId) ?? { id: typeId, name: "Appointment", slug: "appointment", role: clinician.role, durationMinutes: 0, price: 0, requiresPayment: false };
    const status: Appointment["status"] = b.deleted || b.status === "failed" ? "cancelled" : b.status === "pending" || b.status === "processing" ? "pending" : new Date(endUtc).getTime() < Date.now() ? "completed" : "confirmed";
    const changeable = status === "confirmed" && new Date(startUtc).getTime() > Date.now() + CHANGE_CUTOFF_MS;
    return {
      id: b.id,
      type,
      clinician,
      startUtc,
      endUtc,
      status,
      videoUrl: b.videoUrl ?? undefined,
      patientNotes: b.comments ?? undefined,
      programmeStepId: meta(b.metadata, "programmeStep"),
      canReschedule: changeable,
      canCancel: changeable,
    };
  }

  async listAppointments(patientId: string, range: { fromUtc: string; toUtc: string }) {
    // Patient-scoped read: `patient(id){ bookings(start,end) }` — never the practice-wide `bookings(dateRange)`
    // (no patientId filter there). Semble matches on booking START; pad 6h back. Dedupe: ~13% duplicate rows.
    const from = new Date(new Date(range.fromUtc).getTime() - 6 * 3_600_000).toISOString();
    const d = await this.gql<{ patient: null | { bookings: RawBooking[] } }>(
      `query PatientBookings($id: ID!, $from: Date!, $to: Date!) { patient(id: $id) { bookings(start: $from, end: $to, queryOptions: { includeDeleted: true }) { ${BOOKING_FIELDS} } } }`,
      { id: patientId, from: toPracticeLocalIso(from), to: toPracticeLocalIso(range.toUtc) },
    );
    const seen = new Map<string, Appointment>();
    for (const b of d.patient?.bookings ?? []) {
      if (b.patientId && b.patientId !== patientId) continue;
      if (!seen.has(b.id)) seen.set(b.id, await this.mapBooking(b));
    }
    return [...seen.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }

  async getAppointment(patientId: string, appointmentId: string) {
    const d = await this.gql<{ booking: null | (RawBooking & { patient?: { id: string } | null }) }>(
      `query Booking($id: ID!) { booking(id: $id) { ${BOOKING_FIELDS} patient { id } } }`,
      { id: appointmentId },
    );
    const b = d.booking;
    if (!b || (b.patient?.id ?? b.patientId) !== patientId) return null;
    return this.mapBooking(b);
  }

  /** Free windows per clinician, as true-UTC intervals. Prefers the New Appointment System's availabilitySlots. */
  private async freeWindows(clinicianIds: string[], fromUtc: string, toUtc: string, locationId: string): Promise<{ clinicianId: string; start: number; end: number }[]> {
    const out: { clinicianId: string; start: number; end: number }[] = [];
    for (const w of chunkDays(fromUtc, toUtc, 7)) {
      const startDay = toPracticeLocalIso(w.from).slice(0, 10);
      const endDay = toPracticeLocalIso(w.to).slice(0, 10);
      try {
        for (let page = 1; page < 20; page++) {
          const d = await this.gql<{ availabilitySlots: { data: { startLocal: string; endLocal: string; user?: { id: string } | null }[]; pageInfo?: { hasMore?: boolean | null } | null } }>(
            `query Slots($from: Date!, $to: Date!, $users: [String], $locations: [String], $page: Int) { availabilitySlots(dateRange: { start: $from, end: $to }, userIds: $users, locationIds: $locations, pagination: { page: $page, pageSize: 200 }) { data { startLocal endLocal user { id } } pageInfo { hasMore } } }`,
            { from: startDay, to: endDay, users: clinicianIds, locations: [locationId], page },
          );
          for (const s of d.availabilitySlots.data) {
            if (!s.user?.id || !clinicianIds.includes(s.user.id)) continue;
            out.push({ clinicianId: s.user.id, start: new Date(fromPracticeLocalNaive(s.startLocal)).getTime(), end: new Date(fromPracticeLocalNaive(s.endLocal)).getTime() });
          }
          if (!d.availabilitySlots.pageInfo?.hasMore) break;
        }
      } catch (e) {
        if (!(e instanceof SembleAdapterError) || e.code !== "upstream") throw e;
        // Practices without the New Appointment System: the legacy query, one clinician at a time (rows carry no clinician).
        for (const clinicianId of clinicianIds) {
          const d = await this.gql<{ availabilities: { data: { start: string; end: string }[] } }>(
            `query Availabilities($from: Date!, $to: Date!, $location: ID!, $doctor: ID) { availabilities(dateRange:{start:$from,end:$to}, locationId:$location, doctorId:$doctor) { data { start end } } }`,
            { from: toPracticeLocalIso(w.from), to: toPracticeLocalIso(w.to), location: locationId, doctor: clinicianId },
          );
          for (const a of d.availabilities.data) out.push({ clinicianId, start: new Date(fromPracticeLocalIso(a.start)).getTime(), end: new Date(fromPracticeLocalIso(a.end)).getTime() });
        }
      }
    }
    return out;
  }

  /** Existing (non-deleted) bookings per clinician in the range, as true-UTC intervals. */
  private async busy(clinicianIds: string[], fromUtc: string, toUtc: string): Promise<Map<string, { start: number; end: number; id: string }[]>> {
    const out = new Map<string, { start: number; end: number; id: string }[]>();
    for (const id of clinicianIds) {
      const list: { start: number; end: number; id: string }[] = [];
      for (let page = 1; page < 20; page++) {
        const d = await this.gql<{ user: null | { bookings: null | { data: { id: string; start: string; end: string; deleted?: boolean | null }[]; pageInfo?: { hasMore?: boolean | null } | null } } }>(
          `query Busy($id: ID!, $from: Date!, $to: Date!, $page: Int) { user(id: $id) { bookings(start: $from, end: $to, page: $page, pageSize: 200) { data { id start end deleted } pageInfo { hasMore } } } }`,
          { id, from: toPracticeLocalIso(new Date(new Date(fromUtc).getTime() - 6 * 3_600_000).toISOString()), to: toPracticeLocalIso(toUtc), page },
        );
        for (const b of d.user?.bookings?.data ?? []) if (!b.deleted) list.push({ id: b.id, start: new Date(fromPracticeLocalIso(b.start)).getTime(), end: new Date(fromPracticeLocalIso(b.end)).getTime() });
        if (!d.user?.bookings?.pageInfo?.hasMore) break;
      }
      out.set(id, list);
    }
    return out;
  }

  async getAvailability(q: { appointmentTypeId: string; fromUtc: string; toUtc: string; clinicianId?: string }, ignoreBookingId?: string): Promise<AvailabilitySlot[]> {
    const ref = await this.reference();
    const type = ref.types.find((t) => t.id === q.appointmentTypeId);
    if (!type) throw new SembleAdapterError("Unknown appointment type", "not-found");
    const clinicianIds = ref.clinicians.filter((c) => hasRole(c, type.role) && (!q.clinicianId || c.id === q.clinicianId)).map((c) => c.id);
    if (!clinicianIds.length) return [];
    const [windows, busy] = await Promise.all([this.freeWindows(clinicianIds, q.fromUtc, q.toUtc, ref.locationId), this.busy(clinicianIds, q.fromUtc, q.toUtc)]);
    const step = Math.max(type.durationMinutes, 10) * 60_000;
    const floor = Date.now() + LEAD_TIME_MS;
    const from = new Date(q.fromUtc).getTime();
    const to = new Date(q.toUtc).getTime();
    const seen = new Set<string>();
    const out: AvailabilitySlot[] = [];
    for (const w of windows) {
      // slice the window into slots of the appointment length, skipping anything that overlaps an existing booking
      for (let s = w.start; s + step <= w.end; s += step) {
        const e = s + step;
        if (s < floor || s < from || s > to) continue;
        if ((busy.get(w.clinicianId) ?? []).some((b) => b.id !== ignoreBookingId && b.start < e && s < b.end)) continue;
        const key = `${w.clinicianId}|${s}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ clinicianId: w.clinicianId, startUtc: new Date(s).toISOString(), endUtc: new Date(e).toISOString() });
      }
    }
    return out.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }

  /** createBooking has no overlap guard, so re-read the diary for that exact slot immediately before writing. */
  private async assertSlotFree(appointmentTypeId: string, clinicianId: string, startUtc: string, endUtc: string, ignoreBookingId?: string) {
    const dayStart = new Date(startUtc);
    dayStart.setUTCHours(0, 0, 0, 0);
    const slots = await this.getAvailability({ appointmentTypeId, clinicianId, fromUtc: dayStart.toISOString(), toUtc: new Date(dayStart.getTime() + 86_400_000).toISOString() }, ignoreBookingId);
    const wantS = new Date(startUtc).getTime();
    const wantE = new Date(endUtc).getTime();
    if (!slots.some((s) => new Date(s.startUtc).getTime() === wantS && new Date(s.endUtc).getTime() === wantE)) throw new SembleAdapterError("That time has just been taken", "slot-taken");
  }

  private static bookingError(error: string | null | undefined, fallback: string): SembleAdapterError {
    const msg = error || fallback;
    if (/taken|overlap|double/i.test(msg)) return new SembleAdapterError("That time has just been taken", "slot-taken");
    if (/available at location/i.test(msg)) return new SembleAdapterError("This appointment type is not enabled at the clinic in Semble yet", "not-supported", msg);
    return new SembleAdapterError(msg, "upstream");
  }

  async book(patientId: string, req: { appointmentTypeId: string; clinicianId: string; startUtc: string; endUtc: string; patientNotes?: string; programmeStepId?: string }) {
    const ref = await this.reference();
    const type = ref.types.find((t) => t.id === req.appointmentTypeId);
    const clinician = ref.clinicians.find((c) => c.id === req.clinicianId);
    if (!type || !clinician || !hasRole(clinician, type.role)) throw new SembleAdapterError("Unknown appointment type or clinician", "not-found");
    await this.assertSlotFree(req.appointmentTypeId, req.clinicianId, req.startUtc, req.endUtc);
    const d = await this.gql<{ createBooking: { data: RawBooking | null; error?: string | null } }>(
      `mutation CreateBooking($b: BookingDataInput!) { createBooking(bookingData: $b) { data { ${BOOKING_FIELDS} } error } }`,
      {
        b: {
          patient: patientId,
          location: ref.locationId,
          doctor: req.clinicianId,
          bookingType: req.appointmentTypeId,
          start: toPracticeLocalIso(req.startUtc),
          end: toPracticeLocalIso(req.endUtc),
          comments: req.patientNotes,
          // API bookings are silent unless asked; the patient gets Semble's confirmation, reminder and follow-up.
          sendPatientMessages: { confirmation: true, reminder: true, followup: true },
        },
      },
    );
    if (!d.createBooking.data) throw GraphqlSembleAdapter.bookingError(d.createBooking.error, "Booking failed");
    const id = d.createBooking.data.id;
    // Stamp provenance on the Semble row — Semble has no createdBy; this is how support can tell portal bookings apart.
    const stamp: [string, string][] = [["source", "portal"], ["portalPatientId", patientId], ...(req.programmeStepId ? [["programmeStep", req.programmeStepId] as [string, string]] : [])];
    for (const [key, value] of stamp) {
      await this.gql(`mutation Stamp($id: ID!, $key: String!, $value: String!) { updateBookingMetadata(bookingId: $id, key: $key, value: $value) { data { id } error } }`, { id, key, value }).catch(() => undefined);
    }
    const a = await this.mapBooking(d.createBooking.data);
    return { ...a, programmeStepId: req.programmeStepId ?? a.programmeStepId };
  }

  async reschedule(patientId: string, req: { appointmentId: string; clinicianId: string; startUtc: string; endUtc: string }) {
    const own = await this.getAppointment(patientId, req.appointmentId);
    if (!own) throw new SembleAdapterError("Appointment not found", "not-found");
    if (!own.canReschedule) throw new SembleAdapterError("This appointment can no longer be moved online", "not-supported");
    const ref = await this.reference();
    const clinician = ref.clinicians.find((c) => c.id === req.clinicianId);
    if (!clinician || !hasRole(clinician, own.type.role)) throw new SembleAdapterError("Unknown clinician", "not-found");
    await this.assertSlotFree(own.type.id, req.clinicianId, req.startUtc, req.endUtc, own.id);
    const d = await this.gql<{ updateBooking: { data: RawBooking | null; error?: string | null } }>(
      `mutation UpdateBooking($id: ID!, $b: BookingUpdateDataInput!) { updateBooking(id: $id, bookingData: $b) { data { ${BOOKING_FIELDS} } error } }`,
      // enforceDoubleBooking is Semble's only server-side overlap guard and exists only on update.
      { id: req.appointmentId, b: { doctor: req.clinicianId, start: toPracticeLocalIso(req.startUtc), end: toPracticeLocalIso(req.endUtc), enforceDoubleBooking: true, sendPatientMessages: { confirmation: true, reminder: true, followup: true } } },
    );
    if (!d.updateBooking.data) throw GraphqlSembleAdapter.bookingError(d.updateBooking.error, "Reschedule failed");
    return this.mapBooking(d.updateBooking.data);
  }

  async cancel(patientId: string, appointmentId: string) {
    const own = await this.getAppointment(patientId, appointmentId);
    if (!own) throw new SembleAdapterError("Appointment not found", "not-found");
    if (!own.canCancel) throw new SembleAdapterError("This appointment can no longer be cancelled online", "not-supported");
    const d = await this.gql<{ deleteBooking: { data: { id: string } | null; error?: string | null } }>(
      `mutation DeleteBooking($id: ID!) { deleteBooking(id: $id, sendCancellationMessages: true, notifyPractice: true) { data { id } error } }`,
      { id: appointmentId },
    );
    if (!d.deleteBooking.data) throw new SembleAdapterError(d.deleteBooking.error || "Cancellation failed", "upstream");
  }

  /* ------------------------------------------------------------------ clinical artefacts */

  async listPrescriptions(patientId: string): Promise<Prescription[]> {
    const ref = await this.reference();
    // Patient sub-field, not the practice-wide sweep (39% duplicate rows there). No updatedAt on prescriptions → no polling.
    const d = await this.gql<{ patient: null | { prescriptions: null | { data: { id: string; date?: string | null; status?: string | null; doctor?: { id: string } | null; patient?: { id: string } | null; drugs?: { drug?: string | null; dosage?: string | null; quantity?: string | null; comments?: string | null }[] | null; dateShared?: string | null }[] } } }>(
      `query PatientPrescriptions($id: ID!) { patient(id: $id) { prescriptions(page: 1, pageSize: 50) { data { id date status dateShared doctor { id } patient { id } drugs { drug dosage quantity comments } } } } }`,
      { id: patientId },
    );
    const seen = new Map<string, Prescription>();
    for (const r of d.patient?.prescriptions?.data ?? []) {
      if (r.patient?.id !== patientId || seen.has(r.id) || !r.date) continue;
      seen.set(r.id, {
        id: r.id,
        issuedAtUtc: fromPracticeLocalIso(r.date),
        prescriber: ref.clinicians.find((c) => c.id === r.doctor?.id) ?? { id: r.doctor?.id ?? "", firstName: "", lastName: "", fullName: "Your doctor", role: "doctor" },
        drugs: (r.drugs ?? []).map((x) => ({ name: x.drug ?? "Medication", dosage: x.dosage ?? undefined, quantity: x.quantity ?? undefined, comments: x.comments ?? undefined })),
        status: /cancel|void/i.test(r.status ?? "") ? "cancelled" : r.dateShared ? "sent" : "issued",
        // The list never mints the 15-minute PDF URL; getPrescriptionPdfUrl does, on click.
        pdfAvailable: true,
      });
    }
    return [...seen.values()].sort((a, b) => b.issuedAtUtc.localeCompare(a.issuedAtUtc));
  }

  async getPrescriptionPdfUrl(patientId: string, prescriptionId: string) {
    const d = await this.gql<{ prescription: null | { id: string; patient?: { id: string } | null; pdfDownloadUrl?: string | null } }>(
      `query Prescription($id: ID!) { prescription(id: $id) { id patient { id } pdfDownloadUrl } }`,
      { id: prescriptionId },
    );
    if (!d.prescription || d.prescription.patient?.id !== patientId) return null;
    return d.prescription.pdfDownloadUrl ?? null; // 15-minute URL — streamed by the portal, never logged or sent to the browser
  }

  private async shared(patientId: string) {
    const d = await this.gql<{ patient: null | { documentsSharedWithPatient: { data: { documentId: string | null; title: string; type: string; sharedAt: string }[] } } }>(
      `query Shared($id: ID!) { patient(id: $id) { documentsSharedWithPatient(page: 1, pageSize: 100) { data { documentId title type sharedAt } } } }`,
      { id: patientId },
    );
    return d.patient?.documentsSharedWithPatient.data ?? [];
  }

  async listDocuments(patientId: string): Promise<PatientDocument[]> {
    // Visibility allow-list = what staff clicked "Share" on. Sharing cannot be set via API, so the portal
    // shows only `documentsSharedWithPatient` (letters, labs, documents) — a clinical-governance choice.
    const kindOf = (t: string, title: string): PatientDocument["kind"] =>
      t === "lab" ? "lab" : /insurance/i.test(title) ? "insurance" : /plan/i.test(title) ? "plan" : /consent/i.test(title) ? "consent" : t === "letter" ? "letter" : "other";
    const seen = new Map<string, PatientDocument>();
    for (const s of await this.shared(patientId)) {
      if (!s.documentId || seen.has(s.documentId) || !["document", "letter", "lab"].includes(s.type)) continue; // invoices/prescriptions have their own screens
      seen.set(s.documentId, { id: s.documentId, kind: kindOf(s.type, s.title), title: s.title, createdAtUtc: fromPracticeLocalIso(s.sharedAt), downloadable: s.type === "document" || s.type === "letter" });
    }
    return [...seen.values()].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
  }

  async openDocument(patientId: string, documentId: string): Promise<DocumentContent | null> {
    // Only what staff shared with this patient can be opened — an id alone is not proof of access.
    const s = (await this.shared(patientId)).find((x) => x.documentId === documentId);
    if (!s) return null;
    if (s.type === "letter") {
      const d = await this.gql<{ letter: null | { id: string; title?: string | null; body?: string | null; deleted?: boolean | null; patient?: { id: string } | null } }>(
        `query Letter($id: ID!) { letter(id: $id) { id title body deleted patient { id } } }`,
        { id: documentId },
      );
      if (!d.letter || d.letter.deleted || d.letter.patient?.id !== patientId) return null;
      return { kind: "html", title: d.letter.title ?? s.title, html: d.letter.body ?? "" };
    }
    if (s.type !== "document") return null;
    // PatientDocument.downloadUrl = 2-hour reusable URL; the route streams it so it never reaches the browser.
    const d = await this.gql<{ patientDocument: null | { id: string; name?: string | null; patient?: { id: string } | null; downloadUrl?: string | null; deleted?: boolean | null } }>(
      `query Doc($id: ID!) { patientDocument(id: $id) { id name deleted patient { id } downloadUrl } }`,
      { id: documentId },
    );
    const doc = d.patientDocument;
    if (!doc || doc.deleted || doc.patient?.id !== patientId || !doc.downloadUrl) return null;
    return { kind: "url", url: doc.downloadUrl, filename: doc.name ?? s.title, external: true };
  }

  async listInvoices(patientId: string): Promise<Invoice[]> {
    // Patient-scoped read. The practice-wide invoices(dateRange) sweep pages across every patient and misses rows.
    const d = await this.gql<{ patient: null | { invoices: null | { id: string; invoiceNumber?: number | null; date: string; total?: number | null; outstanding?: number | null; refunded?: number | null; paidOrOutstanding?: string | null; status?: string | null; patientId?: string | null }[] } }>(
      `query PatientInvoices($id: ID!, $from: Date!, $to: Date!) { patient(id: $id) { invoices(start: $from, end: $to) { id invoiceNumber date total outstanding refunded paidOrOutstanding status patientId } } }`,
      { id: patientId, from: new Date(Date.now() - 400 * 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() },
    );
    const seen = new Map<string, Invoice>();
    for (const i of d.patient?.invoices ?? []) {
      if ((i.patientId && i.patientId !== patientId) || seen.has(i.id)) continue;
      const total = i.total ?? 0;
      const status: Invoice["status"] = /void|cancel/i.test(i.status ?? "") ? "void" : (i.refunded ?? 0) > 0 && (i.refunded ?? 0) >= total ? "refunded" : /^paid$/i.test(i.paidOrOutstanding ?? "") || (i.outstanding ?? 1) === 0 ? "paid" : "unpaid";
      seen.set(i.id, {
        id: i.id,
        number: i.invoiceNumber != null ? String(i.invoiceNumber) : i.id,
        issuedAtUtc: fromPracticeLocalIso(i.date),
        description: "Clinic invoice",
        amount: total,
        status,
        source: "semble",
        downloadable: false,
      });
    }
    return [...seen.values()].sort((a, b) => b.issuedAtUtc.localeCompare(a.issuedAtUtc));
  }

  async listQuestionnaires(): Promise<QuestionnaireSummary[]> {
    return []; // Portal forms are portal-owned; where they land in Semble is an open decision (see /architecture).
  }
}
