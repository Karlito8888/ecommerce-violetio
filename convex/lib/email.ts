// convex/lib/email.ts
//
// Convex action for sending emails via Resend.
// Replaces Supabase Edge Functions: send-notification, send-support-email, send-support-reply.
//
// Actions run in a separate runtime with access to fetch() and process.env.
// ctx.db is NOT available in actions — use ctx.runQuery/runMutation for DB access.
//
// Doc: https://docs.convex.dev/functions/actions

import { action } from "../_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS ?? "onboarding@resend.dev";
const APP_NAME = "Maison Émile";

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
    const resend = new Resend(process.env.AUTH_RESEND_KEY);
    const { error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_ADDRESS}>`,
      to: [to],
      subject,
      html,
      text: text ?? undefined,
    });

    if (error) {
      throw new Error(`Failed to send email: ${JSON.stringify(error)}`);
    }
  },
});
