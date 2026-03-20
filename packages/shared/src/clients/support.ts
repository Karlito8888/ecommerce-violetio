import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportInquiryInput } from "../types/support.types";

export async function insertSupportInquiry(
  client: SupabaseClient,
  input: SupportInquiryInput,
): Promise<{ id: string } | null> {
  const { data, error } = await client
    .from("support_inquiries")
    .insert({
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
      order_id: input.orderId || null,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return { id: data.id };
}

export async function countRecentInquiries(client: SupabaseClient, email: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await client
    .from("support_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", oneHourAgo);

  if (error) return 0;
  return count ?? 0;
}
