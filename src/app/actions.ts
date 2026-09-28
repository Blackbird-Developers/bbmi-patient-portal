"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rememberStage, requireUser, signIn, signInAs, signOut, switchStage } from "@/lib/auth";
import { getSemble, SembleAdapterError } from "@/lib/semble";
import { addWeight, completeTask, continueToOngoing, markConsultBooked, markQuestionnaireDone, setPaymentResolved, upgradeToNinetyDay } from "@/lib/portal/store";

/* ---------------------------------------------------------------- auth */
export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  let u;
  try {
    u = await signIn(email);
  } catch (e) {
    if (e instanceof SembleAdapterError) redirect(`/login?error=${/more than one/i.test(e.message) ? "duplicate" : "busy"}`);
    throw e;
  }
  // The typed email is never put in the URL: in Semble mode it is a real patient's address.
  if (!u) redirect("/login?error=unknown");
  redirect("/");
}

export async function switchPersona(formData: FormData) {
  const id = String(formData.get("userId") ?? "");
  await signInAs(id);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function switchStageAction(formData: FormData) {
  await switchStage(String(formData.get("stage") ?? ""));
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}

/* ---------------------------------------------------------------- progress */
export async function logWeightAction(formData: FormData) {
  const u = await requireUser();
  const kgRaw = Number(formData.get("kg"));
  const unit = String(formData.get("unit") ?? "kg");
  const kgVal = unit === "lb" ? kgRaw * 0.45359237 : kgRaw;
  if (!Number.isFinite(kgVal) || kgVal < 40 || kgVal > 400) redirect("/progress?error=weight");
  addWeight(u.userId, Math.round(kgVal * 10) / 10, String(formData.get("note") ?? "") || undefined);
  completeTask(u.userId, "weight");
  revalidatePath("/", "layout");
  redirect("/progress?logged=1");
}

/* ---------------------------------------------------------------- tasks / forms */
export async function completeTaskAction(formData: FormData) {
  const u = await requireUser();
  completeTask(u.userId, String(formData.get("taskId")));
  revalidatePath("/", "layout");
}

export async function submitFormAction(formData: FormData) {
  const u = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  if (slug === "intake") markQuestionnaireDone(u.userId);
  if (slug === "week-1-checkin") completeTask(u.userId, "week1");
  if (slug === "mid-programme-nps") completeTask(u.userId, "nps");
  if (slug === "monthly-pulse") completeTask(u.userId, "pulse");
  if (slug === "programme-nps") completeTask(u.userId, "nps");
  revalidatePath("/", "layout");
  redirect(`/forms/${slug}?done=1`);
}

/* ---------------------------------------------------------------- booking */
export async function bookAction(formData: FormData) {
  const u = await requireUser();
  const semble = getSemble();
  const appointmentTypeId = String(formData.get("appointmentTypeId"));
  const clinicianId = String(formData.get("clinicianId"));
  const startUtc = String(formData.get("startUtc"));
  const endUtc = String(formData.get("endUtc"));
  const programmeStepId = String(formData.get("programmeStepId") ?? "") || undefined;
  const patientNotes = String(formData.get("notes") ?? "") || undefined;
  const typeSlug = String(formData.get("typeSlug") ?? "");
  let bookedId: string;
  try {
    const a = await semble.book(u.semblePatientId, { appointmentTypeId, clinicianId, startUtc, endUtc, programmeStepId, patientNotes });
    bookedId = a.id;
    if (a.type.slug === "specialist-consultation") markConsultBooked(u.userId);
    if (programmeStepId === "coach-s2") completeTask(u.userId, "coach-s2");
    if (programmeStepId === "nurse-m2") completeTask(u.userId, "nurse");
    await rememberStage(u);
  } catch (e) {
    if (e instanceof SembleAdapterError && e.code === "unknown-outcome") redirect("/appointments?error=book-unknown");
    if (e instanceof SembleAdapterError) redirect(`/book/${typeSlug}?${new URLSearchParams({ ...(programmeStepId ? { step: programmeStepId } : {}), error: e.code === "slot-taken" ? "taken" : "unavailable" })}`);
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(`/appointments?booked=${bookedId}`);
}

export async function cancelAppointmentAction(formData: FormData) {
  const u = await requireUser();
  try {
    await getSemble().cancel(u.semblePatientId, String(formData.get("appointmentId")));
  } catch (e) {
    if (e instanceof SembleAdapterError) redirect(`/appointments?error=${e.code === "unknown-outcome" ? "cancel-unknown" : "cancel"}`);
    throw e;
  }
  revalidatePath("/", "layout");
  redirect("/appointments?cancelled=1");
}

export async function rescheduleAction(formData: FormData) {
  const u = await requireUser();
  const appointmentId = String(formData.get("appointmentId"));
  const typeSlug = String(formData.get("typeSlug") ?? "");
  let id: string;
  try {
    const a = await getSemble().reschedule(u.semblePatientId, {
      appointmentId,
      clinicianId: String(formData.get("clinicianId")),
      startUtc: String(formData.get("startUtc")),
      endUtc: String(formData.get("endUtc")),
    });
    id = a.id;
  } catch (e) {
    if (e instanceof SembleAdapterError && e.code === "unknown-outcome") redirect("/appointments?error=move-unknown");
    if (e instanceof SembleAdapterError) redirect(`/book/${typeSlug}?${new URLSearchParams({ reschedule: appointmentId, error: e.code === "slot-taken" ? "taken" : "unavailable" })}`);
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(`/appointments?rescheduled=${id}`);
}

/* ---------------------------------------------------------------- plans / billing (Stripe in production) */
export async function upgradeAction(formData: FormData) {
  const u = await requireUser();
  const plan = String(formData.get("plan")) === "ninety-day-upfront" ? "ninety-day-upfront" : "ninety-day-instalments";
  upgradeToNinetyDay(u.userId, plan);
  await rememberStage(u);
  revalidatePath("/", "layout");
  redirect("/?welcome=90day");
}

export async function continueAction(formData: FormData) {
  const u = await requireUser();
  const plan = String(formData.get("plan")) === "ongoing-150" ? "ongoing-150" : "ongoing-75";
  continueToOngoing(u.userId, plan);
  await rememberStage(u);
  revalidatePath("/", "layout");
  redirect("/?welcome=ongoing");
}

export async function payInstalmentAction() {
  const u = await requireUser();
  setPaymentResolved(u.userId);
  await rememberStage(u);
  revalidatePath("/", "layout");
  redirect("/?resumed=1");
}
