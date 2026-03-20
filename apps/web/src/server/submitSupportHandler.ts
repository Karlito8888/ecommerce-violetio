import { insertSupportInquiry, countRecentInquiries } from "@ecommerce/shared";
import type { SupportInquiryInput, SupportInquiryResult } from "@ecommerce/shared";
import { SUPPORT_SUBJECTS } from "@ecommerce/shared";
import { getSupabaseServer } from "./supabaseServer";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT = 3;

function validateInquiry(input: SupportInquiryInput): string | null {
  if (!input.name || input.name.trim().length === 0) {
    return "Name is required";
  }
  if (!input.email || !EMAIL_REGEX.test(input.email)) {
    return "A valid email address is required";
  }
  if (!SUPPORT_SUBJECTS.includes(input.subject)) {
    return "Please select a valid subject";
  }
  if (!input.message || input.message.length < 20) {
    return "Message must be at least 20 characters";
  }
  if (input.message.length > 2000) {
    return "Message must be no more than 2000 characters";
  }
  return null;
}

export async function submitSupportHandler(
  inquiry: SupportInquiryInput,
  honeypot?: string,
): Promise<SupportInquiryResult> {
  // Honeypot check — silently pretend success for bots
  if (honeypot) {
    return { success: true };
  }

  // Validate input
  const validationError = validateInquiry(inquiry);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const supabase = getSupabaseServer();

  // Rate limiting: max 3 submissions per email per hour
  const recentCount = await countRecentInquiries(supabase, inquiry.email);
  if (recentCount >= RATE_LIMIT) {
    return {
      success: false,
      error: "You've submitted too many requests. Please try again later.",
    };
  }

  // Insert into support_inquiries
  const result = await insertSupportInquiry(supabase, inquiry);
  if (!result) {
    return { success: false, error: "Something went wrong. Please try again." };
  }

  // Fire-and-forget: send confirmation + admin alert emails
  try {
    await supabase.functions.invoke("send-support-email", {
      body: {
        inquiry_id: result.id,
        name: inquiry.name,
        email: inquiry.email,
        subject: inquiry.subject,
        message: inquiry.message,
        order_id: inquiry.orderId || null,
      },
    });
  } catch {
    // Email failure should not block the submission
  }

  return { success: true, inquiryId: result.id };
}
