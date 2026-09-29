import "server-only";
import type { SembleAdapter } from "./adapter";
import { GraphqlSembleAdapter } from "./graphql";
import { MockSembleAdapter } from "./mock";

/**
 * Factory — the only place that knows which adapter is live.
 * Import `getSemble()` from server code only; the client never sees this module.
 */
declare global {
  var __semble: SembleAdapter | undefined;
}

export function getSemble(): SembleAdapter {
  if (globalThis.__semble) return globalThis.__semble;
  const mode = process.env.SEMBLE_ADAPTER ?? "mock";
  // Real patients must never be served from the in-memory demo record.
  if (process.env.PORTAL_AUTH === "cognito" && mode !== "graphql") throw new Error("PORTAL_AUTH=cognito requires SEMBLE_ADAPTER=graphql");
  globalThis.__semble = mode === "graphql" ? new GraphqlSembleAdapter() : new MockSembleAdapter();
  return globalThis.__semble;
}

export function sembleMode(): "mock" | "graphql" {
  return process.env.SEMBLE_ADAPTER === "graphql" ? "graphql" : "mock";
}

/** Which Semble the portal is talking to — shown on demo controls so nobody mistakes a sandbox for production. */
export function sembleTarget(): "sandbox" | "production" | "mock" {
  if (sembleMode() === "mock") return "mock";
  return /sandbox/i.test(process.env.SEMBLE_GRAPHQL_URL ?? "") ? "sandbox" : "production";
}

export type { SembleAdapter } from "./adapter";
export { SembleAdapterError } from "./adapter";
