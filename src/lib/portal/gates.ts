import type { Appointment, AppointmentType, ClinicianRole } from "../semble/types";
import type { MemberState, PortalPatient, ProgrammeStepView } from "./types";

/**
 * Booking rules that Beyond BMI used to enforce inside its own booking service
 * (activities.service.ts). With appointments in Semble nothing enforces them
 * there, so the portal does — in the server actions (book AND reschedule), with
 * the booking page showing the same reason. Only applies when the portal runs
 * on the Beyond BMI backend (PORTAL_AUTH=cognito); the demo keeps its own rules.
 *
 * Deliberately not here yet (they need Semble-side appointment history the
 * backend used to hold): legacy per-plan cooldowns, the first/follow-up type
 * sequence, 90-day allocation counts and staff overrides.
 *
 * Product decision: after the €89 consultation (consult_done) the portal offers
 * the 90-Day Programme rather than further bookings, although Beyond BMI's
 * backend would still allow a doctor booking for a year.
 */

export type Gate = { ok: true } | { ok: false; title: string; body: string; href?: string; label?: string };

export interface GateContext {
  /** the effective stage from loadJourney (Semble bookings move the consultation stages) */
  state: MemberState;
  upcoming: Appointment[];
  programme?: { steps: ProgrammeStepView[]; endUtc: string };
}

export interface GateRequest {
  rescheduleId?: string;
  programmeStepId?: string;
  startUtc?: string;
}

/** Beyond BMI's Cognito group for each bookable role ("dietician" is their spelling). */
const GROUP: Partial<Record<ClinicianRole, string>> = { doctor: "doctor", nurse: "nurse", dietitian: "dietician", "health-coach": "health-coach" };
const ROLE_NAME: Record<string, string> = { doctor: "doctor", nurse: "nurse", dietitian: "dietitian", "health-coach": "health coach", psychologist: "psychologist", "care-coordinator": "care coordinator" };
const WEIGHT_STALE_DAYS = Number(process.env.PORTAL_WEIGHT_STALE_DAYS || 45);
const DAY = 86_400_000;

const dayStart = (iso: string) => {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
};

/** The date range a 90-day step may be booked in (a missed step: until the next step of its kind opens, or the programme ends). */
export function stepRange(step: ProgrammeStepView, steps: ProgrammeStepView[], programmeEndUtc: string): { from: number; to: number } | null {
  if (!step.windowFromUtc || !step.windowToUtc) return null;
  if (step.status === "missed") {
    const next = steps.filter((s) => s.after?.includes(step.id) && s.windowFromUtc).map((s) => s.windowFromUtc!).sort()[0];
    const cap = next && next < programmeEndUtc ? next : programmeEndUtc;
    return { from: 0, to: dayStart(cap) + DAY };
  }
  return { from: dayStart(step.windowFromUtc), to: dayStart(step.windowToUtc) + DAY };
}

export function bookingGate(user: PortalPatient, ctx: GateContext, type: AppointmentType, req: GateRequest = {}): Gate {
  const b = user.backend;
  if (!b) return { ok: true };
  const { state } = ctx;
  const role = ROLE_NAME[type.role] ?? type.role;
  const paused = state === "ninety_day_overdue";

  if (req.rescheduleId) {
    // Moving an appointment still needs an active plan; a consultation can be moved while it is booked.
    if (state === "consult_booked" && type.slug === "specialist-consultation") return { ok: true };
    if (state === "ninety_day_active" || state === "legacy_member") return { ok: true };
    return { ok: false, title: "This appointment can't be moved online", body: paused ? "Moving appointments is paused until your missed instalment is paid." : "Call or email the care team and they will help.", href: paused ? "/account/billing" : "/care", label: paused ? "Pay and resume" : "Contact the care team" };
  }

  if (state === "consult_paid") {
    if (type.slug !== "specialist-consultation") return { ok: false, title: "Not included yet", body: "Your consultation comes first. The rest of the care team joins on the 90-Day Programme.", href: "/plans", label: "See the programme" };
  } else if (state === "consult_booked") {
    return { ok: false, title: "Your consultation is already booked", body: "Move it from Appointments if you need a different time.", href: "/appointments", label: "Appointments" };
  } else if (state === "consult_done") {
    return b.canUpgrade
      ? { ok: false, title: "Your consultation is complete", body: "The 90-Day Programme gives you the doctor, dietitian, nurse and health coach.", href: "/plans", label: "See the programme" }
      : { ok: false, title: "Your consultation is complete", body: "Your care team will be in touch about your next steps.", href: "/care", label: "Your care team" };
  } else if (state !== "ninety_day_active" && state !== "legacy_member") {
    return { ok: false, title: "Booking isn't open", body: paused ? "Booking is paused until your missed instalment is paid." : "Booking needs an active plan.", href: paused ? "/account/billing" : "/plans", label: paused ? "Pay and resume" : "See your options" };
  }

  const group = GROUP[type.role];
  if (group && !b.groups.includes(group)) return { ok: false, title: `Your plan doesn't include ${role} appointments`, body: "If you think it should, the care team can check your plan.", href: "/care", label: "Contact the care team" };

  if (!b.surveyDone) return { ok: false, title: "Your health questionnaire comes first", body: "About 8 minutes. Your clinician reads it before you meet, and booking opens as soon as it's in.", href: "/forms/intake", label: "Start questionnaire" };

  if (type.role === "doctor") {
    const last = user.weights[user.weights.length - 1];
    const days = last ? Math.floor((Date.now() - new Date(last.dateUtc).getTime()) / DAY) : Infinity;
    if (days > WEIGHT_STALE_DAYS) return { ok: false, title: "Log your current weight first", body: `Your doctor needs a weight from the last ${WEIGHT_STALE_DAYS} days before your appointment.`, href: "/progress", label: "Log weight" };
  }

  // One appointment per role at a time (Beyond BMI rule BBMI-113).
  const pending = ctx.upcoming.find((a) => (a.status === "confirmed" || a.status === "pending") && a.type.role === type.role);
  if (pending) return { ok: false, title: `You already have a ${role} appointment booked`, body: "Move it from Appointments if you need a different time. You can book the next one once it has happened.", href: "/appointments", label: "Appointments" };

  // 90-Day Programme: every booking belongs to an open step of the same appointment type, inside its window.
  if (state === "ninety_day_active" && ctx.programme) {
    const step = req.programmeStepId ? ctx.programme.steps.find((s) => s.id === req.programmeStepId) : undefined;
    if (!step || step.appointmentTypeSlug !== type.slug || !(step.status === "book-now" || step.status === "missed")) {
      return { ok: false, title: "Book this from your programme", body: "Programme appointments are booked in order, each in its own window.", href: "/programme", label: "Your programme" };
    }
    if (req.startUtc) {
      const range = stepRange(step, ctx.programme.steps, ctx.programme.endUtc);
      const at = new Date(req.startUtc).getTime();
      if (!range || at < range.from || at >= range.to) return { ok: false, title: "That time is outside this appointment's window", body: "Pick a time from the list — it only shows times inside your window.", href: "/programme", label: "Your programme" };
    }
  }

  return { ok: true };
}
