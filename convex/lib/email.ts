// convex/lib/email.ts
//
// Centralized email utilities for Convex.
// Provides:
//   - sendEmail: public action for sending emails via Resend (library)
//   - sendRawEmail: plain async function for internal actions (raw fetch)
//   - escapeHtml: shared HTML escape utility
//
// DRY: All Resend API calls and HTML escaping go through this module.
//
// Doc: https://docs.convex.dev/functions/actions

import { action } from "../_generated/server";
import { v } from "convex/values";

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS ?? "onboarding@resend.dev";
const APP_NAME = "Maison Émile";

// ─── Shared Utilities ────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS in email templates.
 * Shared across all email-sending code (webhook notifications, support replies, etc.).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send an email via Resend raw fetch API.
 * Plain async function — usable from any action or internal action without ctx.runAction() overhead.
 *
 * Per Convex best practice: prefer plain TypeScript helpers over ctx.runAction() when
 * staying in the same runtime.
 * Doc: https://docs.convex.dev/understanding/best-practices — "Use helper functions to write shared code"
 */
export async function sendRawEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  idempotencyKey?: string;
}): Promise<{ success: true; resendEmailId?: string } | { success: false; error: string }> {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) {
    return { success: false, error: "AUTH_RESEND_KEY not configured" };
  }

  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  const fromName = params.fromName ?? APP_NAME;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (params.idempotencyKey) {
    headers["Idempotency-Key"] = params.idempotencyKey;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: `${fromName} <${FROM_ADDRESS}>`,
        to: recipients,
        subject: params.subject,
        html: params.html,
        text: params.text ?? undefined,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { id?: string };
      return { success: true, resendEmailId: data.id };
    } else {
      const errorBody = await res.text();
      return { success: false, error: `${res.status}: ${errorBody}` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown network error",
    };
  }
}

// ─── Public Action ───────────────────────────────────────────────────

/**
 * Send an email via Resend. Generic action usable from any other action or mutation.
 */
export const sendEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    text: v.optional(v.string()),
  },
  handler: async (_ctx, { to, subject, html, text }) => {
    const result = await sendRawEmail({ to, subject, html, text });
    if (!result.success) {
      throw new Error(`Failed to send email: ${result.error}`);
    }
  },
});
