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
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getVioletHeaders } from "../_shared/violetAuth.ts";
import { recommendationRequestSchema } from "../_shared/schemas.ts";

// ─── Types ───────────────────────────────────────────────────────
// Keep in sync with packages/shared/src/types/personalization.types.ts

interface CategoryAffinity {
  category: string;
  view_count: number;
}

interface UserSearchProfile {
  top_categories: CategoryAffinity[];
  avg_order_price: number;
  recent_product_ids: string[];
  total_events: number;
}

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

// ─── Personalization (reused from search-products) ──────────────

function extractCategory(textContent: string): string | null {
  const match = textContent.match(/Category:\s*([^.]+)/i);
  return match ? match[1].trim() : null;
}

function applyPersonalizationBoost(
  products: Array<Record<string, unknown>>,
  profile: UserSearchProfile,
  textContentMap: Map<string, string>,
): Array<Record<string, unknown>> {
  const categoryBoostMap = new Map<string, number>();
  const boostValues = [1.0, 0.7, 0.5, 0.3, 0.3];
  profile.top_categories.forEach((cat, i) => {
    categoryBoostMap.set(cat.category.toLowerCase(), boostValues[i] ?? 0.3);
  });

  const boosted = products.map((product) => {
    const textContent = textContentMap.get(product.id as string) ?? "";
    const originalSimilarity = product.similarity as number;

    const productCategory = extractCategory(textContent);
    const categoryBoost = productCategory
      ? (categoryBoostMap.get(productCategory.toLowerCase()) ?? 0)
      : 0;

    let priceProximity = 0.5;
    if (profile.avg_order_price > 0) {
      const productPrice = product.minPrice as number;
      const priceDiff = Math.abs(productPrice - profile.avg_order_price);
      priceProximity = Math.max(0, 1 - Math.min(priceDiff / profile.avg_order_price, 1));
    }

    const finalScore = originalSimilarity * 0.7 + categoryBoost * 0.2 + priceProximity * 0.1;

    return {
      ...product,
      similarity: Math.round(finalScore * 10000) / 10000,
    };
  });

  return boosted.sort((a, b) => (b.similarity as number) - (a.similarity as number));
}

// ─── Violet enrichment ──────────────────────────────────────────

async function fetchVioletProducts(productIds: string[]): Promise<Map<string, VioletProduct>> {
  const result = new Map<string, VioletProduct>();
  if (productIds.length === 0) return result;

  const headersResult = await getVioletHeaders();
  if (headersResult.error) {
    console.error(
      "[get-recommendations] Violet auth failed, skipping enrichment:",
      headersResult.error,
    );
    return result;
  }

  const violetApiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";

  const fetches = productIds.map(async (id) => {
    try {
      const res = await fetch(`${violetApiBase}/catalog/offers/${id}`, {
        method: "GET",
        headers: headersResult.data,
      });
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
    const body = await req.json();

    const validation = recommendationRequestSchema.safeParse(body);
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

    const { product_id, user_id, limit } = validation.data;
    const matchCount = limit ?? 8;

    const supabase = getSupabaseAdmin();

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
      user_id
        ? supabase.rpc("get_user_search_profile", { p_user_id: user_id })
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
    if (user_id && searchProfile && searchProfile.total_events > 0 && products.length > 0) {
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
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
