import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSemble, sembleMode, SembleAdapterError } from "./semble";
import { hasRole, type ClinicianRole } from "./semble/types";
import { getPortalPatient, findUserByEmail, linkSemblePatient, LINKABLE_STAGES } from "./portal/store";
import type { MemberState, PortalPatient } from "./portal/types";
import { completeNewPassword, decodeJwt, revokeRefreshToken, signInWithPassword, type CognitoTokens, type SignInResult } from "./cognito";
import { forgetTokens, openSession, rememberTokens, sealSession, SESSION_COOKIE, SESSION_MAX_AGE_S, tokensFor, type SessionData } from "./session";
import { AccountNotReady, loadBbmiPatient } from "./bbmi/patient";
import { getMe } from "./bbmi/api";
import { BbmiError } from "./bbmi/client";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

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

/** "cognito" = the real Beyond BMI patient pool + backend; "demo" = mock personas or the Semble allow-list. */
export function authMode(): "cognito" | "demo" {
  return process.env.PORTAL_AUTH === "cognito" ? "cognito" : "demo";
}

/* ======================================================================== Cognito mode */

declare global {
  var __portalPatients: Map<string, { at: number; patient: PortalPatient }> | undefined;
}
const patientCache = () => (globalThis.__portalPatients ??= new Map());
const PATIENT_TTL_MS = 15_000;

/** Drop the cached patient after anything that changes it (weight logged, address saved, purchase). */
export function invalidatePatient(sub: string) {
  patientCache().delete(sub);
}

async function cognitoSession(): Promise<SessionData | null> {
  const jar = await cookies();
  return openSession(jar.get(SESSION_COOKIE)?.value);
}

/** The signed-in patient's backend access token, or null when the session is over. */
export async function accessToken(): Promise<string | null> {
  const s = await cognitoSession();
  if (!s) return null;
  return (await tokensFor(s))?.accessToken ?? null;
}

async function cognitoUser(): Promise<PortalPatient | null> {
  const s = await cognitoSession();
  if (!s) return null;
  const tokens = await tokensFor(s);
  if (!tokens) return null;
  const hit = patientCache().get(s.sub);
  if (hit && Date.now() - hit.at < PATIENT_TTL_MS) return hit.patient;
  const claims = decodeJwt<{ "cognito:groups"?: string[] }>(tokens.accessToken);
  const patient = await loadBbmiPatient({ sub: s.sub, email: s.email, groups: claims["cognito:groups"] ?? [] }, tokens.accessToken);
  patientCache().set(s.sub, { at: Date.now(), patient });
  return patient;
}

async function startCognitoSession(tokens: CognitoTokens, sub: string, email: string) {
  rememberTokens(sub, tokens);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sealSession({ sub, email, refreshToken: tokens.refreshToken, exp: Date.now() + SESSION_MAX_AGE_S * 1000 }), COOKIE_OPTS_LONG);
}

const COOKIE_OPTS_LONG = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE_S } as const;
const CHALLENGE_COOKIE = "bbmi_challenge";

/** Encrypts the short-lived Cognito challenge (new-password) between the login and set-password pages. */
function sealChallenge(v: { email: string; session: string }) {
  const k = challengeKey();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(JSON.stringify({ ...v, exp: Date.now() + 5 * 60_000 }), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}
function openChallenge(t?: string): { email: string; session: string } | null {
  if (!t) return null;
  try {
    const [iv, tag, body] = t.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", challengeKey(), iv);
    d.setAuthTag(tag);
    const v = JSON.parse(Buffer.concat([d.update(body), d.final()]).toString("utf8")) as { email: string; session: string; exp: number };
    return v.exp > Date.now() ? { email: v.email, session: v.session } : null;
  } catch {
    return null;
  }
}
function challengeKey() {
  return createHmac("sha256", process.env.PORTAL_SESSION_SECRET ?? "").update("bbmi-portal-challenge").digest();
}

export type CognitoSignIn = { ok: true } | { ok: false; code: "bad-credentials" | "not-confirmed" | "reset-required" | "too-many" | "unavailable" | "not-ready" | "new-password" };

async function finishSignIn(r: SignInResult, email: string): Promise<CognitoSignIn> {
  if (r.kind === "new-password") {
    const jar = await cookies();
    jar.set(CHALLENGE_COOKIE, sealChallenge({ email, session: r.session }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
    return { ok: false, code: "new-password" };
  }
  if (r.kind === "error") return { ok: false, code: r.code };
  // Only start a session once the backend knows this patient (a login without a patients row answers 404).
  try {
    await getMe(r.tokens.accessToken);
  } catch (e) {
    if (e instanceof BbmiError && e.code === "not-found") return { ok: false, code: "not-ready" };
    return { ok: false, code: "unavailable" };
  }
  await startCognitoSession(r.tokens, r.claims.sub, r.claims.email);
  return { ok: true };
}

export async function signInCognito(email: string, password: string): Promise<CognitoSignIn> {
  const e = email.trim().toLowerCase();
  return finishSignIn(await signInWithPassword(e, password), e);
}

export async function pendingChallengeEmail(): Promise<string | null> {
  const jar = await cookies();
  return openChallenge(jar.get(CHALLENGE_COOKIE)?.value)?.email ?? null;
}

export async function completeChallenge(newPassword: string): Promise<CognitoSignIn> {
  const jar = await cookies();
  const c = openChallenge(jar.get(CHALLENGE_COOKIE)?.value);
  if (!c) return { ok: false, code: "unavailable" };
  const r = await completeNewPassword(c.email, c.session, newPassword);
  if (r.kind === "ok") jar.delete(CHALLENGE_COOKIE);
  return finishSignIn(r, c.email);
}

/** After a purchase: new Cognito groups only appear in a fresh access token. */
export async function refreshAfterPurchase() {
  const s = await cognitoSession();
  if (!s) return;
  forgetTokens(s.sub);
  invalidatePatient(s.sub);
}

/* ======================================================================== both modes */

export async function currentUser(): Promise<PortalPatient | null> {
  if (authMode() === "cognito") return cognitoUser();
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
  let u: PortalPatient | null;
  try {
    u = await currentUser();
  } catch (e) {
    if (e instanceof AccountNotReady) redirect("/login?error=not-ready");
    throw e;
  }
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
  if (authMode() === "cognito") {
    const s = openSession(jar.get(SESSION_COOKIE)?.value);
    if (s) {
      forgetTokens(s.sub);
      invalidatePatient(s.sub);
      // Revokes the refresh token; the backend doesn't check revocation, so issued access tokens simply expire (1 h) server-side here.
      await revokeRefreshToken(s.refreshToken);
    }
    jar.delete(SESSION_COOKIE);
    return;
  }
  jar.delete(COOKIE);
  jar.delete(STAGE_COOKIE);
}
