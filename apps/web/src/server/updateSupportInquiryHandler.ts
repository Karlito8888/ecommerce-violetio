import type { SupportInquiryStatus } from "@ecommerce/shared";
import { SUPPORT_STATUSES, updateInquiryStatus, updateInternalNotes } from "@ecommerce/shared";

import { requireAdminOrThrow } from "#/server/adminAuthGuard";
import { getSupabaseServer } from "#/server/supabaseServer";

/** Update inquiry status. */
export async function updateSupportStatusHandler(
  inquiryId: string,
  status: SupportInquiryStatus,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminOrThrow();

  if (!SUPPORT_STATUSES.includes(status)) {
    return { success: false, error: `Invalid status: ${status}` };
  }

  const serviceClient = getSupabaseServer();
  const ok = await updateInquiryStatus(serviceClient, inquiryId, status);
  if (!ok) return { success: false, error: "Failed to update status" };
  return { success: true };
}

/** Update internal notes. */
export async function updateSupportNotesHandler(
  inquiryId: string,
  notes: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminOrThrow();
  const serviceClient = getSupabaseServer();
  const ok = await updateInternalNotes(serviceClient, inquiryId, notes);
  if (!ok) return { success: false, error: "Failed to save notes" };
  return { success: true };
}
