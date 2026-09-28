"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSemble, SembleAdapterError } from "@/lib/semble";

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
