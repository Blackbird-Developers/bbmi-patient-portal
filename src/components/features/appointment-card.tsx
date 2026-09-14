import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import { cancelAppointmentAction } from "@/app/actions";
import type { Appointment } from "@/lib/semble/types";
import { clinicianDisplay, fmtDayDate, fmtTime, relativeDay, ROLE_LABEL } from "@/lib/format";
import { Video, CalendarClock, Info } from "lucide-react";

const JOIN_BEFORE_MS = 60 * 60_000;
const JOIN_AFTER_MS = 2 * 3_600_000;

export function joinWindow(a: Appointment, now = Date.now()) {
  const s = new Date(a.startUtc).getTime();
  return { open: now >= s - JOIN_BEFORE_MS && now <= s + JOIN_AFTER_MS, opensInMin: Math.max(0, Math.ceil((s - JOIN_BEFORE_MS - now) / 60_000)) };
}

export function NextAppointmentCard({ a, canJoin = true, locked, showManage = true }: { a: Appointment; canJoin?: boolean; locked?: string; showManage?: boolean }) {
  const jw = joinWindow(a);
  return (
    <Card>
      <CardHeader eyebrow="Next appointment" title={a.type.name} sub={`${fmtDayDate(a.startUtc)}, ${fmtTime(a.startUtc)} · ${a.type.durationMinutes} min · video`} action={<StatusTag status="booked">{relativeDay(a.startUtc)}</StatusTag>} />
      <div className="flex items-center gap-3">
        <Avatar first={a.clinician.firstName} last={a.clinician.lastName} role={a.clinician.role} />
        <div className="min-w-0">
          <div className="text-[14px] font-medium">{clinicianDisplay(a.clinician)}</div>
          <div className="text-[12.5px] text-muted">
            {ROLE_LABEL[a.clinician.role]}
            {a.clinician.registration ? ` · ${a.clinician.registration}` : ""}
          </div>
        </div>
      </div>
      {locked ? (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-warn-soft p-3 text-[13px] text-ink-soft">
          <Info className="mt-0.5 size-4 shrink-0 text-warn" /> {locked}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {a.videoUrl && canJoin && !locked ? (
          jw.open ? (
            <ButtonLink href={a.videoUrl} target="_blank" rel="noreferrer" iconLeft={<Video className="size-4" />}>
              Join video call
            </ButtonLink>
          ) : (
            <Button variant="secondary" disabled iconLeft={<Video className="size-4" />}>
              Join opens 1 hour before
            </Button>
          )
        ) : null}
        {showManage && (a.canReschedule || a.canCancel) && !locked ? (
          <>
            {a.canReschedule ? (
              <ButtonLink variant="ghost" href={`/book/${a.type.slug}?reschedule=${a.id}`} iconLeft={<CalendarClock className="size-4" />}>
                Reschedule
              </ButtonLink>
            ) : null}
            {a.canCancel ? (
              <form action={cancelAppointmentAction}>
                <input type="hidden" name="appointmentId" value={a.id} />
                <Button variant="ghost" type="submit">
                  Cancel
                </Button>
              </form>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="mt-3 text-[12px] text-muted">Reschedule or cancel with 24 hours&apos; notice. Reminders go out the day before and 1 hour before.</p>
    </Card>
  );
}

export function AppointmentRow({ a }: { a: Appointment }) {
  const status = a.status === "confirmed" ? "booked" : a.status === "completed" ? "done" : a.status === "no-show" ? "missed" : a.status === "cancelled" ? "cancelled" : "pending";
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-[76px] shrink-0 text-center">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{fmtDayDate(a.startUtc).split(" ")[0]}</div>
        <div className="text-[15px] font-semibold tabular leading-tight">{fmtDayDate(a.startUtc).replace(/^\w+\s/, "")}</div>
        <div className="text-[12px] tabular text-muted">{fmtTime(a.startUtc)}</div>
      </div>
      <Avatar first={a.clinician.firstName} last={a.clinician.lastName} role={a.clinician.role} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{a.type.name}</div>
        <div className="truncate text-[12.5px] text-muted">
          {clinicianDisplay(a.clinician)} · {ROLE_LABEL[a.clinician.role]} · {a.type.durationMinutes} min
        </div>
      </div>
      <StatusTag status={status} />
    </div>
  );
}
