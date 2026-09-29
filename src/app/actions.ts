"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accessToken, authMode, invalidatePatient, refreshAfterPurchase, rememberStage, requireUser, signIn, signInAs, signInCognito, signOut, switchStage } from "@/lib/auth";
import { getSemble, SembleAdapterError } from "@/lib/semble";
import * as bbmiApi from "@/lib/bbmi/api";
import { BbmiError } from "@/lib/bbmi/client";
import { loadJourney } from "@/lib/portal/journey";
import { bookingGate } from "@/lib/portal/gates";
import { ensureIntakeInSemble } from "@/lib/bbmi/intake-sync";
import { addWeight, completeTask, continueToOngoing, markConsultBooked, markQuestionnaireDone, setPaymentResolved, upgradeToNinetyDay } from "@/lib/portal/store";

/* ---------------------------------------------------------------- auth */
export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (authMode() === "cognito") {
    const r = await signInCognito(email, String(formData.get("password") ?? ""));
    if (r.ok) redirect("/");
    if (r.code === "new-password") redirect("/set-password");
    // The typed email is never put in the URL.
    redirect(`/login?error=${r.code}`);
  }
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
  if (u.backend) {
    // Stored by the Beyond BMI backend (always kg; it re-checks 40–400 kg). Weights have no note field there.
    const token = await accessToken();
    if (!token) redirect("/login");
    try {
      await bbmiApi.addWeight(token, Math.round(kgVal * 10) / 10);
    } catch (e) {
      if (e instanceof BbmiError) redirect(`/progress?error=${e.code === "invalid" ? "weight" : "save"}`);
      throw e;
    }
    invalidatePatient(u.userId);
    revalidatePath("/", "layout");
    redirect("/progress?logged=1");
  }
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
  if (u.backend) {
    // The Beyond BMI booking rules, enforced here because Semble won't (see lib/portal/gates.ts) — the same checks
    // the booking page shows, run against the effective stage, so a replayed request can't get past them.
    const [j, types] = await Promise.all([loadJourney(u), semble.listAppointmentTypes()]);
    const type = types.find((t) => t.id === appointmentTypeId);
    const back = `/book/${typeSlug}${programmeStepId ? `?step=${programmeStepId}` : ""}`;
    if (!type || type.slug !== typeSlug || !j.can.book) redirect(back);
    if (!bookingGate(u, { state: j.state, upcoming: j.upcoming, programme: j.programme }, type, { programmeStepId, startUtc }).ok) redirect(back);
    // The doctor should see the questionnaire in Semble before the appointment: make sure it has been copied.
    const token = await accessToken();
    if (token) await ensureIntakeInSemble({ bbmiId: u.userId, semblePatientId: u.semblePatientId }, token, { force: true });
  }
  let bookedId: string;
  try {
    const a = await semble.book(u.semblePatientId, { appointmentTypeId, clinicianId, startUtc, endUtc, programmeStepId, patientNotes });
    bookedId = a.id;
    if (u.backend) invalidatePatient(u.userId);
    else {
      if (a.type.slug === "specialist-consultation") markConsultBooked(u.userId);
      if (programmeStepId === "coach-s2") completeTask(u.userId, "coach-s2");
      if (programmeStepId === "nurse-m2") completeTask(u.userId, "nurse");
      await rememberStage(u);
    }
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
  if (u.backend) {
    const j = await loadJourney(u);
    const own = j.upcoming.find((a) => a.id === appointmentId);
    if (!own || !bookingGate(u, { state: j.state, upcoming: j.upcoming, programme: j.programme }, own.type, { rescheduleId: appointmentId }).ok) redirect("/appointments?error=move");
  }
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

/* ---------------------------------------------------------------- plans / billing (Stripe) */

/** Update card, invoices and cancellation live in Stripe's Billing Portal (Beyond BMI mode). */
export async function billingPortalAction() {
  const token = await accessToken();
  if (!token) redirect("/login");
  let url: string;
  try {
    url = await bbmiApi.createBillingPortalSession(token);
  } catch (e) {
    if (e instanceof BbmiError) redirect("/account/billing?error=portal");
    throw e;
  }
  redirect(url);
}
/** Beyond BMI mode: hosted Stripe Checkout (or the Billing Portal) from the backend; activation arrives by webhook. */
async function tierCheckout(tier: "e89" | "ninety_450" | "ninety_399" | "ongoing_150" | "ongoing_75"): Promise<never> {
  const token = await accessToken();
  if (!token) redirect("/login");
  let url: string | undefined;
  try {
    const r = await bbmiApi.createTierCheckout(token, tier);
    if (r.comp) {
      await refreshAfterPurchase();
      redirect("/?welcome=1");
    }
    url = r.url;
  } catch (e) {
    if (e instanceof BbmiError) redirect(`/plans?error=${e.code === "conflict" ? "not-available" : "checkout"}`);
    throw e;
  }
  if (!url) redirect("/plans?error=checkout");
  redirect(url);
}

/** No plan yet (stage "none"): the €89 specialist consultation, through the backend's checkout. */
export async function consultCheckoutAction() {
  const u = await requireUser();
  if (!u.backend) redirect("/plans");
  await tierCheckout("e89");
}

export async function upgradeAction(formData: FormData) {
  const u = await requireUser();
  if (u.backend) await tierCheckout(String(formData.get("plan")) === "ninety-day-upfront" ? "ninety_399" : "ninety_450");
  const plan = String(formData.get("plan")) === "ninety-day-upfront" ? "ninety-day-upfront" : "ninety-day-instalments";
  upgradeToNinetyDay(u.userId, plan);
  await rememberStage(u);
  revalidatePath("/", "layout");
  redirect("/?welcome=90day");
}

export async function continueAction(formData: FormData) {
  const u = await requireUser();
  if (u.backend) await tierCheckout(String(formData.get("plan")) === "ongoing-150" ? "ongoing_150" : "ongoing_75");
  const plan = String(formData.get("plan")) === "ongoing-150" ? "ongoing-150" : "ongoing-75";
  continueToOngoing(u.userId, plan);
  await rememberStage(u);
  revalidatePath("/", "layout");
  redirect("/?welcome=ongoing");
}

export async function payInstalmentAction() {
  const u = await requireUser();
  if (u.backend) {
    // Pay THE open invoice (never a new checkout, which would bill twice); no invoice link = ask the care team.
    const url = u.backend.billingIssue?.payUrl;
    invalidatePatient(u.userId);
    redirect(url ?? "/care?billing=1");
  }
  setPaymentResolved(u.userId);
  await rememberStage(u);
  revalidatePath("/", "layout");
  redirect("/?resumed=1");
}
