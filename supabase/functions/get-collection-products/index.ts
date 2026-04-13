/**
 * Edge Function: get-collection-products
 *
 * Fetches paginated products for a specific Violet collection.
 * Used by the mobile app (Violet API credentials cannot be in the JS bundle).
 *
 * ## Request
 * GET /functions/v1/get-collection-products?collection_id={id}&page={n}&pageSize={n}
 *
 * ## Response
 * ApiResponse<PaginatedResult<Product>> — same shape as get-products.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getVioletHeaders } from "../_shared/violetAuth.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const collectionId = url.searchParams.get("collection_id");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? "12")));

  if (!collectionId) {
    return new Response(
      JSON.stringify({ data: null, error: { code: "MISSING_PARAM", message: "collection_id is required" } }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const headersResult = await getVioletHeaders();
  if (headersResult.error) {
    return new Response(
      JSON.stringify({ data: null, error: { code: "AUTH_ERROR", message: headersResult.error.message } }),
      { status: 401, headers: jsonHeaders },
    );
  }

  const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";
  // Violet collection offers pagination is 1-based (default: page=1)
  // exclude_hidden=true filters out hidden offers from the response
  // @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers
  const apiUrl = `${apiBase}/catalog/collections/${collectionId}/offers?page=${page}&size=${pageSize}&exclude_hidden=true`;

  try {
    const res = await fetch(apiUrl, {
      headers: { ...headersResult.data, Accept: "application/json" },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ data: null, error: { code: "VIOLET_API_ERROR", message: `Violet returned ${res.status}: ${text}` } }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const raw = (await res.json()) as {
      content: unknown[];
      total_elements: number;
      total_pages: number;
      number: number;
      size: number;
      last: boolean;
    };

    // Transform Violet Offer → Product shape (minimal, mirrors violetAdapter.ts)
    const products = (raw.content ?? []).map((offer: unknown) => {
      const o = offer as Record<string, unknown>;
      const skus = Array.isArray(o.skus) ? (o.skus as Array<Record<string, unknown>>) : [];
      const albums = Array.isArray(o.albums) ? (o.albums as Array<Record<string, unknown>>) : [];

      // Extract thumbnail from first album primary media
      // Apply Shopify CDN resize (?width=300&height=400) for listing performance.
      // @see https://docs.violet.io/prism/catalog/media-transformations
      let thumbnailUrl: string | null = null;
      for (const album of albums) {
        const pm = album.primary_media as Record<string, unknown> | undefined;
        if (pm?.url) { thumbnailUrl = resizeShopifyImage(String(pm.url), 300, 400); break; }
        const media = Array.isArray(album.media) ? (album.media as Array<Record<string, unknown>>) : [];
        const primary = media.find((m) => m.primary);
        if (primary?.url) { thumbnailUrl = resizeShopifyImage(String(primary.url), 300, 400); break; }
        if (media[0]?.url) { thumbnailUrl = resizeShopifyImage(String(media[0].url), 300, 400); break; }
      }

      const minPrice = Number(o.min_price ?? 0);
      const maxPrice = Number(o.max_price ?? 0);

      return {
        id: String(o.id ?? ""),
        name: String(o.name ?? ""),
        description: String(o.description ?? ""),
        htmlDescription: null,
        minPrice,
        maxPrice,
        currency: String(o.currency ?? "USD"),
        available: Boolean(o.available ?? true),
        visible: Boolean(o.visible ?? true),
        status: String(o.status ?? "AVAILABLE"),
        publishingStatus: String(o.publishing_status ?? "PUBLISHED"),
        source: String(o.source ?? ""),
        seller: String(o.seller ?? ""),
        vendor: String(o.vendor ?? ""),
        type: String(o.type ?? "PHYSICAL"),
        externalUrl: String(o.external_url ?? ""),
        merchantId: String(o.merchant_id ?? ""),
        productId: String(o.product_id ?? ""),
        commissionRate: Number(o.commission_rate ?? 0),
        tags: Array.isArray(o.tags) ? (o.tags as string[]) : [],
        dateCreated: String(o.date_created ?? ""),
        dateLastModified: String(o.date_last_modified ?? ""),
        variants: [],
        skus: skus.map((s) => ({
          id: String(s.id ?? ""),
          offerId: String(o.id ?? ""),
          merchantId: String(o.merchant_id ?? ""),
          name: String(s.name ?? ""),
          inStock: Boolean(s.in_stock ?? true),
          qtyAvailable: Number(s.qty_available ?? 0),
          salePrice: Number(s.sale_price ?? minPrice),
          retailPrice: Number(s.retail_price ?? maxPrice),
          currency: String(s.currency ?? "USD"),
          taxable: Boolean(s.taxable ?? true),
          type: String(s.type ?? "PHYSICAL"),
          status: String(s.status ?? "AVAILABLE"),
          variantValues: Array.isArray(s.variant_values) ? s.variant_values : [],
          dimensions: null,
          albums: [],
          dateCreated: String(s.date_created ?? ""),
          dateLastModified: String(s.date_last_modified ?? ""),
        })),
        albums: albums.map((a) => ({
          id: String(a.id ?? ""),
          type: String(a.type ?? "OFFER"),
          name: String(a.name ?? ""),
          media: Array.isArray(a.media) ? (a.media as Array<Record<string, unknown>>).map((m) => ({
            id: String(m.id ?? ""),
            url: String(m.url ?? ""),
            sourceUrl: String(m.source_url ?? m.url ?? ""),
            type: "IMAGE" as const,
            displayOrder: Number(m.display_order ?? 0),
            primary: Boolean(m.primary ?? false),
          })) : [],
          primaryMedia: (() => {
            const pm = a.primary_media as Record<string, unknown> | undefined;
            if (!pm) return null;
            return {
              id: String(pm.id ?? ""),
              url: String(pm.url ?? ""),
              sourceUrl: String(pm.source_url ?? pm.url ?? ""),
              type: "IMAGE" as const,
              displayOrder: Number(pm.display_order ?? 0),
              primary: true,
            };
          })(),
        })),
        images: thumbnailUrl ? [{ id: "0", url: thumbnailUrl, displayOrder: 1, primary: true }] : [],
        thumbnailUrl,
        shippingInfo: null,
      };
    });

    return new Response(
      JSON.stringify({
        data: {
          data: products,
          total: raw.total_elements ?? products.length,
          page: raw.number ?? page, // Violet 1-based matches our convention
          pageSize: raw.size ?? pageSize,
          hasNext: !raw.last,
        },
        error: null,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ data: null, error: { code: "UNEXPECTED", message: err instanceof Error ? err.message : "Unknown error" } }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

/**
 * Applies Shopify CDN resize parameters to an image URL.
 *
 * For Shopify-sourced images (cdn.shopify.com), appends ?width=W&height=H.
 * Non-Shopify URLs are returned unchanged.
 *
 * @see https://docs.violet.io/prism/catalog/media-transformations
 */
function resizeShopifyImage(url: string, width: number, height: number): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("shopify")) {
      parsed.searchParams.set("width", String(width));
      parsed.searchParams.set("height", String(height));
      return parsed.toString();
    }
  } catch {
    // Invalid URL — return as-is
  }
  return url;
}
