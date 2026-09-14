/**
 * Portal-owned domain — everything Semble does NOT model:
 * plans & entitlements (Stripe), the 90-day programme structure, member
 * state, weight/medication logging, onboarding progress.
 *
 * Source of truth for the programme structure: the client's Patient Journey
 * Map v4.2.1 (docs/research/00_client_patient_journey_map_v4_2_1.txt).
 */
import type { ClinicianRole } from "../semble/types";

/** What the patient has bought. Mirrors Stripe products/prices. */
export type PlanId =
  | "consult-89" // €89 specialist consultation (one-off)
  | "ninety-day-upfront" // €399 upfront
  | "ninety-day-instalments" // €150 × 3
  | "ongoing-75" // Ongoing Care €75/mo
  | "ongoing-150" // Ongoing Care €150/mo (full MDT continues)
  | "legacy-150"; // pre-2026 monthly membership

export interface Plan {
  id: PlanId;
  name: string;
  priceLabel: string;
  blurb: string;
  includes: string[];
}

/**
 * Member state drives what the dashboard shows. Derived server-side from
 * Stripe + programme dates, never trusted from the client.
 */
/**
 * The nine stage names are the ones the production backend already derives
 * (`GET /api/v1/user/tier-journey/status`) and that HubSpot + staff speak.
 * Keep them verbatim so the portal is a drop-in consumer.
 */
export type MemberState =
  | "none" // no purchase
  | "consult_paid" // paid €89, questionnaire/booking still to do
  | "consult_booked" // €89 consultation in the diary
  | "consult_done" // consultation complete, 90-day offer open (Day 1–21)
  | "ninety_day_active"
  | "ninety_day_overdue" // instalment failed → programme paused
  | "ninety_day_completed" // Day 90 passed, Ongoing Care chooser
  | "legacy_member" // any active non-tier plan: €150 membership, €75/€150 Ongoing Care
  | "legacy_lapsed"; // membership on hold / paused / cancelled

export const STATE_LABEL: Record<MemberState, string> = {
  none: "No active plan",
  consult_paid: "Consultation paid",
  consult_booked: "Consultation booked",
  consult_done: "Consultation complete",
  ninety_day_active: "90-Day Programme",
  ninety_day_overdue: "Programme paused",
  ninety_day_completed: "Programme complete",
  legacy_member: "Member",
  legacy_lapsed: "Membership inactive",
};

export type ProgrammePhase = "consult" | "ninety-day" | "ongoing";

export interface ProgrammeStep {
  id: string; // "doctor-m1"
  phase: ProgrammePhase;
  month: 1 | 2 | 3;
  role: ClinicianRole;
  title: string; // "Doctor — initial review"
  purpose: string; // patient-facing one-liner
  durationMinutes: number;
  format: "video" | "phone";
  /** window start/end in days from programme start (journey map: target ±7) */
  windowFromDay: number;
  windowToDay: number;
  /** Semble appointment type slug that satisfies this step */
  appointmentTypeSlug: string;
  /** steps that must be BOOKED first (client rule: book in order per role) */
  after?: string[];
  /** info-only rows (Day 5-7 nurse call, Day 80 retention call) are not bookable */
  bookable: boolean;
}

export type StepStatus =
  | "locked" // window not open yet or prerequisite unbooked
  | "book-now" // window open, nothing booked
  | "booked"
  | "completed"
  | "missed"
  | "info"; // non-bookable row

export interface ProgrammeStepView extends ProgrammeStep {
  status: StepStatus;
  windowFromUtc?: string;
  windowToUtc?: string;
  appointmentId?: string;
  appointmentStartUtc?: string;
  clinicianName?: string;
}

export interface Membership {
  state: MemberState;
  plan?: Plan;
  /** programme anchor = payment date (Day-20 policy: max(purchase, consult+20d)) */
  programmeStartUtc?: string;
  programmeEndUtc?: string; // start + 90d
  programmeDay?: number; // 1..90
  nextChargeUtc?: string;
  nextChargeAmount?: number;
  instalmentsPaid?: number; // 0..3
  paymentIssue?: { since: string; graceEndsUtc: string; message: string };
  entitlements: Entitlement[];
}

export type Entitlement =
  | "book-doctor"
  | "book-nurse"
  | "book-dietitian"
  | "book-health-coach"
  | "ad-hoc-sessions"
  | "prescriptions"
  | "community"
  | "content-library"
  | "insurance-docs"
  | "nurse-messaging";

export interface WeightEntry {
  id: string;
  dateUtc: string;
  kg: number;
  note?: string;
  source: "patient" | "clinician";
}

export interface MedicationPlan {
  drug: string; // "Mounjaro (tirzepatide)"
  form: "weekly-injection" | "daily-oral";
  currentDoseMg: number;
  titration: { fromDay: number; doseMg: number; label: string }[];
  /** ISO weekday 1-7 the patient injects (weekly-injection only) */
  doseWeekday?: number;
  /** last dose taken — drives the "next dose" card */
  lastDoseUtc?: string;
  /** injection site rotation history */
  sites?: { dateUtc: string; site: InjectionSite }[];
}

export type InjectionSite = "abdomen-left" | "abdomen-right" | "thigh-left" | "thigh-right" | "upper-arm-left" | "upper-arm-right";

export interface DoseLog {
  id: string;
  takenAtUtc: string;
  doseMg: number;
  site?: InjectionSite;
  sideEffects?: SideEffect[];
  note?: string;
}

export type SideEffect = "nausea" | "constipation" | "fatigue" | "headache" | "injection-site" | "dizziness" | "other";

export interface OnboardingTask {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  href?: string;
  /** who owns it if not the patient (e.g. nurse call) */
  owner?: "patient" | "nurse" | "care-coordinator" | "doctor";
  dueLabel?: string;
}

export interface Goal {
  startKg: number;
  targetKg?: number;
  targetPct?: number; // e.g. 15 (% of body weight)
  heightCm?: number;
}

export interface PortalPatient {
  /** portal user id (our auth) */
  userId: string;
  /** link to the clinical record */
  semblePatientId: string;
  email: string;
  firstName: string;
  lastName: string;
  membership: Membership;
  goal: Goal;
  weights: WeightEntry[];
  medication?: MedicationPlan;
  doses: DoseLog[];
  onboarding: OnboardingTask[];
  /** preferred clinicians for continuity (role → clinician id) */
  careTeam: Partial<Record<ClinicianRole, string>>;
}
