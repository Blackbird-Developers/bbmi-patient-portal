import Link from "next/link";
import { resendVerificationAction, verifyEmailAction } from "@/app/auth-actions";
import { AuthShell } from "@/components/shell/auth-shell";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";

export const dynamic = "force-dynamic";

/** Target of the verification email: /verify?email=<e>&accessCode=<code> (Cognito CustomEmailSender). */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string; accessCode?: string; error?: string; resent?: string }> }) {
  const sp = await searchParams;
  const email = (sp.email ?? "").replace(/ /g, "+");
  return (
    <AuthShell title="Verify your email" lead="Confirm the address we'll use for your appointments and prescriptions.">
      {sp.resent ? <Callout tone="info" className="mt-6">If that address has an account waiting, a new link is on its way.</Callout> : null}
      <form action={verifyEmailAction} className="mt-8 space-y-4">
        <Field label="Email address" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} />
        </Field>
        <Field label="Code" htmlFor="code" error={sp.error ? decodeURIComponent(sp.error) : undefined}>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required defaultValue={sp.accessCode ?? ""} className="tabular" />
        </Field>
        <Button type="submit" className="w-full" size="lg">
          Verify email
        </Button>
      </form>
      <form action={resendVerificationAction} className="mt-3 flex items-center justify-between text-[13px]">
        <input type="hidden" name="email" value={email} />
        <button className="text-blue-text hover:underline">Send a new link</button>
        <Link className="text-blue-text hover:underline" href="/login">
          Sign in
        </Link>
      </form>
    </AuthShell>
  );
}
