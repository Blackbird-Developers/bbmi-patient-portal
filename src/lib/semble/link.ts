import "server-only";
import { getSemble } from ".";
import type { PatientProfile } from "./types";

/**
 * Finds — or creates — the Semble patient for a Beyond BMI patient.
 *
 * The key is the Beyond BMI patient id (= Cognito sub) stored on the Semble
 * record as the custom patient number "BBMI ID" (Semble's migration keeps the
 * same field for every migrated patient, and patient search matches it).
 *  1. exact "BBMI ID" match (duplicates resolve to the oldest record);
 *  2. otherwise the single exact email match — but only if it carries no
 *     BBMI ID yet. A record already tied to another patient is never taken
 *     over: that is a conflict for the care team;
 *  3. otherwise a new Semble patient carrying the "BBMI ID".
 * Links are made once per patient at a time (the layout and page render
 * together), and a new record is re-read so all servers converge on one.
 */
export const BBMI_ID_NUMBER = "BBMI ID";

export class SembleLinkConflict extends Error {
  constructor() {
    super("The clinic record with this email belongs to another patient id");
    this.name = "SembleLinkConflict";
  }
}

declare global {
  var __sembleLinks: Map<string, string> | undefined;
  var __sembleLinking: Map<string, Promise<string>> | undefined;
}
const links = () => (globalThis.__sembleLinks ??= new Map());
const linking = () => (globalThis.__sembleLinking ??= new Map());

type Who = { bbmiId: string; email: string; firstName: string; lastName: string; dob?: string; phone?: string; gender?: string };

async function link(p: Who): Promise<string> {
  const semble = getSemble();
  const byId = await semble.findPatientByNumber(BBMI_ID_NUMBER, p.bbmiId);
  if (byId) return byId.id;

  const byEmail: PatientProfile | null = await semble.findPatientByEmail(p.email);
  if (byEmail) {
    const existing = byEmail.numbers?.[BBMI_ID_NUMBER];
    if (existing && existing !== p.bbmiId) throw new SembleLinkConflict();
    if (!existing) await semble.setPatientNumber(byEmail.id, BBMI_ID_NUMBER, p.bbmiId);
    return byEmail.id;
  }

  await semble.createPatient({ firstName: p.firstName, lastName: p.lastName, email: p.email, dob: p.dob, phone: p.phone, gender: p.gender, numbers: { [BBMI_ID_NUMBER]: p.bbmiId } });
  // Another server may have created one at the same moment: re-read and settle on the oldest.
  const settled = await semble.findPatientByNumber(BBMI_ID_NUMBER, p.bbmiId);
  if (!settled) throw new Error("Semble patient was created but cannot be found by its BBMI ID");
  return settled.id;
}

export async function linkSemblePatient(p: Who): Promise<string> {
  const known = links().get(p.bbmiId);
  if (known) return known;
  let pending = linking().get(p.bbmiId);
  if (!pending) {
    pending = link(p)
      .then((id) => {
        links().set(p.bbmiId, id);
        return id;
      })
      .finally(() => linking().delete(p.bbmiId));
    linking().set(p.bbmiId, pending);
  }
  return pending;
}
