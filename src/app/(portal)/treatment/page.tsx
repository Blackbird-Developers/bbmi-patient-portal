import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { addDays } from "@/lib/portal/programme";
import { logDoseAction } from "@/app/actions";
import { DoseForm } from "./dose-form";
import { NextDoseCard } from "@/components/features/next-dose-card";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { ButtonLink } from "@/components/ui/button";
import { CareCard } from "@/components/ui/care-card";
import { EmptyState } from "@/components/ui/misc";
import { StatusTag, type Status } from "@/components/ui/status-tag";
import { clinicianDisplay, fmtDate, fmtDayDate, nowIso, nowMs, relativeDay } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Prescription } from "@/lib/semble/types";
import { Check, Lock, Package, Pill, Thermometer } from "lucide-react";

const SITE_LABEL: Record<string, string> = { "abdomen-left": "Abdomen L", "abdomen-right": "Abdomen R", "thigh-left": "Thigh L", "thigh-right": "Thigh R", "upper-arm-left": "Arm L", "upper-arm-right": "Arm R" };
const EFFECT_LABEL: Record<string, string> = { nausea: "Nausea", constipation: "Constipation", fatigue: "Tiredness", headache: "Headache", "injection-site": "Site reaction", dizziness: "Dizziness", other: "Other" };
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
    { t: rx.fulfilment?.method === "home-delivery" ? `Sent to ${rx.fulfilment.pharmacyName}` : `Sent to ${rx.fulfilment?.pharmacyName ?? "your pharmacy"}`, sub: reached >= 2 ? "Done" : "Pending" },
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

export default async function TreatmentPage({ searchParams }: { searchParams: Promise<{ logged?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const j = await loadJourney(user);
  const med = user.medication;
  const doses = user.doses.slice().sort((a, b) => b.takenAtUtc.localeCompare(a.takenAtUtc));
  const anchor = user.membership.programmeStartUtc ?? user.doses[0]?.takenAtUtc ?? nowIso();
  const dayNow = Math.floor((nowMs() - new Date(anchor).getTime()) / 86_400_000);
  const e89 = j.state === "consult_done" || j.state === "consult_paid" || j.state === "consult_booked";
  const consult = j.past.find((a) => a.type.slug === "specialist-consultation");

  if (!med || !j.nextDose) {
    return (
      <>
        <PageHeader title="Treatment" sub="Your medication, doses and prescriptions." />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <EmptyState icon={<Pill className="size-6" />} title="Nothing here yet">
              Medication may be prescribed after your consultation if your doctor decides it is right for you — it is never guaranteed. When it is, your dose schedule, log and prescription tracker appear here.
            </EmptyState>
            <CareCard compact />
          </div>
          <aside>
            <Card tone="soft" className="!p-4">
              <div className="text-[13.5px] font-medium">Before your consultation</div>
              <p className="mt-0.5 text-[12.5px] text-ink-soft">Your doctor reviews your questionnaire, history and goals, and talks through the options — including whether medication is appropriate and what to expect from it.</p>
            </Card>
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Treatment" sub={`${med.drug} · once-weekly injection · ${med.currentDoseMg} mg`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {sp.logged ? <Callout tone="positive" title="Dose logged">Thanks — your nurse sees your log and any side effects you ticked.</Callout> : null}

          <NextDoseCard dose={j.nextDose} />

          <Card id="log">
            <CardHeader title="Log a dose" sub="Takes 10 seconds. Helps your doctor see the real picture at review." />
            <DoseForm action={logDoseAction} doseMg={med.currentDoseMg} drug={med.drug} suggestedSite={j.nextDose.suggestedSite} />
          </Card>

          <Card id="missed">
            <CardHeader title="Missed a dose?" sub="The rule for a once-weekly injection" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-lime-soft p-4 text-[14px]">
                <div className="font-semibold text-lime-text">More than 3 days until your next dose</div>
                <p className="mt-1 text-ink-soft">Take the missed dose now, then carry on with your usual day.</p>
              </div>
              <div className="rounded-md bg-amber-soft p-4 text-[14px]">
                <div className="font-semibold text-amber">3 days or less until your next dose</div>
                <p className="mt-1 text-ink-soft">Skip it and take the next one on your usual day. Never take two doses within 3 days.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ButtonLink href="/care" variant="secondary" size="sm">
                Unsure? Message your nurse
              </ButtonLink>
              <span className="text-[12px] text-muted">Wording confirmed by the clinical team for this medication.</span>
            </div>
          </Card>

          <Card>
            <CardHeader title="Your titration plan" sub="Doses step up gradually so your body can adjust. Your doctor confirms each step." />
            <ol className="relative ml-2 space-y-4 border-l border-divider pl-5">
              {med.titration.map((t, i) => {
                const next = med.titration[i + 1];
                const current = t.fromDay <= dayNow && (!next || next.fromDay > dayNow);
                const past = next ? next.fromDay <= dayNow : false;
                return (
                  <li key={t.label} className="relative">
                    <span className={cn("absolute -left-[27px] top-1 size-3.5 rounded-full border-2 border-paper", current ? "bg-blue ring-2 ring-blue-soft" : past ? "bg-lime-deep" : "bg-divider")} aria-hidden />
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span className={cn("text-[14px] font-semibold tabular", !current && !past && "text-ink-soft")}>{t.doseMg} mg</span>
                      <span className="text-[13px] text-muted">
                        {t.label} · from {fmtDate(addDays(anchor, t.fromDay))}
                      </span>
                      {current ? <StatusTag status="booked">Current</StatusTag> : past ? <StatusTag status="done" /> : <StatusTag status="locked">Next</StatusTag>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Dose history" sub={`${doses.length} logged`} />
            {doses.length ? (
              <ol className="divide-y divide-divider-soft">
                {doses.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]">
                    <span className="w-28 tabular text-muted">{fmtDayDate(d.takenAtUtc)}</span>
                    <span className="w-16 font-medium tabular">{d.doseMg} mg</span>
                    <span className="w-24 text-[13px] text-ink-soft">{d.site ? SITE_LABEL[d.site] ?? d.site : "—"}</span>
                    <span className="flex flex-1 flex-wrap gap-1">
                      {(d.sideEffects ?? []).map((e) => (
                        <span key={e} className="rounded-full bg-amber-soft px-2 py-0.5 text-[11.5px] font-medium text-amber">
                          {EFFECT_LABEL[e] ?? e}
                        </span>
                      ))}
                      {!d.sideEffects?.length ? <span className="text-[12px] text-muted">No side effects</span> : null}
                    </span>
                    {d.note ? <span className="w-full text-[12.5px] text-muted sm:w-auto">{d.note}</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-muted">Your first logged dose appears here.</p>
            )}
          </Card>

          <section className="space-y-4">
            <div className="flex items-end justify-between">
              <h2 className="text-base font-semibold">Prescriptions</h2>
              <ButtonLink href="/care?topic=dose-review" variant="secondary" size="sm">
                Request a dose review
              </ButtonLink>
            </div>
            {e89 ? (
              <Callout tone="info" title="30-day prescription window">
                Prescriptions under the €89 consultation are valid for 30 days from your consultation{consult ? ` (${fmtDate(consult.startUtc)})` : ""}. Continued prescribing is part of the 90-Day Programme.
              </Callout>
            ) : null}
            {j.prescriptions.length ? (
              j.prescriptions.map((rx) => {
                const st = RX_STATUS[rx.status];
                return (
                  <Card key={rx.id}>
                    <CardHeader title={rx.drugs.map((d) => d.name).join(" · ")} sub={`Issued ${fmtDate(rx.issuedAtUtc)} · ${clinicianDisplay(rx.prescriber)}${rx.prescriber.registration ? ` · ${rx.prescriber.registration}` : ""}`} action={<StatusTag status={st.s}>{st.label}</StatusTag>} />
                    <ul className="space-y-1 text-[13.5px] text-ink-soft">
                      {rx.drugs.map((d) => (
                        <li key={d.name}>
                          {d.dosage}
                          {d.quantity ? ` · ${d.quantity}` : ""}
                        </li>
                      ))}
                    </ul>
                    <Tracker rx={rx} />
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <span className="text-[12px] text-muted">
                        <Package className="mr-1 inline size-3.5 text-blue-text" />
                        {rx.fulfilment?.method === "home-delivery" ? `Home delivery by ${rx.fulfilment.pharmacyName}` : `Collect from ${rx.fulfilment?.pharmacyName ?? "your pharmacy"}`}
                        {rx.fulfilment?.dispatchedAtUtc ? ` · dispatched ${relativeDay(rx.fulfilment.dispatchedAtUtc)}` : ""}
                      </span>
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted">
                      <Lock className="mt-px size-3.5 shrink-0" />
                      Your prescription goes straight from your doctor to the pharmacy — there is nothing for you to print or hand over. Medication is paid separately at pharmacy cost.
                    </p>
                  </Card>
                );
              })
            ) : (
              <EmptyState title="No prescriptions yet">When your doctor issues one it appears here with its delivery status.</EmptyState>
            )}
          </section>

          <CareCard />
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="How to inject" sub="Your nurse showed you — this is the reminder" />
            <ol className="space-y-2 text-[13.5px] text-ink-soft">
              {["Wash your hands. Check the pen: right dose, in date, clear liquid.", "Choose this week's site and clean it. Let the skin dry.", "Uncap. Press the pen flat to the skin and hold the button.", "Keep holding until the click and the count finish (about 10 seconds).", "Dispose of the pen in your sharps bin. Note the site in your log."].map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <CardHeader title="Storage" action={<Thermometer className="size-5 text-blue-text" />} />
            <ul className="space-y-1.5 text-[13.5px] text-ink-soft">
              <li>Keep unused pens in the fridge (2–8 °C), in the box.</li>
              <li>A pen in use can be kept at room temperature (below 30 °C) for up to 30 days.</li>
              <li>Never freeze. Keep away from direct heat and light.</li>
            </ul>
            <p className="mt-2 text-[11.5px] text-muted">General pen guidance — the leaflet with your medication takes precedence.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
