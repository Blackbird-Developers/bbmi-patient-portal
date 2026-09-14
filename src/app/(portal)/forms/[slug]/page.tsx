import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { submitFormAction } from "@/app/actions";
import { FORMS, SAMPLE_INTAKE_ANSWERS } from "../catalog";
import { FormRenderer } from "../form-renderer";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import { fmtDateYear, nowMs } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";

export default async function FormPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ done?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const def = FORMS[slug];
  if (!def) notFound();
  const user = await requireUser();
  const task = def.taskId ? user.onboarding.find((t) => t.id === def.taskId) : undefined;
  const alreadyDone = slug === "intake" && task?.done && !sp.done;

  if (sp.done) {
    return (
      <div className="mx-auto max-w-[640px]">
        <Card className="text-center">
          <CheckCircle2 className="mx-auto size-12 text-lime-deep" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Thank you</h1>
          <p className="mt-2 text-[15px] text-ink-soft">Your answers are saved to your clinical record and your care team can see them now.</p>
          <div className="mt-6">
            <ButtonLink href={def.doneHref} size="lg">
              {def.doneLabel}
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  if (alreadyDone) {
    const submitted = user.membership.programmeStartUtc ?? new Date(nowMs() - 12 * 86_400_000).toISOString();
    return (
      <div className="mx-auto max-w-[760px]">
        <PageHeader title={def.title} sub="Your answers, as your doctor sees them." actions={<StatusTag status="done">Submitted {fmtDateYear(submitted)}</StatusTag>} />
        <Card>
          {def.sections.map((s) => (
            <section key={s.title} className="mb-6 last:mb-0">
              <h2 className="mb-2 text-base font-semibold">{s.title}</h2>
              <dl className="divide-y divide-divider-soft">
                {s.questions.map((q) => (
                  <div key={q.id} className="grid gap-1 py-2.5 sm:grid-cols-[1fr_1.2fr] sm:gap-4">
                    <dt className="text-[13px] text-muted">{q.label}</dt>
                    <dd className="text-[14px]">{SAMPLE_INTAKE_ANSWERS[q.id] ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="mt-4 text-[12px] text-muted">To correct something, call or email the care team — your doctor updates the record.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title={def.title} sub={def.intro} />
      <Card>
        <CardHeader title="Your answers are private" sub="Only your care team sees them. Nothing here is used for marketing." />
        <FormRenderer def={def} action={submitFormAction} />
      </Card>
      <p className="mt-4 text-[12px] text-muted">In production, answers are written to the patient&apos;s Semble record through the questionnaire API and read back from the consultation your doctor sees.</p>
    </div>
  );
}
