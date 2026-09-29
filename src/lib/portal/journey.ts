import "server-only";
import { cache } from "react";
import { getSemble } from "../semble";
import type { Appointment, Clinician, ClinicianRole, Prescription } from "../semble/types";
import { NINETY_DAY_STEPS, buildProgrammeView, programmeProgress } from "./programme";
import type { MemberState, PortalPatient, ProgrammeStepView } from "./types";

/**
 * The single server-side "what am I / what next" evaluation. Every page reads
 * this; no page re-derives eligibility. In production this is the successor of
 * `GET /api/v1/user/tier-journey/status` with Semble bookings as the clinical
 * input and Stripe as the money input.
 *
 * Scope note: this portal only surfaces what Semble can actually back —
 * profile, clinicians, availability, bookings, prescriptions, documents,
 * questionnaires and invoices — plus Stripe for money. There is no dose diary
 * and no patient messaging; see the notes in semble/types.ts and portal/types.ts.
 */

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
  weight: WeightSummary;
  prescriptions: Prescription[];
  activePrescription?: Prescription;
  careTeam: Clinician[];
  /** role → clinician the patient has actually seen (or is booked with) — for "your usual clinician" */
  careTeamByRole: Partial<Record<ClinicianRole, string>>;
  can: {
    book: boolean;
    join: boolean;
    seePrescriptions: boolean;
    upgradeTo90Day: boolean;
    chooseOngoing: boolean;
    adHoc: boolean;
    community: boolean;
  };
  bookingLockedReason?: string;
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

function headline(p: PortalPatient, v: { state: MemberState; nextAppointment?: Appointment; programmeDay?: number; weight: WeightSummary; questionnaireDone: boolean }): JourneyView["headline"] {
  const first = p.firstName;
  switch (v.state) {
    case "consult_paid":
      return v.questionnaireDone
        ? { title: `You're ready to book, ${first}`, body: "Pick a time with one of our doctors. Your consultation is 25 minutes by video.", ctaLabel: "Book your consultation", ctaHref: "/book/specialist-consultation", tone: "navy" }
        : { title: "Your consultation is paid — one step first", body: "Complete your health questionnaire (about 8 minutes) so your doctor can prepare. Booking opens as soon as it's in.", ctaLabel: "Start questionnaire", ctaHref: "/forms/intake", tone: "navy" };
    case "consult_booked":
      return { title: "Your consultation is booked", body: p.backend ? "Join from here when it's time — the video link opens on your appointment." : "We'll send a reminder the day before and an hour before. Join from here when it's time.", ctaLabel: "See appointment", ctaHref: "/appointments", tone: "default" };
    case "consult_done":
      return p.backend && !p.backend.canUpgrade
        ? { title: `Good to see you, ${first}`, body: "Your consultation is complete. Your care team will be in touch about your treatment plan and what comes next.", tone: "default" }
        : { title: `Good to see you, ${first}`, body: "Your consultation is complete and your treatment plan is with your doctor. Keep the weekly weigh-in going.", tone: "default" };
    case "ninety_day_active":
      return { title: `Day ${v.programmeDay} of 90`, body: v.weight.changeKg < 0 ? `${Math.abs(v.weight.changeKg).toFixed(1)} kg down since you started. Keep the weekly weigh-in going — it's the habit that matters most.` : "Your programme is under way. Weekly weigh-ins and your monthly appointments are what matter most.", tone: "default" };
    case "ninety_day_overdue":
      return p.backend && !p.backend.billingIssue?.payUrl
        ? { title: "Your 90-Day Programme is paused", body: p.membership.paymentIssue?.message ?? "A payment was unsuccessful.", ctaLabel: "Contact the care team", ctaHref: "/care", tone: "warn" }
        : { title: "Your 90-Day Programme is paused", body: p.membership.paymentIssue?.message ?? "A payment was unsuccessful.", ctaLabel: "Pay instalment and resume", ctaHref: "/account/billing", tone: "warn" };
    case "ninety_day_completed":
      return { title: "You've completed your 90-Day Programme", body: `${Math.abs(v.weight.changeKg).toFixed(1)} kg since day one. Choose how you'd like to continue — or take a break. Your history and results are kept either way.`, ctaLabel: "See your options", ctaHref: "/plans", tone: "positive" };
    case "legacy_member":
      return { title: `Welcome back, ${first}`, body: "Your care continues month to month. Your next check-ins are below.", tone: "default" };
    case "legacy_lapsed":
      return { title: "Your membership isn't active", body: "You can't book or join appointments until it's active again. Your history and results are kept.", ctaLabel: "Continue your membership", ctaHref: "/plans", tone: "notice" };
    default:
      return { title: `Hi ${first}`, body: "Start with a €89 consultation with one of our doctors.", ctaLabel: "See how it works", ctaHref: "/plans", tone: "default" };
  }
}

/** Memoised per request: the layout and the page both need it, and each load costs several Semble calls. */
export const loadJourney = cache((user: PortalPatient) => buildJourney(user));

async function buildJourney(user: PortalPatient, nowUtc = new Date().toISOString()): Promise<JourneyView> {
  const semble = getSemble();
  const now = new Date(nowUtc);
  const [appointments, prescriptions, clinicians] = await Promise.all([
    // No Semble record yet (signed up, never bought): nothing clinical to show.
    user.semblePatientId ? semble.listAppointments(user.semblePatientId, { fromUtc: new Date(now.getTime() - 400 * 86_400_000).toISOString(), toUtc: new Date(now.getTime() + 200 * 86_400_000).toISOString() }) : [],
    user.semblePatientId ? semble.listPrescriptions(user.semblePatientId) : [],
    semble.listClinicians(),
  ]);

  const live = appointments.filter((a) => a.status !== "cancelled");
  const isUpcoming = (a: Appointment) => (a.status === "confirmed" || a.status === "pending") && new Date(a.endUtc).getTime() >= now.getTime();
  const upcoming = live.filter(isUpcoming).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const past = live.filter((a) => !isUpcoming(a)).sort((a, b) => b.startUtc.localeCompare(a.startUtc));
  const nextAppointment = upcoming[0];

  const m = user.membership;
  let state = m.state;
  // Beyond BMI derives the consultation stages from its own calendar, which Semble bookings don't reach yet:
  // a completed Semble consultation is "done", a confirmed one is "booked". (Upgrading still needs the backend to agree.)
  if (user.backend && (state === "consult_paid" || state === "consult_booked")) {
    const consults = live.filter((a) => a.type.slug === "specialist-consultation");
    if (consults.some((a) => a.status === "completed")) state = "consult_done";
    else if (consults.some(isUpcoming)) state = "consult_booked";
  }
  const isNinetyDay = state === "ninety_day_active" || state === "ninety_day_overdue";
  let programme: JourneyView["programme"];
  if (isNinetyDay && m.programmeStartUtc && m.programmeEndUtc) {
    let steps = buildProgrammeView(m, appointments, nowUtc);
    // Beyond BMI allows one pending appointment per role: the next same-role step waits until the earlier one has happened.
    if (user.backend) steps = steps.map((s) => (s.status === "book-now" && upcoming.some((a) => a.type.role === s.role) ? { ...s, status: "locked" as const } : s));
    const prog = programmeProgress(steps);
    const day = Math.max(1, Math.floor((now.getTime() - new Date(m.programmeStartUtc).getTime()) / 86_400_000) + 1);
    programme = { steps, day, total: 90, pct: Math.min(100, Math.round((day / 90) * 100)), done: prog.done, locked: state === "ninety_day_overdue", startUtc: m.programmeStartUtc, endUtc: m.programmeEndUtc };
  }

  const questionnaireDone = !user.onboarding.some((t) => t.id === "questionnaire" && !t.done);
  const weight = weightSummary(user, now);
  // Beyond BMI mode: the care team is who the patient has actually seen or is booked with (latest per role),
  // never "the first clinician in the practice". Demo mode keeps its assigned team.
  const careTeamByRole: Partial<Record<ClinicianRole, string>> = {};
  if (user.backend) {
    const listed = new Set(clinicians.map((c) => c.id));
    for (const a of [...live].filter((a) => a.status !== "no-show" && listed.has(a.clinician.id)).sort((x, y) => x.startUtc.localeCompare(y.startUtc))) careTeamByRole[a.type.role] = a.clinician.id;
  } else Object.assign(careTeamByRole, user.careTeam);
  const careTeam = clinicians.filter((c) => Object.values(careTeamByRole).includes(c.id));
  const bookable = new Set<MemberState>(["consult_paid", "ninety_day_active", "legacy_member", "consult_done"]);

  let bookingLockedReason: string | undefined;
  if (state === "ninety_day_overdue") bookingLockedReason = "Booking is paused until your missed instalment is paid. Appointments you've already booked are kept.";
  if (state === "legacy_lapsed") bookingLockedReason = "Booking is paused while your membership isn't active.";
  if (state === "consult_paid" && !questionnaireDone) bookingLockedReason = "Complete your health questionnaire to unlock booking.";
  if (state === "consult_done") bookingLockedReason = user.backend && !user.backend.canUpgrade ? "Your consultation is complete. Your care team will be in touch about your next steps." : "Your €89 consultation is complete. Start your 90-Day Programme to book with the care team.";
  // The questionnaire gate also applies to joining (it used to sit in the video-token service).
  const joinBlockedBySurvey = !!user.backend && user.backend.groups.includes("survey") && !user.backend.surveyDone;
  // Tasks follow the effective stage (a Semble booking completes "book your consultation").
  const tasks = user.onboarding.map((t) => (t.id === "book" && state !== "consult_paid" ? { ...t, done: true, dueLabel: undefined } : t));

  return {
    user,
    state,
    headline: headline(user, { state, nextAppointment, programmeDay: programme?.day, weight, questionnaireDone }),
    nextAppointment,
    upcoming,
    past,
    programme,
    tasks,
    openTasks: tasks.filter((t) => !t.done).length,
    weight,
    prescriptions,
    activePrescription: prescriptions[0],
    careTeam,
    careTeamByRole,
    can: {
      book: bookable.has(state) && !(state === "consult_paid" && !questionnaireDone) && state !== "consult_done",
      join: state !== "ninety_day_overdue" && state !== "legacy_lapsed" && !joinBlockedBySurvey,
      seePrescriptions: prescriptions.length > 0,
      // With the Beyond BMI backend, only offer what its checkout will accept.
      upgradeTo90Day: state === "consult_done" && (!user.backend || user.backend.canUpgrade),
      chooseOngoing: state === "ninety_day_completed" && (!user.backend || user.backend.canChooseOngoing),
      adHoc: m.entitlements.includes("ad-hoc-sessions"),
      community: m.entitlements.includes("community"),
    },
    bookingLockedReason,
  };
}

export { NINETY_DAY_STEPS };
