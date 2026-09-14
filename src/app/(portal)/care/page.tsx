import { requireUser } from "@/lib/auth";
import { loadJourney } from "@/lib/portal/journey";
import { getSemble } from "@/lib/semble";
import type { Clinician } from "@/lib/semble/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StatusTag } from "@/components/ui/status-tag";
import { CareCard } from "@/components/ui/care-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { clinicianDisplay, fmtDateTime, ROLE_LABEL } from "@/lib/format";
import { CalendarCheck, Clock, Mail, Phone, Users } from "lucide-react";
import type { ReactNode } from "react";

/* ---------------------------------------------------------------- pieces */

function TeamMember({ c, next }: { c: Clinician; next?: { startUtc: string; typeName: string } }) {
  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <Avatar first={c.firstName} last={c.lastName} role={c.role} size="lg" src={c.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-medium leading-snug">{clinicianDisplay(c)}</span>
          {next ? <StatusTag status="booked">Seeing you next</StatusTag> : null}
        </div>
        <div className="text-[12.5px] text-muted">
          {ROLE_LABEL[c.role]}
          {c.specialty && c.specialty !== ROLE_LABEL[c.role] ? ` · ${c.specialty}` : ""}
        </div>
        {c.registration ? <div className="text-[12px] tabular text-muted">{c.registration}</div> : null}
        {c.bio ? <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{c.bio}</p> : null}
        {next ? (
          <div className="mt-2 flex items-start gap-1.5 text-[12.5px] text-ink">
            <CalendarCheck className="mt-0.5 size-3.5 shrink-0 text-blue-text" />
            <span>
              Next: {fmtDateTime(next.startUtc)} · {next.typeName}
            </span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ContactRow({ href, icon, label, value, tabular = false }: { href: string; icon: ReactNode; label: string; value: string; tabular?: boolean }) {
  return (
    <a
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-md border border-divider px-3 py-2 transition-colors duration-150 hover:border-blue hover:bg-blue-wash"
    >
      <span className="shrink-0 text-blue-text" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
        <span className={`block truncate text-[14px] font-medium text-blue-text${tabular ? " tabular" : ""}`}>{value}</span>
      </span>
    </a>
  );
}

/* ---------------------------------------------------------------- page */

export default async function CarePage() {
  const user = await requireUser();
  const j = await loadJourney(user);

  const matched = j.careTeam.length > 0;
  const roster: Clinician[] = matched ? [] : (await getSemble().listClinicians()).filter((c) => c.role === "doctor");
  const team = matched ? j.careTeam : roster;

  const teamTitle = matched ? "Your clinicians" : "Your doctors";
  const teamSub = matched
    ? `${j.careTeam.length} clinician${j.careTeam.length === 1 ? "" : "s"} · you see the same people where the diary allows`
    : "Every consultation is with one of these doctors";

  const nextWith = (c: Clinician) => {
    const a = j.upcoming.find((x) => x.clinician.id === c.id);
    return a ? { startUtc: a.startUtc, typeName: a.type.name } : undefined;
  };

  return (
    <>
      <PageHeader title="Your care team" sub="The clinicians looking after you at Beyond BMI, and how to reach the clinic." />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ---------------- main ---------------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={teamTitle}
              sub={teamSub}
              action={matched ? <StatusTag status="done">Matched</StatusTag> : <StatusTag status="info">Not matched yet</StatusTag>}
            />
            {team.length ? (
              <>
                {!matched ? (
                  <p className="mb-4 text-[13.5px] leading-relaxed text-ink-soft">
                    You&apos;ll be matched with one of these doctors when you book your consultation. Whoever you see stays with you for your medical
                    reviews where the diary allows.
                  </p>
                ) : null}
                <ul className="divide-y divide-divider-soft">
                  {team.map((c) => (
                    <TeamMember key={c.id} c={c} next={nextWith(c)} />
                  ))}
                </ul>
                {matched ? (
                  <p className="mt-4 text-[12px] text-muted">
                    Registration numbers are the clinician&apos;s IMC, NMBI or CORU number. They also appear on your letters and prescriptions.
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyState icon={<Users className="size-6" />} title="Your care team appears here">
                As soon as your first appointment is booked, the clinicians looking after you are listed here with their role and registration
                details.
              </EmptyState>
            )}
          </Card>

          <Card>
            <CardHeader
              eyebrow="Care coordinator"
              title="How to reach us"
              sub="Joanna Bridgett looks after appointments, billing and documents — anything that isn't clinical."
            />
            <div className="flex items-start gap-3">
              <Avatar first="Joanna" last="Bridgett" role="care-coordinator" />
              <div className="min-w-0 flex-1 space-y-2">
                <ContactRow href="tel:+35319038441" icon={<Phone className="size-4" />} label="Phone" value="+353 1 903 8441" tabular />
                <ContactRow href="mailto:support@beyondbmi.ie" icon={<Mail className="size-4" />} label="Email" value="support@beyondbmi.ie" />
              </div>
            </div>
            <div className="mt-4 flex items-start gap-2 text-[13px] text-ink-soft">
              <Clock className="mt-0.5 size-4 shrink-0 text-blue-text" aria-hidden />
              <p>
                <span className="font-medium text-ink">Mon–Fri 09:00–17:30</span>, Dublin time. The team answers by phone or by email — both reach the
                same people. Outside those hours, email is picked up the next working morning.
              </p>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
              If something is clinical and urgent, use the numbers on the care card below rather than waiting for a reply.
            </p>
          </Card>

          <CareCard />
        </div>

        {/* ---------------- rail ---------------- */}
        <aside className="space-y-6">
          {j.nextAppointment ? (
            <Card tone="soft" className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[13.5px] font-medium">Next appointment</div>
                <StatusTag status="booked" />
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                {j.nextAppointment.type.name} · {fmtDateTime(j.nextAppointment.startUtc)}
                <br />
                {clinicianDisplay(j.nextAppointment.clinician)} · {ROLE_LABEL[j.nextAppointment.clinician.role]}
              </p>
              <ButtonLink href="/appointments" variant="link" size="sm" className="mt-2">
                All appointments →
              </ButtonLink>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="What your team does" sub="Who to expect, and what each of them looks after." />
            <dl className="space-y-3 text-[13px]">
              <div>
                <dt className="font-medium">Doctor</dt>
                <dd className="text-ink-soft">Medical review and prescribing — your health history, your treatment plan, and any prescription you need.</dd>
              </div>
              <div>
                <dt className="font-medium">Nurse</dt>
                <dd className="text-ink-soft">Medication and side effects — how to take it, what to expect, and what to do if something isn&apos;t settling.</dd>
              </div>
              <div>
                <dt className="font-medium">Dietitian</dt>
                <dd className="text-ink-soft">Nutrition — eating patterns, protein, and holding on to muscle while your weight comes down.</dd>
              </div>
              <div>
                <dt className="font-medium">Health coach</dt>
                <dd className="text-ink-soft">Habits — sleep, movement, and the routines that keep the change in place after the programme.</dd>
              </div>
            </dl>
            <p className="mt-3 text-[12px] text-muted">Letters and summaries from every appointment are in Documents.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
