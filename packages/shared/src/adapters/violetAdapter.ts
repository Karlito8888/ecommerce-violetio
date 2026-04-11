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
  CategoryItem,
  CreateCartInput,
  CustomerInput,
  PaymentIntent,
  Order,
  OrderDetail,
  OrderBag,
  OrderBagItem,
  OrderStatus,
  BagStatus,
  BagFinancialStatus,
  OrderSubmitResult,
  WebhookEvent,
  SearchResult,
  SearchFilters,
  ShippingAddressInput,
  ShippingMethodsAvailable,
  SetShippingMethodInput,
  ShippingInfo,
  CountryOption,
  VioletOfferResponse,
  VioletSkuResponse,
  VioletAlbumResponse,
  VioletPaginatedResponse,
  Distribution,
  DistributionType,
  DistributionStatus,
  CollectionItem,
} from "../types/index.js";
import { getDeliveryEstimate, countryFlag } from "../utils/currency.js";
import type { SupplierAdapter } from "./supplierAdapter.js";
import { VioletTokenManager } from "../clients/violetAuth.js";
import { VIOLET_API_BASE } from "../utils/constants.js";
import {
  violetOfferSchema,
  violetPaginatedOffersSchema,
  violetCartResponseSchema,
  violetShippingAvailableResponseSchema,
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

/**
 * In-memory cache for Demo Mode product listings.
 *
 * ## Why cache here?
 *
 * In Violet Demo Mode, `POST /catalog/offers/search` returns 0 results
 * (demo merchants are not indexed). The fallback `getProductsFromMerchants`
 * makes multiple sequential Violet API calls:
 *   1. GET /merchants (~200ms)
 *   2. GET /catalog/offers/merchants/{id} × N merchants (~500ms each)
 *
 * This chain causes ~2100ms SSR TTFB on the /products page.
 * Caching the raw offers list for 60 seconds reduces repeat requests to <10ms.
 *
 * ## What is cached
 * The raw offer objects (before country-specific transformation), keyed by nothing
 * since Demo Mode always returns the same set of merchants/offers. Transformation
 * via `transformOffer(offer, countryCode)` is re-applied per-request (cheap, O(n)).
 *
 * ## TTL choice
 * 60 seconds balances freshness with performance. Products update via webhooks
 * (OFFER_ADDED/UPDATED/REMOVED), so a 60s lag is acceptable for catalog browsing.
 * Webhooks handle eventual consistency; this cache handles SSR latency.
 *
 * @see getProductsFromMerchants — the only consumer of this cache
 */
interface DemoOffersCache {
  rawOffers: unknown[];
  expiresAt: number;
}
let _demoOffersCache: DemoOffersCache | null = null;
const DEMO_CACHE_TTL_MS = 60_000;

/**
 * Cache for dynamically derived categories. Categories rarely change
 * (only when merchants add products in new categories), so a 5-minute TTL
 * balances freshness with API call reduction.
 */
interface CategoriesCache {
  data: CategoryItem[];
  expiresAt: number;
}
let _categoriesCache: CategoriesCache | null = null;
const CATEGORIES_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
    /**
     * 409 Conflict — duplicate submission with a different app_order_id,
     * or cart state conflict (e.g., already submitted with different data).
     *
     * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-completion/submit-cart
     */
    case 409:
      return "VIOLET.CONFLICT";
    /**
     * 412 Precondition Failed — cart not priced, missing required checkout steps,
     * or cart currency mismatch. Indicates the checkout flow was incomplete.
     *
     * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-completion/submit-cart
     */
    case 412:
      return "VIOLET.PRECONDITION_FAILED";
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
  async getProducts(
    params: ProductQuery,
    countryCode?: string,
  ): Promise<ApiResponse<PaginatedResult<Product>>> {
    const page = (params.page ?? 1) - 1; // Internal 1-based → Violet 0-based
    const size = params.pageSize ?? 20;

    const queryParams = new URLSearchParams({
      page: String(page),
      size: String(size),
      include: "shipping,metadata,sku_metadata",
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
      return this.getProductsFromMerchants(params, countryCode);
    }

    return {
      data: {
        data: violet.content.map((offer) => this.transformOffer(offer, countryCode)),
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
    countryCode?: string,
  ): Promise<ApiResponse<PaginatedResult<Product>>> {
    const page = params.page ?? 1;
    const size = params.pageSize ?? 20;

    // ── Cache check ──────────────────────────────────────────────────────────
    // The raw offer list from Violet is the bottleneck: GET /merchants + N×GET
    // /catalog/offers/merchants/{id} takes ~2s in Demo Mode. Cache for 60s.
    // Filtering/sorting/pagination run in-memory from the cached raw offers.
    let allRawOffers: unknown[];
    const now = Date.now();

    if (_demoOffersCache && _demoOffersCache.expiresAt > now) {
      allRawOffers = _demoOffersCache.rawOffers;
    } else {
      // Step 1: Get connected merchants
      const merchantsResult = await this.fetchWithRetry(
        `${this.apiBase}/merchants?page=1&size=50`,
        { method: "GET" },
      );
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
          `${this.apiBase}/catalog/offers/merchants/${merchantId}?page=1&size=100&include=shipping,metadata,sku_metadata`,
          { method: "GET" },
        );
        if (res.error || !res.data) return [];
        const data = res.data as { content?: unknown[] };
        return data.content ?? [];
      });

      const allOfferArrays = await Promise.all(offerPromises);
      allRawOffers = allOfferArrays.flat();

      // Populate cache for subsequent SSR requests
      _demoOffersCache = { rawOffers: allRawOffers, expiresAt: now + DEMO_CACHE_TTL_MS };
    }

    // Step 3: Filter raw offers before transformation (saves processing)
    let filteredRaw = allRawOffers;
    if (params.category !== undefined) {
      if (params.category === "") {
        // "Other" — match products with no source_category_name
        filteredRaw = filteredRaw.filter((raw) => {
          const r = raw as Record<string, unknown>;
          const sourceCat = ((r.source_category_name as string) ?? "").trim();
          return sourceCat === "";
        });
      } else {
        const cat = params.category.toLowerCase();
        filteredRaw = filteredRaw.filter((raw) => {
          const r = raw as Record<string, unknown>;
          const sourceCat = (r.source_category_name as string) ?? "";
          return sourceCat.toLowerCase().includes(cat);
        });
      }
    }

    // Step 4: Validate and transform each offer
    let products: Product[] = [];
    for (const raw of filteredRaw) {
      const parsed = violetOfferSchema.safeParse(raw);
      if (parsed.success) {
        products.push(this.transformOffer(parsed.data, countryCode));
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
  async getProduct(id: string, countryCode?: string): Promise<ApiResponse<Product>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/catalog/offers/${id}?include=shipping,metadata,sku_metadata`,
      { method: "GET" },
    );

    if (result.error) return { data: null, error: result.error };

    const parsed = violetOfferSchema.safeParse(result.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { code: "VIOLET.VALIDATION_ERROR", message: parsed.error.message },
      };
    }

    return { data: this.transformOffer(parsed.data, countryCode), error: null };
  }

  /**
   * Aggregate all available shipping countries across Shopify offers.
   * Used by the CountrySelector to show countries with deliverable products.
   *
   * NOTE: Fetches up to 200 offers. For catalogs with 200+ offers, country counts
   * may be undercounted. Consider caching via Supabase edge function if this
   * becomes a problem.
   */
  async getAvailableCountries(): Promise<ApiResponse<CountryOption[]>> {
    // Fetch a large batch of offers with shipping data
    const result = await this.fetchWithRetry(
      `${this.apiBase}/catalog/offers/search?page=0&size=200&include=shipping,metadata,sku_metadata`,
      { method: "POST", body: JSON.stringify({}) },
    );

    if (result.error) return { data: null, error: result.error };

    const parsed = violetPaginatedOffersSchema.safeParse(result.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { code: "VIOLET.VALIDATION_ERROR", message: parsed.error.message },
      };
    }

    // If search returned empty, merchant fallback doesn't include shipping data
    const offers = parsed.data.content;
    if (offers.length === 0) {
      return { data: [], error: null };
    }

    // Aggregate countries from all Shopify shipping zones
    const countryMap = new Map<string, { name: string; count: number }>();
    for (const offer of offers) {
      if (offer.source !== "SHOPIFY" || !offer.shipping) continue;
      for (const zone of offer.shipping.shipping_zones ?? []) {
        const existing = countryMap.get(zone.country_code);
        if (existing) {
          existing.count++;
        } else {
          countryMap.set(zone.country_code, {
            name: zone.country_name,
            count: 1,
          });
        }
      }
    }

    const countries: CountryOption[] = Array.from(countryMap.entries())
      .map(([code, { name, count }]) => ({
        code,
        name,
        flag: countryFlag(code),
        productCount: count,
      }))
      .sort((a, b) => b.productCount - a.productCount);

    return { data: countries, error: null };
  }

  // ─── Categories ──────────────────────────────────────────────────

  /**
   * Fetches product categories derived from actual offer data.
   *
   * ## Strategy: derive from offers, not taxonomy
   *
   * Violet products carry a `source_category_name` field (e.g., "Clothing", "Home")
   * that is used for filtering via `POST /catalog/offers/search`. Rather than
   * navigating the Google Product Taxonomy tree (5000+ categories across 100+ pages,
   * mismatched depth levels), we extract categories directly from the offers
   * we have access to.
   *
   * This guarantees:
   * - Every nav category corresponds to real products (no empty results)
   * - Filter values match exactly what the search API expects (`source_category_name`)
   * - New merchant categories appear automatically
   * - No hardcoded fallback categories needed
   *
   * ## Caching
   *
   * Results are cached for 5 minutes in memory. Categories rarely change — they
   * only shift when merchants add/remove products with new categories.
   *
   * @see https://docs.violet.io/prism/catalog/categories
   * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
   */
  async getCategories(): Promise<ApiResponse<CategoryItem[]>> {
    // Return cached categories if still fresh
    if (_categoriesCache && Date.now() < _categoriesCache.expiresAt) {
      return { data: _categoriesCache.data, error: null };
    }

    try {
      const offerCategories = await this.deriveCategoriesFromOffers();

      // Always prepend "All" — capped at 6 total (All + 5 categories)
      const result: CategoryItem[] = [
        { slug: "all", label: "All", filter: undefined },
        ...offerCategories.slice(0, 5),
      ];

      // Cache for 5 minutes
      _categoriesCache = {
        data: result,
        expiresAt: Date.now() + CATEGORIES_CACHE_TTL_MS,
      };

      return { data: result, error: null };
    } catch {
      // API unreachable — return just "All" (no hardcoded categories)
      return { data: [{ slug: "all", label: "All", filter: undefined }], error: null };
    }
  }

  /**
   * Extracts unique `source_category_name` values from available offers.
   *
   * Two-phase approach:
   * 1. **Search endpoint** (`POST /catalog/offers/search`) — works in production
   *    with real merchants whose products are indexed by Violet.
   * 2. **Merchant fallback** — fetches from each merchant directly via
   *    `GET /catalog/offers/merchants/{id}`. Needed in Violet Demo Mode where
   *    demo merchants' products are NOT in the search index. Reuses the
   *    `_demoOffersCache` if fresh (populated by `getProductsFromMerchants`).
   *
   * The `source_category_name` on each offer is the exact value used for
   * category filtering in `POST /catalog/offers/search`, guaranteeing that
   * nav categories always match the search API's expectations.
   *
   * @returns CategoryItem[] derived from real product data (without "All")
   */
  private async deriveCategoriesFromOffers(): Promise<CategoryItem[]> {
    // Phase 1: Try the search endpoint (works in production)
    const searchResult = await this.fetchWithRetry(
      `${this.apiBase}/catalog/offers/search?page=0&size=100`,
      { method: "POST", body: JSON.stringify({}) },
    );

    if (!searchResult.error && searchResult.data) {
      const data = searchResult.data as {
        content?: Array<{ source_category_name?: string }>;
      };
      const offers = data.content ?? [];
      if (offers.length > 0) {
        return this.extractCategoriesFromRawOffers(offers);
      }
    }

    // Phase 2: Demo mode — fetch from merchants directly
    // We need merchant_id alongside source_category_name to infer missing
    // categories from same-merchant products.
    let rawOffers: Array<{ source_category_name?: string; merchant_id?: number }>;
    const now = Date.now();

    // Reuse _demoOffersCache if fresh (shared with getProductsFromMerchants)
    if (_demoOffersCache && _demoOffersCache.expiresAt > now) {
      rawOffers = _demoOffersCache.rawOffers as Array<{
        source_category_name?: string;
        merchant_id?: number;
      }>;
    } else {
      const merchantsResult = await this.fetchWithRetry(
        `${this.apiBase}/merchants?page=1&size=50`,
        { method: "GET" },
      );
      if (merchantsResult.error) return [];

      const merchantsData = merchantsResult.data as {
        content: Array<{ id: number }>;
      };
      const merchantIds = merchantsData.content.map((m) => m.id);
      if (merchantIds.length === 0) return [];

      // Fetch offers from all merchants in parallel
      const offerPromises = merchantIds.map(async (merchantId) => {
        const res = await this.fetchWithRetry(
          `${this.apiBase}/catalog/offers/merchants/${merchantId}?page=1&size=100`,
          { method: "GET" },
        );
        if (res.error || !res.data) return [];
        const d = res.data as { content?: unknown[] };
        return d.content ?? [];
      });

      const allOfferArrays = await Promise.all(offerPromises);
      rawOffers = allOfferArrays.flat() as Array<{
        source_category_name?: string;
        merchant_id?: number;
      }>;

      // Cache for subsequent requests (shared with getProductsFromMerchants)
      _demoOffersCache = {
        rawOffers: rawOffers as unknown[],
        expiresAt: now + DEMO_CACHE_TTL_MS,
      };
    }

    return this.extractCategoriesFromRawOffers(rawOffers);
  }

  /**
   * Extracts unique `source_category_name` values from raw offers.
   *
   * Products with an empty `source_category_name` are grouped under an "Other"
   * category. Violet's docs warn that category data depends on merchant input:
   * "If a Merchant hasn't entered categories for their products, there would be
   * no data for Violet to consume." Rather than silently dropping these products,
   * we surface them under "Other" so every product is reachable via the chips.
   */
  private extractCategoriesFromRawOffers(
    offers: Array<{ source_category_name?: string }>,
  ): CategoryItem[] {
    const seen = new Set<string>();
    const categories: CategoryItem[] = [];
    let hasUncategorized = false;

    for (const offer of offers) {
      const cat = offer.source_category_name?.trim();
      if (cat) {
        if (!seen.has(cat)) {
          seen.add(cat);
          categories.push({
            slug: cat.toLowerCase().replace(/\s+/g, "-"),
            label: cat,
            filter: cat,
          });
        }
      } else {
        hasUncategorized = true;
      }
    }

    if (hasUncategorized) {
      categories.push({ slug: "other", label: "Other", filter: "" });
    }

    return categories;
  }

  /**
   * Best-effort merchant origin inference.
   * In the future, Violet may expose merchant country directly.
   * For now, defaults to "US" which is correct for most Violet sandbox merchants.
   */
  private inferMerchantOrigin(_seller: string): string {
    // Placeholder: when Violet exposes merchant.country, use it here.
    // For now, all Violet sandbox merchants are US-based.
    return "US";
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
  private transformOffer(raw: VioletOfferResponse, countryCode?: string): Product {
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
      shippingInfo: this.buildShippingInfo(raw, countryCode),
    };
  }

  /**
   * Build ShippingInfo from Violet's shipping zone data.
   *
   * - Shopify merchants with shipping zones: real data + delivery estimates
   * - Non-Shopify or missing data: source="OTHER", always shown, no estimate
   */
  private buildShippingInfo(raw: VioletOfferResponse, countryCode?: string): ShippingInfo | null {
    const source = raw.source ?? "";
    const shippingData = raw.shipping;

    // Non-Shopify merchant or no shipping data: show product with "Shipping TBD"
    if (source !== "SHOPIFY" || !shippingData) {
      return {
        shipsToUserCountry: true,
        shippingZones: [],
        deliveryEstimate: null,
        source: "OTHER",
      };
    }

    const zones = (shippingData.shipping_zones ?? []).map((z) => ({
      countryCode: z.country_code,
      countryName: z.country_name,
    }));

    // No country context — return zones but can't determine shipping eligibility
    if (!countryCode) {
      return {
        shipsToUserCountry: true,
        shippingZones: zones,
        deliveryEstimate: null,
        source: "SHOPIFY",
      };
    }

    const shipsToUser = zones.length === 0 || zones.some((z) => z.countryCode === countryCode);

    // Infer merchant origin from seller field or default to US.
    // Violet sandbox merchants are US-based; production may include EU/UK sellers.
    const merchantOrigin = this.inferMerchantOrigin(raw.seller ?? "");
    const estimate = shipsToUser ? getDeliveryEstimate(merchantOrigin, countryCode) : null;

    return {
      shipsToUserCountry: shipsToUser,
      shippingZones: zones,
      deliveryEstimate: estimate,
      source: "SHOPIFY",
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

  // ─── Shipping (Story 4.3) ──────────────────────────────────────────

  /**
   * Sets the shipping address for a Violet cart.
   *
   * ## Why this returns `ApiResponse<void>`
   * Violet's POST /shipping_address response is a 200 with the order address object,
   * not a full cart. We don't need to parse the response body — we just need to know
   * if the address was accepted. The caller then calls `getAvailableShippingMethods`.
   *
   * ## Field mapping (camelCase → Violet snake_case)
   * - `address1`   → `address_1`   (Violet's non-standard field name)
   * - `postalCode` → `postal_code`
   * All other fields are the same name in both systems.
   *
   * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-address
   */
  async setShippingAddress(
    violetCartId: string,
    address: ShippingAddressInput,
  ): Promise<ApiResponse<void>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/shipping_address`,
      {
        method: "POST",
        body: JSON.stringify({
          /**
           * Violet OrderAddress fields confirmed from official docs:
           * address_1, city, state, postal_code, country, phone.
           *
           * NOTE: `name` and `email` are NOT part of the shipping address object —
           * they belong to the Customer object (POST /checkout/cart/{id}/customer, Story 4.4).
           * Sending them here will be silently ignored or cause validation errors.
           *
           * @see https://docs.violet.io/api-reference/order-service/checkout-shipping/set-shipping-address
           * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/customers
           */
          address_1: address.address1,
          city: address.city,
          state: address.state,
          postal_code: address.postalCode,
          country: address.country,
          phone: address.phone,
        }),
      },
    );
    if (result.error) return { data: null, error: result.error };
    return { data: undefined, error: null };
  }

  /**
   * Fetches available shipping methods for all bags in the cart.
   *
   * ## Why this call is slow (2–5 seconds)
   * Violet's API calls third-party carrier APIs (USPS, FedEx, UPS) in real-time
   * for each merchant bag. This is not cacheable — rates depend on address + cart content.
   * Always show a per-bag loading skeleton, never a global spinner.
   *
   * ## PREREQUISITE: shipping address must be set first
   * Calling this without a prior `setShippingAddress` will fail or return empty results.
   * The UI enforces the address → methods order.
   *
   * ## Response transformation
   * Violet returns `[{ bag_id: number, shipping_methods: [...] }]`.
   * We normalize to `ShippingMethodsAvailable[]` with camelCase and string IDs.
   * The `label ?? name ?? ""` fallback handles Violet's inconsistent field naming.
   *
   * @see https://docs.violet.io/api-reference/checkout/cart/get-available-shipping-methods
   */
  async getAvailableShippingMethods(
    violetCartId: string,
  ): Promise<ApiResponse<ShippingMethodsAvailable[]>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/shipping/available`,
      { method: "GET" },
    );
    if (result.error) return { data: null, error: result.error };

    const parsed = violetShippingAvailableResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      return {
        data: null,
        error: {
          code: "VIOLET.VALIDATION_ERROR",
          message: `Invalid shipping/available response: ${parsed.error.message}`,
        },
      };
    }

    return {
      data: parsed.data.map((item) => ({
        bagId: String(item.bag_id),
        shippingMethods: item.shipping_methods.map((m) => ({
          /**
           * Confirmed from Violet docs: the identifier field is "shipping_method_id" (string).
           * This value must be sent back in the POST /shipping body as "shipping_method_id".
           *
           * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/shipping-methods
           */
          id: m.shipping_method_id,
          label: m.label,
          carrier: m.carrier,
          /**
           * Delivery time fields (minDays, maxDays) are NOT available from Violet's API.
           * Confirmed via official FAQ: carrier APIs don't consistently provide this data.
           * These will always be undefined in practice.
           *
           * @see https://docs.violet.io/faqs/checkout/shipping
           */
          minDays: m.min_days,
          maxDays: m.max_days,
          price: m.price,
        })),
      })),
      error: null,
    };
  }

  /**
   * Applies shipping method selections to a cart and returns the "priced cart".
   *
   * ## Why this returns `ApiResponse<Cart>` (not void)
   * Violet's POST /shipping response is the full cart with updated `shipping_total`
   * per bag. We MUST parse and return it so the UI can update cart totals immediately
   * without a separate GET call.
   *
   * ## Request body format (Violet snake_case)
   * Violet expects: `[{ bag_id: number, shipping_method_id: string }]`
   * Note: the field is "shipping_method_id" (not "shipping_method").
   * This was verified against the Violet sandbox and matches the story spec (C1).
   *
   * ## bagId conversion
   * Our `SetShippingMethodInput.bagId` is a string (our internal convention).
   * Violet requires `bag_id` as a number — we convert with `Number(s.bagId)`.
   *
   * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-methods
   * @see parseAndTransformCart — used to parse the "priced cart" response
   */
  async setShippingMethods(
    violetCartId: string,
    selections: SetShippingMethodInput[],
  ): Promise<ApiResponse<Cart>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/shipping`,
      {
        method: "POST",
        body: JSON.stringify(
          selections.map((s) => ({
            bag_id: Number(s.bagId),
            shipping_method_id: s.shippingMethodId,
          })),
        ),
      },
    );
    if (result.error) return { data: null, error: result.error };

    // The response is a full "priced cart" — parse it to update shippingTotal per bag.
    return this.parseAndTransformCart(result.data);
  }

  /**
   * Prices a cart via GET /checkout/cart/{id}/price.
   *
   * Forces a deep update against all underlying e-commerce platforms to ensure
   * tax, shipping, and pricing data is consistent. Returns the fully priced cart.
   *
   * ## When to call this
   * After `setShippingMethods`, if any bag has `tax_total === 0`, the pricing
   * may not have been calculated automatically. Call this to force pricing before
   * submitting the order.
   *
   * ## Rate limit impact
   * This call hits external e-commerce platform APIs, so it impacts rate limits.
   * Only call when necessary (tax_total is 0 after shipping methods).
   *
   * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-pricing/price-cart
   * @see https://docs.violet.io/prism/overview/place-an-order/submit-cart — pricing note
   */
  async priceCart(violetCartId: string): Promise<ApiResponse<Cart>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/price`,
      { method: "GET" },
    );
    if (result.error) return { data: null, error: result.error };

    return this.parseAndTransformCart(result.data);
  }

  // ─── Checkout — Customer & Billing (Story 4.4) ───────────────────

  /**
   * Sets guest customer info on the cart via POST /checkout/cart/{id}/customer.
   *
   * ## Violet API field mapping
   * - `email`     → `email`
   * - `firstName` → `first_name`
   * - `lastName`  → `last_name`
   * - `marketingConsent` → `communication_preferences: [{ enabled: true }]`
   *   (only included when user opted in; omitted otherwise)
   *
   * ## Why this returns `ApiResponse<void>`
   * Violet's response is a 200 with the customer object, not a full cart.
   * We don't need the response data — the caller proceeds to billing/payment.
   *
   * @see https://docs.violet.io/api-reference/checkout-cart/apply-guest-customer-to-cart
   * @see Story 4.4 AC#1, AC#2
   */
  async setCustomer(violetCartId: string, customer: CustomerInput): Promise<ApiResponse<void>> {
    const body: Record<string, unknown> = {
      email: customer.email,
      first_name: customer.firstName,
      last_name: customer.lastName,
    };

    /**
     * Marketing consent maps to Violet's `communication_preferences` array.
     * Only included when the user explicitly opted in (checkbox checked).
     * This is per-merchant (per-bag) in Violet's model, but we send a single
     * preference that applies to all merchants.
     *
     * Note: Violet's exact schema for this field is not fully documented.
     * If the API rejects it, remove from body — consent can be tracked in
     * Supabase as a fallback.
     *
     * @see Story 4.4 C9 — marketing consent field mapping
     */
    if (customer.marketingConsent) {
      body.communication_preferences = [{ enabled: true }];
    }

    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/customer`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    if (result.error) return { data: null, error: result.error };
    return { data: undefined, error: null };
  }

  /**
   * Sets a billing address different from the shipping address.
   *
   * ## Violet billing_address body (confirmed from official docs)
   * `address_1`, `city`, `state`, `postal_code`, `country`.
   *
   * Note: `phone` is NOT part of billing_address (unlike shipping_address).
   * We reuse `ShippingAddressInput` but intentionally omit `phone` in the body.
   *
   * @see https://docs.violet.io/api-reference/checkout-cart/set-billing-address
   * @see Story 4.4 AC#3
   */
  async setBillingAddress(
    violetCartId: string,
    address: ShippingAddressInput,
  ): Promise<ApiResponse<void>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/billing_address`,
      {
        method: "POST",
        body: JSON.stringify({
          address_1: address.address1,
          city: address.city,
          state: address.state,
          postal_code: address.postalCode,
          country: address.country,
          // phone is NOT included in billing_address per Violet docs
        }),
      },
    );
    if (result.error) return { data: null, error: result.error };
    return { data: undefined, error: null };
  }

  // ─── Checkout — Payment (Story 4.4) ─────────────────────────────

  /**
   * Retrieves the Stripe PaymentIntent client secret from the cart.
   *
   * ## Why GET /cart instead of a dedicated endpoint
   * Violet doesn't have a separate PaymentIntent endpoint. When a cart is created
   * with `wallet_based_checkout: true`, the `payment_intent_client_secret` field
   * is included in every GET /checkout/cart/{id} response.
   *
   * ## Error: VIOLET.NO_PAYMENT_INTENT
   * If the cart was created WITHOUT `wallet_based_checkout: true`, this field is
   * absent. The user must abandon the cart and create a fresh one. This error
   * should not occur in normal flow (createCart always sends the flag now).
   *
   * @see https://docs.violet.io/guides/checkout/payments
   * @see Story 4.4 C2 — implementation reference
   */
  async getPaymentIntent(violetCartId: string): Promise<ApiResponse<PaymentIntent>> {
    const result = await this.fetchWithRetry(`${this.apiBase}/checkout/cart/${violetCartId}`, {
      method: "GET",
    });
    if (result.error) return { data: null, error: result.error };

    const parsed = violetCartResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { code: "VIOLET.VALIDATION_ERROR", message: "Invalid cart response" },
      };
    }

    const secret = parsed.data.payment_intent_client_secret;
    if (!secret) {
      return {
        data: null,
        error: {
          code: "VIOLET.NO_PAYMENT_INTENT",
          message: "Cart was not created with wallet_based_checkout: true. Recreate the cart.",
        },
      };
    }

    return {
      data: {
        id: `pi_from_cart_${violetCartId}`,
        clientSecret: secret,
        amount: parsed.data.total ?? 0,
        currency: parsed.data.currency ?? "USD",
        stripePublishableKey: parsed.data.stripe_key,
      },
      error: null,
    };
  }

  /**
   * Submits the order to Violet after Stripe payment authorization.
   *
   * ## Flow
   * 1. Client calls `stripe.confirmPayment()` (authorizes, does NOT charge)
   * 2. This method calls POST /checkout/cart/{id}/submit with `{ app_order_id }`
   * 3. Violet charges the card and returns the order status
   *
   * ## Status handling
   * - `COMPLETED`: order successful, card charged
   * - `REQUIRES_ACTION`: 3DS challenge needed — return `paymentIntentClientSecret`
   *   so caller can run `stripe.handleNextAction()` then re-submit
   * - `REJECTED`: payment rejected, show error to user
   *
   * ## 200-with-errors pattern
   * Violet may return HTTP 200 with `errors[]` — always check this array.
   *
   * ## Idempotency
   * `appOrderId` (from `crypto.randomUUID()`) ensures duplicate submissions
   * (e.g., after 3DS retry) don't create multiple orders.
   *
   * @see https://docs.violet.io/api-reference/checkout-cart/submit-cart
   * @see Story 4.4 C5 — implementation reference
   */
  async submitOrder(
    violetCartId: string,
    appOrderId: string,
  ): Promise<ApiResponse<OrderSubmitResult>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/submit`,
      {
        method: "POST",
        body: JSON.stringify({ app_order_id: appOrderId }),
      },
    );

    if (result.error) return { data: null, error: result.error };

    /**
     * Violet submit response — typed from official API reference.
     *
     * The `errors[]` array uses a different structure than cart-level errors:
     * - Submit errors: `{ entity_type: "SKU", entity_id, bag_id, type, message, platform }`
     * - Cart errors:  `{ entity_type: "order_sku", sku_id, type, message }`
     *
     * Both are normalized to our `BagError` type at the adapter boundary.
     *
     * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-completion/submit-cart
     */
    const data = result.data as {
      id?: number;
      status?: string;
      payment_status?: string;
      payment_intent_client_secret?: string;
      payment_transactions?: Array<{
        payment_intent_client_secret?: string;
        metadata?: {
          payment_intent_client_secret?: string;
        };
      }>;
      bags?: Array<{
        id?: number;
        status?: string;
        financial_status?: string;
        total?: number;
      }>;
      errors?: Array<{
        id?: number;
        order_id?: number;
        bag_id?: number;
        entity_id?: string;
        entity_type?: string;
        type?: string;
        message?: string;
        date_created?: string;
        platform?: string;
        code?: string | number;
      }>;
    };

    // Determine effective status before error analysis
    // (needed to distinguish partial success from total failure)
    const effectiveStatus: OrderStatus =
      data.payment_status === "REQUIRES_ACTION"
        ? "REQUIRES_ACTION"
        : ((data.status ?? "COMPLETED") as OrderStatus);

    const hasErrors = Array.isArray(data.errors) && data.errors.length > 0;

    /**
     * ## Partial vs Total failure handling
     *
     * Per Violet's API reference, submit can return three scenarios:
     *
     * 1. **All bags succeed**: HTTP 200, `status: "COMPLETED"`, no errors.
     *    Card charged for all bags.
     *
     * 2. **Some bags fail (PARTIAL SUCCESS)**: HTTP 200, `status: "COMPLETED"`,
     *    `errors[]` populated. Successful bags: `ACCEPTED`/`PAID`.
     *    Failed bags: `REJECTED`/`VOIDED`. Card charged ONLY for successful bags.
     *    → Return data so UI navigates to confirmation page.
     *
     * 3. **All bags fail (TOTAL FAILURE)**: HTTP 200, `status: "IN_PROGRESS"`,
     *    `errors[]` populated. Payment `CANCELLED`. User NOT charged.
     *    → Return error so UI shows failure message.
     *
     * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-completion/submit-cart
     *   — "Submission Response Scenarios" section
     */
    if (hasErrors && effectiveStatus !== "COMPLETED") {
      // Total failure — all bags rejected, payment cancelled
      const firstError = data.errors![0];
      return {
        data: null,
        error: {
          code: "VIOLET.ORDER_ERROR",
          message: firstError?.message
            ? `Order failed: ${firstError.message}`
            : "Order submission failed with errors",
        },
      };
    }

    // Build the common result payload (shared by full success and partial success)
    const baseResult = {
      id: String(data.id ?? ""),
      status: effectiveStatus,
      paymentIntentClientSecret:
        data.payment_intent_client_secret ??
        data.payment_transactions?.[0]?.payment_intent_client_secret ??
        data.payment_transactions?.[0]?.metadata?.payment_intent_client_secret,
      bags: (data.bags ?? []).map((b) => ({
        id: String(b.id ?? ""),
        status: (b.status ?? "IN_PROGRESS") as BagStatus,
        financialStatus: (b.financial_status ?? "UNPAID") as BagFinancialStatus,
        total: b.total ?? 0,
      })),
    };

    // Partial success — COMPLETED with some bags REJECTED
    // Attach errors so the confirmation page can show per-bag results
    if (hasErrors) {
      return {
        data: {
          ...baseResult,
          errors: data.errors!.map((e) => ({
            code: String(e.type ?? e.code ?? "UNKNOWN"),
            message: e.message ?? "",
            skuId: e.entity_type === "SKU" && e.entity_id ? String(e.entity_id) : undefined,
            bagId: e.bag_id != null ? String(e.bag_id) : undefined,
            type: e.type,
            entityType: e.entity_type,
            externalPlatform: e.platform,
          })),
        },
        error: null,
      };
    }

    // Full success — no errors, all bags accepted
    return {
      data: baseResult,
      error: null,
    };
  }

  // ─── Collections (sync_collections feature) ────────────────────────

  /**
   * Cache for dynamically fetched collections. Collections rarely change
   * (synced daily by Violet), so a 10-minute TTL is appropriate.
   */
  private _collectionsCache: { data: CollectionItem[]; expiresAt: number } | null = null;
  private static COLLECTIONS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Fetches product collections from Violet.
   *
   * If `merchantId` is provided, fetches collections for that merchant via
   * `GET /catalog/collections/merchants/{merchant_id}`.
   * Otherwise, fetches all collections via `GET /catalog/collections`.
   *
   * Requires `sync_collections` feature flag enabled for the merchant(s).
   * Currently Shopify-only.
   *
   * Results are cached for 10 minutes — collections are synced daily by Violet.
   *
   * @see https://docs.violet.io/prism/catalog/collections
   * @see https://docs.violet.io/api-reference/catalog/collections/get-collections
   */
  async getCollections(merchantId?: string): Promise<ApiResponse<CollectionItem[]>> {
    // Return cached collections if still fresh
    if (this._collectionsCache && Date.now() < this._collectionsCache.expiresAt) {
      return { data: this._collectionsCache.data, error: null };
    }

    try {
      let url: string;

      if (merchantId) {
        url = `${this.apiBase}/catalog/collections/merchants/${merchantId}`;
      } else {
        url = `${this.apiBase}/catalog/collections`;
      }

      const result = await this.fetchWithRetry(url, { method: "GET" });

      if (result.error) {
        // Collections are optional — failure is non-blocking. Error is already
        // captured in result.error; callers handle it via the empty return below.
        void result.error.message;
        // Return empty — collections are optional
        return { data: [], error: null };
      }

      const data = result.data as Array<{
        id: number;
        name: string;
        description?: string;
        type?: "CUSTOM" | "AUTOMATED";
        merchant_id: number;
        external_id?: string;
        image_url?: string;
        sort_order?: number;
        date_created?: string;
        date_last_modified?: string;
      }>;

      const collections: CollectionItem[] = data.map((c) => ({
        id: String(c.id),
        merchantId: String(c.merchant_id),
        name: c.name,
        description: c.description ?? "",
        type: c.type ?? "CUSTOM",
        externalId: c.external_id ?? "",
        imageUrl: c.image_url ?? null,
        sortOrder: c.sort_order ?? 0,
        productCount: 0, // Will be populated by getCollectionOffers or a separate count query
        dateCreated: c.date_created ?? new Date().toISOString(),
        dateLastModified: c.date_last_modified ?? new Date().toISOString(),
      }));

      // Cache for 10 minutes
      this._collectionsCache = {
        data: collections,
        expiresAt: Date.now() + VioletAdapter.COLLECTIONS_CACHE_TTL_MS,
      };

      return { data: collections, error: null };
    } catch {
      // API unreachable — return empty (collections are optional)
      return { data: [], error: null };
    }
  }

  /**
   * Fetches offers (products) belonging to a specific collection.
   *
   * Uses `GET /catalog/collections/{collection_id}/offers` with pagination.
   * Requires `sync_collections` feature flag enabled.
   *
   * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers
   */
  async getCollectionOffers(
    collectionId: string,
    page = 1,
    pageSize = 24,
  ): Promise<ApiResponse<PaginatedResult<Product>>> {
    const violetPage = page - 1; // 0-based

    const url =
      `${this.apiBase}/catalog/collections/${collectionId}/offers` +
      `?page=${violetPage}&size=${pageSize}`;

    const result = await this.fetchWithRetry(url, { method: "GET" });

    if (result.error) {
      return {
        data: null,
        error: {
          code: "VIOLET.API_ERROR",
          message: `getCollectionOffers failed: ${result.error.message}`,
        },
      };
    }

    const data = result.data as VioletPaginatedResponse<VioletOfferResponse>;
    return {
      data: {
        data: data.content.map((offer) => this.transformOffer(offer)),
        total: data.total_elements,
        page: data.number + 1, // Violet 0-based → internal 1-based
        pageSize: data.size,
        hasNext: !data.last,
      },
      error: null,
    };
  }

  // ─── Merchant Feature Flags ────────────────────────────────────────

  /**
   * Enables the `sync_collections` feature flag for a merchant.
   *
   * Triggers an immediate collection sync and subsequent daily re-syncs.
   * Required for receiving COLLECTION_* webhook events.
   * Shopify merchants only.
   *
   * @see https://docs.violet.io/api-reference/merchants/configuration/toggle-merchant-configuration-global-feature-flag
   */
  async enableCollectionSync(merchantId: string): Promise<ApiResponse<void>> {
    return this.toggleFeatureFlag(merchantId, "sync_collections", true);
  }

  /**
   * Enables `sync_metadata` feature flag for a merchant (Offer-level).
   *
   * Note: This may increase sync time due to additional API calls to Shopify.
   *
   * @see https://docs.violet.io/prism/catalog/metadata-syncing
   */
  async enableMetadataSync(merchantId: string): Promise<ApiResponse<void>> {
    return this.toggleFeatureFlag(merchantId, "sync_metadata", true);
  }

  /**
   * Enables `sync_sku_metadata` feature flag for a merchant (SKU-level).
   *
   * Must be enabled separately from `sync_metadata`.
   *
   * @see https://docs.violet.io/prism/catalog/metadata-syncing/sku-metadata
   */
  async enableSkuMetadataSync(merchantId: string): Promise<ApiResponse<void>> {
    return this.toggleFeatureFlag(merchantId, "sync_sku_metadata", true);
  }

  /**
   * Toggles a merchant configuration feature flag via
   * PUT /merchants/{merchant_id}/configuration/global_feature_flags/{flag_name}
   *
   * @see https://docs.violet.io/api-reference/merchants/configuration/toggle-merchant-configuration-global-feature-flag
   */
  private async toggleFeatureFlag(
    merchantId: string,
    flagName: string,
    enabled: boolean,
  ): Promise<ApiResponse<void>> {
    const url = `${this.apiBase}/merchants/${merchantId}/configuration/global_feature_flags/${flagName}`;

    const result = await this.fetchWithRetry(url, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });

    if (result.error) {
      return {
        data: null,
        error: {
          code: "VIOLET.API_ERROR",
          message: `toggleFeatureFlag(${flagName}) failed: ${result.error.message}`,
        },
      };
    }

    return { data: undefined, error: null };
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

    /**
     * `wallet_based_checkout: true` tells Violet to create a Stripe PaymentIntent
     * at cart creation time. Without this flag, `payment_intent_client_secret` is
     * NOT returned in cart responses, and Stripe's PaymentElement cannot initialize.
     *
     * This is a one-way door: once a cart is created with this flag, the PaymentIntent
     * exists for the cart's lifetime. Old sandbox carts created without it must be
     * abandoned — start a fresh cart for testing.
     *
     * @see https://docs.violet.io/guides/checkout/payments — wallet-based checkout flow
     * @see Story 4.4 AC#5, AC#12 — payment_intent_client_secret dependency
     */
    const result = await this.fetchWithRetry(`${this.apiBase}/checkout/cart`, {
      method: "POST",
      body: JSON.stringify({
        channel_id: Number(appId),
        currency: "USD",
        wallet_based_checkout: true,
      }),
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
   * @param orderSkuId - Violet OrderSku ID (cart line item ID, not catalog SKU ID)
   * @param quantity - New quantity (minimum 1)
   */
  async updateCartItem(
    violetCartId: string,
    orderSkuId: string,
    quantity: number,
  ): Promise<ApiResponse<Cart>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/skus/${orderSkuId}`,
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
   * @param orderSkuId - Violet OrderSku ID (cart line item ID, not catalog SKU ID)
   */
  async removeFromCart(violetCartId: string, orderSkuId: string): Promise<ApiResponse<Cart>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/checkout/cart/${violetCartId}/skus/${orderSkuId}`,
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

    // Total = sum of (subtotal + tax + shippingTotal) per bag.
    // At Story 4.2 stage, shippingTotal is 0 for all bags (shipping selected in 4.3),
    // but the calculation must be correct for when Story 4.3 adds shipping.
    const total = bags.reduce((sum, b) => sum + b.subtotal + b.tax + b.shippingTotal, 0);

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
        /**
         * Maps Violet's `payment_intent_client_secret` (snake_case) to our
         * internal `paymentIntentClientSecret` (camelCase). Only present when
         * cart was created with `wallet_based_checkout: true`.
         *
         * @see Story 4.4 — used by getPaymentIntentFn to initialize Stripe Elements
         */
        paymentIntentClientSecret: violet.payment_intent_client_secret,
      },
      error: null,
    };
  }

  private transformBag(raw: VioletBagResponse): Bag {
    const items = raw.skus.map((sku) => this.transformCartSku(sku));
    const errors: BagError[] = raw.errors.map((e) => ({
      // Violet may return `type` or `code` depending on the error source.
      // Prefer `type` (documented field) and fall back to `code`.
      code: e.type ?? e.code ?? "UNKNOWN",
      message: e.message,
      skuId: e.sku_id !== undefined ? String(e.sku_id) : undefined,
      type: e.type,
      entityType: e.entity_type,
      externalPlatform: e.external_platform,
    }));

    // Violet returns subtotal=0 before checkout steps (shipping, tax).
    // Compute from items when Violet hasn't calculated yet.
    const computedSubtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const subtotal = raw.subtotal > 0 ? raw.subtotal : computedSubtotal;

    return {
      id: String(raw.id),
      merchantId: String(raw.merchant_id),
      merchantName: raw.merchant_name,
      items,
      subtotal,
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

  /**
   * Fetches complete order details from Violet's GET /orders/{id}.
   *
   * ## Violet response → OrderDetail mapping
   * - `sub_total` → `subtotal` (snake_case → camelCase at adapter boundary)
   * - `bags[].skus[]` → `bags[].items[]` (renamed for clarity: SKU is Violet's term)
   * - `bags[].merchant_name` → `bags[].merchantName`
   * - `date_submitted` → `dateSubmitted` (ISO 8601 string)
   *
   * ## 200-with-errors pattern
   * Violet can return HTTP 200 with an `errors[]` array even for GET requests.
   * We check this and surface bag-level errors to the caller.
   *
   * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-order-by-id
   * @see Story 4.5 C1 — Violet GET /orders/{id} response structure
   */
  async getOrder(orderId: string): Promise<ApiResponse<OrderDetail>> {
    const result = await this.fetchWithRetry(`${this.apiBase}/orders/${orderId}`, {
      method: "GET",
    });
    if (result.error) return { data: null, error: result.error };

    const data = result.data as Record<string, unknown>;

    // Check 200-with-errors pattern — Violet may return HTTP 200 with errors[] populated
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const firstError = data.errors[0] as Record<string, unknown> | undefined;
      return {
        data: null,
        error: {
          code: "VIOLET.ORDER_ERROR",
          message: String(firstError?.message ?? "Order has errors"),
        },
      };
    }

    // Parse bags → OrderBag[] with items (Violet calls them "skus")
    const rawBags = (data.bags as Array<Record<string, unknown>>) ?? [];
    const bags: OrderBag[] = rawBags.map((bag) => {
      const rawSkus = (bag.skus as Array<Record<string, unknown>>) ?? [];
      const items: OrderBagItem[] = rawSkus.map((sku) => ({
        skuId: String(sku.id ?? ""),
        name: String(sku.name ?? ""),
        quantity: Number(sku.quantity ?? 0),
        price: Number(sku.price ?? 0),
        linePrice: Number(sku.line_price ?? 0),
        thumbnail: (sku.thumbnail as string) || undefined,
      }));

      const shippingMethodRaw = bag.shipping_method as Record<string, unknown> | undefined;

      return {
        id: String(bag.id ?? ""),
        merchantName: String(bag.merchant_name ?? ""),
        status: String(bag.status ?? "IN_PROGRESS") as BagStatus,
        financialStatus: String(bag.financial_status ?? "UNPAID") as BagFinancialStatus,
        items,
        subtotal: Number(bag.sub_total ?? 0),
        shippingTotal: Number(bag.shipping_total ?? 0),
        taxTotal: Number(bag.tax_total ?? 0),
        total: Number(bag.total ?? 0),
        shippingMethod: shippingMethodRaw
          ? {
              carrier: String(shippingMethodRaw.carrier ?? ""),
              label: String(shippingMethodRaw.label ?? ""),
            }
          : undefined,
        commissionRate: Number(bag.commission_rate ?? 10),
      };
    });

    // Parse customer and shipping address
    const rawCustomer = (data.customer as Record<string, unknown>) ?? {};
    const rawShipping = (data.shipping_address as Record<string, unknown>) ?? {};

    return {
      data: {
        id: String(data.id ?? ""),
        status: (data.status ?? "COMPLETED") as OrderStatus,
        currency: String(data.currency ?? "USD"),
        subtotal: Number(data.sub_total ?? 0),
        shippingTotal: Number(data.shipping_total ?? 0),
        taxTotal: Number(data.tax_total ?? 0),
        total: Number(data.total ?? 0),
        bags,
        customer: {
          email: String(rawCustomer.email ?? ""),
          firstName: String(rawCustomer.first_name ?? ""),
          lastName: String(rawCustomer.last_name ?? ""),
        },
        shippingAddress: {
          address1: String(rawShipping.address_1 ?? ""),
          city: String(rawShipping.city ?? ""),
          state: String(rawShipping.state ?? ""),
          postalCode: String(rawShipping.postal_code ?? ""),
          country: String(rawShipping.country ?? ""),
        },
        dateSubmitted: (data.date_submitted as string) || undefined,
      },
      error: null,
    };
  }

  async getOrderDistributions(violetOrderId: string): Promise<ApiResponse<Distribution[]>> {
    const result = await this.fetchWithRetry(
      `${this.apiBase}/orders/${violetOrderId}/distributions`,
      {
        method: "GET",
      },
    );
    if (result.error) return { data: null, error: result.error };

    const raw = result.data as unknown;
    const items: unknown[] = Array.isArray(raw)
      ? raw
      : (((raw as Record<string, unknown>).content as unknown[]) ?? []);

    const distributions: Distribution[] = items.map((item: unknown) => {
      const d = item as Record<string, unknown>;
      return {
        violetBagId: d["bag_id"] != null ? String(d["bag_id"]) : null,
        type: (d["type"] as DistributionType) ?? "PAYMENT",
        status: (d["status"] as DistributionStatus) ?? "PENDING",
        channelAmountCents: Number(d["channel_amount"] ?? 0),
        stripeFee: Number(d["stripe_fee"] ?? 0),
        merchantAmountCents: Number(d["merchant_amount"] ?? 0),
        subtotalCents: Number(d["subtotal"] ?? 0),
      };
    });

    return { data: distributions, error: null };
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
