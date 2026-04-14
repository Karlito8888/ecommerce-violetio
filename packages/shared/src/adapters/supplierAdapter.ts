import type {
  ApiResponse,
  Product,
  ProductQuery,
  PaginatedResult,
  Cart,
  CartItemInput,
  CountryOption,
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
  Distribution,
  CategoryItem,
  CollectionItem,
  DiscountInput,
} from "../types/index.js";

/**
 * SupplierAdapter — the boundary between the application and any commerce supplier.
 *
 * This interface abstracts ALL supplier interactions. Current implementation: Violet.io.
 * Planned future implementations: firmly.ai, Google UCP.
 *
 * CRITICAL: Violet's snake_case JSON (e.g., retail_price, product_id) is transformed
 * to camelCase at this boundary ONLY. UI code must never see Violet field names.
 *
 * [Source: architecture.md#Adapter Pattern Contract]
 */
export interface SupplierAdapter {
  // Catalog
  getProducts(
    params: ProductQuery,
    countryCode?: string,
  ): Promise<ApiResponse<PaginatedResult<Product>>>;
  getProduct(id: string, countryCode?: string): Promise<ApiResponse<Product>>;
  getAvailableCountries(): Promise<ApiResponse<CountryOption[]>>;

  /**
   * Fetches product categories from the supplier.
   *
   * Returns top-level categories available for the configured merchant(s).
   * Used for navigation links and category filter chips.
   *
   * Each category includes:
   * - `slug`: URL-friendly key
   * - `label`: Display name
   * - `filter`: Value for filtering product searches (undefined = all products)
   *
   * @see https://docs.violet.io/api-reference/catalog/categories/get-categories
   */
  getCategories(): Promise<ApiResponse<CategoryItem[]>>;

  /**
   * Fetches product collections from the supplier.
   *
   * Collections are merchant-curated groups of offers (e.g., "Summer Sale",
   * "Best Sellers"). Types: CUSTOM (manual) and AUTOMATED (rule-based).
   * Requires `sync_collections` feature flag enabled per merchant.
   *
   * @see https://docs.violet.io/prism/catalog/collections
   */
  getCollections(merchantId?: string): Promise<ApiResponse<CollectionItem[]>>;

  /**
   * Fetches offers (products) belonging to a specific collection.
   *
   * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers
   */
  getCollectionOffers(
    collectionId: string,
    page?: number,
    pageSize?: number,
    countryCode?: string,
  ): Promise<ApiResponse<PaginatedResult<Product>>>;

  /**
   * Fetches only the offer IDs for a collection (lightweight).
   *
   * Uses `/offers/ids` instead of `/offers` — returns `content: int64[]`.
   *
   * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers-ids
   */
  getCollectionOfferIds(
    collectionId: string,
    page?: number,
    pageSize?: number,
  ): Promise<ApiResponse<PaginatedResult<string>>>;

  /**
   * Enables the `sync_collections` feature flag for a merchant.
   *
   * This triggers an immediate collection sync and subsequent daily re-syncs.
   * Required for receiving COLLECTION_* webhook events.
   *
   * @see https://docs.violet.io/api-reference/merchants/configuration/toggle-merchant-configuration-global-feature-flag
   */
  enableCollectionSync(merchantId: string): Promise<ApiResponse<void>>;

  /**
   * Enables `sync_metadata` feature flag for a merchant (Offer-level metadata).
   *
   * @see https://docs.violet.io/prism/catalog/metadata-syncing
   */
  enableMetadataSync(merchantId: string): Promise<ApiResponse<void>>;

  /**
   * Enables `sync_sku_metadata` feature flag for a merchant (SKU-level metadata).
   *
   * @see https://docs.violet.io/prism/catalog/metadata-syncing/sku-metadata
   */
  enableSkuMetadataSync(merchantId: string): Promise<ApiResponse<void>>;

  // Search (AI)
  searchProducts(query: string, filters?: SearchFilters): Promise<ApiResponse<SearchResult>>;

  // Cart
  createCart(input: CreateCartInput): Promise<ApiResponse<Cart>>;
  addToCart(violetCartId: string, item: CartItemInput): Promise<ApiResponse<Cart>>;
  updateCartItem(violetCartId: string, skuId: string, quantity: number): Promise<ApiResponse<Cart>>;
  removeFromCart(violetCartId: string, skuId: string): Promise<ApiResponse<Cart>>;
  getCart(violetCartId: string): Promise<ApiResponse<Cart>>;

  // Checkout — Shipping (Story 4.3)
  /**
   * Sets the shipping address for a cart.
   *
   * MUST be called before `getAvailableShippingMethods` — Violet requires an
   * address before it can query third-party carrier APIs for rates.
   *
   * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-address
   */
  setShippingAddress(
    violetCartId: string,
    address: ShippingAddressInput,
  ): Promise<ApiResponse<void>>;

  /**
   * Fetches available shipping methods for each merchant bag in the cart.
   *
   * This call is intentionally slow (2–5s) — it queries third-party carrier APIs
   * (USPS, FedEx, etc.) in real-time. Show a per-bag skeleton loader while pending.
   * Address must be set first via `setShippingAddress`.
   *
   * @see https://docs.violet.io/api-reference/checkout/cart/get-available-shipping-methods
   */
  getAvailableShippingMethods(
    violetCartId: string,
  ): Promise<ApiResponse<ShippingMethodsAvailable[]>>;

  /**
   * Applies the selected shipping method for each bag.
   *
   * Returns the full "priced cart" — the response includes updated `shipping_total`
   * per bag. Parse with `parseAndTransformCart()` to update the cart state.
   * One selection per bag is required (all bags must have a selection).
   *
   * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-methods
   */
  setShippingMethods(
    violetCartId: string,
    selections: SetShippingMethodInput[],
  ): Promise<ApiResponse<Cart>>;

  /**
   * Forces cart pricing via GET /checkout/cart/{id}/price.
   *
   * Call when `setShippingMethods` returns a cart with `tax_total === 0` on
   * any bag — Violet's docs state carts are not always priced automatically
   * after applying shipping methods.
   *
   * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-pricing/price-cart
   */
  priceCart(violetCartId: string): Promise<ApiResponse<Cart>>;

  // Checkout — Customer & Billing (Story 4.4)

  /**
   * Sets guest customer info on the cart (email, name, optional marketing consent).
   *
   * Must be called after shipping address is set. The customer info is required
   * before Violet will accept a `/submit` call.
   *
   * @see https://docs.violet.io/api-reference/checkout-cart/apply-guest-customer-to-cart
   */
  setCustomer(violetCartId: string, customer: CustomerInput): Promise<ApiResponse<void>>;

  /**
   * Sets a billing address different from the shipping address.
   *
   * Optional — if billing matches shipping, skip this call. Violet defaults
   * billing to shipping address when this is not explicitly set.
   *
   * @see https://docs.violet.io/api-reference/checkout-cart/set-billing-address
   */
  setBillingAddress(
    violetCartId: string,
    address: ShippingAddressInput,
  ): Promise<ApiResponse<void>>;

  // Checkout — Discounts

  /**
   * Applies a discount/promo code to a cart.
   *
   * Returns the full cart with discounts applied to the correct bags.
   * `merchantId` must match a merchant with SKUs in the cart.
   *
   * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
   */
  addDiscount(violetCartId: string, input: DiscountInput): Promise<ApiResponse<Cart>>;

  /**
   * Removes a discount from a cart.
   *
   * Returns the full cart without the removed discount.
   *
   * @see https://docs.violet.io/prism/checkout-guides/discounts/applying-discounts
   */
  removeDiscount(violetCartId: string, discountId: string): Promise<ApiResponse<Cart>>;

  // Checkout — Payment (Story 4.4)

  /**
   * Retrieves the Stripe PaymentIntent from the cart.
   *
   * Violet does not have a dedicated PaymentIntent endpoint — this performs a
   * GET /checkout/cart/{id} and extracts `payment_intent_client_secret`.
   * Only works for carts created with `wallet_based_checkout: true`.
   *
   * @see https://docs.violet.io/guides/checkout/payments
   */
  getPaymentIntent(violetCartId: string): Promise<ApiResponse<PaymentIntent>>;

  /**
   * Submits the order to Violet after Stripe payment authorization.
   *
   * Call `stripe.confirmPayment()` first (client-side), then this endpoint.
   * `appOrderId` provides idempotency for retries (e.g., after 3DS challenge).
   *
   * @see https://docs.violet.io/api-reference/checkout-cart/submit-cart
   */
  submitOrder(
    violetCartId: string,
    appOrderId: string,
    orderCustomer?: import("../types/order.types.js").OrderSubmitInput["orderCustomer"],
  ): Promise<ApiResponse<OrderSubmitResult>>;

  // Orders

  /**
   * Fetches complete order details by order ID.
   *
   * Used by the confirmation page to display order summary, items per merchant,
   * totals, and shipping info. Returns data from GET /orders/{id}.
   *
   * ## Why `OrderDetail` instead of `Order`
   * `OrderDetail` includes bags, items, customer, and addresses — everything
   * needed for the confirmation UI. The lighter `Order` type is for order lists.
   *
   * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-order-by-id
   */
  getOrder(orderId: string): Promise<ApiResponse<OrderDetail>>;

  /**
   * Fetches payment distributions for a Violet order.
   * Returns per-bag breakdown of channel commission, Stripe fees, and merchant payout.
   * No Violet webhook exists for distributions — must be fetched on-demand.
   */
  getOrderDistributions(violetOrderId: string): Promise<ApiResponse<Distribution[]>>;

  getOrders(userId: string): Promise<ApiResponse<Order[]>>;

  // Webhooks
  validateWebhook(headers: Headers, body: string): boolean;
  processWebhook(event: WebhookEvent): Promise<ApiResponse<void>>;
}
