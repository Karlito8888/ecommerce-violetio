import type { SupportReplyInput } from "@ecommerce/shared";
import { getSupportInquiry, updateInquiryStatus } from "@ecommerce/shared";

import { requireAdminOrThrow } from "#/server/adminAuth";
import { getSupabaseServer } from "#/server/supabaseServer";

/** Send a reply email to the customer and auto-advance inquiry status. */
export async function replySupportHandler(
  input: SupportReplyInput,
): Promise<{ success: boolean; error?: string }> {
  const admin = await requireAdminOrThrow();

  if (!input.replyMessage || input.replyMessage.trim().length < 10) {
    return { success: false, error: "Reply must be at least 10 characters" };
  }

  const serviceClient = getSupabaseServer();

  // Fetch the inquiry to get customer details
  const inquiry = await getSupportInquiry(serviceClient, input.inquiryId);
  if (!inquiry) {
    return { success: false, error: "Inquiry not found" };
  }

  // Fire-and-forget: send reply email via Edge Function
  try {
    await serviceClient.functions.invoke("send-support-reply", {
      body: {
        inquiry_id: inquiry.id,
        customer_email: inquiry.email,
        customer_name: inquiry.name,
        subject: inquiry.subject,
        reply_message: input.replyMessage,
        admin_email: admin.email ?? "support",
      },
    });
  } catch {
    // Email failure should not block the action
  }

  // Auto-advance status: new → in-progress (admin is responding)
  if (inquiry.status === "new") {
    await updateInquiryStatus(serviceClient, input.inquiryId, "in-progress");
  }

  return { success: true };
}
