import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusTag } from "@/components/ui/status-tag";
import { Check, Minus } from "lucide-react";

const OWNERSHIP: [string, string, string, string, string, string?][] = [
  // capability, portal, semble, stripe, hubspot, note
  ["Identity & login (sessions, 2-step)", "own", "—", "—", "—"],
  ["Journey stage (9 states) & what's next", "own", "reads bookings", "reads subscriptions", "mirrors stage"],
  ["Booking rules: windows, order, allocation, gates", "own", "—", "—", "—"],
  ["Clinicians, availability, bookings", "UI", "own", "—", "—"],
  ["Video consultations", "Join button", "own (link per booking)", "—", "—"],
  ["Clinical notes & letters", "shows shared items", "own", "—", "—"],
  ["Prescriptions", "read-only view", "authored & stored", "—", "—", "The script goes from the doctor to the pharmacy, so the patient has nothing to download."],
  ["Questionnaires", "form UI, gating", "stores answers", "—", "—"],
  ["Weight tracking", "own", "—", "—", "—", "Already in today's portal, and it gates doctor booking: a weigh-in inside the last 45 days."],
  ["Appointment reminders", "—", "own (templates)", "—", "—"],
  ["Plans, instalments, invoices, card", "billing state & copy", "clinic invoices", "own", "—"],
  ["Day 5–7 · day 21 · day 80 tasks", "signals", "—", "webhooks", "own (tasks)"],
  ["Patient messaging", "not built", "not built", "not built", "not built", "Semble sends but cannot receive, so there is no system of record for a thread and no inbox for staff to work from."],
];

const NOT_BUILT: [string, string][] = [
  [
    "Patient messaging",
    "Semble's communications are outbound only — a patient reply goes to the practice mailbox and never reaches Semble, and messages can only be read one patient at a time, so there is nowhere for a thread to land until we decide where a nurse reads it.",
  ],
  [
    "Dose diary, injection-site tracking and side-effect check-ins",
    "None of it exists in today's portal and Semble has no model for it, so it would be a new clinical record with no home in the system of record.",
  ],
  [
    "Prescription downloads",
    "The script goes from the doctor straight to the pharmacy, so there is nothing for the patient to print.",
  ],
];

const FACTS: [string, string][] = [
  ["No patient authentication", "Semble's 'patient portal' is an emailed document link with date-of-birth 2FA. The API token is practice-wide. So the portal owns identity and the token never leaves the server."],
  ["Naive Dublin timestamps", "Semble returns local wall-clock tagged as UTC. The adapter converts both ways or every appointment drifts an hour all summer."],
  ["Availability in ≤7-day windows", "Longer ranges return nothing; ranges ending 23:59:59 return nothing. The adapter chunks on clean day boundaries."],
  ["Rate limit at HTTP 200", "240 requests a minute, signalled by a GraphQL error containing 'too often'. Retried with backoff inside the adapter; bursts can block the whole token."],
  ["Pagination duplicates ~13% of rows", "Every list is de-duplicated by id before it reaches a screen."],
  ["Communications are outbound only", "Semble can send a patient an email or an SMS and log it on the record, but a reply goes to the practice mailbox and never comes back in — and communications are readable only one patient at a time, so staff have no inbox. That is why patient messaging is not in this portal."],
  ["Booking messages are opt-in on the API", "Every create/update passes sendPatientMessages explicitly so confirmations and reminders fire."],
  ["No createdBy on bookings", "Portal bookings are stamped with metadata so support can tell them apart."],
  ["Prescriptions are read-only", "Semble can author and serve a prescription (15-minute PDF URL) but cannot create or send one. Delivery to Pure Pharmacy or a Healthmail address stays with the portal."],
  ["Semble Pay is not available in Ireland", "No recurring billing either. Stripe stays the biller; Semble holds clinic invoices."],
  ["Webhooks exist", "HMAC-signed, ids-only payloads for bookings, invoices, prescriptions, letters, questionnaires. They trigger a refetch; polling by updatedAt reconciles."],
];

const STAGES: [string, string, string][] = [
  ["consult_paid", "Paid €89; questionnaire and booking still to do", "Seán"],
  ["consult_booked", "Consultation in the diary; join from the portal", "—"],
  ["consult_done", "Consultation complete; treatment started; 90-Day offer open", "Aoife"],
  ["ninety_day_active", "Programme running: 8 MDT appointments in windows", "Ciarán"],
  ["ninety_day_overdue", "Instalment failed: paused, pay the open invoice", "Dara"],
  ["ninety_day_completed", "Day 90 passed: results and the Ongoing Care chooser", "Fiona"],
  ["legacy_member", "Any active monthly plan: Ongoing Care €75/€150 or legacy €150", "Margaret"],
  ["legacy_lapsed", "Membership on hold, paused or cancelled: read-only, continue", "—"],
  ["none", "No purchase yet", "—"],
];

const ROADMAP: [string, string, string][] = [
  ["Semble sandbox & read-only probe", "Get a BBMI-owned token and sandbox; run the adapter read paths against real products, clinicians and availability. Confirm which appointment system the tenant is on and whether videoUrl is set at booking time.", "Which Semble tenant/region, and who holds the integration credential."],
  ["Adapter hardening & read model", "Webhook receiver (HMAC, event-id dedupe), updatedAt reconciliation, portal-side booking index, least-privilege Semble role.", "Are webhooks enabled on BBMI's package?"],
  ["Identity & mapping", "Keep Cognito for 10k patients, mint opaque server sessions, add the Cognito-sub ↔ Semble-id mapping table and the backfill for the migration cohort.", "Migration cohort: all ~10k patients, or active + lapsed within 12 months."],
  ["Rules & billing port", "Port the tier-journey engine and entitlement rules from the current backend as pure functions with their tests; wire Stripe webhooks; ratify one booking-policy sheet (notice, no-show, windows, grace).", "Notice period 2h vs 24h; grace period; MDT window model."],
  ["Pilot cohort", "Run new €89 sign-ups through the portal first; staff keep Semble; measure booking completion, questionnaire completion, support volume.", "Video: Semble/Whereby vs Daily (AI-notes pipeline)."],
  ["Cutover", "Point app.beyondbmi.ie at the portal; retire Cronofy, Daily, Tally iframes and the Angular app; legacy members migrate onto the stage model.", "Date, and what happens to the ~150 legacy €150 members."],
];

const DECISIONS = [
  "Backend shape: new portal backend that ports the proven rule functions behind adapters (recommended) vs keeping the Node monolith as the rules engine behind a new UI.",
  "Identity: keep Cognito with a portal-owned session and mapping table (recommended); password vs magic-link/passkey primary; step-up for documents, prescriptions and billing.",
  "One booking-policy sheet to ratify: reschedule notice (code 2h, Terms 24h), no-show rule, MDT window model (earliest-date vs ±7 days vs 30-day blocks), €89 access window (30 days vs a year), grace period on failed instalments.",
  "Questionnaires: portal-native form submitted through Semble's questionnaire API (recommended) vs Semble-hosted links vs keeping Tally.",
  "Video: Semble/Whereby link (zero build) vs Daily.co (keeps the AI consultation-notes pipeline).",
  "Migration cohort and coexistence order: which patients move to Semble, and endpoint-by-endpoint webhook moves off the old backend.",
  "Prescription delivery: Pure Pharmacy home delivery flow, Healthmail email with the Semble PDF, SignatureRX for NI; where the pharmacy directory lives.",
  "Ongoing Care naming and prices in the chooser (Terms say Premium €150 / Core €75; marketing says Ongoing Care); the finisher chooser is dark on prod today.",
  "Patient messaging, if it is ever wanted: where a reply is read (practice mailbox, a helpdesk, or a portal-owned inbox), who answers it and inside what SLA. Semble cannot hold the thread, so nothing is built until that is answered.",
  "Which historical claims and outcome numbers may appear inside the portal (HPRA/advertising rules; no medication names outside the clinical context).",
];

function Tick({ v }: { v: string }) {
  if (v === "—") return <Minus className="mx-auto size-4 text-divider" aria-label="not involved" />;
  if (v === "own") return <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-lime-text"><Check className="size-3.5" strokeWidth={3} /> owns</span>;
  if (v === "not built") return <span className="text-[12.5px] text-muted">not built</span>;
  return <span className="text-[12.5px] text-ink-soft">{v}</span>;
}

function Diagram() {
  const box = (x: number, y: number, w: number, h: number, title: string, lines: string[], fill: string, stroke: string, textFill = "#053F5C") => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={x + 16} y={y + 26} fontSize={14} fontWeight={600} fill={textFill} fontFamily="Poppins, system-ui, sans-serif">
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} x={x + 16} y={y + 48 + i * 17} fontSize={11.5} fill={textFill === "#053F5C" ? "#2B5165" : "#94B1BF"} fontFamily="Poppins, system-ui, sans-serif">
          {l}
        </text>
      ))}
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, label: string, above = true) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3F7E99" strokeWidth={1.5} markerEnd="url(#arr)" />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + (above ? -8 : 16)} fontSize={10.5} textAnchor="middle" fill="#225A75" fontFamily="Poppins, system-ui, sans-serif">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 900 440" className="h-auto w-full" role="img" aria-label="System diagram: patient browser talks only to the portal; the portal talks to Semble, Stripe and HubSpot server-side; pharmacies receive prescriptions from the portal.">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#3F7E99" />
        </marker>
      </defs>
      {box(20, 170, 150, 100, "Patient", ["browser / phone", "no Semble token", "no Stripe keys"], "#F5F9FB", "#E2E8E5")}
      {box(240, 60, 300, 320, "Portal (this app)", ["identity & sessions", "journey engine · 9 stages", "booking rules · windows · gates", "weight tracking · progress", "documents · forms · prescriptions", "billing state · plan copy", "Semble adapter (server only)", "webhook receiver · read model"], "#053F5C", "#032E45", "#F2F4F4")}
      {box(640, 40, 240, 150, "Semble (clinical record)", ["patients · clinicians · rota", "bookings · video links", "notes · letters · prescriptions", "questionnaires · invoices", "reminders · webhooks"], "#E6EFF4", "#65A1BC")}
      {box(640, 220, 240, 90, "Stripe (biller)", ["€89 · €399 · €150×3 · €75/mo", "instalments · open invoices", "customer portal"], "#FFFFFF", "#E2E8E5")}
      {box(640, 330, 240, 90, "HubSpot (CRM)", ["lifecycle · stage mirror", "tasks: day 5–7 · 21 · 80", "Semble id write-back"], "#FFFFFF", "#E2E8E5")}
      {box(240, 400, 300, 34, "Pharmacy: Pure Pharmacy · Healthmail · SignatureRX (NI)", [], "#DCEFCC", "#A5DB73")}
      {arrow(170, 220, 240, 220, "HTTPS · session cookie")}
      {arrow(540, 120, 640, 120, "GraphQL · x-token (server)")}
      {arrow(640, 150, 540, 150, "webhooks → refetch", false)}
      {arrow(540, 250, 640, 250, "checkout · portal links")}
      {arrow(640, 280, 540, 280, "subscription webhooks", false)}
      {arrow(540, 360, 640, 360, "properties · tasks")}
      {arrow(390, 380, 390, 400, "Rx PDF + delivery", false)}
    </svg>
  );
}

export default function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-[880px] space-y-6">
      <PageHeader eyebrow="Architecture" title="About this prototype" sub="How the new Beyond BMI patient portal fits around Semble, Stripe and HubSpot — and what it would take to ship." />

      <Card>
        <CardHeader title="What you're looking at" />
        <ul className="space-y-1.5 text-[14px] text-ink-soft">
          <li>A runnable prototype of the patient portal, built against a <strong className="text-ink">mock Semble adapter</strong> with synthetic data — no real patients, no real tenant.</li>
          <li>Six demo patients, one per journey stage, switchable from the left rail.</li>
          <li>Every rule — stage, booking windows, allocation, gates, paused states — is decided on the server; screens only mirror it.</li>
          <li>The real Semble adapter is a skeleton wired to the operations we already run for another practice; it has not been run against a Beyond BMI token because none exists yet.</li>
        </ul>
      </Card>

      <Card>
        <CardHeader title="Deliberately not in this portal" sub="Taken out so the portal only promises what Semble, Stripe or today's portal can actually back." />
        <ul className="divide-y divide-divider-soft">
          {NOT_BUILT.map(([t, b]) => (
            <li key={t} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
              <Minus className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <div className="text-[14px] font-medium leading-snug">{t}</div>
                <p className="mt-0.5 text-[13px] text-ink-soft">{b}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-divider-soft pt-3 text-[13px] text-muted">Everything else on screen is backed by Semble, Stripe or data the portal already owns today.</p>
      </Card>

      <Card>
        <CardHeader title="System diagram" sub="The patient never talks to Semble or Stripe directly." />
        <Diagram />
      </Card>

      <Card>
        <CardHeader title="Who owns what" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-medium">Capability</th>
                <th className="py-2 pr-3 font-medium">Portal</th>
                <th className="py-2 pr-3 font-medium">Semble</th>
                <th className="py-2 pr-3 font-medium">Stripe</th>
                <th className="py-2 font-medium">HubSpot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider-soft">
              {OWNERSHIP.map(([c, p, s, st, h, note]) => (
                <tr key={c}>
                  <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink">
                    {c}
                    {note ? <span className="mt-0.5 block max-w-[22rem] text-[12px] font-normal text-muted">{note}</span> : null}
                  </th>
                  <td className="py-2.5 pr-3"><Tick v={p} /></td>
                  <td className="py-2.5 pr-3"><Tick v={s} /></td>
                  <td className="py-2.5 pr-3"><Tick v={st} /></td>
                  <td className="py-2.5"><Tick v={h} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Semble facts that shaped the design" sub="Learned on our live Semble integration for another clinic and verified against Semble's documentation." />
        <dl className="grid gap-4 sm:grid-cols-2">
          {FACTS.map(([t, b]) => (
            <div key={t} className="rounded-md bg-paper-soft p-3">
              <dt className="text-[13.5px] font-semibold">{t}</dt>
              <dd className="mt-0.5 text-[13px] text-ink-soft">{b}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader title="Journey stages" sub="The nine names the production backend already uses; HubSpot and staff speak them too." />
        <ul className="divide-y divide-divider-soft">
          {STAGES.map(([k, d, who]) => (
            <li key={k} className="flex items-center gap-3 py-2.5 text-[13.5px]">
              <code className="w-52 shrink-0 rounded bg-divider-soft px-1.5 py-0.5 text-[12px] text-ink">{k}</code>
              <span className="min-w-0 flex-1 text-ink-soft">{d}</span>
              {who !== "—" ? <StatusTag status="info">{who}</StatusTag> : null}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card tone="positive">
          <CardHeader title="Real in this demo" />
          <ul className="space-y-1 text-[13.5px] text-ink-soft">
            {["Journey engine and all nine states", "90-day programme windows, ordering, allocation", "Booking, rescheduling and cancelling against the adapter interface", "Weigh-ins, questionnaires, prescriptions and documents", "Paused / overdue / completed / lapsed copy and actions", "Design system on the brand tokens"].map((x) => (
              <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-lime-text" strokeWidth={2.5} />{x}</li>
            ))}
          </ul>
        </Card>
        <Card tone="soft">
          <CardHeader title="Mocked" />
          <ul className="space-y-1 text-[13.5px] text-ink-soft">
            {["Semble data (in-memory, synthetic, fictional clinicians)", "Stripe (plan changes mutate the demo store)", "Authentication (cookie holds the demo user id)", "Identity verification (Sumsub)", "PDF downloads (generated on the fly)", "Reminders, emails, SMS"].map((x) => (
              <li key={x} className="flex gap-2"><Minus className="mt-0.5 size-4 shrink-0 text-blue-text" />{x}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Roadmap to production" sub="Six phases. Each names the decision it needs." />
        <ol className="space-y-4">
          {ROADMAP.map(([t, b, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{i + 1}</span>
              <div>
                <div className="text-[14px] font-semibold">{t}</div>
                <p className="text-[13px] text-ink-soft">{b}</p>
                <p className="mt-1 text-[12.5px] text-amber"><span className="font-medium">Decision:</span> {d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader title="Decisions needed" sub="Drawn from the research reports in docs/research." />
        <ol className="list-decimal space-y-2 pl-5 text-[13.5px] text-ink-soft">
          {DECISIONS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
