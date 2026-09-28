import "server-only";

/**
 * The existing Beyond BMI backend (Express + TypeORM on EKS; QA:
 * https://backend.qa.beyondbmi.ie/api/v1). Called from the portal's server only,
 * with the patient's Cognito ACCESS token — the backend rejects id tokens and
 * resolves the patient from the token's sub. Responses are `{ data, message }`.
 */

export class BbmiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: "unauthorised" | "not-found" | "payment-required" | "forbidden" | "conflict" | "invalid" | "rate-limited" | "unreachable" | "upstream",
  ) {
    super(message);
    this.name = "BbmiError";
  }
}

export function bbmiBaseUrl() {
  const url = process.env.BBMI_API_URL;
  if (!url) throw new Error("BBMI_API_URL is required when PORTAL_AUTH=cognito (QA: https://backend.qa.beyondbmi.ie/api/v1)");
  return url.replace(/\/+$/, "");
}

const codeFor = (status: number): BbmiError["code"] =>
  status === 401 ? "unauthorised" : status === 404 ? "not-found" : status === 402 ? "payment-required" : status === 403 ? "forbidden" : status === 409 ? "conflict" : status === 400 || status === 422 ? "invalid" : status === 429 ? "rate-limited" : "upstream";

export async function bbmi<T>(accessToken: string, path: string, init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${bbmiBaseUrl()}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new BbmiError(`Beyond BMI backend unreachable: ${(e as Error).message}`, 0, "unreachable");
  }
  const text = await res.text();
  let json: { data?: T; message?: string } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) throw new BbmiError(`Beyond BMI backend HTTP ${res.status}`, res.status, res.status >= 500 ? "unreachable" : codeFor(res.status));
    throw new BbmiError("Beyond BMI backend returned an unreadable response", res.status, "upstream");
  }
  if (!res.ok) throw new BbmiError(json.message || `Beyond BMI backend HTTP ${res.status}`, res.status, res.status >= 500 ? "upstream" : codeFor(res.status));
  return json.data as T;
}
