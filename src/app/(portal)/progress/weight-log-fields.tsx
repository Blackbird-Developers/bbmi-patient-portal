"use client";

import { useId, useState } from "react";
import { Field, Input, Segmented } from "@/components/ui/field";

const LB_PER_KG = 2.20462262;

type Unit = "kg" | "lb";

/**
 * The weight input + kg/lb toggle. Lives on the client only because the
 * toggle changes the label and hint as you type; the form itself and the
 * server action stay in the page. Submits `kg` (the raw number) and `unit`.
 */
export function WeightLogFields({ lastKg }: { lastKg?: number }) {
  const [unit, setUnit] = useState<Unit>("kg");
  const [raw, setRaw] = useState("");
  const id = useId();

  const n = Number(raw);
  const asKg = raw.trim() && Number.isFinite(n) ? (unit === "lb" ? n / LB_PER_KG : n) : undefined;
  const placeholder = lastKg ? (unit === "lb" ? (lastKg * LB_PER_KG).toFixed(1) : lastKg.toFixed(1)) : unit === "lb" ? "e.g. 212.5" : "e.g. 96.4";
  const hint = unit === "kg" ? "Between 40 kg and 400 kg, to one decimal place." : `Between 89 lb and 881 lb (40–400 kg).${asKg ? ` Recorded as ${asKg.toFixed(1)} kg.` : ""}`;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Field label={`Weight in ${unit}`} htmlFor={id} hint={hint} className="flex-1">
        <Input id={id} name="kg" type="number" inputMode="decimal" step="0.1" required value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={placeholder} autoComplete="off" className="tabular" />
      </Field>
      <div className="space-y-1.5">
        <span className="block text-[13px] font-medium text-ink">Units</span>
        <Segmented<Unit>
          name="unit"
          value={unit}
          onChange={setUnit}
          ariaLabel="Weight units"
          options={[
            { value: "kg", label: "kg" },
            { value: "lb", label: "lb" },
          ]}
        />
      </div>
    </div>
  );
}
