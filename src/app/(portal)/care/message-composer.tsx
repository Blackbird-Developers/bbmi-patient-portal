"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Send } from "lucide-react";

type Channel = "clinical" | "admin";

const CHANNELS: Record<Channel, { option: string; rule: string }> = {
  clinical: {
    option: "My nurse — side effects, medication or symptoms",
    rule: "Side effects, medication or symptoms — your nurse replies within 4 business hours (Mon–Fri 09:00–17:30).",
  },
  admin: {
    option: "Care team — appointments, billing or documents",
    rule: "Appointments, billing or documents — the care team replies within 1 working day.",
  },
};

function SubmitRow() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending} iconLeft={<Send className="size-4" />}>
        {pending ? "Sending" : "Send message"}
      </Button>
      <span className="text-[12.5px] text-muted">Replies arrive here and by email. Not for emergencies.</span>
    </div>
  );
}

/**
 * Message composer. The only local state is which channel is selected, so the
 * reply-time rule sits beside the control and changes with it.
 */
export function MessageComposer({ action, defaultBody = "", defaultChannel = "clinical" }: { action: (formData: FormData) => Promise<void>; defaultBody?: string; defaultChannel?: Channel }) {
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  return (
    <form action={action} className="space-y-4">
      <Field label="Send to" htmlFor="channel" hint={CHANNELS[channel].rule}>
        <Select id="channel" name="channel" value={channel} onChange={(e) => setChannel(e.target.value === "admin" ? "admin" : "clinical")}>
          {(Object.keys(CHANNELS) as Channel[]).map((k) => (
            <option key={k} value={k}>
              {CHANNELS[k].option}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Your message" htmlFor="body" hint="Include what you took, when, and how you felt — it saves a round trip.">
        <Textarea id="body" name="body" required rows={6} maxLength={2000} defaultValue={defaultBody} placeholder="Write to your care team" />
      </Field>
      <SubmitRow />
    </form>
  );
}
