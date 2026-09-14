import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { HeadlineCard } from "@/components/features/headline-card";
import { TaskList } from "@/components/features/task-list";
import { NextAppointmentCard } from "@/components/features/appointment-card";
import { WeightCard } from "@/components/features/weight-card";
import { ProgrammeSteps } from "@/components/features/programme-steps";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { CareCard } from "@/components/ui/care-card";
import { StatusTag } from "@/components/ui/status-tag";
import { clinicianDisplay, euro, fmtDate, nowMs, relativeDay, ROLE_LABEL } from "@/lib/format";
import { payInstalmentAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ArrowRight, Package, CreditCard, Users } from "lucide-react";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ welcome?: string; resumed?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const j = await loadJourney(user);
  const m = user.membership;
  const rx = j.activePrescription;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* ---------------- main column ---------------- */}
      <div className="space-y-6">
        {sp.welcome === "90day" ? (
          <Callout tone="positive" title="Welcome to your 90-Day Programme">Your care team has been told. Book your Month 1 appointments below — you can book all of them now.</Callout>
        ) : sp.welcome === "ongoing" ? (
          <Callout tone="positive" title="You're on Ongoing Care">Your first quarterly doctor review can be booked now. Your nurse check-in continues every month.</Callout>
        ) : sp.resumed ? (
          <Callout tone="positive" title="Payment received — your programme has resumed">Booking is open again and your appointments are unchanged.</Callout>
        ) : null}

        <HeadlineCard headline={j.headline} />

        {j.state === "ninety_day_overdue" && m.paymentIssue ? (
          <Card tone="warn">
            <CardHeader title="Pay your missed instalment to resume" sub={`${euro(m.nextChargeAmount ?? 150)} · instalment ${(m.instalmentsPaid ?? 0) + 1} of 3 · unsuccessful since ${fmtDate(m.paymentIssue.since)}`} />
            <p className="text-[14px] text-ink-soft">While the programme is paused you can&apos;t book or join appointments. Your appointments and your weight history are kept.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={payInstalmentAction}>
                <Button type="submit" iconLeft={<CreditCard className="size-4" />}>
                  Pay instalment and resume
                </Button>
              </form>
              <ButtonLink variant="secondary" href="/account/billing">
                Update card or manage plan
              </ButtonLink>
            </div>
            <p className="mt-3 text-[12px] text-muted">This opens the open Stripe invoice — you are never charged twice or asked to start a new plan.</p>
          </Card>
        ) : null}

        {j.nextAppointment ? <NextAppointmentCard a={j.nextAppointment} canJoin={j.can.join} locked={!j.can.join ? "Joining is paused until your payment is resolved." : undefined} /> : null}

        {j.state !== "consult_paid" ? <WeightCard w={j.weight} /> : null}

        {j.programme ? <ProgrammeSteps programme={j.programme} /> : null}

        <TaskList tasks={j.tasks} compact />

        {j.state === "consult_paid" ? (
          <Card>
            <CardHeader eyebrow="What happens next" title="Your first four weeks" />
            <ol className="grid gap-3 text-[14px] sm:grid-cols-2">
              {[
                ["Consultation", "25 minutes by video with a SCOPE-certified obesity doctor. History, goals and whether medication is right for you."],
                ["Your doctor's decision", "Medication may be prescribed if the doctor decides it is right for you — it is never guaranteed."],
                ["Day 5–7", "We'll call you to check how you're getting on with treatment and answer questions."],
                ["Day 21", "A care coordinator talks through your results so far and what a 90-Day Programme would look like."],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-3 rounded-md bg-paper-soft p-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{i + 1}</span>
                  <span>
                    <span className="block font-medium">{t}</span>
                    <span className="text-[13px] text-muted">{b}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {j.can.upgradeTo90Day ? (
          <Card tone="soft">
            <CardHeader eyebrow="When you're ready" title="Continue with the 90-Day Programme" sub="Three months of structured care with your doctor, dietitian, nurse and health coach." />
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/plans" iconRight={<ArrowRight className="size-4" />}>
                See your options
              </ButtonLink>
              <span className="text-[13px] text-ink-soft">€399 upfront or 3 payments of €150 · medication paid separately at pharmacy cost</span>
            </div>
          </Card>
        ) : null}

        <CareCard compact />
      </div>

      {/* ---------------- context rail ---------------- */}
      <aside className="space-y-6">
        {rx ? (
          <Card>
            <CardHeader eyebrow="Prescription" title={rx.drugs[0]?.name ?? "Prescription"} sub={`Issued ${fmtDate(rx.issuedAtUtc)} · ${clinicianDisplay(rx.prescriber)}`} />
            <div className="flex items-center gap-2 text-[13px]">
              <Package className="size-4 text-blue-text" />
              {rx.fulfilment?.method === "home-delivery" ? (
                <span>{rx.fulfilment.dispatchedAtUtc ? `Dispatched by ${rx.fulfilment.pharmacyName} ${relativeDay(rx.fulfilment.dispatchedAtUtc)}` : `${rx.fulfilment.pharmacyName} will dispatch within 2 working days`}</span>
              ) : (
                <span>Sent to {rx.fulfilment?.pharmacyName ?? "your pharmacy"}</span>
              )}
            </div>
            {rx.reviewDueUtc ? (
              <div className="mt-2 text-[12.5px] text-muted">
                Runs out around {fmtDate(rx.reviewDueUtc)} {new Date(rx.reviewDueUtc).getTime() - nowMs() < 10 * 86_400_000 ? <StatusTag status="pending" className="ml-1">Review soon</StatusTag> : null}
              </div>
            ) : null}
            <Link href="/prescriptions" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-blue-text hover:underline">
              Prescription details <ArrowRight className="size-3.5" />
            </Link>
          </Card>
        ) : null}

        <Card>
          <CardHeader eyebrow="Your care team" title={j.careTeam.length ? `${j.careTeam.length} clinicians` : "Assigned after your consultation"} />
          {j.careTeam.length ? (
            <ul className="space-y-3">
              {j.careTeam.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <Avatar first={c.firstName} last={c.lastName} role={c.role} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium">{clinicianDisplay(c)}</div>
                    <div className="truncate text-[12px] text-muted">{ROLE_LABEL[c.role]}{c.registration ? ` · ${c.registration}` : ""}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">You&apos;ll meet your doctor first. A nurse, dietitian and health coach join on the 90-Day Programme.</p>
          )}
          <ButtonLink href="/care" variant="secondary" size="sm" className="mt-4 w-full" iconLeft={<Users className="size-4" />}>
            Your care team
          </ButtonLink>
        </Card>

        {m.plan ? (
          <Card>
            <CardHeader eyebrow="Your plan" title={m.plan.name} sub={m.plan.priceLabel} />
            {m.nextChargeUtc && m.nextChargeAmount ? (
              <p className="text-[13px] text-ink-soft">
                Next payment {euro(m.nextChargeAmount)} on {fmtDate(m.nextChargeUtc)}
                {m.instalmentsPaid !== undefined && m.plan.id === "ninety-day-instalments" ? ` · ${m.instalmentsPaid} of 3 paid` : ""}
              </p>
            ) : m.plan.id === "consult-89" ? (
              <p className="text-[13px] text-ink-soft">Paid once. Nothing further to pay unless you choose the next stage.</p>
            ) : null}
            <Link href="/account/billing" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-blue-text hover:underline">
              Billing & receipts <ArrowRight className="size-3.5" />
            </Link>
          </Card>
        ) : null}

        {j.can.community ? (
          <Card tone="soft" className="!p-4">
            <div className="text-[13.5px] font-medium">Community</div>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">Recipes, questions and people on the same programme.</p>
            <a href="https://community.beyondbmi.ie?automatic_login=true" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-blue-text hover:underline">
              Open community <ArrowRight className="size-3.5" />
            </a>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
