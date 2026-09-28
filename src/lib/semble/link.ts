import "server-only";
import { getSemble } from ".";
import type { PatientProfile } from "./types";

/**
 * Finds — or creates — the Semble patient for a Beyond BMI patient.
 *
 * The key is the Beyond BMI patient id (= Cognito sub) stored on the Semble
 * record as the custom patient number "BBMI ID" (Semble's migration keeps the
 * same field for every migrated patient, and patient search matches it).
 *  1. exact "BBMI ID" match;
 *  2. otherwise an exact email match, which then gets the "BBMI ID" attached;
 *  3. otherwise a new Semble patient carrying the "BBMI ID".
 * Two matches at either step is a duplicate and is refused rather than guessed.
 */
export const BBMI_ID_NUMBER = "BBMI ID";

declare global {
  var __sembleLinks: Map<string, string> | undefined;
}
const links = () => (globalThis.__sembleLinks ??= new Map());

export async function linkSemblePatient(p: { bbmiId: string; email: string; firstName: string; lastName: string; dob?: string; phone?: string; gender?: string }): Promise<string> {
  const known = links().get(p.bbmiId);
  if (known) return known;
  const semble = getSemble();
  let found: PatientProfile | null = await semble.findPatientByNumber(BBMI_ID_NUMBER, p.bbmiId);
  if (!found) {
    found = await semble.findPatientByEmail(p.email);
    if (found) await semble.setPatientNumber(found.id, BBMI_ID_NUMBER, p.bbmiId);
  }
  if (!found) {
    found = await semble.createPatient({ firstName: p.firstName, lastName: p.lastName, email: p.email, dob: p.dob, phone: p.phone, gender: p.gender, numbers: { [BBMI_ID_NUMBER]: p.bbmiId } });
  }
  links().set(p.bbmiId, found.id);
  return found.id;
}
