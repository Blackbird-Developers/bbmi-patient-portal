"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSemble, SembleAdapterError } from "@/lib/semble";
import { accessToken, changePassword, invalidatePatient, requireUser, signOutEverywhere } from "@/lib/auth";
import { addAddress } from "@/lib/bbmi/api";

export async function updateContactAction(formData: FormData) {
  const u = await requireUser();
  const phone = String(formData.get("phone") ?? "").trim() || undefined;
  const address = {
    line1: String(formData.get("line1") ?? "").trim() || undefined,
    line2: String(formData.get("line2") ?? "").trim() || undefined,
    city: String(formData.get("city") ?? "").trim() || undefined,
    county: String(formData.get("county") ?? "").trim() || undefined,
    postcode: String(formData.get("postcode") ?? "").trim() || undefined,
    country: "Ireland",
  };
  try {
    if (u.semblePatientId) await getSemble().updatePatientContact(u.semblePatientId, { phone, address });
    if (u.backend && address.line1 && address.city && address.postcode) {
      // Beyond BMI keeps its own copy (prescription delivery, the pre-consult checklist). It can only ADD addresses
      // (at most 6, then 409), so only send one that differs from what it already has.
      const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
      const current = norm(u.backend.address ?? "");
      const same = current && current.includes(norm(address.line1)) && current.includes(norm(address.postcode));
      if (!same) {
        const token = await accessToken();
        const saved = token ? await addAddress(token, { addressLine1: address.line1, ...(address.line2 ? { addressLine2: address.line2 } : {}), city: address.city, state: address.county || address.city, postalCode: address.postcode, country: "Ireland" }).then(() => true, () => false) : false;
        invalidatePatient(u.userId);
        if (!saved) redirect("/account?error=delivery-address");
      }
    }
  } catch (e) {
    if (e instanceof SembleAdapterError) redirect(`/account?error=${e.code === "partial" ? "contact-partial" : "contact"}`);
    throw e;
  }
  revalidatePath("/account");
  redirect("/account?saved=1");
}

export async function updatePreferencesAction(formData: FormData) {
  const u = await requireUser();
  if (!u.semblePatientId) redirect("/account?error=prefs");
  try {
    await getSemble().updatePatientContact(u.semblePatientId, {
      communicationPreferences: {
        receiveEmail: formData.get("receiveEmail") === "on",
        receiveSMS: formData.get("receiveSMS") === "on",
        promotionalMarketing: formData.get("promotionalMarketing") === "on",
      },
    });
  } catch (e) {
    if (e instanceof SembleAdapterError) redirect("/account?error=prefs");
    throw e;
  }
  revalidatePath("/account");
  redirect("/account?saved=prefs");
}

export async function changePasswordAction(formData: FormData) {
  await requireUser();
  const next = String(formData.get("password") ?? "");
  if (next !== String(formData.get("confirm") ?? "")) redirect("/account/password?error=mismatch");
  const r = await changePassword(String(formData.get("current") ?? ""), next);
  if (!r.ok) redirect(`/account/password?error=${r.code}`);
  redirect("/account?saved=password");
}

export async function signOutEverywhereAction() {
  await signOutEverywhere();
  redirect("/login");
}
