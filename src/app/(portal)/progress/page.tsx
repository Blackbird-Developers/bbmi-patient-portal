import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { logWeightAction } from "@/app/actions";
import { recordWinAction } from "./actions";
import { WeightChart } from "./weight-chart";
import { WeightLogFields } from "./weight-log-fields";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Stat } from "@/components/ui/misc";
import { StatusTag } from "@/components/ui/status-tag";
import { fmtDayDate, relativeDay } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Scale, Sparkles } from "lucide-react";

const WINS_BY_STATE: Record<string, string[]> = {
  consult_done: ["Slept through the night", "Less snacking after dinner"],
  ninety_day_active: ["Walked to the shops instead of driving", "Cravings quieter in the evenings", "Trousers looser"],
  legacy_member: ["Cycled with the kids at the weekend", "Blood pressure down at the GP"],
  ninety_day_overdue: ["Kept the weekly walk going"],
  ninety_day_completed: ["Off the blood-pressure tablet — confirmed by Dr Hanlon", "Ran my first 5 km"],
};

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ logged?: string; error?: string; win?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const j = await loadJourney(user);
  const w = j.weight;
  const down = w.changeKg < 0;
  const baseline = j.state === "consult_paid";
  const series = w.series.slice().reverse();
  const wins = WINS_BY_STATE[j.state] ?? [];

  return (
    <>
      <PageHeader title="Progress" sub="Health gain over numbers — weigh in once a week." actions={w.weekDue ? <StatusTag status="pending">Weigh-in due</StatusTag> : <StatusTag status="done">Up to date</StatusTag>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {sp.logged ? <Callout tone="positive" title="Weight logged">Thanks — your care team sees this before your next appointment.</Callout> : null}
          {sp.error === "weight" ? <Callout tone="warn" title="That doesn't look like a weight">Weights are recorded between 40 kg and 400 kg.</Callout> : null}
          {sp.win ? <Callout tone="positive" title="Noted">Shared with your dietitian.</Callout> : null}

          <Card>
            <CardHeader eyebrow={baseline ? "Your starting point" : "Your trend"} title={baseline ? "Baseline from sign-up" : `${w.latestKg ? w.latestKg.toFixed(1) : "—"} kg`} sub={w.latestUtc ? `Last logged ${relativeDay(w.latestUtc)}` : undefined} />
            <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Current" value={w.latestKg ? `${w.latestKg.toFixed(1)} kg` : "—"} />
              <Stat label="Since start" value={w.latestKg && !baseline ? `${down ? "" : "+"}${w.changeKg.toFixed(1)} kg` : "—"} sub={w.latestKg && !baseline ? `${w.changePct.toFixed(1)}% · from ${w.startKg.toFixed(1)} kg` : `Start ${w.startKg.toFixed(1)} kg`} tone={down && !baseline ? "positive" : "default"} />
              <Stat label="Goal" value={w.targetKg ? `${w.targetKg.toFixed(1)} kg` : "—"} sub={w.toTargetKg && w.toTargetKg > 0 ? `${w.toTargetKg.toFixed(1)} kg to go` : w.targetKg ? "Reached" : undefined} />
              <Stat label="BMI" value={w.bmi ? w.bmi.toFixed(1) : "—"} sub={user.goal.heightCm ? `Height ${user.goal.heightCm} cm` : undefined} />
            </div>
            {!baseline ? <WeightChart series={w.series} targetKg={w.targetKg} startKg={w.startKg} /> : <p className="text-[14px] text-ink-soft">Your weight from sign-up is your starting point. Log a weight each week from your consultation onwards and your trend appears here.</p>}
            <p className="mt-3 text-[12px] text-muted">BMI is one signal among many — your doctor looks at the whole picture.</p>
          </Card>

          <Card id="log">
            <CardHeader title="Log this week's weight" sub="Same scales, same time of day, once a week." action={<Scale className="size-5 text-blue-text" />} />
            <form action={logWeightAction} className="space-y-4">
              <WeightLogFields lastKg={w.latestKg} />
              <Field label="Note" htmlFor="weight-note" hint="Optional — anything that explains this week.">
                <Input id="weight-note" name="note" maxLength={120} placeholder="For example: back from holidays" />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit">Log weight</Button>
                <span className="text-[12.5px] text-muted">Your doctor needs a weight from the last 45 days before a review.</span>
              </div>
            </form>
          </Card>

          {!baseline ? (
            <Card>
              <CardHeader title="History" sub={`${series.length} entr${series.length === 1 ? "y" : "ies"} · newest first`} />
              <ol className="divide-y divide-divider-soft">
                {series.map((e, i) => {
                  const prev = series[i + 1];
                  const delta = prev ? Math.round((e.kg - prev.kg) * 10) / 10 : undefined;
                  const raw = user.weights.find((x) => x.dateUtc === e.dateUtc);
                  return (
                    <li key={e.dateUtc} className="flex items-center gap-3 py-2.5 text-[14px]">
                      <span className="w-28 shrink-0 tabular text-muted">{fmtDayDate(e.dateUtc)}</span>
                      <span className="w-20 shrink-0 font-medium tabular">{e.kg.toFixed(1)} kg</span>
                      {delta !== undefined ? <span className={cn("w-20 shrink-0 tabular text-[13px]", delta < 0 ? "text-lime-text" : delta > 0 ? "text-amber" : "text-muted")}>{delta > 0 ? "+" : ""}{delta.toFixed(1)} kg</span> : <span className="w-20 shrink-0 text-[13px] text-muted">start</span>}
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{raw?.note ?? ""}</span>
                      <span className="text-[12px] text-muted">{raw?.source === "clinician" ? "clinic" : "you"}</span>
                    </li>
                  );
                })}
              </ol>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card id="wins">
            <CardHeader title="Beyond the scale" sub="Shared with your dietitian" action={<Sparkles className="size-5 text-blue-text" />} />
            {wins.length ? (
              <ul className="mb-4 space-y-1.5 text-[13.5px] text-ink-soft">
                {wins.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-lime-deep" aria-hidden /> {x}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={recordWinAction} className="space-y-3">
              <Field label="A win this week" htmlFor="win" hint="Sleep, energy, clothes, cravings — anything that isn't a number.">
                <Input id="win" name="win" maxLength={140} placeholder="For example: walked up the stairs without stopping" />
              </Field>
              <div className="flex flex-wrap gap-2">
                {["Slept better", "More energy", "Clothes fit better"].map((q) => (
                  <button key={q} type="submit" name="quick" value={q} className="min-h-9 rounded-full border border-divider bg-paper px-3 text-[12.5px] text-ink hover:border-blue hover:bg-blue-wash">
                    {q}
                  </button>
                ))}
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Save
              </Button>
            </form>
          </Card>

          <Card tone="soft" className="!p-4">
            <div className="text-[13.5px] font-medium">Why weekly</div>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">People who weigh in every week stay on treatment longer and lose more. Daily swings are water and salt, not fat — the weekly line is what matters.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
