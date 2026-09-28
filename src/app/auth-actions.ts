"use server";

import { redirect } from "next/navigation";
import { completeChallenge } from "@/lib/auth";
import { confirmEmail, finishPasswordReset, resendVerification, startPasswordReset } from "@/lib/cognito";

/** Cognito puts the email in links unencoded, so a "+" arrives as a space. */
const emailFrom = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/ /g, "+").toLowerCase();
/** Errors travel as short codes; each page maps them to fixed text (never echo text from the URL). */
const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

export async function requestResetAction(formData: FormData) {
  const email = emailFrom(formData.get("email"));
  const r = await startPasswordReset(email);
  if (r.tooMany) redirect("/forgot-password?error=too-many");
  redirect(`/reset-password?${q({ sent: "1", email })}`);
}

export async function finishResetAction(formData: FormData) {
  const email = emailFrom(formData.get("email"));
  const code = String(formData.get("code") ?? "").trim();
  const r = await finishPasswordReset(email, code, String(formData.get("password") ?? ""));
  if (!r.ok) redirect(`/reset-password?${q({ error: r.code, email, ...(r.code === "weak-password" || r.code === "too-many" || r.code === "unavailable" ? { code } : {}) })}`);
  redirect("/login?reset=1");
}

export async function setPasswordAction(formData: FormData) {
  const r = await completeChallenge(String(formData.get("password") ?? ""));
  if (r.ok) redirect("/");
  if (r.code === "not-ready") redirect("/login?error=not-ready");
  if (r.code === "weak-password") redirect("/set-password?error=weak-password");
  redirect("/login?error=expired");
}

export async function verifyEmailAction(formData: FormData) {
  const email = emailFrom(formData.get("email"));
  const code = String(formData.get("code") ?? "").trim();
  const r = await confirmEmail(email, code);
  if (!r.ok) redirect(`/verify?${q({ error: r.code, email })}`);
  redirect("/login?verified=1");
}

export async function resendVerificationAction(formData: FormData) {
  const email = emailFrom(formData.get("email"));
  if (email) await resendVerification(email);
  redirect(`/verify?${q({ resent: "1", email })}`);
}
