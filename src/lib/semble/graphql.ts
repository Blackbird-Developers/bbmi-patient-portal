import "server-only";
import { SembleAdapterError, type SembleAdapter } from "./adapter";
import { chunkDays, fromPracticeLocalIso, fromPracticeLocalNaive, isRateLimitMessage, toPracticeLocalIso } from "./time";
import {
  CLINICIAN_ROLES,
  hasRole,
  type Appointment,
  type AppointmentType,
  type AvailabilityQuery,
  type AvailabilitySlot,
  type Clinician,
  type ClinicianRole,
  type DocumentContent,
  type Invoice,
  type NewPatient,
  type PatientDocument,
  type PatientProfile,
  type Prescription,
  type QuestionnaireSummary,
} from "./types";

/**
 * Real Semble adapter (GraphQL, header x-token). Production is
 * https://open.semble.io/graphql; the BBMI sandbox practice is
 * https://open.sandbox.semble.io/graphql (set SEMBLE_GRAPHQL_URL). Pointing it
 * at production also needs PORTAL_ALLOW_PRODUCTION=1, which must wait for real
 * authentication.
 *
 * Every operation validates against the schema of the "Beyond BMI (Sandbox)"
 * practice and has been run against it. Every rule in ./adapter.ts is
 * implemented HERE, so the UI never sees them.
 *
 * Configuration lives in Semble, not in this file:
 *  - Appointment types are Semble products tagged with metadata
 *    `portalSlug` (e.g. "doctor-review") and `portalRole` (e.g. "dietitian").
 *    When any product carries `portalSlug`, only tagged products are offered.
 *  - A clinician's roles come from user metadata `portalRoles`
 *    ("doctor" or "nurse,health-coach"). When any clinician carries it, only
 *    tagged clinicians are offered; otherwise every practitioner is, with the
 *    role guessed from their specialties.
 *  - Rooms: an appointment type is offered in the rooms whose "Services
 *    provided" include it (Settings → Locations in Semble). SEMBLE_LOCATION_ID
 *    pins one room instead.
 *
 * Time: booking start/end and availability are naive Dublin wall-clock (the
 * fake-Z convention in ./time.ts); system timestamps such as a prescription's
 * date or a document's sharedAt are true UTC.
 */

type Meta = { key: string; value: string }[] | null | undefined;
const meta = (m: Meta, key: string) => m?.find((x) => x.key === key)?.value?.trim() || undefined;
const asRoles = (v?: string): ClinicianRole[] =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ClinicianRole => (CLINICIAN_ROLES as readonly string[]).includes(s));
const trueUtc = (iso: string) => new Date(iso).toISOString();

type RawBooking = {
  id: string;
  start: string;
  end: string;
  deleted?: boolean | null;
  status?: string | null;
  comments?: string | null;
  videoUrl?: string | null;
  doctor?: { id: string; fullName?: string | null } | null;
  appointment?: { id: string; title?: string | null; duration?: number | null } | null;
  patientId?: string | null;
  metadata?: Meta;
  bookingJourney?: { dna?: string | null } | null;
};
const BOOKING_FIELDS = "id start end deleted status comments videoUrl patientId doctor { id fullName } appointment { id title duration } metadata { key value } bookingJourney { dna }";

type Room = { id: string; name: string; services: Set<string> };
type Window = { clinicianId: string; roomId: string; start: number; end: number };
type Reference = { at: number; clinicians: Clinician[]; types: AppointmentType[]; rooms: Room[]; servicesByClinician: Map<string, Set<string>> };

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
const LEAD_TIME_GRACE_MS = 15 * 60_000; // a slot shown just before the cut-off can still be confirmed
const CHANGE_CUTOFF_MS = 24 * 3_600_000;
const MAX_PAGES = 50;
/** Semble's refusal when a practice is not on the New Appointment System (or the query shape is unknown). */
const NO_SLOTS_API = /new (semble )?appointment system|not (enabled|available)|cannot query field|unknown argument/i;

export class GraphqlSembleAdapter implements SembleAdapter {
  private url = process.env.SEMBLE_GRAPHQL_URL || "https://open.semble.io/graphql";
  private token = process.env.SEMBLE_API_TOKEN || "";
  private refCache: Reference | null = null;
  private refInFlight: Promise<Reference> | null = null;
  /** Remembered once Semble refuses availabilitySlots for this practice. */
  private legacyAvailability = false;

  constructor() {
    if (!this.token) throw new Error("SEMBLE_API_TOKEN is required for SEMBLE_ADAPTER=graphql");
    if (!/sandbox/i.test(this.url) && process.env.PORTAL_ALLOW_PRODUCTION !== "1")
      throw new Error("Refusing to connect the prototype to a production Semble practice: it has no real authentication yet. Set PORTAL_ALLOW_PRODUCTION=1 only once it does.");
  }

  /**
   * GraphQL call.
   *  - Retries Semble's "too often" rate limit (HTTP 200 + error, or 429) — for a
   *    mutation only when Semble returned no data, i.e. the write did not happen.
   *  - Retries network failures where the connection was never made (safe even
   *    for mutations: the request never reached Semble).
   *  - A mutation that was sent but got no usable answer is "unknown-outcome":
   *    the change may or may not have happened.
   */
  private async gql<T>(query: string, variables: Record<string, unknown> = {}, attempt = 0): Promise<T> {
    const isMutation = /^\s*mutation\b/.test(query);
    const unknown = (cause: unknown) => new SembleAdapterError("Semble did not confirm the change", "unknown-outcome", cause);
    const retryLater = (ms: number) => new Promise((r) => setTimeout(r, ms + Math.random() * 200));

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
      const neverConnected = /UND_ERR_CONNECT_TIMEOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(code);
      if (neverConnected && attempt < 2) {
        await retryLater(500 * 2 ** attempt);
        return this.gql<T>(query, variables, attempt + 1);
      }
      if (isMutation && !neverConnected) throw unknown(e);
      throw new SembleAdapterError("Semble could not be reached", "unreachable", e);
    }

    if (res.status === 429) {
      if (attempt < 5) {
        await retryLater(400 * 2 ** attempt);
        return this.gql<T>(query, variables, attempt + 1);
      }
      throw new SembleAdapterError("Semble is busy, try again in a moment", "rate-limited");
    }

    let json: { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
    try {
      json = await res.json();
    } catch (e) {
      // An edge block (e.g. sustained bursts) answers with HTML, not a GraphQL error.
      if (res.status === 403) throw new SembleAdapterError("Semble is busy, try again in a moment", "rate-limited", e);
      if (isMutation) throw unknown(e);
      throw new SembleAdapterError(`Semble returned an unreadable response (HTTP ${res.status})`, "unreachable", e);
    }
    if (res.status === 401 || res.status === 403) throw new SembleAdapterError("Semble rejected the token", "unauthorised");
    if (!res.ok && !json.errors?.length) {
      if (isMutation) throw unknown(`HTTP ${res.status}`);
      throw new SembleAdapterError(`Semble returned HTTP ${res.status}`, "unreachable");
    }

    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join("; ");
      const wrote = !!json.data && Object.values(json.data as Record<string, unknown>).some((v) => v != null);
      if (isRateLimitMessage(msg)) {
        if (isMutation && wrote) throw unknown(msg);
        if (attempt < 5) {
          await retryLater(400 * 2 ** attempt);
          return this.gql<T>(query, variables, attempt + 1);
        }
        throw new SembleAdapterError("Semble is busy, try again in a moment", "rate-limited");
      }
      if (json.errors.some((e) => e.extensions?.code === "UNAUTHENTICATED")) throw new SembleAdapterError("Semble rejected the token", "unauthorised");
      // A write that came back with data but a field-level error still happened.
      if (isMutation && wrote) throw unknown(msg);
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

  private async reference(): Promise<Reference> {
    if (this.refCache && Date.now() - this.refCache.at < 5 * 60_000) return this.refCache;
    // One Reference query at a time: concurrent callers on a cold or expired cache share it.
    this.refInFlight ??= this.loadReference().finally(() => {
      this.refInFlight = null;
    });
    return this.refInFlight;
  }

  private async loadReference(): Promise<Reference> {
    const data = await this.gql<{
      users: { data: { id: string; firstName: string; lastName: string; fullName: string; title?: string | null; isDoctor?: boolean | null; deleted?: boolean | null; medicalSpecialties?: string[] | null; registration?: string | null; positionTitle?: string | null; metadata?: Meta; servicesProvided?: { id: string }[] | null }[] };
      products: { data: { id: string; name: string; productType?: string | null; status?: string | null; duration?: number | null; price?: number | null; isBookable?: boolean | null; requiresPayment?: boolean | null; metadata?: Meta }[] };
      practice: { locations: { id: string; name: string; servicesProvided?: { id: string }[] | null }[] | null };
    }>(`query Reference {
          users(pagination:{page:1,pageSize:200}) { data { id firstName lastName fullName title isDoctor deleted medicalSpecialties registration positionTitle metadata { key value } servicesProvided { id } } }
          products(pagination:{page:1,pageSize:200}) { data { id name productType status duration price isBookable requiresPayment metadata { key value } } }
          practice { locations { id name servicesProvided { id } } } }`);

    const rooms: Room[] = (data.practice.locations ?? []).map((l) => ({ id: l.id, name: l.name, services: new Set((l.servicesProvided ?? []).map((s) => s.id)) }));

    // Like products: once any clinician is tagged with portalRoles, only tagged clinicians are offered.
    const practitioners = data.users.data.filter((u) => u.isDoctor && !u.deleted);
    const taggedUsers = practitioners.filter((u) => asRoles(meta(u.metadata, "portalRoles") ?? meta(u.metadata, "portalRole")).length);
    const chosen = taggedUsers.length ? taggedUsers : practitioners;
    const clinicians: Clinician[] = chosen.map((u) => {
      const tagged = asRoles(meta(u.metadata, "portalRoles") ?? meta(u.metadata, "portalRole"));
      const roles = tagged.length ? tagged : [GraphqlSembleAdapter.roleFromUser(u)];
      return {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: u.fullName,
        title: u.title || undefined,
        role: roles[0],
        roles,
        specialty: u.positionTitle || undefined,
        registration: u.registration || undefined,
      };
    });
    const servicesByClinician = new Map(chosen.map((u) => [u.id, new Set((u.servicesProvided ?? []).map((s) => s.id))]));

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

    this.refCache = { at: Date.now(), clinicians, types, rooms, servicesByClinician };
    return this.refCache;
  }

  /** Rooms where this appointment type can be booked. */
  private static roomsFor(ref: Reference, typeId: string): string[] {
    const pinned = process.env.SEMBLE_LOCATION_ID;
    if (pinned) return [pinned];
    return ref.rooms.filter((r) => r.services.has(typeId)).map((r) => r.id);
  }

  /** Clinicians who can be booked for this type: right role, and (when Semble lists their services) they provide it. */
  private static cliniciansFor(ref: Reference, type: AppointmentType, only?: string): string[] {
    return ref.clinicians
      .filter((c) => hasRole(c, type.role) && (!only || c.id === only))
      .filter((c) => {
        const services = ref.servicesByClinician.get(c.id);
        return !services?.size || services.has(type.id);
      })
      .map((c) => c.id);
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
      numbers: Object.fromEntries((p.numbers ?? []).filter((n) => n.name && n.value).map((n) => [n.name, n.value])),
    };
  }

  async findPatientByEmail(email: string) {
    // patients(search:) is fuzzy — only an EXACT email match counts, and two exact matches is a duplicate we refuse to guess between.
    const e = email.trim().toLowerCase();
    const d = await this.gql<{ patients: { data: { id: string; email?: string | null }[] } }>(
      `query Patients($s: String) { patients(search: $s, pagination:{page:1,pageSize:50}) { data { id email } } }`,
      { s: e },
    );
    const hits = [...new Set(d.patients.data.filter((p) => p.email?.trim().toLowerCase() === e).map((p) => p.id))];
    if (hits.length > 1) throw new SembleAdapterError("More than one Semble patient has this email", "upstream");
    return hits[0] ? this.getPatient(hits[0]) : null;
  }

  async findPatientByNumber(numberName: string, value: string) {
    // Semble's patient search matches patient numbers; only an exact value on the named number counts.
    const d = await this.gql<{ patients: { data: { id: string; numbers?: { name?: string | null; value?: string | null }[] | null }[] } }>(
      `query PatientsByNumber($s: String) { patients(search: $s, pagination:{page:1,pageSize:50}) { data { id numbers { name value } } } }`,
      { s: value },
    );
    // Semble ids are Mongo ObjectIds, so sorting orders them by creation: duplicates always resolve to the oldest.
    const hits = [...new Set(d.patients.data.filter((p) => p.numbers?.some((n) => n.name === numberName && n.value === value)).map((p) => p.id))].sort();
    if (hits.length > 1) console.error(`Semble: ${hits.length} patients carry ${numberName} ${value}; using the oldest (${hits[0]}). Merge the others in Semble.`);
    return hits[0] ? this.getPatient(hits[0]) : null;
  }

  async setPatientNumber(patientId: string, numberName: string, value: string) {
    const d = await this.gql<{ practice: { practiceNumbers: { id: string; name: string; deleted?: boolean | null }[] | null }; patient: null | { numbers: { id: string; name?: string | null; value?: string | null }[] | null } }>(
      `query NumberDefs($id: ID!) { practice { practiceNumbers { id name deleted } } patient(id: $id) { numbers { id name value } } }`,
      { id: patientId },
    );
    if (!d.patient) throw new SembleAdapterError("Patient not found", "not-found");
    const existing = d.patient.numbers?.find((n) => n.name === numberName);
    if (existing?.value === value) return;
    if (existing) {
      const r = await this.gql<{ updatePatientNumber: { data: { id: string } | null; error?: string | null } }>(
        `mutation UpdateNumber($p: ID!, $n: ID!, $v: String) { updatePatientNumber(patientId: $p, patientNumberId: $n, value: $v) { data { id } error } }`,
        { p: patientId, n: existing.id, v: value },
      );
      if (!r.updatePatientNumber.data) throw new SembleAdapterError(r.updatePatientNumber.error || "Could not update the patient number", "upstream");
      return;
    }
    let def = d.practice.practiceNumbers?.find((n) => n.name === numberName && !n.deleted);
    if (!def) {
      const c = await this.gql<{ createPatientNumber: { data: { id: string; name: string } | null; error?: string | null } }>(
        `mutation CreateNumberDef($i: CreatePatientNumberInput!) { createPatientNumber(input: $i) { data { id name } error } }`,
        { i: { name: numberName, primary: false, idType: "USER" } },
      );
      if (!c.createPatientNumber.data) throw new SembleAdapterError(c.createPatientNumber.error || "Could not create the patient number", "upstream");
      def = c.createPatientNumber.data;
    }
    const a = await this.gql<{ addPatientNumber: { data: { id: string } | null; error?: string | null } }>(
      `mutation AddNumber($p: ID!, $n: AddPatientNumberData!) { addPatientNumber(patientId: $p, patientNumber: $n) { data { id } error } }`,
      { p: patientId, n: { numberId: def.id, value } },
    );
    if (!a.addPatientNumber.data) throw new SembleAdapterError(a.addPatientNumber.error || "Could not add the patient number", "upstream");
  }

  async createPatient(input: NewPatient): Promise<PatientProfile> {
    const d = await this.gql<{ createPatient: { data: { id: string } | null; error?: string | null } }>(
      `mutation CreatePatient($p: CreatePatientDataInput) { createPatient(patientData: $p) { data { id } error } }`,
      {
        p: {
          first: input.firstName,
          last: input.lastName,
          email: input.email.trim().toLowerCase(),
          ...(input.dob ? { dob: input.dob } : {}),
          ...(input.gender ? { gender: input.gender } : {}),
          ...(input.phone ? { phoneType: "Mobile", phoneNumber: input.phone } : {}),
          country: "IE",
          communicationPreferences: { receiveEmail: true, receiveSMS: false, promotionalMarketing: false },
        },
      },
    );
    if (!d.createPatient.data) throw new SembleAdapterError(d.createPatient.error || "Could not create the patient in Semble", "upstream");
    const id = d.createPatient.data.id;
    for (const [name, value] of Object.entries(input.numbers ?? {})) await this.setPatientNumber(id, name, value);
    return this.getPatient(id);
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
    let savedSomething = false;
    if (Object.keys(patientData).length) {
      const d = await this.gql<{ updatePatient: { data: { id: string } | null; error?: string | null } }>(
        `mutation UpdatePatient($id: ID!, $p: UpdatePatientDataInput!) { updatePatient(id: $id, patientData: $p) { data { id } error } }`,
        { id: patientId, p: patientData },
      );
      if (!d.updatePatient.data) throw new SembleAdapterError(d.updatePatient.error || "Could not update your details", "upstream");
      savedSomething = true;
    }
    if (patch.phone) {
      try {
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
      } catch (e) {
        // The address is already saved; say so rather than "nothing changed".
        if (savedSomething && e instanceof SembleAdapterError) throw new SembleAdapterError("Your address was saved but your phone number was not", "partial", e);
        throw e;
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

  private mapBooking(ref: Reference, b: RawBooking): Appointment {
    const startUtc = fromPracticeLocalIso(b.start);
    const endUtc = fromPracticeLocalIso(b.end);
    const doctorId = b.doctor?.id ?? "";
    const clinician = ref.clinicians.find((c) => c.id === doctorId) ?? { id: doctorId, firstName: "", lastName: "", fullName: b.doctor?.fullName || "Your clinician", role: "doctor" as const };
    const typeId = b.appointment?.id ?? "";
    const known = ref.types.find((t) => t.id === typeId);
    // A booking staff made with a type the portal doesn't offer still shows its real name and length.
    const type = known ?? { id: typeId, name: b.appointment?.title || "Appointment", slug: "appointment", role: clinician.role, durationMinutes: b.appointment?.duration ?? Math.round((new Date(endUtc).getTime() - new Date(startUtc).getTime()) / 60_000), price: 0, requiresPayment: false };
    const status: Appointment["status"] = b.deleted || b.status === "failed" ? "cancelled" : b.bookingJourney?.dna ? "no-show" : b.status === "pending" || b.status === "processing" ? "pending" : new Date(endUtc).getTime() < Date.now() ? "completed" : "confirmed";
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
      // Only types the portal can book can be moved online; the care team moves anything else.
      canReschedule: changeable && !!known,
      canCancel: changeable,
    };
  }

  private async rawBookings(patientId: string, fromUtc: string, toUtc: string): Promise<RawBooking[]> {
    // Patient-scoped read: `patient(id){ bookingsWithPagination }` — never the practice-wide `bookings(dateRange)`
    // (no patientId filter there). Semble matches on booking START; pad 6h back. Dedupe: ~13% duplicate rows.
    const from = new Date(new Date(fromUtc).getTime() - 6 * 3_600_000).toISOString();
    const seen = new Map<string, RawBooking>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const d = await this.gql<{ patient: null | { bookingsWithPagination: { data: RawBooking[]; meta?: { hasMore?: boolean | null } | null } } }>(
        `query PatientBookings($id: ID!, $from: Date!, $to: Date!, $page: Int) { patient(id: $id) { bookingsWithPagination(start: $from, end: $to, queryOptions: { includeDeleted: true }, pagination: { page: $page, pageSize: 100 }) { data { ${BOOKING_FIELDS} } meta { hasMore } } } }`,
        { id: patientId, from: toPracticeLocalIso(from), to: toPracticeLocalIso(toUtc), page },
      );
      const rows = d.patient?.bookingsWithPagination;
      for (const b of rows?.data ?? []) if ((!b.patientId || b.patientId === patientId) && !seen.has(b.id)) seen.set(b.id, b);
      if (!rows?.meta?.hasMore) break;
    }
    return [...seen.values()];
  }

  async listAppointments(patientId: string, range: { fromUtc: string; toUtc: string }) {
    const [ref, rows] = await Promise.all([this.reference(), this.rawBookings(patientId, range.fromUtc, range.toUtc)]);
    return rows.map((b) => this.mapBooking(ref, b)).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }

  async getAppointment(patientId: string, appointmentId: string) {
    const [ref, d] = await Promise.all([
      this.reference(),
      this.gql<{ booking: null | (RawBooking & { patient?: { id: string } | null }) }>(`query Booking($id: ID!) { booking(id: $id) { ${BOOKING_FIELDS} patient { id } } }`, { id: appointmentId }),
    ]);
    const b = d.booking;
    if (!b || (b.patient?.id ?? b.patientId) !== patientId) return null;
    return this.mapBooking(ref, b);
  }

  /**
   * Free windows per clinician and room, as true-UTC intervals.
   * availabilitySlots (New Appointment System) already subtracts bookings and
   * unavailability; the legacy query is only used when Semble refuses
   * availabilitySlots for the practice, and then existing bookings are
   * subtracted here.
   */
  private async freeWindows(clinicianIds: string[], roomIds: string[], fromUtc: string, toUtc: string, excludeBookingId?: string): Promise<Window[]> {
    const chunks = chunkDays(fromUtc, toUtc, 7).map((w) => ({
      // Dublin calendar days covering the chunk; `end` is exclusive.
      startDay: toPracticeLocalIso(w.from).slice(0, 10),
      endDay: toPracticeLocalIso(w.to).slice(0, 10),
    }));

    if (!this.legacyAvailability) {
      try {
        const windows: Window[] = [];
        for (const { startDay, endDay } of chunks) {
          for (let page = 1; page <= MAX_PAGES; page++) {
            const d = await this.gql<{ availabilitySlots: { data: { startLocal: string; endLocal: string; user?: { id: string } | null; room?: { id: string } | null }[]; pageInfo?: { hasMore?: boolean | null } | null } }>(
              `query Slots($from: Date!, $to: Date!, $users: [String], $rooms: [String], $exclude: [ID], $page: Int) { availabilitySlots(dateRange: { start: $from, end: $to }, userIds: $users, roomIds: $rooms, excludeBookingIds: $exclude, pagination: { page: $page, pageSize: 200 }) { data { startLocal endLocal user { id } room { id } } pageInfo { hasMore } } }`,
              { from: startDay, to: endDay, users: clinicianIds, rooms: roomIds, exclude: excludeBookingId ? [excludeBookingId] : undefined, page },
            );
            for (const s of d.availabilitySlots.data) {
              // user and room filters are not intersected by Semble, so both are checked here
              if (!s.user?.id || !clinicianIds.includes(s.user.id) || !s.room?.id || !roomIds.includes(s.room.id)) continue;
              windows.push({ clinicianId: s.user.id, roomId: s.room.id, start: new Date(fromPracticeLocalNaive(s.startLocal)).getTime(), end: new Date(fromPracticeLocalNaive(s.endLocal)).getTime() });
            }
            if (!d.availabilitySlots.pageInfo?.hasMore) break;
          }
        }
        return windows;
      } catch (e) {
        // Only Semble refusing the query itself switches this practice to the legacy query; anything else is a real error.
        if (!(e instanceof SembleAdapterError) || e.code !== "upstream" || !NO_SLOTS_API.test(e.message)) throw e;
        this.legacyAvailability = true;
      }
    }

    const windows: Window[] = [];
    for (const { startDay, endDay } of chunks) {
      for (const roomId of roomIds) {
        for (const clinicianId of clinicianIds) {
          // Whole Dublin days, so a chunk crossing a DST change never exceeds Semble's 7-day limit.
          const d = await this.gql<{ availabilities: { data: { start: string; end: string }[] } }>(
            `query Availabilities($from: Date!, $to: Date!, $location: ID!, $doctor: ID) { availabilities(dateRange:{start:$from,end:$to}, locationId:$location, doctorId:$doctor) { data { start end } } }`,
            { from: `${startDay}T00:00:00.000Z`, to: `${endDay}T00:00:00.000Z`, location: roomId, doctor: clinicianId },
          );
          for (const a of d.availabilities.data) windows.push({ clinicianId, roomId, start: new Date(fromPracticeLocalIso(a.start)).getTime(), end: new Date(fromPracticeLocalIso(a.end)).getTime() });
        }
      }
    }
    if (!windows.length) return windows;
    const busy = await this.busy(clinicianIds, fromUtc, toUtc, excludeBookingId);
    return windows.flatMap((w) => subtract(w, busy.get(w.clinicianId) ?? []));
  }

  /** Legacy path only: existing (non-deleted) bookings per clinician in the range, as true-UTC intervals. */
  private async busy(clinicianIds: string[], fromUtc: string, toUtc: string, excludeBookingId?: string): Promise<Map<string, { start: number; end: number }[]>> {
    const out = new Map<string, { start: number; end: number }[]>();
    for (const id of clinicianIds) {
      const list: { start: number; end: number }[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const d = await this.gql<{ user: null | { bookings: null | { data: { id: string; start: string; end: string; deleted?: boolean | null }[]; pageInfo?: { hasMore?: boolean | null } | null } } }>(
          `query Busy($id: ID!, $from: Date!, $to: Date!, $page: Int) { user(id: $id) { bookings(start: $from, end: $to, page: $page, pageSize: 200) { data { id start end deleted } pageInfo { hasMore } } } }`,
          { id, from: toPracticeLocalIso(new Date(new Date(fromUtc).getTime() - 6 * 3_600_000).toISOString()), to: toPracticeLocalIso(toUtc), page },
        );
        for (const b of d.user?.bookings?.data ?? []) if (!b.deleted && b.id !== excludeBookingId) list.push({ start: new Date(fromPracticeLocalIso(b.start)).getTime(), end: new Date(fromPracticeLocalIso(b.end)).getTime() });
        if (!d.user?.bookings?.pageInfo?.hasMore) break;
      }
      out.set(id, list);
    }
    return out;
  }

  async getAvailability(q: AvailabilityQuery): Promise<AvailabilitySlot[]> {
    const ref = await this.reference();
    const type = ref.types.find((t) => t.id === q.appointmentTypeId);
    if (!type) throw new SembleAdapterError("Unknown appointment type", "not-found");
    const roomIds = GraphqlSembleAdapter.roomsFor(ref, type.id);
    const clinicianIds = GraphqlSembleAdapter.cliniciansFor(ref, type, q.clinicianId);
    if (!roomIds.length || !clinicianIds.length) return [];
    const windows = await this.freeWindows(clinicianIds, roomIds, q.fromUtc, q.toUtc, q.excludeAppointmentId);
    const step = Math.max(type.durationMinutes, 10) * 60_000;
    const floor = Date.now() + LEAD_TIME_MS;
    const from = new Date(q.fromUtc).getTime();
    const to = new Date(q.toUtc).getTime();
    const seen = new Set<string>();
    const out: AvailabilitySlot[] = [];
    for (const w of windows) {
      // slice each free window into slots of the appointment length
      for (let s = w.start; s + step <= w.end; s += step) {
        if (s < floor || s < from || s > to) continue;
        const key = `${w.clinicianId}|${s}`; // the same clinician free in two rooms is still one slot
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ clinicianId: w.clinicianId, startUtc: new Date(s).toISOString(), endUtc: new Date(s + step).toISOString() });
      }
    }
    return out.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }

  /**
   * createBooking has no overlap guard, so re-read the diary immediately before writing:
   * the requested time must sit inside one of the clinician's free windows. Returns the room to book.
   */
  private async roomForSlot(ref: Reference, type: AppointmentType, clinicianId: string, startUtc: string, endUtc: string, excludeBookingId?: string): Promise<string> {
    const s = new Date(startUtc).getTime();
    const e = new Date(endUtc).getTime();
    if (!Number.isFinite(s) || e - s !== Math.max(type.durationMinutes, 10) * 60_000) throw new SembleAdapterError("That appointment time is not valid", "not-supported");
    if (s < Date.now() + LEAD_TIME_MS - LEAD_TIME_GRACE_MS) throw new SembleAdapterError("Online bookings need 12 hours' notice", "not-supported");
    const roomIds = GraphqlSembleAdapter.roomsFor(ref, type.id);
    if (!roomIds.length) throw new SembleAdapterError("This appointment type is not enabled at the clinic in Semble yet", "not-supported");
    if (!GraphqlSembleAdapter.cliniciansFor(ref, type, clinicianId).length) throw new SembleAdapterError("This clinician does not offer that appointment", "not-found");
    const day = 86_400_000;
    const windows = await this.freeWindows([clinicianId], roomIds, new Date(s - day).toISOString(), new Date(e + day).toISOString(), excludeBookingId);
    const fit = windows.find((w) => w.clinicianId === clinicianId && w.start <= s && e <= w.end);
    if (!fit) throw new SembleAdapterError("That time has just been taken", "slot-taken");
    return fit.roomId;
  }

  private static bookingError(error: string | null | undefined, fallback: string): SembleAdapterError {
    const msg = error || fallback;
    if (/taken|overlap|double/i.test(msg)) return new SembleAdapterError("That time has just been taken", "slot-taken", msg);
    if (/available at location/i.test(msg)) return new SembleAdapterError("This appointment type is not enabled at the clinic in Semble yet", "not-supported", msg);
    return new SembleAdapterError(msg, "upstream");
  }

  /** After an unknown outcome: did this patient end up with a live booking at that time with that clinician? */
  private async findBooking(patientId: string, clinicianId: string, startUtc: string): Promise<RawBooking | undefined> {
    const s = new Date(startUtc).getTime();
    const rows = await this.rawBookings(patientId, new Date(s - 86_400_000).toISOString(), new Date(s + 86_400_000).toISOString());
    return rows.find((b) => !b.deleted && b.doctor?.id === clinicianId && new Date(fromPracticeLocalIso(b.start)).getTime() === s);
  }

  /** Provenance on the Semble row (Semble has no createdBy), in one mutation; failures are logged, not fatal. */
  private async stamp(bookingId: string, pairs: [string, string][]) {
    const fields = pairs.map((_, i) => `s${i}: updateBookingMetadata(bookingId: $id, key: $k${i}, value: $v${i}) { data { id } error }`).join(" ");
    const args = pairs.map((_, i) => `$k${i}: String!, $v${i}: String!`).join(", ");
    const vars: Record<string, string> = { id: bookingId };
    pairs.forEach(([k, v], i) => Object.assign(vars, { [`k${i}`]: k, [`v${i}`]: v }));
    try {
      const d = await this.gql<Record<string, { data: { id: string } | null; error?: string | null }>>(`mutation Stamp($id: ID!, ${args}) { ${fields} }`, vars);
      const failed = pairs.filter((_, i) => !d[`s${i}`]?.data).map(([k]) => k);
      if (failed.length) console.error(`Semble booking ${bookingId}: metadata not saved: ${failed.join(", ")}`);
    } catch (e) {
      console.error(`Semble booking ${bookingId}: metadata not saved`, e instanceof Error ? e.message : e);
    }
  }

  async book(patientId: string, req: { appointmentTypeId: string; clinicianId: string; startUtc: string; endUtc: string; patientNotes?: string; programmeStepId?: string }) {
    const ref = await this.reference();
    const type = ref.types.find((t) => t.id === req.appointmentTypeId);
    if (!type) throw new SembleAdapterError("Unknown appointment type", "not-found");
    const roomId = await this.roomForSlot(ref, type, req.clinicianId, req.startUtc, req.endUtc);
    let booking: RawBooking;
    try {
      const d = await this.gql<{ createBooking: { data: RawBooking | null; error?: string | null } }>(
        `mutation CreateBooking($b: BookingDataInput!) { createBooking(bookingData: $b) { data { ${BOOKING_FIELDS} } error } }`,
        {
          b: {
            patient: patientId,
            location: roomId,
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
      booking = d.createBooking.data;
    } catch (e) {
      if (!(e instanceof SembleAdapterError) || e.code !== "unknown-outcome") throw e;
      // Look before telling the patient anything: the booking may well exist.
      const found = await this.findBooking(patientId, req.clinicianId, req.startUtc).catch(() => undefined);
      if (!found) throw e;
      booking = found;
    }
    // Links the booking to its programme step; programme.ts also matches unstamped bookings by type and date.
    await this.stamp(booking.id, [["source", "portal"], ["portalPatientId", patientId], ...(req.programmeStepId ? [["programmeStep", req.programmeStepId] as [string, string]] : [])]);
    const a = this.mapBooking(ref, booking);
    return { ...a, programmeStepId: req.programmeStepId ?? a.programmeStepId };
  }

  async reschedule(patientId: string, req: { appointmentId: string; clinicianId: string; startUtc: string; endUtc: string }) {
    const own = await this.getAppointment(patientId, req.appointmentId);
    if (!own) throw new SembleAdapterError("Appointment not found", "not-found");
    if (!own.canReschedule) throw new SembleAdapterError("This appointment can no longer be moved online", "not-supported");
    const ref = await this.reference();
    const type = ref.types.find((t) => t.id === own.type.id);
    if (!type) throw new SembleAdapterError("This appointment can no longer be moved online", "not-supported");
    const roomId = await this.roomForSlot(ref, type, req.clinicianId, req.startUtc, req.endUtc, own.id);
    try {
      const d = await this.gql<{ updateBooking: { data: RawBooking | null; error?: string | null } }>(
        `mutation UpdateBooking($id: ID!, $b: BookingUpdateDataInput!) { updateBooking(id: $id, bookingData: $b) { data { ${BOOKING_FIELDS} } error } }`,
        // enforceDoubleBooking is Semble's only server-side overlap guard and exists only on update.
        { id: req.appointmentId, b: { location: roomId, doctor: req.clinicianId, start: toPracticeLocalIso(req.startUtc), end: toPracticeLocalIso(req.endUtc), enforceDoubleBooking: true, sendPatientMessages: { confirmation: true, reminder: true, followup: true } } },
      );
      if (!d.updateBooking.data) throw GraphqlSembleAdapter.bookingError(d.updateBooking.error, "Reschedule failed");
      return this.mapBooking(ref, d.updateBooking.data);
    } catch (e) {
      if (!(e instanceof SembleAdapterError) || e.code !== "unknown-outcome") throw e;
      const now = await this.getAppointment(patientId, req.appointmentId).catch(() => null);
      if (now && now.startUtc === new Date(req.startUtc).toISOString() && now.clinician.id === req.clinicianId) return now;
      throw e;
    }
  }

  async cancel(patientId: string, appointmentId: string) {
    const own = await this.getAppointment(patientId, appointmentId);
    if (!own) throw new SembleAdapterError("Appointment not found", "not-found");
    if (!own.canCancel) throw new SembleAdapterError("This appointment can no longer be cancelled online", "not-supported");
    try {
      const d = await this.gql<{ deleteBooking: { data: { id: string } | null; error?: string | null } }>(
        `mutation DeleteBooking($id: ID!) { deleteBooking(id: $id, sendCancellationMessages: true, notifyPractice: true) { data { id } error } }`,
        { id: appointmentId },
      );
      if (!d.deleteBooking.data) throw new SembleAdapterError(d.deleteBooking.error || "Cancellation failed", "upstream");
    } catch (e) {
      if (!(e instanceof SembleAdapterError) || e.code !== "unknown-outcome") throw e;
      const now = await this.getAppointment(patientId, appointmentId).catch(() => null);
      if (now?.status === "cancelled") return;
      throw e;
    }
  }

  /* ------------------------------------------------------------------ clinical artefacts */

  async listPrescriptions(patientId: string): Promise<Prescription[]> {
    const ref = await this.reference();
    // Patient sub-field, not the practice-wide sweep (39% duplicate rows there). No updatedAt on prescriptions → no polling.
    const seen = new Map<string, Prescription>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const d = await this.gql<{ patient: null | { prescriptions: null | { data: { id: string; date?: string | null; status?: string | null; doctor?: { id: string } | null; patient?: { id: string } | null; drugs?: { drug?: string | null; dosage?: string | null; quantity?: string | null; comments?: string | null }[] | null; orders?: { status?: string | null; provider?: string | null }[] | null }[]; pageInfo?: { hasMore?: boolean | null } | null } } }>(
        `query PatientPrescriptions($id: ID!, $page: Int) { patient(id: $id) { prescriptions(page: $page, pageSize: 50) { data { id date status doctor { id } patient { id } drugs { drug dosage quantity comments } orders { status provider } } pageInfo { hasMore } } } }`,
        { id: patientId, page },
      );
      const rows = d.patient?.prescriptions;
      for (const r of rows?.data ?? []) {
        if (r.patient?.id !== patientId || seen.has(r.id) || !r.date) continue;
        // "sent" means sent to a pharmacy (a Semble pharmacy order), not shared with the patient.
        const order = r.orders?.find((o) => o.status === "SENT");
        seen.set(r.id, {
          id: r.id,
          issuedAtUtc: trueUtc(r.date), // a system timestamp (it carries milliseconds), not a wall-clock booking time
          prescriber: ref.clinicians.find((c) => c.id === r.doctor?.id) ?? { id: r.doctor?.id ?? "", firstName: "", lastName: "", fullName: "Your doctor", role: "doctor" },
          drugs: (r.drugs ?? []).map((x) => ({ name: x.drug ?? "Medication", dosage: x.dosage ?? undefined, quantity: x.quantity ?? undefined, comments: x.comments ?? undefined })),
          status: /cancel|void/i.test(r.status ?? "") ? "cancelled" : order ? "sent" : "issued",
          fulfilment: order ? { method: "pharmacy", pharmacyName: order.provider ?? undefined } : undefined,
          // The list never mints the 15-minute PDF URL; getPrescriptionPdfUrl does, on click.
          pdfAvailable: true,
        });
      }
      if (!rows?.pageInfo?.hasMore) break;
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

  /** Everything staff shared with the patient (all pages). */
  private async shared(patientId: string) {
    const out: { documentId: string | null; title: string; type: string; sharedAt: string }[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const d = await this.gql<{ patient: null | { documentsSharedWithPatient: { data: { documentId: string | null; title: string; type: string; sharedAt: string }[]; pageInfo?: { hasMore?: boolean | null } | null } } }>(
        `query Shared($id: ID!, $page: Int) { patient(id: $id) { documentsSharedWithPatient(page: $page, pageSize: 100) { data { documentId title type sharedAt } pageInfo { hasMore } } } }`,
        { id: patientId, page },
      );
      const rows = d.patient?.documentsSharedWithPatient;
      out.push(...(rows?.data ?? []));
      if (!rows?.pageInfo?.hasMore) break;
    }
    return out;
  }

  async listDocuments(patientId: string): Promise<PatientDocument[]> {
    // Visibility allow-list = what staff clicked "Share" on. Sharing cannot be set via API, so the portal
    // shows only `documentsSharedWithPatient` (letters, labs, documents) — a clinical-governance choice.
    const kindOf = (t: string, title: string): PatientDocument["kind"] =>
      t === "lab" ? "lab" : /insurance/i.test(title) ? "insurance" : /plan/i.test(title) ? "plan" : /consent/i.test(title) ? "consent" : t === "letter" ? "letter" : "other";
    const seen = new Map<string, PatientDocument>();
    for (const s of await this.shared(patientId)) {
      if (!s.documentId || seen.has(s.documentId) || !["document", "letter", "lab"].includes(s.type)) continue; // invoices/prescriptions have their own screens
      seen.set(s.documentId, { id: s.documentId, kind: kindOf(s.type, s.title), title: s.title, createdAtUtc: trueUtc(s.sharedAt), downloadable: s.type === "document" || s.type === "letter" });
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
    const d = await this.gql<{ patient: null | { invoices: null | { id: string; type?: string | null; invoiceNumber?: number | null; date: string; total?: number | null; outstanding?: number | null; refunded?: number | null; paidOrOutstanding?: string | null; status?: string | null; patientId?: string | null }[] } }>(
      `query PatientInvoices($id: ID!, $from: Date!, $to: Date!) { patient(id: $id) { invoices(start: $from, end: $to) { id type invoiceNumber date total outstanding refunded paidOrOutstanding status patientId } } }`,
      { id: patientId, from: new Date(Date.now() - 400 * 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() },
    );
    const seen = new Map<string, Invoice>();
    for (const i of d.patient?.invoices ?? []) {
      if ((i.patientId && i.patientId !== patientId) || seen.has(i.id)) continue;
      if (i.type && i.type !== "invoice") continue; // credit notes and payments on account are not invoices
      const total = i.total ?? 0;
      const status: Invoice["status"] = /void|cancel/i.test(i.status ?? "") ? "void" : (i.refunded ?? 0) > 0 && (i.refunded ?? 0) >= total ? "refunded" : /^paid$/i.test(i.paidOrOutstanding ?? "") || (i.outstanding ?? 1) === 0 ? "paid" : "unpaid";
      seen.set(i.id, {
        id: i.id,
        number: i.invoiceNumber != null ? String(i.invoiceNumber) : i.id,
        issuedAtUtc: fromPracticeLocalIso(i.date), // a calendar date (Dublin midnight)
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

/** A free window minus overlapping busy intervals. */
function subtract(w: Window, busy: { start: number; end: number }[]): Window[] {
  let parts: Window[] = [w];
  for (const b of busy) {
    parts = parts.flatMap((p) => (b.end <= p.start || b.start >= p.end ? [p] : [...(b.start > p.start ? [{ ...p, end: b.start }] : []), ...(b.end < p.end ? [{ ...p, start: b.end }] : [])]));
  }
  return parts;
}
