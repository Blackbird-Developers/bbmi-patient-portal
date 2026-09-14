import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-150 select-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-deep shadow-[0_6px_18px_rgba(5,63,92,0.18)]",
  secondary: "bg-paper text-ink border border-divider hover:border-blue hover:bg-blue-wash",
  ghost: "bg-transparent text-ink hover:bg-blue-soft",
  danger: "bg-warn text-white hover:bg-[#93362a]",
  link: "bg-transparent text-blue-text hover:underline underline-offset-4 px-0 h-auto min-h-0 rounded-none",
};
const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3.5 text-[13px]",
  md: "min-h-11 px-5 text-[14px]",
  lg: "min-h-12 px-6 text-[15px]",
};

type Common = { variant?: Variant; size?: Size; className?: string; children: ReactNode; iconLeft?: ReactNode; iconRight?: ReactNode };

export function Button({ variant = "primary", size = "md", className, children, iconLeft, iconRight, ...rest }: Common & ComponentProps<"button">) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", className, children, iconLeft, iconRight, href, ...rest }: Common & ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  );
}
