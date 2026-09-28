import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSemble, sembleMode, SembleAdapterError } from "./semble";
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
 * Here the cookie holds the portal user id and an expiry, HMAC-signed together
 * with the mode so it cannot be forged or carried between mock and Semble
 * mode. There is still no password check: in Semble mode sign-in is limited
 * to the emails in PORTAL_ALLOWED_EMAILS, and the adapter refuses production.
 */
const COOKIE = "bbmi_session";
const STAGE_COOKIE = "bbmi_stage";
const MAX_AGE_S = 60 * 60 * 24 * 7;
const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE_S } as const;
const PLACEHOLDER_SECRETS = new Set(["change-me-in-real-deployments", "demo-only-session-secret"]);

function secret(): string {
  const s = process.env.PORTAL_SESSION_SECRET ?? "";
  if (sembleMode() === "graphql") {
    if (s.length < 32 || PLACEHOLDER_SECRETS.has(s)) throw new Error("PORTAL_SESSION_SECRET must be a random value of 32+ characters when SEMBLE_ADAPTER=graphql (e.g. `openssl rand -hex 32`)");
    return s;
  }
  return s.length >= 16 ? s : "demo-only-session-secret";
}
const sig = (v: string) => createHmac("sha256", secret()).update(`${sembleMode()}|${v}`).digest("base64url");
const seal = (userId: string) => {
  const v = `${userId}|${Date.now() + MAX_AGE_S * 1000}`;
  return `${v}.${sig(v)}`;
};
function unseal(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const v = token.slice(0, i);
  const a = Buffer.from(token.slice(i + 1));
  const b = Buffer.from(sig(v));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const j = v.lastIndexOf("|");
  if (j <= 0 || !(Number(v.slice(j + 1)) > Date.now())) return null; // expired
  return v.slice(0, j);
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
const asStage = (v: string | undefined): MemberState => (v === "consult_booked" || LINKABLE_STAGES.includes(v as MemberState) ? (v as MemberState) : DEFAULT_STAGE);

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
  let profile;
  try {
    profile = await getSemble().getPatient(semblePatientId);
  } catch (e) {
    if (e instanceof SembleAdapterError && e.code === "not-found") return null; // the patient no longer exists: sign out
    throw e; // Semble trouble is not a reason to sign the patient out
  }
  if (!isAllowed(profile.email)) return null;
  return linkSemblePatient(profile, stage, await careTeamFromSemble());
}

export async function currentUser(): Promise<PortalPatient | null> {
  const jar = await cookies();
  const userId = unseal(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const graphql = sembleMode() === "graphql";
  if (graphql !== userId.startsWith("semble:")) return null; // a session from the other mode
  const u = getPortalPatient(userId);
  if (u) return graphql && !isAllowed(u.email) ? null : u;
  // The in-memory store is empty after a restart: re-link the Semble patient the signed cookie names.
  if (graphql) return linkBySembleId(userId.slice("semble:".length), asStage(jar.get(STAGE_COOKIE)?.value));
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

/** Call after any action that moves the patient to another journey stage, so a restart re-links them there. */
export async function rememberStage(u: PortalPatient) {
  const jar = await cookies();
  jar.set(STAGE_COOKIE, u.membership.state, COOKIE_OPTS);
}

/** Throws SembleAdapterError when Semble can't answer; returns null when the email can't sign in. */
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
