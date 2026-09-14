"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { Check, Syringe } from "lucide-react";

const SITES: { value: string; label: string; hint: string }[] = [
  { value: "abdomen-left", label: "Abdomen · left", hint: "5 cm from the navel" },
  { value: "abdomen-right", label: "Abdomen · right", hint: "5 cm from the navel" },
  { value: "thigh-left", label: "Thigh · left", hint: "front, upper third" },
  { value: "thigh-right", label: "Thigh · right", hint: "front, upper third" },
  { value: "upper-arm-left", label: "Upper arm · left", hint: "back of the arm" },
  { value: "upper-arm-right", label: "Upper arm · right", hint: "back of the arm" },
];

const EFFECTS: { value: string; label: string }[] = [
  { value: "nausea", label: "Nausea" },
  { value: "constipation", label: "Constipation" },
  { value: "fatigue", label: "Tiredness" },
  { value: "headache", label: "Headache" },
  { value: "injection-site", label: "Injection-site reaction" },
  { value: "dizziness", label: "Dizziness" },
  { value: "other", label: "Something else" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} iconLeft={<Syringe className="size-4" />}>
      {pending ? "Saving" : "Log dose"}
    </Button>
  );
}

export function DoseForm({ action, doseMg, drug, suggestedSite }: { action: (formData: FormData) => Promise<void>; doseMg: number; drug: string; suggestedSite: string }) {
  const initial = SITES.find((s) => suggestedSite.includes(s.value.split("-")[1]) && suggestedSite.includes(s.value.split("-")[0].replace("upper", "upper arm")))?.value ?? SITES[0].value;
  const [site, setSite] = useState(initial);
  const [effects, setEffects] = useState<string[]>([]);
  const toggle = (v: string) => setEffects((e) => (e.includes(v) ? e.filter((x) => x !== v) : [...e, v]));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="doseMg" value={doseMg} />
      <div className="flex items-baseline justify-between gap-3 rounded-md bg-paper-soft px-4 py-3">
        <div>
          <div className="text-[12px] font-medium text-muted">Dose</div>
          <div className="text-[15px] font-semibold tabular">
            {doseMg} mg · {drug}
          </div>
        </div>
        <span className="text-[12px] text-muted">Change your dose only on your doctor&apos;s instruction</span>
      </div>

      <fieldset>
        <legend className="mb-2 block text-[13px] font-medium text-ink">Injection site</legend>
        <div role="radiogroup" aria-label="Injection site" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SITES.map((s) => {
            const on = site === s.value;
            return (
              <label key={s.value} className={cn("flex min-h-[64px] cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-[13.5px] transition-colors", on ? "border-blue bg-blue-soft" : "border-divider bg-paper hover:border-blue hover:bg-blue-wash")}>
                <input type="radio" name="site" value={s.value} checked={on} onChange={() => setSite(s.value)} className="sr-only" />
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", on ? "border-blue bg-blue text-white" : "border-divider")}>{on ? <Check className="size-3" strokeWidth={3} /> : null}</span>
                <span>
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-[12px] text-muted">{s.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[12.5px] text-muted">Rotate sites each week and keep 5 cm from the navel. Suggested this week: {suggestedSite}.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 block text-[13px] font-medium text-ink">Any side effects since your last dose?</legend>
        <div className="flex flex-wrap gap-2">
          {EFFECTS.map((e) => {
            const on = effects.includes(e.value);
            return (
              <label key={e.value} className={cn("inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors", on ? "border-blue bg-blue-soft text-ink" : "border-divider bg-paper text-ink-soft hover:border-blue")}>
                <input type="checkbox" name="sideEffects" value={e.value} checked={on} onChange={() => toggle(e.value)} className="sr-only" />
                {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                {e.label}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[12.5px] text-muted">Mild nausea in the first weeks is expected. Anything severe or getting worse — message your nurse, don&apos;t wait.</p>
      </fieldset>

      <Field label="Note" htmlFor="dose-note" hint="Optional">
        <Textarea id="dose-note" name="note" rows={2} maxLength={300} className="min-h-16" placeholder="For example: took it in the evening this week" />
      </Field>

      <Submit />
    </form>
  );
}
