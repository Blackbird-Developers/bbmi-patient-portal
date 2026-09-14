/**
 * All patient-facing times are Europe/Dublin. Inputs are true-UTC ISO strings.
 */
const TZ = "Europe/Dublin";

const f = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IE", { timeZone: TZ, ...opts });

export const fmtDate = (iso: string) => f({ day: "numeric", month: "short" }).format(new Date(iso)); // 18 Sept
export const fmtDateYear = (iso: string) => f({ day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
export const fmtDayDate = (iso: string) => f({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)); // Thu 18 Sept
export const fmtTime = (iso: string) => f({ hour: "numeric", minute: "2-digit", hour12: false }).format(new Date(iso)); // 10:30
export const fmtDateTime = (iso: string) => `${fmtDayDate(iso)}, ${fmtTime(iso)}`;
export const fmtWeekday = (iso: string) => f({ weekday: "long" }).format(new Date(iso));
export const fmtMonthYear = (iso: string) => f({ month: "long", year: "numeric" }).format(new Date(iso));

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

/** "today" / "tomorrow" / "in 3 days" / "3 days ago" / "on Thu 18 Sept" */
export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => {
    const p = f({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(x);
    const g = (t: string) => p.find((q) => q.type === t)?.value ?? "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  };
  const a = startOf(now);
  const b = startOf(d);
  const diff = Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 1 && diff < 7) return `in ${diff} days`;
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return `on ${fmtDayDate(iso)}`;
}

/** Request-time clock for server components (kept out of render bodies for the purity lint). */
export const nowMs = () => Date.now();
export const nowIso = () => new Date().toISOString();

export const euro = (n: number) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;
export const kg = (n: number) => `${n.toFixed(1)} kg`;
export const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

export function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export const ROLE_LABEL: Record<string, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  dietitian: "Dietitian",
  "health-coach": "Health coach",
  psychologist: "Psychologist",
  "care-coordinator": "Care coordinator",
};

export function clinicianDisplay(c: { title?: string; fullName: string }) {
  return c.title ? `${c.title} ${c.fullName}` : c.fullName;
}
