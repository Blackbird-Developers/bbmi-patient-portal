"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Pill, TrendingDown, HeartHandshake, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/prescriptions", label: "Prescriptions", icon: Pill, match: (p: string) => /^\/prescriptions/.test(p) },
  { href: "/progress", label: "Progress", icon: TrendingDown, match: (p: string) => p.startsWith("/progress") },
  { href: "/care", label: "Care", icon: HeartHandshake, match: (p: string) => /^\/(care|appointments|programme|book|documents)/.test(p) },
  { href: "/account", label: "Account", icon: UserRound, match: (p: string) => p.startsWith("/account") || p.startsWith("/plans") },
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
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-paper/95 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {NAV.map((n) => {
          const active = n.match(path);
          const Icon = n.icon;
          const badge = badges?.[n.href];
          return (
            <li key={n.href} className="min-w-0">
              <Link href={n.href} aria-current={active ? "page" : undefined} className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium">
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active ? "bg-blue-soft text-blue-text" : "text-muted")}>
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.75} />
                </span>
                <span className={cn("w-full truncate text-center tracking-tight", active ? "text-ink" : "text-muted")}>{n.label}</span>
                {badge ? <span className="absolute right-[18%] top-1.5 size-2 rounded-full bg-lime-deep" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
