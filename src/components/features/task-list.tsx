import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import type { OnboardingTask } from "@/lib/portal/types";
import { Check, ChevronRight, PhoneCall } from "lucide-react";
import { cn } from "@/lib/cn";

/** NHS "complete multiple tasks" pattern: persistent, never overlays anything. */
export function TaskList({ tasks, title = "Your next steps", compact = false }: { tasks: OnboardingTask[]; title?: string; compact?: boolean }) {
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  return (
    <Card>
      <CardHeader title={title} sub={open.length ? `${open.length} to do` : "All done for now"} />
      <ol className="divide-y divide-divider-soft">
        {[...open, ...(compact ? done.slice(0, 2) : done)].map((t) => {
          const staff = t.owner && t.owner !== "patient";
          const inner = (
            <>
              <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border", t.done ? "border-lime-soft bg-lime-soft text-lime-text" : staff ? "border-divider bg-paper-soft text-muted" : "border-divider bg-paper text-transparent")}>
                {t.done ? <Check className="size-3.5" strokeWidth={3} /> : staff ? <PhoneCall className="size-3" /> : <Check className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[14px] font-medium leading-snug", t.done && "text-muted line-through decoration-divider")}>{t.title}</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{t.detail}</span>
              </span>
              <span className="shrink-0 self-center">
                {t.done ? <StatusTag status="done" /> : staff ? <StatusTag status="info">We&apos;ll call you</StatusTag> : t.dueLabel ? <StatusTag status={/overdue/i.test(t.dueLabel) ? "warn" : /unlock|after/i.test(t.dueLabel) ? "locked" : "pending"}>{t.dueLabel}</StatusTag> : null}
                {!t.done && t.href ? <ChevronRight className="ml-1 inline size-4 text-muted" /> : null}
              </span>
            </>
          );
          return (
            <li key={t.id}>
              {!t.done && t.href ? (
                <Link href={t.href} className="-mx-2 flex items-start gap-3 rounded-md px-2 py-3 hover:bg-blue-wash">
                  {inner}
                </Link>
              ) : (
                <div className="flex items-start gap-3 py-3">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
