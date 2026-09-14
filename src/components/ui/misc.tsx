import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-lg border border-dashed border-divider bg-paper-soft px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 text-blue-text">{icon}</div> : null}
      <div className="font-semibold">{title}</div>
      {children ? <p className="mt-1 max-w-[42ch] text-[14px] text-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-divider-soft", className)} aria-hidden />;
}

export function ProgressRing({ value, size = 84, stroke = 8, label, sub }: { value: number; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v)} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-divider-soft)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-blue)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {label ? <div className="text-lg font-semibold tabular">{label}</div> : null}
        {sub ? <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">{sub}</div> : null}
      </div>
    </div>
  );
}

export function ListRow({ leading, title, sub, trailing, className, href }: { leading?: ReactNode; title: ReactNode; sub?: ReactNode; trailing?: ReactNode; className?: string; href?: string }) {
  const inner = (
    <>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium leading-snug">{title}</div>
        {sub ? <div className="mt-0.5 text-[12.5px] text-muted">{sub}</div> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </>
  );
  const cls = cn("flex items-center gap-3 py-3", href && "-mx-2 rounded-md px-2 hover:bg-blue-wash", className);
  return href ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-divider-soft", className)} />;
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "positive" | "warn" | "default" }) {
  return (
    <div>
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className={cn("mt-0.5 text-2xl font-semibold tabular leading-none", tone === "positive" && "text-lime-text", tone === "warn" && "text-warn")}>{value}</div>
      {sub ? <div className="mt-1 text-[12px] text-muted">{sub}</div> : null}
    </div>
  );
}
