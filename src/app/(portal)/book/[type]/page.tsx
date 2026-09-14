import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { getSemble } from "@/lib/semble";
import { bookAction, rescheduleAction } from "@/app/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { ButtonLink } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import { clinicianDisplay, euro, fmtDate, fmtDateTime, ROLE_LABEL } from "@/lib/format";
import { SlotPicker, type PickerClinician, type PickerType } from "./slot-picker";
import { Lock } from "lucide-react";

const DAY = 86_400_000;
const RANGE_DAYS = 28;

function utcMidnight(iso: string) {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function BookPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ step?: string; reschedule?: string; date?: string; clinician?: string; error?: string }> }) {
  const { type: slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const semble = getSemble();
  const [j, types, allClinicians] = await Promise.all([loadJourney(user), semble.listAppointmentTypes(), semble.listClinicians()]);
  const type = types.find((t) => t.slug === slug);
  if (!type) notFound();

  const reschedule = sp.reschedule ? j.upcoming.find((a) => a.id === sp.reschedule) : undefined;
  if (sp.reschedule && !reschedule) notFound();
  const step = sp.step && j.programme ? j.programme.steps.find((s) => s.id === sp.step) : undefined;

  /* ---------- gates (server-decided, mirrored here) ---------- */
  let locked: { title: string; body: string; href?: string; label?: string } | undefined;
  if (reschedule && !reschedule.canReschedule) locked = { title: "This appointment can no longer be moved online", body: "Inside 24 hours, message the care team and they will do their best.", href: "/care", label: "Message the care team" };
  else if (!reschedule && !j.can.book) locked = { title: "Booking isn't open yet", body: j.bookingLockedReason ?? "Booking is not available on your current plan.", href: j.state === "consult_paid" ? "/forms/intake" : "/plans", label: j.state === "consult_paid" ? "Start questionnaire" : "See your options" };
  else if (sp.step && !step) locked = { title: "That programme step isn't available", body: "Go back to your programme to see what can be booked now.", href: "/programme", label: "Your programme" };
  else if (step && step.status === "booked") locked = { title: "Already booked", body: `${step.title} is booked for ${step.appointmentStartUtc ? fmtDateTime(step.appointmentStartUtc) : "a time"}. Move it from Appointments if you need a different time.`, href: "/appointments", label: "Appointments" };
  else if (step && step.status === "completed") locked = { title: "Already done", body: `${step.title} is complete.`, href: "/programme", label: "Your programme" };
  else if (step && step.status === "locked") locked = { title: "Not yet", body: `${step.title} opens from ${fmtDate(step.windowFromUtc!)}${step.after?.length ? `, once your earlier ${ROLE_LABEL[step.role].toLowerCase()} appointment is booked` : ""}.`, href: "/programme", label: "Your programme" };
  else if (j.programme?.locked) locked = { title: "Booking is paused", body: j.bookingLockedReason ?? "Pay your missed instalment to resume.", href: "/account/billing", label: "Billing" };

  /* ---------- range ---------- */
  const now = new Date();
  const leadFloor = new Date(now.getTime() + 12 * 3_600_000);
  let earliest = utcMidnight(leadFloor.toISOString());
  if (step?.windowFromUtc) earliest = new Date(Math.max(earliest.getTime(), utcMidnight(step.windowFromUtc).getTime()));
  if (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)) {
    const req = new Date(`${sp.date}T00:00:00Z`);
    if (req.getTime() > earliest.getTime()) earliest = req;
  }
  let rangeEnd = new Date(earliest.getTime() + RANGE_DAYS * DAY);
  let windowNote: string | undefined;
  let nextRangeHref: string | undefined = `/book/${slug}?${new URLSearchParams({ ...(sp.step ? { step: sp.step } : {}), ...(sp.reschedule ? { reschedule: sp.reschedule } : {}), date: new Date(rangeEnd).toISOString().slice(0, 10) }).toString()}`;
  if (step?.windowToUtc) {
    const cap = utcMidnight(step.windowToUtc);
    if (cap.getTime() < rangeEnd.getTime()) {
      rangeEnd = new Date(cap.getTime() + DAY);
      nextRangeHref = undefined;
      windowNote = `Your window for this appointment closes ${fmtDate(step.windowToUtc)}`;
    }
  }

  /* ---------- data for the picker ---------- */
  const roleClinicians = allClinicians.filter((c) => c.role === type.role);
  const usualId = user.careTeam[type.role];
  const clinicians: PickerClinician[] = roleClinicians.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, display: clinicianDisplay(c), isCareTeam: c.id === usualId }));
  const slots = locked ? [] : await semble.getAvailability({ appointmentTypeId: type.id, fromUtc: earliest.toISOString(), toUtc: rangeEnd.toISOString() });
  const pickerType: PickerType = {
    id: type.id,
    slug: type.slug,
    name: type.name,
    durationMinutes: type.durationMinutes,
    roleLabel: ROLE_LABEL[type.role] ?? type.role,
    format: type.slug === "nurse-call" ? "phone" : "video",
    priceLabel: type.price > 0 ? euro(type.price) : "Included in your plan",
    priceNote: type.price > 0 ? "billed to your card at booking" : undefined,
  };
  const questionnaireDone = j.state === "consult_paid" ? !user.onboarding.some((t) => t.id === "questionnaire" && !t.done) : undefined;

  return (
    <>
      <PageHeader
        eyebrow={reschedule ? "Reschedule" : step ? `90-Day Programme · Month ${step.month}` : "Book"}
        title={reschedule ? "Move your appointment" : type.name}
        sub={reschedule ? `${reschedule.type.name} · currently ${fmtDateTime(reschedule.startUtc)} with ${clinicianDisplay(reschedule.clinician)}` : step ? step.purpose : `${type.durationMinutes} min ${pickerType.format} with a ${pickerType.roleLabel.toLowerCase()}.`}
        actions={step ? <StatusTag status="info">Earliest {fmtDate(earliest.toISOString())}</StatusTag> : undefined}
      />

      {sp.error === "taken" ? (
        <Callout tone="warn" title="That time was just taken" className="mb-6">
          Pick another time — the list below is up to date.
        </Callout>
      ) : null}

      {locked ? (
        <Card className="max-w-[640px]">
          <CardHeader title={locked.title} action={<Lock className="size-5 text-muted" />} />
          <p className="text-[14px] text-ink-soft">{locked.body}</p>
          {locked.href ? (
            <div className="mt-4">
              <ButtonLink href={locked.href} variant="secondary">
                {locked.label}
              </ButtonLink>
            </div>
          ) : null}
        </Card>
      ) : (
        <SlotPicker
          slots={slots}
          clinicians={clinicians}
          type={pickerType}
          rangeStartUtc={earliest.toISOString()}
          rangeEndUtc={rangeEnd.toISOString()}
          initialClinicianId={sp.clinician ?? (reschedule ? reschedule.clinician.id : undefined)}
          initialDate={sp.date}
          programmeStepId={step?.id}
          reschedule={reschedule ? { appointmentId: reschedule.id, currentStartUtc: reschedule.startUtc, clinicianDisplay: clinicianDisplay(reschedule.clinician) } : undefined}
          questionnaireDone={questionnaireDone}
          nextRangeHref={nextRangeHref}
          windowNote={windowNote}
          action={reschedule ? rescheduleAction : bookAction}
        />
      )}
    </>
  );
}
