import { SUPPORT_EMAIL } from "./supportEmail";
import { sendViaSmtp, smtpConfigured } from "./supportEmail.smtp.server";

export { SUPPORT_EMAIL };

const MAX_MESSAGE_CHARS = 4000;

export function normalizeSupportMessage(raw: unknown): string | null {
  const message = String(raw ?? "").trim();
  if (!message) return null;
  if (message.length > MAX_MESSAGE_CHARS) {
    return message.slice(0, MAX_MESSAGE_CHARS);
  }
  return message;
}

export type SupportMailPayload = {
  to?: string;
  subject: string;
  text: string;
  replyTo?: string | null;
};

type SendSupportEmailResult =
  | { ok: true; delivered: true; provider: "resend" | "smtp" | "formsubmit" }
  | { ok: true; delivered: false; provider: "none"; error: string }
  | { ok: false; error: string };

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = 8_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Low-level send used by chat notify (Resend → Hostinger SMTP → FormSubmit). */
export async function deliverSupportMail(
  payload: SupportMailPayload,
): Promise<SendSupportEmailResult> {
  const to = (payload.to ?? SUPPORT_EMAIL).trim() || SUPPORT_EMAIL;

  const resendKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (resendKey) {
    try {
      const from =
        (process.env.RESEND_FROM_EMAIL ?? "").trim() ||
        "Offrefy Support <onboarding@resend.dev>";
      const res = await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: payload.subject,
          text: payload.text,
          reply_to: payload.replyTo || undefined,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn("[support-email] Resend failed", res.status, detail);
      } else {
        return { ok: true, delivered: true, provider: "resend" };
      }
    } catch (error) {
      console.warn("[support-email] Resend error", error);
    }
  }

  if (smtpConfigured()) {
    const smtp = await sendViaSmtp({
      to,
      subject: payload.subject,
      text: payload.text,
      replyTo: payload.replyTo,
    });
    if (smtp.ok) {
      return { ok: true, delivered: true, provider: "smtp" };
    }
    console.warn("[support-email] SMTP failed", smtp.error);
  }

  try {
    const res = await fetchWithTimeout(
      `https://formsubmit.co/ajax/${encodeURIComponent(to)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          _subject: payload.subject,
          name: "Offrefy Support Chat",
          email: payload.replyTo || "noreply@offrefy.app",
          message: payload.text,
          _replyto: payload.replyTo || undefined,
          _template: "table",
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn("[support-email] FormSubmit failed", res.status, detail);
      return {
        ok: true,
        delivered: false,
        provider: "none",
        error:
          "Email notify unavailable. Set SUPPORT_SMTP_USER + SUPPORT_SMTP_PASS (Hostinger) in .env",
      };
    }
    return { ok: true, delivered: true, provider: "formsubmit" };
  } catch (error) {
    console.warn("[support-email] FormSubmit error", error);
    return {
      ok: true,
      delivered: false,
      provider: "none",
      error:
        "Email notify unavailable. Set SUPPORT_SMTP_USER + SUPPORT_SMTP_PASS (Hostinger) in .env",
    };
  }
}

type SendSupportEmailInput = {
  shop: string;
  message: string;
  replyTo?: string | null;
  /** Included in subject as #key for IMAP reply matching. */
  replyKey?: string | null;
};

/**
 * Delivers support chat messages to SUPPORT_EMAIL.
 * Prefers Resend → Hostinger SMTP → FormSubmit.
 */
export async function sendSupportEmail(
  input: SendSupportEmailInput,
): Promise<SendSupportEmailResult> {
  const subject = input.replyKey
    ? `[Offrefy Chat] ${input.shop} #${input.replyKey}`
    : `[Offrefy Chat] ${input.shop}`;
  const text = [
    `Shop: ${input.shop}`,
    "Reply to this email to respond in the merchant chat popup.",
    "Keep the subject line (including #code) so the reply routes correctly.",
    input.replyTo ? `Merchant contact: ${input.replyTo}` : null,
    "",
    "— Message —",
    input.message,
  ]
    .filter((line) => line != null)
    .join("\n");

  return deliverSupportMail({
    to: SUPPORT_EMAIL,
    subject,
    text,
    // Prefer inbox itself so Hostinger "Reply" lands back in the same mailbox (IMAP).
    replyTo: SUPPORT_EMAIL,
  });
}
