import "server-only";
import { createHash } from "node:crypto";
import { getSemble } from "../semble";
import type { IntakeSubmission } from "../semble/types";
import { getHealthRecords, type HealthRecordSection } from "./api";

/**
 * Copies the patient's health questionnaire (answered in Beyond BMI's Tally
 * form, stored by the backend) into their Semble record, where clinicians work.
 *
 * Semble's API can't write Vitals, Problems or Medical history, so the answers
 * become one "Health questionnaire (Beyond BMI)" consultation of question/answer
 * records, and allergies also become structured allergy records. Height and
 * weight are in the answers; Semble's Vitals panel stays empty until Semble
 * offers an API for it (or a Semble questionnaire is built — see docs/SEMBLE.md).
 */

const TITLE = "Health questionnaire (Beyond BMI)";
/** Free-text answers patients use for "nothing to report" ("0" included — the allergy box is free text). */
const NONE = /^\s*(0|zero|no|nope|none|nothing|nil|n\/?a|nka|nkda|none known|not that i know( of)?|no (known )?(drug )?allergies|not applicable|-+)\s*\.?\s*$/i;
/** An allergen must read like one: real words, not a number or a symbol. */
const isAllergen = (x: string) => !NONE.test(x) && !/^\s*(yes|yeah|yep|y|true|1)\s*\.?\s*$/i.test(x) && /[a-z]{3,}/i.test(x);

export function intakeFrom(sections: HealthRecordSection[]): IntakeSubmission | null {
  const out: IntakeSubmission["sections"] = [];
  const allergies: string[] = [];
  for (const s of sections) {
    const items: { question: string; answer: string }[] = [];
    for (const q of s.questions) {
      const values = q.answer.map((a) => (a.value ?? "").toString().trim()).filter(Boolean);
      if (!values.length || !q.text || /patient[_ ]?id/i.test(q.text)) continue;
      const answer = values.join(", ");
      items.push({ question: q.text.trim(), answer });
      if (/allerg/i.test(q.text) && !NONE.test(answer)) {
        for (const a of answer.split(/[,;\n]| and /i).map((x) => x.trim()).filter(isAllergen)) allergies.push(a);
      }
    }
    if (items.length) out.push({ title: s.sectionName && s.sectionName !== "Airway" ? s.sectionName : TITLE, items });
  }
  if (!out.length) return null;
  const fingerprint = createHash("sha256").update(JSON.stringify(out)).digest("base64url").slice(0, 32);
  return { fingerprint, title: TITLE, sections: out, allergies: [...new Set(allergies)] };
}

declare global {
  var __intakeSyncing: Map<string, Promise<void>> | undefined;
  var __intakeSyncedAt: Map<string, number> | undefined;
}
const syncing = () => (globalThis.__intakeSyncing ??= new Map());
const syncedAt = () => (globalThis.__intakeSyncedAt ??= new Map());

/** Idempotent (Semble keeps the fingerprint); one run per patient at a time; re-checks at most every 10 minutes. */
export function ensureIntakeInSemble(p: { bbmiId: string; semblePatientId: string }, accessToken: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && Date.now() - (syncedAt().get(p.bbmiId) ?? 0) < 10 * 60_000) return Promise.resolve();
  let run = syncing().get(p.bbmiId);
  if (!run) {
    run = (async () => {
      const intake = intakeFrom(await getHealthRecords(accessToken));
      if (intake) {
        const r = await getSemble().recordIntake(p.semblePatientId, intake);
        if (r.written) console.info(`Semble: questionnaire copied to patient ${p.semblePatientId}`);
      }
      syncedAt().set(p.bbmiId, Date.now());
    })()
      .catch((e) => console.error(`Semble: questionnaire copy failed for ${p.semblePatientId}:`, e instanceof Error ? e.message : e))
      .finally(() => syncing().delete(p.bbmiId));
    syncing().set(p.bbmiId, run);
  }
  return run;
}
