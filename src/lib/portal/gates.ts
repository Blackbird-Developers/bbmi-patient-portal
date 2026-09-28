import type { Appointment, AppointmentType, ClinicianRole } from "../semble/types";
import type { PortalPatient } from "./types";

/**
 * Booking rules that Beyond BMI used to enforce inside its own booking service
 * (activities.service.ts). With appointments in Semble nothing enforces them
 * there, so the portal does — in the server action, with the booking page
 * showing the same reason. Only applies when the portal runs on the Beyond BMI
 * backend (PORTAL_AUTH=cognito); the demo keeps its own journey rules.
 *
 * Deliberately not here yet (they need Semble-side appointment history the
 * backend used to hold): legacy per-plan cooldowns, the first/follow-up type
 * sequence, 90-day allocation counts and staff overrides.
 */

export type Gate = { ok: true } | { ok: false; title: string; body: string; href?: string; label?: string };

/** Beyond BMI's Cognito group for each bookable role ("dietician" is their spelling). */
const GROUP: Partial<Record<ClinicianRole, string>> = { doctor: "doctor", nurse: "nurse", dietitian: "dietician", "health-coach": "health-coach" };
const ROLE_NAME: Record<string, string> = { doctor: "doctor", nurse: "nurse", dietitian: "dietitian", "health-coach": "health coach", psychologist: "psychologist", "care-coordinator": "care coordinator" };
const WEIGHT_STALE_DAYS = Number(process.env.PORTAL_WEIGHT_STALE_DAYS || 45);

export function bookingGate(user: PortalPatient, upcoming: Appointment[], type: AppointmentType, rescheduleId?: string): Gate {
  const b = user.backend;
  if (!b) return { ok: true };
  const stage = user.membership.state;
  const role = ROLE_NAME[type.role] ?? type.role;

  if (rescheduleId) return { ok: true }; // moving an existing appointment only needs the slot itself

  if (stage === "consult_paid" || stage === "consult_booked") {
    if (type.slug !== "specialist-consultation") return { ok: false, title: "Not included yet", body: "Your consultation comes first. The rest of the care team joins on the 90-Day Programme.", href: "/plans", label: "See the programme" };
  } else if (!["ninety_day_active", "legacy_member"].includes(stage)) {
    return { ok: false, title: "Booking isn't open", body: stage === "ninety_day_overdue" ? "Booking is paused until your missed instalment is paid." : "Booking needs an active plan.", href: stage === "ninety_day_overdue" ? "/account/billing" : "/plans", label: stage === "ninety_day_overdue" ? "Pay and resume" : "See your options" };
  }

  const group = GROUP[type.role];
  if (group && !b.groups.includes(group)) return { ok: false, title: `Your plan doesn't include ${role} appointments`, body: "If you think it should, the care team can check your plan.", href: "/care", label: "Contact the care team" };

  if (!b.surveyDone) return { ok: false, title: "Your health questionnaire comes first", body: "About 8 minutes. Your clinician reads it before you meet, and booking opens as soon as it's in.", href: "/forms/intake", label: "Start questionnaire" };

  if (type.role === "doctor") {
    const last = user.weights[user.weights.length - 1];
    const days = last ? Math.floor((Date.now() - new Date(last.dateUtc).getTime()) / 86_400_000) : Infinity;
    if (days > WEIGHT_STALE_DAYS) return { ok: false, title: "Log your current weight first", body: `Your doctor needs a weight from the last ${WEIGHT_STALE_DAYS} days before your appointment.`, href: "/progress", label: "Log weight" };
  }

  // One appointment per role at a time (Beyond BMI rule BBMI-113).
  const pending = upcoming.find((a) => a.status === "confirmed" && a.type.role === type.role);
  if (pending) return { ok: false, title: `You already have a ${role} appointment booked`, body: "Move it from Appointments if you need a different time. You can book the next one once it has happened.", href: "/appointments", label: "Appointments" };

  return { ok: true };
}
