/**
 * Violet catalog operations: getProducts, getProduct, getAvailableCountries.
 *
 * These functions were extracted from VioletAdapter. They accept a context
 * object with the API base URL and token manager instead of using `this`.
 */

import type {
  ApiResponse,
  PaginatedResult,
  Product,
  ProductQuery,
  CountryOption,
} from "../types/index.js";
import { violetOfferSchema, violetPaginatedOffersSchema } from "../schemas/index.js";
import { transformOffer, aggregateCountries } from "./violetTransforms.js";
import { fetchWithRetry } from "./violetFetch.js";
import { _demoOffersCache, DEMO_CACHE_TTL_MS, setDemoOffersCache } from "./violetConstants.js";
import type { VioletTokenManager } from "../clients/violetAuth.js";
import { getCurrencyForCountry } from "../utils/currency.js";

/** Shared context for all catalog operations. */
export interface CatalogContext {
  apiBase: string;
  tokenManager: VioletTokenManager;
}

/**
 * Search Violet's catalog using POST /catalog/offers/search.
 *
 * ## Pagination handling
 *
 * Violet uses Spring Boot's `Pageable` which is 0-based internally.
 * Our public API uses 1-based pages (more intuitive for UI).
 * Conversion: outgoing `page - 1`, incoming `number + 1`.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
 * @see https://docs.violet.io/concepts/pagination
 */
export async function getProducts(
  ctx: CatalogContext,
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

  const body: Record<string, unknown> = {};
  if (params.query) body.query = params.query;
  if (params.category) body.category = params.category;
  if (params.merchantId) body.merchant_id = Number(params.merchantId);
  if (params.minPrice !== undefined) body.min_price = params.minPrice;
  if (params.maxPrice !== undefined) body.max_price = params.maxPrice;
  if (params.inStock === true) body.available = true;

  if (params.sortBy === "price") {
    body.sort_by = "minPrice";
    body.sort_direction = params.sortDirection ?? "ASC";
  }

  // Contextual pricing: pass base_currency so Violet returns presentment prices
  // when the merchant has defined them for the requested currency.
  // @see https://docs.violet.io/prism/catalog/contextual-pricing
  const baseCurrency = countryCode ? getCurrencyForCountry(countryCode) : undefined;
  if (baseCurrency && baseCurrency !== "USD") {
    queryParams.set("base_currency", baseCurrency);
  }

  const result = await fetchWithRetry(
    `${ctx.apiBase}/catalog/offers/search?${queryParams}`,
    { method: "POST", body: JSON.stringify(body) },
    ctx.tokenManager,
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

  if (violet.content.length === 0 && violet.total_elements === 0) {
    return getProductsFromMerchants(ctx, params, countryCode);
  }

  return {
    data: {
      data: violet.content.map((offer) => transformOffer(offer, countryCode)),
      total: violet.total_elements,
      page: violet.number + 1,
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
 */
async function getProductsFromMerchants(
  ctx: CatalogContext,
  params: ProductQuery,
  countryCode?: string,
): Promise<ApiResponse<PaginatedResult<Product>>> {
  const page = params.page ?? 1;
  const size = params.pageSize ?? 20;
  const baseCurrency = countryCode ? getCurrencyForCountry(countryCode) : undefined;

  let allRawOffers: unknown[];
  const now = Date.now();

  if (_demoOffersCache && _demoOffersCache.expiresAt > now) {
    allRawOffers = _demoOffersCache.rawOffers;
  } else {
    const merchantsResult = await fetchWithRetry(
      `${ctx.apiBase}/merchants?page=1&size=50`,
      { method: "GET" },
      ctx.tokenManager,
    );

    if (merchantsResult.error) return { data: null, error: merchantsResult.error };

    const merchantsData = merchantsResult.data as {
      content: Array<{ id: number; connection_status?: string }>;
    };
    const merchantIds = merchantsData.content.map((m) => m.id);

    if (merchantIds.length === 0) {
      return { data: { data: [], total: 0, page, pageSize: size, hasNext: false }, error: null };
    }

    const offerPromises = merchantIds.map(async (merchantId) => {
      const currencyQs =
        baseCurrency && baseCurrency !== "USD" ? `&base_currency=${baseCurrency}` : "";
      const res = await fetchWithRetry(
        `${ctx.apiBase}/catalog/offers/merchants/${merchantId}?page=1&size=100&include=shipping,metadata,sku_metadata,collections${currencyQs}`,
        { method: "GET" },
        ctx.tokenManager,
      );
      if (res.error || !res.data) return [];
      const data = res.data as { content?: unknown[] };
      return data.content ?? [];
    });

    const allOfferArrays = await Promise.all(offerPromises);
    allRawOffers = allOfferArrays.flat();

    setDemoOffersCache({ rawOffers: allRawOffers, expiresAt: now + DEMO_CACHE_TTL_MS });
  }

  let filteredRaw = allRawOffers;
  if (params.category !== undefined) {
    if (params.category === "") {
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

  let products: Product[] = [];
  for (const raw of filteredRaw) {
    const parsed = violetOfferSchema.safeParse(raw);
    if (parsed.success) {
      products.push(transformOffer(parsed.data, countryCode));
    }
  }

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

  if (params.sortBy === "price") {
    const dir = params.sortDirection === "DESC" ? -1 : 1;
    products.sort((a, b) => dir * (a.minPrice - b.minPrice));
  }

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
 */
export async function getProduct(
  ctx: CatalogContext,
  id: string,
  countryCode?: string,
): Promise<ApiResponse<Product>> {
  const baseCurrency = countryCode ? getCurrencyForCountry(countryCode) : undefined;
  const currencyQs = baseCurrency && baseCurrency !== "USD" ? `&base_currency=${baseCurrency}` : "";
  const result = await fetchWithRetry(
    `${ctx.apiBase}/catalog/offers/${id}?include=shipping,metadata,sku_metadata,collections${currencyQs}`,
    { method: "GET" },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const parsed = violetOfferSchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      data: null,
      error: { code: "VIOLET.VALIDATION_ERROR", message: parsed.error.message },
    };
  }

  return { data: transformOffer(parsed.data, countryCode), error: null };
}

/**
 * Aggregate all available shipping countries across Shopify offers.
 */
export async function getAvailableCountries(
  ctx: CatalogContext,
): Promise<ApiResponse<CountryOption[]>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/catalog/offers/search?page=0&size=200&include=shipping,metadata,sku_metadata,collections`,
    { method: "POST", body: JSON.stringify({}) },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const parsed = violetPaginatedOffersSchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      data: null,
      error: { code: "VIOLET.VALIDATION_ERROR", message: parsed.error.message },
    };
  }

  const offers = parsed.data.content;
  if (offers.length === 0) {
    return { data: [], error: null };
  }

  return { data: aggregateCountries(offers), error: null };
}

/**
 * Fetch paginated products for a specific merchant.
 *
 * GET /catalog/offers/merchants/{id}?page=&size=&include=shipping,metadata,sku_metadata,collections
 *
 * Used for the merchant page to display all products from a single merchant.
 * Supports contextual pricing via `base_currency` query param.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offers-for-a-merchant
 */
export async function getProductsByMerchant(
  ctx: CatalogContext,
  merchantId: string,
  params: ProductQuery,
  countryCode?: string,
): Promise<ApiResponse<PaginatedResult<Product>>> {
  const page = params.page ?? 1;
  const size = params.pageSize ?? 20;
  const baseCurrency = countryCode ? getCurrencyForCountry(countryCode) : undefined;
  const currencyQs = baseCurrency && baseCurrency !== "USD" ? `&base_currency=${baseCurrency}` : "";

  const url =
    `${ctx.apiBase}/catalog/offers/merchants/${merchantId}?page=${page}&size=${size}` +
    `&include=shipping,metadata,sku_metadata,collections${currencyQs}`;

  const result = await fetchWithRetry(url, { method: "GET" }, ctx.tokenManager);
  if (result.error) return { data: null, error: result.error };

  const parsed = violetPaginatedOffersSchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      data: null,
      error: { code: "VIOLET.VALIDATION_ERROR", message: parsed.error.message },
    };
  }

  const rawPage = parsed.data;
  const products = rawPage.content.map((offer) => transformOffer(offer, countryCode));

  return {
    data: {
      data: products,
      total: rawPage.total_elements,
      page,
      pageSize: size,
      hasNext: !rawPage.last,
    },
    error: null,
  };
}
