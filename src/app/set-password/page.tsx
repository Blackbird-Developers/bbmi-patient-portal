import { redirect } from "next/navigation";
import { setPasswordAction } from "@/app/auth-actions";
import { pendingChallengeEmail } from "@/lib/auth";
import { AuthShell } from "@/components/shell/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export const dynamic = "force-dynamic";

/** First sign-in for an account the clinic created: Cognito asks for a new password. */
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const email = await pendingChallengeEmail();
  if (!email) redirect("/login");
  const sp = await searchParams;
  return (
    <AuthShell title="Choose your password" lead={`First sign-in for ${email}.`}>
      <form action={setPasswordAction} className="mt-8 space-y-4">
        <Field label="New password" htmlFor="password" hint="At least 8 characters, with upper and lower case letters, a number and a symbol." error={sp.error ? decodeURIComponent(sp.error) : undefined}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Button type="submit" className="w-full" size="lg">
          Continue
        </Button>
      </form>
    </AuthShell>
  );
}
