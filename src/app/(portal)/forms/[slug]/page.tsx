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
import type { PortalPatient } from "@/lib/portal/types";
import { AutoRefresh, TallyEmbed } from "../tally-embed";

/** Beyond BMI's Tally forms (answers go to its backend by signed webhook). */
function tallyForm(user: PortalPatient, slug: string): { src: string; title: string; intro: string; done: boolean } | null {
  const b = user.backend;
  if (!b) return null;
  const base = (process.env.BBMI_TALLY_URL || "https://survey.beyondbmi.ie/").replace(/\/?$/, "/");
  const pid = `?patient_id=${encodeURIComponent(user.userId)}`;
  if (slug === "intake") return { src: b.surveyUrl, title: "Health questionnaire", intro: "About 8 minutes. Your doctor reads it before you meet.", done: b.surveyDone };
  if (slug === "ess-eq5d") return { src: `${base}ess-eq5d${pid}`, title: "Sleep & quality of life", intro: "Two short questionnaires your care team repeats every two months.", done: !b.essDue };
  if (slug === "health-coach" && b.healthCoachSurvey) return { src: `${base}${b.healthCoachSurvey.slug}${pid}`, title: "Before your health coach session", intro: "A few questions so your coach can prepare.", done: !b.healthCoachSurvey.show };
  return null;
}

export default async function FormPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ done?: string; submitted?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  if (user.backend) {
    const t = tallyForm(user, slug);
    if (!t) notFound();
    if (t.done || sp.submitted) {
      return (
        <div className="mx-auto max-w-[640px]">
          <Card className="text-center">
            <CheckCircle2 className={`mx-auto size-12 ${t.done ? "text-lime-deep" : "text-muted"}`} />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t.done ? "Thank you — that's in" : "Saving your answers…"}</h1>
            <p className="mt-2 text-[15px] text-ink-soft">{t.done ? "Your care team can see your answers now." : "This usually takes a few seconds."}</p>
            <div className="mt-6 flex flex-col items-center gap-3">
              {t.done ? (
                <ButtonLink href={slug === "intake" ? "/" : "/appointments"} size="lg">
                  Continue
                </ButtonLink>
              ) : (
                <AutoRefresh />
              )}
            </div>
          </Card>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-[760px]">
        <PageHeader title={t.title} sub={t.intro} />
        <Card className="!p-2 sm:!p-4">
          <TallyEmbed src={t.src} title={t.title} />
        </Card>
        <p className="mt-4 text-[12px] text-muted">Your answers go straight to your clinical team at Beyond BMI.</p>
      </div>
    );
  }
  const def = FORMS[slug];
  if (!def) notFound();
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
