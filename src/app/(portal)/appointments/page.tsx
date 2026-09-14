import { requireUser } from "@/lib/auth";
import { loadJourney, type JourneyView } from "@/lib/portal/journey";
import { getSemble } from "@/lib/semble";
import type { AppointmentType } from "@/lib/semble/types";
import { payInstalmentAction } from "@/app/actions";
import { NextAppointmentCard } from "@/components/features/appointment-card";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { StatusTag } from "@/components/ui/status-tag";
import { euro, fmtDateTime, ROLE_LABEL } from "@/lib/format";
import { UpcomingRow, PastRow } from "./rows";
import { CalendarPlus, CalendarX2, CreditCard, Lock } from "lucide-react";

/* ---------------------------------------------------------------- booking CTA (mirrors the server's decision, never re-derives it) */

type BookCta =
  | { kind: "link"; href: string }
  | { kind: "locked"; reason: string; tone: "notice" | "warn" | "info"; action?: { href: string; label: string } | { pay: true } }
  | { kind: "none" };

function bookCta(j: JourneyView): BookCta {
  if (j.programme) {
    if (j.programme.locked) return { kind: "locked", tone: "warn", reason: j.bookingLockedReason ?? "Booking is paused until your missed instalment is paid.", action: { pay: true } };
    return { kind: "link", href: "/programme" };
  }
  switch (j.state) {
    case "consult_paid":
      return j.can.book ? { kind: "link", href: "/book/specialist-consultation" } : { kind: "locked", tone: "notice", reason: j.bookingLockedReason ?? "Complete your health questionnaire to unlock booking.", action: { href: "/forms/intake", label: "Start questionnaire" } };
    case "legacy_member":
      return { kind: "link", href: "/book/doctor-quarterly" };
    case "consult_done":
      return { kind: "locked", tone: "notice", reason: j.bookingLockedReason ?? "Start your 90-Day Programme to book with the care team.", action: { href: "/plans", label: "See your options" } };
    case "ninety_day_completed":
      return { kind: "locked", tone: "info", reason: "Your 90-Day Programme has finished. Choose Ongoing Care to book your next review — your history and results are kept either way.", action: { href: "/plans", label: "See your options" } };
    case "legacy_lapsed":
      return { kind: "locked", tone: "notice", reason: j.bookingLockedReason ?? "Booking is paused while your membership isn't active.", action: { href: "/plans", label: "Continue your membership" } };
    default:
      return j.bookingLockedReason ? { kind: "locked", tone: "notice", reason: j.bookingLockedReason } : { kind: "none" };
  }
}

function emptyUpcomingCopy(j: JourneyView): { title: string; body: string } {
  switch (j.state) {
    case "consult_paid":
      return j.can.book ? { title: "Nothing booked yet", body: "Pick a time with one of our doctors — 25 minutes by video." } : { title: "Nothing booked yet", body: "Booking opens as soon as your health questionnaire is in." };
    case "consult_done":
      return { title: "No upcoming appointments", body: "Your care coordinator calls you around day 21 — there is nothing to book for that." };
    case "ninety_day_overdue":
      return { title: "No upcoming appointments", body: "Pay the open instalment to book again. Anything you had booked is kept." };
    case "ninety_day_completed":
      return { title: "No upcoming appointments", body: "Your programme is complete. Ongoing Care adds a quarterly doctor review and a monthly nurse check-in." };
    case "legacy_member":
      return { title: "Nothing booked", body: "Your quarterly doctor review and monthly nurse check-in can be booked now." };
    default:
      return { title: "No upcoming appointments", body: "Use Book appointment to see available times." };
  }
}

/* ---------------------------------------------------------------- page */

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ booked?: string; cancelled?: string; rescheduled?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const j = await loadJourney(user);
  const adhoc: AppointmentType[] = j.can.adHoc ? (await getSemble().listAppointmentTypes()).filter((t) => t.slug.startsWith("adhoc-")) : [];

  const cta = bookCta(j);
  const [first, ...rest] = j.upcoming;
  const lockedMsg = !j.can.join ? (j.state === "ninety_day_overdue" ? "Joining is paused until your payment is resolved." : "Joining is paused while your membership isn't active.") : undefined;
  const booked = sp.booked ? j.upcoming.find((a) => a.id === sp.booked) : undefined;
  const rescheduled = sp.rescheduled ? j.upcoming.find((a) => a.id === sp.rescheduled) : undefined;
  const empty = emptyUpcomingCopy(j);

  return (
    <>
      <PageHeader
        title="Appointments"
        sub="Video appointments in Dublin time. Reminders go out the day before and 1 hour before."
        actions={
          cta.kind === "link" ? (
            <ButtonLink href={cta.href} iconLeft={<CalendarPlus className="size-4" />}>
              Book appointment
            </ButtonLink>
          ) : cta.kind === "locked" ? (
            <Button disabled iconLeft={<Lock className="size-4" />}>
              Book appointment
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ---------------- main ---------------- */}
        <div className="space-y-6">
          {booked ? (
            <Callout tone="positive" title="Appointment booked">
              {booked.type.name} · {fmtDateTime(booked.startUtc)} with {booked.clinician.title ? `${booked.clinician.title} ` : ""}
              {booked.clinician.fullName}. A confirmation and the video link are on their way by email.
            </Callout>
          ) : sp.booked ? (
            <Callout tone="positive" title="Appointment booked">A confirmation and the video link are on their way by email.</Callout>
          ) : null}
          {sp.cancelled ? (
            <Callout tone="info" title="Appointment cancelled">
              Nothing further to do. Book a new time whenever you are ready.
            </Callout>
          ) : null}
          {rescheduled ? (
            <Callout tone="positive" title="Appointment moved">
              Now {fmtDateTime(rescheduled.startUtc)} · {rescheduled.type.name}. Your reminders have been updated.
            </Callout>
          ) : sp.rescheduled ? (
            <Callout tone="positive" title="Appointment moved">Your reminders have been updated.</Callout>
          ) : null}

          {cta.kind === "locked" ? (
            <Callout
              tone={cta.tone}
              title={cta.tone === "warn" ? "Booking is paused" : "Booking isn't open yet"}
              action={
                cta.action && "pay" in cta.action ? (
                  <>
                    <form action={payInstalmentAction}>
                      <Button type="submit" size="sm" iconLeft={<CreditCard className="size-4" />}>
                        Pay instalment and resume
                      </Button>
                    </form>
                    <ButtonLink href="/account/billing" size="sm" variant="secondary">
                      Update card
                    </ButtonLink>
                  </>
                ) : cta.action ? (
                  <ButtonLink href={cta.action.href} size="sm" variant="secondary">
                    {cta.action.label}
                  </ButtonLink>
                ) : undefined
              }
            >
              {cta.reason}
            </Callout>
          ) : null}

          <section aria-labelledby="upcoming-heading" className="space-y-4">
            <h2 id="upcoming-heading" className="text-base font-semibold">
              Upcoming
            </h2>
            {first ? (
              <>
                <NextAppointmentCard a={first} canJoin={j.can.join} locked={lockedMsg} />
                {rest.length ? (
                  <Card>
                    <CardHeader title="Also booked" sub={`${rest.length} more`} />
                    <ul className="divide-y divide-divider-soft">
                      {rest.map((a) => (
                        <UpcomingRow key={a.id} a={a} canJoin={j.can.join} locked={lockedMsg} />
                      ))}
                    </ul>
                  </Card>
                ) : null}
              </>
            ) : (
              <EmptyState icon={<CalendarX2 className="size-6" />} title={empty.title} action={cta.kind === "link" ? <ButtonLink href={cta.href} variant="secondary" size="sm">Book appointment</ButtonLink> : undefined}>
                {empty.body}
              </EmptyState>
            )}
          </section>

          {j.past.length ? (
            <section aria-labelledby="past-heading" className="space-y-4">
              <h2 id="past-heading" className="text-base font-semibold">
                Past
              </h2>
              <Card>
                <CardHeader title="History" sub={`${j.past.length} appointment${j.past.length === 1 ? "" : "s"} · most recent first`} />
                <ul className="divide-y divide-divider-soft">
                  {j.past.map((a) => (
                    <PastRow key={a.id} a={a} canBookAgain={j.can.book} />
                  ))}
                </ul>
                <p className="mt-3 text-[12px] text-muted">Letters and summaries from these appointments are in Documents.</p>
              </Card>
            </section>
          ) : null}
        </div>

        {/* ---------------- rail ---------------- */}
        <aside className="space-y-6">
          {adhoc.length ? (
            <Card id="extra">
              <CardHeader eyebrow="Ongoing Care" title="Extra sessions" sub="Billed per session at booking." />
              <ul className="divide-y divide-divider-soft">
                {adhoc.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium leading-snug">{t.name.replace(/ — extra session$/, "")}</div>
                      <div className="text-[12.5px] text-muted">
                        {ROLE_LABEL[t.role]} · {t.durationMinutes} min · <span className="tabular">{euro(t.price)}</span>
                      </div>
                    </div>
                    <ButtonLink size="sm" variant="secondary" href={`/book/${t.slug}`}>
                      Book
                    </ButtonLink>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] text-muted">Card on file is charged when the booking is confirmed. Cancel with 24 hours&apos; notice for a full refund.</p>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="How appointments work" />
            <dl className="space-y-3 text-[13px]">
              <div>
                <dt className="font-medium">Joining</dt>
                <dd className="text-ink-soft">The Join button opens 60 minutes before the start and stays open for 2 hours after. Use a quiet spot with a steady connection.</dd>
              </div>
              <div>
                <dt className="font-medium">Reschedule or cancel</dt>
                <dd className="text-ink-soft">24 hours&apos; notice, from this page. Inside 24 hours, message the care team and they will do their best.</dd>
              </div>
              <div>
                <dt className="font-medium">Reminders</dt>
                <dd className="text-ink-soft">Email and SMS the day before and 1 hour before, with the video link.</dd>
              </div>
              {j.programme ? (
                <div>
                  <dt className="font-medium">Programme appointments</dt>
                  <dd className="text-ink-soft">
                    Book each one from your programme page, in order per role. <StatusTag status="locked">Not yet</StatusTag> means the window hasn&apos;t opened.
                  </dd>
                </div>
              ) : null}
            </dl>
            <ButtonLink href="/care" variant="link" size="sm" className="mt-3">
              Message the care team →
            </ButtonLink>
          </Card>
        </aside>
      </div>
    </>
  );
}
