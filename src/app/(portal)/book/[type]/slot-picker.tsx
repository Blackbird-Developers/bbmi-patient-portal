"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Segmented, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { StatusTag } from "@/components/ui/status-tag";
import { cn } from "@/lib/cn";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Sun, Sunrise, Sunset } from "lucide-react";

/**
 * Client-side slot picker. Receives a 28-day availability window that was
 * fetched once on the server and only filters it. All day/time maths is done
 * in Europe/Dublin via Intl so the patient never sees a UTC date.
 */

/* ------------------------------------------------------------------ types (structural — the page passes Semble shapes straight in) */
export interface PickerSlot {
  clinicianId: string;
  startUtc: string;
  endUtc: string;
}

export interface PickerClinician {
  id: string;
  firstName: string;
  lastName: string;
  display: string; // "Dr Niamh Keogh"
  isCareTeam: boolean; // the patient's usual clinician for this role
}

export interface PickerType {
  id: string;
  slug: string;
  name: string;
  durationMinutes: number;
  roleLabel: string; // "Doctor"
  format: "video" | "phone";
  priceLabel: string; // "Included in your plan" · "€80"
  priceNote?: string; // "billed to your card at booking"
}

export interface SlotPickerProps {
  slots: PickerSlot[];
  clinicians: PickerClinician[];
  type: PickerType;
  /** UTC-midnight-aligned range the slots were fetched for (end exclusive) */
  rangeStartUtc: string;
  rangeEndUtc: string;
  initialClinicianId?: string;
  /** YYYY-MM-DD (Dublin) to preselect */
  initialDate?: string;
  programmeStepId?: string;
  reschedule?: { appointmentId: string; currentStartUtc: string; clinicianDisplay: string };
  /** consult_paid only — the tick in the summary */
  questionnaireDone?: boolean;
  /** link to the following 4 weeks; absent when the range is capped by a programme window */
  nextRangeHref?: string;
  /** "Your window for this appointment closes Tue 9 Dec" */
  windowNote?: string;
  action: (formData: FormData) => void | Promise<void>;
}

/* ------------------------------------------------------------------ Dublin helpers */
const TZ = "Europe/Dublin";
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }); // 2026-09-18
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" });
const dayNumFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, month: "short" });
const longDayFmt = new Intl.DateTimeFormat("en-IE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

const dayKey = (iso: string) => keyFmt.format(new Date(iso));
const dublinHour = (iso: string) => parseInt(hourFmt.format(new Date(iso)), 10);

interface DayCell {
  key: string;
  iso: string;
  dayNum: string;
  month: string;
  weekday: string;
  inRange: boolean;
}

/** Monday-aligned grid of Dublin days covering [start, end). */
function buildCells(startIso: string, endIso: string): DayCell[] {
  const start = new Date(startIso);
  const firstKey = keyFmt.format(start);
  const lastCandidate = keyFmt.format(new Date(new Date(endIso).getTime() - DAY_MS));
  const lastKey = lastCandidate < firstKey ? firstKey : lastCandidate;
  const lead = Math.max(0, WEEKDAYS.indexOf(weekdayFmt.format(start) as (typeof WEEKDAYS)[number]));
  const out: DayCell[] = [];
  const seen = new Set<string>();
  for (let t = start.getTime() - lead * DAY_MS, i = 0; i < 49; t += DAY_MS, i++) {
    const d = new Date(t);
    const key = keyFmt.format(d);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, iso: d.toISOString(), dayNum: dayNumFmt.format(d), month: monthFmt.format(d), weekday: weekdayFmt.format(d), inRange: key >= firstKey && key <= lastKey });
    if (key >= lastKey && out.length % 7 === 0) break;
  }
  return out;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function weekLabel(week: DayCell[]): string {
  const a = week[0];
  const b = week[week.length - 1];
  return a.month === b.month ? `${a.dayNum}–${b.dayNum} ${a.month}` : `${a.dayNum} ${a.month} – ${b.dayNum} ${b.month}`;
}

interface TimeOption {
  startUtc: string;
  endUtc: string;
  hour: number;
  group: PickerSlot[]; // one per clinician free at this time
}

interface Selected {
  startUtc: string;
  endUtc: string;
  clinicianId: string;
  firstAvailable: boolean;
}

/* ------------------------------------------------------------------ component */
export function SlotPicker({ slots, clinicians, type, rangeStartUtc, rangeEndUtc, initialClinicianId, initialDate, programmeStepId, reschedule, questionnaireDone, nextRangeHref, windowNote, action }: SlotPickerProps) {
  const cells = useMemo(() => buildCells(rangeStartUtc, rangeEndUtc), [rangeStartUtc, rangeEndUtc]);
  const weeks = useMemo(() => chunk(cells, 7), [cells]);
  const clinicianById = useMemo(() => new Map(clinicians.map((c) => [c.id, c])), [clinicians]);
  const careTeamIds = useMemo(() => new Set(clinicians.filter((c) => c.isCareTeam).map((c) => c.id)), [clinicians]);

  const [clinicianId, setClinicianId] = useState<string>(() => (initialClinicianId && clinicianById.has(initialClinicianId) ? initialClinicianId : ""));
  const [selectedDay, setSelectedDay] = useState<string | null>(() => (initialDate && cells.some((c) => c.inRange && c.key === initialDate) ? initialDate : null));
  const [weekIndex, setWeekIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

  /* slots for the current clinician filter, grouped by Dublin day */
  const byDay = useMemo(() => {
    const m = new Map<string, PickerSlot[]>();
    for (const s of slots) {
      if (clinicianId && s.clinicianId !== clinicianId) continue;
      const k = dayKey(s.startUtc);
      const list = m.get(k);
      if (list) list.push(s);
      else m.set(k, [s]);
    }
    return m;
  }, [slots, clinicianId]);

  const firstDayWithSlots = cells.find((c) => c.inRange && byDay.has(c.key))?.key;
  const activeDay = selectedDay ?? firstDayWithSlots ?? cells.find((c) => c.inRange)?.key ?? null;
  const activeWeek = Math.min(weeks.length - 1, Math.max(0, weekIndex ?? weeks.findIndex((w) => w.some((c) => c.key === activeDay))));
  const week = weeks[activeWeek] ?? [];

  const times = useMemo<TimeOption[]>(() => {
    if (!activeDay) return [];
    const m = new Map<string, PickerSlot[]>();
    for (const s of byDay.get(activeDay) ?? []) {
      const list = m.get(s.startUtc);
      if (list) list.push(s);
      else m.set(s.startUtc, [s]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([startUtc, group]) => ({ startUtc, endUtc: group[0].endUtc, hour: dublinHour(startUtc), group }));
  }, [byDay, activeDay]);

  const periods = [
    { label: "Morning", icon: <Sunrise className="size-4" strokeWidth={1.75} />, items: times.filter((t) => t.hour < 12) },
    { label: "Afternoon", icon: <Sun className="size-4" strokeWidth={1.75} />, items: times.filter((t) => t.hour >= 12 && t.hour < 17) },
    { label: "Evening", icon: <Sunset className="size-4" strokeWidth={1.75} />, items: times.filter((t) => t.hour >= 17) },
  ].filter((p) => p.items.length > 0);

  const filteredCount = useMemo(() => [...byDay.values()].reduce((n, l) => n + l.length, 0), [byDay]);
  const filterName = clinicianId ? clinicianById.get(clinicianId)?.display : undefined;

  /* ---------------------------------------------------------------- handlers */
  const chooseClinician = (id: string) => {
    setClinicianId(id);
    setSelected(null);
  };
  const chooseDay = (key: string) => {
    setSelectedDay(key);
    setSelected(null);
  };
  const jumpToNextAvailable = () => {
    if (!firstDayWithSlots) return;
    setSelectedDay(firstDayWithSlots);
    setWeekIndex(null);
    setSelected(null);
  };
  const pick = (t: TimeOption) => {
    const chosen = clinicianId ? t.group.find((s) => s.clinicianId === clinicianId) ?? t.group[0] : (t.group.find((s) => careTeamIds.has(s.clinicianId)) ?? t.group[0]);
    setSelected({ startUtc: t.startUtc, endUtc: t.endUtc, clinicianId: chosen.clinicianId, firstAvailable: !clinicianId });
  };

  const selectedClinician = selected ? clinicianById.get(selected.clinicianId) : undefined;
  const clinicianLine = selected ? `${selectedClinician?.display ?? type.roleLabel}${selected.firstAvailable ? " · first available" : ""}` : filterName ?? "First available";
  const confirmLabel = reschedule ? "Confirm new time" : "Confirm booking";
  const activeCell = cells.find((c) => c.key === activeDay);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* hidden payload — filled by the picker, read by bookAction / rescheduleAction */}
      <input type="hidden" name="appointmentTypeId" value={type.id} />
      <input type="hidden" name="typeSlug" value={type.slug} />
      <input type="hidden" name="programmeStepId" value={programmeStepId ?? ""} />
      {reschedule ? <input type="hidden" name="appointmentId" value={reschedule.appointmentId} /> : null}
      <input type="hidden" name="clinicianId" value={selected?.clinicianId ?? ""} />
      <input type="hidden" name="startUtc" value={selected?.startUtc ?? ""} />
      <input type="hidden" name="endUtc" value={selected?.endUtc ?? ""} />

      {/* ---------------- main column: pick a day and time ---------------- */}
      <div className="space-y-6">
        <Card>
          <CardHeader title="Choose a day and time" sub="Times are shown in Irish time." />

          {clinicians.length > 1 ? (
            <div className="mb-5">
              <div className="mb-1.5 text-[13px] font-medium text-ink">Who would you like to see?</div>
              <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
                <Segmented
                  name="clinicianFilter"
                  ariaLabel="Clinician"
                  value={clinicianId}
                  onChange={chooseClinician}
                  options={[
                    { value: "", label: "Anyone available" },
                    ...clinicians.map((c) => ({
                      value: c.id,
                      label: (
                        <span className="whitespace-nowrap">
                          {c.display}
                          {c.isCareTeam ? <span className="ml-1.5 text-[11px] font-normal text-muted">your {type.roleLabel.toLowerCase()}</span> : null}
                        </span>
                      ),
                    })),
                  ]}
                />
              </div>
            </div>
          ) : clinicians.length === 1 ? (
            <p className="mb-5 text-[13px] text-ink-soft">
              With {clinicians[0].display}
              {clinicians[0].isCareTeam ? ` · your ${type.roleLabel.toLowerCase()}` : ""}
            </p>
          ) : null}

          {slots.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-6" strokeWidth={1.75} />}
              title={windowNote ? "No times left in this window" : "No times in the next 4 weeks"}
              action={
                nextRangeHref ? (
                  <ButtonLink variant="secondary" href={nextRangeHref} iconRight={<ArrowRight className="size-4" />}>
                    Show next 4 weeks
                  </ButtonLink>
                ) : (
                  <ButtonLink variant="secondary" href="/care">
                    Your care team
                  </ButtonLink>
                )
              }
            >
              {windowNote ? "Call or email the care team and they will find a time that works for you." : "Look further ahead, or call the care team and they will find a time."}
            </EmptyState>
          ) : (
            <>
              {/* ---- week grid ---- */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[14px] font-semibold tabular">{week.length ? weekLabel(week) : ""}</div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="secondary" size="sm" className="min-h-11 min-w-11 px-0" aria-label="Previous week" disabled={activeWeek <= 0} onClick={() => setWeekIndex(activeWeek - 1)}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button type="button" variant="secondary" size="sm" className="min-h-11 min-w-11 px-0" aria-label="Next week" disabled={activeWeek >= weeks.length - 1} onClick={() => setWeekIndex(activeWeek + 1)}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
              <div role="group" aria-label="Day" className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wider text-muted">
                    {w}
                  </div>
                ))}
                {week.map((c) => {
                  const n = c.inRange ? (byDay.get(c.key)?.length ?? 0) : 0;
                  const disabled = !c.inRange || n === 0;
                  const isSel = c.key === activeDay;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      disabled={disabled}
                      aria-pressed={isSel}
                      aria-label={`${c.weekday} ${c.dayNum} ${c.month}, ${n ? `${n} time${n === 1 ? "" : "s"}` : "no times"}`}
                      onClick={() => chooseDay(c.key)}
                      className={cn(
                        "flex min-h-12 flex-col items-center justify-center rounded-sm border text-[15px] font-medium tabular transition-colors duration-150",
                        isSel ? "border-blue bg-blue-soft text-ink" : disabled ? "border-transparent text-muted/40" : "border-divider bg-paper text-ink hover:border-blue hover:bg-blue-wash",
                      )}
                    >
                      <span>{c.dayNum}</span>
                      <span className={cn("mt-1 size-1.5 rounded-full", n ? "bg-blue" : "bg-transparent")} aria-hidden />
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-blue" aria-hidden /> Days with free times
                </span>
                {nextRangeHref ? (
                  <a href={nextRangeHref} className="inline-flex items-center gap-1 font-medium text-blue-text hover:underline">
                    Show next 4 weeks <ArrowRight className="size-3.5" />
                  </a>
                ) : windowNote ? (
                  <span>{windowNote}</span>
                ) : null}
              </div>

              {/* ---- time slots for the active day ---- */}
              <div className="mt-6 border-t border-divider-soft pt-5">
                <h3 className="text-[14px] font-semibold">{activeCell ? longDayFmt.format(new Date(activeCell.iso)) : "Pick a day"}</h3>
                {times.length === 0 ? (
                  <div className="mt-3 rounded-md bg-paper-soft p-4 text-[14px] text-ink-soft">
                    {filterName && filteredCount === 0 ? (
                      <>
                        <p>{filterName} has no free times in this range.</p>
                        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => chooseClinician("")}>
                          Show anyone available
                        </Button>
                      </>
                    ) : (
                      <>
                        <p>No free times on this day{filterName ? ` with ${filterName}` : ""}.</p>
                        {firstDayWithSlots ? (
                          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={jumpToNextAvailable} iconRight={<ArrowRight className="size-4" />}>
                            Next available day
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-5">
                    {periods.map((p) => (
                      <div key={p.label}>
                        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted">
                          <span className="text-blue-text">{p.icon}</span> {p.label}
                        </div>
                        <div role="group" aria-label={`${p.label} times`} className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                          {p.items.map((t) => {
                            const isSel = selected?.startUtc === t.startUtc;
                            return (
                              <button
                                key={t.startUtc}
                                type="button"
                                aria-pressed={isSel}
                                onClick={() => pick(t)}
                                className={cn(
                                  "min-h-11 rounded-sm border text-[14px] font-medium tabular transition-colors duration-150",
                                  isSel ? "border-blue bg-blue-soft text-ink" : "border-divider bg-paper text-ink hover:border-blue hover:bg-blue-wash",
                                )}
                              >
                                {fmtTime(t.startUtc)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ---------------- context rail: summary + confirm ---------------- */}
      <aside>
        <Card className="lg:sticky lg:top-8">
          <CardHeader
            eyebrow={reschedule ? "New time" : "Your booking"}
            title={type.name}
            sub={`${type.durationMinutes} min · ${type.format}`}
            action={selected ? <StatusTag status="booked">Selected</StatusTag> : <StatusTag status="info">Choose a time</StatusTag>}
          />
          <dl className="space-y-3 text-[14px]">
            {reschedule ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Currently</dt>
                <dd className="text-right font-medium tabular">
                  {fmtDateTime(reschedule.currentStartUtc)}
                  <span className="block text-[12px] font-normal text-muted">{reschedule.clinicianDisplay}</span>
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{reschedule ? "New time" : "Time"}</dt>
              <dd className={cn("text-right font-medium tabular", !selected && "text-muted")}>{selected ? `${fmtDateTime(selected.startUtc)}–${fmtTime(selected.endUtc)}` : "Not chosen yet"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{type.roleLabel}</dt>
              <dd className="text-right font-medium">{clinicianLine}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Price</dt>
              <dd className="text-right font-medium tabular">
                {type.priceLabel}
                {type.priceNote ? <span className="block text-[12px] font-normal text-muted">{type.priceNote}</span> : null}
              </dd>
            </div>
          </dl>

          {questionnaireDone ? (
            <p className="mt-4 flex items-start gap-2 rounded-md bg-lime-soft p-3 text-[13px] text-lime-text">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> Your health questionnaire is complete. Your doctor reads it before you meet.
            </p>
          ) : null}

          {!reschedule ? (
            <div className="mt-4">
              <Field label={`Anything your ${type.roleLabel.toLowerCase()} should know beforehand?`} hint="Optional · up to 300 characters" htmlFor="booking-notes">
                <Textarea id="booking-notes" name="notes" maxLength={300} rows={3} className="min-h-20" placeholder="For example: a question you want to cover" />
              </Field>
            </div>
          ) : null}

          <ConfirmButton label={confirmLabel} disabled={!selected} className="mt-4 hidden w-full lg:inline-flex" />

          <p className="mt-3 text-[12px] leading-relaxed text-muted">24 hours&apos; notice to reschedule or cancel · reminders the day before and 1 hour before · video link arrives by email and appears here</p>
        </Card>
      </aside>

      {/* ---------------- mobile: bottom-sheet style confirm ---------------- */}
      {selected ? (
        <>
          <div className="h-20 lg:hidden" aria-hidden />
          <div className="fixed inset-x-0 z-30 border-t border-divider bg-paper/95 px-4 py-3 shadow-lift backdrop-blur lg:hidden" style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }} role="region" aria-label="Confirm your time">
            <div className="mx-auto flex max-w-[1120px] items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold tabular">{fmtDateTime(selected.startUtc)}</div>
                <div className="truncate text-[12px] text-muted">
                  {selectedClinician?.display ?? type.roleLabel} · {type.priceLabel}
                </div>
              </div>
              <ConfirmButton label={confirmLabel} className="shrink-0" />
            </div>
          </div>
        </>
      ) : null}
    </form>
  );
}

function ConfirmButton({ label, disabled, className }: { label: string; disabled?: boolean; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} className={className} iconLeft={<Check className="size-4" />}>
      {pending ? "Confirming" : label}
    </Button>
  );
}
