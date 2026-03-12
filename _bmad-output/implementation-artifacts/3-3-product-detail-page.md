# Story 3.3: Product Detail Page (Web SSR + Mobile)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **visitor**,
I want to view a product detail page with hero image, transparent pricing, and essential info,
so that I can evaluate a product with all the information I need to decide.

## Acceptance Criteria

1. **Given** a visitor clicks on a product card from the listing
   **When** the product detail page loads
   **Then** web: `products/$productId.tsx` renders SSR with complete HTML for crawlers
   **And** mobile: `products/[productId].tsx` renders via Stack push navigation

2. **And** the page displays: hero image (dominant, gallery-style), product name (Cormorant Garamond H2), price (clear, no fake discounts), essential specs, internal review placeholder
   **And** the layout is two-column on desktop (image left, info right) and stacked on mobile

3. **And** an image gallery shows all product images with thumbnail navigation
   **And** web: images use `loading="lazy"` for below-fold images
   **And** mobile: Expo `<Image>` handles image loading

4. **And** transparent pricing shows the actual price with a full price breakdown (product + shipping estimate + tax estimate = total)
   **And** if `retailPrice > salePrice` on any SKU, the original price is shown struck through with sale price highlighted

5. **And** variant selectors are displayed for products with multiple SKUs (Size, Color, etc.)
   **And** selecting a variant updates the displayed price, availability, and image (if SKU has its own album)
   **And** unavailable variants are grayed out with `aria-disabled="true"`

6. **And** an "Add to Bag" button is the single primary CTA (disabled/placeholder — cart API is Story 4.1)
   **And** affiliate disclosure is displayed proximate to the CTA as a trust signal (FR11, FR51)
   **And** trust indicators show below pricing: "Secure checkout · Free returns · Verified merchant"

7. **And** if the product is unavailable (`available: false`), "Add to Bag" is replaced by "Notify When Available" (placeholder)
   **And** a "similar products" placeholder section is shown (pgvector integration in Story 3.5)

8. **And** web: dynamic `<title>`, `<meta description>`, Open Graph tags, and JSON-LD `Product` structured data are generated for SEO (FR35)
   **And** JSON-LD includes: name, description, image, price, availability, brand, merchant

9. **And** TanStack Query hook `useProduct(productId)` uses query key `['products', 'detail', productId]`
   **And** web: SSR prefetch via `queryClient.ensureQueryData()` in route loader
   **And** staleTime: 5 minutes (consistent with catalog data)

10. **And** 3 UI states handled: loading (product detail skeleton), error (ErrorMessage component), success (product detail)

## Tasks / Subtasks

- [x] Task 1: Create `getProductFn` Server Function (AC: 1, 9)
  - [x] 1.1 Create `apps/web/src/server/getProduct.ts` using `createServerFn({ method: "GET" })`
  - [x] 1.2 Accept `productId: string` via `inputValidator`
  - [x] 1.3 Call `createSupplierAdapter().getProduct(productId)` — return `ApiResponse<Product>`
  - [x] 1.4 Follow exact pattern from `getProducts.ts` (adapter factory, error handling)

- [x] Task 2: Create `productDetailQueryOptions` shared hook (AC: 9)
  - [x] 2.1 Add to `packages/shared/src/hooks/useProducts.ts` (same file as existing hooks)
  - [x] 2.2 Signature: `productDetailQueryOptions(productId: string, fetchFn: ProductDetailFetchFn)`
  - [x] 2.3 Use `queryOptions()` from TanStack Query v5 (NOT `infiniteQueryOptions`)
  - [x] 2.4 Query key: `queryKeys.products.detail(productId)` (already defined in constants.ts)
  - [x] 2.5 staleTime: 5 * 60 * 1000 (5 minutes)
  - [x] 2.6 Export `ProductDetailFetchFn` type: `(id: string) => Promise<ApiResponse<Product>>`
  - [x] 2.7 Export from barrel `packages/shared/src/hooks/index.ts`

- [x] Task 3: Create web product detail route with SSR (AC: 1, 9, 10)
  - [x] 3.1 Create `apps/web/src/routes/products/$productId.tsx` using `createFileRoute("/products/$productId")`
  - [x] 3.2 Route `loader`: access `context.queryClient`, call `queryClient.ensureQueryData(productDetailQueryOptions(productId, fetchProduct))`
  - [x] 3.3 Wrap `fetchProduct` to match `ProductDetailFetchFn`: `(id) => getProductFn({ data: id })`
  - [x] 3.4 `pendingComponent`: `ProductDetailSkeleton` (skeleton layout matching PDP anatomy)
  - [x] 3.5 `errorComponent`: reuse existing `ErrorMessage` pattern from listing page
  - [x] 3.6 `component`: `ProductDetailPage` using `useSuspenseQuery(productDetailQueryOptions(...))`
  - [x] 3.7 `head`: dynamic meta tags, Open Graph, and JSON-LD (see Task 8)

- [x] Task 4: Create web ProductDetail component (AC: 2, 4, 5, 6, 7)
  - [x] 4.1 Create `apps/web/src/components/product/ProductDetail.tsx`
  - [x] 4.2 Two-column layout: image gallery (left, ~60%), product info (right, ~40%) on desktop; stacked on mobile
  - [x] 4.3 Product info section: merchant name (overline), product name (Cormorant Garamond H2), price breakdown, variant selectors, "Add to Bag" CTA, trust indicators
  - [x] 4.4 Affiliate disclosure text near CTA: "We earn a commission on purchases — this doesn't affect the price you pay."
  - [x] 4.5 Description section below the hero: render `htmlDescription` safely (use DOMPurify or equivalent HTML sanitizer to prevent XSS) or `description` as plain text fallback
  - [x] 4.6 Out-of-stock state: "Add to Bag" replaced by "Notify When Available" (placeholder button, non-functional)
  - [x] 4.7 "Similar Products" placeholder section at bottom (empty state with message "Recommendations coming soon")
  - [x] 4.8 BEM classes: `product-detail`, `product-detail__gallery`, `product-detail__info`, `product-detail__name`, `product-detail__price`, `product-detail__variants`, `product-detail__cta`, `product-detail__description`, `product-detail__trust`

- [x] Task 5: Create web ImageGallery component (AC: 3)
  - [x] 5.1 Create `apps/web/src/components/product/ImageGallery.tsx`
  - [x] 5.2 Hero image display (main large image area) with 3:4 aspect ratio
  - [x] 5.3 Thumbnail strip below hero (horizontal scroll, max 6 visible)
  - [x] 5.4 Click thumbnail to update hero image (state-managed, no route change)
  - [x] 5.5 Use `product.images[]` array sorted by `displayOrder`, fallback to `thumbnailUrl`
  - [x] 5.6 Handle `images.length === 0`: show placeholder SVG (reuse pattern from ProductCard)
  - [x] 5.7 Hero image: `loading="eager"` (above fold); thumbnails: `loading="lazy"`
  - [x] 5.8 Accessibility: `role="region"` with `aria-label="Product images"`, thumbnail buttons with `aria-label="View image N of M"`
  - [x] 5.9 BEM: `image-gallery`, `image-gallery__hero`, `image-gallery__thumbs`, `image-gallery__thumb`, `image-gallery__thumb--active`

- [x] Task 6: Create web VariantSelector component (AC: 5)
  - [x] 6.1 Create `apps/web/src/components/product/VariantSelector.tsx`
  - [x] 6.2 Render one selector group per `product.variants[]` (e.g., "Size", "Color")
  - [x] 6.3 Each group: label + row of selectable options (button-style for sizes, potentially color swatches later)
  - [x] 6.4 On variant value click: find matching SKU from `product.skus[]` by matching all selected variant values
  - [x] 6.5 Update parent state with selected SKU (price, availability, SKU-specific images)
  - [x] 6.6 Unavailable combinations: `aria-disabled="true"`, visually grayed out (use `--color-silver`)
  - [x] 6.7 Accessibility: each group is a `role="radiogroup"` with `aria-label="Select {variant.name}"`
  - [x] 6.8 BEM: `variant-selector`, `variant-selector__group`, `variant-selector__label`, `variant-selector__option`, `variant-selector__option--active`, `variant-selector__option--disabled`

- [x] Task 7: Create web PriceBreakdown component (AC: 4)
  - [x] 7.1 Create `apps/web/src/components/product/PriceBreakdown.tsx`
  - [x] 7.2 Display: product price (from selected SKU `salePrice`, or offer `minPrice` if no SKU selected)
  - [x] 7.3 If `retailPrice > salePrice`: show original price struck through, sale price in `--color-gold`
  - [x] 7.4 Shipping estimate: "Estimated at checkout" (no shipping API yet — Story 4.3)
  - [x] 7.5 Tax estimate: "Estimated at checkout"
  - [x] 7.6 Use `formatPrice(cents, currency)` for all price formatting
  - [x] 7.7 Price range display when no SKU selected and `minPrice !== maxPrice`: "From $19.99 — $29.99"
  - [x] 7.8 Render as `<dl>` (definition list) for screen reader accessibility
  - [x] 7.9 BEM: `price-breakdown`, `price-breakdown__row`, `price-breakdown__label`, `price-breakdown__value`, `price-breakdown__total`, `price-breakdown__original` (strikethrough), `price-breakdown__sale`

- [x] Task 8: SEO — Dynamic Meta Tags & JSON-LD Structured Data (AC: 8)
  - [x] 8.1 In route file `$productId.tsx`, implement `head` function returning dynamic meta tags
  - [x] 8.2 `<title>`: `"{product.name} — {product.seller} | Maison Émile"`
  - [x] 8.3 `<meta name="description">`: First 160 chars of `product.description` (strip HTML)
  - [x] 8.4 Open Graph tags: `og:title`, `og:description`, `og:image` (thumbnailUrl), `og:type` ("product"), `og:url`
  - [x] 8.5 JSON-LD `Product` schema: `@type: "Product"`, `name`, `description`, `image`, `brand` (vendor), `offers.price`, `offers.priceCurrency`, `offers.availability` (schema.org enum), `offers.seller`
  - [x] 8.6 JSON-LD script injected via `<script type="application/ld+json">` in the page head or body
  - [x] 8.7 Availability mapping: `available: true` → `"https://schema.org/InStock"`, `false` → `"https://schema.org/OutOfStock"`

- [x] Task 9: Create ProductDetailSkeleton component (AC: 10)
  - [x] 9.1 Create `apps/web/src/components/product/ProductDetailSkeleton.tsx`
  - [x] 9.2 Match the two-column layout: large image skeleton (left), text/price/button skeletons (right)
  - [x] 9.3 Reuse existing `Skeleton` component (variant="image" for gallery, variant="text" for info lines)
  - [x] 9.4 BEM: `product-detail-skeleton` (reuses `product-detail` grid for consistent layout)

- [x] Task 10: CSS for Product Detail Page (AC: 2, 3, 4, 5, 6, 7)
  - [x] 10.1 Create `apps/web/src/styles/pages/product-detail.css` — page-level layout styles
  - [x] 10.2 Create `apps/web/src/components/product/ProductDetail.css` — component colocated styles
  - [x] 10.3 Create `apps/web/src/components/product/ImageGallery.css` — gallery-specific styles
  - [x] 10.4 Create `apps/web/src/components/product/VariantSelector.css` — variant button styles
  - [x] 10.5 Create `apps/web/src/components/product/PriceBreakdown.css` — pricing layout styles
  - [x] 10.6 Add new CSS imports to `apps/web/src/styles/index.css` (maintain import order: components → pages)
  - [x] 10.7 Two-column grid: `grid-template-columns: 1fr 1fr` at `--bp-lg` (1024px+), single column below
  - [x] 10.8 Gallery takes `~60%` on desktop via `grid-template-columns: 3fr 2fr`
  - [x] 10.9 Sticky sidebar for product info while scrolling description (desktop only): `position: sticky; top: var(--space-6)`
  - [x] 10.10 "Add to Bag" button: full-width, `--color-gold` background, `--color-midnight` text, `--radius-md`, prominent

- [x] Task 11: Update ProductCard link to use TanStack Router Link (AC: 1)
  - [x] 11.1 In `apps/web/src/components/product/ProductCard.tsx`, replace `<a href>` with TanStack Router `<Link to="/products/$productId" params={{ productId: product.id }}>`
  - [x] 11.2 Remove the TODO comment about route not existing yet
  - [x] 11.3 Verify intent-based preloading works (router config has `defaultPreload: "intent"`)

- [x] Task 12: Create mobile product detail screen (AC: 1, 2, 3, 10)
  - [x] 12.1 Create `apps/mobile/src/app/products/[productId].tsx` with Stack push navigation
  - [x] 12.2 ScrollView layout: full-width hero image, product info below (stacked)
  - [x] 12.3 Image gallery: horizontal ScrollView/FlatList for swiping between images
  - [x] 12.4 Product name (Cormorant Garamond via design tokens), price, merchant, description
  - [x] 12.5 "Add to Bag" button at bottom (placeholder — Story 4.1)
  - [x] 12.6 Data fetching: placeholder pattern (same as Story 3.2 mobile — TODO for Edge Function)
  - [x] 12.7 Create `apps/mobile/src/components/product/ProductDetail.tsx` for the detail layout

- [x] Task 13: Tests (AC: 1-10)
  - [x] 13.1 Create `packages/shared/src/hooks/__tests__/useProduct.test.ts` — test `productDetailQueryOptions` generates correct query key, staleTime, passes fetchFn
  - [x] 13.2 Create `apps/web/src/components/product/__tests__/ProductDetail.test.tsx` — render with mock product, out-of-stock state, price formatting, accessibility attributes
  - [x] 13.3 Create `apps/web/src/components/product/__tests__/ImageGallery.test.tsx` — renders images, thumbnail click updates hero, placeholder for empty images
  - [x] 13.4 Create `apps/web/src/components/product/__tests__/VariantSelector.test.tsx` — renders variant options, selection state, disabled state for unavailable
  - [x] 13.5 Create `apps/web/src/components/product/__tests__/PriceBreakdown.test.tsx` — price formatting, sale price strikethrough, price range display

- [x] Task 14: Quality checks (AC: 1-10)
  - [x] 14.1 Run `bun run fix-all` (Prettier + ESLint + TypeScript check)
  - [x] 14.2 Run `bun --cwd=apps/web run test` to ensure no regressions
  - [x] 14.3 Verify SSR: `curl localhost:3000/products/{id}` returns complete HTML with product data, JSON-LD, and OG tags
  - [x] 14.4 Verify meta tags in HTML source (`<title>`, `<meta name="description">`, `<meta property="og:*">`)

## Dev Notes

### Violet API — Offer Detail Endpoint

#### Key Endpoint: Get Offer By ID

```
GET /catalog/offers/{offer_id}
```

**Required Headers:**
| Header | Description |
|---|---|
| `X-Violet-Token` | JWT from login |
| `X-Violet-App-Id` | Application ID |
| `X-Violet-App-Secret` | Application secret |

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `base_currency` | string | ISO 4217 (default: "USD") |
| `include` | string | Comma-separated: `metadata`, `collections`, `shipping`, `sku_metadata` |

**IMPORTANT:** There is NO `extended=true` parameter on this endpoint (that's only on `POST /catalog/offers/search`). Use `include` for extra data.

**Response:** Full `Offer` object with all fields including `variants[]`, `skus[]`, `albums[]`.

**Error Codes:**
| Code | Error | Description |
|---|---|---|
| 200 | — | Success |
| 404 | `offer_not_found` (2004) | "Offer could not be found." |
| 403 | `insufficient_permissions` (9901) | Permission denied |

The existing `VioletAdapter.getProduct()` already handles this endpoint correctly, with Zod validation, retry logic, and snake_case to camelCase transformation. **DO NOT modify the adapter for this story.**

#### SKU Pricing Details (Critical for PDP)

Each SKU has TWO price fields:
- `sale_price` (int32, cents) — **current selling price**
- `retail_price` (int32, cents) — **original/compare-at price**

**Discount display rule:** When `retailPrice > salePrice`, show original price struck through and sale price highlighted in `--color-gold`. This is the only honest way to show discounts — no fake "was $X" patterns.

**Price range:** When product has multiple SKUs with different prices, display "From $19.99 — $29.99" using offer-level `minPrice`/`maxPrice`.

#### Variant to SKU Selection Logic

Violet's Offer response contains the data structure needed for variant selection:

```typescript
// Offer.variants[] — option dimensions
{ name: "Size", values: ["S", "M", "L"] }
{ name: "Color", values: ["Red", "Blue"] }

// Offer.skus[] — purchasable combinations
{ id: "101", variantValues: [{ variant: "Size", value: "S" }, { variant: "Color", value: "Red" }], salePrice: 1999 }
```

**Selection algorithm:**
1. User selects variant values (e.g., Size=M, Color=Red)
2. Find SKU where ALL `variantValues` match the selection
3. Update price, availability, and images from matched SKU

**NOTE:** The current `ProductVariant` type in our codebase is `{ name: string, values: string[] }` — this is simplified. For MVP, match SKU by comparing `sku.variantValues` against all selected values.

#### Image Handling for PDP

- **Primary image:** Use `product.images[0]` where `primary: true`, or first by `displayOrder`
- **Gallery:** All images from `product.images[]` sorted by `displayOrder`
- **`thumbnailUrl`** is `null` when no image available — show placeholder SVG
- **`default_image_url`** does NOT exist on get-by-id responses (only on search) — DO NOT rely on it
- Images are CDN URLs from merchant platforms — use directly, no proxy needed
- Web: `loading="eager"` for hero image (above fold), `loading="lazy"` for thumbnails
- Alt text: Use `"${product.name} - Image ${index + 1} of ${total}"` (Violet's `alt_text` field not yet in our types)

### Architecture Compliance

#### SSR Pattern for Product Detail (CRITICAL)

Follow the exact same pattern established in Story 3.2 for the product listing page:

```typescript
// apps/web/src/routes/products/$productId.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { productDetailQueryOptions } from "@ecommerce/shared";
import { getProductFn } from "#/server/getProduct";

const fetchProduct: ProductDetailFetchFn = (id) => getProductFn({ data: id });

export const Route = createFileRoute("/products/$productId")({
  loader: async ({ context: { queryClient }, params: { productId } }) => {
    await queryClient.ensureQueryData(
      productDetailQueryOptions(productId, fetchProduct),
    );
  },
  pendingComponent: ProductDetailSkeleton,
  component: ProductDetailPage,
  head: ({ loaderData }) => productHead(loaderData),
});

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const { data } = useSuspenseQuery(
    productDetailQueryOptions(productId, fetchProduct),
  );
  // data is ApiResponse<Product> — check data.data for the product
}
```

**Key points:**
- `loader` runs server-side for SSR, client-side for navigation
- `createServerFn` ensures Violet API calls NEVER reach the browser
- `useSuspenseQuery` + `pendingComponent` handles loading state
- `head` function generates dynamic meta tags for SEO
- `ensureQueryData` prefetches on server, reuses cache on client

#### Dynamic SEO Head Pattern

TanStack Start supports a `head` function on routes that returns meta tags:

```typescript
head: ({ loaderData }) => ({
  meta: [
    { title: `${product.name} — ${product.seller} | Maison Émile` },
    { name: "description", content: stripHtml(product.description).slice(0, 160) },
    { property: "og:title", content: product.name },
    { property: "og:description", content: stripHtml(product.description).slice(0, 160) },
    { property: "og:image", content: product.thumbnailUrl || "" },
    { property: "og:type", content: "product" },
  ],
  scripts: [
    {
      type: "application/ld+json",
      children: JSON.stringify(buildProductJsonLd(product)),
    },
  ],
}),
```

**IMPORTANT:** Verify the exact TanStack Start `head` API — the `scripts` injection for JSON-LD may need to use `links` or a different mechanism. Check the existing `__root.tsx` head implementation for the correct pattern. If `head` doesn't support scripts, inject JSON-LD directly in the component body.

#### Two-Column Layout (Desktop) / Stacked (Mobile)

```css
/* product-detail.css */
.product-detail {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-8);
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}

@media (min-width: 1024px) {
  .product-detail {
    grid-template-columns: 3fr 2fr; /* Image 60%, Info 40% */
    gap: var(--space-10);
  }
}
```

#### "Add to Bag" CTA (Placeholder for Story 4.1)

The button should be fully styled and present but non-functional:

```typescript
<button
  className="product-detail__cta"
  disabled={!product.available}
  onClick={() => {
    // TODO: Story 4.1 — Cart API integration
    console.warn("Add to Cart not yet implemented");
  }}
>
  {product.available ? "Add to Bag" : "Notify When Available"}
</button>
```

Style: full-width, `--color-gold` background, `--color-midnight` text, `--radius-md`, prominent. Matches UX spec CTA pattern.

#### CSS Architecture — BEM Convention for PDP

```css
/* product-detail — Main PDP layout */
.product-detail { }
.product-detail__gallery { }
.product-detail__info { }
.product-detail__merchant { }   /* Overline: merchant name */
.product-detail__name { }       /* H2: Cormorant Garamond */
.product-detail__cta { }        /* Add to Bag button */
.product-detail__cta--disabled { }
.product-detail__description { }
.product-detail__trust { }      /* Trust indicators row */
.product-detail__affiliate { }  /* Affiliate disclosure */
.product-detail__similar { }    /* Similar products placeholder */

/* image-gallery — Product image viewer */
.image-gallery { }
.image-gallery__hero { }
.image-gallery__thumbs { }
.image-gallery__thumb { }
.image-gallery__thumb--active { }
.image-gallery__placeholder { }

/* variant-selector — SKU option picker */
.variant-selector { }
.variant-selector__group { }
.variant-selector__label { }
.variant-selector__option { }
.variant-selector__option--active { }
.variant-selector__option--disabled { }

/* price-breakdown — Transparent pricing */
.price-breakdown { }
.price-breakdown__row { }
.price-breakdown__label { }
.price-breakdown__value { }
.price-breakdown__total { }
.price-breakdown__original { }  /* Strikethrough */
.price-breakdown__sale { }      /* Gold highlight */
.price-breakdown__range { }     /* "From $X — $Y" */
```

### Existing Code to Reuse (DO NOT REINVENT)

| What | Where | How to Use |
|---|---|---|
| `VioletAdapter.getProduct()` | `packages/shared/src/adapters/violetAdapter.ts:166-187` | Called from Server Function — DO NOT modify |
| `createSupplierAdapter()` | `packages/shared/src/adapters/adapterFactory.ts` | Factory creates VioletAdapter with auth |
| `Product` type | `packages/shared/src/types/product.types.ts:113-159` | Full type: 27 fields, variants, SKUs, albums, images |
| `SKU` type | `packages/shared/src/types/product.types.ts` | `salePrice`, `retailPrice`, `inStock`, `qtyAvailable`, `variantValues` |
| `ProductImage` type | `packages/shared/src/types/product.types.ts` | `{ id, url, displayOrder, primary }` |
| `ProductVariant` type | `packages/shared/src/types/product.types.ts` | `{ name, values: string[] }` |
| `ApiResponse<T>` type | `packages/shared/src/types/api.types.ts` | Discriminated union `{ data, error }` |
| `queryKeys.products.detail()` | `packages/shared/src/utils/constants.ts:26` | `['products', 'detail', productId]` |
| `formatPrice()` | `packages/shared/src/utils/formatPrice.ts` | `formatPrice(cents, currency)` returns "$19.99" |
| `Skeleton` component | `apps/web/src/components/Skeleton.tsx` | `<Skeleton variant="text\|image\|card" />` |
| `ProductCard` component | `apps/web/src/components/product/ProductCard.tsx` | Update link to use Router `<Link>` |
| `getProducts.ts` pattern | `apps/web/src/server/getProducts.ts` | Follow exactly for `getProduct.ts` |
| Router context | `apps/web/src/router.tsx` | `RouterContext { queryClient }` — access in loader |
| Root route | `apps/web/src/routes/__root.tsx` | `createRootRouteWithContext<RouterContext>()` |
| CSS tokens | `apps/web/src/styles/tokens.css` | All design tokens: `--color-*`, `--font-*`, `--space-*`, `--shadow-*`, `--radius-*` |
| CSS utilities | `apps/web/src/styles/utilities.css` | `.sr-only`, `.page-wrap`, `.display-title` |
| Mobile theme | `apps/mobile/src/constants/theme.ts` | `Spacing`, `MaxContentWidth`, `BottomTabInset` |
| Mobile ThemedText | `apps/mobile/src/components/themed-text.tsx` | Themed RN text component |

### File Structure

#### Files to CREATE

```
# Web — Route & Server Function
apps/web/src/routes/products/$productId.tsx                    # Product detail route (SSR + SEO)
apps/web/src/server/getProduct.ts                               # Server Function: single product fetch

# Web — Components
apps/web/src/components/product/ProductDetail.tsx               # Main PDP component
apps/web/src/components/product/ProductDetail.css               # PDP colocated styles
apps/web/src/components/product/ImageGallery.tsx                # Image gallery with thumbnails
apps/web/src/components/product/ImageGallery.css                # Gallery styles
apps/web/src/components/product/VariantSelector.tsx             # SKU variant picker
apps/web/src/components/product/VariantSelector.css             # Variant button styles
apps/web/src/components/product/PriceBreakdown.tsx              # Transparent pricing display
apps/web/src/components/product/PriceBreakdown.css              # Price layout styles
apps/web/src/components/product/ProductDetailSkeleton.tsx       # Loading skeleton

# Web — Page Styles
apps/web/src/styles/pages/product-detail.css                    # Page-level PDP styles

# Mobile — Screens & Components
apps/mobile/src/app/products/[productId].tsx                    # Mobile product detail screen
apps/mobile/src/components/product/ProductDetail.tsx            # RN product detail layout

# Tests
packages/shared/src/hooks/__tests__/useProduct.test.ts          # Hook tests
apps/web/src/components/product/__tests__/ProductDetail.test.tsx # Component tests
apps/web/src/components/product/__tests__/ImageGallery.test.tsx  # Gallery tests
apps/web/src/components/product/__tests__/VariantSelector.test.tsx # Variant tests
apps/web/src/components/product/__tests__/PriceBreakdown.test.tsx  # Price tests
```

#### Files to MODIFY

```
packages/shared/src/hooks/useProducts.ts                        # Add productDetailQueryOptions
packages/shared/src/hooks/index.ts                              # Export new function + type
apps/web/src/components/product/ProductCard.tsx                 # Replace <a> with <Link> for route navigation
apps/web/src/styles/index.css                                   # Add CSS imports for new components/pages
```

#### DO NOT TOUCH

```
packages/shared/src/adapters/violetAdapter.ts                   # Complete from Story 3.1
packages/shared/src/adapters/adapterFactory.ts                  # Complete from Story 3.1
packages/shared/src/schemas/product.schema.ts                   # Complete from Story 3.1
packages/shared/src/types/product.types.ts                      # Complete from Story 3.1
packages/shared/src/types/api.types.ts                          # Complete from Story 1.2
packages/shared/src/utils/constants.ts                          # queryKeys already defined
packages/shared/src/utils/formatPrice.ts                        # Complete from Story 1.2
apps/web/src/router.tsx                                         # Router setup complete from Story 3.2
apps/web/src/routes/__root.tsx                                  # Layout shell complete from Story 2.5
apps/web/src/routes/products/index.tsx                          # Product listing complete from Story 3.2
apps/web/src/server/getProducts.ts                              # Product list server fn complete
apps/web/src/styles/tokens.css                                  # Design tokens complete
apps/web/src/components/product/ProductCard.css                 # Styles complete (only .tsx changes)
apps/web/src/components/product/ProductGrid.tsx                 # Complete from Story 3.2
apps/web/src/components/product/CategoryChips.tsx               # Complete from Story 3.2
supabase/                                                       # No database/edge function changes
```

### Library / Framework Requirements

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@tanstack/react-query` | v5.x (already installed) | `useSuspenseQuery`, `queryOptions` | In apps/web |
| `@tanstack/react-start` | (already installed) | `createServerFn()` for getProduct | In apps/web |
| `@tanstack/react-router` | (already installed) | `createFileRoute`, `Link`, `useParams` | In apps/web |
| `dompurify` | latest | HTML sanitization for `htmlDescription` rendering | **NEW — must install in apps/web** |

**One new dependency:** `dompurify` (or equivalent) for safe HTML rendering of product descriptions. Install in `apps/web` only. If adding a dependency is undesirable, alternatively strip all HTML tags and render as plain text.

### Testing Requirements

1. **Shared hook tests** (`packages/shared/src/hooks/__tests__/useProduct.test.ts`):
   - `productDetailQueryOptions` generates correct query key via `queryKeys.products.detail()`
   - staleTime is 5 minutes
   - Passes `fetchFn` parameter correctly

2. **ProductDetail component tests** (`apps/web/src/components/product/__tests__/ProductDetail.test.tsx`):
   - Renders product name (H2, Cormorant Garamond), merchant name, description
   - Renders "Add to Bag" button (enabled when available, disabled when unavailable)
   - Out-of-stock renders "Notify When Available"
   - Affiliate disclosure text is present
   - Trust indicators are rendered

3. **ImageGallery tests** (`apps/web/src/components/product/__tests__/ImageGallery.test.tsx`):
   - Renders hero image with correct src
   - Renders thumbnails sorted by displayOrder
   - Clicking thumbnail updates hero image
   - Empty images array renders placeholder
   - Accessibility: `role="region"`, `aria-label="Product images"`

4. **VariantSelector tests** (`apps/web/src/components/product/__tests__/VariantSelector.test.tsx`):
   - Renders variant groups with labels
   - Click option triggers selection callback
   - Disabled options have `aria-disabled="true"`
   - Active option has `--active` modifier class

5. **PriceBreakdown tests** (`apps/web/src/components/product/__tests__/PriceBreakdown.test.tsx`):
   - Renders formatted price via `formatPrice()`
   - Sale price shows original struck through
   - Price range shown when `minPrice !== maxPrice`
   - Rendered as `<dl>` for accessibility

6. **Quality checks**:
   - `bun run fix-all` must pass
   - `bun --cwd=apps/web run test` must not regress
   - Manual: `curl localhost:3000/products/{id}` returns full HTML with JSON-LD and OG tags

### Previous Story Intelligence (Story 3.2)

From Story 3.2 (most recent in this epic), critical learnings:

1. **TanStack Start API corrections applied:**
   - `routerWithQueryClient()` was renamed to `setupRouterSsrQueryIntegration()` (mutation pattern)
   - `.validator()` was renamed to `.inputValidator()` on `createServerFn`
   - These are already in the codebase — follow them exactly

2. **SSR Query pattern corrected during code review:**
   - Route loader MUST use `queryClient.ensureQueryData()` (or `ensureInfiniteQueryData`) — NOT direct server function call
   - Component MUST use `useSuspenseQuery()` (or `useSuspenseInfiniteQuery`) — NOT loader data directly
   - This ensures TanStack Query caching, deduplication, and staleTime work correctly

3. **`pendingComponent` is required** for loading states during route transitions — without it, there's no visual feedback during navigation

4. **ProductCard links** currently use `<a href>` with a TODO comment — this story resolves that by switching to `<Link>`

5. **Test cleanup**: Always add `afterEach` that cleans up DOM (remove children from `document.body`)

6. **109 tests currently passing** (43 shared + 66 web) — must not regress

7. **Commit format**: `feat: Story 3.3 — product detail page with SSR & SEO`

### Git Intelligence (Recent Commits)

```
f02a71b feat: Story 3.2 — product listing page with category browsing
eb2aadf feat: Story 3.1 — Violet catalog adapter & product types
c11d552 feat: Story 2.5 — layout shell & navigation (web + mobile)
4e66f2d feat: Story 2.4 — biometric authentication for mobile
d5d16ed feat: Story 2.3 — Violet API token lifecycle management
```

Pattern: single commit per story, conventional format, Co-Authored-By trailer. All stories pass `bun run fix-all` before commit.

### Violet.io API — Best Practices for Product Detail Page (from Official Docs)

#### Image Gallery Best Practices

- Use `product.images[]` array sorted by `displayOrder` for consistent ordering
- Identify primary image via `primary: true` flag on `ProductImage`
- `thumbnailUrl` on the Offer is a convenience shortcut — may be `null`
- `default_image_url` is ONLY on search responses, NOT on get-by-id — do not use
- Images are CDN URLs (Shopify CDN, etc.) — serve directly, no proxy needed for MVP
- Violet API `Media` objects have `alt_text` field (max 512 chars) but our current `ProductImage` type doesn't include it — use generated alt text for now: `"${product.name} - Image ${i+1} of ${total}"`

#### Variant/SKU Selection Best Practices

- **For MVP:** Match selected values against `sku.variantValues` array (`{ variant: "Size", value: "M" }`)
- Check `sku.inStock` AND `sku.qtyAvailable > 0` for true availability
- Display order: use variant `values` array order (already ordered by merchant)
- Products with a single SKU: skip variant selector entirely

#### Pricing Best Practices

- All amounts are in **integer cents** — use `formatPrice()` for display
- `SKU.salePrice` = current price, `SKU.retailPrice` = original price
- Show discount only when `retailPrice > salePrice` — no fake discounts
- Offer-level `minPrice`/`maxPrice` for price range when no SKU selected
- Shipping/tax estimates: display "Calculated at checkout" — actual values come from Cart API (Story 4.3)

#### SEO Best Practices

- SSR is critical: Google crawlers need full HTML without JS execution
- JSON-LD Product schema increases rich result eligibility
- `availability` must use schema.org enum: `InStock`, `OutOfStock`, `PreOrder`
- `brand` should use `vendor` field from Violet (manufacturer/brand name)
- `offers.seller` should reference the merchant (seller name)
- Keep `<meta description>` under 160 characters, strip HTML tags

### Project Structure Notes

- Route file: `apps/web/src/routes/products/$productId.tsx` — uses `$` prefix for dynamic segments (TanStack Router convention)
- Components: `apps/web/src/components/product/` — organized by feature per architecture
- CSS: Component-colocated `.css` files in component dirs + shared BEM blocks in `styles/pages/`
- The CSS import chain in `styles/index.css` must be maintained: tokens -> base -> utilities -> components -> pages
- Mobile: `apps/mobile/src/app/products/[productId].tsx` — uses `[]` for dynamic segments (Expo Router convention)

### References

- [Violet.io — Get Offer By ID](https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id) — GET endpoint for single offer
- [Violet.io — Offer Schema](https://docs.violet.io/api-reference/catalog/offers) — Complete Offer object definition
- [Violet.io — SKU Schema](https://docs.violet.io/concepts/skus) — SKU fields including sale_price, retail_price
- [Violet.io — Media & Albums](https://docs.violet.io/prism/catalog/media-transformations) — Image handling best practices
- [Violet.io — OpenAPI Spec](https://github.com/violetio/open-api) — catalog-service.yaml for complete schemas
- [Schema.org — Product](https://schema.org/Product) — JSON-LD structured data for product pages
- [Architecture: Feature Folder Structure](_bmad-output/planning-artifacts/architecture.md) — Product route + component organization
- [Architecture: Server Functions](_bmad-output/planning-artifacts/architecture.md) — `createServerFn()` pattern
- [Architecture: TanStack Query Convention](_bmad-output/planning-artifacts/architecture.md) — Query keys, staleTime
- [UX Spec: Product Detail Hero](_bmad-output/planning-artifacts/ux-design-specification.md#product-detail-hero) — PDP anatomy, states, accessibility
- [UX Spec: Price Breakdown Badge](_bmad-output/planning-artifacts/ux-design-specification.md#price-breakdown-badge) — Transparent pricing component
- [UX Spec: Trust Indicators](_bmad-output/planning-artifacts/ux-design-specification.md#trust-indicators) — Trust signal variants
- [Epics: Story 3.3](_bmad-output/planning-artifacts/epics.md) — Original story requirements
- [Story 3.2](./3-2-product-listing-page-with-category-browsing.md) — SSR pattern, code review learnings, component patterns

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- ProductCard tests broke after `<a>` → `<Link>` migration (TanStack Router requires RouterProvider context). Fixed by mocking `@tanstack/react-router` in test file.
- ProductDetail price test had mock data mismatch (SKU salePrice 2999 vs expected $45.00). Fixed by aligning mock SKU price with test expectation.
- Mobile `ThemedText` type `defaultSemiBold` doesn't exist — changed to `smallBold`.
- Route tree regeneration required after creating `$productId.tsx` route — ran `bunx @tanstack/router-cli generate`.

### Completion Notes List

- ✅ All 14 tasks and subtasks complete
- ✅ 143 tests passing (96 web + 47 shared), up from 109 (34 new tests)
- ✅ `bun run fix-all` passes (Prettier + ESLint + TypeScript)
- ✅ SSR route with dynamic meta tags, Open Graph (incl. og:url), and JSON-LD structured data
- ✅ JSON-LD uses AggregateOffer for multi-price products (Google best practice)
- ✅ Two-column desktop layout (3fr/2fr grid), stacked mobile
- ✅ Variant selector with availability checking per Violet API best practices
- ✅ "Add to Bag" disabled until all variants selected on multi-variant products
- ✅ Transparent pricing with sale price detection (retailPrice > salePrice)
- ✅ Price range display for multi-SKU products without selection
- ✅ HTML description safely stripped via shared `stripHtml()` utility (XSS-safe)
- ✅ ProductCard updated from `<a>` to `<Link>` with intent-based preloading
- ✅ Mobile: Stack layout + route registered in Tabs + responsive image width
- ✅ Keyboard focus indicators on gallery thumbnails (WCAG 2.4.7)
- ✅ Comprehensive JSDoc on all files documenting Violet.io API choices

### Change Log

- 2026-03-12: Story 3.3 implementation complete — product detail page with SSR, SEO, variant selection, transparent pricing, image gallery, mobile placeholder
- 2026-03-12: Code review fixes — 11 issues resolved (3 HIGH, 6 MEDIUM, 2 LOW): added og:url, mobile Stack layout + Tabs registration, AggregateOffer for multi-price JSON-LD, CTA disabled without variant selection, responsive mobile images, shared stripHtml utility, focus-visible on thumbnails, removed empty CSS file

### File List

**Created:**
- `apps/web/src/server/getProduct.ts` — Server Function for single product fetch
- `apps/web/src/routes/products/$productId.tsx` — PDP route with SSR + SEO head
- `apps/web/src/components/product/ProductDetail.tsx` — Main PDP component
- `apps/web/src/components/product/ProductDetail.css` — PDP styles
- `apps/web/src/components/product/ImageGallery.tsx` — Image gallery with thumbnails
- `apps/web/src/components/product/ImageGallery.css` — Gallery styles + focus-visible
- `apps/web/src/components/product/VariantSelector.tsx` — SKU variant picker
- `apps/web/src/components/product/VariantSelector.css` — Variant styles
- `apps/web/src/components/product/PriceBreakdown.tsx` — Transparent pricing
- `apps/web/src/components/product/PriceBreakdown.css` — Pricing styles
- `apps/web/src/components/product/ProductDetailSkeleton.tsx` — Loading skeleton
- `apps/mobile/src/app/products/_layout.tsx` — Stack navigator layout for products
- `apps/mobile/src/app/products/[productId].tsx` — Mobile PDP screen (placeholder)
- `apps/mobile/src/components/product/ProductDetail.tsx` — Mobile PDP component
- `packages/shared/src/utils/stripHtml.ts` — HTML tag stripping utility
- `packages/shared/src/hooks/__tests__/useProduct.test.ts` — Hook tests
- `apps/web/src/components/product/__tests__/ProductDetail.test.tsx` — PDP tests
- `apps/web/src/components/product/__tests__/ImageGallery.test.tsx` — Gallery tests
- `apps/web/src/components/product/__tests__/VariantSelector.test.tsx` — Variant tests
- `apps/web/src/components/product/__tests__/PriceBreakdown.test.tsx` — Price tests

**Modified:**
- `packages/shared/src/hooks/useProducts.ts` — Added `productDetailQueryOptions` + `ProductDetailFetchFn`
- `packages/shared/src/hooks/index.ts` — Exported new function + type
- `packages/shared/src/utils/index.ts` — Exported `stripHtml`
- `apps/web/src/components/product/ProductCard.tsx` — `<a>` → `<Link>` migration
- `apps/web/src/components/product/__tests__/ProductCard.test.tsx` — Added Router mock
- `apps/web/src/styles/index.css` — CSS imports (removed empty product-detail page CSS)
- `apps/web/src/routeTree.gen.ts` — Auto-regenerated (new route)
- `apps/mobile/src/components/app-tabs.tsx` — Registered `products` route (href: null)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Status updated

**Deleted:**
- `apps/web/src/styles/pages/product-detail.css` — Empty file, all styles in colocated component CSS
