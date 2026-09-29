import "server-only";
import { getSemble, SembleAdapterError } from ".";
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
 *  3. otherwise a new Semble patient carrying the "BBMI ID" — only for someone
 *     who has bought something (create: true). A sign-up that never paid gets
 *     no clinical record; the portal runs without one ("").
 * Two Semble records sharing the email is also a conflict (never guessed).
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
  var __sembleUnlinked: Map<string, number> | undefined;
}
const links = () => (globalThis.__sembleLinks ??= new Map());
const linking = () => (globalThis.__sembleLinking ??= new Map());
/** "No record, and not ours to create" is remembered briefly, so unpaid visitors don't search Semble on every page. */
const unlinked = () => (globalThis.__sembleUnlinked ??= new Map());
const UNLINKED_TTL_MS = 2 * 60_000;

type Who = { bbmiId: string; email: string; firstName: string; lastName: string; dob?: string; phone?: string; gender?: string; address?: string; create: boolean };

async function link(p: Who): Promise<string> {
  const semble = getSemble();
  const byId = await semble.findPatientByNumber(BBMI_ID_NUMBER, p.bbmiId);
  if (byId) return byId.id;

  const byEmail: PatientProfile | null = await semble.findPatientByEmail(p.email).catch((e) => {
    if (e instanceof SembleAdapterError && e.code === "duplicate") {
      if (!p.create) return null; // someone who hasn't bought needs no record: don't lock them out over it
      throw new SembleLinkConflict();
    }
    throw e;
  });
  if (byEmail) {
    const existing = byEmail.numbers?.[BBMI_ID_NUMBER];
    if (existing && existing !== p.bbmiId) {
      if (!p.create) return "";
      throw new SembleLinkConflict();
    }
    if (!existing) await semble.setPatientNumber(byEmail.id, BBMI_ID_NUMBER, p.bbmiId);
    return byEmail.id;
  }

  if (!p.create) return "";
  await semble.createPatient({ firstName: p.firstName, lastName: p.lastName, email: p.email, dob: p.dob, phone: p.phone, gender: p.gender, address: p.address, numbers: { [BBMI_ID_NUMBER]: p.bbmiId } });
  // Another server may have created one at the same moment: re-read and settle on the oldest.
  const settled = await semble.findPatientByNumber(BBMI_ID_NUMBER, p.bbmiId);
  if (!settled) throw new Error("Semble patient was created but cannot be found by its BBMI ID");
  // A brand-new record has no weights yet: start its weight log empty so everything the backend holds is copied.
  await semble.syncWeights(settled.id, []).catch(() => undefined);
  return settled.id;
}

export async function linkSemblePatient(p: Who): Promise<string> {
  const known = links().get(p.bbmiId);
  if (known) return known;
  if (!p.create && Date.now() - (unlinked().get(p.bbmiId) ?? 0) < UNLINKED_TTL_MS) return "";
  let pending = linking().get(p.bbmiId);
  if (!pending) {
    pending = link(p)
      .then((id) => {
        if (id) links().set(p.bbmiId, id);
        else unlinked().set(p.bbmiId, Date.now()); // re-checked soon, and at once when they buy (create: true)
        return id;
      })
      .finally(() => linking().delete(p.bbmiId));
    linking().set(p.bbmiId, pending);
  }
  return pending;
}
