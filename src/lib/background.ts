import "server-only";
import { after } from "next/server";

/**
 * Runs work after the response is sent — kept alive by the platform (Next's after()), so a
 * copy into Semble isn't cut off when the request ends. Outside a request (scripts) it just runs.
 */
export function inBackground(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task();
  }
}
