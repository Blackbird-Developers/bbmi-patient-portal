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
  globalThis.__semble = mode === "graphql" ? new GraphqlSembleAdapter() : new MockSembleAdapter();
  return globalThis.__semble;
}

export function sembleMode(): "mock" | "graphql" {
  return process.env.SEMBLE_ADAPTER === "graphql" ? "graphql" : "mock";
}

export type { SembleAdapter } from "./adapter";
export { SembleAdapterError } from "./adapter";
