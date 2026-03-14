import type {
  ApiResponse,
  Product,
  ProductQuery,
  PaginatedResult,
  Cart,
  CartItemInput,
  CreateCartInput,
  PaymentIntent,
  Order,
  WebhookEvent,
  SearchResult,
  SearchFilters,
  ShippingAddressInput,
  ShippingMethodsAvailable,
  SetShippingMethodInput,
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
  getProducts(params: ProductQuery): Promise<ApiResponse<PaginatedResult<Product>>>;
  getProduct(id: string): Promise<ApiResponse<Product>>;

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

  // Checkout — Payment (Story 4.4)
  getPaymentIntent(cartId: string): Promise<ApiResponse<PaymentIntent>>;
  submitOrder(cartId: string): Promise<ApiResponse<Order>>;

  // Orders
  getOrder(orderId: string): Promise<ApiResponse<Order>>;
  getOrders(userId: string): Promise<ApiResponse<Order[]>>;

  // Webhooks
  validateWebhook(headers: Headers, body: string): boolean;
  processWebhook(event: WebhookEvent): Promise<ApiResponse<void>>;
}
