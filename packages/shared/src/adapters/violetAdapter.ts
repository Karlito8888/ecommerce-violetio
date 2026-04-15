import type {
  ApiResponse,
  PaginatedResult,
  Product,
  ProductQuery,
  Cart,
  CartItemInput,
  CategoryItem,
  CreateCartInput,
  CustomerInput,
  PaymentIntent,
  Order,
  OrderDetail,
  OrderSubmitResult,
  WebhookEvent,
  SearchResult,
  SearchFilters,
  ShippingAddressInput,
  ShippingMethodsAvailable,
  SetShippingMethodInput,
  CountryOption,
  Distribution,
  Transfer,
  SearchTransfersInput,
  CollectionItem,
  DiscountInput,
} from "../types/index.js";
import type { SupplierAdapter } from "./supplierAdapter.js";
import { VioletTokenManager } from "../clients/violetAuth.js";
import { VIOLET_API_BASE } from "../utils/constants.js";

// Re-export constants and test utilities that external consumers import from this module
export { _resetCategoriesCache } from "./violetConstants.js";

import {
  getProducts as getProductsFn,
  getProduct as getProductFn,
  getAvailableCountries as getAvailableCountriesFn,
} from "./violetCatalog.js";
import type { CatalogContext } from "./violetCatalog.js";
import { getCategories as getCategoriesFn } from "./violetCategories.js";
import {
  setShippingAddress as setShippingAddressFn,
  getAvailableShippingMethods as getAvailableShippingMethodsFn,
  setShippingMethods as setShippingMethodsFn,
  priceCart as priceCartFn,
} from "./violetShipping.js";
import {
  setCustomer as setCustomerFn,
  setBillingAddress as setBillingAddressFn,
  addDiscount as addDiscountFn,
  removeDiscount as removeDiscountFn,
  getPaymentIntent as getPaymentIntentFn,
  submitOrder as submitOrderFn,
} from "./violetCheckout.js";
import {
  getCollections as getCollectionsFn,
  getCollectionOffers as getCollectionOffersFn,
  getCollectionOfferIds as getCollectionOfferIdsFn,
  enableCollectionSync as enableCollectionSyncFn,
  enableMetadataSync as enableMetadataSyncFn,
  enableSkuMetadataSync as enableSkuMetadataSyncFn,
  enableContextualPricing as enableContextualPricingFn,
} from "./violetCollections.js";
import type { CollectionsCacheState } from "./violetCollections.js";
import {
  getOrder as getOrderFn,
  getOrderDistributions as getOrderDistributionsFn,
  getOrders as getOrdersFn,
} from "./violetOrders.js";
import {
  searchTransfers as searchTransfersFn,
  retryTransferForOrder as retryTransferForOrderFn,
  retryTransferForBag as retryTransferForBagFn,
  retryTransfersForOrders as retryTransfersForOrdersFn,
  retryTransfersForBags as retryTransfersForBagsFn,
} from "./violetTransfers.js";
import { searchProducts as searchProductsFn } from "./violetSearch.js";
import {
  validateWebhook as validateWebhookFn,
  processWebhook as processWebhookFn,
} from "./violetWebhook.js";
import {
  createCart as createCartFn,
  addToCart as addToCartFn,
  updateCartItem as updateCartItemFn,
  removeFromCart as removeFromCartFn,
  getCart as getCartFn,
} from "./violetCart.js";

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

  private getCtx(): CatalogContext {
    return { apiBase: this.apiBase, tokenManager: this.tokenManager };
  }

  async getProducts(
    params: ProductQuery,
    countryCode?: string,
  ): Promise<ApiResponse<PaginatedResult<Product>>> {
    return getProductsFn(this.getCtx(), params, countryCode);
  }

  async getProduct(id: string, countryCode?: string): Promise<ApiResponse<Product>> {
    return getProductFn(this.getCtx(), id, countryCode);
  }

  async getAvailableCountries(): Promise<ApiResponse<CountryOption[]>> {
    return getAvailableCountriesFn(this.getCtx());
  }

  // ─── Categories ──────────────────────────────────────────────────

  async getCategories(): Promise<ApiResponse<CategoryItem[]>> {
    return getCategoriesFn(this.getCtx());
  }

  // ─── Transformation (snake_case → camelCase) ──────────────────────
  // Transformations are delegated to ./violetTransforms.js standalone functions.

  // ─── HTTP with retry ──────────────────────────────────────────────
  // fetchWithRetry is delegated to ./violetFetch.js standalone function.

  // ─── Shipping (Story 4.3) ──────────────────────────────────────────

  async setShippingAddress(
    violetCartId: string,
    address: ShippingAddressInput,
  ): Promise<ApiResponse<void>> {
    return setShippingAddressFn(this.getCtx(), violetCartId, address);
  }

  async getAvailableShippingMethods(
    violetCartId: string,
  ): Promise<ApiResponse<ShippingMethodsAvailable[]>> {
    return getAvailableShippingMethodsFn(this.getCtx(), violetCartId);
  }

  async setShippingMethods(
    violetCartId: string,
    selections: SetShippingMethodInput[],
  ): Promise<ApiResponse<Cart>> {
    return setShippingMethodsFn(this.getCtx(), violetCartId, selections);
  }

  async priceCart(violetCartId: string): Promise<ApiResponse<Cart>> {
    return priceCartFn(this.getCtx(), violetCartId);
  }

  // ─── Checkout — Customer & Billing (Story 4.4) ───────────────────

  async setCustomer(violetCartId: string, customer: CustomerInput): Promise<ApiResponse<void>> {
    return setCustomerFn(this.getCtx(), violetCartId, customer);
  }

  async setBillingAddress(
    violetCartId: string,
    address: ShippingAddressInput,
  ): Promise<ApiResponse<void>> {
    return setBillingAddressFn(this.getCtx(), violetCartId, address);
  }

  // ─── Checkout — Discounts ───────────────────────────────────────────

  async addDiscount(violetCartId: string, input: DiscountInput): Promise<ApiResponse<Cart>> {
    return addDiscountFn(this.getCtx(), violetCartId, input);
  }

  async removeDiscount(violetCartId: string, discountId: string): Promise<ApiResponse<Cart>> {
    return removeDiscountFn(this.getCtx(), violetCartId, discountId);
  }

  // ─── Checkout — Payment (Story 4.4) ─────────────────────────────

  async getPaymentIntent(violetCartId: string): Promise<ApiResponse<PaymentIntent>> {
    return getPaymentIntentFn(this.getCtx(), violetCartId);
  }

  async submitOrder(
    violetCartId: string,
    appOrderId: string,
    orderCustomer?: import("../types/order.types.js").OrderSubmitInput["orderCustomer"],
  ): Promise<ApiResponse<OrderSubmitResult>> {
    return submitOrderFn(this.getCtx(), violetCartId, appOrderId, orderCustomer);
  }

  // ─── Collections (sync_collections feature) ────────────────────────

  private _collectionsCache: CollectionsCacheState | null = null;

  private setCollectionsCache(cache: CollectionsCacheState | null): void {
    this._collectionsCache = cache;
  }

  async getCollections(merchantId?: string): Promise<ApiResponse<CollectionItem[]>> {
    return getCollectionsFn(this.getCtx(), merchantId, this._collectionsCache, (c) =>
      this.setCollectionsCache(c),
    );
  }

  async getCollectionOffers(
    collectionId: string,
    page = 1,
    pageSize = 24,
    countryCode?: string,
  ): Promise<ApiResponse<PaginatedResult<Product>>> {
    return getCollectionOffersFn(this.getCtx(), collectionId, page, pageSize, countryCode);
  }

  async getCollectionOfferIds(
    collectionId: string,
    page = 1,
    pageSize = 50,
  ): Promise<ApiResponse<PaginatedResult<string>>> {
    return getCollectionOfferIdsFn(this.getCtx(), collectionId, page, pageSize);
  }

  async enableCollectionSync(merchantId: string): Promise<ApiResponse<void>> {
    return enableCollectionSyncFn(this.getCtx(), merchantId);
  }

  async enableMetadataSync(merchantId: string): Promise<ApiResponse<void>> {
    return enableMetadataSyncFn(this.getCtx(), merchantId);
  }

  async enableSkuMetadataSync(merchantId: string): Promise<ApiResponse<void>> {
    return enableSkuMetadataSyncFn(this.getCtx(), merchantId);
  }

  async enableContextualPricing(merchantId: string): Promise<ApiResponse<void>> {
    return enableContextualPricingFn(this.getCtx(), merchantId);
  }

  // ─── Not implemented (future stories) ─────────────────────────────

  async searchProducts(
    query: string,
    _filters?: SearchFilters,
  ): Promise<ApiResponse<SearchResult>> {
    return searchProductsFn(query, _filters);
  }

  // ─── Cart ─────────────────────────────────────────────────────────

  async createCart(_input: CreateCartInput): Promise<ApiResponse<Cart>> {
    return createCartFn(this.getCtx(), _input);
  }

  async addToCart(violetCartId: string, item: CartItemInput): Promise<ApiResponse<Cart>> {
    return addToCartFn(this.getCtx(), violetCartId, item);
  }

  async updateCartItem(
    violetCartId: string,
    orderSkuId: string,
    quantity: number,
  ): Promise<ApiResponse<Cart>> {
    return updateCartItemFn(this.getCtx(), violetCartId, orderSkuId, quantity);
  }

  async removeFromCart(violetCartId: string, orderSkuId: string): Promise<ApiResponse<Cart>> {
    return removeFromCartFn(this.getCtx(), violetCartId, orderSkuId);
  }

  async getCart(violetCartId: string): Promise<ApiResponse<Cart>> {
    return getCartFn(this.getCtx(), violetCartId);
  }

  // ─── Cart transforms ────────────────────────────────────────────
  // parseAndTransformCart, transformBag, transformCartSku, getAppId
  // are delegated to ./violetCartTransforms.js standalone functions.

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
    return getOrderFn(this.getCtx(), orderId);
  }

  async getOrderDistributions(violetOrderId: string): Promise<ApiResponse<Distribution[]>> {
    return getOrderDistributionsFn(this.getCtx(), violetOrderId);
  }

  async searchTransfers(input?: SearchTransfersInput): Promise<ApiResponse<Transfer[]>> {
    return searchTransfersFn(this.getCtx(), input);
  }

  async retryTransferForOrder(violetOrderId: string): Promise<ApiResponse<{ message: string }>> {
    return retryTransferForOrderFn(this.getCtx(), violetOrderId);
  }

  async retryTransferForBag(violetBagId: string): Promise<ApiResponse<{ message: string }>> {
    return retryTransferForBagFn(this.getCtx(), violetBagId);
  }

  async retryTransfersForOrders(
    violetOrderIds: string[],
  ): Promise<ApiResponse<{ message: string }>> {
    return retryTransfersForOrdersFn(this.getCtx(), violetOrderIds);
  }

  async retryTransfersForBags(violetBagIds: string[]): Promise<ApiResponse<{ message: string }>> {
    return retryTransfersForBagsFn(this.getCtx(), violetBagIds);
  }

  async getOrders(_userId: string): Promise<ApiResponse<Order[]>> {
    return getOrdersFn(this.getCtx(), _userId);
  }

  validateWebhook(headers: Headers, _body: string): boolean {
    return validateWebhookFn(headers, _body);
  }

  async processWebhook(_event: WebhookEvent): Promise<ApiResponse<void>> {
    return processWebhookFn(_event);
  }
}
