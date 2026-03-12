/**
 * Edge Function: search-products
 *
 * Accepts a natural language query, generates a vector embedding,
 * performs pgvector cosine similarity search, enriches results with
 * live Violet API data, and returns ranked results with explanations.
 *
 * ## Data flow
 * 1. Validate input with Zod (M1 fix)
 * 2. Generate query embedding via OpenAI text-embedding-3-small
 * 3. pgvector cosine similarity search via match_products() RPC
 * 4. Fetch live product data from Violet API (parallel fetching)
 * 5. Apply post-search filters on enriched data
 * 6. Generate template-based match explanations (no LLM — 2s budget)
 * 7. Return { data, error } discriminated union response
 */

import { corsHeaders } from "../_shared/cors.ts";
import { generateEmbedding } from "../_shared/openai.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getVioletHeaders } from "../_shared/violetAuth.ts";
import { searchQuerySchema } from "../_shared/schemas.ts";

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
          data: { query, products: [], total: 0, explanations: {} },
          error: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Fetch live product data from Violet API
    const productIds = matches.map((m: { product_id: string }) => m.product_id);
    const violetProducts = await fetchVioletProducts(productIds);

    // 4. Build enriched results with post-search filtering
    const explanations: Record<string, string> = {};
    const products: Array<Record<string, unknown>> = [];

    for (const match of matches as Array<{
      product_id: string;
      product_name: string;
      text_content: string;
      similarity: number;
    }>) {
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

    return new Response(
      JSON.stringify({
        data: { query, products, total: products.length, explanations },
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
