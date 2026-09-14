import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const ROLE_RING: Record<string, string> = {
  doctor: "ring-blue",
  nurse: "ring-lime",
  dietitian: "ring-amber",
  "health-coach": "ring-blue-text",
  psychologist: "ring-ink-soft",
  "care-coordinator": "ring-muted",
  patient: "ring-blue-soft",
};

export function Avatar({ first, last, role = "patient", size = "md", className, src }: { first: string; last: string; role?: string; size?: "sm" | "md" | "lg" | "xl"; className?: string; src?: string }) {
  const sz = { sm: "size-8 text-[11px]", md: "size-10 text-[13px]", lg: "size-12 text-[15px]", xl: "size-16 text-lg" }[size];
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-blue-soft font-semibold text-blue-text ring-2 ring-offset-2 ring-offset-paper", ROLE_RING[role] ?? "ring-blue-soft", sz, className)}
    >
      {src ? <img src={src} alt="" className="size-full rounded-full object-cover" /> : initials(first, last)}
    </span>
  );
}
