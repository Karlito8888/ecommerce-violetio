/**
 * Edge Function: send-support-email
 *
 * Sends two emails when a visitor submits a support inquiry:
 * 1. Admin alert → SUPPORT_EMAIL with inquiry details
 * 2. Visitor confirmation → submitter's email confirming receipt
 *
 * Invoked fire-and-forget from the web server function (submitSupportHandler)
 * or directly from mobile via `supabase.functions.invoke()`.
 *
 * ## Delivery pipeline
 * - Uses Resend API via raw fetch (no npm SDK — Deno runtime constraint)
 * - Idempotency-Key prevents duplicate sends: `support-{inquiry_id}`
 * - Always returns HTTP 200 (callers use fire-and-forget)
 * - Missing RESEND_API_KEY → graceful skip (no error)
 *
 * @see https://docs.resend.com/api-reference/emails/send-email — Resend email API
 */

import { corsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

interface SupportEmailPayload {
  inquiry_id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  order_id: string | null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAdminEmail(
  payload: SupportEmailPayload,
  appUrl: string,
): {
  from: string;
  to: string;
  subject: string;
  html: string;
} {
  const fromAddress = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "noreply@example.com";
  const supportEmail = Deno.env.get("SUPPORT_EMAIL");
  if (!supportEmail) {
    throw new Error("SUPPORT_EMAIL not configured");
  }

  const orderLine = payload.order_id
    ? `<p style="margin:0 0 8px;color:#555;">Order ID: <strong>${escapeHtml(payload.order_id)}</strong></p>`
    : "";

  return {
    from: fromAddress,
    to: supportEmail,
    subject: `New Support Inquiry: ${payload.subject}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a1a;margin:0 0 16px;">New Support Inquiry</h2>
        <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:20px;margin-bottom:16px;">
          <p style="margin:0 0 8px;color:#555;">From: <strong>${escapeHtml(payload.name)}</strong> (${escapeHtml(payload.email)})</p>
          <p style="margin:0 0 8px;color:#555;">Subject: <strong>${escapeHtml(payload.subject)}</strong></p>
          ${orderLine}
        </div>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:20px;margin-bottom:16px;">
          <h3 style="color:#333;margin:0 0 12px;">Message</h3>
          <p style="color:#444;line-height:1.6;white-space:pre-wrap;margin:0;">${escapeHtml(payload.message)}</p>
        </div>
        <p style="color:#999;font-size:13px;">Inquiry ID: ${escapeHtml(payload.inquiry_id)}</p>
        <p style="color:#999;font-size:13px;">
          <a href="${escapeHtml(appUrl)}" style="color:#666;">View in dashboard</a>
        </p>
      </div>
    `,
  };
}

function renderConfirmationEmail(payload: SupportEmailPayload): {
  from: string;
  to: string;
  subject: string;
  html: string;
} {
  const fromAddress = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "noreply@example.com";

  return {
    from: fromAddress,
    to: payload.email,
    subject: "We received your inquiry",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a1a;margin:0 0 16px;">Thank you, ${escapeHtml(payload.name)}</h2>
        <p style="color:#444;line-height:1.6;margin:0 0 16px;">
          We've received your support inquiry regarding "<strong>${escapeHtml(payload.subject)}</strong>"
          and will get back to you within 24-48 hours.
        </p>
        <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:20px;margin-bottom:16px;">
          <h3 style="color:#333;margin:0 0 12px;font-size:14px;">Your message</h3>
          <p style="color:#666;line-height:1.5;white-space:pre-wrap;margin:0;font-size:14px;">${escapeHtml(payload.message)}</p>
        </div>
        <p style="color:#999;font-size:13px;">Reference: ${escapeHtml(payload.inquiry_id)}</p>
      </div>
    `,
  };
}

async function sendEmail(
  email: { from: string; to: string; subject: string; html: string },
  apiKey: string,
  idempotencyKey: string,
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(email),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[send-support-email] Resend API error ${res.status}: ${errorBody}`);
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
    console.error(`[send-support-email] Network error: ${msg}`);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("[send-support-email] RESEND_API_KEY not configured — skipping emails");
    return new Response(JSON.stringify({ data: { sent: false }, error: null }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

  let payload: SupportEmailPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ data: null, error: { message: "Invalid JSON body" } }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  if (!payload.inquiry_id || !payload.email || !payload.name) {
    return new Response(
      JSON.stringify({ data: null, error: { message: "Missing required fields" } }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const results = { admin: false, confirmation: false };

  // Send admin alert
  try {
    const adminEmail = renderAdminEmail(payload, APP_URL);
    results.admin = await sendEmail(
      adminEmail,
      RESEND_API_KEY,
      `support-admin-${payload.inquiry_id}`,
    );
  } catch (err) {
    console.error(
      `[send-support-email] Admin email failed: ${err instanceof Error ? err.message : "Unknown"}`,
    );
  }

  // Send visitor confirmation
  try {
    const confirmEmail = renderConfirmationEmail(payload);
    results.confirmation = await sendEmail(
      confirmEmail,
      RESEND_API_KEY,
      `support-confirm-${payload.inquiry_id}`,
    );
  } catch (err) {
    console.error(
      `[send-support-email] Confirmation email failed: ${err instanceof Error ? err.message : "Unknown"}`,
    );
  }

  return new Response(JSON.stringify({ data: { sent: true, ...results }, error: null }), {
    status: 200,
    headers: jsonHeaders,
  });
});
