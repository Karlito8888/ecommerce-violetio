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

  // Checkout
  getPaymentIntent(cartId: string): Promise<ApiResponse<PaymentIntent>>;
  submitOrder(cartId: string): Promise<ApiResponse<Order>>;

  // Orders
  getOrder(orderId: string): Promise<ApiResponse<Order>>;
  getOrders(userId: string): Promise<ApiResponse<Order[]>>;

  // Webhooks
  validateWebhook(headers: Headers, body: string): boolean;
  processWebhook(event: WebhookEvent): Promise<ApiResponse<void>>;
}
