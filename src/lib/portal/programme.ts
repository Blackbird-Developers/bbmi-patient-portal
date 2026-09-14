import type { Appointment } from "../semble/types";
import type { Membership, ProgrammeStep, ProgrammeStepView, StepStatus } from "./types";

/**
 * The 90-Day Programme — 8 bookable MDT appointments + 2 info rows.
 * From the client's Patient Journey Map v4.2.1 ("90-Day Appointment
 * Scheduling Rules"): every appointment sits in a ±7-day window around its
 * monthly target; same-role appointments are booked in order.
 *
 * Day offsets are from programme start (payment date, or Day-20 policy anchor).
 */
export const NINETY_DAY_STEPS: ProgrammeStep[] = [
  {
    id: "doctor-m1",
    phase: "ninety-day",
    month: 1,
    role: "doctor",
    title: "Doctor — initial review",
    purpose: "Your medication, how you are getting on with it, and your goals for the programme.",
    durationMinutes: 10,
    format: "video",
    windowFromDay: 0,
    windowToDay: 14,
    appointmentTypeSlug: "doctor-review",
    bookable: true,
  },
  {
    id: "dietitian-m1",
    phase: "ninety-day",
    month: 1,
    role: "dietitian",
    title: "Dietitian — nutritional assessment",
    purpose: "Full nutritional assessment. Your personalised nutrition plan follows within 48 hours.",
    durationMinutes: 45,
    format: "video",
    windowFromDay: 0,
    windowToDay: 14,
    appointmentTypeSlug: "dietitian-initial",
    bookable: true,
  },
  {
    id: "coach-s1",
    phase: "ninety-day",
    month: 1,
    role: "health-coach",
    title: "Health coach — session 1",
    purpose: "Goals, habits and the support you want from the programme.",
    durationMinutes: 30,
    format: "video",
    windowFromDay: 0,
    windowToDay: 14,
    appointmentTypeSlug: "health-coach-session",
    bookable: true,
  },
  {
    id: "nurse-day5",
    phase: "ninety-day",
    month: 1,
    role: "nurse",
    title: "Nurse follow-up call",
    purpose: "Your nurse calls you on day 5–7 to check medication, injection technique and side effects.",
    durationMinutes: 10,
    format: "phone",
    windowFromDay: 5,
    windowToDay: 7,
    appointmentTypeSlug: "nurse-call",
    bookable: false,
  },
  {
    id: "nurse-m2",
    phase: "ninety-day",
    month: 2,
    role: "nurse",
    title: "Nurse — check-in",
    purpose: "Progress, side effects and medication review at the halfway point.",
    durationMinutes: 10,
    format: "video",
    windowFromDay: 21,
    windowToDay: 42,
    appointmentTypeSlug: "nurse-checkin",
    after: ["doctor-m1"],
    bookable: true,
  },
  {
    id: "coach-s2",
    phase: "ninety-day",
    month: 2,
    role: "health-coach",
    title: "Health coach — session 2",
    purpose: "Habit review, motivation and accountability.",
    durationMinutes: 30,
    format: "video",
    windowFromDay: 21,
    windowToDay: 42,
    appointmentTypeSlug: "health-coach-session",
    after: ["coach-s1"],
    bookable: true,
  },
  {
    id: "doctor-m3",
    phase: "ninety-day",
    month: 3,
    role: "doctor",
    title: "Doctor — final review",
    purpose: "Dose review, results and what continued support looks like for you.",
    durationMinutes: 10,
    format: "video",
    windowFromDay: 49,
    windowToDay: 77,
    appointmentTypeSlug: "doctor-review",
    after: ["doctor-m1"],
    bookable: true,
  },
  {
    id: "dietitian-m3",
    phase: "ninety-day",
    month: 3,
    role: "dietitian",
    title: "Dietitian — follow-up",
    purpose: "Review of your nutrition plan and adjustments for the months ahead.",
    durationMinutes: 45,
    format: "video",
    windowFromDay: 49,
    windowToDay: 77,
    appointmentTypeSlug: "dietitian-followup",
    after: ["dietitian-m1"],
    bookable: true,
  },
  {
    id: "coach-s3",
    phase: "ninety-day",
    month: 3,
    role: "health-coach",
    title: "Health coach — session 3",
    purpose: "Consolidating habits that last beyond the programme.",
    durationMinutes: 30,
    format: "video",
    windowFromDay: 49,
    windowToDay: 77,
    appointmentTypeSlug: "health-coach-session",
    after: ["coach-s2"],
    bookable: true,
  },
  {
    id: "nurse-day80",
    phase: "ninety-day",
    month: 3,
    role: "nurse",
    title: "Day 80 — results & next steps call",
    purpose: "Your nurse calls to review your results and talk through Ongoing Care options.",
    durationMinutes: 15,
    format: "phone",
    windowFromDay: 78,
    windowToDay: 82,
    appointmentTypeSlug: "nurse-call",
    bookable: false,
  },
];

const DAY_MS = 86_400_000;

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

export function programmeDay(startUtc: string, nowUtc = new Date().toISOString()): number {
  return Math.floor((new Date(nowUtc).getTime() - new Date(startUtc).getTime()) / DAY_MS) + 1;
}

/**
 * Resolve step status for the dashboard. Pure function so it can be unit-tested
 * and re-run on the client with the same result.
 */
export function buildProgrammeView(
  membership: Membership,
  appointments: Appointment[],
  nowUtc = new Date().toISOString(),
): ProgrammeStepView[] {
  const start = membership.programmeStartUtc;
  if (!start) return [];
  const now = new Date(nowUtc).getTime();
  const byStep = new Map<string, Appointment>();
  for (const a of appointments) {
    if (a.programmeStepId && a.status !== "cancelled") byStep.set(a.programmeStepId, a);
  }

  return NINETY_DAY_STEPS.map((step) => {
    const windowFromUtc = addDays(start, step.windowFromDay);
    const windowToUtc = addDays(start, step.windowToDay + 1);
    const appt = byStep.get(step.id);
    let status: StepStatus;
    if (!step.bookable) {
      status = appt?.status === "completed" ? "completed" : "info";
    } else if (appt) {
      status =
        appt.status === "completed" ? "completed" : appt.status === "no-show" ? "missed" : "booked";
    } else {
      const prereqsBooked = (step.after ?? []).every((id) => byStep.has(id));
      const windowOpen = now >= new Date(windowFromUtc).getTime() - 14 * DAY_MS; // can book 2 weeks ahead of the window
      status = prereqsBooked && windowOpen ? "book-now" : "locked";
      if (now > new Date(windowToUtc).getTime() && !appt) status = "missed";
    }
    return {
      ...step,
      status,
      windowFromUtc,
      windowToUtc,
      appointmentId: appt?.id,
      appointmentStartUtc: appt?.startUtc,
      clinicianName: appt ? `${appt.clinician.title ? appt.clinician.title + " " : ""}${appt.clinician.fullName}` : undefined,
    };
  });
}

export function programmeProgress(view: ProgrammeStepView[]): { done: number; total: number; pct: number } {
  const bookable = view.filter((s) => s.bookable);
  const done = bookable.filter((s) => s.status === "completed").length;
  return { done, total: bookable.length, pct: Math.round((done / Math.max(1, bookable.length)) * 100) };
}
