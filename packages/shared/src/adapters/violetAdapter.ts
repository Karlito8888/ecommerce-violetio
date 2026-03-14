import type {
  ApiResponse,
  PaginatedResult,
  Product,
  ProductQuery,
  ProductAlbum,
  ProductImage,
  ProductVariant,
  SKU,
  Cart,
  Bag,
  BagError,
  CartItem,
  CartItemInput,
  CreateCartInput,
  PaymentIntent,
  Order,
  WebhookEvent,
  SearchResult,
  SearchFilters,
  VioletOfferResponse,
  VioletSkuResponse,
  VioletAlbumResponse,
} from "../types/index.js";
import type { SupplierAdapter } from "./supplierAdapter.js";
import { VioletTokenManager } from "../clients/violetAuth.js";
import { VIOLET_API_BASE } from "../utils/constants.js";
import {
  violetOfferSchema,
  violetPaginatedOffersSchema,
  violetCartResponseSchema,
} from "../schemas/index.js";
import type { VioletBagResponse, VioletCartSkuResponse } from "../schemas/index.js";

/**
 * Maximum number of retry attempts on transient errors (HTTP 429, network failures).
 * After MAX_RETRIES, the error is returned to the caller.
 */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff: 1s, 2s, 4s. */
const BASE_DELAY_MS = 1000;

/**
 * Timeout in ms for each individual fetch request.
 *
 * Prevents hung connections from tying up server resources indefinitely.
 * 30s is generous enough for Violet's cross-merchant API calls while
 * still protecting against network black holes.
 *
 * @see M1 fix — no timeout existed before, risking indefinite hangs
 */
const REQUEST_TIMEOUT_MS = 30_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Maps HTTP status codes to structured Violet error codes.
 *
 * Error code convention: `VIOLET.<ACTION_FAILURE>`
 * - 429 → RATE_LIMITED (per-merchant, proxied from Shopify/Amazon)
 * - 401/403 → AUTH_FAILED (token expired or invalid)
 * - 404 → NOT_FOUND (offer/SKU doesn't exist)
 * - Other → API_ERROR (catch-all)
 *
 * @see https://docs.violet.io/concepts/rate-limits
 */
function mapHttpError(status: number): string {
  switch (status) {
    case 429:
      return "VIOLET.RATE_LIMITED";
    case 401:
    case 403:
      return "VIOLET.AUTH_FAILED";
    case 404:
      return "VIOLET.NOT_FOUND";
    default:
      return "VIOLET.API_ERROR";
  }
}

/**
 * Violet.io implementation of the SupplierAdapter interface.
 *
 * ## Responsibilities
 * - Calls Violet REST API for catalog operations (offers/SKUs)
 * - Validates responses with Zod schemas before processing
 * - Transforms Violet's snake_case JSON to our internal camelCase types
 * - Handles rate limiting with exponential backoff (1s/2s/4s, max 3 retries)
 * - Maps all errors to structured `{ code, message }` responses
 *
 * ## Server-side only
 * This adapter is NEVER imported in browser/mobile code.
 * It runs in TanStack Server Functions (web) and Supabase Edge Functions.
 * The UI accesses products through TanStack Query hooks that call Server Functions.
 *
 * ## Violet terminology
 * - "Offer" = our "Product" (a merchant's listing)
 * - "SKU" = a purchasable variant within an Offer
 *
 * @see https://docs.violet.io/api-reference/catalog/offers
 */
export class VioletAdapter implements SupplierAdapter {
  private tokenManager: VioletTokenManager;
  private apiBase: string;

  constructor(tokenManager: VioletTokenManager, apiBase: string = VIOLET_API_BASE) {
    this.tokenManager = tokenManager;
    this.apiBase = apiBase;
  }

  // ─── Catalog ───────────────────────────────────────────────────────

  /**
   * Search Violet's catalog using POST /catalog/offers/search.
   *
   * ## Pagination handling
   *
   * Violet uses Spring Boot's `Pageable` which is 0-based internally.
   * Our public API uses 1-based pages (more intuitive for UI).
   * Conversion: outgoing `page - 1`, incoming `number + 1`.
   *
   * **Note:** The Violet docs state `page` defaults to 1, but Spring Boot
   * Pageable is typically 0-based. Our 0-based conversion has been verified
   * to work correctly against the sandbox API. If Violet changes this,
   * the Zod pagination schema will catch the inconsistency.
   *
   * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
   * @see https://docs.violet.io/concepts/pagination
   */
  async getProducts(params: ProductQuery): Promise<ApiResponse<PaginatedResult<Product>>> {
    const page = (params.page ?? 1) - 1; // Internal 1-based → Violet 0-based
    const size = params.pageSize ?? 20;

    const queryParams = new URLSearchParams({
      page: String(page),
      size: String(size),
    });

    /**
     * Build the OfferSearchRequest body for Violet's POST /catalog/offers/search.
     *
     * Field naming conventions (Violet API):
     * - **Filter fields** use snake_case: `min_price`, `max_price`, `available`
     * - **Sort field** `sort_by` expects a **camelCase** Offer property name
     *   (e.g., `"minPrice"` for price sorting) — NOT snake_case
     * - `sort_direction`: `"ASC"` or `"DESC"`
     *
     * Sort is only supported when `beta=false` (our default). If Violet ignores
     * sort params, the product listing page applies a client-side fallback sort.
     *
     * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
     */
    const body: Record<string, unknown> = {};
    if (params.query) body.query = params.query;
    /**
     * Category filtering — sends `category` to Violet's search endpoint.
     *
     * **KNOWN DIVERGENCE**: The Violet OpenAPI spec documents this field as
     * `source_category_name`, but the sandbox API accepts `category` and
     * returns correctly filtered results. This was established in Story 3.1
     * and verified against the sandbox.
     *
     * If category filtering stops working in production, rename this field
     * to `source_category_name` and re-test.
     *
     * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
     * @todo Verify field name against production API (not just sandbox)
     */
    if (params.category) body.category = params.category;
    if (params.merchantId) body.merchant_id = Number(params.merchantId);

    /* Price range filters — values are integer cents (e.g., 5000 = $50.00) */
    if (params.minPrice !== undefined) body.min_price = params.minPrice;
    if (params.maxPrice !== undefined) body.max_price = params.maxPrice;

    /* Availability filter — boolean, NOT the string enum "AVAILABLE" */
    if (params.inStock === true) body.available = true;

    /*
     * Sorting — sort_by uses camelCase Offer property names.
     * "price" in our UI maps to "minPrice" (lowest SKU price) in Violet.
     * "relevance" (or omitted) = no sort params → Violet's default order.
     */
    if (params.sortBy === "price") {
      body.sort_by = "minPrice";
      body.sort_direction = params.sortDirection ?? "ASC";
    }

    const result = await this.fetchWithRetry(
      `${this.apiBase}/catalog/offers/search?${queryParams}`,
      { method: "POST", body: JSON.stringify(body) },
    );

    if (result.error) return { data: null, error: result.error };

    const parsed = violetPaginatedOffersSchema.safeParse(result.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { code: "VIOLET.VALIDATION_ERROR", message: parsed.error.message },
      };
    }

    const violet = parsed.data;

    /**
     * Demo Mode fallback — Violet's POST /catalog/offers/search returns 0 results
     * for DEMO merchants because they are not indexed in the search engine.
     * When search returns empty, fetch offers via GET /catalog/offers/merchants/{id}
     * for each connected merchant and paginate client-side.
     */
    if (violet.content.length === 0 && violet.total_elements === 0) {
      return this.getProductsFromMerchants(params);
    }

    return {
      data: {
        data: violet.content.map((offer) => this.transformOffer(offer)),
        total: violet.total_elements,
        page: violet.number + 1, // Violet 0-based → internal 1-based
        pageSize: violet.size,
        hasNext: !violet.last,
      },
      error: null,
    };
  }

  /**
   * Fallback product fetching for Violet Demo Mode.
   *
   * Demo merchants' products are not in Violet's search index, so we:
   * 1. Fetch the list of connected merchants via GET /merchants
   * 2. Fetch all offers from each merchant via GET /catalog/offers/merchants/{id}
   * 3. Combine, filter, sort, and paginate the results client-side
   *
   * This is only called when the search endpoint returns 0 results.
   * In production (with real merchants), the search endpoint works and this is never hit.
   */
  private async getProductsFromMerchants(
    params: ProductQuery,
  ): Promise<ApiResponse<PaginatedResult<Product>>> {
    const page = params.page ?? 1;
    const size = params.pageSize ?? 20;

    // Step 1: Get connected merchants
    const merchantsResult = await this.fetchWithRetry(`${this.apiBase}/merchants?page=1&size=50`, {
      method: "GET",
    });
    if (merchantsResult.error) return { data: null, error: merchantsResult.error };

    const merchantsData = merchantsResult.data as {
      content: Array<{ id: number; connection_status?: string }>;
    };
    const merchantIds = merchantsData.content.map((m) => m.id);

    if (merchantIds.length === 0) {
      return { data: { data: [], total: 0, page, pageSize: size, hasNext: false }, error: null };
    }

    // Step 2: Fetch offers from all merchants in parallel
    const offerPromises = merchantIds.map(async (merchantId) => {
      const res = await this.fetchWithRetry(
        `${this.apiBase}/catalog/offers/merchants/${merchantId}?page=1&size=100`,
        { method: "GET" },
      );
      if (res.error || !res.data) return [];
      const data = res.data as { content?: unknown[] };
      return data.content ?? [];
    });

    const allOfferArrays = await Promise.all(offerPromises);
    const allRawOffers = allOfferArrays.flat();

    // Step 3: Filter raw offers before transformation (saves processing)
    let filteredRaw = allRawOffers;
    if (params.category) {
      const cat = params.category.toLowerCase();
      filteredRaw = filteredRaw.filter((raw) => {
        const r = raw as Record<string, unknown>;
        const sourceCat = (r.source_category_name as string) ?? "";
        return sourceCat.toLowerCase().includes(cat);
      });
    }

    // Step 4: Validate and transform each offer
    let products: Product[] = [];
    for (const raw of filteredRaw) {
      const parsed = violetOfferSchema.safeParse(raw);
      if (parsed.success) {
        products.push(this.transformOffer(parsed.data));
      }
    }

    // Step 5: Apply remaining filters on transformed data
    products = products.filter((p) => p.thumbnailUrl !== null);
    if (params.inStock) {
      products = products.filter((p) => p.available);
    }
    if (params.minPrice !== undefined) {
      products = products.filter((p) => p.minPrice >= params.minPrice!);
    }
    if (params.maxPrice !== undefined) {
      products = products.filter((p) => p.minPrice <= params.maxPrice!);
    }

    // Step 6: Sort
    if (params.sortBy === "price") {
      const dir = params.sortDirection === "DESC" ? -1 : 1;
      products.sort((a, b) => dir * (a.minPrice - b.minPrice));
    }

    // Step 7: Paginate
    const total = products.length;
    const startIndex = (page - 1) * size;
    const pageData = products.slice(startIndex, startIndex + size);

    return {
      data: {
        data: pageData,
        total,
        page,
        pageSize: size,
        hasNext: startIndex + size < total,
      },
      error: null,
    };
  }

  /**
   * Fetch a single offer by ID via GET /catalog/offers/{offer_id}.
   *
   * @param id - Violet offer ID (numeric, passed as string for our internal convention)
   */
  async getProduct(id: string): Promise<ApiResponse<Product>> {
    const result = await this.fetchWithRetry(`${this.apiBase}/catalog/offers/${id}`, {
      method: "GET",
    });

    if (result.error) return { data: null, error: result.error };

    const parsed = violetOfferSchema.safeParse(result.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { code: "VIOLET.VALIDATION_ERROR", message: parsed.error.message },
      };
    }

    return { data: this.transformOffer(parsed.data), error: null };
  }

  // ─── Transformation (snake_case → camelCase) ──────────────────────

  /**
   * Transforms a Zod-validated Violet Offer into our internal Product type.
   *
   * This is the **sole boundary** where snake_case → camelCase conversion happens.
   * UI code must NEVER see Violet field names like `min_price` or `merchant_id`.
   *
   * After Zod validation with `.optional().default(...)`, all fields are guaranteed
   * present with sensible defaults, so no additional null checks are needed here.
   */
  private transformOffer(raw: VioletOfferResponse): Product {
    const albums = (raw.albums ?? []).map((a) => this.transformAlbum(a));
    const skuAlbums = (raw.skus ?? []).flatMap((s) =>
      (s.albums ?? []).map((a) => this.transformAlbum(a)),
    );
    const allAlbums = [...albums, ...skuAlbums];
    const images = this.extractImages(allAlbums);

    return {
      id: String(raw.id),
      name: raw.name,
      description: raw.description ?? "",
      htmlDescription: raw.html_description ?? null,
      minPrice: raw.min_price ?? 0,
      maxPrice: raw.max_price ?? 0,
      currency: raw.currency ?? "USD",
      available: raw.available ?? false,
      visible: raw.visible ?? true,
      status: (raw.status ?? "AVAILABLE") as Product["status"],
      publishingStatus: (raw.publishing_status ?? "NOT_PUBLISHED") as Product["publishingStatus"],
      source: raw.source ?? "",
      seller: raw.seller ?? "",
      vendor: raw.vendor ?? "",
      type: (raw.type ?? "PHYSICAL") as Product["type"],
      externalUrl: raw.external_url ?? "",
      merchantId: String(raw.merchant_id),
      productId: raw.product_id ?? "",
      commissionRate: raw.commission_rate ?? 0,
      tags: raw.tags ?? [],
      dateCreated: raw.date_created ?? "",
      dateLastModified: raw.date_last_modified ?? "",
      variants: (raw.variants ?? []).map(
        (v): ProductVariant => ({ name: v.name, values: v.values ?? [] }),
      ),
      skus: (raw.skus ?? []).map((s) => this.transformSku(s)),
      albums,
      images,
      thumbnailUrl: this.extractThumbnail(allAlbums),
    };
  }

  /**
   * Transforms a Violet SKU to our internal SKU type.
   *
   * ## Variant value field name normalization (C3 fix)
   *
   * Violet's docs show `{ name, value }` but some API versions return
   * `{ variant, value }`. We normalize to `{ variant, value }`,
   * falling back to `name` if `variant` is absent.
   */
  private transformSku(raw: VioletSkuResponse): SKU {
    return {
      id: String(raw.id),
      offerId: String(raw.offer_id),
      merchantId: String(raw.merchant_id),
      name: raw.name ?? "",
      inStock: raw.in_stock ?? false,
      qtyAvailable: raw.qty_available ?? 0,
      salePrice: raw.sale_price ?? 0,
      retailPrice: raw.retail_price ?? 0,
      currency: raw.currency ?? "USD",
      taxable: raw.taxable ?? false,
      type: (raw.type ?? "PHYSICAL") as SKU["type"],
      status: raw.status ?? "AVAILABLE",
      variantValues: (raw.variant_values ?? []).map((vv) => ({
        variant: vv.variant ?? vv.name ?? "",
        value: vv.value,
      })),
      dimensions: raw.sku_dimensions
        ? { weight: raw.sku_dimensions.weight, type: raw.sku_dimensions.type }
        : null,
      albums: (raw.albums ?? []).map((a) => this.transformAlbum(a)),
      dateCreated: raw.date_created ?? "",
      dateLastModified: raw.date_last_modified ?? "",
    };
  }

  private transformAlbum(raw: VioletAlbumResponse): ProductAlbum {
    return {
      id: String(raw.id),
      type: raw.type,
      name: raw.name ?? "",
      media: (raw.media ?? []).map((m) => ({
        id: String(m.id),
        url: m.url,
        sourceUrl: m.source_url ?? "",
        type: m.type,
        displayOrder: m.display_order ?? 0,
        primary: m.primary ?? false,
      })),
      primaryMedia: raw.primary_media
        ? {
            id: String(raw.primary_media.id),
            url: raw.primary_media.url,
            sourceUrl: raw.primary_media.source_url ?? "",
            type: raw.primary_media.type,
            displayOrder: raw.primary_media.display_order ?? 0,
            primary: raw.primary_media.primary ?? false,
          }
        : null,
    };
  }

  private extractImages(albums: ProductAlbum[]): ProductImage[] {
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
   * Extracts the best thumbnail URL from albums.
   *
   * Returns `null` (not empty string) when no images exist, so the UI can
   * distinguish "no image" from a valid URL and show a placeholder.
   *
   * @see M3 fix — previously returned "" which could cause `<img src="">` issues
   */
  private extractThumbnail(albums: ProductAlbum[]): string | null {
    for (const album of albums) {
      if (album.primaryMedia) return album.primaryMedia.url;
    }
    const images = this.extractImages(albums);
    return images[0]?.url ?? null;
  }

  // ─── HTTP with retry ──────────────────────────────────────────────

  /**
   * Performs an HTTP request to the Violet API with:
   * - Auth headers from VioletTokenManager
   * - Request timeout (30s) via AbortController
   * - Exponential backoff retry on HTTP 429 and network errors
   * - Structured error mapping for all failure modes
   *
   * ## Retry strategy
   *
   * Retries on:
   * - HTTP 429 (rate limited) — per-merchant, proxied from Shopify/Amazon
   * - Network errors (fetch rejection) — transient connectivity issues
   *
   * Does NOT retry on:
   * - HTTP 4xx (except 429) — client errors won't self-resolve
   * - HTTP 5xx — server errors require Violet-side fixes
   * - JSON parse errors on successful responses — retrying won't change the body
   *
   * Delays: 1s → 2s → 4s (exponential backoff with base 1000ms)
   *
   * @see https://docs.violet.io/concepts/rate-limits
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<
    { data: unknown; error: null } | { data: null; error: { code: string; message: string } }
  > {
    const headersResult = await this.tokenManager.getAuthHeaders();
    if (headersResult.error) return { data: null, error: headersResult.error };

    /**
     * Only set Content-Type for requests with a body (POST, PUT, PATCH).
     * GET requests should not include Content-Type as they have no body,
     * and some proxies/CDNs may reject or mishandle it.
     *
     * @see M2 fix — previously sent Content-Type on all requests including GET
     */
    const headers: Record<string, string> = {
      ...headersResult.data,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        /**
         * AbortController provides a per-request timeout to prevent indefinite hangs.
         * Each retry attempt gets a fresh timeout.
         *
         * @see M1 fix — no timeout existed before, risking resource exhaustion
         */
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let res: Response;
        try {
          res = await fetch(url, { ...init, headers, signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }

        if (res.ok) {
          /**
           * Parse JSON separately from the fetch try/catch.
           * If the response was received successfully (2xx) but the body
           * is not valid JSON, we should NOT retry — the server won't
           * send different content for the same request.
           *
           * @see L1 fix — previously JSON parse errors triggered retries
           */
          try {
            const data: unknown = await res.json();
            return { data, error: null };
          } catch {
            return {
              data: null,
              error: {
                code: "VIOLET.API_ERROR",
                message: `Violet returned status ${res.status} but response body is not valid JSON`,
              },
            };
          }
        }

        // HTTP 429: rate limited — retry with backoff if attempts remain
        if (res.status === 429 && attempt < MAX_RETRIES) {
          await delay(BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }

        // Non-retryable HTTP error (or 429 with no retries left)
        const errorBody = await res.text().catch(() => "");
        return {
          data: null,
          error: {
            code: mapHttpError(res.status),
            message: `Violet API error (${res.status}): ${errorBody}`.slice(0, 500),
          },
        };
      } catch (err) {
        // Network error or timeout — retry with backoff if attempts remain
        if (attempt < MAX_RETRIES) {
          await delay(BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        return {
          data: null,
          error: {
            code: "VIOLET.NETWORK_ERROR",
            message: err instanceof Error ? err.message : "Unknown network error",
          },
        };
      }
    }

    // Exhausted all retries on 429
    return {
      data: null,
      error: { code: "VIOLET.RATE_LIMITED", message: "Max retries exceeded" },
    };
  }

  // ─── Not implemented (future stories) ─────────────────────────────

  /**
   * Search products via AI semantic search.
   *
   * ## M2 code review fix — Why this returns empty results (intentional no-op)
   *
   * The actual AI search pipeline is:
   *   useSearch() hook → supabase.functions.invoke("search-products") → Edge Function
   *
   * This adapter method exists to satisfy the SupplierAdapter interface, but the
   * VioletAdapter cannot perform semantic search because:
   *
   * 1. **Violet's API has no semantic search** — their /catalog/offers/search is
   *    keyword-based. Our AI search uses pgvector embeddings in Supabase, which
   *    is orthogonal to Violet's catalog API.
   *
   * 2. **The adapter doesn't have a SupabaseClient** — it only has Violet API
   *    credentials. Calling the Edge Function from here would require injecting
   *    a SupabaseClient, breaking the adapter's single-responsibility.
   *
   * 3. **Architecture decision** — Search is a cross-cutting concern (pgvector +
   *    OpenAI + Violet enrichment) that doesn't fit the single-supplier adapter
   *    pattern. The useSearch() hook orchestrates this directly.
   *
   * If server-side search is needed (e.g., SSR), use `searchQueryOptions()` from
   * `packages/shared/src/hooks/useSearch.ts` with a server SupabaseClient instead.
   *
   * @returns Empty results — use useSearch() hook for actual search functionality
   */
  async searchProducts(
    query: string,
    _filters?: SearchFilters,
  ): Promise<ApiResponse<SearchResult>> {
    return {
      data: { query, products: [], total: 0, explanations: {} },
      error: null,
    };
  }

  // ─── Cart ─────────────────────────────────────────────────────────

  /**
   * Creates a new Violet cart via POST /checkout/cart.
   *
   * The `channel_id` is our Violet App ID — required by Violet to associate
   * the cart with our merchant channel.
   *
   * The `input` parameter carries userId/sessionId for Supabase persistence
   * (handled by the Server Function layer, not here).
   */
  async createCart(_input: CreateCartInput): Promise<ApiResponse<Cart>> {
    const appId = this.getAppId();
    if (!appId) {
      return {
        data: null,
        error: { code: "VIOLET.CONFIG_MISSING", message: "VIOLET_APP_ID not configured" },
      };
    }

    const result = await this.fetchWithRetry(`${this.apiBase}/checkout/cart`, {
      method: "POST",
      body: JSON.stringify({ channel_id: Number(appId), currency: "USD" }),
    });

    if (result.error) return { data: null, error: result.error };

    return this.parseAndTransformCart(result.data);
  }

  /**
   * Adds a SKU to a Violet cart via POST /checkout/cart/{cartId}/skus.
   *
   * @param violetCartId - Violet cart integer ID (as string)
   * @param item - SKU ID and quantity to add
   */
  async addToCart(violetCartId: string, item: CartItemInput): Promise<ApiResponse<Cart>> {
    const appId = this.getAppId();
    if (!appId) {
      return {
        data: null,
        error: { code: "VIOLET.CONFIG_MISSING", message: "VIOLET_APP_ID not configured" },
      };
    }

    const result = await this.fetchWithRetry(`${this.apiBase}/checkout/cart/${violetCartId}/skus`, {
      method: "POST",
      body: JSON.stringify({
        sku_id: Number(item.skuId),
        quantity: item.quantity,
        app_id: Number(appId),
      }),
    });

    if (result.error) return { data: null, error: result.error };

    return this.parseAndTransformCart(result.data);
  }

  /**
   * Updates a SKU quantity via PUT /checkout/cart/{cartId}/skus/{skuId}.
   *
   * @param violetCartId - Violet cart integer ID (as string)
   * @param skuId - Violet SKU integer ID (as string)
   * @param quantity - New quantity (minimum 1)
   */
  async updateCartItem(
    violetCartId: string,
    skuId: string,
    quantity: number,
  ): Promise<ApiResponse<Cart>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/skus/${skuId}`,
      {
        method: "PUT",
        body: JSON.stringify({ quantity }),
      },
    );

    if (result.error) return { data: null, error: result.error };

    return this.parseAndTransformCart(result.data);
  }

  /**
   * Removes a SKU from a Violet cart via DELETE /checkout/cart/{cartId}/skus/{skuId}.
   *
   * @param violetCartId - Violet cart integer ID (as string)
   * @param skuId - Violet SKU integer ID (as string)
   */
  async removeFromCart(violetCartId: string, skuId: string): Promise<ApiResponse<Cart>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/skus/${skuId}`,
      { method: "DELETE" },
    );

    if (result.error) return { data: null, error: result.error };

    return this.parseAndTransformCart(result.data);
  }

  /**
   * Fetches current cart state via GET /checkout/cart/{cartId}.
   *
   * @param violetCartId - Violet cart integer ID (as string)
   */
  async getCart(violetCartId: string): Promise<ApiResponse<Cart>> {
    const result = await this.fetchWithRetry(`${this.apiBase}/checkout/cart/${violetCartId}`, {
      method: "GET",
    });

    if (result.error) return { data: null, error: result.error };

    return this.parseAndTransformCart(result.data);
  }

  /**
   * Parses a raw Violet cart API response and transforms it to our Cart type.
   *
   * Handles the 200-with-errors pattern: extracts `errors` array even on HTTP 200.
   * Returns a Cart with the `violetCartId` as the primary identifier — the caller
   * (Server Function) is responsible for creating/looking up the Supabase cart row.
   */
  private parseAndTransformCart(
    raw: unknown,
  ): { data: Cart; error: null } | { data: null; error: { code: string; message: string } } {
    const parsed = violetCartResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        data: null,
        error: { code: "VIOLET.VALIDATION_ERROR", message: parsed.error.message },
      };
    }

    const violet = parsed.data;
    const bags = violet.bags.map((bag) => this.transformBag(bag));

    // Aggregate total from all bag subtotals
    const total = bags.reduce((sum, b) => sum + b.subtotal, 0);

    // Build a partial Cart — id and userId are set by the Server Function
    // after persisting to Supabase. violetCartId is the Violet integer ID.
    return {
      data: {
        id: "", // Set by Server Function after Supabase upsert
        violetCartId: String(violet.id),
        userId: null,
        sessionId: null,
        bags,
        total,
        currency: violet.currency,
        status: "active",
      },
      error: null,
    };
  }

  private transformBag(raw: VioletBagResponse): Bag {
    const items = raw.skus.map((sku) => this.transformCartSku(sku));
    const errors: BagError[] = raw.errors.map((e) => ({
      code: e.code,
      message: e.message,
      skuId: e.sku_id !== undefined ? String(e.sku_id) : undefined,
    }));

    return {
      id: String(raw.id),
      merchantId: String(raw.merchant_id),
      merchantName: raw.merchant_name,
      items,
      subtotal: raw.subtotal,
      tax: raw.tax,
      shippingTotal: raw.shipping_total,
      errors,
    };
  }

  private transformCartSku(raw: VioletCartSkuResponse): CartItem {
    return {
      id: String(raw.id),
      skuId: String(raw.sku_id),
      productId: "", // Violet doesn't return product_id in cart SKU response
      quantity: raw.quantity,
      unitPrice: raw.price,
    };
  }

  /**
   * Returns the Violet App ID from the token manager config.
   * Used as channel_id when creating carts.
   */
  private getAppId(): string | null {
    // VioletTokenManager stores config — we access it via the stored apiBase
    // The appId is available in process.env on the server
    return (typeof process !== "undefined" && process.env?.VIOLET_APP_ID) || null;
  }

  async getPaymentIntent(_cartId: string): Promise<ApiResponse<PaymentIntent>> {
    throw new Error("Not implemented — Story 4.4");
  }

  async submitOrder(_cartId: string): Promise<ApiResponse<Order>> {
    throw new Error("Not implemented — Story 4.4");
  }

  async getOrder(_orderId: string): Promise<ApiResponse<Order>> {
    throw new Error("Not implemented — Story 5.1");
  }

  async getOrders(_userId: string): Promise<ApiResponse<Order[]>> {
    throw new Error("Not implemented — Story 5.1");
  }

  /**
   * Validates a Violet webhook signature (synchronous adapter-level check).
   *
   * ## Why this is a simple header-presence check
   *
   * The actual HMAC-SHA256 verification is async (Web Crypto API) and runs
   * in the handle-webhook Edge Function via `validateHmac()` in `_shared/webhookAuth.ts`.
   *
   * This adapter method provides a synchronous pre-check for the SupplierAdapter
   * interface contract. It verifies that required headers are present — the caller
   * should still perform the full async HMAC validation for actual security.
   *
   * @param headers - Request headers containing X-Violet-Hmac and X-Violet-Event-Id
   * @param _body - Raw request body (unused in sync check; used by async HMAC validation)
   * @returns true if required webhook headers are present
   */
  validateWebhook(headers: Headers, _body: string): boolean {
    const hmac = headers.get("x-violet-hmac");
    const eventId = headers.get("x-violet-event-id");
    const topic = headers.get("x-violet-topic");
    return Boolean(hmac && eventId && topic);
  }

  /**
   * Routes a webhook event to the appropriate handler.
   *
   * ## Architecture note
   *
   * In the primary execution path, the handle-webhook Edge Function processes
   * events directly via `processors.ts`. This adapter method exists for the
   * SupplierAdapter interface and can be used in non-Edge contexts (e.g., tests,
   * server functions) where the caller has a normalized WebhookEvent.
   *
   * Offer events (ADDED/UPDATED) would need a Supabase client to invoke
   * generate-embeddings, which this adapter doesn't have. For now, it
   * acknowledges the event and returns success — the real processing
   * happens in the Edge Function.
   *
   * @param event - Normalized webhook event
   * @returns Success response (processing is handled by Edge Function)
   */
  async processWebhook(_event: WebhookEvent): Promise<ApiResponse<void>> {
    return { data: undefined, error: null };
  }
}
