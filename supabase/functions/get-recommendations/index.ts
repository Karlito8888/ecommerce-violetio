/**
 * Edge Function: get-recommendations
 *
 * Returns semantically similar products for a given product using
 * pgvector cosine similarity on existing product embeddings.
 *
 * ## Data flow
 * 1. Validate input with Zod
 * 2. Look up the source product's embedding vector
 * 3. Call match_products() RPC with that embedding to find similar products
 * 4. Exclude the source product from results
 * 5. Optionally apply personalization boost for authenticated users (Story 6.3)
 * 6. Fetch live product data from Violet API
 * 7. Return { data: RecommendationResponse, error: null }
 *
 * Unlike search-products, this function does NOT generate a new embedding —
 * it reuses the source product's existing embedding as the query vector.
 *
 * ## Security (C2 review fix)
 * user_id for personalization is now extracted from the JWT Authorization header,
 * NOT from the request body. This prevents a malicious caller from passing another
 * user's ID to indirectly reveal their browsing preferences through re-ranking.
 * The `user_id` field in the request body schema is IGNORED and kept only for
 * backward compatibility (the schema still validates but the value is discarded).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts"
import { DEFAULT_VIOLET_API_BASE } from "../_shared/constants.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

import { violetFetch } from "../_shared/fetchWithRetry.ts";
import { recommendationRequestSchema } from "../_shared/schemas.ts";
import { applyPersonalizationBoost, type UserSearchProfile } from "../_shared/personalization.ts";

// ─── Types ───────────────────────────────────────────────────────

interface PgvectorMatch {
  product_id: string;
  product_name: string;
  text_content: string;
  similarity: number;
}

interface VioletProduct {
  id: number;
  name: string;
  description?: string;
  min_price?: number;
  max_price?: number;
  currency?: string;
  available?: boolean;
  vendor?: string;
  source?: string;
  external_url?: string;
  albums?: Array<{
    primary_media?: { url: string };
    media?: Array<{ url: string; display_order?: number; primary?: boolean }>;
  }>;
}

// ─── Violet enrichment ──────────────────────────────────────────

async function fetchVioletProducts(productIds: string[]): Promise<Map<string, VioletProduct>> {
  const result = new Map<string, VioletProduct>();
  if (productIds.length === 0) return result;

  const violetApiBase = Deno.env.get("VIOLET_API_BASE") ?? DEFAULT_VIOLET_API_BASE;

  const fetches = productIds.map(async (id) => {
    try {
      const res = await violetFetch(`${violetApiBase}/catalog/offers/${id}`);
      if (res.ok) {
        const product: VioletProduct = await res.json();
        result.set(id, product);
      } else {
        console.error(
          `[get-recommendations] Violet fetch failed for product ${id}: HTTP ${res.status}`,
        );
      }
    } catch (err) {
      console.error(
        `[get-recommendations] Violet fetch error for product ${id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  });

  await Promise.all(fetches);
  return result;
}

function extractThumbnail(product: VioletProduct): string | null {
  for (const album of product.albums ?? []) {
    if (album.primary_media?.url) return album.primary_media.url;
    if (album.media?.[0]?.url) return album.media[0].url;
  }
  return null;
}

// ─── Main handler ────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();

    const validation = recommendationRequestSchema.safeParse(requestBody);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          data: null,
          error: {
            code: "RECOMMENDATIONS.INVALID_REQUEST",
            message: validation.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { product_id, limit } = validation.data;
    const matchCount = limit ?? 8;

    const supabase = getSupabaseAdmin();

    /**
     * C2 review fix: Extract user_id from JWT, not from request body.
     *
     * BEFORE: user_id was taken from `validation.data.user_id` (client-provided),
     * allowing any caller to pass another user's UUID and get personalized results
     * based on that user's browsing history — an indirect data exposure.
     *
     * NOW: user_id is extracted from the Authorization JWT header (same pattern
     * as track-event and search-products). If no valid JWT or anonymous user,
     * personalization is skipped and base similarity results are returned.
     */
    let authUserId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
        const {
          data: { user },
        } = await userClient.auth.getUser();
        if (user && !user.is_anonymous) {
          authUserId = user.id;
        }
      } catch {
        // Auth extraction failure is non-fatal — proceed without personalization
      }
    }

    // 1. Look up the source product's embedding
    const { data: embeddingRow, error: embeddingError } = await supabase
      .from("product_embeddings")
      .select("embedding")
      .eq("product_id", product_id)
      .single();

    if (embeddingError || !embeddingRow?.embedding) {
      // No embedding found — return empty (not an error)
      return new Response(
        JSON.stringify({
          data: { products: [], personalized: false },
          error: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. pgvector cosine similarity search (request extra to account for self-exclusion)
    const { data: matches, error: rpcError } = await supabase.rpc("match_products", {
      query_embedding: embeddingRow.embedding,
      match_threshold: 0.3,
      match_count: matchCount + 1,
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({
          data: null,
          error: { code: "RECOMMENDATIONS.QUERY_FAILED", message: rpcError.message },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Filter out the source product
    const filteredMatches = (matches as PgvectorMatch[]).filter((m) => m.product_id !== product_id);

    if (filteredMatches.length === 0) {
      return new Response(
        JSON.stringify({
          data: { products: [], personalized: false },
          error: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Take top `matchCount` after self-exclusion
    const topMatches = filteredMatches.slice(0, matchCount);
    const productIds = topMatches.map((m) => m.product_id);

    // Build text_content lookup for personalization
    const textContentMap = new Map<string, string>();
    for (const match of topMatches) {
      textContentMap.set(match.product_id, match.text_content);
    }

    // 4. Fetch Violet data + optional user profile in parallel
    const [violetProducts, profileResult] = await Promise.all([
      fetchVioletProducts(productIds),
      authUserId
        ? supabase.rpc("get_user_search_profile", { p_user_id: authUserId })
        : Promise.resolve({ data: null, error: null }),
    ]);

    // 5. Build enriched results — only include products with successful Violet data
    // (Task 1.10: "if Violet fetch fails for some products → return subset that succeeded")
    let products: Array<Record<string, unknown>> = [];

    for (const match of topMatches) {
      const violet = violetProducts.get(match.product_id);
      if (!violet) continue;

      products.push({
        id: match.product_id,
        name: violet.name,
        description: violet.description ?? "",
        minPrice: violet.min_price ?? 0,
        maxPrice: violet.max_price ?? 0,
        currency: violet.currency ?? "USD",
        available: violet.available ?? true,
        vendor: violet.vendor ?? "",
        source: violet.source ?? "",
        externalUrl: violet.external_url ?? "",
        thumbnailUrl: extractThumbnail(violet),
        similarity: match.similarity,
      });
    }

    // 6. Apply personalization boost if user profile available
    let personalized = false;

    if (profileResult?.error) {
      console.error(
        "[get-recommendations] User profile RPC failed, skipping personalization:",
        profileResult.error.message,
      );
    }

    const searchProfile = profileResult?.data as UserSearchProfile | null;
    if (authUserId && searchProfile && searchProfile.total_events > 0 && products.length > 0) {
      products = applyPersonalizationBoost(products, searchProfile, textContentMap);
      personalized = true;
    }

    return new Response(
      JSON.stringify({
        data: {
          products,
          personalized,
        },
        error: null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        data: null,
        error: {
          code: "RECOMMENDATIONS.INTERNAL_ERROR",
          /**
           * M7 review fix: Sanitize error messages in 500 responses.
           * The real error is logged server-side; clients get a generic message
           * to avoid leaking infrastructure details (hostnames, SQL errors, etc.).
           */
          message: "An internal error occurred while fetching recommendations",
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
