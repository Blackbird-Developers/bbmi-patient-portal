import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { PLANS } from "@/lib/portal/store";
import { continueAction, upgradeAction } from "@/app/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button, ButtonLink } from "@/components/ui/button";
import { Stat } from "@/components/ui/misc";
import { StatusTag } from "@/components/ui/status-tag";
import { euro, fmtDateYear } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Plan } from "@/lib/portal/types";
import { Check } from "lucide-react";

function PlanCard({ plan, badge, cta, note, action, highlight }: { plan: Plan; badge?: string; cta: string; note?: string; action: (formData: FormData) => Promise<void>; highlight?: boolean }) {
  return (
    <Card className={cn(highlight && "border-blue ring-2 ring-blue-soft")}>
      <CardHeader title={plan.name} sub={plan.blurb} action={badge ? <StatusTag status={highlight ? "book-now" : "info"}>{badge}</StatusTag> : undefined} />
      <div className="mb-4 text-2xl font-semibold tabular">{plan.priceLabel}</div>
      <ul className="mb-5 space-y-1.5 text-[13.5px]">
        {plan.includes.map((l) => (
          <li key={l} className="flex items-start gap-2 text-ink-soft">
            <Check className="mt-0.5 size-4 shrink-0 text-lime-deep" strokeWidth={2.5} /> {l}
          </li>
        ))}
      </ul>
      <form action={action}>
        <input type="hidden" name="plan" value={plan.id} />
        <Button type="submit" className="w-full" variant={highlight ? "primary" : "secondary"}>
          {cta}
        </Button>
      </form>
      {note ? <p className="mt-2 text-[12px] text-muted">{note}</p> : null}
    </Card>
  );
}

function Comparison() {
  const rows: [string, string, string, string][] = [
    ["Price", "€89 once", "€399 upfront or 3 × €150", "€75 / month (€150 full MDT)"],
    ["Doctor", "25-min consultation", "Reviews month 1 & 3", "Quarterly review"],
    ["Dietitian", "—", "Assessment + follow-up", "Async (monthly on full MDT)"],
    ["Health coach", "—", "Every month", "Async (monthly on full MDT)"],
    ["Nurse", "Day 5–7 call", "Month 2 check-in", "Monthly check-in"],
    ["Prescriptions", "30-day window", "Managed throughout", "Renewed at each review"],
    ["Community & content", "—", "Included", "Included"],
    ["Insurance documentation", "Yes", "Month 1", "—"],
  ];
  return (
    <Card>
      <CardHeader title="Compare" sub="Medication is paid separately at pharmacy cost on every plan." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13.5px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="py-2 pr-3 font-medium"> </th>
              <th className="py-2 pr-3 font-medium">Consultation</th>
              <th className="py-2 pr-3 font-medium">90-Day Programme</th>
              <th className="py-2 font-medium">Ongoing Care</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider-soft">
            {rows.map(([k, a, b, c]) => (
              <tr key={k}>
                <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                  {k}
                </th>
                <td className="py-2.5 pr-3 text-ink-soft">{a}</td>
                <td className="py-2.5 pr-3 text-ink-soft">{b}</td>
                <td className="py-2.5 text-ink-soft">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function PlansPage() {
  const user = await requireUser();
  const j = await loadJourney(user);
  const m = user.membership;
  const w = j.weight;
  const startBmi = user.goal.heightCm ? w.startKg / Math.pow(user.goal.heightCm / 100, 2) : undefined;

  let body: React.ReactNode;
  if (j.can.upgradeTo90Day) {
    body = (
      <>
        <Callout tone="info" title="Your consultation is complete">Continue with the 90-Day Programme when you&apos;re ready — your care coordinator will also call you around day 21 to talk it through. No pressure either way.</Callout>
        <div className="grid gap-6 md:grid-cols-2">
          <PlanCard plan={PLANS["ninety-day-upfront"]} badge="Save €51" cta="Pay €399 & start" note="One payment. Nothing further to pay." action={upgradeAction} highlight />
          <PlanCard plan={PLANS["ninety-day-instalments"]} badge="€450 total" cta="Pay €150 now · €450 total" note="3 monthly payments. Ends automatically after the third." action={upgradeAction} />
        </div>
      </>
    );
  } else if (j.can.chooseOngoing) {
    body = (
      <>
        <Card tone="positive">
          <CardHeader eyebrow="Your 90 days" title="Well done — here's where you are" sub={m.programmeStartUtc && m.programmeEndUtc ? `${fmtDateYear(m.programmeStartUtc)} to ${fmtDateYear(m.programmeEndUtc)}` : undefined} />
          <div className="flex flex-wrap gap-8">
            <Stat label="Since day one" value={`${w.changeKg <= 0 ? "" : "+"}${w.changeKg.toFixed(1)} kg`} sub={`${w.changePct.toFixed(1)}%`} tone={w.changeKg < 0 ? "positive" : "default"} />
            <Stat label="Appointments attended" value={j.past.filter((a) => a.status === "completed").length} />
            {w.bmi ? <Stat label="BMI now" value={w.bmi.toFixed(1)} sub={startBmi ? `From ${startBmi.toFixed(1)} at sign-up` : undefined} /> : null}
          </div>
        </Card>
        <div className="grid gap-6 md:grid-cols-2">
          <PlanCard plan={PLANS["ongoing-75"]} badge="Most choose this" cta="Continue · €75/month" note="Renews monthly. 30 days' notice to cancel." action={continueAction} highlight />
          <PlanCard plan={PLANS["ongoing-150"]} cta="Continue · €150/month" note="Renews monthly. 30 days' notice to cancel." action={continueAction} />
        </div>
        <Card tone="soft">
          <CardHeader title="Prefer a break?" sub="Nothing is deleted. Your prescription can be bridged while you decide — your doctor sets that up." />
          <ButtonLink href="/care" variant="secondary" size="sm">
            Talk to the team first
          </ButtonLink>
        </Card>
      </>
    );
  } else if (j.programme) {
    body = (
      <>
        <Card>
          <CardHeader eyebrow="Your plan" title={m.plan?.name ?? "90-Day Programme"} sub={m.plan?.priceLabel} action={<StatusTag status={j.programme.locked ? "paused" : "booked"}>{j.programme.locked ? "Paused" : `Day ${j.programme.day} of 90`}</StatusTag>} />
          <p className="text-[14px] text-ink-soft">Ongoing Care is offered when you complete the programme — your nurse talks you through the options on your day 80 call.</p>
          <ButtonLink href="/programme" variant="link" size="sm" className="mt-3">
            Your programme →
          </ButtonLink>
        </Card>
      </>
    );
  } else if (j.state === "legacy_member") {
    body = (
      <>
        <Card>
          <CardHeader eyebrow="Your plan" title={m.plan?.name ?? "Membership"} sub={m.plan?.priceLabel} action={<StatusTag status="done">Active</StatusTag>} />
          <ul className="grid gap-1.5 text-[13.5px] sm:grid-cols-2">
            {(m.plan?.includes ?? []).map((l) => (
              <li key={l} className="flex items-start gap-2 text-ink-soft">
                <Check className="mt-0.5 size-4 shrink-0 text-lime-deep" strokeWidth={2.5} /> {l}
              </li>
            ))}
          </ul>
        </Card>
        {j.can.adHoc ? (
          <Card>
            <CardHeader title="Extra sessions" sub="On demand, billed per session at booking" />
            <ul className="divide-y divide-divider-soft text-[13.5px]">
              {[
                ["Doctor · 20 min", 80, "adhoc-doctor"],
                ["Dietitian · 25 min", 60, "adhoc-dietitian"],
                ["Health coach · 25 min", 50, "adhoc-coach"],
                ["Nurse · 25 min", 40, "adhoc-nurse"],
              ].map(([t, p, slug]) => (
                <li key={String(t)} className="flex items-center justify-between gap-3 py-2.5">
                  <span>{t}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular font-medium">{euro(Number(p))}</span>
                    <ButtonLink href={`/book/${slug}`} size="sm" variant="secondary">
                      Book
                    </ButtonLink>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </>
    );
  } else if (j.state === "legacy_lapsed") {
    body = (
      <Card tone="notice">
        <CardHeader title="Continue your membership" sub="Your history, results and documents are kept." />
        <form action={continueAction}>
          <input type="hidden" name="plan" value="ongoing-150" />
          <Button type="submit">Continue · €150/month</Button>
        </form>
      </Card>
    );
  } else {
    body = (
      <Card>
        <CardHeader eyebrow="Your plan" title="Specialist consultation" sub="€89 once" action={<StatusTag status="done">Paid</StatusTag>} />
        <p className="text-[14px] text-ink-soft">Everything starts with a conversation. After your consultation your doctor will tell you whether the 90-Day Programme is right for you — there is nothing to decide now, and nothing further to pay unless you choose it.</p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Your plan options" sub="Clear, honest pricing. You only ever pay for the next stage when you choose to take it." />
      <div className="space-y-6">
        {body}
        <Comparison />
      </div>
    </>
  );
}
