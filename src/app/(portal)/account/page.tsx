import { requireUser } from "@/lib/auth";
import { getSemble } from "@/lib/semble";
import { STATE_LABEL } from "@/lib/portal/types";
import { signOutAction } from "@/app/actions";
import { updateContactAction, updatePreferencesAction } from "./actions";
import { ContactForm } from "./contact-form";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusTag } from "@/components/ui/status-tag";
import { fmtDateYear } from "@/lib/format";
import Link from "next/link";
import { CreditCard, FileText, Download, ShieldCheck, LogOut } from "lucide-react";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ saved?: string; verify?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const p = await getSemble().getPatient(user.semblePatientId);
  const verified = user.userId !== "user-sean";

  return (
    <>
      <PageHeader title="Account" sub="Your details, plan, documents and privacy." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {sp.saved === "1" ? <Callout tone="positive" title="Contact details saved">Your clinical record has been updated too.</Callout> : null}
          {sp.saved === "prefs" ? <Callout tone="positive" title="Preferences saved" /> : null}
          {sp.verify ? (
            <Callout tone="info" title="Identity check">
              A quick photo-ID check (passport or driving licence, plus a selfie) is required before any prescription can be issued. It takes about 2 minutes and opens in a secure window. In this prototype the check is simulated.
            </Callout>
          ) : null}

          <Card>
            <CardHeader title="Profile" sub={`Patient reference ${p.reference ?? "—"} · this is what the team asks for on the phone`} />
            <div className="mb-5 flex items-center gap-4">
              <Avatar first={p.firstName} last={p.lastName} size="xl" />
              <div>
                <div className="text-lg font-semibold">
                  {p.firstName} {p.lastName}
                </div>
                <div className="text-[13px] text-muted">
                  {p.email} · {p.dob ? `born ${fmtDateYear(`${p.dob}T00:00:00Z`)}` : ""}
                </div>
                <div className="mt-1">
                  <StatusTag status="neutral">{STATE_LABEL[user.membership.state]}</StatusTag>
                </div>
              </div>
            </div>
            <ContactForm action={updateContactAction} phone={p.phone} address={p.address} />
            <p className="mt-3 text-[12px] text-muted">Name, date of birth and email are identity fields — to change them, call or email the care team.</p>
          </Card>

          <Card>
            <CardHeader title="Identity verification" sub="Required before any prescription" action={verified ? <StatusTag status="done">Verified</StatusTag> : <StatusTag status="pending">Not yet verified</StatusTag>} />
            <p className="text-[14px] text-ink-soft">{verified ? "Your photo ID was checked and matched. Nothing more to do." : "A 2-minute photo-ID check. Have your passport or driving licence to hand."}</p>
            {!verified ? (
              <div className="mt-4">
                <ButtonLink href="/account?verify=1" iconLeft={<ShieldCheck className="size-4" />}>
                  Verify identity
                </ButtonLink>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Communication preferences" sub="Appointment reminders always go out by email; SMS is optional." />
            <form action={updatePreferencesAction} className="space-y-3">
              {[
                ["receiveEmail", "Email", "Reminders, confirmations and letters from your care team", p.communicationPreferences?.receiveEmail ?? true],
                ["receiveSMS", "SMS", "Reminders the day before and 1 hour before appointments", p.communicationPreferences?.receiveSMS ?? true],
                ["promotionalMarketing", "News from Beyond BMI", "Occasional programme updates and webinars — never medication marketing", p.communicationPreferences?.promotionalMarketing ?? false],
              ].map(([name, label, hint, on]) => (
                <label key={String(name)} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-1 py-1.5 hover:bg-blue-wash">
                  <input type="checkbox" name={String(name)} defaultChecked={Boolean(on)} className="mt-1 size-4 accent-[#053F5C]" />
                  <span>
                    <span className="block text-[14px] font-medium">{label}</span>
                    <span className="block text-[12.5px] text-muted">{hint}</span>
                  </span>
                </label>
              ))}
              <Button type="submit" variant="secondary" size="sm">
                Save preferences
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Security" />
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="#" variant="secondary" size="sm">
                Change password
              </ButtonLink>
              <ButtonLink href="#" variant="secondary" size="sm">
                Set up 2-step sign-in
              </ButtonLink>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm" iconLeft={<LogOut className="size-4" />}>
                  Sign out everywhere
                </Button>
              </form>
            </div>
            <p className="mt-3 text-[12px] text-muted">Documents, prescriptions and billing ask for a second step when you sign in from a new device.</p>
          </Card>

          <Card>
            <CardHeader title="Data & privacy" />
            <ul className="space-y-2 text-[14px]">
              <li>
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input type="checkbox" defaultChecked className="mt-1 size-4 accent-[#053F5C]" />
                  <span>
                    <span className="block font-medium">Share a summary with my GP</span>
                    <span className="block text-[12.5px] text-muted">Your doctor sends a short update to your GP after key reviews. You can withdraw this at any time.</span>
                  </span>
                </label>
              </li>
              <li className="flex flex-wrap items-center gap-2 pt-2">
                <ButtonLink href="#" variant="secondary" size="sm" iconLeft={<Download className="size-4" />}>
                  Download my data
                </ButtonLink>
                <a className="text-[13px] text-blue-text hover:underline" href="https://beyondbmi.ie/privacy/">
                  Privacy policy
                </a>
                <a className="text-[13px] text-blue-text hover:underline" href="https://beyondbmi.ie/terms/">
                  Terms
                </a>
              </li>
            </ul>
            <p className="mt-3 text-[12px] text-muted">Your clinical record is held by Beyond BMI in Semble. Privamed Ltd t/a BeyondBMI, CRO 721679.</p>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader eyebrow="Your plan" title={user.membership.plan?.name ?? "No active plan"} sub={user.membership.plan?.priceLabel} />
            <ButtonLink href="/account/billing" variant="secondary" size="sm" className="w-full" iconLeft={<CreditCard className="size-4" />}>
              Billing & receipts
            </ButtonLink>
          </Card>
          <Card>
            <CardHeader title="Documents" sub="Letters, plans and insurance documentation" />
            <ButtonLink href="/documents" variant="secondary" size="sm" className="w-full" iconLeft={<FileText className="size-4" />}>
              Open documents
            </ButtonLink>
          </Card>
          <Card tone="soft" className="!p-4">
            <div className="text-[13.5px] font-medium">Need to change something we can&apos;t?</div>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">Name, date of birth, email or your doctor — <Link href="/care" className="text-blue-text hover:underline">call or email the care team</Link>.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
