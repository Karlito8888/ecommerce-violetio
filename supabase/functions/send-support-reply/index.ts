/**
 * Edge Function: send-support-reply
 *
 * Sends a reply email from admin to the customer who submitted a support inquiry.
 * Invoked fire-and-forget from replySupportInquiryHandler on the web server.
 *
 * ## Delivery pipeline
 * - Uses Resend API via raw fetch (no npm SDK — Deno runtime constraint)
 * - Idempotency-Key prevents duplicate sends: `support-reply-{inquiry_id}-{hash}`
 * - Always returns HTTP 200 (callers use fire-and-forget)
 * - Missing RESEND_API_KEY → graceful skip (no error)
 *
 * @see https://docs.resend.com/api-reference/emails/send-email — Resend email API
 */

import { corsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

interface SupportReplyPayload {
  inquiry_id: string;
  customer_email: string;
  customer_name: string;
  subject: string;
  reply_message: string;
  admin_email: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderReplyEmail(payload: SupportReplyPayload): {
  from: string;
  to: string;
  subject: string;
  html: string;
} {
  const fromAddress = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "noreply@example.com";

  return {
    from: fromAddress,
    to: payload.customer_email,
    subject: `Re: ${payload.subject} — Support Reply`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a1a;margin:0 0 16px;">Reply to Your Support Inquiry</h2>
        <p style="color:#444;line-height:1.6;margin:0 0 16px;">
          Hello ${escapeHtml(payload.customer_name)},
        </p>
        <p style="color:#444;line-height:1.6;margin:0 0 8px;">
          Regarding your inquiry about "<strong>${escapeHtml(payload.subject)}</strong>":
        </p>
        <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:20px;margin:16px 0;">
          <p style="color:#333;line-height:1.6;white-space:pre-wrap;margin:0;">${escapeHtml(payload.reply_message)}</p>
        </div>
        <p style="color:#666;font-size:14px;line-height:1.5;margin:16px 0 0;">
          If you have further questions, please reply to this email or submit a new inquiry on our website.
        </p>
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px;" />
        <p style="color:#999;font-size:12px;margin:0;">Reference: ${escapeHtml(payload.inquiry_id)}</p>
      </div>
    `,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("[send-support-reply] RESEND_API_KEY not configured — skipping email");
    return new Response(JSON.stringify({ data: { sent: false }, error: null }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  let payload: SupportReplyPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ data: null, error: { message: "Invalid JSON body" } }), {
      status: 200,
      headers: jsonHeaders,
    });
  }

  if (!payload.inquiry_id || !payload.customer_email || !payload.reply_message) {
    return new Response(
      JSON.stringify({ data: null, error: { message: "Missing required fields" } }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const email = renderReplyEmail(payload);

  // Deterministic hash from content — same inquiry+message = same key = deduplicated
  const msgHash = Array.from(payload.reply_message).reduce(
    (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0,
    0,
  );
  const idempotencyKey = `support-reply-${payload.inquiry_id}-${msgHash.toString(36)}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(email),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[send-support-reply] Resend API error ${res.status}: ${errorBody}`);
      return new Response(JSON.stringify({ data: { sent: false }, error: null }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({ data: { sent: true }, error: null }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error";
    console.error(`[send-support-reply] Network error: ${msg}`);
    return new Response(JSON.stringify({ data: { sent: false }, error: null }), {
      status: 200,
      headers: jsonHeaders,
    });
  }
});
