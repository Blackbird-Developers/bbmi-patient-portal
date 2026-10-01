import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

/**
 * Outgoing email from the portal (today: prescriptions to the patient's chosen pharmacy).
 *
 * PORTAL_MAIL_TRANSPORT=smtp sends through PORTAL_SMTP_HOST/PORT/USER/PASS from PORTAL_MAIL_FROM
 * (TLS required). For pharmacies in the Republic that must be a sender Healthmail accepts
 * (Beyond BMI's own domain is on the HSE Connected Agencies list).
 * Anything else — development only — writes the full message, attachments included, to
 * ./.outbox/*.eml instead of sending it. Production refuses to run without SMTP.
 */

export type MailVia = "smtp" | "outbox";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/** definite = the message certainly did not leave (safe to try again); otherwise the outcome is unknown. */
export class MailNotSent extends Error {
  constructor(
    message: string,
    public readonly definite: boolean,
  ) {
    super(message);
    this.name = "MailNotSent";
  }
}

export const mailVia = (): MailVia => (process.env.PORTAL_MAIL_TRANSPORT === "smtp" ? "smtp" : "outbox");

/**
 * Errors raised before the server accepted the message: nothing was sent. ECONNECTION counts only when the
 * connection never opened — nodemailer also raises it when the socket drops after the message body went out.
 */
const NOT_SENT = new Set(["EAUTH", "EDNS", "EENVELOPE", "ETLS", "ECONFIG"]);
const NEVER_CONNECTED = /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|getaddrinfo/;

export async function sendMail(m: Mail): Promise<{ via: MailVia; id: string }> {
  const from = process.env.PORTAL_MAIL_FROM;
  const message = { from, to: m.to, replyTo: m.replyTo || process.env.PORTAL_MAIL_REPLY_TO || undefined, subject: m.subject, text: m.text, html: m.html, attachments: m.attachments };

  if (mailVia() === "smtp") {
    const host = process.env.PORTAL_SMTP_HOST;
    const port = Number(process.env.PORTAL_SMTP_PORT || 587);
    if (!host || !from) throw new MailNotSent("SMTP is not configured (PORTAL_SMTP_HOST, PORTAL_MAIL_FROM)", true);
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465, // never fall back to plain text: these emails carry prescriptions
      auth: process.env.PORTAL_SMTP_USER ? { user: process.env.PORTAL_SMTP_USER, pass: process.env.PORTAL_SMTP_PASS ?? "" } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    try {
      const info = await transport.sendMail(message);
      if (info.rejected?.length) throw new MailNotSent("The recipient was rejected", true);
      return { via: "smtp", id: String(info.messageId ?? "") };
    } catch (e) {
      if (e instanceof MailNotSent) throw e;
      const code = (e as { code?: string }).code ?? "";
      const msg = e instanceof Error ? e.message : String(e);
      throw new MailNotSent(msg, NOT_SENT.has(code) || (code === "ECONNECTION" && NEVER_CONNECTED.test(msg)));
    }
  }

  if (process.env.NODE_ENV === "production") throw new MailNotSent("No mail transport configured: set PORTAL_MAIL_TRANSPORT=smtp", true);
  // Development: build the real MIME message and keep it on disk.
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = await transport.sendMail({ ...message, from: from || "Beyond BMI (test outbox) <outbox@localhost>" });
  const dir = path.join(process.cwd(), ".outbox");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}_${m.to.replace(/[^a-z0-9]+/gi, "_")}.eml`);
  await fs.writeFile(file, info.message as Buffer);
  return { via: "outbox", id: file };
}
