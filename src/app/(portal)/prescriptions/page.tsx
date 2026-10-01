import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { CareCard } from "@/components/ui/care-card";
import { EmptyState } from "@/components/ui/misc";
import { StatusTag, type Status } from "@/components/ui/status-tag";
import { clinicianDisplay, fmtDate, fmtDateYear, nowMs, relativeDay } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Pharmacy, Prescription, PrescriptionSend } from "@/lib/semble/types";
import { getSemble } from "@/lib/semble";
import { sendable, sendState } from "@/lib/pharmacy/send";
import { choosePharmacyAction, sendToPharmacyAction } from "./actions";
import { CalendarClock, Check, Lock, Mail, Package, Pill, Search, Thermometer } from "lucide-react";

/**
 * Prescriptions. Everything here comes from Semble: the script the doctor issued,
 * who issued it, and where it went. In Beyond BMI mode the patient picks a pharmacy
 * (from the pharmacy directory in Semble) and sends each prescription to it, once:
 * the portal emails Semble's PDF to the pharmacy (lib/pharmacy/send.ts).
 */

const SEND_ERRORS: Record<string, { title: string; body: string }> = {
  "no-pharmacy": { title: "Choose a pharmacy first", body: "Pick the pharmacy you want to use, then send the prescription." },
  "pharmacy-changed": { title: "Your pharmacy changed", body: "Nothing was sent. Check the pharmacy below, then press Send again." },
  "not-allowed": { title: "Sending isn't included in your plan right now", body: "Call the care team and they'll send it for you." },
  "too-new": { title: "Your doctor may still be finishing this prescription", body: "Try again in a few minutes." },
  "too-old": { title: "This prescription is too old to send from here", body: "Call the care team — they'll check it's still valid and send it for you." },
  "already-sent": { title: "This prescription has already been sent", body: "It can only be sent once. To use a different pharmacy, call the care team." },
  "in-progress": { title: "This prescription is being sent", body: "Give it a minute and refresh the page." },
  uncertain: { title: "We couldn't confirm this one was sent", body: "It may have reached the pharmacy. Please call the care team before trying again or choosing another pharmacy, so it isn't sent twice." },
  "no-pdf": { title: "This prescription isn't ready to send yet", body: "Your doctor may still be finishing it. Try again later, or call the care team." },
  mail: { title: "We couldn't send it just now", body: "It wasn't sent. Try again in a few minutes, or call the care team if it keeps happening." },
  "not-found": { title: "We couldn't find that prescription", body: "Refresh the page and try again." },
  "not-sendable": { title: "This prescription can't be sent", body: "It may have been cancelled or expired. Call the care team if you need a new one." },
  unavailable: { title: "Sending isn't available right now", body: "Try again in a few minutes, or call the care team." },
};

const RX_STATUS: Record<Prescription["status"], { s: Status; label: string }> = {
  issued: { s: "pending", label: "Issued" },
  sent: { s: "booked", label: "Sent to pharmacy" },
  dispensed: { s: "done", label: "Dispensed" },
  expired: { s: "neutral", label: "Expired" },
  cancelled: { s: "cancelled", label: "Cancelled" },
};

function Tracker({ rx, live, sent }: { rx: Prescription; live: boolean; sent?: PrescriptionSend }) {
  const portalSent = sent?.status === "sent";
  const reached = rx.status === "dispensed" ? 3 : rx.status === "sent" || portalSent ? 2 : 1;
  // Semble reports "issued" and "sent to pharmacy" only; collection, delivery and run-out dates aren't known to it.
  const all = [
    { t: "Issued", sub: fmtDate(rx.issuedAtUtc) },
    { t: `Sent to ${rx.fulfilment?.pharmacyName ?? (portalSent ? sent.pharmacyName : "your pharmacy")}`, sub: portalSent ? fmtDate(sent.atUtc) : reached >= 2 ? "Done" : "Pending" },
    { t: rx.fulfilment?.method === "home-delivery" ? "Dispatched to you" : "Ready to collect", sub: rx.fulfilment?.dispatchedAtUtc ? fmtDate(rx.fulfilment.dispatchedAtUtc) : reached >= 3 ? "Done" : "Within 2 working days" },
    { t: "Runs out", sub: rx.reviewDueUtc ? `~${fmtDate(rx.reviewDueUtc)}` : "—" },
  ];
  const steps = live ? all.slice(0, 2) : all;
  return (
    <ol className={cn("mt-4 grid gap-1", steps.length === 2 ? "grid-cols-2" : "grid-cols-4")}>
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

export default async function PrescriptionsPage({ searchParams }: { searchParams: Promise<{ q?: string; pharmacy?: string; sent?: string; send?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const j = await loadJourney(user);

  // Beyond BMI mode: the patient's chosen pharmacy, what was already sent, and (while choosing) search results.
  const canSend = !!user.backend && !!user.semblePatientId;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const semble = getSemble();
  const [chosen, sends, results] = canSend
    ? await Promise.all([
        // The choice must still be in the pharmacy directory (send() checks the same), else the patient re-chooses.
        semble
          .getPatientPharmacy(user.semblePatientId)
          .then(async (p) => (p && (await semble.getPharmacy(p.id)) ? p : p ? { ...p, gone: true as const } : null))
          .catch(() => null),
        // null = couldn't load what was already sent: Send buttons are withheld rather than risk a second send.
        semble.getPrescriptionSends(user.semblePatientId).catch(() => null as Record<string, PrescriptionSend> | null),
        q.length >= 2 ? semble.searchPharmacies(q).catch(() => [] as Pharmacy[]) : Promise.resolve([] as Pharmacy[]),
      ])
    : [null, {} as Record<string, PrescriptionSend>, [] as Pharmacy[]];
  const pharmacy: Pharmacy | null = chosen && !("gone" in chosen) ? chosen : null;
  const pharmacyGone = !!chosen && "gone" in chosen;
  const sendsUnknown = canSend && sends === null;
  const sent = sends ?? {};
  const choosing = canSend && (!pharmacy || sp.pharmacy === "change" || !!q);
  const sendError = sp.send ? (SEND_ERRORS[sp.send] ?? SEND_ERRORS.unavailable) : null;

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
      <PageHeader title="Prescriptions" sub={user.backend ? "Prescriptions your doctor issues appear here. Choose your pharmacy, then send each prescription to them — once." : "Prescriptions are issued by your doctor and go straight to the pharmacy — you never have to carry one. Each is tracked here, from issued to dispensed."} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ---------------- main ---------------- */}
        <div className="space-y-6">
          {sp.sent ? (
            <Callout tone={sp.sent === "outbox" ? "notice" : "positive"} title={sp.sent === "outbox" ? "Test mode: saved to the outbox, not emailed" : "We've emailed your prescription to the pharmacy"}>
              {sp.sent === "outbox" ? "The email with the prescription was written to the portal's local outbox instead of being sent." : "Contact them about collection or delivery. If they haven't received it within a working day, call the care team."}
            </Callout>
          ) : null}
          {sendsUnknown ? <Callout tone="warn" title="We couldn't check what you've already sent">Sending is paused for a moment so nothing goes twice. Refresh the page in a minute.</Callout> : null}
          {pharmacyGone ? <Callout tone="notice" title="Your pharmacy is no longer in our list">Please choose your pharmacy again before sending.</Callout> : null}
          {sendError ? <Callout tone="warn" title={sendError.title}>{sendError.body}</Callout> : null}
          {sp.pharmacy === "saved" ? <Callout tone="positive" title="Pharmacy saved">Your prescriptions can now be sent to {pharmacy?.name ?? "your pharmacy"}.</Callout> : null}
          {sp.pharmacy === "invalid" || sp.pharmacy === "error" ? <Callout tone="warn" title="We couldn't save that pharmacy">Search again and pick it from the list, or call the care team.</Callout> : null}

          {canSend ? (
            <Card id="pharmacy">
              <CardHeader title="Your pharmacy" sub="Where we email your prescriptions" action={<Mail className="size-5 text-blue-text" />} />
              {pharmacy && !choosing ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium">{pharmacy.name}</div>
                    <div className="text-[13px] text-muted">{[pharmacy.address, pharmacy.city, pharmacy.postcode].filter(Boolean).join(", ")}</div>
                  </div>
                  <ButtonLink href="/prescriptions?pharmacy=change#pharmacy" variant="secondary" size="sm">
                    Change pharmacy
                  </ButtonLink>
                </div>
              ) : (
                <>
                  <form method="get" action="/prescriptions#pharmacy" className="flex gap-2">
                    <input type="hidden" name="pharmacy" value="change" />
                    <Input name="q" defaultValue={q} placeholder="Pharmacy name or town" minLength={2} maxLength={60} aria-label="Search pharmacies by name or town" />
                    <Button type="submit" variant="secondary" iconLeft={<Search className="size-4" />}>
                      Search
                    </Button>
                  </form>
                  {q.length >= 2 ? (
                    results.length ? (
                      <ul className="mt-4 divide-y divide-divider-soft">
                        {results.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                              <div className="text-[14px] font-medium">{p.name}</div>
                              <div className="text-[12.5px] text-muted">{[p.address, p.city, p.county].filter(Boolean).join(", ")}</div>
                            </div>
                            {pharmacy?.id === p.id ? (
                              <span className="text-[13px] font-medium text-muted">Current</span>
                            ) : (
                              <form action={choosePharmacyAction}>
                                <input type="hidden" name="pharmacyId" value={p.id} />
                                <Button type="submit" size="sm" aria-label={`Choose ${p.name}${p.city ? `, ${p.city}` : ""}`}>
                                  Choose
                                </Button>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-[13.5px] text-ink-soft">No pharmacies match &ldquo;{q}&rdquo;. Try the town, or part of the name.</p>
                    )
                  ) : null}
                  {pharmacy ? (
                    <p className="mt-3 text-[12.5px] text-muted">
                      Currently: {pharmacy.name}.{" "}
                      <a href="/prescriptions" className="text-blue-text hover:underline">
                        Keep it
                      </a>
                    </p>
                  ) : null}
                </>
              )}
              <p className="mt-3 text-[12px] text-muted">Compare prices first if you like — nothing is sent until you press Send on a prescription.</p>
            </Card>
          ) : null}

          {prescriptions.length ? windowCallout : null}

          {prescriptions.length ? (
            prescriptions.map((rx, i) => {
              // A prescription the patient sent from the portal reads as sent, like one Semble sent itself.
              const st = rx.status === "issued" && sent[rx.id]?.status === "sent" ? RX_STATUS.sent : RX_STATUS[rx.status];
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

                  <Tracker rx={rx} live={!!user.backend} sent={sent[rx.id]} />

                  {canSend && rx.status === "issued" && !sendsUnknown
                    ? (() => {
                        const state = sendState(sent[rx.id]);
                        if (state === "sent") return null;
                        if (state === "sending") return <p className="mt-4 text-[13px] text-ink-soft">Sending to {sent[rx.id]!.pharmacyName}… refresh in a minute.</p>;
                        if (state === "uncertain") return <p className="mt-4 text-[13px] text-warn">We couldn&apos;t confirm this was sent to {sent[rx.id]!.pharmacyName}. It may have arrived — please call the care team before trying again.</p>;
                        const can = sendable(user, rx);
                        if (!can.ok) {
                          const why = SEND_ERRORS[can.code] ?? SEND_ERRORS.unavailable;
                          return <p className="mt-4 text-[13px] text-ink-soft">{why.title}. {why.body}</p>;
                        }
                        if (!pharmacy) return <p className="mt-4 text-[13px] text-ink-soft">Choose your pharmacy above to send this prescription.</p>;
                        return (
                          <form action={sendToPharmacyAction} className="mt-4 flex flex-wrap items-center gap-3">
                            <input type="hidden" name="prescriptionId" value={rx.id} />
                            <input type="hidden" name="pharmacyId" value={pharmacy.id} />
                            <Button type="submit" size="sm" iconLeft={<Mail className="size-4" />} aria-label={`Send ${rx.drugs.map((d) => d.name).join(", ")}, issued ${fmtDate(rx.issuedAtUtc)}, to ${pharmacy.name}`}>
                              Send to {pharmacy.name}
                            </Button>
                            <span className="text-[12px] text-muted">Sent once, by email. To change pharmacy afterwards, call the care team.</span>
                          </form>
                        );
                      })()
                    : null}

                  {/* Semble records the pharmacy, not whether it is collected or delivered. */}
                  {!user.backend || rx.fulfilment?.pharmacyName ? (
                    <p className="mt-4 text-[12px] text-muted">
                      <Package className="mr-1 inline size-3.5 text-blue-text" />
                      {user.backend ? `Pharmacy: ${rx.fulfilment?.pharmacyName}` : rx.fulfilment?.method === "home-delivery" ? `Home delivery by ${rx.fulfilment.pharmacyName ?? "your pharmacy"}` : `Collect from ${rx.fulfilment?.pharmacyName ?? "your pharmacy"}`}
                      {rx.fulfilment?.dispatchedAtUtc ? ` · dispatched ${relativeDay(rx.fulfilment.dispatchedAtUtc)}` : ""}
                    </p>
                  ) : null}

                  {i === 0 ? (
                    <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted">
                      <Lock className="mt-px size-3.5 shrink-0" />
                      {user.backend ? "We email the prescription straight to the pharmacy you choose — there is nothing for you to print or hand over. Medication is paid for at the pharmacy, at its prices." : "Your prescription goes straight from your doctor to the pharmacy — there is nothing for you to print or hand over. Medication is paid for separately, at pharmacy prices."}
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
              {/* General pen advice isn't signed off by the clinic yet — demo only. */}
              {!user.backend ? (
                <Card>
                  <CardHeader title="Storage" action={<Thermometer className="size-5 text-blue-text" />} />
                  <ul className="space-y-1.5 text-[13.5px] text-ink-soft">
                    <li>Keep unused pens in the fridge (2–8 °C), in the box.</li>
                    <li>A pen in use can be kept at room temperature (below 30 °C) for up to 30 days.</li>
                    <li>Never freeze. Keep away from direct heat and light.</li>
                  </ul>
                  <p className="mt-2 text-[11.5px] text-muted">General pen guidance — the leaflet that comes with your medication takes precedence.</p>
                </Card>
              ) : null}

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
