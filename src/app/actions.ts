"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, signIn, signInAs, signOut } from "@/lib/auth";
import { getSemble, SembleAdapterError } from "@/lib/semble";
import { addWeight, completeTask, continueToOngoing, logDose, markConsultBooked, markQuestionnaireDone, setPaymentResolved, upgradeToNinetyDay } from "@/lib/portal/store";
import type { InjectionSite, SideEffect } from "@/lib/portal/types";

/* ---------------------------------------------------------------- auth */
export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const u = await signIn(email);
  if (!u) redirect(`/login?error=unknown&email=${encodeURIComponent(email)}`);
  redirect("/");
}

export async function switchPersona(formData: FormData) {
  const id = String(formData.get("userId") ?? "");
  await signInAs(id);
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

/* ---------------------------------------------------------------- treatment */
export async function logDoseAction(formData: FormData) {
  const u = await requireUser();
  const site = String(formData.get("site") ?? "abdomen-left") as InjectionSite;
  const doseMg = Number(formData.get("doseMg"));
  const sideEffects = formData.getAll("sideEffects").map(String) as SideEffect[];
  logDose(u.userId, { doseMg, site, sideEffects, note: String(formData.get("note") ?? "") || undefined });
  revalidatePath("/", "layout");
  redirect("/treatment?logged=1");
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
  try {
    const a = await semble.book(u.semblePatientId, { appointmentTypeId, clinicianId, startUtc, endUtc, programmeStepId, patientNotes });
    if (typeSlug === "specialist-consultation") markConsultBooked(u.userId);
    if (programmeStepId === "coach-s2") completeTask(u.userId, "coach-s2");
    if (programmeStepId === "nurse-m2") completeTask(u.userId, "nurse");
    revalidatePath("/", "layout");
    redirect(`/appointments?booked=${a.id}`);
  } catch (e) {
    if (e instanceof SembleAdapterError && e.code === "slot-taken") redirect(`/book/${typeSlug}?error=taken`);
    throw e;
  }
}

export async function cancelAppointmentAction(formData: FormData) {
  const u = await requireUser();
  await getSemble().cancel(u.semblePatientId, String(formData.get("appointmentId")));
  revalidatePath("/", "layout");
  redirect("/appointments?cancelled=1");
}

export async function rescheduleAction(formData: FormData) {
  const u = await requireUser();
  const a = await getSemble().reschedule(u.semblePatientId, {
    appointmentId: String(formData.get("appointmentId")),
    clinicianId: String(formData.get("clinicianId")),
    startUtc: String(formData.get("startUtc")),
    endUtc: String(formData.get("endUtc")),
  });
  revalidatePath("/", "layout");
  redirect(`/appointments?rescheduled=${a.id}`);
}

/* ---------------------------------------------------------------- messages */
export async function sendMessageAction(formData: FormData) {
  const u = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  const channel = (String(formData.get("channel") ?? "clinical") === "admin" ? "admin" : "clinical") as "clinical" | "admin";
  if (body) await getSemble().sendMessage(u.semblePatientId, channel, body);
  revalidatePath("/care");
  redirect("/care?sent=1");
}

/* ---------------------------------------------------------------- plans / billing (Stripe in production) */
export async function upgradeAction(formData: FormData) {
  const u = await requireUser();
  const plan = String(formData.get("plan")) === "ninety-day-upfront" ? "ninety-day-upfront" : "ninety-day-instalments";
  upgradeToNinetyDay(u.userId, plan);
  revalidatePath("/", "layout");
  redirect("/?welcome=90day");
}

export async function continueAction(formData: FormData) {
  const u = await requireUser();
  const plan = String(formData.get("plan")) === "ongoing-150" ? "ongoing-150" : "ongoing-75";
  continueToOngoing(u.userId, plan);
  revalidatePath("/", "layout");
  redirect("/?welcome=ongoing");
}

export async function payInstalmentAction() {
  const u = await requireUser();
  setPaymentResolved(u.userId);
  revalidatePath("/", "layout");
  redirect("/?resumed=1");
}
