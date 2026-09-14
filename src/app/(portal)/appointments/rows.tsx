import { AppointmentRow, joinWindow } from "@/components/features/appointment-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { cancelAppointmentAction } from "@/app/actions";
import type { Appointment } from "@/lib/semble/types";
import { CalendarClock, Video } from "lucide-react";

/**
 * Row helpers for the appointments list. Server components: they compose the
 * shared <AppointmentRow/> and add the per-row controls the list needs.
 */

export function UpcomingRow({ a, canJoin, locked }: { a: Appointment; canJoin: boolean; locked?: string }) {
  const jw = joinWindow(a);
  const showJoin = Boolean(a.videoUrl) && canJoin && !locked && jw.open;
  const showManage = !locked && (a.canReschedule || a.canCancel);
  return (
    <li>
      <AppointmentRow a={a} />
      {showJoin || showManage ? (
        <div className="-mt-1 flex flex-wrap items-center gap-2 pb-3 pl-[88px] sm:pl-[132px]">
          {showJoin && a.videoUrl ? (
            <ButtonLink size="sm" href={a.videoUrl} target="_blank" rel="noreferrer" iconLeft={<Video className="size-3.5" />}>
              Join video call
            </ButtonLink>
          ) : null}
          {showManage && a.canReschedule ? (
            <ButtonLink size="sm" variant="secondary" href={`/book/${a.type.slug}?reschedule=${a.id}`} iconLeft={<CalendarClock className="size-3.5" />}>
              Reschedule
            </ButtonLink>
          ) : null}
          {showManage && a.canCancel ? (
            <form action={cancelAppointmentAction}>
              <input type="hidden" name="appointmentId" value={a.id} />
              <Button size="sm" variant="ghost" type="submit">
                Cancel
              </Button>
            </form>
          ) : null}
          {showManage ? <span className="text-[12px] text-muted">24 hours&apos; notice</span> : null}
        </div>
      ) : locked ? (
        <p className="-mt-1 pb-3 pl-[88px] text-[12px] text-muted sm:pl-[132px]">{locked}</p>
      ) : !a.canReschedule && !a.canCancel && a.status === "confirmed" ? (
        <p className="-mt-1 pb-3 pl-[88px] text-[12px] text-muted sm:pl-[132px]">Inside 24 hours — call or email the care team to move this.</p>
      ) : null}
    </li>
  );
}

export function PastRow({ a, canBookAgain }: { a: Appointment; canBookAgain: boolean }) {
  const missed = a.status === "no-show";
  return (
    <li>
      <AppointmentRow a={a} />
      {missed ? (
        <div className="-mt-1 flex flex-wrap items-center gap-2 pb-3 pl-[88px] sm:pl-[132px]">
          {canBookAgain ? (
            <ButtonLink size="sm" variant="secondary" href={`/book/${a.type.slug}${a.programmeStepId ? `?step=${a.programmeStepId}` : ""}`}>
              Book again
            </ButtonLink>
          ) : (
            <span className="text-[12px] text-muted">Rebook once booking is open again</span>
          )}
        </div>
      ) : null}
    </li>
  );
}
