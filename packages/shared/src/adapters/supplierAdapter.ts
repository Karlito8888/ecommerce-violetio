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
  Transfer,
  SearchTransfersInput,
  CategoryItem,
  CollectionItem,
  DiscountInput,
  VioletPayoutAccount,
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

  /**
   * Fetches the latest currency exchange rates from Violet.
   *
   * Calls `GET /catalog/currencies/latest` with `base_currency=USD`.
   * Results are cached for 12 hours (Violet caches for max 24h).
   *
   * Used by `setLiveExchangeRates()` to populate `convertPrice()` with live rates
   * instead of the hardcodED fallback rates.
   *
   * @returns Map of currency code → exchange rate (e.g., { EUR: 0.92, GBP: 0.79 })
   *          or null if unavailable
   *
   * @see https://docs.violet.io/api-reference/catalog/currencies/currency-exchange-rates
   */
  getExchangeRates(): Promise<ApiResponse<{ rates: Record<string, number>; date: string } | null>>;

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

  /** Search Violet transfers with optional filters. */
  searchTransfers(input?: SearchTransfersInput): Promise<ApiResponse<Transfer[]>>;

  /**
   * Search distributions across all orders with filters.
   *
   * Calls `POST /payments/DEVELOPER/{app_id}/distributions/search`.
   * Returns paginated results matching the search criteria.
   *
   * @see https://docs.violet.io/api-reference/payments/distributions/search-distributions
   */
  searchDistributions(
    input?: import("../types/distribution.types.js").SearchDistributionsInput,
    page?: number,
    pageSize?: number,
  ): Promise<ApiResponse<import("../types/distribution.types.js").PaginatedDistributions>>;

  /** Retry failed transfer for a single order. */
  retryTransferForOrder(violetOrderId: string): Promise<ApiResponse<{ message: string }>>;

  /** Retry failed transfer for a single bag. */
  retryTransferForBag(violetBagId: string): Promise<ApiResponse<{ message: string }>>;

  /** Retry failed transfers for multiple orders. */
  retryTransfersForOrders(violetOrderIds: string[]): Promise<ApiResponse<{ message: string }>>;

  /** Retry failed transfers for multiple bags. */
  retryTransfersForBags(violetBagIds: string[]): Promise<ApiResponse<{ message: string }>>;

  /**
   * Get pending transfers aggregated by merchant.
   *
   * Calls `GET /payments/transfers/pending` — returns all transfers in PENDING status.
   * Each entry represents a merchant with funds waiting to be transferred,
   * including payout account details.
   *
   * Useful for proactive monitoring — transfers stuck in PENDING may indicate
   * Stripe/Violet issues.
   *
   * @see https://docs.violet.io/api-reference/payments/transfers/get-pending-transfers
   */
  getPendingTransfers(
    input?: import("../types/transfer.types.js").GetPendingTransfersInput,
  ): Promise<ApiResponse<import("../types/transfer.types.js").PendingTransferSummary[]>>;

  /**
   * Get a single transfer by its Violet Transfer ID.
   *
   * Calls `GET /payments/transfers/{transfer_id}` — returns the full transfer detail
   * including payout references, transfer mechanism, effective related entity IDs,
   * and reversal IDs.
   *
   * Useful for manual refresh of a specific transfer's status.
   *
   * @see https://docs.violet.io/api-reference/payments/transfers/get-transfer-by-id
   */
  getTransfer(
    transferId: string,
  ): Promise<ApiResponse<import("../types/transfer.types.js").TransferDetail>>;

  /**
   * Get a transfer by its payment provider (Stripe) transfer ID.
   *
   * Calls `GET /payments/transfers/external/{external_transfer_id}`.
   * Useful for reconciliation — matching Stripe Dashboard transfers to Violet orders.
   *
   * @see https://docs.violet.io/api-reference/payments/transfers/get-transfer-by-payment-provider-transfer-id
   */
  getTransferByProviderId(
    providerTransferId: string,
  ): Promise<ApiResponse<import("../types/transfer.types.js").TransferDetail>>;

  getOrders(userId: string): Promise<ApiResponse<Order[]>>;

  // Payout Accounts

  /**
   * Fetches the active Payout Account for a merchant.
   *
   * Calls `GET /payments/MERCHANT/{merchant_id}/payout_account?extended=true`.
   * Returns the currently active PPA with full Stripe Connect details.
   * Only one PPA may be active at a time per merchant-app pair.
   *
   * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account
   */
  getActivePayoutAccount(
    merchantId: string,
    appId?: string,
  ): Promise<ApiResponse<VioletPayoutAccount | null>>;

  /**
   * Fetches all Payout Accounts for a merchant (including inactive history).
   *
   * Calls `GET /payments/MERCHANT/{merchant_id}/payout_accounts?extended=true`.
   * Returns all PPAs with full Stripe Connect details.
   *
   * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-accounts
   */
  getAllPayoutAccounts(
    merchantId: string,
    appId?: string,
  ): Promise<ApiResponse<VioletPayoutAccount[]>>;

  /**
   * Fetches a Payout Account by its Violet ID.
   *
   * Calls `GET /payments/payout_accounts/{payout_account_id}?extended=true`.
   * Useful for fetching a specific PPA when the ID is known from a webhook.
   *
   * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account-by-id
   */
  getPayoutAccountById(payoutAccountId: string): Promise<ApiResponse<VioletPayoutAccount | null>>;

  // Merchant Management

  /**
   * Set the commission rate for a merchant's app install.
   *
   * Calls `PUT /apps/{app_id}/merchants/{merchant_id}/commission_rate`.
   * The commission rate is a percentage (0–50 for channels). When locked,
   * the merchant cannot override it.
   *
   * Returns the updated AppInstall record.
   *
   * @see https://docs.violet.io/api-reference/apps/commission-rates/set-merchant-app-commission-rate
   */
  setCommissionRate(
    input: import("../types/admin.types.js").SetCommissionRateInput,
  ): Promise<ApiResponse<import("../types/admin.types.js").AppInstall>>;

  // Webhooks
  validateWebhook(headers: Headers, body: string): boolean;
  processWebhook(event: WebhookEvent): Promise<ApiResponse<void>>;
}
