import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { getSemble } from "@/lib/semble";
import { payInstalmentAction } from "@/app/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusTag, type Status } from "@/components/ui/status-tag";
import { euro, fmtDate, fmtDateYear } from "@/lib/format";
import { Check, CreditCard, FileText } from "lucide-react";

const INV_STATUS: Record<string, { s: Status; label: string }> = {
  paid: { s: "done", label: "Paid" },
  unpaid: { s: "warn", label: "Unpaid" },
  refunded: { s: "neutral", label: "Refunded" },
  void: { s: "cancelled", label: "Void" },
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ portal?: string; cancel?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [j, invoices] = await Promise.all([loadJourney(user), getSemble().listInvoices(user.semblePatientId)]);
  const m = user.membership;
  const plan = m.plan;
  const overdue = j.state === "ninety_day_overdue" && m.paymentIssue;
  const planStatus: { s: Status; label: string } = overdue ? { s: "paused", label: "Paused — payment due" } : j.state === "consult_done" || j.state === "consult_paid" || j.state === "consult_booked" ? { s: "done", label: "Paid" } : j.state === "ninety_day_completed" ? { s: "done", label: "Completed" } : j.state === "legacy_lapsed" ? { s: "warn", label: "Inactive" } : { s: "done", label: "Active" };
  const totalPlan = plan?.id === "ninety-day-instalments" ? "€450 in total · 3 monthly payments of €150" : plan?.id === "ninety-day-upfront" ? "€399 · one payment, nothing further to pay" : plan?.id === "consult-89" ? "€89 · one payment" : plan ? `${plan.priceLabel} · renews monthly, cancel with 30 days' notice` : "";

  return (
    <>
      <PageHeader title="Billing & plan" sub="What you pay, when, and every receipt." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {overdue ? (
            <Card tone="warn">
              <CardHeader title="Pay your missed instalment to resume" sub={`${euro(m.nextChargeAmount ?? 150)} · instalment ${(m.instalmentsPaid ?? 0) + 1} of 3 · unsuccessful since ${fmtDate(m.paymentIssue!.since)}`} />
              <p className="text-[14px] text-ink-soft">{m.paymentIssue!.message} While the programme is paused you can&apos;t book or join appointments. Everything you&apos;ve booked and logged is kept.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={payInstalmentAction}>
                  <Button type="submit" iconLeft={<CreditCard className="size-4" />}>
                    Pay instalment and resume
                  </Button>
                </form>
                <ButtonLink variant="secondary" href="/account/billing?portal=1">
                  Update card
                </ButtonLink>
              </div>
              <p className="mt-3 text-[12px] text-muted">This opens the open invoice — you are never charged twice or asked to start a new plan.</p>
            </Card>
          ) : null}
          {sp.portal ? <Callout tone="info" title="Card and plan management">In production this opens the secure Stripe customer portal: update your card, download invoices, pause or cancel. In this prototype it is simulated.</Callout> : null}
          {sp.cancel ? (
            <Callout tone="notice" title="Cancelling or pausing">
              No one is cancelled without a conversation first: a nurse calls you within 5 days to make sure it is safe to pause or stop medication, and a coordinator talks through alternatives — pause for up to 30 days, a lighter plan, or just a break. Email support@beyondbmi.ie or use the message below and we start there. Ongoing Care needs 30 days&apos; notice.
            </Callout>
          ) : null}

          <Card>
            <CardHeader eyebrow="Your plan" title={plan?.name ?? "No active plan"} sub={totalPlan} action={<StatusTag status={planStatus.s}>{planStatus.label}</StatusTag>} />
            {plan ? (
              <ul className="mb-4 grid gap-1.5 text-[13.5px] sm:grid-cols-2">
                {plan.includes.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-ink-soft">
                    <Check className="mt-0.5 size-4 shrink-0 text-lime-deep" strokeWidth={2.5} /> {line}
                  </li>
                ))}
              </ul>
            ) : null}
            <dl className="grid gap-x-8 gap-y-2 text-[14px] sm:grid-cols-2">
              {m.programmeStartUtc && m.programmeEndUtc ? (
                <div>
                  <dt className="text-[12px] font-medium text-muted">Programme dates</dt>
                  <dd className="tabular">
                    {fmtDateYear(m.programmeStartUtc)} – {fmtDateYear(m.programmeEndUtc)}
                  </dd>
                </div>
              ) : null}
              {plan?.id === "ninety-day-instalments" ? (
                <div>
                  <dt className="text-[12px] font-medium text-muted">Instalments</dt>
                  <dd className="tabular">{m.instalmentsPaid ?? 0} of 3 paid</dd>
                </div>
              ) : null}
              {m.nextChargeUtc && m.nextChargeAmount && !overdue ? (
                <div>
                  <dt className="text-[12px] font-medium text-muted">Next payment</dt>
                  <dd className="tabular">
                    {euro(m.nextChargeAmount)} on {fmtDate(m.nextChargeUtc)}
                  </dd>
                </div>
              ) : null}
              {j.state === "consult_done" ? (
                <div className="sm:col-span-2">
                  <dt className="text-[12px] font-medium text-muted">What&apos;s next</dt>
                  <dd>
                    Nothing further to pay unless you choose the next stage.{" "}
                    <a href="/plans" className="text-blue-text hover:underline">
                      See your options
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <ButtonLink href="/account/billing?portal=1" variant="secondary" size="sm" iconLeft={<CreditCard className="size-4" />}>
                Update card
              </ButtonLink>
              <ButtonLink href="/account/billing?portal=1" variant="secondary" size="sm">
                Manage plan
              </ButtonLink>
              {m.nextChargeUtc ? (
                <ButtonLink href="/account/billing?cancel=1" variant="ghost" size="sm">
                  Cancel or pause
                </ButtonLink>
              ) : null}
            </div>
            <p className="mt-3 text-[12px] text-muted">We email you 3 days before each payment. Medication is paid separately at pharmacy cost.</p>
          </Card>

          <Card>
            <CardHeader title="Receipts & invoices" sub={`${invoices.length} · newest first · itemised for insurance claims`} />
            {invoices.length ? (
              <ul className="divide-y divide-divider-soft">
                {invoices.map((inv) => {
                  const st = INV_STATUS[inv.status] ?? INV_STATUS.paid;
                  return (
                    <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-[14px]">
                      <span className="w-24 shrink-0 tabular text-muted">{fmtDate(inv.issuedAtUtc)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{inv.description}</span>
                        <span className="block text-[12px] tabular text-muted">
                          {inv.number} · {inv.source === "stripe" ? "Stripe" : "Clinic"}
                        </span>
                      </span>
                      <span className="w-16 text-right font-semibold tabular">{euro(inv.amount)}</span>
                      <StatusTag status={st.s}>{st.label}</StatusTag>
                      {inv.downloadable ? (
                        <a href={`/api/demo/pdf?kind=invoice&id=${inv.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-blue-text hover:underline">
                          <FileText className="size-3.5" /> Receipt
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">No payments yet.</p>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="How billing works" />
            <ul className="space-y-2 text-[13.5px] text-ink-soft">
              <li>The full cost of a plan is shown before you pay, and again here.</li>
              <li>Instalment plans end automatically after the last payment — they are not subscriptions.</li>
              <li>If a payment fails you get an email straight away, and 7 days to sort it before anything pauses.</li>
              <li>Ongoing Care renews monthly; 30 days&apos; notice to cancel, by email or phone.</li>
            </ul>
          </Card>
          <Card tone="soft" className="!p-4">
            <div className="text-[13.5px] font-medium">Insurance</div>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">Every receipt is itemised for private health-insurance claims. Insurance documentation for the programme is in Documents.</p>
            <a href="/documents?kind=insurance" className="mt-2 inline-block text-[13px] font-medium text-blue-text hover:underline">
              Insurance documents →
            </a>
          </Card>
        </aside>
      </div>
    </>
  );
}
