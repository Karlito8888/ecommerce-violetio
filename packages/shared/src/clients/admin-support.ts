import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SupportInquiry,
  SupportInquiryFilters,
  SupportInquiryStatus,
  LinkedOrderInfo,
} from "../types/admin-support.types.js";

/** Map DB row (snake_case) to SupportInquiry (camelCase). */
function mapRow(row: Record<string, unknown>): SupportInquiry {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    subject: row.subject as SupportInquiry["subject"],
    message: row.message as string,
    orderId: (row.order_id as string) ?? null,
    status: row.status as SupportInquiryStatus,
    internalNotes: (row.internal_notes as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Fetch all support inquiries with optional filters, ordered newest first. */
export async function getSupportInquiries(
  client: SupabaseClient,
  filters?: SupportInquiryFilters,
): Promise<SupportInquiry[]> {
  let query = client
    .from("support_inquiries")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.subject) {
    query = query.eq("subject", filters.subject);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Fetch a single inquiry by ID. Returns null if not found. */
export async function getSupportInquiry(
  client: SupabaseClient,
  inquiryId: string,
): Promise<SupportInquiry | null> {
  const { data, error } = await client
    .from("support_inquiries")
    .select("*")
    .eq("id", inquiryId)
    .single();

  if (error) {
    // PGRST116 = "not found" for .single() — expected, return null
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return mapRow(data);
}

/** Update inquiry status. */
export async function updateInquiryStatus(
  client: SupabaseClient,
  inquiryId: string,
  status: SupportInquiryStatus,
): Promise<boolean> {
  const { error } = await client.from("support_inquiries").update({ status }).eq("id", inquiryId);
  return !error;
}

/** Add/replace internal notes on an inquiry. */
export async function updateInternalNotes(
  client: SupabaseClient,
  inquiryId: string,
  notes: string,
): Promise<boolean> {
  const { error } = await client
    .from("support_inquiries")
    .update({ internal_notes: notes })
    .eq("id", inquiryId);
  return !error;
}

/** Fetch linked order info by order_id (Violet order ID string). */
export async function getLinkedOrder(
  client: SupabaseClient,
  orderId: string,
): Promise<LinkedOrderInfo | null> {
  const { data, error } = await client
    .from("orders")
    .select("id, violet_order_id, status, total, created_at")
    .eq("violet_order_id", orderId)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    violetOrderId: data.violet_order_id,
    status: data.status,
    total: data.total,
    createdAt: data.created_at,
  };
}
