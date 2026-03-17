/**
 * Edge Function: search-products
 *
 * Accepts a natural language query, generates a vector embedding,
 * performs pgvector cosine similarity search, enriches results with
 * live Violet API data, and returns ranked results with explanations.
 *
 * ## Data flow
 * 1. Validate input with Zod (M1 fix)
 * 2. Extract authenticated user from JWT (Story 6.3 — personalization)
 * 3. Generate query embedding via OpenAI text-embedding-3-small
 * 4. pgvector cosine similarity search via match_products() RPC
 * 5. Fetch live product data from Violet API (parallel with user profile fetch)
 * 6. Apply post-search filters on enriched data
 * 7. Apply personalization boosting if user is authenticated (Story 6.3)
 * 8. Generate template-based match explanations (no LLM — 2s budget)
 * 9. Return { data, error } discriminated union response
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { generateEmbedding } from "../_shared/openai.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getVioletHeaders } from "../_shared/violetAuth.ts";
import { searchQuerySchema } from "../_shared/schemas.ts";

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

// ─── Personalization ─────────────────────────────────────────────

/**
 * Extracts a product category from the text_content field.
 *
 * text_content format (from generate-embeddings):
 *   "Name. Description. Brand: X. Category: Y. Tags: a, b, c"
 */
function extractCategory(textContent: string): string | null {
  const match = textContent.match(/Category:\s*([^.]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Applies personalization boosting to search results.
 *
 * Scoring formula: final = 0.7 × semantic + 0.2 × category + 0.1 × price
 *
 * - category_boost: 1.0 for #1 category, 0.7 #2, 0.5 #3, 0.3 #4-5, 0 otherwise
 * - price_proximity: 1.0 when product price equals user avg, 0 at 2× distance
 * - If no order history: price_proximity = 0.5 (neutral)
 */
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

    // Category boost
    const productCategory = extractCategory(textContent);
    const categoryBoost = productCategory
      ? (categoryBoostMap.get(productCategory.toLowerCase()) ?? 0)
      : 0;

    // Price proximity boost
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

// ─── Match explanation ───────────────────────────────────────────

/**
 * Generates a human-readable explanation of why a product matches the query.
 *
 * Uses template-based approach (NOT an LLM call) to stay within the 2s
 * response budget. Filters out short words (≤2 chars) to avoid matching
 * articles and prepositions.
 */
function generateExplanation(
  query: string,
  product: { name: string; textContent: string },
  similarity: number,
): string {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const contentLower = product.textContent.toLowerCase();
  const matchedTerms = queryTerms.filter((term) => contentLower.includes(term));

  const pct = `${(similarity * 100).toFixed(0)}% relevant`;
  if (matchedTerms.length > 0) {
    return `Matches your search for "${matchedTerms.join('", "')}" — ${pct}`;
  }
  return `Semantically similar to your search — ${pct}`;
}

// ─── Violet enrichment ──────────────────────────────────────────

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

/**
 * Fetches live product data from the Violet API for enrichment.
 *
 * Uses parallel fetching (Promise.all) to minimize latency within the
 * 2s response budget. Individual fetch failures are logged and skipped —
 * partial enrichment is acceptable since pgvector results still have
 * product_name and text_content as fallback display data.
 *
 * ## Error handling (M4 code review fix)
 *
 * Previously, individual fetch errors were silently swallowed with an empty
 * catch block. Now we log errors to console.error so they appear in
 * Supabase Edge Function logs for debugging. The auth error at line ~97
 * is also logged instead of silently returning an empty map.
 */
async function fetchVioletProducts(productIds: string[]): Promise<Map<string, VioletProduct>> {
  const result = new Map<string, VioletProduct>();
  if (productIds.length === 0) return result;

  const headersResult = await getVioletHeaders();
  if (headersResult.error) {
    console.error(
      "[search-products] Violet auth failed, skipping enrichment:",
      headersResult.error,
    );
    return result;
  }

  const violetApiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";

  // Fetch products in parallel for speed
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
          `[search-products] Violet fetch failed for product ${id}: HTTP ${res.status}`,
        );
      }
    } catch (err) {
      console.error(
        `[search-products] Violet fetch error for product ${id}:`,
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

    // M1 fix: Zod validation instead of manual typeof checks
    const validation = searchQuerySchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          data: null,
          error: {
            code: "SEARCH.INVALID_QUERY",
            message: validation.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { query, filters, limit } = validation.data;
    const matchCount = limit ?? 12;

    // ── Story 6.3: Extract authenticated user for personalization ──
    let authUserId: string | null = null;
    let personalizationEnabled = true;

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

          // Check opt-out preference
          const { data: profile } = await userClient
            .from("user_profiles")
            .select("preferences")
            .eq("user_id", user.id)
            .single();

          if (profile?.preferences?.personalized_search === false) {
            personalizationEnabled = false;
          }
        }
      } catch (err) {
        // Auth extraction failure is non-fatal — proceed without personalization
        console.error(
          "[search-products] Auth extraction failed, proceeding without personalization:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // 1. Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // 2. pgvector cosine similarity search
    const supabase = getSupabaseAdmin();
    const { data: matches, error: rpcError } = await supabase.rpc("match_products", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.3,
      match_count: matchCount,
    });

    if (rpcError) {
      return new Response(
        JSON.stringify({
          data: null,
          error: { code: "SEARCH.QUERY_FAILED", message: rpcError.message },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!matches || matches.length === 0) {
      return new Response(
        JSON.stringify({
          data: {
            query,
            products: [],
            total: 0,
            explanations: {},
            personalized: false,
          },
          error: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Fetch Violet data + user search profile in parallel (Story 6.3)
    const productIds = matches.map((m: PgvectorMatch) => m.product_id);

    const [violetProducts, profileResult] = await Promise.all([
      fetchVioletProducts(productIds),
      authUserId && personalizationEnabled
        ? supabase.rpc("get_user_search_profile", { p_user_id: authUserId })
        : Promise.resolve({ data: null, error: null }),
    ]);

    // Build text_content lookup for personalization
    const textContentMap = new Map<string, string>();
    for (const match of matches as PgvectorMatch[]) {
      textContentMap.set(match.product_id, match.text_content);
    }

    // 4. Build enriched results with post-search filtering
    const explanations: Record<string, string> = {};
    let products: Array<Record<string, unknown>> = [];

    for (const match of matches as PgvectorMatch[]) {
      const violet = violetProducts.get(match.product_id);

      // Apply post-search filters on enriched data
      if (filters) {
        /**
         * H3 fix: Category filter — search in text_content, NOT violet.source.
         *
         * violet.source is the merchant platform (e.g., "Shopify") — NOT the product
         * category. The product category is embedded in text_content during embedding
         * generation as "Category: Electronics. Tags: ..." (see generate-embeddings).
         *
         * We search text_content because:
         * 1. Violet's API doesn't expose a clean `category` field on offers
         * 2. text_content is always available (from pgvector), even if Violet enrichment fails
         * 3. The category was explicitly included in the embedding text for this purpose
         */
        if (filters.category) {
          const textLower = match.text_content.toLowerCase();
          if (!textLower.includes(filters.category.toLowerCase())) continue;
        }
        if (filters.minPrice !== undefined && violet) {
          if ((violet.min_price ?? 0) < filters.minPrice) continue;
        }
        if (filters.maxPrice !== undefined && violet) {
          if ((violet.min_price ?? 0) > filters.maxPrice) continue;
        }
        if (filters.inStock === true && violet) {
          if (!violet.available) continue;
        }
      }

      explanations[match.product_id] = generateExplanation(
        query,
        { name: match.product_name, textContent: match.text_content },
        match.similarity,
      );

      products.push({
        id: match.product_id,
        name: violet?.name ?? match.product_name,
        description: violet?.description ?? "",
        minPrice: violet?.min_price ?? 0,
        maxPrice: violet?.max_price ?? 0,
        currency: violet?.currency ?? "USD",
        available: violet?.available ?? false,
        vendor: violet?.vendor ?? "",
        source: violet?.source ?? "",
        externalUrl: violet?.external_url ?? "",
        thumbnailUrl: violet ? extractThumbnail(violet) : null,
        similarity: match.similarity,
      });
    }

    // 5. Apply personalization boosting (Story 6.3)
    let personalized = false;
    let personalizationHint: string | undefined;

    if (profileResult?.error) {
      console.error(
        "[search-products] User profile RPC failed, skipping personalization:",
        profileResult.error.message,
      );
    }
    const searchProfile = profileResult?.data as UserSearchProfile | null;
    if (
      authUserId &&
      personalizationEnabled &&
      searchProfile &&
      searchProfile.total_events > 0 &&
      products.length > 0
    ) {
      products = applyPersonalizationBoost(products, searchProfile, textContentMap);
      personalized = true;
      personalizationHint = "Results tailored to your preferences";
    }

    return new Response(
      JSON.stringify({
        data: {
          query,
          products,
          total: products.length,
          explanations,
          personalized,
          personalizationHint,
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
          code: "SEARCH.QUERY_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
