"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

type Address = { line1?: string; line2?: string; city?: string; county?: string; postcode?: string };

export function ContactForm({ action, phone, address }: { action: (formData: FormData) => Promise<void>; phone?: string; address?: Address }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <dl className="grid gap-x-8 gap-y-2 text-[14px] sm:grid-cols-2">
          <div>
            <dt className="text-[12px] font-medium text-muted">Mobile</dt>
            <dd className="tabular">{phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-medium text-muted">Home address</dt>
            <dd>{[address?.line1, address?.line2, address?.city, address?.county, address?.postcode].filter(Boolean).join(", ") || "—"}</dd>
          </div>
        </dl>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
          Edit contact details
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mobile" htmlFor="phone" hint="Used for appointment reminders and 2-step sign-in.">
          <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ""} autoComplete="tel" placeholder="+353 87 000 0000" />
        </Field>
        <div />
        <Field label="Address line 1" htmlFor="line1">
          <Input id="line1" name="line1" defaultValue={address?.line1 ?? ""} autoComplete="address-line1" required />
        </Field>
        <Field label="Address line 2" htmlFor="line2">
          <Input id="line2" name="line2" defaultValue={address?.line2 ?? ""} autoComplete="address-line2" />
        </Field>
        <Field label="Town / city" htmlFor="city">
          <Input id="city" name="city" defaultValue={address?.city ?? ""} autoComplete="address-level2" required />
        </Field>
        <Field label="County" htmlFor="county">
          <Input id="county" name="county" defaultValue={address?.county ?? ""} autoComplete="address-level1" />
        </Field>
        <Field label="Eircode" htmlFor="postcode" hint="Needed for medication delivery.">
          <Input id="postcode" name="postcode" defaultValue={address?.postcode ?? ""} autoComplete="postal-code" required className="uppercase tabular" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">Save changes</Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <span className="text-[12.5px] text-muted">Updates your clinical record too.</span>
      </div>
    </form>
  );
}
