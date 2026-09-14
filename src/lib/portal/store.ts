import "server-only";
import { daysFromNow } from "../semble/mock-data";
import type { Membership, OnboardingTask, Plan, PlanId, PortalPatient, WeightEntry } from "./types";

/**
 * Portal-owned data store (demo: in-memory; production: Postgres/RDS in
 * eu-west-1 with RLS, one row-family per patient, no clinical content).
 */

export const PLANS: Record<PlanId, Plan> = {
  "consult-89": {
    id: "consult-89",
    name: "Specialist consultation",
    priceLabel: "€89 once",
    blurb: "25-minute obesity-medicine consultation, treatment plan and a prescription if it is right for you.",
    includes: ["25-min video consultation", "Treatment plan & prescription if appropriate", "Nurse follow-up call (day 5–7)", "Clinical messaging for 30 days", "Insurance documentation"],
  },
  "ninety-day-upfront": {
    id: "ninety-day-upfront",
    name: "90-Day Programme",
    priceLabel: "€399 upfront",
    blurb: "Three months of structured multidisciplinary care. Save €51 by paying upfront.",
    includes: ["Doctor reviews — month 1 & 3", "Dietitian assessment + follow-up", "Health coach every month", "Nurse check-in — month 2", "Prescription management", "Community & content library", "Insurance documentation"],
  },
  "ninety-day-instalments": {
    id: "ninety-day-instalments",
    name: "90-Day Programme",
    priceLabel: "€150 × 3 months",
    blurb: "The same programme, in 3 monthly payments. €450 in total, ends automatically.",
    includes: ["Doctor reviews — month 1 & 3", "Dietitian assessment + follow-up", "Health coach every month", "Nurse check-in — month 2", "Prescription management", "Community & content library", "Insurance documentation"],
  },
  "ongoing-75": {
    id: "ongoing-75",
    name: "Ongoing Care",
    priceLabel: "€75 / month",
    blurb: "Long-term support after the programme. Quarterly doctor review, monthly nurse check-in, prescription management.",
    includes: ["Quarterly doctor review", "Monthly nurse check-in", "Prescription renewals", "Async dietitian & coach support", "Community access", "Extra sessions on demand"],
  },
  "ongoing-150": {
    id: "ongoing-150",
    name: "Ongoing Care — full MDT",
    priceLabel: "€150 / month",
    blurb: "Continue the full multidisciplinary structure every month.",
    includes: ["Everything in Ongoing Care", "Monthly health coach session", "Dietitian follow-ups", "Priority nurse support"],
  },
  "legacy-150": {
    id: "legacy-150",
    name: "Monthly membership",
    priceLabel: "€150 / month",
    blurb: "Your existing monthly membership.",
    includes: ["Doctor, dietitian and health-coach access", "Prescription management", "Community"],
  },
};

const FULL_90_DAY: Membership["entitlements"] = ["book-doctor", "book-nurse", "book-dietitian", "book-health-coach", "prescriptions", "community", "content-library", "insurance-docs"];

const weights = (startKg: number, days: number[], drift: number, jitter = 0.4): WeightEntry[] =>
  days.map((d, i) => ({
    id: `w-${startKg}-${d}`,
    dateUtc: daysFromNow(d, 7, 30),
    kg: Math.round((startKg - drift * i + Math.sin(i * 1.7) * jitter) * 10) / 10,
    source: "patient",
  }));

const task = (id: string, title: string, detail: string, done: boolean, extra: Partial<OnboardingTask> = {}): OnboardingTask => ({ id, title, detail, done, ...extra });

export const PORTAL_PATIENTS: PortalPatient[] = [
  // ---------------------------------------------------------------- Seán: consult_paid (paid an hour ago)
  {
    userId: "user-sean",
    semblePatientId: "66e1a0c2f1b2a3d4e5f60005",
    email: "sean.demo@example.ie",
    firstName: "Seán",
    lastName: "Murphy",
    membership: { state: "consult_paid", plan: PLANS["consult-89"], entitlements: ["insurance-docs"] },
    goal: { startKg: 112.3, targetPct: 10, heightCm: 180 },
    weights: [{ id: "w-sean-0", dateUtc: daysFromNow(0, 9, 0), kg: 112.3, source: "patient", note: "From sign-up" }],
    onboarding: [
      task("email", "Verify your email", "Done — you're signed in", true),
      task("questionnaire", "Health questionnaire", "About 8 minutes. Your doctor reads it before you meet.", false, { href: "/forms/intake", dueLabel: "Before you book" }),
      task("book", "Book your doctor consultation", "25 minutes by video with a SCOPE-certified obesity doctor", false, { href: "/book/specialist-consultation", dueLabel: "Unlocks after the questionnaire" }),
      task("address", "Confirm your home address", "Needed for your prescription if one is issued", true),
      task("id", "Verify your identity", "A quick photo ID check — required before any prescription", false, { href: "/account", dueLabel: "Before your consultation" })],
    careTeam: {},
  },
  // ---------------------------------------------------------------- Aoife: consult_done (day 12)
  {
    userId: "user-aoife",
    semblePatientId: "66e1a0c2f1b2a3d4e5f60001",
    email: "aoife.demo@example.ie",
    firstName: "Aoife",
    lastName: "Byrne",
    membership: {
      state: "consult_done",
      plan: PLANS["consult-89"],
      entitlements: ["prescriptions", "insurance-docs", "content-library"],
    },
    goal: { startKg: 96.4, targetPct: 15, heightCm: 167 },
    weights: weights(96.4, [-12, -5, -1], 0.5),
    onboarding: [
      task("consult", "Specialist consultation", "Completed with Dr Keogh", true),
      task("rx", "Medication delivered", "Pure Pharmacy — delivered by courier", true, { href: "/prescriptions" }),
      task("nurse", "Nurse follow-up call", "Completed with Siobhán on day 6", true),
      task("weight", "Log your first weight", "Your starting point for the chart", true, { href: "/progress" }),
      task("week1", "How is your first week going?", "2-minute check-in — helps your nurse spot side effects early", false, { href: "/forms/week-1-checkin", dueLabel: "Today" }),
      task("day21", "Care coordinator call", "Day 21 — your results so far and what a 90-day programme would look like", false, { owner: "care-coordinator", dueLabel: "In 9 days" })],
    careTeam: { doctor: "clin-doc-1", nurse: "clin-nurse-1" },
  },
  // ---------------------------------------------------------------- Ciarán: ninety_day_active (day 38)
  {
    userId: "user-ciaran",
    semblePatientId: "66e1a0c2f1b2a3d4e5f60002",
    email: "ciaran.demo@example.ie",
    firstName: "Ciarán",
    lastName: "Walsh",
    membership: {
      state: "ninety_day_active",
      plan: PLANS["ninety-day-instalments"],
      programmeStartUtc: daysFromNow(-37, 0, 0),
      programmeEndUtc: daysFromNow(53, 0, 0),
      programmeDay: 38,
      instalmentsPaid: 2,
      nextChargeUtc: daysFromNow(23, 9, 0),
      nextChargeAmount: 150,
      entitlements: FULL_90_DAY,
    },
    goal: { startKg: 118.2, targetKg: 100, heightCm: 181 },
    weights: weights(118.2, [-58, -51, -44, -37, -30, -23, -16, -9, -2], 0.9),
    onboarding: [
      task("m1", "Month 1 appointments", "Doctor, dietitian and health coach — all done", true),
      task("plan", "Read your nutrition plan", "From Emer, in Documents", true, { href: "/documents" }),
      task("nurse-m2", "Nurse check-in", "Booked with Siobhán", true, { href: "/appointments" }),
      task("coach-s2", "Book health coach — session 2", "Your window is open now", false, { href: "/programme", dueLabel: "Book now" }),
      task("nps", "Mid-programme check-in", "2 minutes — how is it going?", false, { href: "/forms/mid-programme-nps", dueLabel: "Day 45" })],
    careTeam: { doctor: "clin-doc-1", nurse: "clin-nurse-1", dietitian: "clin-diet-1", "health-coach": "clin-coach-1" },
  },
  // ---------------------------------------------------------------- Margaret: legacy_member on Ongoing Care €75
  {
    userId: "user-margaret",
    semblePatientId: "66e1a0c2f1b2a3d4e5f60003",
    email: "margaret.demo@example.ie",
    firstName: "Margaret",
    lastName: "O'Sullivan",
    membership: {
      state: "legacy_member",
      plan: PLANS["ongoing-75"],
      programmeStartUtc: daysFromNow(-150, 0, 0),
      programmeEndUtc: daysFromNow(-60, 0, 0),
      nextChargeUtc: daysFromNow(9, 9, 0),
      nextChargeAmount: 75,
      entitlements: ["book-doctor", "book-nurse", "ad-hoc-sessions", "prescriptions", "community", "content-library"],
    },
    goal: { startKg: 104.8, targetKg: 84, heightCm: 163 },
    weights: weights(104.8, [-150, -136, -122, -108, -94, -80, -66, -52, -38, -24, -10, -3], 1.55, 0.6),
    onboarding: [
      task("quarterly", "Quarterly doctor review", "Booked with Dr Hanlon", true, { href: "/appointments" }),
      task("pulse", "Monthly pulse check", "2 questions — how supported do you feel?", false, { href: "/forms/monthly-pulse", dueLabel: "This month" })],
    careTeam: { doctor: "clin-doc-2", nurse: "clin-nurse-1", dietitian: "clin-diet-1" },
  },
  // ---------------------------------------------------------------- Dara: ninety_day_overdue (instalment failed)
  {
    userId: "user-dara",
    semblePatientId: "66e1a0c2f1b2a3d4e5f60004",
    email: "dara.demo@example.ie",
    firstName: "Dara",
    lastName: "Kelly",
    membership: {
      state: "ninety_day_overdue",
      plan: PLANS["ninety-day-instalments"],
      programmeStartUtc: daysFromNow(-46, 0, 0),
      programmeEndUtc: daysFromNow(44, 0, 0),
      programmeDay: 47,
      instalmentsPaid: 1,
      nextChargeAmount: 150,
      paymentIssue: { since: daysFromNow(-16), graceEndsUtc: daysFromNow(-9), message: "Your instalment of €150 on the card ending 4242 was unsuccessful." },
      entitlements: ["prescriptions", "content-library"],
    },
    goal: { startKg: 109.5, targetPct: 12, heightCm: 178 },
    weights: weights(109.5, [-70, -56, -46, -39, -32, -25], 0.8),
    onboarding: [
      task("payment", "Pay your missed instalment", "Restores booking and keeps your prescription renewals on schedule", false, { href: "/account/billing", dueLabel: "Overdue" }),
      task("nurse", "Rebook your nurse check-in", "We missed you on the last one", false, { href: "/programme" })],
    careTeam: { doctor: "clin-doc-1", nurse: "clin-nurse-1" },
  },
  // ---------------------------------------------------------------- Fiona: ninety_day_completed (day 92)
  {
    userId: "user-fiona",
    semblePatientId: "66e1a0c2f1b2a3d4e5f60006",
    email: "fiona.demo@example.ie",
    firstName: "Fiona",
    lastName: "Nolan",
    membership: {
      state: "ninety_day_completed",
      plan: PLANS["ninety-day-upfront"],
      programmeStartUtc: daysFromNow(-92, 0, 0),
      programmeEndUtc: daysFromNow(-2, 0, 0),
      programmeDay: 93,
      entitlements: ["prescriptions", "community", "content-library"],
    },
    goal: { startKg: 101.6, targetKg: 86, heightCm: 165 },
    weights: weights(101.6, [-115, -101, -92, -85, -78, -71, -64, -57, -50, -43, -36, -29, -22, -15, -8, -1], 0.72, 0.5),
    onboarding: [
      task("day80", "Results call", "Completed with Siobhán — your summary is in Documents", true, { href: "/documents" }),
      task("choose", "Choose how you'd like to continue", "Ongoing Care €75/month or full MDT €150/month — or take a break", false, { href: "/plans", dueLabel: "Whenever you're ready" }),
      task("nps", "How was your 90-Day Programme?", "3 questions", false, { href: "/forms/programme-nps" })],
    careTeam: { doctor: "clin-doc-2", nurse: "clin-nurse-1", dietitian: "clin-diet-1", "health-coach": "clin-coach-1" },
  }];

declare global {
  var __portalStore: Map<string, PortalPatient> | undefined;
}

function store(): Map<string, PortalPatient> {
  if (!globalThis.__portalStore) globalThis.__portalStore = new Map(PORTAL_PATIENTS.map((p) => [p.userId, structuredClone(p)]));
  return globalThis.__portalStore;
}

export function getPortalPatient(userId: string): PortalPatient | null {
  return store().get(userId) ?? null;
}

export function findUserByEmail(email: string): PortalPatient | null {
  const e = email.trim().toLowerCase();
  return [...store().values()].find((p) => p.email.toLowerCase() === e) ?? null;
}

export function listDemoUsers() {
  return [...store().values()].map((p) => ({ userId: p.userId, name: `${p.firstName} ${p.lastName}`, email: p.email, state: p.membership.state, plan: p.membership.plan?.name }));
}

export function addWeight(userId: string, kg: number, note?: string): WeightEntry {
  const p = store().get(userId);
  if (!p) throw new Error("no patient");
  const w: WeightEntry = { id: `w-${Date.now()}`, dateUtc: new Date().toISOString(), kg, note, source: "patient" };
  p.weights.push(w);
  p.weights.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
  return w;
}

export function completeTask(userId: string, taskId: string) {
  const p = store().get(userId);
  const t = p?.onboarding.find((x) => x.id === taskId);
  if (t) t.done = true;
}

export function markQuestionnaireDone(userId: string) {
  completeTask(userId, "questionnaire");
  const p = store().get(userId);
  const book = p?.onboarding.find((x) => x.id === "book");
  if (book) book.dueLabel = "Ready to book";
}

export function markConsultBooked(userId: string) {
  const p = store().get(userId);
  if (!p) return;
  if (p.membership.state === "consult_paid") p.membership.state = "consult_booked";
  completeTask(userId, "book");
}

export function setPaymentResolved(userId: string) {
  const p = store().get(userId);
  if (!p) return;
  p.membership.state = "ninety_day_active";
  p.membership.paymentIssue = undefined;
  p.membership.instalmentsPaid = 2;
  p.membership.nextChargeUtc = daysFromNow(14, 9, 0);
  p.membership.entitlements = FULL_90_DAY;
  completeTask(userId, "payment");
}

export function upgradeToNinetyDay(userId: string, plan: "ninety-day-upfront" | "ninety-day-instalments") {
  const p = store().get(userId);
  if (!p) return;
  p.membership = {
    state: "ninety_day_active",
    plan: PLANS[plan],
    programmeStartUtc: new Date().toISOString(),
    programmeEndUtc: daysFromNow(90, 0, 0),
    programmeDay: 1,
    instalmentsPaid: 1,
    nextChargeUtc: plan === "ninety-day-instalments" ? daysFromNow(30, 9, 0) : undefined,
    nextChargeAmount: plan === "ninety-day-instalments" ? 150 : undefined,
    entitlements: FULL_90_DAY,
  };
  p.onboarding = [
    task("welcome", "Welcome to your 90-Day Programme", "Your care team has been told. Book your Month 1 appointments below.", true),
    task("book-m1", "Book your Month 1 appointments", "Doctor, dietitian and health coach — pick times that suit you", false, { href: "/programme", dueLabel: "This week" }),
    task("plan", "Read your nutrition plan", "Arrives within 48 hours of your dietitian appointment", false, { href: "/documents" })];
}

export function continueToOngoing(userId: string, plan: "ongoing-75" | "ongoing-150") {
  const p = store().get(userId);
  if (!p) return;
  p.membership = {
    state: "legacy_member",
    plan: PLANS[plan],
    programmeStartUtc: p.membership.programmeStartUtc,
    programmeEndUtc: p.membership.programmeEndUtc,
    nextChargeUtc: daysFromNow(30, 9, 0),
    nextChargeAmount: plan === "ongoing-75" ? 75 : 150,
    entitlements: ["book-doctor", "book-nurse", "ad-hoc-sessions", "prescriptions", "community", "content-library", ...(plan === "ongoing-150" ? (["book-dietitian", "book-health-coach"] as const) : [])],
  };
  completeTask(userId, "choose");
}
