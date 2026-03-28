/** Configuration required to authenticate with the Violet API. */
export interface VioletAuthConfig {
  appId: string;
  appSecret: string;
  username: string;
  password: string;
  apiBase: string;
}

/** Internal token state managed by VioletTokenManager. */
export interface VioletTokenData {
  token: string;
  refreshToken: string;
  /** Timestamp (ms) when the token was obtained — used to calculate expiry. */
  loginTimestamp: number;
}

/** Shape of the Violet POST /login response body. */
export interface VioletLoginResponse {
  id: string;
  email: string;
  token: string;
  refresh_token: string;
  type: string;
  verified: boolean;
  status: string;
  roles: string[];
}

/** Headers required on every authenticated Violet API call. */
export interface VioletAuthHeaders {
  "X-Violet-Token": string;
  "X-Violet-App-Id": string;
  "X-Violet-App-Secret": string;
}

// ─── Violet Raw API Response Types (snake_case) ────────────────────────

/** Raw media item from Violet API response. */
export interface VioletMediaResponse {
  id: number;
  url: string;
  /**
   * Original source URL. May be absent from the response due to
   * Violet's null-exclusion behavior (null fields are omitted from JSON).
   */
  source_url?: string;
  type: "IMAGE";
  display_order?: number;
  primary?: boolean;
}

/** Raw album from Violet API response. */
export interface VioletAlbumResponse {
  id: number;
  type: "OFFER" | "SKU";
  name?: string;
  media: VioletMediaResponse[];
  /**
   * Nullable (no primary designated) AND optional (Violet excludes null fields).
   */
  primary_media?: VioletMediaResponse | null;
}

/**
 * Raw variant value from Violet SKU response.
 *
 * ## Field name discrepancy: `variant` vs `name`
 *
 * The Violet HTML docs show `{ name, value }` but SDK examples and some API
 * versions return `{ variant, value }`. We accept BOTH for forward compatibility.
 * The adapter normalizes to our internal `{ variant, value }` format.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers — shows `{name, value}`
 * @see https://github.com/violetio/open-api.git — authoritative OpenAPI spec
 */
export interface VioletVariantValueResponse {
  /** Variant dimension name. Present in some API versions. */
  variant?: string;
  /** Variant dimension name. Present in the documented API shape. */
  name?: string;
  value: string;
}

/** Raw variant from Violet Offer response. */
export interface VioletVariantResponse {
  name: string;
  values?: string[];
}

/** Raw SKU dimensions from Violet API. */
export interface VioletSkuDimensionsResponse {
  weight: number;
  type: string;
}

/**
 * Raw SKU from Violet API response (snake_case fields).
 *
 * Optional fields (`?`) reflect Violet's null-exclusion behavior:
 * null-valued properties are omitted from the JSON response entirely.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers
 */
export interface VioletSkuResponse {
  id: number;
  offer_id: number;
  merchant_id: number;
  name?: string;
  in_stock?: boolean;
  qty_available?: number;
  sale_price?: number;
  retail_price?: number;
  currency?: string;
  taxable?: boolean;
  type?: "PHYSICAL" | "DIGITAL" | "VIRTUAL" | "BUNDLED";
  status?: string;
  variant_values?: VioletVariantValueResponse[];
  sku_dimensions?: VioletSkuDimensionsResponse | null;
  albums?: VioletAlbumResponse[];
  date_created?: string;
  date_last_modified?: string;
}

/**
 * Raw Offer from Violet API response (snake_case fields).
 *
 * ## Field presence guarantees
 *
 * Only `id`, `name`, and `merchant_id` are guaranteed present.
 * All other fields use `?` to handle Violet's null-exclusion behavior
 * (null-valued properties are omitted from responses).
 *
 * ## OfferStatus values
 *
 * Docs list: AVAILABLE | DISABLED | ARCHIVED | FOR_DELETION
 * Observed: also UNAVAILABLE | DISABLED_AVAILABLE | DISABLED_UNAVAILABLE
 * We use `string` for status to avoid breaking on unknown values.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers
 */
export interface VioletOfferResponse {
  id: number;
  name: string;
  description?: string;
  html_description?: string | null;
  min_price?: number;
  max_price?: number;
  currency?: string;
  available?: boolean;
  visible?: boolean;
  status?: string;
  publishing_status?: string;
  source?: string;
  seller?: string;
  vendor?: string;
  type?: "PHYSICAL" | "DIGITAL";
  external_url?: string;
  merchant_id: number;
  product_id?: string;
  commission_rate?: number;
  tags?: string[];
  date_created?: string;
  date_last_modified?: string;
  variants?: VioletVariantResponse[];
  skus?: VioletSkuResponse[];
  albums?: VioletAlbumResponse[];
  /** Shipping zone data, present when `?include=shipping` is used. Shopify merchants only. */
  shipping?: {
    shipping_zones?: Array<{ country_code: string; country_name: string }>;
  } | null;
}

/**
 * Raw paginated response wrapper from Violet API.
 *
 * ## Pagination indexing
 *
 * Violet uses Spring Boot's `Page<T>`. The `number` field is the page index.
 * Despite docs stating `page` defaults to 1, Spring Boot Pageable is 0-based.
 * Our adapter converts: internal 1-based → Violet 0-based (outgoing),
 * and Violet 0-based → internal 1-based (incoming via `number + 1`).
 *
 * @see https://docs.violet.io/concepts/pagination
 */
export interface VioletPaginatedResponse<T> {
  content: T[];
  total_elements: number;
  total_pages: number;
  /** Current page index — 0-based from Violet (Spring Boot Pageable). */
  number: number;
  size: number;
  number_of_elements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}
