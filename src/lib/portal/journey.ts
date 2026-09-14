import "server-only";
import { getSemble } from "../semble";
import type { Appointment, Clinician, Message, Prescription } from "../semble/types";
import { NINETY_DAY_STEPS, buildProgrammeView, programmeProgress } from "./programme";
import type { MemberState, PortalPatient, ProgrammeStepView } from "./types";

/**
 * The single server-side "what am I / what next" evaluation. Every page reads
 * this; no page re-derives eligibility. In production this is the successor of
 * `GET /api/v1/user/tier-journey/status` with Semble bookings as the clinical
 * input and Stripe as the money input.
 */

export interface NextDose {
  drug: string;
  doseMg: number;
  dueUtc: string;
  overdue: boolean;
  dueInDays: number;
  suggestedSite: string;
  lastTakenUtc?: string;
  nextTitration?: { doseMg: number; fromUtc: string; label: string };
}

export interface WeightSummary {
  latestKg?: number;
  latestUtc?: string;
  startKg: number;
  changeKg: number;
  changePct: number;
  targetKg?: number;
  toTargetKg?: number;
  weekDue: boolean; // no entry in the last 7 days
  series: { dateUtc: string; kg: number }[];
  bmi?: number;
}

export interface JourneyView {
  user: PortalPatient;
  state: MemberState;
  headline: { title: string; body: string; ctaLabel?: string; ctaHref?: string; tone: "default" | "positive" | "notice" | "warn" | "navy" };
  nextAppointment?: Appointment;
  upcoming: Appointment[];
  past: Appointment[];
  programme?: { steps: ProgrammeStepView[]; day: number; total: number; pct: number; done: number; locked: boolean; startUtc: string; endUtc: string };
  tasks: PortalPatient["onboarding"];
  openTasks: number;
  nextDose?: NextDose;
  weight: WeightSummary;
  prescriptions: Prescription[];
  activePrescription?: Prescription;
  unreadMessages: number;
  lastMessage?: Message;
  careTeam: Clinician[];
  can: {
    book: boolean;
    join: boolean;
    message: boolean;
    seePrescriptions: boolean;
    upgradeTo90Day: boolean;
    chooseOngoing: boolean;
    adHoc: boolean;
    community: boolean;
  };
  bookingLockedReason?: string;
}

const SITE_ORDER = ["abdomen-left", "abdomen-right", "thigh-left", "thigh-right"] as const;
const SITE_LABEL: Record<string, string> = {
  "abdomen-left": "left side of abdomen",
  "abdomen-right": "right side of abdomen",
  "thigh-left": "left thigh",
  "thigh-right": "right thigh",
  "upper-arm-left": "left upper arm",
  "upper-arm-right": "right upper arm",
};

function nextDose(p: PortalPatient, now: Date): NextDose | undefined {
  const m = p.medication;
  if (!m || !m.lastDoseUtc) return undefined;
  const last = new Date(m.lastDoseUtc);
  const due = new Date(last.getTime() + 7 * 86_400_000);
  const dueInDays = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  const lastSite = p.doses[p.doses.length - 1]?.site;
  const idx = lastSite ? SITE_ORDER.indexOf(lastSite as (typeof SITE_ORDER)[number]) : -1;
  const suggested = SITE_ORDER[(idx + 1) % SITE_ORDER.length];
  const start = p.membership.programmeStartUtc ? new Date(p.membership.programmeStartUtc) : last;
  const dayNow = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  const upcoming = m.titration.find((t) => t.fromDay > dayNow && t.doseMg !== m.currentDoseMg);
  return {
    drug: m.drug,
    doseMg: m.currentDoseMg,
    dueUtc: due.toISOString(),
    overdue: due.getTime() < now.getTime(),
    dueInDays,
    suggestedSite: SITE_LABEL[suggested],
    lastTakenUtc: m.lastDoseUtc,
    nextTitration: upcoming ? { doseMg: upcoming.doseMg, fromUtc: new Date(start.getTime() + upcoming.fromDay * 86_400_000).toISOString(), label: upcoming.label } : undefined,
  };
}

function weightSummary(p: PortalPatient, now: Date): WeightSummary {
  const series = p.weights.slice().sort((a, b) => a.dateUtc.localeCompare(b.dateUtc)).map((w) => ({ dateUtc: w.dateUtc, kg: w.kg }));
  const latest = series[series.length - 1];
  const start = p.goal.startKg;
  const changeKg = latest ? Math.round((latest.kg - start) * 10) / 10 : 0;
  const changePct = latest ? Math.round(((latest.kg - start) / start) * 1000) / 10 : 0;
  const targetKg = p.goal.targetKg ?? (p.goal.targetPct ? Math.round(start * (1 - p.goal.targetPct / 100) * 10) / 10 : undefined);
  const weekDue = !latest || now.getTime() - new Date(latest.dateUtc).getTime() > 7 * 86_400_000;
  const bmi = latest && p.goal.heightCm ? Math.round((latest.kg / Math.pow(p.goal.heightCm / 100, 2)) * 10) / 10 : undefined;
  return { latestKg: latest?.kg, latestUtc: latest?.dateUtc, startKg: start, changeKg, changePct, targetKg, toTargetKg: latest && targetKg ? Math.round((latest.kg - targetKg) * 10) / 10 : undefined, weekDue, series, bmi };
}

function headline(p: PortalPatient, v: { nextAppointment?: Appointment; programmeDay?: number; weight: WeightSummary; questionnaireDone: boolean }): JourneyView["headline"] {
  const first = p.firstName;
  switch (p.membership.state) {
    case "consult_paid":
      return v.questionnaireDone
        ? { title: `You're ready to book, ${first}`, body: "Pick a time with one of our doctors. Your consultation is 25 minutes by video.", ctaLabel: "Book your consultation", ctaHref: "/book/specialist-consultation", tone: "navy" }
        : { title: `Your consultation is paid — one step first`, body: "Complete your health questionnaire (about 8 minutes) so your doctor can prepare. Booking opens as soon as it's in.", ctaLabel: "Start questionnaire", ctaHref: "/forms/intake", tone: "navy" };
    case "consult_booked":
      return { title: "Your consultation is booked", body: v.nextAppointment ? "We'll send a reminder the day before and an hour before. Join from here when it's time." : "", ctaLabel: "See appointment", ctaHref: "/appointments", tone: "default" };
    case "consult_done":
      return { title: `Good to see you, ${first}`, body: "Your treatment has started. Log each dose, tell us how you're feeling, and your nurse will keep an eye on things.", tone: "default" };
    case "ninety_day_active":
      return { title: `Day ${v.programmeDay} of 90`, body: v.weight.changeKg < 0 ? `${Math.abs(v.weight.changeKg).toFixed(1)} kg down since you started. Keep the weekly weigh-in going — it's the habit that matters most.` : "Your programme is under way. Weekly weigh-ins and your monthly appointments are what matter most.", tone: "default" };
    case "ninety_day_overdue":
      return { title: "Your 90-Day Programme is paused", body: p.membership.paymentIssue?.message ?? "A payment was unsuccessful.", ctaLabel: "Pay instalment and resume", ctaHref: "/account/billing", tone: "warn" };
    case "ninety_day_completed":
      return { title: `You've completed your 90-Day Programme`, body: `${Math.abs(v.weight.changeKg).toFixed(1)} kg since day one. Choose how you'd like to continue — or take a break. Your history and results are kept either way.`, ctaLabel: "See your options", ctaHref: "/plans", tone: "positive" };
    case "legacy_member":
      return { title: `Welcome back, ${first}`, body: "Your care continues month to month. Your next check-ins are below.", tone: "default" };
    case "legacy_lapsed":
      return { title: "Your membership isn't active", body: "You can't book or join appointments until it's active again. Your history and results are kept.", ctaLabel: "Continue your membership", ctaHref: "/plans", tone: "notice" };
    default:
      return { title: `Hi ${first}`, body: "Start with a €89 consultation with one of our doctors.", ctaLabel: "See how it works", ctaHref: "/plans", tone: "default" };
  }
}

export async function loadJourney(user: PortalPatient, nowUtc = new Date().toISOString()): Promise<JourneyView> {
  const semble = getSemble();
  const now = new Date(nowUtc);
  const [appointments, prescriptions, messages, clinicians] = await Promise.all([
    semble.listAppointments(user.semblePatientId, { fromUtc: new Date(now.getTime() - 400 * 86_400_000).toISOString(), toUtc: new Date(now.getTime() + 200 * 86_400_000).toISOString() }),
    semble.listPrescriptions(user.semblePatientId),
    semble.listMessages(user.semblePatientId),
    semble.listClinicians(),
  ]);

  const live = appointments.filter((a) => a.status !== "cancelled");
  const upcoming = live.filter((a) => a.status === "confirmed" && new Date(a.endUtc).getTime() >= now.getTime()).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const past = live.filter((a) => !(a.status === "confirmed" && new Date(a.endUtc).getTime() >= now.getTime())).sort((a, b) => b.startUtc.localeCompare(a.startUtc));
  const nextAppointment = upcoming[0];

  const m = user.membership;
  const state = m.state;
  const isNinetyDay = state === "ninety_day_active" || state === "ninety_day_overdue";
  let programme: JourneyView["programme"];
  if (isNinetyDay && m.programmeStartUtc && m.programmeEndUtc) {
    const steps = buildProgrammeView(m, appointments, nowUtc);
    const prog = programmeProgress(steps);
    const day = Math.max(1, Math.floor((now.getTime() - new Date(m.programmeStartUtc).getTime()) / 86_400_000) + 1);
    programme = { steps, day, total: 90, pct: Math.min(100, Math.round((day / 90) * 100)), done: prog.done, locked: state === "ninety_day_overdue", startUtc: m.programmeStartUtc, endUtc: m.programmeEndUtc };
  }

  const questionnaireDone = !user.onboarding.some((t) => t.id === "questionnaire" && !t.done);
  const weight = weightSummary(user, now);
  const dose = nextDose(user, now);
  const careTeam = clinicians.filter((c) => Object.values(user.careTeam).includes(c.id));
  const bookable = new Set<MemberState>(["consult_paid", "ninety_day_active", "legacy_member", "consult_done"]);

  let bookingLockedReason: string | undefined;
  if (state === "ninety_day_overdue") bookingLockedReason = "Booking is paused until your missed instalment is paid. Appointments you've already booked are kept.";
  if (state === "legacy_lapsed") bookingLockedReason = "Booking is paused while your membership isn't active.";
  if (state === "consult_paid" && !questionnaireDone) bookingLockedReason = "Complete your health questionnaire to unlock booking.";
  if (state === "consult_done") bookingLockedReason = "Your €89 consultation is complete. Start your 90-Day Programme to book with the care team.";

  return {
    user,
    state,
    headline: headline(user, { nextAppointment, programmeDay: programme?.day, weight, questionnaireDone }),
    nextAppointment,
    upcoming,
    past,
    programme,
    tasks: user.onboarding,
    openTasks: user.onboarding.filter((t) => !t.done).length,
    nextDose: dose,
    weight,
    prescriptions,
    activePrescription: prescriptions[0],
    unreadMessages: messages.filter((x) => !x.readByPatient && x.from.kind !== "patient").length,
    lastMessage: messages[messages.length - 1],
    careTeam,
    can: {
      book: bookable.has(state) && !(state === "consult_paid" && !questionnaireDone) && state !== "consult_done",
      join: state !== "ninety_day_overdue" && state !== "legacy_lapsed",
      message: m.entitlements.includes("nurse-messaging"),
      seePrescriptions: prescriptions.length > 0,
      upgradeTo90Day: state === "consult_done",
      chooseOngoing: state === "ninety_day_completed",
      adHoc: m.entitlements.includes("ad-hoc-sessions"),
      community: m.entitlements.includes("community"),
    },
    bookingLockedReason,
  };
}

export { NINETY_DAY_STEPS };
