/**
 * Edge Function: get-product
 *
 * Fetches a single product by its Violet offer ID and returns the full
 * product data transformed to match our internal `Product` type (camelCase).
 *
 * Used by the mobile PDP (`[productId].tsx`) to render product detail.
 *
 * ## Route
 * GET /get-product?id={offerId}
 *
 * ## Authentication
 * No JWT required (verify_jwt = false) — product data is public.
 * Violet API auth is handled server-side via VioletTokenManager.
 *
 * ## Response shape
 * Returns a subset of the `Product` type with all fields needed by
 * `MobileProductDetail` component: images, name, seller, prices,
 * description, availability, variants, SKUs.
 *
 * ## Image handling
 * Images are extracted from Violet's `albums[]` and `skus[].albums[]`.
 * Albums are sorted by display_order, deduplicated by URL.
 * Thumbnail = first primary image, or first image overall.
 *
 * @see apps/mobile/src/app/products/[productId].tsx — consumer
 * @see apps/mobile/src/components/product/ProductDetail.tsx — MobileProductDetail
 * @see packages/shared/src/adapters/violetAdapter.ts — transformOffer() (web equivalent)
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getVioletHeaders } from "../_shared/violetAuth.ts";

const VIOLET_API_BASE = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VioletMedia {
  id: number;
  url: string;
  source_url?: string;
  type: string;
  display_order?: number;
  primary?: boolean;
}

interface VioletAlbum {
  id: number;
  type: string;
  name?: string;
  media?: VioletMedia[];
  primary_media?: VioletMedia;
}

interface VioletVariantValue {
  variant?: string;
  name?: string;
  value: string;
}

interface VioletSku {
  id: number;
  offer_id?: number;
  merchant_id?: number;
  name?: string;
  in_stock?: boolean;
  qty_available?: number;
  sale_price?: number;
  retail_price?: number;
  currency?: string;
  taxable?: boolean;
  type?: string;
  status?: string;
  variant_values?: VioletVariantValue[];
  albums?: VioletAlbum[];
}

interface VioletOffer {
  id: number;
  name: string;
  description?: string;
  html_description?: string;
  min_price?: number;
  max_price?: number;
  currency?: string;
  available?: boolean;
  visible?: boolean;
  status?: string;
  publishing_status?: string;
  source?: string;
  seller?: string;
  vendor?: string;
  type?: string;
  external_url?: string;
  merchant_id?: number;
  product_id?: string;
  commission_rate?: number;
  tags?: string[];
  date_created?: string;
  date_last_modified?: string;
  albums?: VioletAlbum[];
  skus?: VioletSku[];
  shipping?: unknown;
}

// ─── Transformed types (match our internal Product shape) ────────────────────

interface ProductImage {
  id: string;
  url: string;
  displayOrder: number;
  primary: boolean;
}

interface ProductAlbum {
  id: string;
  type: string;
  name: string;
  media: Array<{
    id: string;
    url: string;
    displayOrder: number;
    primary: boolean;
  }>;
}

interface VariantValue {
  variant: string;
  value: string;
}

interface ProductVariant {
  name: string;
  values: string[];
}

interface SkuResult {
  id: string;
  offerId: string;
  merchantId: string;
  name: string;
  inStock: boolean;
  qtyAvailable: number;
  salePrice: number;
  retailPrice: number;
  currency: string;
  taxable: boolean;
  type: string;
  status: string;
  variantValues: VariantValue[];
}

interface ProductResult {
  id: string;
  name: string;
  description: string;
  htmlDescription: string | null;
  minPrice: number;
  maxPrice: number;
  currency: string;
  available: boolean;
  visible: boolean;
  status: string;
  publishingStatus: string;
  source: string;
  seller: string;
  vendor: string;
  type: string;
  externalUrl: string;
  merchantId: string;
  productId: string;
  commissionRate: number;
  tags: string[];
  dateCreated: string;
  dateLastModified: string;
  variants: ProductVariant[];
  skus: SkuResult[];
  albums: ProductAlbum[];
  images: ProductImage[];
  thumbnailUrl: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function transformAlbum(raw: VioletAlbum): ProductAlbum {
  return {
    id: String(raw.id),
    type: raw.type ?? "OFFER",
    name: raw.name ?? "",
    media: (raw.media ?? []).map((m) => ({
      id: String(m.id),
      url: m.url,
      displayOrder: m.display_order ?? 0,
      primary: m.primary ?? false,
    })),
  };
}

/**
 * Extracts unique images from all albums, sorted by displayOrder.
 * Deduplicates by URL to avoid showing the same image twice when
 * it appears in both offer-level and SKU-level albums.
 */
function extractImages(albums: ProductAlbum[]): ProductImage[] {
  const seen = new Set<string>();
  return albums
    .flatMap((album) => album.media)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .reduce<ProductImage[]>((acc, m) => {
      if (!seen.has(m.url)) {
        seen.add(m.url);
        acc.push({ id: m.id, url: m.url, displayOrder: m.displayOrder, primary: m.primary });
      }
      return acc;
    }, []);
}

/**
 * Returns the best thumbnail URL: first primary image, or first image overall.
 * Returns null when no images exist.
 */
function extractThumbnail(albums: ProductAlbum[]): string | null {
  for (const album of albums) {
    const primary = album.media.find((m) => m.primary);
    if (primary?.url) return primary.url;
  }
  const images = extractImages(albums);
  return images[0]?.url ?? null;
}

/**
 * Full offer transformation — mirrors VioletAdapter.transformOffer() on web.
 */
function transformOffer(raw: VioletOffer): ProductResult {
  const albums = (raw.albums ?? []).map(transformAlbum);
  const skuAlbums = (raw.skus ?? []).flatMap((s) => (s.albums ?? []).map(transformAlbum));
  const allAlbums = [...albums, ...skuAlbums];
  const images = extractImages(allAlbums);

  return {
    id: String(raw.id),
    name: raw.name ?? "",
    description: raw.description ?? "",
    htmlDescription: raw.html_description ?? null,
    minPrice: raw.min_price ?? 0,
    maxPrice: raw.max_price ?? 0,
    currency: raw.currency ?? "USD",
    available: raw.available ?? false,
    visible: raw.visible ?? true,
    status: raw.status ?? "AVAILABLE",
    publishingStatus: raw.publishing_status ?? "NOT_PUBLISHED",
    source: raw.source ?? "",
    seller: raw.seller ?? "",
    vendor: raw.vendor ?? "",
    type: raw.type ?? "PHYSICAL",
    externalUrl: raw.external_url ?? "",
    merchantId: String(raw.merchant_id ?? ""),
    productId: raw.product_id ?? "",
    commissionRate: raw.commission_rate ?? 0,
    tags: raw.tags ?? [],
    dateCreated: raw.date_created ?? "",
    dateLastModified: raw.date_last_modified ?? "",
    variants: [], // Violet Demo doesn't return structured variants
    skus: (raw.skus ?? []).map((s) => ({
      id: String(s.id),
      offerId: String(s.offer_id ?? raw.id),
      merchantId: String(s.merchant_id ?? raw.merchant_id ?? ""),
      name: s.name ?? "",
      inStock: s.in_stock ?? false,
      qtyAvailable: s.qty_available ?? 0,
      salePrice: s.sale_price ?? 0,
      retailPrice: s.retail_price ?? 0,
      currency: s.currency ?? "USD",
      taxable: s.taxable ?? false,
      type: s.type ?? "PHYSICAL",
      status: s.status ?? "AVAILABLE",
      variantValues: (s.variant_values ?? []).map((vv) => ({
        variant: vv.variant ?? vv.name ?? "",
        value: vv.value,
      })),
    })),
    albums,
    images,
    thumbnailUrl: extractThumbnail(allAlbums),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const offerId = url.searchParams.get("id");

    if (!offerId) {
      return jsonResponse(
        { data: null, error: { code: "MISSING_ID", message: "Query param 'id' is required" } },
        400,
      );
    }

    const authResult = await getVioletHeaders();
    if (authResult.error) {
      return jsonResponse({ data: null, error: authResult.error }, 503);
    }

    const violetHeaders = authResult.data as Record<string, string>;

    /**
     * Fetches a single offer from Violet's catalog API.
     * Returns the full offer with albums (images), SKUs, and variants.
     *
     * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
     */
    const res = await fetch(`${VIOLET_API_BASE}/catalog/offers/${offerId}`, {
      headers: violetHeaders,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return jsonResponse(
        {
          data: null,
          error: {
            code: "VIOLET.NOT_FOUND",
            message: `Offer ${offerId} not found (${res.status}): ${text}`,
          },
        },
        res.status === 404 ? 404 : 502,
      );
    }

    const rawOffer = await res.json();
    const product = transformOffer(rawOffer as VioletOffer);

    return jsonResponse({ data: product, error: null });
  } catch (err) {
    return jsonResponse(
      {
        data: null,
        error: {
          code: "GET_PRODUCT.FAILED",
          message: err instanceof Error ? err.message : "Unknown error",
        },
      },
      500,
    );
  }
});
