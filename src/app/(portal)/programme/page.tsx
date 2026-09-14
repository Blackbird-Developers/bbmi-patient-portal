import { requireUser } from "@/lib/auth";
import { loadJourney, type JourneyView } from "@/lib/portal/journey";
import { PLANS } from "@/lib/portal/store";
import { NINETY_DAY_STEPS } from "@/lib/portal/programme";
import type { ClinicianRole } from "@/lib/semble/types";
import { payInstalmentAction } from "@/app/actions";
import { ProgrammeSteps } from "@/components/features/programme-steps";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import { ProgressRing, Stat } from "@/components/ui/misc";
import { clinicianDisplay, daysBetween, euro, fmtDate, fmtDateTime, fmtDateYear, ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ArrowRight, Check, CreditCard } from "lucide-react";

/* ---------------------------------------------------------------- shared bits */

const ROLE_DOT: Record<string, string> = { doctor: "bg-blue", nurse: "bg-lime-deep", dietitian: "bg-amber", "health-coach": "bg-blue-text" };
const ALLOCATION_LABEL: Partial<Record<ClinicianRole, string>> = { doctor: "Doctor reviews", dietitian: "Dietitian sessions", "health-coach": "Health coach sessions", nurse: "Nurse check-in" };
const ROLE_ORDER: ClinicianRole[] = ["doctor", "dietitian", "health-coach", "nurse"];

function allocation(steps: NonNullable<JourneyView["programme"]>["steps"]) {
  return ROLE_ORDER.map((role) => {
    const s = steps.filter((x) => x.role === role && x.bookable);
    return { role, total: s.length, used: s.filter((x) => x.status === "booked" || x.status === "completed").length };
  }).filter((a) => a.total > 0);
}

/** The programme's structure — what it is, not who may book it. */
function ProgrammeOutline() {
  const bookable = NINETY_DAY_STEPS.filter((s) => s.bookable);
  const months = [1, 2, 3] as const;
  return (
    <Card>
      <CardHeader eyebrow="90-Day Programme" title="8 appointments over 3 months" sub="Doctor, dietitian, health coach and nurse — each in a window around its monthly target" />
      <div className="grid gap-4 sm:grid-cols-3">
        {months.map((m) => (
          <div key={m} className="rounded-md bg-paper-soft p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Month {m}</div>
            <ul className="space-y-2">
              {bookable
                .filter((s) => s.month === m)
                .map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-[13px]">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", ROLE_DOT[s.role] ?? "bg-muted")} aria-hidden />
                    <span>
                      <span className="block font-medium leading-snug">{s.title}</span>
                      <span className="text-[12px] text-muted">
                        {s.durationMinutes} min {s.format}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] text-muted">Plus a nurse call on day 5–7 and a results call on day 80 — we ring you for those.</p>
    </Card>
  );
}

function IncludesCard({ planId, title }: { planId: "ninety-day-upfront" | "ongoing-75" | "ongoing-150" | "legacy-150"; title: string }) {
  const plan = PLANS[planId];
  return (
    <Card>
      <CardHeader title={title} sub={plan.blurb} />
      <ul className="grid gap-2 text-[14px] sm:grid-cols-2">
        {plan.includes.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check className="mt-1 size-4 shrink-0 text-lime-deep" strokeWidth={2.5} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- active / paused programme */

function ActiveProgramme({ j }: { j: JourneyView & { programme: NonNullable<JourneyView["programme"]> } }) {
  const p = j.programme;
  const m = j.user.membership;
  const month = Math.min(3, Math.max(1, Math.ceil(p.day / 30)));
  const daysLeft = Math.max(0, daysBetween(new Date().toISOString(), p.endUtc));
  const alloc = allocation(p.steps);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {p.locked && m.paymentIssue ? (
          <Callout
            tone="warn"
            title="Your programme is paused"
            action={
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
            }
          >
            {m.paymentIssue.message} Booking and joining are paused until it is paid; everything you have booked and logged is kept.
          </Callout>
        ) : null}

        <ProgrammeSteps programme={p} />

        <Card>
          <CardHeader title="How booking works" sub="The rules the Book buttons above follow" />
          <dl className="grid gap-4 text-[13.5px] sm:grid-cols-2">
            <div>
              <dt className="font-medium">In order, per role</dt>
              <dd className="text-ink-soft">Your Month 3 doctor review unlocks once the Month 1 review is booked. The same goes for dietitian and health coach sessions.</dd>
            </div>
            <div>
              <dt className="font-medium">Windows of about ±7 days</dt>
              <dd className="text-ink-soft">Each appointment sits in a window around its monthly target. You can book up to 2 weeks before a window opens — &ldquo;Available from&rdquo; shows the earliest date.</dd>
            </div>
            <div>
              <dt className="font-medium">Reschedule or cancel · 24 hours&apos; notice</dt>
              <dd className="text-ink-soft">From Appointments. Inside 24 hours, message the care team.</dd>
            </div>
            <div>
              <dt className="font-medium">Your allocation</dt>
              <dd>
                <ul className="mt-1 space-y-1 text-ink-soft">
                  {alloc.map((a) => (
                    <li key={a.role} className="flex items-center justify-between gap-3">
                      <span>{ALLOCATION_LABEL[a.role] ?? ROLE_LABEL[a.role]}</span>
                      <span className="tabular text-ink">
                        {a.used} of {a.total} {a.used === a.total ? "used" : "booked or done"}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader eyebrow="Programme clock" title={`Day ${p.day} of 90`} sub={`Month ${month} of 3`} action={<ProgressRing value={p.pct} size={64} stroke={6} label={`${p.pct}%`} />} />
          <dl className="space-y-2.5 text-[13.5px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Started</dt>
              <dd className="tabular">{fmtDateYear(p.startUtc)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Ends</dt>
              <dd className="tabular">
                {fmtDateYear(p.endUtc)}
                {daysLeft ? <span className="text-muted"> · {daysLeft} days to go</span> : null}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Appointments</dt>
              <dd className="tabular">
                {p.done} of {p.steps.filter((s) => s.bookable).length} done
              </dd>
            </div>
            {m.plan?.id === "ninety-day-instalments" ? (
              m.paymentIssue ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Instalment {(m.instalmentsPaid ?? 0) + 1} of 3</dt>
                  <dd>
                    <StatusTag status="warn">Unsuccessful since {fmtDate(m.paymentIssue.since)}</StatusTag>
                  </dd>
                </div>
              ) : m.nextChargeUtc && m.nextChargeAmount ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Next instalment</dt>
                  <dd className="tabular">
                    {euro(m.nextChargeAmount)} on {fmtDate(m.nextChargeUtc)}
                    <span className="text-muted"> · {m.instalmentsPaid ?? 0} of 3 paid</span>
                  </dd>
                </div>
              ) : null
            ) : m.plan ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Payment</dt>
                <dd>Paid upfront · nothing further to pay</dd>
              </div>
            ) : null}
          </dl>
          <ButtonLink href="/account/billing" variant="link" size="sm" className="mt-3">
            Billing &amp; receipts →
          </ButtonLink>
        </Card>

        {j.nextAppointment ? (
          <Card tone="soft" className="!p-4">
            <div className="text-[13.5px] font-medium">Next appointment</div>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">
              {j.nextAppointment.type.name} · {fmtDateTime(j.nextAppointment.startUtc)} · {clinicianDisplay(j.nextAppointment.clinician)}
            </p>
            <ButtonLink href="/appointments" variant="link" size="sm" className="mt-2">
              All appointments →
            </ButtonLink>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Between appointments" />
          <ul className="space-y-2 text-[13.5px] text-ink-soft">
            <li>Weigh in once a week — it is the habit that matters most.</li>
            <li>Log each dose so your doctor sees the real picture at review.</li>
            <li>Side effects that are getting worse: message your nurse, don&apos;t wait for the next appointment.</li>
          </ul>
          <ButtonLink href="/care" variant="link" size="sm" className="mt-3">
            Message your nurse →
          </ButtonLink>
        </Card>
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- before the programme (€89 consultation) */

function BeforeProgramme({ j }: { j: JourneyView }) {
  const offer = j.can.upgradeTo90Day;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {offer ? (
          <Card tone="soft">
            <CardHeader eyebrow="When you're ready" title="Continue with the 90-Day Programme" sub="Three months of structured care with your doctor, dietitian, nurse and health coach." />
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/plans" iconRight={<ArrowRight className="size-4" />}>
                See your options
              </ButtonLink>
              <span className="text-[13px] text-ink-soft">€399 upfront or 3 payments of €150 · medication paid separately at pharmacy cost</span>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader eyebrow="Where you are" title="Specialist consultation" sub={j.user.membership.plan?.priceLabel ?? "€89 once"} action={<StatusTag status={j.nextAppointment ? "booked" : "pending"}>{j.nextAppointment ? "Booked" : "To book"}</StatusTag>} />
            <p className="text-[14px] text-ink-soft">The 90-Day Programme is the next stage after your consultation. Your doctor will talk through whether it is right for you; there is nothing to decide now.</p>
            <ButtonLink href={j.nextAppointment ? "/appointments" : "/"} variant="link" size="sm" className="mt-3">
              {j.nextAppointment ? "See your appointment →" : "Back to your next steps →"}
            </ButtonLink>
          </Card>
        )}

        <ProgrammeOutline />
        <IncludesCard planId="ninety-day-upfront" title="What the programme includes" />
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader title="Two ways to pay" />
          <dl className="space-y-3 text-[13.5px]">
            <div>
              <dt className="font-medium">{PLANS["ninety-day-upfront"].priceLabel}</dt>
              <dd className="text-ink-soft">One payment. Save €51.</dd>
            </div>
            <div>
              <dt className="font-medium">{PLANS["ninety-day-instalments"].priceLabel}</dt>
              <dd className="text-ink-soft">€450 in total, taken monthly. Ends automatically after the third payment.</dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] text-muted">Medication is paid separately at pharmacy cost. Insurance documentation is issued in Month 1.</p>
        </Card>
        {j.state === "consult_done" ? (
          <Card tone="soft" className="!p-4">
            <div className="text-[13.5px] font-medium">Day 21 call</div>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">Your care coordinator rings to go through your results so far and answer questions about the programme. No booking needed.</p>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- ongoing care (legacy_member) */

function OngoingCare({ j }: { j: JourneyView }) {
  const m = j.user.membership;
  const ent = m.entitlements;
  const nextByRole = (role: ClinicianRole) => j.upcoming.find((a) => a.clinician.role === role);
  const rx = j.activePrescription;

  const rows: { role: ClinicianRole; title: string; cadence: string; slug: string; show: boolean }[] = [
    { role: "doctor", title: "Quarterly doctor review", cadence: "Every 3 months · 10 min video", slug: "doctor-quarterly", show: ent.includes("book-doctor") },
    { role: "nurse", title: "Monthly nurse check-in", cadence: "Every month · 10 min video", slug: "nurse-checkin", show: ent.includes("book-nurse") },
    { role: "dietitian", title: "Dietitian follow-up", cadence: "Monthly · 45 min video", slug: "dietitian-followup", show: ent.includes("book-dietitian") },
    { role: "health-coach", title: "Health coach session", cadence: "Monthly · 30 min video", slug: "health-coach-session", show: ent.includes("book-health-coach") },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader eyebrow="Ongoing Care" title="Your schedule" sub={`${m.plan?.name ?? "Ongoing Care"} · ${m.plan?.priceLabel ?? ""}`} />
          <ul className="divide-y divide-divider-soft">
            {rows
              .filter((r) => r.show)
              .map((r) => {
                const next = nextByRole(r.role);
                return (
                  <li key={r.role} className="flex items-center gap-3 py-3">
                    <span className={cn("size-2 shrink-0 rounded-full", ROLE_DOT[r.role] ?? "bg-muted")} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium leading-snug">{r.title}</div>
                      <div className="text-[12px] text-muted">{next ? `${fmtDateTime(next.startUtc)} · ${clinicianDisplay(next.clinician)}` : r.cadence}</div>
                    </div>
                    {next ? (
                      <StatusTag status="booked" />
                    ) : j.can.book ? (
                      <ButtonLink size="sm" variant="secondary" href={`/book/${r.slug}`}>
                        Book
                      </ButtonLink>
                    ) : (
                      <StatusTag status="locked" />
                    )}
                  </li>
                );
              })}
            <li className="flex items-center gap-3 py-3">
              <span className="size-2 shrink-0 rounded-full bg-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium leading-snug">Prescription renewals</div>
                <div className="text-[12px] text-muted">{rx?.reviewDueUtc ? `Next review around ${fmtDate(rx.reviewDueUtc)} · ${clinicianDisplay(rx.prescriber)}` : "Managed by your doctor at each review"}</div>
              </div>
              <ButtonLink size="sm" variant="secondary" href="/treatment">
                Treatment
              </ButtonLink>
            </li>
          </ul>
          <p className="mt-3 text-[12px] text-muted">Reschedule or cancel with 24 hours&apos; notice from Appointments.</p>
        </Card>

        {m.programmeStartUtc && m.programmeEndUtc ? (
          <Card>
            <CardHeader title="Your 90-Day Programme" sub={`Completed · ${fmtDateYear(m.programmeStartUtc)} to ${fmtDateYear(m.programmeEndUtc)}`} action={<StatusTag status="done">Complete</StatusTag>} />
            <div className="flex flex-wrap gap-8">
              <Stat label="Since day one" value={`${j.weight.changeKg <= 0 ? "" : "+"}${j.weight.changeKg.toFixed(1)} kg`} sub={`${j.weight.changePct.toFixed(1)}% · from ${j.weight.startKg.toFixed(1)} kg`} tone={j.weight.changeKg < 0 ? "positive" : "default"} />
              <Stat label="Appointments attended" value={j.past.filter((a) => a.status === "completed").length} sub="including your consultation" />
            </div>
            <ButtonLink href="/documents" variant="link" size="sm" className="mt-3">
              Completion summary in Documents →
            </ButtonLink>
          </Card>
        ) : null}

        <IncludesCard planId={m.plan?.id === "ongoing-150" ? "ongoing-150" : m.plan?.id === "legacy-150" ? "legacy-150" : "ongoing-75"} title="What your plan includes" />
      </div>

      <aside className="space-y-6">
        {j.can.adHoc ? (
          <Card>
            <CardHeader eyebrow="On demand" title="Extra sessions" sub="Billed per session at booking" />
            <ul className="space-y-1.5 text-[13.5px]">
              <li className="flex justify-between gap-3">
                <span>Doctor · 20 min</span>
                <span className="tabular">{euro(80)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Dietitian · 25 min</span>
                <span className="tabular">{euro(60)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Health coach · 25 min</span>
                <span className="tabular">{euro(50)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Nurse · 25 min</span>
                <span className="tabular">{euro(40)}</span>
              </li>
            </ul>
            <ButtonLink href="/appointments#extra" variant="secondary" size="sm" className="mt-4 w-full">
              Book an extra session
            </ButtonLink>
          </Card>
        ) : null}

        <Card>
          <CardHeader eyebrow="Your plan" title={m.plan?.name ?? "Ongoing Care"} sub={m.plan?.priceLabel} />
          {m.nextChargeUtc && m.nextChargeAmount ? (
            <p className="text-[13px] text-ink-soft">
              Next payment {euro(m.nextChargeAmount)} on {fmtDate(m.nextChargeUtc)} · renews monthly, cancel any time
            </p>
          ) : null}
          <ButtonLink href="/account/billing" variant="link" size="sm" className="mt-3">
            Manage plan →
          </ButtonLink>
        </Card>
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- completed (ninety_day_completed) */

function CompletedProgramme({ j }: { j: JourneyView }) {
  const m = j.user.membership;
  const attendedIds = new Set(j.past.filter((a) => a.status === "completed" && a.programmeStepId).map((a) => a.programmeStepId));
  const bookable = NINETY_DAY_STEPS.filter((s) => s.bookable);
  const attended = bookable.filter((s) => attendedIds.has(s.id)).length;
  const w = j.weight;
  const down = w.changeKg < 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card tone="positive">
          <CardHeader eyebrow="Complete" title="Your 90 days" sub={m.programmeStartUtc && m.programmeEndUtc ? `${fmtDateYear(m.programmeStartUtc)} to ${fmtDateYear(m.programmeEndUtc)}` : undefined} action={<ProgressRing value={100} size={64} stroke={6} label="90" sub="of 90" />} />
          <div className="flex flex-wrap gap-8">
            <Stat label="Since day one" value={w.latestKg ? `${down ? "" : "+"}${w.changeKg.toFixed(1)} kg` : "—"} sub={w.latestKg ? `${w.changePct.toFixed(1)}% · ${w.startKg.toFixed(1)} kg to ${w.latestKg.toFixed(1)} kg` : undefined} tone={down ? "positive" : "default"} />
            <Stat label="Appointments attended" value={`${attended} of ${bookable.length}`} sub={attendedIds.has("nurse-day80") ? "plus your day 80 results call" : undefined} />
            {w.bmi ? <Stat label="BMI now" value={w.bmi.toFixed(1)} /> : null}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {j.can.chooseOngoing ? (
              <ButtonLink href="/plans" iconRight={<ArrowRight className="size-4" />}>
                See your options
              </ButtonLink>
            ) : null}
            <span className="text-[13px] text-ink-soft">Ongoing Care €75/month or full MDT €150/month — or take a break. Your history is kept either way.</span>
          </div>
        </Card>

        <Card>
          <CardHeader title="What you completed" sub="Your 8 programme appointments" />
          <ol className="divide-y divide-divider-soft">
            {bookable.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <span className={cn("size-2 shrink-0 rounded-full", ROLE_DOT[s.role] ?? "bg-muted")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium leading-snug">{s.title}</div>
                  <div className="text-[12px] text-muted">
                    Month {s.month} · {ROLE_LABEL[s.role]}
                  </div>
                </div>
                {attendedIds.has(s.id) ? <StatusTag status="done" /> : <StatusTag status="neutral">Not attended</StatusTag>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader title="What happens next" />
          <ol className="space-y-3 text-[13.5px]">
            {[
              ["Choose how to continue", "Ongoing Care keeps your doctor reviews, nurse check-ins and prescriptions going."],
              ["Your prescription", "Renewals continue only on an active plan. Your doctor's recommendation is in your completion summary."],
              ["Taking a break", "Nothing is deleted. Sign back in whenever you want to pick up again."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{i + 1}</span>
                <span>
                  <span className="block font-medium">{t}</span>
                  <span className="text-[12.5px] text-muted">{b}</span>
                </span>
              </li>
            ))}
          </ol>
          <ButtonLink href="/documents" variant="link" size="sm" className="mt-3">
            Completion summary in Documents →
          </ButtonLink>
        </Card>
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export default async function ProgrammePage() {
  const user = await requireUser();
  const j = await loadJourney(user);

  const sub = j.programme
    ? j.programme.locked
      ? "Paused — pay the open instalment to pick up where you left off."
      : "Eight appointments with your care team, booked in order as each window opens."
    : j.state === "legacy_member"
      ? "Your programme is complete. This is your Ongoing Care schedule."
      : j.state === "ninety_day_completed"
        ? "Your results, and how you'd like to continue."
        : "What the programme is and how it works — for when you're ready.";

  return (
    <>
      <PageHeader title="Your 90-Day Programme" sub={sub} />
      {j.programme ? <ActiveProgramme j={{ ...j, programme: j.programme }} /> : j.state === "legacy_member" || j.state === "legacy_lapsed" ? <OngoingCare j={j} /> : j.state === "ninety_day_completed" ? <CompletedProgramme j={j} /> : <BeforeProgramme j={j} />}
    </>
  );
}
