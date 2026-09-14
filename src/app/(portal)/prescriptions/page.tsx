import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { ButtonLink } from "@/components/ui/button";
import { CareCard } from "@/components/ui/care-card";
import { EmptyState } from "@/components/ui/misc";
import { StatusTag, type Status } from "@/components/ui/status-tag";
import { clinicianDisplay, fmtDate, fmtDateYear, nowMs, relativeDay } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Prescription } from "@/lib/semble/types";
import { CalendarClock, Check, Lock, Package, Pill, Thermometer } from "lucide-react";

/**
 * Prescriptions — read-only. Everything here comes from Semble: the script the
 * doctor issued, who issued it, and where it went. There is nothing for the
 * patient to download: the prescription travels doctor → pharmacy.
 */

const RX_STATUS: Record<Prescription["status"], { s: Status; label: string }> = {
  issued: { s: "pending", label: "Issued" },
  sent: { s: "booked", label: "Sent to pharmacy" },
  dispensed: { s: "done", label: "Dispensed" },
  expired: { s: "neutral", label: "Expired" },
  cancelled: { s: "cancelled", label: "Cancelled" },
};

function Tracker({ rx }: { rx: Prescription }) {
  const reached = rx.status === "dispensed" ? 3 : rx.status === "sent" ? 2 : 1;
  const steps = [
    { t: "Issued", sub: fmtDate(rx.issuedAtUtc) },
    { t: `Sent to ${rx.fulfilment?.pharmacyName ?? "your pharmacy"}`, sub: reached >= 2 ? "Done" : "Pending" },
    { t: rx.fulfilment?.method === "home-delivery" ? "Dispatched to you" : "Ready to collect", sub: rx.fulfilment?.dispatchedAtUtc ? fmtDate(rx.fulfilment.dispatchedAtUtc) : reached >= 3 ? "Done" : "Within 2 working days" },
    { t: "Runs out", sub: rx.reviewDueUtc ? `~${fmtDate(rx.reviewDueUtc)}` : "—" },
  ];
  return (
    <ol className="mt-4 grid grid-cols-4 gap-1">
      {steps.map((s, i) => {
        const on = i < reached;
        return (
          <li key={s.t} className="min-w-0">
            <div className="mb-2 flex items-center">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", on ? "bg-lime-soft text-lime-text" : "bg-divider-soft text-muted")}>{on ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}</span>
              {i < steps.length - 1 ? <span className={cn("ml-1 h-0.5 flex-1 rounded", i < reached - 1 ? "bg-lime" : "bg-divider-soft")} aria-hidden /> : null}
            </div>
            <div className={cn("text-[12px] font-medium leading-tight", on ? "text-ink" : "text-muted")}>{s.t}</div>
            <div className="text-[11.5px] text-muted">{s.sub}</div>
          </li>
        );
      })}
    </ol>
  );
}

export default async function PrescriptionsPage() {
  const user = await requireUser();
  const j = await loadJourney(user);

  const prescriptions = j.prescriptions.slice().sort((a, b) => b.issuedAtUtc.localeCompare(a.issuedAtUtc));
  const e89 = j.state === "consult_paid" || j.state === "consult_booked" || j.state === "consult_done";
  const consult = j.past.find((a) => a.type.slug === "specialist-consultation");
  const runsOutUtc = prescriptions[0]?.reviewDueUtc;
  const runsOutAhead = runsOutUtc ? new Date(runsOutUtc).getTime() > nowMs() : false;

  /** €89 patients get one consultation and a 30-day prescribing window. Above the list when there is one; under the empty state when there isn't, so it never reads as a promise. */
  const windowCallout = e89 ? (
    <Callout tone="info" title="30-day prescription window">
      Prescriptions under the €89 consultation are valid for 30 days from your consultation{consult ? ` (${fmtDate(consult.startUtc)})` : ""}. Continued prescribing is part of the 90-Day Programme.
    </Callout>
  ) : null;

  return (
    <>
      <PageHeader title="Prescriptions" sub="Prescriptions are issued by your doctor and go straight to the pharmacy — you never have to carry one. Each is tracked here, from issued to dispensed." />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ---------------- main ---------------- */}
        <div className="space-y-6">
          {prescriptions.length ? windowCallout : null}

          {prescriptions.length ? (
            prescriptions.map((rx, i) => {
              const st = RX_STATUS[rx.status];
              return (
                <Card key={rx.id}>
                  <CardHeader
                    title={rx.drugs.map((d) => d.name).join(" · ")}
                    sub={`Issued ${fmtDateYear(rx.issuedAtUtc)} · ${clinicianDisplay(rx.prescriber)}${rx.prescriber.registration ? ` · ${rx.prescriber.registration}` : ""}`}
                    action={<StatusTag status={st.s}>{st.label}</StatusTag>}
                  />
                  <ul className="space-y-1 text-[13.5px] text-ink-soft">
                    {rx.drugs.map((d, di) => (
                      <li key={`${d.name}-${di}`}>
                        {rx.drugs.length > 1 ? <span className="font-medium text-ink">{d.name} · </span> : null}
                        {[d.dosage, d.quantity].filter(Boolean).join(" · ")}
                        {d.comments ? <span className="block text-[12.5px] text-muted">{d.comments}</span> : null}
                      </li>
                    ))}
                  </ul>

                  <Tracker rx={rx} />

                  <p className="mt-4 text-[12px] text-muted">
                    <Package className="mr-1 inline size-3.5 text-blue-text" />
                    {rx.fulfilment?.method === "home-delivery" ? `Home delivery by ${rx.fulfilment.pharmacyName ?? "your pharmacy"}` : `Collect from ${rx.fulfilment?.pharmacyName ?? "your pharmacy"}`}
                    {rx.fulfilment?.dispatchedAtUtc ? ` · dispatched ${relativeDay(rx.fulfilment.dispatchedAtUtc)}` : ""}
                  </p>

                  {i === 0 ? (
                    <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted">
                      <Lock className="mt-px size-3.5 shrink-0" />
                      Your prescription goes straight from your doctor to the pharmacy — there is nothing for you to print or hand over. Medication is paid for separately, at pharmacy prices.
                    </p>
                  ) : null}
                </Card>
              );
            })
          ) : (
            <EmptyState icon={<Pill className="size-6" />} title="No prescriptions yet">
              Medication may be prescribed after your consultation, if your doctor decides it is right for you — it is never guaranteed. If one is issued, it appears here and goes straight to the pharmacy.
            </EmptyState>
          )}

          {prescriptions.length ? null : windowCallout}

          <CareCard compact />
        </div>

        {/* ---------------- rail ---------------- */}
        <aside className="space-y-6">
          {prescriptions.length ? (
            <>
              <Card>
                <CardHeader title="Storage" action={<Thermometer className="size-5 text-blue-text" />} />
                <ul className="space-y-1.5 text-[13.5px] text-ink-soft">
                  <li>Keep unused pens in the fridge (2–8 °C), in the box.</li>
                  <li>A pen in use can be kept at room temperature (below 30 °C) for up to 30 days.</li>
                  <li>Never freeze. Keep away from direct heat and light.</li>
                </ul>
                <p className="mt-2 text-[11.5px] text-muted">General pen guidance — the leaflet that comes with your medication takes precedence.</p>
              </Card>

              <Card>
                <CardHeader title="Renewals" sub="Your doctor decides each one" action={<CalendarClock className="size-5 text-blue-text" />} />
                {runsOutUtc ? (
                  <p className="text-[13.5px] text-ink-soft">
                    {runsOutAhead ? `Your current prescription should last until around ${fmtDate(runsOutUtc)}.` : `Your most recent prescription ran out around ${fmtDate(runsOutUtc)}.`}
                  </p>
                ) : null}
                <p className={cn("text-[13.5px] text-ink-soft", runsOutUtc && "mt-2")}>Nothing renews on its own. Your doctor reviews how you are getting on at each review and issues the next prescription if it is still the right treatment for you.</p>
                <p className="mt-2 text-[13.5px] text-ink-soft">Running low is a good reason to get your next review in the diary — and a good thing to raise at it.</p>
                <ButtonLink href="/appointments" variant="link" size="sm" className="mt-3">
                  Your appointments →
                </ButtonLink>
                <p className="mt-3 text-[12px] text-muted">Clinic hours Mon–Fri 09:00–17:30 · +353 1 903 8441</p>
              </Card>
            </>
          ) : (
            <Card tone="soft" className="!p-4">
              <div className="text-[13.5px] font-medium">Before your consultation</div>
              <p className="mt-0.5 text-[12.5px] text-ink-soft">Your doctor reads your questionnaire, history and goals, then talks through the options with you — including whether medication is appropriate and what to expect from it.</p>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
