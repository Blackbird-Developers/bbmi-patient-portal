"use server";

import { redirect } from "next/navigation";
import { completeChallenge } from "@/lib/auth";
import { confirmEmail, finishPasswordReset, resendVerification, startPasswordReset } from "@/lib/cognito";

/** Cognito puts the email in links unencoded, so a "+" arrives as a space. */
const emailFrom = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/ /g, "+").toLowerCase();

export async function requestResetAction(formData: FormData) {
  const email = emailFrom(formData.get("email"));
  const r = await startPasswordReset(email);
  if (r.tooMany) redirect("/forgot-password?error=too-many");
  redirect(`/reset-password?sent=1`);
}

export async function finishResetAction(formData: FormData) {
  const email = emailFrom(formData.get("email"));
  const r = await finishPasswordReset(email, String(formData.get("code") ?? ""), String(formData.get("password") ?? ""));
  if (!r.ok) redirect(`/reset-password?error=${encodeURIComponent(r.message)}`);
  redirect("/login?reset=1");
}

export async function setPasswordAction(formData: FormData) {
  const r = await completeChallenge(String(formData.get("password") ?? ""));
  if (r.ok) redirect("/");
  if (r.code === "not-ready") redirect("/login?error=not-ready");
  redirect(`/set-password?error=${encodeURIComponent(r.code === "unavailable" ? "Your sign-in timed out. Sign in again." : "Use at least 8 characters with upper and lower case letters, a number and a symbol.")}`);
}

export async function verifyEmailAction(formData: FormData) {
  const email = emailFrom(formData.get("email"));
  const r = await confirmEmail(email, String(formData.get("code") ?? ""));
  if (!r.ok) redirect(`/verify?error=${encodeURIComponent(r.message)}`);
  redirect("/login?verified=1");
}

export async function resendVerificationAction(formData: FormData) {
  await resendVerification(emailFrom(formData.get("email")));
  redirect("/verify?resent=1");
}
