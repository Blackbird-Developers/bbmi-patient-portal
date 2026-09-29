import "server-only";
import { getSemble } from "../semble";
import type { WeightEntry } from "../portal/types";

/**
 * Mirrors the weights Beyond BMI's backend holds into the patient's Semble record, where
 * clinicians work. Semble's API can't write the Vitals panel, so each weight becomes a line
 * in one "Weight log (Beyond BMI)" consultation. Semble keeps the bookkeeping, so a
 * restart or another server carries on where the last copy stopped. Two servers syncing
 * the same patient in the same second could still both copy a new weight (Semble has no
 * compare-and-set); one server per patient at a time is enforced here.
 */

declare global {
  var __weightSyncing: Map<string, Promise<void>> | undefined;
  var __weightSynced: Map<string, string> | undefined;
}
const syncing = () => (globalThis.__weightSyncing ??= new Map());
const synced = () => (globalThis.__weightSynced ??= new Map());

/** Cheap when nothing changed: Semble is only asked when the newest weight differs from the last one copied here. */
export function ensureWeightsInSemble(semblePatientId: string, weights: WeightEntry[]): Promise<void> {
  const newest = weights.length ? weights.map((w) => `${w.createdUtc ?? w.dateUtc}|${w.id}`).sort().at(-1)! : "none";
  if (synced().get(semblePatientId) === newest) return Promise.resolve();
  let run = syncing().get(semblePatientId);
  if (!run) {
    run = getSemble()
      .syncWeights(semblePatientId, weights.map((w) => ({ id: w.id, dateUtc: w.dateUtc, createdUtc: w.createdUtc, kg: w.kg, source: w.source === "clinician" ? "clinician" : "patient" })))
      .then((r) => {
        if (r.written) console.info(`Semble: ${r.written} weight(s) copied to patient ${semblePatientId}`);
        synced().set(semblePatientId, newest);
      })
      .catch((e) => console.error(`Semble: weight copy failed for ${semblePatientId}:`, e instanceof Error ? e.message : e))
      .finally(() => syncing().delete(semblePatientId));
    syncing().set(semblePatientId, run);
  }
  return run;
}
