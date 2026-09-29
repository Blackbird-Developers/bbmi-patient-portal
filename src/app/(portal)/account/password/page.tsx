import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { changePasswordAction } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const ERRORS: Record<string, string> = {
  "wrong-password": "Your current password isn't right.",
  "weak-password": "Use at least 8 characters with upper and lower case letters, a number and a symbol.",
  mismatch: "The two new passwords don't match.",
  "too-many": "Too many attempts. Wait a few minutes and try again.",
  unavailable: "We couldn't change your password just now. Try again in a moment.",
};

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  if (!user.backend) notFound(); // demo accounts have no password
  const sp = await searchParams;
  return (
    <div className="max-w-[560px]">
      <PageHeader title="Change password" sub="You'll stay signed in here and on your other devices. If someone else may know your password, also use Sign out on all devices on your Account page." />
      <Card>
        <form action={changePasswordAction} className="space-y-4">
          <Field label="Current password" htmlFor="current" error={sp.error === "wrong-password" ? ERRORS[sp.error] : undefined}>
            <Input id="current" name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password" htmlFor="password" hint="At least 8 characters, with upper and lower case letters, a number and a symbol." error={sp.error && sp.error !== "wrong-password" ? ERRORS[sp.error] ?? ERRORS.unavailable : undefined}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label="New password again" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Change password</Button>
            <ButtonLink href="/account" variant="ghost">
              Cancel
            </ButtonLink>
          </div>
        </form>
      </Card>
    </div>
  );
}
