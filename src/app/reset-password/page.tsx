import Link from "next/link";
import { finishResetAction } from "@/app/auth-actions";
import { AuthShell } from "@/components/shell/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string; code?: string; sent?: string }> }) {
  const sp = await searchParams;
  const error = sp.error ? decodeURIComponent(sp.error) : undefined;
  // Also the target of Cognito's reset email: /reset-password?email=<e>&code=<code> ("+" arrives as a space).
  const email = (sp.email ?? "").replace(/ /g, "+");
  return (
    <AuthShell title="Choose a new password" lead={sp.code ? "Choose a new password for your account." : "If an account exists for that email, a code is on its way. It can take a minute."}>
      <form action={finishResetAction} className="mt-8 space-y-4">
        <Field label="Email address" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} />
        </Field>
        <Field label="Code from the email" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required defaultValue={sp.code ?? ""} className="tabular" />
        </Field>
        <Field label="New password" htmlFor="password" hint="At least 8 characters, with upper and lower case letters, a number and a symbol." error={error}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Button type="submit" className="w-full" size="lg">
          Save password
        </Button>
        <Link className="block text-[13px] text-blue-text hover:underline" href="/forgot-password">
          Send a new code
        </Link>
      </form>
    </AuthShell>
  );
}
