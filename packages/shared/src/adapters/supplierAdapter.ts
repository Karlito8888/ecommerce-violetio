import type {
  Product,
  ProductQuery,
  PaginatedResult,
  Cart,
  CartItemInput,
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
  getProducts(params: ProductQuery): Promise<PaginatedResult<Product>>;
  getProduct(id: string): Promise<Product>;

  // Search (AI)
  searchProducts(query: string, filters?: SearchFilters): Promise<SearchResult>;

  // Cart
  createCart(userId: string): Promise<Cart>;
  addToCart(cartId: string, item: CartItemInput): Promise<Cart>;
  removeFromCart(cartId: string, itemId: string): Promise<Cart>;

  // Checkout
  getPaymentIntent(cartId: string): Promise<PaymentIntent>;
  submitOrder(cartId: string): Promise<Order>;

  // Orders
  getOrder(orderId: string): Promise<Order>;
  getOrders(userId: string): Promise<Order[]>;

  // Webhooks
  validateWebhook(headers: Headers, body: string): boolean;
  processWebhook(event: WebhookEvent): Promise<void>;
}
