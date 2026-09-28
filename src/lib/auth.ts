import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSemble, sembleMode } from "./semble";
import { hasRole, type ClinicianRole } from "./semble/types";
import { getPortalPatient, findUserByEmail, linkSemblePatient, LINKABLE_STAGES } from "./portal/store";
import type { MemberState, PortalPatient } from "./portal/types";

/**
 * Session — prototype implementation.
 *
 * Production plan: the portal OWNS identity (Semble has no patient auth).
 * Existing patients keep their Cognito identity (10k users, eu-west-1);
 * the session is an opaque server-side id in an httpOnly cookie with
 * rotation + sliding expiry; the Semble patient id lives in a durable
 * mapping table keyed by Cognito sub.
 *
 * Here the cookie holds the portal user id, HMAC-signed so it cannot be
 * forged. There is still no password check: in Semble mode sign-in is
 * limited to the emails in PORTAL_ALLOWED_EMAILS.
 */
const COOKIE = "bbmi_session";
const STAGE_COOKIE = "bbmi_stage";
const MAX_AGE = 60 * 60 * 24 * 7;
const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE } as const;

function secret(): string {
  const s = process.env.PORTAL_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (sembleMode() === "graphql") throw new Error("PORTAL_SESSION_SECRET (16+ characters) is required when SEMBLE_ADAPTER=graphql");
  return "demo-only-session-secret";
}
const sig = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");
const seal = (v: string) => `${v}.${sig(v)}`;
function unseal(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const v = token.slice(0, i);
  const a = Buffer.from(token.slice(i + 1));
  const b = Buffer.from(sig(v));
  return a.length === b.length && timingSafeEqual(a, b) ? v : null;
}

/** Semble mode only: who may sign in while there is no real authentication. */
export function allowedEmails(): string[] {
  return (process.env.PORTAL_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
const isAllowed = (email: string) => allowedEmails().includes(email.trim().toLowerCase());

const DEFAULT_STAGE: MemberState = "consult_paid";
const asStage = (v: string | undefined): MemberState => (LINKABLE_STAGES.includes(v as MemberState) ? (v as MemberState) : DEFAULT_STAGE);

/** The clinician Semble has for each role — the patient's care team in Semble mode. */
async function careTeamFromSemble(): Promise<PortalPatient["careTeam"]> {
  const clinicians = await getSemble().listClinicians();
  const team: PortalPatient["careTeam"] = {};
  for (const role of ["doctor", "nurse", "dietitian", "health-coach"] as ClinicianRole[]) {
    const c = clinicians.find((x) => hasRole(x, role));
    if (c) team[role] = c.id;
  }
  return team;
}

async function linkBySembleId(semblePatientId: string, stage: MemberState): Promise<PortalPatient | null> {
  const profile = await getSemble().getPatient(semblePatientId).catch(() => null);
  if (!profile || !isAllowed(profile.email)) return null;
  return linkSemblePatient(profile, stage, await careTeamFromSemble());
}

export async function currentUser(): Promise<PortalPatient | null> {
  const jar = await cookies();
  const userId = unseal(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const u = getPortalPatient(userId);
  if (u) return u;
  // The in-memory store is empty after a restart: re-link the Semble patient the signed cookie names.
  if (sembleMode() === "graphql" && userId.startsWith("semble:")) return linkBySembleId(userId.slice("semble:".length), asStage(jar.get(STAGE_COOKIE)?.value));
  return null;
}

export async function requireUser(): Promise<PortalPatient> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

async function startSession(u: PortalPatient) {
  const jar = await cookies();
  jar.set(COOKIE, seal(u.userId), COOKIE_OPTS);
  jar.set(STAGE_COOKIE, u.membership.state, COOKIE_OPTS);
  return u;
}

export async function signIn(email: string): Promise<PortalPatient | null> {
  if (sembleMode() === "mock") {
    const u = findUserByEmail(email);
    return u ? startSession(u) : null;
  }
  if (!isAllowed(email)) return null;
  const profile = await getSemble().findPatientByEmail(email);
  if (!profile) return null;
  return startSession(linkSemblePatient(profile, DEFAULT_STAGE, await careTeamFromSemble()));
}

export async function signInAs(userId: string) {
  if (sembleMode() !== "mock") return null;
  const u = getPortalPatient(userId);
  return u ? startSession(u) : null;
}

/** Semble mode: show the signed-in Semble patient at another journey stage. */
export async function switchStage(stage: string) {
  const u = await currentUser();
  if (!u || sembleMode() !== "graphql" || !u.userId.startsWith("semble:")) return null;
  const next = await linkBySembleId(u.semblePatientId, asStage(stage));
  return next ? startSession(next) : null;
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(STAGE_COOKIE);
}
