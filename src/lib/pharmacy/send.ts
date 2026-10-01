import "server-only";
import { randomUUID } from "node:crypto";
import { getSemble } from "../semble";
import type { Prescription, PrescriptionSend } from "../semble/types";
import type { PortalPatient } from "../portal/types";
import { clinicianDisplay, fmtDateYear } from "../format";
import { MailNotSent, sendMail, type MailVia } from "../mail";

/**
 * Emails a prescription (Semble's PDF) to the pharmacy the patient chose — once.
 *
 * Today patients press "send to pharmacy" in the old app and could send the same script twice. Here each
 * prescription is claimed in Semble before anything is emailed (one claim per prescription; with two
 * competing claims both back off), and a send whose outcome is unknown is never retried automatically —
 * the patient is asked to call the care team.
 */

export type SendCode =
  | "unavailable"
  | "not-found"
  | "not-allowed"
  | "not-sendable"
  | "too-new"
  | "too-old"
  | "no-pharmacy"
  | "pharmacy-changed"
  | "already-sent"
  | "in-progress"
  | "uncertain"
  | "no-pdf"
  | "mail";

export type SendOutcome = { ok: true; pharmacy: string; via: MailVia } | { ok: false; code: SendCode };

/** How long a claim counts as "being sent" before it is treated as interrupted. */
const LEASE_MS = 10 * 60_000;
/** A just-issued prescription may still be edited by the doctor. */
const MIN_AGE_MS = 10 * 60_000;
/** Older prescriptions go through the care team (clinic decision pending; configurable). */
const MAX_AGE_MS = Number(process.env.PORTAL_RX_SEND_MAX_AGE_DAYS || 30) * 86_400_000;
/** Semble statuses a patient may send; anything else (drafts, unknown states) waits for the care team. */
const SENDABLE_STATUS = /^(active|issued|signed)$/i;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

declare global {
  var __rxSending: Map<string, Promise<SendOutcome>> | undefined;
}
const inflight = () => (globalThis.__rxSending ??= new Map());

/** The state shown on the prescriptions page for one prescription. */
export function sendState(s: PrescriptionSend | undefined): "none" | "sent" | "sending" | "uncertain" {
  if (!s) return "none";
  if (s.status === "sent") return "sent";
  return Date.now() - Date.parse(s.atUtc) < LEASE_MS ? "sending" : "uncertain";
}

/** Whether this patient may send this prescription now (the page shows the same reason as the action). */
export function sendable(user: PortalPatient, rx: Prescription, now = Date.now()): { ok: true } | { ok: false; code: SendCode } {
  const m = user.membership;
  if (!m.entitlements.includes("prescriptions") || ["none", "ninety_day_overdue", "legacy_lapsed"].includes(m.state)) return { ok: false, code: "not-allowed" };
  if (rx.status === "sent" || rx.status === "dispensed") return { ok: false, code: "already-sent" };
  if (rx.status !== "issued" || !SENDABLE_STATUS.test(rx.sembleStatus ?? "")) return { ok: false, code: "not-sendable" };
  const age = now - Date.parse(rx.issuedAtUtc);
  if (age < MIN_AGE_MS) return { ok: false, code: "too-new" };
  if (age > MAX_AGE_MS) return { ok: false, code: "too-old" };
  return { ok: true };
}

/** One run per prescription at a time on this server; the Semble claim guards across servers. */
export function sendPrescriptionToPharmacy(user: PortalPatient, prescriptionId: string, expectedPharmacyId: string): Promise<SendOutcome> {
  const key = `${user.semblePatientId}:${prescriptionId}`;
  let run = inflight().get(key);
  if (!run) {
    run = send(user, prescriptionId, expectedPharmacyId).finally(() => inflight().delete(key));
    inflight().set(key, run);
  }
  return run;
}

async function fetchPdf(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 0 && b.length <= MAX_PDF_BYTES && b.subarray(0, 5).toString() === "%PDF-" ? b : null;
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

async function send(user: PortalPatient, prescriptionId: string, expectedPharmacyId: string): Promise<SendOutcome> {
  const patientId = user.semblePatientId;
  if (!user.backend || !patientId) return { ok: false, code: "unavailable" };
  const semble = getSemble();

  // 1. It must be this patient's prescription, and sendable by them now.
  const rx = (await semble.listPrescriptions(patientId)).find((r) => r.id === prescriptionId);
  if (!rx) return { ok: false, code: "not-found" };
  const allowed = sendable(user, rx);
  if (!allowed.ok) return allowed;

  // 2. The pharmacy the button named, still the patient's choice, re-read from the directory (fresh Healthmail address).
  const chosen = await semble.getPatientPharmacy(patientId);
  if (!chosen) return { ok: false, code: "no-pharmacy" };
  if (chosen.id !== expectedPharmacyId) return { ok: false, code: "pharmacy-changed" };
  const pharmacy = await semble.getPharmacy(chosen.id);
  if (!pharmacy) return { ok: false, code: "no-pharmacy" };

  // 3. Never twice: a sent, in-flight or interrupted send stops here (unreadable records count as interrupted).
  const state = sendState((await semble.getPrescriptionSends(patientId))[prescriptionId]);
  if (state === "sent") return { ok: false, code: "already-sent" };
  if (state === "sending") return { ok: false, code: "in-progress" };
  if (state === "uncertain") return { ok: false, code: "uncertain" };

  // 4. Everything the email needs, BEFORE claiming — so a Semble hiccup here never leaves a stuck claim.
  const url = await semble.getPrescriptionPdfUrl(patientId, prescriptionId);
  const pdf = url ? await fetchPdf(url) : null;
  if (!pdf) return { ok: false, code: "no-pdf" };
  const profile = await semble.getPatient(patientId);

  // 5. Claim it: only the sole claim goes ahead.
  const claim: PrescriptionSend = { status: "pending", atUtc: new Date().toISOString(), pharmacyId: pharmacy.id, pharmacyName: pharmacy.name, nonce: randomUUID() };
  const claimId = await semble.claimPrescriptionSend(patientId, prescriptionId, claim);
  if (!claimId) return { ok: false, code: "in-progress" };

  // 6. The email. Identifiers stay in the body and the PDF, never in the subject (Healthmail practice).
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const items = rx.drugs.map((d) => [d.name, d.dosage, d.quantity].filter(Boolean).join(" — "));
  const prescriber = `${clinicianDisplay(rx.prescriber)}${rx.prescriber.registration ? ` (${rx.prescriber.registration})` : ""}`;
  const lines = [
    `Patient: ${name}, date of birth ${dmy(profile.dob)}`,
    profile.phone ? `Patient mobile: ${profile.phone}` : "",
    `Patient email: ${profile.email}`,
    `Prescriber: ${prescriber}`,
    `Issued: ${fmtDateYear(rx.issuedAtUtc)} · reference ${rx.id}`,
    ...items.map((i) => `Item: ${i}`),
  ].filter(Boolean);
  const intro = `Please find attached a private prescription from Beyond BMI. The patient chose ${pharmacy.name} in the Beyond BMI patient portal and will be in touch about collection or delivery.`;
  const outro = "If anything is unclear, please reply to this email or call Beyond BMI on +353 1 903 8441.";
  let via: MailVia;
  try {
    via = (
      await sendMail({
        to: pharmacy.email,
        subject: `Prescription from Beyond BMI — ref ${rx.id.slice(-8).toUpperCase()}`,
        text: [`Dear ${pharmacy.name},`, "", intro, "", ...lines, "", outro, "", "Beyond BMI"].join("\n"),
        html: `<p>Dear ${esc(pharmacy.name)},</p><p>${esc(intro)}</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p>${esc(outro)}</p><p>Beyond BMI</p>`,
        attachments: [{ filename: `prescription-${fmtDateYear(rx.issuedAtUtc).replace(/\s+/g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }],
      })
    ).via;
  } catch (e) {
    console.error(`Prescription ${prescriptionId}: email to the pharmacy failed`, e instanceof Error ? e.message : e);
    // Certainly not sent: free the claim so the patient can try again. Unknown: keep it (it reads as "uncertain").
    if (e instanceof MailNotSent && e.definite) {
      await semble.releasePrescriptionSend(patientId, claimId).catch((err) => console.error(`Prescription ${prescriptionId}: could not release the claim`, err));
      return { ok: false, code: "mail" };
    }
    return { ok: false, code: "uncertain" };
  }

  // 7. Done: record it for the portal and, as a note, for the clinicians.
  const sentAt = new Date().toISOString();
  await semble
    .updatePrescriptionSend(patientId, claimId, { ...claim, status: "sent", atUtc: sentAt, via })
    .catch((e) => console.error(`Prescription ${prescriptionId}: emailed but not marked as sent (it will read as "check with the care team")`, e));
  await semble
    .recordPrescriptionSent(patientId, {
      title: "Prescription emailed to pharmacy",
      detail: `${items.join("; ")} (issued ${fmtDateYear(rx.issuedAtUtc)}, reference ${rx.id}) emailed to ${pharmacy.name} <${pharmacy.email}> on ${fmtDateYear(sentAt)}, at the patient's request in the Beyond BMI portal.${via === "outbox" ? " TEST ONLY: written to the local outbox, not delivered." : ""}`,
    })
    .catch((e) => console.error(`Prescription ${prescriptionId}: emailed but the clinical note was not saved`, e));
  return { ok: true, pharmacy: pharmacy.name, via };
}
