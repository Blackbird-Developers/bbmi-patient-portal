import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

const control =
  "w-full rounded-sm border border-divider bg-paper px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-blue focus:outline-none focus:ring-[3px] focus:ring-blue-soft disabled:bg-divider-soft";

export function Field({ label, hint, error, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-warn" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...rest} />;
}
export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 resize-y", className)} {...rest} />;
}
export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "appearance-none pr-9 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235C6F77%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat", className)} {...rest}>
      {children}
    </select>
  );
}

/** Pill-style single choice (segmented) */
export function Segmented<T extends string>({ name, value, options, onChange, ariaLabel }: { name: string; value: T; options: { value: T; label: ReactNode }[]; onChange?: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-full bg-divider-soft p-1">
      {options.map((o) => (
        <label key={o.value} className={cn("cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", value === o.value ? "bg-paper text-ink shadow-card" : "text-muted hover:text-ink")}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange?.(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}
