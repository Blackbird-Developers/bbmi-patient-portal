import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { getSemble } from "@/lib/semble";
import type { Clinician, Message } from "@/lib/semble/types";
import { sendMessageAction } from "@/app/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Avatar } from "@/components/ui/avatar";
import { StatusTag } from "@/components/ui/status-tag";
import { CareCard } from "@/components/ui/care-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { clinicianDisplay, fmtDateYear, fmtDayDate, fmtDateTime, fmtTime, relativeDay, ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MessageComposer } from "./message-composer";
import { CalendarCheck, Lock, Mail, MessageSquare, Phone } from "lucide-react";

/* ---------------------------------------------------------------- helpers */

function dayLabel(iso: string) {
  const r = relativeDay(iso);
  if (r === "today") return "Today";
  if (r === "yesterday") return "Yesterday";
  return fmtDayDate(iso);
}

function groupByDay(messages: Message[]) {
  const groups: { key: string; label: string; items: Message[] }[] = [];
  for (const m of messages) {
    const key = fmtDateYear(m.sentAtUtc);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(m);
    else groups.push({ key, label: dayLabel(m.sentAtUtc), items: [m] });
  }
  return groups;
}

function doseReviewTemplate(j: Awaited<ReturnType<typeof loadJourney>>) {
  const d = j.nextDose;
  const w = j.weight;
  const dose = d ? `${d.doseMg} mg ${d.drug}${d.lastTakenUtc ? ` — last taken ${relativeDay(d.lastTakenUtc)}` : ""}` : "";
  const weight = w.latestKg ? `${w.latestKg.toFixed(1)} kg now · ${w.changeKg <= 0 ? "" : "+"}${w.changeKg.toFixed(1)} kg since I started` : "";
  return ["Dose review request", "", `Current dose: ${dose}`, "How I am tolerating it: ", "Side effects (what, how often, how bad): ", `Weight trend: ${weight}`, "Anything else my doctor should know: "].join("\n");
}

/* ---------------------------------------------------------------- pieces */

function Bubble({ m }: { m: Message }) {
  const unread = !m.readByPatient && m.from.kind !== "patient";
  const time = fmtTime(m.sentAtUtc);

  if (m.from.kind === "system") {
    return (
      <li className="flex justify-center">
        <div className={cn("max-w-[88%] rounded-md border px-4 py-2.5 text-center text-[13px] sm:max-w-[72%]", unread ? "border-lime-soft bg-lime-soft/40" : "border-divider-soft bg-paper-soft")}>
          {m.subject ? <div className="font-medium text-ink">{m.subject}</div> : null}
          <div className="text-ink-soft">{m.body}</div>
          <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-muted">
            <span className="tabular">{time}</span>
            {unread ? <span className="font-medium text-lime-text">New</span> : null}
          </div>
        </div>
      </li>
    );
  }

  if (m.from.kind === "patient") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[88%] sm:max-w-[76%]">
          <div className="rounded-lg rounded-br-sm bg-blue-soft px-4 py-3 text-[14px] leading-relaxed text-ink">{m.body}</div>
          <div className="mt-1 text-right text-[11px] text-muted">
            You · <span className="tabular">{time}</span>
          </div>
        </div>
      </li>
    );
  }

  const c = m.from.clinician;
  return (
    <li className="flex gap-3">
      <Avatar first={c.firstName} last={c.lastName} role={c.role} size="sm" className="mt-5" />
      <div className="max-w-[88%] min-w-0 sm:max-w-[76%]">
        <div className="mb-1 text-[12.5px] text-muted">
          <span className="font-medium text-ink">{clinicianDisplay(c)}</span> · {ROLE_LABEL[c.role]}
        </div>
        <div className={cn("rounded-lg rounded-tl-sm border bg-paper px-4 py-3 text-[14px] leading-relaxed", unread ? "border-lime" : "border-divider")}>
          {m.subject ? <div className="mb-1 font-medium">{m.subject}</div> : null}
          {m.body}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
          <span className="tabular">{time}</span>
          {unread ? (
            <span className="inline-flex items-center gap-1 font-medium text-lime-text">
              <span aria-hidden className="size-1.5 rounded-full bg-lime-deep" /> New
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function TeamMember({ c, next }: { c: Clinician; next?: { startUtc: string; typeName: string } }) {
  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <Avatar first={c.firstName} last={c.lastName} role={c.role} size="lg" src={c.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium leading-snug">{clinicianDisplay(c)}</div>
        <div className="text-[12.5px] text-muted">
          {ROLE_LABEL[c.role]}
          {c.specialty && c.specialty !== ROLE_LABEL[c.role] ? ` · ${c.specialty}` : ""}
        </div>
        {c.registration ? <div className="text-[12px] tabular text-muted">{c.registration}</div> : null}
        {c.bio ? <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{c.bio}</p> : null}
        {next ? (
          <div className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink">
            <CalendarCheck className="size-3.5 text-blue-text" />
            <span>
              Next: {fmtDateTime(next.startUtc)} · {next.typeName}
            </span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- page */

export default async function CarePage({ searchParams }: { searchParams: Promise<{ sent?: string; topic?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const j = await loadJourney(user);
  const semble = getSemble();
  const [messages, clinicians] = await Promise.all([semble.listMessages(user.semblePatientId), j.careTeam.length ? Promise.resolve<Clinician[]>([]) : semble.listClinicians()]);

  const groups = groupByDay(messages);
  const unread = messages.filter((m) => !m.readByPatient && m.from.kind !== "patient").length;
  const team = j.careTeam.length ? j.careTeam : clinicians.filter((c) => c.role === "doctor");
  const teamTitle = j.careTeam.length ? "Your care team" : "Your doctors";
  const teamSub = j.careTeam.length ? `${j.careTeam.length} clinician${j.careTeam.length === 1 ? "" : "s"} · continuity of care where possible` : "You'll be matched with one of these doctors when you book";
  const nextWith = (c: Clinician) => {
    const a = j.upcoming.find((x) => x.clinician.id === c.id);
    return a ? { startUtc: a.startUtc, typeName: a.type.name } : undefined;
  };
  const defaultBody = sp.topic === "dose-review" ? doseReviewTemplate(j) : "";

  return (
    <>
      <PageHeader title="Care" sub="Your care team, and a private line to your nurse." />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ---------------- messages ---------------- */}
        <div className="space-y-6">
          {sp.sent ? (
            <Callout tone="positive" title="Message sent">
              It has gone to your clinical record. Your nurse replies within 4 business hours; the care team within 1 working day.
            </Callout>
          ) : null}

          <Card>
            <CardHeader title="Messages" sub={unread ? `${unread} new` : messages.length ? "You're up to date" : "No messages yet"} action={unread ? <StatusTag status="info">{unread} unread</StatusTag> : null} />
            {groups.length ? (
              <div className="space-y-6">
                {groups.map((g) => (
                  <section key={g.key} aria-label={g.label}>
                    <div className="mb-3 flex items-center gap-3">
                      <span className="h-px flex-1 bg-divider-soft" aria-hidden />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</span>
                      <span className="h-px flex-1 bg-divider-soft" aria-hidden />
                    </div>
                    <ul className="space-y-4">
                      {g.items.map((m) => (
                        <Bubble key={m.id} m={m} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState icon={<MessageSquare className="size-6" />} title="Nothing here yet">
                When your nurse or the care team writes to you, it appears here and by email.
              </EmptyState>
            )}
          </Card>

          {j.can.message ? (
            <Card id="compose">
              <CardHeader title="Write to your care team" sub={sp.topic === "dose-review" ? "Dose review — we've started the message for you; edit anything that isn't right" : "Read by a person on your care team and saved to your clinical record"} />
              <MessageComposer action={sendMessageAction} defaultBody={defaultBody} defaultChannel="clinical" />
            </Card>
          ) : (
            <Card tone="soft">
              <CardHeader title="Messaging isn't included in your current plan" sub="You can still call or email the care team" />
              <p className="flex items-start gap-2 text-[14px] text-ink-soft">
                <Lock className="mt-0.5 size-4 shrink-0 text-blue-text" />
                <span>Clinical messaging with your nurse is included with the consultation for 30 days and throughout the 90-Day Programme and Ongoing Care. Your message history stays here.</span>
              </p>
              <div className="mt-4">
                <ButtonLink href="/plans" variant="secondary">
                  See your options
                </ButtonLink>
              </div>
            </Card>
          )}

          <CareCard compact />
        </div>

        {/* ---------------- care team ---------------- */}
        <aside className="space-y-6">
          <Card>
            <CardHeader title={teamTitle} sub={teamSub} />
            {team.length ? (
              <ul className="divide-y divide-divider-soft">
                {team.map((c) => (
                  <TeamMember key={c.id} c={c} next={nextWith(c)} />
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Your doctor is assigned when you book your consultation.</p>
            )}
          </Card>

          <Card>
            <CardHeader eyebrow="Care coordinator" title="Joanna Bridgett" sub="Appointments, billing, documents — anything that isn't clinical" />
            <div className="flex items-center gap-3">
              <Avatar first="Joanna" last="Bridgett" role="care-coordinator" />
              <ul className="min-w-0 space-y-1 text-[13.5px]">
                <li>
                  <a href="tel:+35319038441" className="inline-flex min-h-11 items-center gap-2 font-medium text-blue-text hover:underline">
                    <Phone className="size-4" /> <span className="tabular">+353 1 903 8441</span>
                  </a>
                </li>
                <li>
                  <a href="mailto:support@beyondbmi.ie" className="inline-flex min-h-11 items-center gap-2 font-medium text-blue-text hover:underline">
                    <Mail className="size-4" /> support@beyondbmi.ie
                  </a>
                </li>
              </ul>
            </div>
            <p className="mt-3 text-[12.5px] text-muted">Mon–Fri 09:00–17:30, Dublin time. Outside those hours, leave a message here and it is picked up the next working morning.</p>
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
        </aside>
      </div>
    </>
  );
}
