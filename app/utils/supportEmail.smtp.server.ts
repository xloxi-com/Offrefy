/**
 * Hostinger (or any) SMTP delivery for Support Chat — Node only.
 * Cloudflare Workers should use Resend; this module no-ops on Workers.
 */

import { SUPPORT_EMAIL } from "./supportEmail";

function isCloudflareWorker(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

export type SmtpMailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  fromName?: string;
};

export function smtpConfigured(): boolean {
  if (isCloudflareWorker()) return false;
  const user = (process.env.SUPPORT_SMTP_USER ?? process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SUPPORT_SMTP_PASS ?? process.env.SMTP_PASS ?? "").trim();
  return Boolean(user && pass);
}

export async function sendViaSmtp(
  input: SmtpMailInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isCloudflareWorker()) {
    return { ok: false, error: "SMTP not available on Workers" };
  }
  if (!smtpConfigured()) {
    return { ok: false, error: "SMTP not configured" };
  }

  const host =
    (process.env.SUPPORT_SMTP_HOST ?? process.env.SMTP_HOST ?? "").trim() ||
    "smtp.hostinger.com";
  const port = Number(
    process.env.SUPPORT_SMTP_PORT ?? process.env.SMTP_PORT ?? "465",
  );
  const user = (process.env.SUPPORT_SMTP_USER ?? process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SUPPORT_SMTP_PASS ?? process.env.SMTP_PASS ?? "").trim();
  const fromAddress =
    (process.env.SUPPORT_SMTP_FROM ?? "").trim() || user || SUPPORT_EMAIL;
  const fromName = input.fromName || "Offrefy Support";

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      replyTo: input.replyTo || undefined,
    });
    return { ok: true };
  } catch (error) {
    console.warn("[support-email] SMTP failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "SMTP send failed",
    };
  }
}
