import { cn } from "@/lib/cn";
import { Check, Clock, Lock, AlertTriangle, CalendarCheck, Info, PauseCircle, XCircle } from "lucide-react";
import type { ReactNode } from "react";

export type Status = "done" | "booked" | "book-now" | "locked" | "missed" | "info" | "warn" | "paused" | "pending" | "cancelled" | "neutral";

const styles: Record<Status, { cls: string; icon: ReactNode; label: string }> = {
  done: { cls: "bg-lime-soft text-lime-text", icon: <Check className="size-3.5" strokeWidth={2.5} />, label: "Done" },
  booked: { cls: "bg-blue-soft text-blue-text", icon: <CalendarCheck className="size-3.5" />, label: "Booked" },
  "book-now": { cls: "bg-ink text-white", icon: null, label: "Book now" },
  locked: { cls: "bg-divider-soft text-muted", icon: <Lock className="size-3.5" />, label: "Not yet" },
  missed: { cls: "bg-amber-soft text-amber", icon: <AlertTriangle className="size-3.5" />, label: "Missed" },
  info: { cls: "bg-divider-soft text-ink-soft", icon: <Info className="size-3.5" />, label: "Info" },
  warn: { cls: "bg-warn-soft text-warn", icon: <AlertTriangle className="size-3.5" />, label: "Action needed" },
  paused: { cls: "bg-warn-soft text-warn", icon: <PauseCircle className="size-3.5" />, label: "Paused" },
  pending: { cls: "bg-amber-soft text-amber", icon: <Clock className="size-3.5" />, label: "Pending" },
  cancelled: { cls: "bg-divider-soft text-muted", icon: <XCircle className="size-3.5" />, label: "Cancelled" },
  neutral: { cls: "bg-divider-soft text-ink-soft", icon: null, label: "" },
};

export function StatusTag({ status, children, className }: { status: Status; children?: ReactNode; className?: string }) {
  const s = styles[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none", s.cls, className)}>
      {s.icon}
      {children ?? s.label}
    </span>
  );
}
