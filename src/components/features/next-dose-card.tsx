import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import type { NextDose } from "@/lib/portal/journey";
import { fmtDate, fmtWeekday, relativeDay } from "@/lib/format";
import { Syringe } from "lucide-react";

export function NextDoseCard({ dose, compact = false }: { dose: NextDose; compact?: boolean }) {
  const when = dose.overdue ? `Due ${relativeDay(dose.dueUtc)}` : dose.dueInDays === 0 ? "Due today" : `${fmtWeekday(dose.dueUtc)} · ${relativeDay(dose.dueUtc)}`;
  return (
    <Card>
      <CardHeader eyebrow="Next injection" title={`${dose.doseMg} mg · ${dose.drug}`} sub={when} action={dose.overdue ? <StatusTag status="pending">Overdue</StatusTag> : dose.dueInDays <= 1 ? <StatusTag status="book-now">Due</StatusTag> : null} />
      <dl className="grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-muted">Suggested site</dt>
          <dd className="font-medium">{dose.suggestedSite.charAt(0).toUpperCase() + dose.suggestedSite.slice(1)}</dd>
        </div>
        <div>
          <dt className="text-muted">Last dose</dt>
          <dd className="font-medium">{dose.lastTakenUtc ? relativeDay(dose.lastTakenUtc) : "—"}</dd>
        </div>
      </dl>
      {dose.nextTitration && !compact ? (
        <p className="mt-3 rounded-md bg-blue-soft p-3 text-[13px] text-ink-soft">
          Your dose is due to step up to <strong className="text-ink">{dose.nextTitration.doseMg} mg</strong> from {fmtDate(dose.nextTitration.fromUtc)} ({dose.nextTitration.label}). Your doctor confirms this at your review.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink href="/treatment#log" iconLeft={<Syringe className="size-4" />}>
          Log dose
        </ButtonLink>
        <ButtonLink href="/treatment#missed" variant="ghost">
          Missed a dose?
        </ButtonLink>
      </div>
    </Card>
  );
}
