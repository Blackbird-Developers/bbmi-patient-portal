import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { Stat } from "@/components/ui/misc";
import { StatusTag } from "@/components/ui/status-tag";
import type { WeightSummary } from "@/lib/portal/journey";
import { relativeDay } from "@/lib/format";
import { Scale } from "lucide-react";

export function WeightCard({ w }: { w: WeightSummary }) {
  const down = w.changeKg < 0;
  return (
    <Card>
      <CardHeader eyebrow="This week" title="Weigh-in" sub={w.latestUtc ? `Last logged ${relativeDay(w.latestUtc)}` : "No weight logged yet"} action={w.weekDue ? <StatusTag status="pending">Due</StatusTag> : <StatusTag status="done">Logged</StatusTag>} />
      <div className="flex items-end justify-between gap-4">
        <div className="flex gap-6">
          <Stat label="Current" value={w.latestKg ? `${w.latestKg.toFixed(1)} kg` : "—"} />
          <Stat label="Since start" value={w.latestKg ? `${down ? "" : "+"}${w.changeKg.toFixed(1)} kg` : "—"} sub={w.latestKg ? `${w.changePct.toFixed(1)}%` : undefined} tone={down ? "positive" : "default"} />
        </div>
        <Sparkline values={w.series.slice(-10).map((s) => s.kg)} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ButtonLink href="/progress#log" variant={w.weekDue ? "primary" : "secondary"} iconLeft={<Scale className="size-4" />}>
          Log weight
        </ButtonLink>
        {w.targetKg ? <span className="text-[12.5px] text-muted">Goal {w.targetKg.toFixed(1)} kg{w.toTargetKg ? ` · ${Math.max(0, w.toTargetKg).toFixed(1)} kg to go` : ""}</span> : null}
      </div>
    </Card>
  );
}
