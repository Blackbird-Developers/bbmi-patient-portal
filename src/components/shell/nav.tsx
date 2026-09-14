"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, HeartHandshake, Home, Pill, TrendingDown, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Appointments is a top-level destination: it is the first thing a patient
 * comes here to check. Booking and the 90-day programme sit under it, because
 * both are ways of getting something into the diary. Care keeps the people and
 * the paperwork.
 *
 * `railOnly` items appear in the desktop rail but not the mobile tab bar —
 * Account is already reachable from the avatar in the mobile top bar, and five
 * is as many tabs as fit legibly on a phone.
 *
 * `shortLabel` is the tab-bar label where the full one would not fit. At 375px
 * a tab is ~75px wide, and on a 320px phone ~64px, so anything longer than
 * "Prescriptions" has to be abbreviated rather than truncated with an ellipsis.
 */
export const NAV = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/", railOnly: false },
  { href: "/appointments", label: "Appointments", shortLabel: "Appts", icon: CalendarDays, match: (p: string) => /^\/(appointments|book|programme)/.test(p), railOnly: false },
  { href: "/prescriptions", label: "Prescriptions", shortLabel: "Scripts", icon: Pill, match: (p: string) => /^\/prescriptions/.test(p), railOnly: false },
  { href: "/progress", label: "Progress", icon: TrendingDown, match: (p: string) => p.startsWith("/progress"), railOnly: false },
  { href: "/care", label: "Care", icon: HeartHandshake, match: (p: string) => /^\/(care|documents)/.test(p), railOnly: false },
  { href: "/account", label: "Account", icon: UserRound, match: (p: string) => p.startsWith("/account") || p.startsWith("/plans"), railOnly: true },
] as const;

export function RailNav({ badges }: { badges?: Partial<Record<string, number>> }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map((n) => {
        const active = n.match(path);
        const Icon = n.icon;
        const badge = badges?.[n.href];
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] font-medium transition-colors", active ? "bg-white/12 text-white" : "text-dark-muted hover:bg-white/8 hover:text-white")}
          >
            <Icon className="size-[18px]" strokeWidth={1.75} />
            <span className="flex-1">{n.label}</span>
            {badge ? <span className="rounded-full bg-lime px-1.5 py-0.5 text-[11px] font-semibold leading-none text-ink">{badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar({ badges }: { badges?: Partial<Record<string, number>> }) {
  const path = usePathname();
  const tabs = NAV.filter((n) => !n.railOnly);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-paper/95 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {tabs.map((n) => {
          const active = n.match(path);
          const Icon = n.icon;
          const badge = badges?.[n.href];
          return (
            <li key={n.href} className="min-w-0">
              <Link href={n.href} aria-current={active ? "page" : undefined} className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[10.5px] font-medium">
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active ? "bg-blue-soft text-blue-text" : "text-muted")}>
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.75} />
                </span>
                <span className={cn("w-full truncate text-center tracking-tight", active ? "text-ink" : "text-muted")}>{"shortLabel" in n ? n.shortLabel : n.label}</span>
                {badge ? <span className="absolute right-[18%] top-1.5 size-2 rounded-full bg-lime-deep" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
