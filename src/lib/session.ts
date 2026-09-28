import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { refreshTokens, type CognitoTokens, type IdClaims, decodeJwt } from "./cognito";

/**
 * Cognito session (PORTAL_AUTH=cognito).
 *
 * The cookie holds only what survives a server restart — the patient's sub,
 * email and Cognito refresh token — encrypted and authenticated with
 * AES-256-GCM under PORTAL_SESSION_SECRET. Short-lived id/access tokens stay in
 * server memory and are re-minted from the refresh token when they expire, so
 * no token ever reaches the browser.
 *
 * Production would keep sessions in a server-side store (revocation, rotation);
 * the cookie format is versioned so that can replace it without a flag day.
 */

export const SESSION_COOKIE = "bbmi_session";
const VERSION = 2;
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // the web client's refresh-token lifetime

export interface SessionData {
  sub: string;
  email: string;
  refreshToken: string;
  /** epoch ms — the session ends here even if the refresh token lives longer */
  exp: number;
}

const PLACEHOLDERS = new Set(["change-me-in-real-deployments", "demo-only-session-secret"]);
function key(): Buffer {
  const s = process.env.PORTAL_SESSION_SECRET ?? "";
  if (s.length < 32 || PLACEHOLDERS.has(s)) throw new Error("PORTAL_SESSION_SECRET must be a random value of 32+ characters (e.g. `openssl rand -hex 32`)");
  return createHash("sha256").update(`bbmi-portal-session|cognito|${s}`).digest();
}

export function sealSession(d: SessionData): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify({ v: VERSION, ...d }), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function openSession(token: string | undefined): SessionData | null {
  if (!token) return null;
  try {
    const [iv, tag, body] = token.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !body || iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv("aes-256-gcm", key(), iv, { authTagLength: 16 });
    d.setAuthTag(tag);
    const json = JSON.parse(Buffer.concat([d.update(body), d.final()]).toString("utf8")) as SessionData & { v: number };
    if (json.v !== VERSION || !(json.exp > Date.now()) || !json.sub || !json.refreshToken) return null;
    return { sub: json.sub, email: json.email, refreshToken: json.refreshToken, exp: json.exp };
  } catch {
    return null; // tampered, old format, or another secret
  }
}

declare global {
  var __portalTokens: Map<string, CognitoTokens> | undefined;
  var __portalRefreshing: Map<string, Promise<CognitoTokens | null>> | undefined;
}
const cache = () => (globalThis.__portalTokens ??= new Map());
const inflight = () => (globalThis.__portalRefreshing ??= new Map());

/**
 * Tokens are cached per SESSION (the refresh token it holds), not per patient,
 * so a signed-out or copied cookie never picks up another session's live tokens.
 */
const sessionKey = (sub: string, refreshToken: string) => `${sub}:${createHash("sha256").update(refreshToken).digest("base64url").slice(0, 22)}`;

export function rememberTokens(sub: string, t: CognitoTokens) {
  cache().set(sessionKey(sub, t.refreshToken), t);
}

/** Drops every cached token of this patient on this server (sign-out, purchase). */
export function forgetTokens(sub: string) {
  for (const k of [...cache().keys()]) if (k.startsWith(`${sub}:`)) cache().delete(k);
}

/** Current tokens for a session, refreshed if they expire within a minute. Null = the session is over. */
export async function tokensFor(s: SessionData): Promise<CognitoTokens | null> {
  const k = sessionKey(s.sub, s.refreshToken);
  const t = cache().get(k);
  if (t && t.expiresAt - 60_000 > Date.now()) return t;
  let p = inflight().get(k);
  if (!p) {
    p = refreshTokens(s.refreshToken)
      .then((fresh) => {
        if (fresh && decodeJwt<IdClaims>(fresh.idToken).sub === s.sub) {
          // Keep it under the cookie's refresh token even if Cognito rotated it (the cookie still holds the old one).
          cache().set(k, fresh);
          return fresh;
        }
        cache().delete(k);
        return null;
      })
      .finally(() => inflight().delete(k));
    inflight().set(k, p);
  }
  return p;
}
