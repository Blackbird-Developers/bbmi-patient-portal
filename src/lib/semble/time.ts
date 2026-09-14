/**
 * Semble stores naive practice-local wall-clock time and returns it with a
 * fake `Z` suffix. Read path: treat the "UTC" instant as Dublin wall-clock and
 * convert to true UTC. Write path: convert true UTC to Dublin wall-clock and
 * send it as if it were UTC. Skipping either side = +1h drift all summer.
 */

const TZ = process.env.SEMBLE_PRACTICE_TZ || "Europe/Dublin";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Offset (minutes) of the practice TZ from UTC at a given true-UTC instant. */
export function tzOffsetMinutes(atUtc: Date): number {
  const p = Object.fromEntries(partsFmt.formatToParts(atUtc).map((x) => [x.type, x.value]));
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asIfUtc - atUtc.getTime()) / 60000);
}

/** Semble "Z" string that is really Dublin wall-clock → true UTC ISO. */
export function fromPracticeLocalIso(fakeZ: string): string {
  const naive = new Date(fakeZ); // wall-clock digits interpreted as UTC
  // first guess offset using the naive instant, then correct once (handles DST edges)
  let off = tzOffsetMinutes(naive);
  let real = new Date(naive.getTime() - off * 60000);
  const off2 = tzOffsetMinutes(real);
  if (off2 !== off) {
    off = off2;
    real = new Date(naive.getTime() - off * 60000);
  }
  return real.toISOString();
}

/** True UTC ISO → the Dublin wall-clock string Semble expects (with a fake Z). */
export function toPracticeLocalIso(trueUtcIso: string): string {
  const real = new Date(trueUtcIso);
  const off = tzOffsetMinutes(real);
  return new Date(real.getTime() + off * 60000).toISOString();
}

/** Clean midnight-to-midnight windows of ≤ maxDays for Semble availability queries. */
export function chunkDays(fromUtc: string, toUtc: string, maxDays = 7): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let cur = new Date(fromUtc);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(toUtc);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);
  while (cur < end) {
    const next = new Date(cur);
    next.setUTCDate(next.getUTCDate() + maxDays);
    out.push({ from: cur.toISOString(), to: (next < end ? next : end).toISOString() });
    cur = next;
  }
  return out;
}

/** Semble rate limit = HTTP 200 + GraphQL error containing "too often". */
export function isRateLimitMessage(msg: string | undefined): boolean {
  return !!msg && /too often|rate limit/i.test(msg);
}
