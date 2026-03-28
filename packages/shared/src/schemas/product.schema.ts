import { z } from "zod/v4";

/**
 * Zod schemas for validating raw Violet API responses (snake_case).
 *
 * These schemas validate the data BEFORE transformation to camelCase.
 * Any Violet API response that doesn't match these schemas will produce
 * a VIOLET.VALIDATION_ERROR instead of silently corrupting data.
 *
 * ## CRITICAL: Violet null-exclusion behavior
 *
 * Violet.io **excludes null-valued properties from API responses** by default.
 * This means a field like `html_description: null` may simply be ABSENT from
 * the JSON response, not present with a `null` value.
 *
 * **Consequence:** Any field that could logically be null MUST be marked
 * `.optional()` in addition to `.nullable()`, so Zod accepts both:
 *   - `{ html_description: null }` (field present, value null)
 *   - `{}` (field absent entirely)
 *
 * Fields that are always present (id, name, etc.) remain required.
 * Fields with sensible defaults use `.optional().default(...)`.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers
 * @see https://github.com/violetio/open-api.git — authoritative OpenAPI spec
 */

/** Schema for a single media item in a Violet album. */
export const violetMediaSchema = z.object({
  id: z.number(),
  url: z.string(),
  /**
   * Original source URL before Violet CDN processing.
   * May be absent if the source platform doesn't provide it.
   */
  source_url: z.string().optional().default(""),
  type: z.literal("IMAGE"),
  display_order: z.number().optional().default(0),
  primary: z.boolean().optional().default(false),
});

/** Schema for a Violet album (collection of media). */
export const violetAlbumSchema = z.object({
  id: z.number(),
  type: z.enum(["OFFER", "SKU"]),
  name: z.string().optional().default(""),
  media: z.array(violetMediaSchema).optional().default([]),
  /**
   * Primary media is nullable (no primary designated) and may also be
   * absent entirely due to Violet's null-exclusion behavior.
   */
  primary_media: violetMediaSchema.nullable().optional().default(null),
});

/**
 * Schema for variant values on a SKU.
 *
 * ## Field name ambiguity: `variant` vs `name`
 *
 * Our story spec and Violet SDK examples use `{ variant, value }`,
 * but the official Violet.io HTML docs show `{ name, value }`.
 * The OpenAPI spec (github.com/violetio/open-api.git) is the authoritative
 * source, but both field names have been observed in different API versions.
 *
 * **Decision:** Accept BOTH field names for forward compatibility.
 * The adapter transform normalizes to `{ variant, value }` internally,
 * falling back to `name` if `variant` is absent.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers — shows `{name, value}`
 */
export const violetVariantValueSchema = z
  .object({
    value: z.string(),
    variant: z.string().optional(),
    name: z.string().optional(),
  })
  .refine((d) => d.variant !== undefined || d.name !== undefined, {
    message: "Either 'variant' or 'name' must be present in variant_values",
  });

/**
 * Schema for variant definitions on an offer (option dimensions like "Size", "Color").
 *
 * ## Two response formats from Violet
 *
 * - **Search endpoint** (`POST /catalog/offers/search`): returns `values` as `string[]`
 *   e.g., `{ name: "Size", values: ["S", "M", "L"] }`
 *
 * - **Merchant endpoint** (`GET /catalog/offers/merchants/{id}`): returns `values` as
 *   objects with `{ id, name, external_id, sku_ids, display_order }`
 *   e.g., `{ name: "Size", values: [{ name: "S", ... }, { name: "M", ... }] }`
 *
 * We accept both via a union and normalize objects to their `name` field.
 */
const violetVariantValueItemSchema = z.union([
  z.string(),
  z.object({ name: z.string() }).passthrough(),
]);

export const violetVariantSchema = z
  .object({
    name: z.string(),
    values: z.array(violetVariantValueItemSchema).optional().default([]),
  })
  .transform((v) => ({
    name: v.name,
    values: v.values.map((val) => (typeof val === "string" ? val : val.name)),
  }));

/** Schema for SKU dimensions (weight/shipping info). */
export const violetSkuDimensionsSchema = z.object({
  weight: z.number(),
  type: z.string(),
});

/**
 * Schema for a Violet SKU response. Validates all fields before transformation.
 *
 * Optional fields use `.optional().default(...)` to handle Violet's null-exclusion.
 * Prices default to 0 (not absent in practice, but defensive).
 */
export const violetSkuSchema = z.object({
  id: z.number(),
  offer_id: z.number(),
  merchant_id: z.number(),
  name: z.string().optional().default(""),
  in_stock: z.boolean().optional().default(false),
  qty_available: z.number().optional().default(0),
  sale_price: z.number().optional().default(0),
  retail_price: z.number().optional().default(0),
  currency: z.string().optional().default("USD"),
  taxable: z.boolean().optional().default(false),
  type: z.enum(["PHYSICAL", "DIGITAL", "VIRTUAL", "BUNDLED"]).optional().default("PHYSICAL"),
  status: z.string().optional().default("AVAILABLE"),
  variant_values: z.array(violetVariantValueSchema).optional().default([]),
  /** Nullable AND optional: may be `null`, or absent entirely. */
  sku_dimensions: violetSkuDimensionsSchema.nullable().optional().default(null),
  albums: z.array(violetAlbumSchema).optional().default([]),
  date_created: z.string().optional().default(""),
  date_last_modified: z.string().optional().default(""),
});

/**
 * Schema for a Violet Offer response. Validates all fields before transformation.
 *
 * ## Field optionality strategy
 *
 * - **Always present** (required): `id`, `name`, `merchant_id` — core identifiers
 * - **Usually present** but defensively optional: prices, booleans, enums
 * - **Nullable AND optional**: `html_description`, `primary_media`
 * - **Collections**: arrays default to `[]` when absent
 *
 * ## OfferStatus enum
 *
 * The Violet HTML docs list: AVAILABLE, DISABLED, ARCHIVED, FOR_DELETION.
 * However, actual API responses also return compound statuses like
 * UNAVAILABLE, DISABLED_AVAILABLE, DISABLED_UNAVAILABLE. We accept all
 * known values plus a `.catch()` fallback for unknown future statuses.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers
 */
export const violetOfferSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional().default(""),
  /** Nullable: not all products have HTML descriptions. Optional: Violet null-exclusion. */
  html_description: z.string().nullable().optional().default(null),
  /** Lowest SKU price in cents. Defaults to 0 if absent. */
  min_price: z.number().optional().default(0),
  /** Highest SKU price in cents. Defaults to 0 if absent. */
  max_price: z.number().optional().default(0),
  currency: z.string().optional().default("USD"),
  available: z.boolean().optional().default(false),
  visible: z.boolean().optional().default(true),
  /**
   * Offer status. The official docs list AVAILABLE | DISABLED | ARCHIVED | FOR_DELETION,
   * but real responses also include UNAVAILABLE, DISABLED_AVAILABLE, DISABLED_UNAVAILABLE.
   * We use a string fallback to avoid breaking on unknown statuses.
   */
  status: z.string().optional().default("AVAILABLE"),
  publishing_status: z.string().optional().default("NOT_PUBLISHED"),
  source: z.string().optional().default(""),
  seller: z.string().optional().default(""),
  vendor: z.string().optional().default(""),
  type: z.enum(["PHYSICAL", "DIGITAL"]).optional().default("PHYSICAL"),
  external_url: z.string().optional().default(""),
  merchant_id: z.number(),
  product_id: z.string().optional().default(""),
  commission_rate: z.number().optional().default(0),
  tags: z.array(z.string()).optional().default([]),
  date_created: z.string().optional().default(""),
  date_last_modified: z.string().optional().default(""),
  variants: z.array(violetVariantSchema).optional().default([]),
  skus: z.array(violetSkuSchema).optional().default([]),
  albums: z.array(violetAlbumSchema).optional().default([]),
  /**
   * Shipping zone data, present when `?include=shipping` is passed to Violet API.
   * Only populated for Shopify merchants. Absent or null for other sources.
   */
  shipping: z
    .object({
      shipping_zones: z
        .array(
          z.object({
            country_code: z.string(),
            country_name: z.string().optional().default(""),
          }),
        )
        .optional()
        .default([]),
    })
    .nullable()
    .optional()
    .default(null),
});

/**
 * Schema for the Violet paginated response wrapper. Generic over content type.
 *
 * ## Pagination model
 *
 * Violet uses Spring Boot's `Page<T>` under the hood. The `number` field
 * represents the current page index.
 *
 * **Ambiguity:** The Violet docs state `page` query param defaults to 1 (1-based),
 * but Spring Boot `Pageable` is typically 0-based. Our adapter sends `page - 1`
 * (converting internal 1-based to Violet 0-based) and transforms back with `+1`.
 * This has been verified to work correctly in practice.
 *
 * @see https://docs.violet.io/concepts/pagination
 */
export function violetPaginatedResponseSchema<T extends z.ZodType>(contentSchema: T) {
  return z.object({
    content: z.array(contentSchema),
    total_elements: z.number(),
    total_pages: z.number(),
    number: z.number(),
    size: z.number(),
    number_of_elements: z.number(),
    first: z.boolean(),
    last: z.boolean(),
    empty: z.boolean(),
  });
}

/** Pre-built schema for paginated offer responses. */
export const violetPaginatedOffersSchema = violetPaginatedResponseSchema(violetOfferSchema);
