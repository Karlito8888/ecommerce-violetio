/**
 * Support inquiry client — handles public-facing support form submissions.
 *
 * Uses `.js` extension in imports for ESM compatibility. While the bundler
 * resolves extensionless imports, consistent `.js` usage ensures compatibility
 * if the project moves to native ESM (Node --experimental-strip-types or Deno).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportInquiryInput } from "../types/support.types.js";

/**
 * Insert a new support inquiry into the database.
 *
 * @param client - Authenticated Supabase client (anon key is fine for public submissions)
 * @param input - Validated form data from the support contact form
 * @returns The new inquiry's ID, or null if the insert failed
 */
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
      /**
       * Uses nullish coalescing (??) instead of logical OR (||) to only
       * coalesce undefined/null. An empty string "" would be coerced to null
       * by ||, silently masking a caller bug. ?? preserves the distinction.
       */
      order_id: input.orderId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return { id: data.id };
}

/**
 * Count how many inquiries a given email has submitted in the last hour.
 * Used for rate-limiting to prevent spam submissions.
 *
 * @param client - Supabase client
 * @param email - The submitter's email address
 * @returns Number of recent inquiries (defaults to 0 on error)
 */
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
