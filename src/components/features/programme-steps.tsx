import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/misc";
import { StatusTag } from "@/components/ui/status-tag";
import type { JourneyView } from "@/lib/portal/journey";
import { fmtDate, fmtDateTime, ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";

const ROLE_DOT: Record<string, string> = { doctor: "bg-blue", nurse: "bg-lime-deep", dietitian: "bg-amber", "health-coach": "bg-blue-text" };

export function ProgrammeSteps({ programme, compact = false }: { programme: NonNullable<JourneyView["programme"]>; compact?: boolean }) {
  const groups = [1, 2, 3].map((m) => ({ month: m, steps: programme.steps.filter((s) => s.month === m) }));
  return (
    <Card>
      <CardHeader
        eyebrow="90-Day Programme"
        title={compact ? "Your appointments" : `${programme.done} of ${programme.steps.filter((s) => s.bookable).length} appointments done`}
        sub={`Started ${fmtDate(programme.startUtc)} · ends ${fmtDate(programme.endUtc)}`}
        action={<ProgressRing value={programme.pct} size={64} stroke={6} label={programme.day} sub="of 90" />}
      />
      {programme.locked ? <p className="mb-3 rounded-md bg-warn-soft p-3 text-[13px] text-ink-soft">Booking is paused until your missed instalment is paid. Appointments you&apos;ve already booked are kept.</p> : null}
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.month}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Month {g.month}</div>
            <ol className="divide-y divide-divider-soft">
              {g.steps.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span className={cn("size-2 shrink-0 rounded-full", ROLE_DOT[s.role] ?? "bg-muted")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-[14px] font-medium leading-snug", s.status === "locked" && "text-ink-soft")}>{s.title}</div>
                    <div className="text-[12px] text-muted">
                      {s.status === "booked" && s.appointmentStartUtc ? `${fmtDateTime(s.appointmentStartUtc)} · ${s.clinicianName}` : s.status === "completed" && s.appointmentStartUtc ? `Done ${fmtDate(s.appointmentStartUtc)} · ${s.clinicianName}` : s.status === "info" ? s.purpose : s.status === "locked" ? `Available from ${fmtDate(s.windowFromUtc!)}${s.after?.length ? " · after your earlier " + ROLE_LABEL[s.role].toLowerCase() + " appointment is booked" : ""}` : s.status === "missed" ? "We missed you — rebook when you're ready" : `${s.durationMinutes} min ${s.format} · ${ROLE_LABEL[s.role]}${s.windowFromUtc && new Date(s.windowFromUtc).getTime() > Date.now() ? ` · earliest ${fmtDate(s.windowFromUtc)}` : ""}`}
                    </div>
                  </div>
                  {s.status === "book-now" && !programme.locked ? (
                    <ButtonLink size="sm" href={`/book/${s.appointmentTypeSlug}?step=${s.id}`}>
                      Book
                    </ButtonLink>
                  ) : s.status === "missed" && !programme.locked ? (
                    <ButtonLink size="sm" variant="secondary" href={`/book/${s.appointmentTypeSlug}?step=${s.id}`}>
                      Rebook
                    </ButtonLink>
                  ) : (
                    <StatusTag status={s.status === "completed" ? "done" : s.status === "booked" ? "booked" : s.status === "locked" ? "locked" : s.status === "missed" ? "missed" : s.status === "book-now" ? "locked" : "info"}>
                      {s.status === "info" ? "We'll call you" : s.status === "locked" ? "Not yet" : s.status === "book-now" ? "Paused" : undefined}
                    </StatusTag>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Card>
  );
}
