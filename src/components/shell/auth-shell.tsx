import Image from "next/image";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

/** Two-column frame shared by sign-in, password reset and set-password. */
export function AuthShell({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2.5">
            <Image src="/brand/bb-icon.webp" alt="" width={36} height={36} className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight text-ink">BeyondBMI</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {lead ? <p className="mt-1 text-[15px] text-ink-soft">{lead}</p> : null}
          {children}
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
