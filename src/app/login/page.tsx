import Image from "next/image";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listDemoUsers } from "@/lib/portal/store";
import { sembleMode } from "@/lib/semble";
import { signInAction, switchPersona } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { STATE_LABEL, type MemberState } from "@/lib/portal/types";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  const users = listDemoUsers();
  const mock = sembleMode() === "mock";
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2.5">
            <Image src="/brand/bb-icon.webp" alt="" width={36} height={36} className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight text-ink">BeyondBMI</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-[15px] text-ink-soft">Your appointments, treatment and progress in one place.</p>

          <form action={signInAction} className="mt-8 space-y-4">
            <Field label="Email address" htmlFor="email" error={sp.error === "unknown" ? "We couldn't find an account with that email." : undefined}>
              <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={sp.email ?? ""} placeholder="you@example.ie" />
            </Field>
            <Field label="Password" htmlFor="password" hint={mock ? "Demo mode — any password works." : undefined}>
              <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" />
            </Field>
            <Button type="submit" className="w-full" size="lg">
              Sign in
            </Button>
            <div className="flex justify-between text-[13px]">
              <a className="text-blue-text hover:underline" href="#">
                Forgot password?
              </a>
              <a className="text-blue-text hover:underline" href="https://beyondbmi.ie/book-assessment">
                New here? Book a consultation
              </a>
            </div>
          </form>

          {mock ? (
            <div className="mt-10 rounded-lg border border-divider bg-paper-soft p-4">
              <div className="eyebrow mb-2">Demo patients</div>
              <form action={switchPersona} className="grid gap-1">
                {users.map((u) => (
                  <button key={u.userId} name="userId" value={u.userId} className="flex items-center justify-between rounded-md px-3 py-2 text-left text-[13px] hover:bg-blue-soft">
                    <span className="font-medium text-ink">{u.name}</span>
                    <span className="text-[12px] text-muted">{STATE_LABEL[u.state as MemberState]}</span>
                  </button>
                ))}
              </form>
            </div>
          ) : null}

          <p className="mt-8 flex items-center gap-2 text-[12px] text-muted">
            <ShieldCheck className="size-4 text-blue-text" /> Encrypted, EU-hosted. Privamed Ltd t/a BeyondBMI.
          </p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink text-white lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_30%_20%,rgba(101,161,188,0.35),transparent),radial-gradient(40%_40%_at_80%_90%,rgba(165,219,115,0.18),transparent)]" />
        <div className="relative flex h-full flex-col justify-end p-16">
          <div className="eyebrow !text-lime">Medically led · Ireland-based</div>
          <h2 className="mt-3 max-w-[16ch] text-4xl font-semibold leading-tight tracking-tight">Care that stays with you the whole way.</h2>
          <p className="mt-4 max-w-[46ch] text-[15px] text-dark-muted">SCOPE-certified obesity doctors, dietitians, nurses and health coaches — and one place to see what happens next.</p>
          <div className="mt-10 flex gap-8 text-[13px] text-dark-muted">
            <div><span className="block text-2xl font-semibold text-white tabular">4.9</span>Google rating</div>
            <div><span className="block text-2xl font-semibold text-white tabular">3,000+</span>patients</div>
            <div><span className="block text-2xl font-semibold text-white tabular">100%</span>SCOPE-certified doctors</div>
          </div>
        </div>
      </div>
    </div>
  );
}
