import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPortalPatient, findUserByEmail } from "./portal/store";
import type { PortalPatient } from "./portal/types";

/**
 * Session — demo implementation.
 *
 * Production plan: the portal OWNS identity (Semble has no patient auth).
 * Existing patients keep their Cognito identity (10k users, eu-west-1);
 * the session is an opaque server-side id in an httpOnly cookie with
 * rotation + sliding expiry; the Semble patient id lives in a durable
 * mapping table keyed by Cognito sub. Here we store the demo user id
 * directly in a signed-looking cookie.
 */
const COOKIE = "bbmi_session";

export async function currentUser(): Promise<PortalPatient | null> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  if (!v) return null;
  return getPortalPatient(v);
}

export async function requireUser(): Promise<PortalPatient> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function signIn(email: string): Promise<PortalPatient | null> {
  const u = findUserByEmail(email);
  if (!u) return null;
  const jar = await cookies();
  jar.set(COOKIE, u.userId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return u;
}

export async function signInAs(userId: string) {
  const u = getPortalPatient(userId);
  if (!u) return null;
  const jar = await cookies();
  jar.set(COOKIE, u.userId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return u;
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
