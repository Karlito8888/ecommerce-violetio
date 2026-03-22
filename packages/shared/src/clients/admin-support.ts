/**
 * Admin support inquiry client — CRUD operations for the back-office
 * support management UI. All functions require an authenticated admin
 * Supabase client (RLS policies enforce admin-only access).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SupportInquiry,
  SupportInquiryFilters,
  SupportInquiryStatus,
  LinkedOrderInfo,
} from "../types/admin-support.types.js";

/**
 * Raw database row shape for support_inquiries table.
 * Matches the Supabase PostgREST response before camelCase mapping.
 * Using a typed interface instead of Record<string, unknown> catches
 * schema drift at compile time rather than silently casting with `as`.
 */
interface SupportInquiryRow {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  order_id: string | null;
  status: string;
  internal_notes: string | null;
}

/**
 * Map a raw DB row (snake_case) to a SupportInquiry (camelCase).
 * Centralizes the transformation so callers always get a consistent shape.
 */
function mapRow(row: SupportInquiryRow): SupportInquiry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject as SupportInquiry["subject"],
    message: row.message,
    orderId: row.order_id ?? null,
    status: row.status as SupportInquiryStatus,
    internalNotes: row.internal_notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch all support inquiries with optional filters, ordered newest first.
 *
 * @param client - Admin-authenticated Supabase client
 * @param filters - Optional status/subject filters
 * @returns Array of mapped SupportInquiry objects
 */
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

/**
 * Fetch a single inquiry by ID. Returns null if not found.
 *
 * @param client - Admin-authenticated Supabase client
 * @param inquiryId - UUID of the inquiry
 * @returns The mapped inquiry, or null if not found
 */
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

/**
 * Update inquiry status.
 *
 * @param client - Admin-authenticated Supabase client
 * @param inquiryId - UUID of the inquiry to update
 * @param status - New status value
 * @returns true if the update succeeded
 */
export async function updateInquiryStatus(
  client: SupabaseClient,
  inquiryId: string,
  status: SupportInquiryStatus,
): Promise<boolean> {
  const { error } = await client.from("support_inquiries").update({ status }).eq("id", inquiryId);
  return !error;
}

/**
 * Add/replace internal notes on an inquiry.
 *
 * @param client - Admin-authenticated Supabase client
 * @param inquiryId - UUID of the inquiry
 * @param notes - New internal notes content
 * @returns true if the update succeeded
 */
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

/**
 * Fetch linked order info by order_id (Violet order ID string).
 * Used to display order context alongside a support inquiry.
 *
 * @param client - Admin-authenticated Supabase client
 * @param orderId - Violet order ID to look up
 * @returns Linked order summary, or null if not found
 */
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
