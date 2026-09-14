import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

export function Card({ className, children, tone = "default", ...rest }: ComponentProps<"section"> & { tone?: "default" | "navy" | "soft" | "warn" | "notice" | "positive" }) {
  const tones = {
    default: "card",
    navy: "bg-ink text-white rounded-lg shadow-card border border-ink-deep",
    soft: "bg-blue-soft rounded-lg border border-blue-soft",
    warn: "bg-warn-soft rounded-lg border border-[#efcfc8]",
    notice: "bg-amber-soft rounded-lg border border-[#f0d3ad]",
    positive: "bg-lime-soft rounded-lg border border-[#c8e6b0]",
  } as const;
  return (
    <section className={cn(tones[tone], "p-5", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, sub, eyebrow, action, className }: { title: ReactNode; sub?: ReactNode; eyebrow?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h2 className="text-base font-semibold leading-snug">{title}</h2>
        {sub ? <p className="mt-0.5 text-[13px] text-muted">{sub}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
