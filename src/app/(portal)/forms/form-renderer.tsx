"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { FormDef } from "./catalog";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg">
      {pending ? "Sending" : "Submit"}
    </Button>
  );
}

/** Plain HTML form (works without JS) with a lightweight answered-count. */
export function FormRenderer({ def, action }: { def: FormDef; action: (formData: FormData) => Promise<void> }) {
  const all = def.sections.flatMap((s) => s.questions);
  const total = all.length;
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const mark = (id: string, has: boolean) =>
    setAnswered((prev) => {
      const next = new Set(prev);
      if (has) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <form action={action} className="space-y-8" onChange={(e) => {
      const t = e.target as unknown as HTMLInputElement | HTMLTextAreaElement;
      if (!t.name) return;
      const form = e.currentTarget;
      const els = form.querySelectorAll<HTMLInputElement>(`[name="${t.name}"]`);
      let has = false;
      els.forEach((el) => {
        if (el.type === "checkbox" || el.type === "radio") has = has || el.checked;
        else has = has || !!el.value.trim();
      });
      mark(t.name, has);
    }}>
      <input type="hidden" name="slug" value={def.slug} />
      <div className="sticky top-14 z-10 -mx-1 rounded-md border border-divider-soft bg-paper/95 px-3 py-2 text-[12.5px] text-muted backdrop-blur lg:top-0">
        <div className="flex items-center justify-between">
          <span>
            <span className="font-medium text-ink tabular">{answered.size}</span> of {total} answered
          </span>
          <span>About {def.minutes} min</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded bg-divider-soft">
          <div className="h-full rounded bg-blue transition-[width] duration-300" style={{ width: `${Math.round((answered.size / total) * 100)}%` }} />
        </div>
      </div>

      {def.sections.map((s) => (
        <fieldset key={s.title} className="space-y-5">
          <legend className="mb-1 text-base font-semibold">{s.title}</legend>
          {s.questions.map((q) => {
            const label = (
              <>
                {q.label}
                {"required" in q && q.required ? <span className="ml-1 text-warn" aria-hidden>*</span> : null}
              </>
            );
            if (q.type === "text" || q.type === "number") {
              return (
                <Field key={q.id} label={label} htmlFor={q.id} hint={q.hint}>
                  <div className="flex items-center gap-2">
                    <Input id={q.id} name={q.id} type={q.type} inputMode={q.type === "number" ? "decimal" : undefined} step={q.type === "number" ? "0.1" : undefined} required={q.required} placeholder={q.placeholder} className={cn(q.unit && "max-w-[180px] tabular")} />
                    {q.unit ? <span className="text-[13px] text-muted">{q.unit}</span> : null}
                  </div>
                </Field>
              );
            }
            if (q.type === "textarea") {
              return (
                <Field key={q.id} label={label} htmlFor={q.id} hint={q.hint}>
                  <Textarea id={q.id} name={q.id} required={q.required} placeholder={q.placeholder} rows={3} />
                </Field>
              );
            }
            if (q.type === "radio") {
              return (
                <fieldset key={q.id}>
                  <legend className="mb-1.5 block text-[13px] font-medium text-ink">{label}</legend>
                  {q.hint ? <p className="mb-2 text-[12.5px] text-muted">{q.hint}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <label key={o} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-divider bg-paper px-4 text-[14px] has-[:checked]:border-blue has-[:checked]:bg-blue-soft">
                        <input type="radio" name={q.id} value={o} required={q.required} className="size-4 accent-[#053F5C]" />
                        {o}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            }
            if (q.type === "checkbox-group") {
              return (
                <fieldset key={q.id}>
                  <legend className="mb-1.5 block text-[13px] font-medium text-ink">{q.label}</legend>
                  {q.hint ? <p className="mb-2 text-[12.5px] text-muted">{q.hint}</p> : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options.map((o) => (
                      <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-divider bg-paper px-3 text-[14px] has-[:checked]:border-blue has-[:checked]:bg-blue-soft">
                        <input type="checkbox" name={q.id} value={o} className="size-4 accent-[#053F5C]" />
                        {o}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            }
            if (q.type !== "scale") return null;
            const range = Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i);
            return (
              <fieldset key={q.id}>
                <legend className="mb-1.5 block text-[13px] font-medium text-ink">{label}</legend>
                {q.hint ? <p className="mb-2 text-[12.5px] text-muted">{q.hint}</p> : null}
                <div className="flex flex-wrap gap-1.5">
                  {range.map((n) => (
                    <label key={n} className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-divider bg-paper text-[14px] font-medium tabular has-[:checked]:border-blue has-[:checked]:bg-ink has-[:checked]:text-white">
                      <input type="radio" name={q.id} value={n} required={q.required} className="sr-only" />
                      {n}
                    </label>
                  ))}
                </div>
                {q.minLabel || q.maxLabel ? (
                  <div className="mt-1 flex justify-between text-[11.5px] text-muted">
                    <span>{q.minLabel}</span>
                    <span>{q.maxLabel}</span>
                  </div>
                ) : null}
              </fieldset>
            );
          })}
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3 border-t border-divider-soft pt-6">
        <Submit />
        <span className="text-[12.5px] text-muted">Saved to your clinical record. Your care team can see it straight away.</span>
      </div>
    </form>
  );
}
