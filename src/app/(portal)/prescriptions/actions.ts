"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSemble, SembleAdapterError } from "@/lib/semble";
import { sendPrescriptionToPharmacy } from "@/lib/pharmacy/send";

/** Saves the pharmacy the patient picked (a directory pharmacy only) on their Semble record. */
export async function choosePharmacyAction(formData: FormData) {
  const u = await requireUser();
  if (!u.backend || !u.semblePatientId) redirect("/prescriptions");
  const semble = getSemble();
  const pharmacy = await semble.getPharmacy(String(formData.get("pharmacyId") ?? "")).catch(() => null);
  if (!pharmacy) redirect("/prescriptions?pharmacy=invalid#pharmacy");
  try {
    await semble.setPatientPharmacy(u.semblePatientId, pharmacy);
  } catch (e) {
    if (e instanceof SembleAdapterError) {
      console.error("Could not save the chosen pharmacy:", e.message, e.cause instanceof Error ? e.cause.message : "");
      redirect("/prescriptions?pharmacy=error#pharmacy");
    }
    throw e;
  }
  revalidatePath("/prescriptions");
  redirect("/prescriptions?pharmacy=saved");
}

/** Emails one prescription to the chosen pharmacy — at most once (see lib/pharmacy/send.ts). */
export async function sendToPharmacyAction(formData: FormData) {
  const u = await requireUser();
  if (!u.backend || !u.semblePatientId) redirect("/prescriptions");
  // The button names a pharmacy: if the patient changed it elsewhere since, nothing is sent.
  const outcome = await sendPrescriptionToPharmacy(u, String(formData.get("prescriptionId") ?? ""), String(formData.get("pharmacyId") ?? "")).catch((e) => {
    console.error("Send to pharmacy failed", e instanceof Error ? e.message : e);
    return { ok: false as const, code: "unavailable" as const };
  });
  revalidatePath("/prescriptions");
  redirect(outcome.ok ? `/prescriptions?sent=${outcome.via}` : `/prescriptions?send=${outcome.code}`);
}
