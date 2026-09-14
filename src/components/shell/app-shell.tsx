import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import type { PortalPatient } from "@/lib/portal/types";
import { STATE_LABEL } from "@/lib/portal/types";
import { RailNav, TabBar } from "./nav";
import { PersonaSwitcher } from "./persona-switcher";
import { signOutAction } from "@/app/actions";
import { LogOut } from "lucide-react";

export function AppShell({ user, children, badges, demoUsers, sembleMode }: { user: PortalPatient; children: ReactNode; badges?: Partial<Record<string, number>>; demoUsers: { userId: string; name: string; state: string; plan?: string }[]; sembleMode: "mock" | "graphql" }) {
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-paper focus:px-3 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>

      {/* ---- Desktop rail ---- */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-ink px-4 py-5 text-white lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2" aria-label="Beyond BMI home">
          <Image src="/brand/bb-icon-large.webp" alt="" width={32} height={32} className="size-8" priority />
          <span className="text-[17px] font-semibold tracking-tight">BeyondBMI</span>
        </Link>
        <RailNav badges={badges} />
        <div className="mt-auto space-y-3">
          <div className="rounded-lg bg-white/8 p-3">
            <div className="flex items-center gap-2.5">
              <Avatar first={user.firstName} last={user.lastName} size="sm" className="ring-offset-ink" />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{user.firstName} {user.lastName}</div>
                <div className="truncate text-[11px] text-dark-muted">{STATE_LABEL[user.membership.state]}</div>
              </div>
            </div>
            <form action={signOutAction} className="mt-2">
              <button className="flex items-center gap-1.5 text-[12px] text-dark-muted hover:text-white">
                <LogOut className="size-3.5" /> Sign out
              </button>
            </form>
          </div>
          <PersonaSwitcher users={demoUsers} currentId={user.userId} sembleMode={sembleMode} />
        </div>
      </aside>

      {/* ---- Main column ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-ink px-4 text-white lg:hidden">
          <Link href="/" className="flex items-center gap-2" aria-label="Beyond BMI home">
            <Image src="/brand/bb-icon-large.webp" alt="" width={26} height={26} className="size-[26px]" />
            <span className="text-[15px] font-semibold">BeyondBMI</span>
          </Link>
          <Link href="/account" aria-label="Account">
            <Avatar first={user.firstName} last={user.lastName} size="sm" className="ring-offset-ink" />
          </Link>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>

        <footer className="hidden px-8 pb-6 text-[11.5px] text-muted lg:block">
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-divider-soft pt-4">
            <span>Privamed Ltd t/a BeyondBMI · CRO 721679</span>
            <a className="hover:text-ink" href="https://beyondbmi.ie/privacy/">Privacy</a>
            <a className="hover:text-ink" href="https://beyondbmi.ie/terms/">Terms</a>
            <span>Not an emergency or general GP service — in an emergency call 999 or 112.</span>
            <Link className="ml-auto hover:text-ink" href="/architecture">
              About this prototype
            </Link>
          </div>
        </footer>
      </div>

      <TabBar badges={badges} />
    </div>
  );
}
