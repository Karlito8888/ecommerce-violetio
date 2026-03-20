import type {
  AdminSupportDetailData,
  AdminSupportListData,
  SupportInquiryFilters,
} from "@ecommerce/shared";
import { getSupportInquiries, getSupportInquiry, getLinkedOrder } from "@ecommerce/shared";

import { requireAdminOrThrow } from "#/server/adminAuth";
import { getSupabaseServer } from "#/server/supabaseServer";

/** Fetch support inquiries list with optional filters. */
export async function getAdminSupportListHandler(
  filters?: SupportInquiryFilters,
): Promise<AdminSupportListData> {
  await requireAdminOrThrow();
  const serviceClient = getSupabaseServer();
  const inquiries = await getSupportInquiries(serviceClient, filters);
  return { inquiries };
}

/** Fetch a single inquiry with linked order info. */
export async function getAdminSupportDetailHandler(
  inquiryId: string,
): Promise<AdminSupportDetailData> {
  await requireAdminOrThrow();
  const serviceClient = getSupabaseServer();

  const inquiry = await getSupportInquiry(serviceClient, inquiryId);
  if (!inquiry) {
    throw new Response("Inquiry not found", { status: 404 });
  }

  let linkedOrder = null;
  if (inquiry.orderId) {
    linkedOrder = await getLinkedOrder(serviceClient, inquiry.orderId);
  }

  return { inquiry, linkedOrder };
}
