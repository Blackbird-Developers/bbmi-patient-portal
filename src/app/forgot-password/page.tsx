import Link from "next/link";
import { requestResetAction } from "@/app/auth-actions";
import { AuthShell } from "@/components/shell/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Reset your password" lead="We'll email you a 6-digit code.">
      <form action={requestResetAction} className="mt-8 space-y-4">
        <Field label="Email address" htmlFor="email" error={sp.error === "too-many" ? "Too many attempts. Wait a few minutes and try again." : undefined}>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.ie" />
        </Field>
        <Button type="submit" className="w-full" size="lg">
          Send code
        </Button>
        <Link className="block text-[13px] text-blue-text hover:underline" href="/login">
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
