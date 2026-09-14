"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/**
 * Non-scale win. Demo: acknowledged, not persisted. In production this writes
 * a portal-owned row (never a Semble clinical note) that the dietitian sees
 * before the next appointment.
 */
export async function recordWinAction(formData: FormData) {
  await requireUser();
  const typed = String(formData.get("win") ?? "").trim();
  const quick = String(formData.get("quick") ?? "").trim();
  const text = (typed || quick).slice(0, 140);
  if (!text) redirect("/progress?error=win#wins");
  redirect("/progress?win=1#wins");
}
