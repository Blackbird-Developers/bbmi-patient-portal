import { Phone } from "lucide-react";

/**
 * "When to get help" — NHS care-card pattern with Irish numbers. Shown on
 * every surface that touches symptoms. Wording to be signed off clinically.
 */
export function CareCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-divider bg-paper">
      <div className="border-l-4 border-warn p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-warn">
          <Phone className="size-4" /> Call 999 or 112, or go to your nearest emergency department if you have:
        </div>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13.5px] text-ink-soft">
          <li>severe, persistent stomach pain (with or without vomiting)</li>
          <li>signs of an allergic reaction — swelling of the face or throat, difficulty breathing</li>
        </ul>
      </div>
      {!compact ? (
        <div className="border-l-4 border-blue bg-blue-wash p-4">
          <div className="text-[13px] font-semibold text-blue-text">Message your nurse or call the clinic if:</div>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13.5px] text-ink-soft">
            <li>you cannot keep fluids down for more than 24 hours</li>
            <li>side effects are getting worse instead of settling</li>
            <li>you have missed a dose and are unsure what to do</li>
          </ul>
          <div className="mt-2 text-[12.5px] text-muted">Clinic hours Mon–Fri 09:00–17:30 · +353 1 903 8441 · support@beyondbmi.ie. We are not an emergency or general GP service.</div>
        </div>
      ) : null}
    </div>
  );
}
