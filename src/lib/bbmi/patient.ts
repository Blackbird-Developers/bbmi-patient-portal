import "server-only";
import { PLANS } from "../portal/store";
import type { BackendFacts, Entitlement, Membership, OnboardingTask, Plan, PortalPatient, WeightEntry } from "../portal/types";
import type { ClinicianRole } from "../semble/types";
import { hasRole } from "../semble/types";
import { getSemble } from "../semble";
import { linkSemblePatient } from "../semble/link";
import * as api from "./api";
import { BbmiError } from "./client";

/**
 * Builds the signed-in patient from the Beyond BMI backend (money, identity,
 * journey stage, weights, questionnaires) plus the linked Semble record
 * (clinical). Nothing here is persisted by the portal.
 */

export class AccountNotReady extends Error {
  constructor() {
    super("This login has no Beyond BMI patient record yet");
    this.name = "AccountNotReady";
  }
}

const DAY = 86_400_000;
const NOT_AVAILABLE = /not available/i;
const clean = (v?: string | null) => (v && !NOT_AVAILABLE.test(v) ? v : undefined);

const GROUP_TO_ENTITLEMENT: Record<string, Entitlement> = {
  doctor: "book-doctor",
  nurse: "book-nurse",
  dietician: "book-dietitian", // Beyond BMI spells it "dietician"
  "health-coach": "book-health-coach",
  prescription: "prescriptions",
  community: "community",
};

function planFor(t: api.TierStatus, info: api.PersonalInformation | null): Plan | undefined {
  const variant = t.ninetyDay?.variant ?? t.ninetyDayCompleted?.variant;
  if (t.stage.startsWith("consult_")) return PLANS["consult-89"];
  if (t.stage.startsWith("ninety_day_")) return variant === "upfront_399" ? PLANS["ninety-day-upfront"] : PLANS["ninety-day-instalments"];
  if (t.stage === "legacy_member" || t.stage === "legacy_lapsed") {
    const price = info?.subscription?.stripePlanId;
    if (price && price === process.env.BBMI_PRICE_ONGOING_75) return PLANS["ongoing-75"];
    if (price && price === process.env.BBMI_PRICE_ONGOING_150) return PLANS["ongoing-150"];
    return PLANS["legacy-150"];
  }
  return undefined;
}

function membershipFrom(t: api.TierStatus, info: api.PersonalInformation | null, groups: string[]): Membership {
  const plan = planFor(t, info);
  const m: Membership = { state: t.stage, plan, entitlements: [] };
  const nd = t.ninetyDay;
  if (nd) {
    m.programmeStartUtc = nd.programmeBegins;
    // €399: activeUntil is the programme end. €150×3: activeUntil is the monthly period end, so the end is the anchor + 90 days.
    m.programmeEndUtc = nd.variant === "upfront_399" ? nd.activeUntil : new Date(new Date(nd.programmeBegins).getTime() + 90 * DAY).toISOString();
    if (nd.variant === "installments_450" && t.stage === "ninety_day_active") {
      m.nextChargeUtc = nd.activeUntil;
      m.nextChargeAmount = 150;
    }
  } else if (t.ninetyDayCompleted) {
    m.programmeStartUtc = t.ninetyDayCompleted.programmeStart;
    m.programmeEndUtc = t.ninetyDayCompleted.completedAt;
  }
  if (t.billingIssue) {
    const amount = t.billingIssue.amountDueCents != null ? `€${(t.billingIssue.amountDueCents / 100).toFixed(t.billingIssue.amountDueCents % 100 ? 2 : 0)}` : "your payment";
    m.paymentIssue = {
      since: "",
      graceEndsUtc: "",
      message: t.billingIssue.status === "payment_paused" ? "Payments on your plan are paused by the clinic. Contact the care team to resume." : `Your instalment of ${amount} didn't go through.`,
    };
  }
  // Groups come from the plan in Stripe; they can linger after one-off plans expire, so the stage gates first.
  const paid = !["none", "legacy_lapsed", "ninety_day_overdue"].includes(t.stage);
  const ent = new Set<Entitlement>();
  if (paid) {
    for (const g of groups) if (GROUP_TO_ENTITLEMENT[g]) ent.add(GROUP_TO_ENTITLEMENT[g]);
    if (!t.stage.startsWith("consult_")) ent.add("content-library");
    ent.add("insurance-docs");
  }
  m.entitlements = [...ent];
  return m;
}

function weightsFrom(rows: api.WeightRow[]): WeightEntry[] {
  return rows
    .map((w) => ({
      id: w.id,
      dateUtc: w.measurementDate ? new Date(`${w.measurementDate.slice(0, 10)}T12:00:00.000Z`).toISOString() : new Date(w.created).toISOString(),
      kg: Number(w.weight),
      source: (w.doctorId ? "clinician" : "patient") as WeightEntry["source"],
    }))
    .filter((w) => Number.isFinite(w.kg))
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
}

const task = (id: string, title: string, detail: string, done: boolean, extra: Partial<OnboardingTask> = {}): OnboardingTask => ({ id, title, detail, done, ...extra });

function tasksFrom(t: api.TierStatus, f: BackendFacts): OnboardingTask[] {
  const out: OnboardingTask[] = [];
  const s = t.stage;
  if (s === "consult_paid" || s === "consult_booked") {
    out.push(task("questionnaire", "Health questionnaire", "About 8 minutes. Your doctor reads it before you meet.", f.surveyDone, { href: "/forms/intake", dueLabel: f.surveyDone ? undefined : "Before you book" }));
    out.push(task("book", "Book your doctor consultation", "25 minutes by video with an obesity doctor", s === "consult_booked", { href: "/book/specialist-consultation", dueLabel: f.surveyDone ? "Ready to book" : "Unlocks after the questionnaire" }));
    out.push(task("address", "Confirm your home address", "Needed for your prescription if one is issued", f.hasAddress, { href: "/account" }));
  }
  if (s === "ninety_day_overdue") out.push(task("payment", "Pay your missed instalment", "Restores booking and keeps your prescription renewals on schedule", false, { href: "/account/billing", dueLabel: "Overdue" }));
  if (s === "ninety_day_completed") out.push(task("choose", "Choose how you'd like to continue", "Ongoing Care or full MDT — or take a break", false, { href: "/plans", dueLabel: "Whenever you're ready" }));
  if (s === "legacy_member" && f.doctorReviewDue) out.push(task("review", "Book your annual doctor review", "It has been a year since your last doctor review", false, { href: "/book/doctor-quarterly", dueLabel: "Due now" }));
  if (s === "ninety_day_active" || s === "legacy_member" || s === "consult_done") {
    out.push(task("weight", "Log this week's weight", "The weekly weigh-in is the habit that matters most", !f.weighInOpen, { href: "/progress", dueLabel: f.weighInOpen ? "This week" : undefined }));
  }
  if (f.essDue && (s === "ninety_day_active" || s === "legacy_member")) out.push(task("ess", "Sleep & quality-of-life check", "Two short questionnaires, every two months", false, { href: "/forms/ess-eq5d" }));
  return out;
}

async function careTeam(): Promise<PortalPatient["careTeam"]> {
  const clinicians = await getSemble().listClinicians();
  const team: PortalPatient["careTeam"] = {};
  for (const role of ["doctor", "nurse", "dietitian", "health-coach"] as ClinicianRole[]) {
    const c = clinicians.find((x) => hasRole(x, role));
    if (c) team[role] = c.id;
  }
  return team;
}

function surveyUrlFor(stage: api.TierStage, patientId: string) {
  const base = (process.env.BBMI_TALLY_URL || "https://survey.beyondbmi.ie/").replace(/\/?$/, "/");
  // Members keep the long intake; everyone else gets the short €89 form (as the current app does).
  const slug = stage === "legacy_member" || stage === "legacy_lapsed" ? "survey" : process.env.BBMI_E89_SURVEY_PATH || "survey";
  return `${base}${slug}?patient_id=${encodeURIComponent(patientId)}`;
}

/** Throws AccountNotReady when the login has no patients row (the backend answers 404). */
export async function loadBbmiPatient(identity: { sub: string; email: string; groups: string[] }, accessToken: string): Promise<PortalPatient> {
  const soft = <T,>(p: Promise<T>, fallback: T) => p.catch((e) => (e instanceof BbmiError && e.code !== "unauthorised" ? fallback : Promise.reject(e)));
  let me: api.Me;
  try {
    me = await api.getMe(accessToken);
  } catch (e) {
    if (e instanceof BbmiError && e.code === "not-found") throw new AccountNotReady();
    throw e;
  }
  const [tier, info, history, last, surveyDone, essDue, hc] = await Promise.all([
    api.getTierStatus(accessToken),
    soft(api.getPersonalInformation(accessToken), null),
    soft(api.getWeightHistory(accessToken), { weights: [] as api.WeightRow[] }),
    soft(api.getLastWeight(accessToken), { weight: null, lessWeek: false, dateAvailable: null }),
    soft(api.getSurveyDone(accessToken), false),
    soft(api.getEssDue(accessToken), false),
    soft(api.getHealthCoachSurvey(accessToken), { show: false, survey: "" }),
  ]);

  const facts: BackendFacts = {
    groups: identity.groups,
    canPurchaseConsult: tier.canPurchaseConsult,
    canUpgrade: tier.canUpgrade,
    canChooseOngoing: !!tier.canChooseOngoing,
    billingIssue: tier.billingIssue ? { status: tier.billingIssue.status, amountDue: tier.billingIssue.amountDueCents != null ? tier.billingIssue.amountDueCents / 100 : undefined, currency: tier.billingIssue.currency, payUrl: tier.billingIssue.hostedInvoiceUrl } : undefined,
    lapsed: tier.lapsed,
    surveyDone: !!surveyDone,
    surveyUrl: surveyUrlFor(tier.stage, me.id),
    hasAddress: tier.hasAddress ?? !!clean(info?.address),
    weighInOpen: !last.lessWeek,
    nextWeighInUtc: last.lessWeek && last.dateAvailable ? new Date(last.dateAvailable).toISOString() : undefined,
    essDue: !!essDue,
    healthCoachSurvey: hc.survey ? { show: hc.show, slug: hc.survey } : undefined,
    unitPreference: me.settings?.unitPreference === "lbs" ? "lbs" : "kg",
    dob: clean(info?.dob)?.slice(0, 10),
    mobile: clean(info?.mobile) ?? clean(me.mobile),
    address: clean(info?.address),
    purchaseUtc: tier.ninetyDay?.programmeStart,
    doctorReviewDue: !!tier.doctorReview,
  };

  const weights = weightsFrom(history.weights);
  const semblePatientId = await linkSemblePatient({ bbmiId: me.id, email: me.email, firstName: me.firstName, lastName: me.lastName, dob: facts.dob, phone: facts.mobile, gender: me.gender ?? undefined });
  return {
    userId: me.id,
    semblePatientId,
    email: me.email,
    firstName: me.firstName,
    lastName: me.lastName,
    membership: membershipFrom(tier, info, identity.groups),
    goal: { startKg: weights[0]?.kg ?? 0 },
    weights,
    onboarding: tasksFrom(tier, facts),
    careTeam: tier.stage === "consult_paid" ? {} : await careTeam(),
    backend: facts,
  };
}
