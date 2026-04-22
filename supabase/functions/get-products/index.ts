/**
 * Edge Function: get-products
 *
 * Proxies Violet's product catalog to mobile clients.
 * Mirrors the logic in apps/web/src/server/getProducts.ts (getProductsFn)
 * and packages/shared/src/adapters/violetAdapter.ts (getProducts).
 *
 * Query params:
 *   page        - 1-based page number (default: 1)
 *   pageSize    - items per page (default: 12)
 *   category    - category filter string (e.g. "Clothing", "Home")
 *   minPrice    - minimum price in cents
 *   maxPrice    - maximum price in cents
 *   inStock     - "true" to filter available only
 *   sortBy      - "price" | "relevance"
 *   sortDirection - "ASC" | "DESC"
 */

import { corsHeaders } from "../_shared/cors.ts";
import { violetFetch } from "../_shared/fetchWithRetry.ts";

const VIOLET_API_BASE = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VioletAlbumMedia {
  url: string;
  display_order?: number;
  primary?: boolean;
}

interface VioletAlbum {
  primary_media?: { url: string };
  media?: VioletAlbumMedia[];
}

interface VioletSku {
  albums?: VioletAlbum[];
}

interface VioletOffer {
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
  merchant_id?: number;
  source_category_name?: string;
  tags?: string[];
  albums?: VioletAlbum[];
  skus?: VioletSku[];
  shipping?: unknown;
}

interface ProductResult {
  id: string;
  name: string;
  description: string;
  minPrice: number;
  maxPrice: number;
  currency: string;
  available: boolean;
  vendor: string;
  source: string;
  thumbnailUrl: string | null;
  merchantId: string;
  tags: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractThumbnail(offer: VioletOffer): string | null {
  const allAlbums = [...(offer.albums ?? []), ...(offer.skus ?? []).flatMap((s) => s.albums ?? [])];
  for (const album of allAlbums) {
    if (album.primary_media?.url) return album.primary_media.url;
    const primary = album.media?.find((m) => m.primary);
    if (primary?.url) return primary.url;
    const sorted = [...(album.media ?? [])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
    );
    if (sorted[0]?.url) return sorted[0].url;
  }
  return null;
}

function transformOffer(offer: VioletOffer): ProductResult {
  return {
    id: String(offer.id),
    name: offer.name,
    description: offer.description ?? "",
    minPrice: offer.min_price ?? 0,
    maxPrice: offer.max_price ?? 0,
    currency: offer.currency ?? "USD",
    available: offer.available ?? false,
    vendor: offer.vendor ?? "",
    source: offer.source ?? "",
    thumbnailUrl: extractThumbnail(offer),
    merchantId: String(offer.merchant_id ?? ""),
    tags: offer.tags ?? [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Violet API calls ────────────────────────────────────────────────────────

async function searchOffers(
  page: number,
  size: number,
  params: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    sortBy?: string;
    sortDirection?: string;
    baseCurrency?: string;
  },
): Promise<{
  content: VioletOffer[];
  total_elements: number;
  last: boolean;
  number: number;
  size: number;
} | null> {
  const qs = new URLSearchParams({
    page: String(page),
    size: String(size),
    include: "shipping,metadata,sku_metadata",
  });

  // Contextual pricing: pass base_currency for presentment prices
  // @see https://docs.violet.io/prism/catalog/contextual-pricing
  const baseCurrency = params.baseCurrency;
  if (baseCurrency && baseCurrency !== "USD") {
    qs.set("base_currency", baseCurrency);
  }

  const body: Record<string, unknown> = {};
  if (params.category) body.category = params.category;
  if (params.minPrice !== undefined) body.min_price = params.minPrice;
  if (params.maxPrice !== undefined) body.max_price = params.maxPrice;
  if (params.inStock === true) body.available = true;
  if (params.sortBy === "price") {
    body.sort_by = "minPrice";
    body.sort_direction = params.sortDirection ?? "ASC";
  }

  const res = await violetFetch(`${VIOLET_API_BASE}/catalog/offers/search?${qs}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  return res.json();
}

/** Demo mode fallback: fetch from each merchant directly */
async function getProductsFromMerchants(
  page: number,
  size: number,
  params: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    sortBy?: string;
    sortDirection?: string;
    baseCurrency?: string;
  },
): Promise<{ data: ProductResult[]; total: number; hasNext: boolean }> {
  // Get merchants
  const merchantsRes = await violetFetch(`${VIOLET_API_BASE}/merchants?page=1&size=50`);
  if (!merchantsRes.ok) return { data: [], total: 0, hasNext: false };
  const merchantsData = await merchantsRes.json();
  const merchantIds: number[] = (merchantsData.content ?? []).map((m: { id: number }) => m.id);

  if (merchantIds.length === 0) return { data: [], total: 0, hasNext: false };

  // Contextual pricing for merchant offers fallback
  const currencyQs = params.baseCurrency && params.baseCurrency !== "USD" ? `&base_currency=${params.baseCurrency}` : "";

  // Fetch all offers in parallel
  const offerArrays = await Promise.all(
    merchantIds.map(async (id) => {
      const res = await violetFetch(
        `${VIOLET_API_BASE}/catalog/offers/merchants/${id}?page=1&size=100&include=shipping,metadata,sku_metadata,collections${currencyQs}`,
      );
      if (!res.ok) return [];
      const d = await res.json();
      return (d.content ?? []) as VioletOffer[];
    }),
  );

  let offers = offerArrays.flat();

  // Filter
  if (params.category) {
    const cat = params.category.toLowerCase();
    offers = offers.filter((o) => (o.source_category_name ?? "").toLowerCase().includes(cat));
  }
  if (params.inStock) offers = offers.filter((o) => o.available);
  if (params.minPrice !== undefined)
    offers = offers.filter((o) => (o.min_price ?? 0) >= params.minPrice!);
  if (params.maxPrice !== undefined)
    offers = offers.filter((o) => (o.min_price ?? 0) <= params.maxPrice!);

  // Transform and filter no-thumbnail
  let products = offers.map(transformOffer).filter((p) => p.thumbnailUrl !== null);

  // Sort
  if (params.sortBy === "price") {
    const dir = params.sortDirection === "DESC" ? -1 : 1;
    products.sort((a, b) => dir * (a.minPrice - b.minPrice));
  }

  // Paginate
  const total = products.length;
  const start = (page - 1) * size;
  return {
    data: products.slice(start, start + size),
    total,
    hasNext: start + size < total,
  };
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const p = url.searchParams;

    const page = Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(p.get("pageSize") ?? "12", 10) || 12));
    const category = p.get("category") ?? undefined;
    const minPrice = p.has("minPrice") ? Number(p.get("minPrice")) : undefined;
    const maxPrice = p.has("maxPrice") ? Number(p.get("maxPrice")) : undefined;
    const inStock = p.get("inStock") === "true" ? true : undefined;
    const sortBy = p.get("sortBy") ?? undefined;
    const sortDirection = p.get("sortDirection") ?? undefined;
    const baseCurrency = p.get("baseCurrency") ?? undefined;

    const violetPage = page - 1; // 1-based → 0-based

    const searchResult = await searchOffers(violetPage, pageSize, {
      category,
      minPrice,
      maxPrice,
      inStock,
      sortBy,
      sortDirection,
      baseCurrency,
    });

    // Demo mode fallback
    if (!searchResult || searchResult.content.length === 0) {
      const fallback = await getProductsFromMerchants(page, pageSize, {
        category,
        minPrice,
        maxPrice,
        inStock,
        sortBy,
        sortDirection,
        baseCurrency,
      });
      return jsonResponse({
        data: {
          data: fallback.data,
          total: fallback.total,
          page,
          pageSize,
          hasNext: fallback.hasNext,
        },
        error: null,
      });
    }

    const products = searchResult.content
      .map(transformOffer)
      .filter((p) => p.thumbnailUrl !== null);

    return jsonResponse({
      data: {
        data: products,
        total: searchResult.total_elements,
        page: searchResult.number + 1,
        pageSize: searchResult.size,
        hasNext: !searchResult.last,
      },
      error: null,
    });
  } catch (err) {
    return jsonResponse(
      {
        data: null,
        error: {
          code: "GET_PRODUCTS.FAILED",
          message: err instanceof Error ? err.message : "Unknown error",
        },
      },
      500,
    );
  }
});
