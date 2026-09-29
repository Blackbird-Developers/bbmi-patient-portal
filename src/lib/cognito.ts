import "server-only";
import { AuthenticationDetails, CognitoUser, CognitoUserPool, type CognitoUserSession } from "amazon-cognito-identity-js";

/**
 * Cognito — the existing Beyond BMI patient pool, so current patients keep their logins.
 * QA: pool eu-west-1_pcB1yvtaf, public web client (SRP + refresh, no secret, MFA off).
 *
 * Sign-in runs SRP on the server: the password goes from the portal's login form
 * to this server and never into browser storage. The rest of the public-client
 * API (refresh, forgot/reset password, new-password challenge) is plain JSON.
 */

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the id/access tokens expire */
  expiresAt: number;
}

export interface IdClaims {
  sub: string;
  email: string;
  given_name?: string;
  family_name?: string;
  "cognito:groups"?: string[];
  exp: number;
}

export type SignInResult =
  | { kind: "ok"; tokens: CognitoTokens; claims: IdClaims }
  | { kind: "new-password"; session: string }
  | { kind: "error"; code: "bad-credentials" | "not-confirmed" | "reset-required" | "too-many" | "unavailable" | "contact-clinic" | "weak-password" | "expired"; message: string };

function config() {
  const region = process.env.COGNITO_REGION || "eu-west-1";
  const userPoolId = process.env.COGNITO_USER_POOL_ID || "";
  const clientId = process.env.COGNITO_CLIENT_ID || "";
  if (!userPoolId || !clientId) throw new Error("COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required when PORTAL_AUTH=cognito");
  return { region, userPoolId, clientId, endpoint: `https://cognito-idp.${region}.amazonaws.com/` };
}

export function decodeJwt<T>(jwt: string): T {
  const part = jwt.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

function fromSession(s: CognitoUserSession): CognitoTokens {
  const idToken = s.getIdToken().getJwtToken();
  const accessToken = s.getAccessToken().getJwtToken();
  const exp = Math.min(s.getIdToken().getExpiration(), s.getAccessToken().getExpiration()) * 1000;
  return { idToken, accessToken, refreshToken: s.getRefreshToken().getToken(), expiresAt: exp };
}

function mapError(e: unknown): SignInResult {
  const code = (e as { code?: string; name?: string })?.code ?? (e as { name?: string })?.name ?? "";
  const message = String((e as { message?: string })?.message ?? "");
  // Disabled accounts and expired temporary passwords need the clinic, not another try.
  if (code === "NotAuthorizedException" && /disabled|temporary password has expired/i.test(message)) return { kind: "error", code: "contact-clinic", message: "This account needs the care team's help to sign in." };
  if (code === "NotAuthorizedException" || code === "UserNotFoundException") return { kind: "error", code: "bad-credentials", message: "That email and password don't match." };
  if (code === "UserNotConfirmedException") return { kind: "error", code: "not-confirmed", message: "Please verify your email address first." };
  if (code === "PasswordResetRequiredException") return { kind: "error", code: "reset-required", message: "Please reset your password." };
  if (code === "TooManyRequestsException" || code === "LimitExceededException") return { kind: "error", code: "too-many", message: "Too many attempts. Wait a few minutes and try again." };
  return { kind: "error", code: "unavailable", message: "Sign-in is unavailable just now. Try again in a moment." };
}

/** SRP sign-in with email + password. */
/** The library otherwise keeps every signed-in patient's tokens in one shared in-memory store. */
const noStorage = { setItem() {}, getItem: () => null, removeItem() {}, clear() {} };

export function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const { userPoolId, clientId } = config();
  const pool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId, Storage: noStorage });
  const user = new CognitoUser({ Username: email.trim().toLowerCase(), Pool: pool, Storage: noStorage });
  return new Promise((resolve) => {
    user.authenticateUser(new AuthenticationDetails({ Username: email.trim().toLowerCase(), Password: password }), {
      onSuccess: (s) => {
        const tokens = fromSession(s);
        resolve({ kind: "ok", tokens, claims: decodeJwt<IdClaims>(tokens.idToken) });
      },
      onFailure: (e) => resolve(mapError(e)),
      // Admin-created accounts must choose a password first; the Cognito session string carries the challenge.
      newPasswordRequired: () => resolve({ kind: "new-password", session: (user as unknown as { Session: string }).Session }),
    });
  });
}

/** Call Cognito's public JSON API (no AWS credentials: the web client has no secret). */
async function cognitoApi<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const { endpoint } = config();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": `AWSCognitoIdentityProviderService.${target}` },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { __type?: string; message?: string };
  if (!res.ok) {
    const err = new Error(json.message || `Cognito ${target} failed`) as Error & { code?: string };
    err.code = (json.__type ?? "").split("#").pop();
    throw err;
  }
  return json;
}

type AuthResult = { AuthenticationResult?: { IdToken: string; AccessToken: string; RefreshToken?: string; ExpiresIn: number }; ChallengeName?: string; Session?: string };

/** New id/access tokens from a refresh token. Returns null when the refresh token is no longer valid. */
export async function refreshTokens(refreshToken: string): Promise<CognitoTokens | null> {
  const { clientId } = config();
  try {
    const r = await cognitoApi<AuthResult>("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: clientId, AuthParameters: { REFRESH_TOKEN: refreshToken } });
    const a = r.AuthenticationResult;
    if (!a) return null;
    return { idToken: a.IdToken, accessToken: a.AccessToken, refreshToken: a.RefreshToken ?? refreshToken, expiresAt: Date.now() + a.ExpiresIn * 1000 };
  } catch (e) {
    if ((e as { code?: string }).code === "NotAuthorizedException") return null;
    throw e;
  }
}

/** Finish the NEW_PASSWORD_REQUIRED challenge for an admin-created account. */
export async function completeNewPassword(email: string, session: string, newPassword: string): Promise<SignInResult> {
  const { clientId } = config();
  try {
    const r = await cognitoApi<AuthResult>("RespondToAuthChallenge", { ClientId: clientId, ChallengeName: "NEW_PASSWORD_REQUIRED", Session: session, ChallengeResponses: { USERNAME: email.trim().toLowerCase(), NEW_PASSWORD: newPassword } });
    const a = r.AuthenticationResult;
    if (!a?.RefreshToken) return { kind: "error", code: "expired", message: "Please sign in again." };
    const tokens = { idToken: a.IdToken, accessToken: a.AccessToken, refreshToken: a.RefreshToken, expiresAt: Date.now() + a.ExpiresIn * 1000 };
    return { kind: "ok", tokens, claims: decodeJwt<IdClaims>(tokens.idToken) };
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c === "InvalidPasswordException" || c === "InvalidParameterException") return { kind: "error", code: "weak-password", message: "Use at least 8 characters with upper and lower case letters, a number and a symbol." };
    if (c === "NotAuthorizedException" || c === "CodeMismatchException" || c === "ExpiredCodeException") return { kind: "error", code: "expired", message: "Your sign-in timed out. Sign in again." };
    return mapError(e);
  }
}

/** Sends a reset code by email (Cognito's CustomEmailSender). Always resolves, so the page never reveals whether an account exists. */
export async function startPasswordReset(email: string): Promise<{ ok: boolean; tooMany?: boolean }> {
  const { clientId } = config();
  try {
    await cognitoApi("ForgotPassword", { ClientId: clientId, Username: email.trim().toLowerCase() });
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "LimitExceededException" || code === "TooManyRequestsException") return { ok: false, tooMany: true };
    return { ok: true }; // unknown user etc. — same answer as success
  }
}

export type ResetError = "code" | "expired" | "weak-password" | "too-many" | "unavailable";
export type VerifyError = "expired" | "too-many" | "unavailable";

export async function finishPasswordReset(email: string, code: string, newPassword: string): Promise<{ ok: true } | { ok: false; code: ResetError }> {
  const { clientId } = config();
  try {
    await cognitoApi("ConfirmForgotPassword", { ClientId: clientId, Username: email.trim().toLowerCase(), ConfirmationCode: code.trim(), Password: newPassword });
    return { ok: true };
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c === "CodeMismatchException") return { ok: false, code: "code" };
    if (c === "ExpiredCodeException") return { ok: false, code: "expired" };
    if (c === "InvalidPasswordException" || c === "InvalidParameterException") return { ok: false, code: "weak-password" };
    if (c === "LimitExceededException" || c === "TooManyRequestsException") return { ok: false, code: "too-many" };
    return { ok: false, code: "unavailable" };
  }
}

/** Signs the refresh token out everywhere (best effort). */
export async function revokeRefreshToken(refreshToken: string) {
  const { clientId } = config();
  await cognitoApi("RevokeToken", { ClientId: clientId, Token: refreshToken }).catch(() => undefined);
}

/** Confirms the email address from the emailed /verify link. */
export async function confirmEmail(email: string, code: string): Promise<{ ok: true } | { ok: false; code: VerifyError }> {
  const { clientId } = config();
  try {
    await cognitoApi("ConfirmSignUp", { ClientId: clientId, Username: email.trim().toLowerCase(), ConfirmationCode: code.trim() });
    return { ok: true };
  } catch (e) {
    const c = (e as { code?: string }).code;
    // Expired, already confirmed and unknown all look alike on purpose: never reveal whether an account exists.
    if (c === "ExpiredCodeException" || c === "CodeMismatchException" || c === "NotAuthorizedException") return { ok: false, code: "expired" };
    if (c === "LimitExceededException" || c === "TooManyRequestsException") return { ok: false, code: "too-many" };
    return { ok: false, code: "unavailable" };
  }
}

export async function resendVerification(email: string) {
  const { clientId } = config();
  await cognitoApi("ResendConfirmationCode", { ClientId: clientId, Username: email.trim().toLowerCase() }).catch(() => undefined);
}

/** Changes the password of the signed-in patient (needs their current one). */
export async function changePassword(accessToken: string, previous: string, proposed: string): Promise<{ ok: true } | { ok: false; code: "wrong-password" | "weak-password" | "too-many" | "unavailable" }> {
  try {
    await cognitoApi("ChangePassword", { AccessToken: accessToken, PreviousPassword: previous, ProposedPassword: proposed });
    return { ok: true };
  } catch (e) {
    const c = (e as { code?: string }).code;
    if (c === "NotAuthorizedException") return { ok: false, code: "wrong-password" };
    if (c === "InvalidPasswordException" || c === "InvalidParameterException") return { ok: false, code: "weak-password" };
    if (c === "LimitExceededException" || c === "TooManyRequestsException") return { ok: false, code: "too-many" };
    return { ok: false, code: "unavailable" };
  }
}

/** Revokes every refresh token of this patient (all devices). Issued access tokens still live until they expire (1 h). */
/** False only when Cognito says the token is revoked or invalid (e.g. after a global sign-out); network trouble counts as valid. */
export async function accessTokenValid(accessToken: string): Promise<boolean> {
  try {
    await cognitoApi("GetUser", { AccessToken: accessToken });
    return true;
  } catch (e) {
    return (e as { code?: string }).code !== "NotAuthorizedException";
  }
}

export async function globalSignOut(accessToken: string) {
  await cognitoApi("GlobalSignOut", { AccessToken: accessToken }).catch(() => undefined);
}
