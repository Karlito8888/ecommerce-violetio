/**
 * Edge Function: generate-embeddings
 *
 * Takes product data, generates an OpenAI text-embedding-3-small vector,
 * and upserts it into the product_embeddings table (pgvector).
 *
 * Called by the webhook sync pipeline (Story 3.7) to keep embeddings
 * up-to-date when products change in Violet.
 *
 * ## Authorization (M3 code review fix)
 *
 * This function writes to the database via service_role, so it MUST NOT
 * be callable by anonymous clients. We verify the caller's JWT matches
 * the service_role key. Without this check, any client with the anon key
 * could pollute the embeddings table with malicious data, degrading
 * search quality for all users.
 *
 * ## Validation (M1 code review fix)
 *
 * Uses Zod schemas from `_shared/schemas.ts` instead of manual typeof checks.
 * This ensures validation rules are consistent with client-side schemas and
 * provides structured error messages with field paths.
 */

import { corsHeaders } from "../_shared/cors.ts";
import { generateEmbedding } from "../_shared/openai.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { generateEmbeddingsRequestSchema } from "../_shared/schemas.ts";

/**
 * Verifies that the request was made with the service_role key.
 *
 * Supabase Edge Functions receive the caller's key in the Authorization header
 * as a Bearer token. We compare it against SUPABASE_SERVICE_ROLE_KEY to ensure
 * only privileged callers (other Edge Functions, webhooks, admin scripts) can
 * write embeddings.
 *
 * The anon key grants read-only access via RLS, but this function uses
 * getSupabaseAdmin() which bypasses RLS — so we need this extra gate.
 */
function isServiceRole(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return token === serviceRoleKey && serviceRoleKey !== "";
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // M3 fix: Reject calls that don't use the service_role key
  if (!isServiceRole(req)) {
    return new Response(
      JSON.stringify({
        data: null,
        error: {
          code: "EMBEDDINGS.UNAUTHORIZED",
          message: "This function requires service_role authorization",
        },
      }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();

    // M1 fix: Zod validation instead of manual typeof checks
    const validation = generateEmbeddingsRequestSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          data: null,
          error: {
            code: "EMBEDDINGS.INVALID_INPUT",
            message: validation.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { productId, productName, description, vendor, tags, category, merchantId } = validation.data;

    // Concatenate product fields into searchable text
    const textContent = `${productName}. ${description}. Brand: ${vendor}. Category: ${category}. Tags: ${tags.join(", ")}`;

    // Generate embedding via OpenAI text-embedding-3-small
    const embedding = await generateEmbedding(textContent);

    // Upsert into product_embeddings table
    const supabase = getSupabaseAdmin();
    const { error: dbError } = await supabase.from("product_embeddings").upsert(
      {
        product_id: productId,
        product_name: productName,
        text_content: textContent,
        embedding: JSON.stringify(embedding),
        merchant_id: merchantId ?? null,
      },
      { onConflict: "product_id" },
    );

    if (dbError) {
      return new Response(
        JSON.stringify({
          data: null,
          error: { code: "EMBEDDINGS.STORAGE_FAILED", message: dbError.message },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        data: { productId, embeddingSize: 1536 },
        error: null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        data: null,
        error: {
          code: "EMBEDDINGS.GENERATION_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
