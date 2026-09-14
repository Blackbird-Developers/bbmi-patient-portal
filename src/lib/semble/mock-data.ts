/**
 * Synthetic demo dataset. Clinician and patient names are FICTIONAL —
 * nothing here maps to a real Beyond BMI staff member or patient. Swap the
 * clinician list for the real care team when presenting, if Art prefers.
 *
 * Dates are generated relative to "now" so the demo always looks live.
 */
import type {
  Appointment,
  AppointmentType,
  Clinician,
  Invoice,
  PatientDocument,
  PatientProfile,
  Prescription,
  QuestionnaireSummary,
} from "./types";

export const DAY = 86_400_000;
export const now = () => new Date();
export const daysFromNow = (d: number, hour = 10, minute = 0): string => {
  const t = new Date(now().getTime() + d * DAY);
  t.setUTCHours(hour, minute, 0, 0);
  return t.toISOString();
};

export const CLINICIANS: Clinician[] = [
  {
    id: "clin-doc-1",
    firstName: "Niamh",
    lastName: "Keogh",
    fullName: "Niamh Keogh",
    title: "Dr",
    role: "doctor",
    specialty: "Obesity medicine",
    registration: "IMC 412987",
    bio: "Consultant in obesity medicine. Leads titration and medical review across the programme.",
  },
  {
    id: "clin-doc-2",
    firstName: "Rory",
    lastName: "Hanlon",
    fullName: "Rory Hanlon",
    title: "Dr",
    role: "doctor",
    specialty: "Obesity medicine",
    registration: "IMC 398120",
  },
  {
    id: "clin-nurse-1",
    firstName: "Siobhán",
    lastName: "Doyle",
    fullName: "Siobhán Doyle",
    title: "RGN",
    role: "nurse",
    specialty: "Clinical nurse — medication & side effects",
    registration: "NMBI 77120",
  },
  {
    id: "clin-diet-1",
    firstName: "Emer",
    lastName: "Costello",
    fullName: "Emer Costello",
    title: "RD",
    role: "dietitian",
    specialty: "Registered dietitian",
    registration: "CORU DI021553",
  },
  {
    id: "clin-coach-1",
    firstName: "Tadhg",
    lastName: "Brennan",
    fullName: "Tadhg Brennan",
    role: "health-coach",
    specialty: "Health & behaviour coach",
  },
];

export const clinicianById = (id: string): Clinician => {
  const c = CLINICIANS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown clinician ${id}`);
  return c;
};

export const APPOINTMENT_TYPES: AppointmentType[] = [
  { id: "at-consult-89", slug: "specialist-consultation", name: "Specialist consultation", role: "doctor", durationMinutes: 30, price: 89, requiresPayment: true },
  { id: "at-doc-review", slug: "doctor-review", name: "Doctor review", role: "doctor", durationMinutes: 10, price: 0, requiresPayment: false },
  { id: "at-doc-quarterly", slug: "doctor-quarterly", name: "Quarterly medical review", role: "doctor", durationMinutes: 10, price: 0, requiresPayment: false },
  { id: "at-nurse-call", slug: "nurse-call", name: "Nurse follow-up call", role: "nurse", durationMinutes: 10, price: 0, requiresPayment: false },
  { id: "at-nurse-checkin", slug: "nurse-checkin", name: "Nurse check-in", role: "nurse", durationMinutes: 10, price: 0, requiresPayment: false },
  { id: "at-diet-initial", slug: "dietitian-initial", name: "Dietitian assessment", role: "dietitian", durationMinutes: 45, price: 0, requiresPayment: false },
  { id: "at-diet-followup", slug: "dietitian-followup", name: "Dietitian follow-up", role: "dietitian", durationMinutes: 45, price: 0, requiresPayment: false },
  { id: "at-coach", slug: "health-coach-session", name: "Health coach session", role: "health-coach", durationMinutes: 30, price: 0, requiresPayment: false },
  // Ongoing Care add-ons (journey map: Doctor €80 · Coach €50 · Dietitian €60 · Nurse €40)
  { id: "at-adhoc-doc", slug: "adhoc-doctor", name: "Doctor — extra session", role: "doctor", durationMinutes: 20, price: 80, requiresPayment: true },
  { id: "at-adhoc-coach", slug: "adhoc-coach", name: "Health coach — extra session", role: "health-coach", durationMinutes: 25, price: 50, requiresPayment: true },
  { id: "at-adhoc-diet", slug: "adhoc-dietitian", name: "Dietitian — extra session", role: "dietitian", durationMinutes: 25, price: 60, requiresPayment: true },
  { id: "at-adhoc-nurse", slug: "adhoc-nurse", name: "Nurse — extra session", role: "nurse", durationMinutes: 25, price: 40, requiresPayment: true },
];

export const typeBySlug = (slug: string): AppointmentType => {
  const t = APPOINTMENT_TYPES.find((x) => x.slug === slug);
  if (!t) throw new Error(`unknown appointment type ${slug}`);
  return t;
};

/* ------------------------------------------------------------------ */
/* Patients                                                            */
/* ------------------------------------------------------------------ */

export const PATIENTS: PatientProfile[] = [
  {
    id: "66e1a0c2f1b2a3d4e5f60001",
    reference: "BB-2K9F7Q",
    firstName: "Aoife",
    lastName: "Byrne",
    email: "aoife.demo@example.ie",
    phone: "+353 87 000 0001",
    dob: "1986-04-12",
    gender: "female",
    address: { line1: "14 Sandymount Green", city: "Dublin 4", county: "Dublin", postcode: "D04 X0F1", country: "Ireland" },
    communicationPreferences: { receiveEmail: true, receiveSMS: true, promotionalMarketing: false },
    labels: ["€89 Consultation"],
  },
  {
    id: "66e1a0c2f1b2a3d4e5f60002",
    reference: "BB-7H3M2P",
    firstName: "Ciarán",
    lastName: "Walsh",
    email: "ciaran.demo@example.ie",
    phone: "+353 86 000 0002",
    dob: "1979-11-03",
    gender: "male",
    address: { line1: "3 Ashgrove", city: "Douglas", county: "Cork", postcode: "T12 Y2K8", country: "Ireland" },
    communicationPreferences: { receiveEmail: true, receiveSMS: true, promotionalMarketing: true },
    labels: ["90-Day Programme"],
  },
  {
    id: "66e1a0c2f1b2a3d4e5f60003",
    reference: "BB-4R8T1L",
    firstName: "Margaret",
    lastName: "O'Sullivan",
    email: "margaret.demo@example.ie",
    phone: "+353 85 000 0003",
    dob: "1968-07-22",
    gender: "female",
    address: { line1: "Lisheen House", city: "Ennis", county: "Clare", postcode: "V95 F2R1", country: "Ireland" },
    communicationPreferences: { receiveEmail: true, receiveSMS: false, promotionalMarketing: false },
    labels: ["Ongoing Care"],
  },
  {
    id: "66e1a0c2f1b2a3d4e5f60004",
    reference: "BB-9Q1Z6D",
    firstName: "Dara",
    lastName: "Kelly",
    email: "dara.demo@example.ie",
    phone: "+353 83 000 0004",
    dob: "1991-01-30",
    gender: "male",
    address: { line1: "22 Castle Street", city: "Galway", county: "Galway", postcode: "H91 A1B2", country: "Ireland" },
    communicationPreferences: { receiveEmail: true, receiveSMS: true, promotionalMarketing: false },
    labels: ["90-Day Programme", "Payment issue"],
  },
  {
    id: "66e1a0c2f1b2a3d4e5f60005",
    reference: "BB-3W7C4N",
    firstName: "Seán",
    lastName: "Murphy",
    email: "sean.demo@example.ie",
    phone: "+353 87 000 0005",
    dob: "1983-09-14",
    gender: "male",
    address: { line1: "8 Riverside Walk", city: "Kilkenny", county: "Kilkenny", postcode: "R95 T2X9", country: "Ireland" },
    communicationPreferences: { receiveEmail: true, receiveSMS: true, promotionalMarketing: true },
    labels: ["€89 Consultation", "New HubSpot Import"],
  },
  {
    id: "66e1a0c2f1b2a3d4e5f60006",
    reference: "BB-5J2K8V",
    firstName: "Fiona",
    lastName: "Nolan",
    email: "fiona.demo@example.ie",
    phone: "+353 86 000 0006",
    dob: "1975-02-27",
    gender: "female",
    address: { line1: "Ard na Gréine", city: "Tralee", county: "Kerry", postcode: "V92 P8H3", country: "Ireland" },
    communicationPreferences: { receiveEmail: true, receiveSMS: true, promotionalMarketing: false },
    labels: ["90-Day Programme — completed"],
  },
];

/* ------------------------------------------------------------------ */
/* Appointments per patient                                            */
/* ------------------------------------------------------------------ */

const appt = (
  id: string,
  slug: string,
  clinicianId: string,
  startUtc: string,
  status: Appointment["status"],
  extra: Partial<Appointment> = {},
): Appointment => {
  const type = typeBySlug(slug);
  const start = new Date(startUtc);
  const end = new Date(start.getTime() + type.durationMinutes * 60_000);
  const future = start.getTime() > now().getTime() + 24 * 3_600_000;
  return {
    id,
    type,
    clinician: clinicianById(clinicianId),
    startUtc,
    endUtc: end.toISOString(),
    status,
    videoUrl: status === "confirmed" && type.name !== "Nurse follow-up call" ? `https://video.semble.io/room/${id}` : undefined,
    canReschedule: status === "confirmed" && future,
    canCancel: status === "confirmed" && future,
    ...extra,
  };
};

export const APPOINTMENTS: Record<string, Appointment[]> = {
  // Aoife — €89 consult 12 days ago; nurse call day 6 done; Day 21 call ahead
  "66e1a0c2f1b2a3d4e5f60001": [
    appt("bk-a-1", "specialist-consultation", "clin-doc-1", daysFromNow(-12, 9, 30), "completed"),
    appt("bk-a-2", "nurse-call", "clin-nurse-1", daysFromNow(-6, 14, 0), "completed", { programmeStepId: "nurse-day5" }),
  ],
  // Ciarán — 90-day active, day 38
  "66e1a0c2f1b2a3d4e5f60002": [
    appt("bk-c-0", "specialist-consultation", "clin-doc-1", daysFromNow(-58, 11, 0), "completed"),
    appt("bk-c-1", "doctor-review", "clin-doc-1", daysFromNow(-36, 9, 0), "completed", { programmeStepId: "doctor-m1" }),
    appt("bk-c-2", "dietitian-initial", "clin-diet-1", daysFromNow(-33, 13, 0), "completed", { programmeStepId: "dietitian-m1" }),
    appt("bk-c-3", "health-coach-session", "clin-coach-1", daysFromNow(-31, 17, 30), "completed", { programmeStepId: "coach-s1" }),
    appt("bk-c-4", "nurse-call", "clin-nurse-1", daysFromNow(-32, 15, 0), "completed", { programmeStepId: "nurse-day5" }),
    appt("bk-c-5", "nurse-checkin", "clin-nurse-1", daysFromNow(3, 10, 30), "confirmed", { programmeStepId: "nurse-m2" }),
  ],
  // Margaret — Ongoing Care (€75), quarterly doctor booked
  "66e1a0c2f1b2a3d4e5f60003": [
    appt("bk-m-0", "specialist-consultation", "clin-doc-2", daysFromNow(-160, 10, 0), "completed"),
    appt("bk-m-1", "doctor-review", "clin-doc-2", daysFromNow(-140, 10, 0), "completed"),
    appt("bk-m-2", "doctor-review", "clin-doc-2", daysFromNow(-70, 10, 0), "completed"),
    appt("bk-m-3", "nurse-checkin", "clin-nurse-1", daysFromNow(-28, 11, 0), "completed"),
    appt("bk-m-4", "doctor-quarterly", "clin-doc-2", daysFromNow(9, 9, 20), "confirmed"),
    appt("bk-m-5", "nurse-checkin", "clin-nurse-1", daysFromNow(2, 16, 0), "confirmed"),
  ],
  // Dara — 90-day, instalment failed, paused
  "66e1a0c2f1b2a3d4e5f60004": [
    appt("bk-d-0", "specialist-consultation", "clin-doc-1", daysFromNow(-70, 9, 0), "completed"),
    appt("bk-d-1", "doctor-review", "clin-doc-1", daysFromNow(-44, 9, 0), "completed", { programmeStepId: "doctor-m1" }),
    appt("bk-d-2", "dietitian-initial", "clin-diet-1", daysFromNow(-41, 12, 0), "completed", { programmeStepId: "dietitian-m1" }),
    appt("bk-d-3", "health-coach-session", "clin-coach-1", daysFromNow(-40, 18, 0), "completed", { programmeStepId: "coach-s1" }),
    appt("bk-d-4", "nurse-checkin", "clin-nurse-1", daysFromNow(-12, 10, 0), "no-show", { programmeStepId: "nurse-m2" }),
  ],
  // Seán — paid €89 an hour ago, nothing booked yet
  "66e1a0c2f1b2a3d4e5f60005": [],
  // Fiona — 90-day completed (day 92), Day 80 call done, choosing what's next
  "66e1a0c2f1b2a3d4e5f60006": [
    appt("bk-f-0", "specialist-consultation", "clin-doc-2", daysFromNow(-115, 9, 30), "completed"),
    appt("bk-f-1", "doctor-review", "clin-doc-2", daysFromNow(-90, 9, 0), "completed", { programmeStepId: "doctor-m1" }),
    appt("bk-f-2", "dietitian-initial", "clin-diet-1", daysFromNow(-88, 13, 0), "completed", { programmeStepId: "dietitian-m1" }),
    appt("bk-f-3", "health-coach-session", "clin-coach-1", daysFromNow(-86, 17, 0), "completed", { programmeStepId: "coach-s1" }),
    appt("bk-f-4", "nurse-checkin", "clin-nurse-1", daysFromNow(-60, 10, 30), "completed", { programmeStepId: "nurse-m2" }),
    appt("bk-f-5", "health-coach-session", "clin-coach-1", daysFromNow(-58, 17, 0), "completed", { programmeStepId: "coach-s2" }),
    appt("bk-f-6", "doctor-review", "clin-doc-2", daysFromNow(-30, 9, 0), "completed", { programmeStepId: "doctor-m3" }),
    appt("bk-f-7", "dietitian-followup", "clin-diet-1", daysFromNow(-28, 13, 0), "completed", { programmeStepId: "dietitian-m3" }),
    appt("bk-f-8", "health-coach-session", "clin-coach-1", daysFromNow(-26, 17, 0), "completed", { programmeStepId: "coach-s3" }),
    appt("bk-f-9", "nurse-call", "clin-nurse-1", daysFromNow(-12, 11, 0), "completed", { programmeStepId: "nurse-day80" }),
  ],
};

/* ------------------------------------------------------------------ */
/* Prescriptions, documents, invoices, forms, messages                 */
/* ------------------------------------------------------------------ */

export const PRESCRIPTIONS: Record<string, Prescription[]> = {
  "66e1a0c2f1b2a3d4e5f60001": [
    {
      id: "rx-a-1",
      issuedAtUtc: daysFromNow(-12, 10, 15),
      prescriber: clinicianById("clin-doc-1"),
      drugs: [{ name: "Mounjaro (tirzepatide) 2.5 mg", dosage: "Inject 2.5 mg under the skin once a week", quantity: "1 pen (4 doses)" }],
      status: "dispensed",
      pdfAvailable: true,
      fulfilment: { method: "home-delivery", pharmacyName: "Pure Pharmacy", dispatchedAtUtc: daysFromNow(-10, 12, 0), trackingNote: "Delivered by courier" },
      reviewDueUtc: daysFromNow(16),
    },
  ],
  "66e1a0c2f1b2a3d4e5f60002": [
    {
      id: "rx-c-1",
      issuedAtUtc: daysFromNow(-58, 11, 40),
      prescriber: clinicianById("clin-doc-1"),
      drugs: [{ name: "Mounjaro (tirzepatide) 2.5 mg", dosage: "Inject 2.5 mg once weekly", quantity: "1 pen (4 doses)" }],
      status: "dispensed",
      pdfAvailable: true,
      fulfilment: { method: "home-delivery", pharmacyName: "Pure Pharmacy", dispatchedAtUtc: daysFromNow(-56) },
    },
    {
      id: "rx-c-2",
      issuedAtUtc: daysFromNow(-36, 9, 20),
      prescriber: clinicianById("clin-doc-1"),
      drugs: [{ name: "Mounjaro (tirzepatide) 5 mg", dosage: "Inject 5 mg once weekly", quantity: "1 pen (4 doses)" }],
      status: "dispensed",
      pdfAvailable: true,
      fulfilment: { method: "home-delivery", pharmacyName: "Pure Pharmacy", dispatchedAtUtc: daysFromNow(-34) },
      reviewDueUtc: daysFromNow(-1),
    },
    {
      id: "rx-c-3",
      issuedAtUtc: daysFromNow(-2, 8, 5),
      prescriber: clinicianById("clin-doc-1"),
      drugs: [{ name: "Mounjaro (tirzepatide) 7.5 mg", dosage: "Inject 7.5 mg once weekly", quantity: "1 pen (4 doses)" }],
      status: "sent",
      pdfAvailable: true,
      fulfilment: { method: "home-delivery", pharmacyName: "Pure Pharmacy" },
      reviewDueUtc: daysFromNow(26),
    },
  ],
  "66e1a0c2f1b2a3d4e5f60003": [
    {
      id: "rx-m-1",
      issuedAtUtc: daysFromNow(-70, 10, 30),
      prescriber: clinicianById("clin-doc-2"),
      drugs: [{ name: "Mounjaro (tirzepatide) 10 mg", dosage: "Inject 10 mg once weekly", quantity: "3 pens (12 doses)" }],
      status: "dispensed",
      pdfAvailable: true,
      fulfilment: { method: "home-delivery", pharmacyName: "Pure Pharmacy", dispatchedAtUtc: daysFromNow(-68) },
      reviewDueUtc: daysFromNow(9),
    },
  ],
  "66e1a0c2f1b2a3d4e5f60004": [
    {
      id: "rx-d-1",
      issuedAtUtc: daysFromNow(-44, 9, 20),
      prescriber: clinicianById("clin-doc-1"),
      drugs: [{ name: "Mounjaro (tirzepatide) 5 mg", dosage: "Inject 5 mg once weekly", quantity: "1 pen (4 doses)" }],
      status: "dispensed",
      pdfAvailable: true,
      fulfilment: { method: "pharmacy", pharmacyName: "Whelan's Pharmacy, Galway" },
      reviewDueUtc: daysFromNow(-9),
    },
  ],
  "66e1a0c2f1b2a3d4e5f60005": [],
  "66e1a0c2f1b2a3d4e5f60006": [
    {
      id: "rx-f-1",
      issuedAtUtc: daysFromNow(-30, 9, 40),
      prescriber: clinicianById("clin-doc-2"),
      drugs: [{ name: "Mounjaro (tirzepatide) 10 mg", dosage: "Inject 10 mg once weekly", quantity: "1 pen (4 doses)" }],
      status: "dispensed",
      pdfAvailable: true,
      fulfilment: { method: "home-delivery", pharmacyName: "Pure Pharmacy", dispatchedAtUtc: daysFromNow(-28) },
      reviewDueUtc: daysFromNow(-2),
    },
  ],
};

export const DOCUMENTS: Record<string, PatientDocument[]> = {
  "66e1a0c2f1b2a3d4e5f60001": [
    { id: "doc-a-1", kind: "letter", title: "Consultation summary — treatment plan", createdAtUtc: daysFromNow(-12, 11, 0), author: clinicianById("clin-doc-1"), downloadable: true, summary: "Your plan, starting dose and what to expect in the first weeks." },
    { id: "doc-a-2", kind: "insurance", title: "Insurance receipt — specialist consultation", createdAtUtc: daysFromNow(-11), downloadable: true, summary: "For private health-insurance reclaim." },
    { id: "doc-a-3", kind: "consent", title: "Telemedicine consent", createdAtUtc: daysFromNow(-13), downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60002": [
    { id: "doc-c-1", kind: "letter", title: "Consultation summary — treatment plan", createdAtUtc: daysFromNow(-58), author: clinicianById("clin-doc-1"), downloadable: true },
    { id: "doc-c-2", kind: "plan", title: "Personalised nutrition plan", createdAtUtc: daysFromNow(-31), author: clinicianById("clin-diet-1"), downloadable: true, summary: "Your plan from Emer — protein targets, meal structure and the swaps we agreed." },
    { id: "doc-c-3", kind: "insurance", title: "Insurance documentation — 90-Day Programme", createdAtUtc: daysFromNow(-30), downloadable: true, summary: "Issued once in Month 1 for private health-insurance reclaim." },
    { id: "doc-c-4", kind: "letter", title: "Month 1 doctor review", createdAtUtc: daysFromNow(-36), author: clinicianById("clin-doc-1"), downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60003": [
    { id: "doc-m-1", kind: "letter", title: "90-Day Programme completion summary", createdAtUtc: daysFromNow(-70), author: clinicianById("clin-doc-2"), downloadable: true },
    { id: "doc-m-2", kind: "plan", title: "Personalised nutrition plan (updated)", createdAtUtc: daysFromNow(-95), author: clinicianById("clin-diet-1"), downloadable: true },
    { id: "doc-m-3", kind: "insurance", title: "Insurance documentation — 90-Day Programme", createdAtUtc: daysFromNow(-150), downloadable: true },
    { id: "doc-m-4", kind: "lab", title: "Blood results — HbA1c, lipids", createdAtUtc: daysFromNow(-72), downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60004": [
    { id: "doc-d-1", kind: "letter", title: "Consultation summary — treatment plan", createdAtUtc: daysFromNow(-70), author: clinicianById("clin-doc-1"), downloadable: true },
    { id: "doc-d-2", kind: "insurance", title: "Insurance documentation — 90-Day Programme", createdAtUtc: daysFromNow(-45), downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60005": [
    { id: "doc-s-1", kind: "consent", title: "Telemedicine consent & terms", createdAtUtc: daysFromNow(0, 9, 5), downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60006": [
    { id: "doc-f-1", kind: "letter", title: "90-Day Programme — completion summary", createdAtUtc: daysFromNow(-12), author: clinicianById("clin-doc-2"), downloadable: true, summary: "Your results, current dose and Dr Hanlon's recommendation for continued care." },
    { id: "doc-f-2", kind: "plan", title: "Personalised nutrition plan (month 3 update)", createdAtUtc: daysFromNow(-27), author: clinicianById("clin-diet-1"), downloadable: true },
    { id: "doc-f-3", kind: "insurance", title: "Insurance documentation — 90-Day Programme", createdAtUtc: daysFromNow(-85), downloadable: true },
    { id: "doc-f-4", kind: "letter", title: "Consultation summary — treatment plan", createdAtUtc: daysFromNow(-115), author: clinicianById("clin-doc-2"), downloadable: true },
  ],
};

export const INVOICES: Record<string, Invoice[]> = {
  "66e1a0c2f1b2a3d4e5f60001": [
    { id: "inv-a-1", number: "BB-INV-10421", issuedAtUtc: daysFromNow(-14), description: "Specialist consultation", amount: 89, status: "paid", source: "stripe", downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60002": [
    { id: "inv-c-0", number: "BB-INV-10188", issuedAtUtc: daysFromNow(-60), description: "Specialist consultation", amount: 89, status: "paid", source: "stripe", downloadable: true },
    { id: "inv-c-1", number: "BB-INV-10201", issuedAtUtc: daysFromNow(-38), description: "90-Day Programme — instalment 1 of 3", amount: 150, status: "paid", source: "stripe", downloadable: true },
    { id: "inv-c-2", number: "BB-INV-10377", issuedAtUtc: daysFromNow(-8), description: "90-Day Programme — instalment 2 of 3", amount: 150, status: "paid", source: "stripe", downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60003": [
    { id: "inv-m-1", number: "BB-INV-09811", issuedAtUtc: daysFromNow(-162), description: "Specialist consultation", amount: 89, status: "paid", source: "stripe", downloadable: true },
    { id: "inv-m-2", number: "BB-INV-09870", issuedAtUtc: daysFromNow(-150), description: "90-Day Programme — paid upfront", amount: 399, status: "paid", source: "stripe", downloadable: true },
    { id: "inv-m-3", number: "BB-INV-10290", issuedAtUtc: daysFromNow(-51), description: "Ongoing Care — monthly", amount: 75, status: "paid", source: "stripe", downloadable: true },
    { id: "inv-m-4", number: "BB-INV-10402", issuedAtUtc: daysFromNow(-21), description: "Ongoing Care — monthly", amount: 75, status: "paid", source: "stripe", downloadable: true },
    { id: "inv-m-5", number: "BB-INV-10399", issuedAtUtc: daysFromNow(-24), description: "Dietitian — extra session", amount: 60, status: "paid", source: "semble", downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60004": [
    { id: "inv-d-0", number: "BB-INV-10102", issuedAtUtc: daysFromNow(-72), description: "Specialist consultation", amount: 89, status: "paid", source: "stripe", downloadable: true },
    { id: "inv-d-1", number: "BB-INV-10150", issuedAtUtc: daysFromNow(-46), description: "90-Day Programme — instalment 1 of 3", amount: 150, status: "paid", source: "stripe", downloadable: true },
    { id: "inv-d-2", number: "BB-INV-10361", issuedAtUtc: daysFromNow(-16), description: "90-Day Programme — instalment 2 of 3", amount: 150, status: "unpaid", source: "stripe", downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60005": [
    { id: "inv-s-1", number: "BB-INV-10488", issuedAtUtc: daysFromNow(0, 9, 2), description: "Specialist consultation", amount: 89, status: "paid", source: "stripe", downloadable: true },
  ],
  "66e1a0c2f1b2a3d4e5f60006": [
    { id: "inv-f-0", number: "BB-INV-09902", issuedAtUtc: daysFromNow(-117), description: "Specialist consultation", amount: 89, status: "paid", source: "stripe", downloadable: true },
    { id: "inv-f-1", number: "BB-INV-09955", issuedAtUtc: daysFromNow(-92), description: "90-Day Programme — paid upfront", amount: 399, status: "paid", source: "stripe", downloadable: true },
  ],
};

export const QUESTIONNAIRES: Record<string, QuestionnaireSummary[]> = {
  "66e1a0c2f1b2a3d4e5f60001": [
    { id: "q-a-1", slug: "pre-consult-screening", title: "Pre-consultation screening (5 questions)", status: "completed", completedAtUtc: daysFromNow(-13) },
    { id: "q-a-2", slug: "week-1-checkin", title: "How is your first week going?", status: "not-started" },
  ],
  "66e1a0c2f1b2a3d4e5f60002": [
    { id: "q-c-1", slug: "pre-consult-screening", title: "Pre-consultation screening", status: "completed", completedAtUtc: daysFromNow(-59) },
    { id: "q-c-2", slug: "ess-eq5d", title: "Sleep & quality-of-life questionnaire (ESS + EQ-5D)", status: "completed", completedAtUtc: daysFromNow(-37) },
    { id: "q-c-3", slug: "mid-programme-nps", title: "Mid-programme check-in (Day 45)", status: "not-started", dueForStepId: "nurse-m2" },
  ],
  "66e1a0c2f1b2a3d4e5f60003": [
    { id: "q-m-1", slug: "monthly-pulse", title: "Monthly pulse check", status: "not-started" },
  ],
  "66e1a0c2f1b2a3d4e5f60004": [
    { id: "q-d-1", slug: "ess-eq5d", title: "Sleep & quality-of-life questionnaire (ESS + EQ-5D)", status: "completed", completedAtUtc: daysFromNow(-45) },
  ],
  "66e1a0c2f1b2a3d4e5f60005": [
    { id: "q-s-1", slug: "intake", title: "Health questionnaire", status: "not-started" },
  ],
  "66e1a0c2f1b2a3d4e5f60006": [
    { id: "q-f-1", slug: "intake", title: "Health questionnaire", status: "completed", completedAtUtc: daysFromNow(-116) },
    { id: "q-f-2", slug: "programme-nps", title: "How was your 90-Day Programme?", status: "not-started" },
  ],
};
