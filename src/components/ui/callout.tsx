import { cn } from "@/lib/cn";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

export function Callout({ tone = "info", title, children, action, className }: { tone?: "info" | "notice" | "warn" | "positive"; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const t = {
    info: { cls: "bg-blue-soft text-ink border-[#d6e4ec]", icon: <Info className="size-5 text-blue-text" /> },
    notice: { cls: "bg-amber-soft text-ink border-[#f0d3ad]", icon: <Info className="size-5 text-amber" /> },
    warn: { cls: "bg-warn-soft text-ink border-[#efcfc8]", icon: <AlertTriangle className="size-5 text-warn" /> },
    positive: { cls: "bg-lime-soft text-ink border-[#c8e6b0]", icon: <CheckCircle2 className="size-5 text-lime-text" /> },
  }[tone];
  return (
    <div role={tone === "warn" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-4", t.cls, className)}>
      <div className="mt-0.5 shrink-0">{t.icon}</div>
      <div className="min-w-0 flex-1 text-[14px] leading-relaxed">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-ink-soft")}>{children}</div> : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
