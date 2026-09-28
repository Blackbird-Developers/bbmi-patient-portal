"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSemble, SembleAdapterError } from "@/lib/semble";
import { accessToken, invalidatePatient, requireUser } from "@/lib/auth";
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
    await getSemble().updatePatientContact(u.semblePatientId, { phone, address });
    if (u.backend && address.line1 && address.city && address.postcode) {
      // Beyond BMI keeps its own copy (prescription delivery, the pre-consult checklist).
      const token = await accessToken();
      if (token) await addAddress(token, { addressLine1: address.line1, ...(address.line2 ? { addressLine2: address.line2 } : {}), city: address.city, state: address.county || address.city, postalCode: address.postcode, country: "Ireland" }).catch(() => undefined);
      invalidatePatient(u.userId);
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
