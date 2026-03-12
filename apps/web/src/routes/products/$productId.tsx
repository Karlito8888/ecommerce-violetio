import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { productDetailQueryOptions, stripHtml } from "@ecommerce/shared";
import type { ProductDetailFetchFn, Product } from "@ecommerce/shared";
import { getProductFn } from "../../server/getProduct";
import ProductDetail from "../../components/product/ProductDetail";
import ProductDetailSkeleton from "../../components/product/ProductDetailSkeleton";

/**
 * Adapts the TanStack Start server function to the shared `ProductDetailFetchFn` signature.
 *
 * TanStack Start's `createServerFn` expects `getProductFn({ data: productId })`,
 * while the shared hook expects `(id: string) => Promise<ApiResponse<Product>>`.
 * This one-liner bridges the two interfaces.
 */
const fetchProduct: ProductDetailFetchFn = (id) => getProductFn({ data: id });

/**
 * Base URL for constructing absolute canonical/og:url values.
 *
 * ## Why an env var?
 *
 * Open Graph `og:url` requires an absolute URL per the protocol spec.
 * In SSR, we don't have access to the incoming request URL from TanStack Start's
 * `head` function. Using an env var is the standard approach for SSR frameworks.
 *
 * Falls back to localhost in development. In production, set `SITE_URL` to the
 * canonical domain (e.g., "https://www.maisonemile.com").
 */
const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * Build JSON-LD structured data for a Product (schema.org).
 *
 * ## SEO Best Practices (Violet.io + Schema.org)
 *
 * - SSR is critical: Google crawlers need full HTML without JS execution
 * - JSON-LD Product schema increases rich result eligibility in Google Search
 * - `availability` uses schema.org enum values: InStock, OutOfStock
 * - `brand` maps to Violet's `vendor` field (manufacturer/brand name)
 * - `offers.seller` references the merchant (the store selling the product)
 * - Price is in decimal format (not cents) per schema.org spec
 *
 * ## AggregateOffer vs Offer (Google Structured Data Guidelines)
 *
 * When a product has multiple SKUs with different prices (`minPrice !== maxPrice`),
 * we use `AggregateOffer` with `lowPrice`/`highPrice` instead of a single `Offer`.
 * This accurately represents the price range and improves rich result eligibility.
 *
 * When all SKUs share the same price (or there's only one SKU), a simple `Offer`
 * with `price` is used — this is what Google expects for single-price products.
 *
 * @see https://schema.org/Product
 * @see https://schema.org/AggregateOffer
 * @see https://developers.google.com/search/docs/appearance/structured-data/product
 */
function buildProductJsonLd(product: Product) {
  const hasPriceRange = product.minPrice !== product.maxPrice;

  const offers = hasPriceRange
    ? {
        "@type": "AggregateOffer",
        lowPrice: (product.minPrice / 100).toFixed(2),
        highPrice: (product.maxPrice / 100).toFixed(2),
        priceCurrency: product.currency,
        availability: product.available
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        seller: {
          "@type": "Organization",
          name: product.seller,
        },
      }
    : {
        "@type": "Offer",
        price: (product.minPrice / 100).toFixed(2),
        priceCurrency: product.currency,
        availability: product.available
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        seller: {
          "@type": "Organization",
          name: product.seller,
        },
      };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: stripHtml(product.htmlDescription ?? product.description).slice(0, 5000),
    image: product.thumbnailUrl ?? undefined,
    brand: {
      "@type": "Brand",
      name: product.vendor,
    },
    offers,
  };
}

/**
 * /products/$productId route — Server-side rendered Product Detail Page.
 *
 * ## SSR Flow
 *
 * 1. `loader` extracts `productId` from route params
 * 2. `queryClient.ensureQueryData(productDetailQueryOptions(...))` prefetches
 *    product data into TanStack Query cache (server-side)
 * 3. `setupRouterSsrQueryIntegration` dehydrates the cache into the HTML stream
 * 4. Component renders with `useSuspenseQuery(...)` — data already in cache
 *
 * ## Client Navigation Flow
 *
 * 1. ProductCard `<Link>` click triggers client-side navigation
 * 2. Router runs loader, which prefetches product data (or finds it in cache)
 * 3. `pendingComponent` shows skeleton while loading
 * 4. Component re-renders with product data
 *
 * ## SEO (AC: 8)
 *
 * The `head` function generates dynamic `<title>`, `<meta description>`,
 * Open Graph tags, and JSON-LD Product structured data — all rendered
 * server-side so crawlers see complete metadata without JavaScript.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 */
export const Route = createFileRoute("/products/$productId")({
  loader: async ({ context: { queryClient }, params: { productId } }) => {
    const result = await queryClient.ensureQueryData(
      productDetailQueryOptions(productId, fetchProduct),
    );
    return { product: result.data ?? null };
  },
  pendingComponent: ProductDetailSkeleton,
  component: ProductDetailPage,
  errorComponent: ProductDetailError,
  head: ({ loaderData }) => {
    const product = loaderData?.product;
    if (!product) {
      return {
        meta: [{ title: "Product Not Found | Maison Émile" }],
      };
    }

    const description = stripHtml(product.htmlDescription ?? product.description).slice(0, 160);

    return {
      meta: [
        { title: `${product.name} — ${product.seller} | Maison Émile` },
        { name: "description", content: description },
        { property: "og:title", content: product.name },
        { property: "og:description", content: description },
        { property: "og:image", content: product.thumbnailUrl ?? "" },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `${SITE_URL}/products/${product.id}` },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(buildProductJsonLd(product)),
        },
      ],
    };
  },
});

/**
 * Product Detail Page component — renders the full PDP.
 *
 * Uses `useSuspenseQuery` to consume the prefetched data from the loader.
 * The query cache ensures no redundant API calls on client-side navigation.
 */
function ProductDetailPage() {
  const { productId } = Route.useParams();
  const { data } = useSuspenseQuery(productDetailQueryOptions(productId, fetchProduct));

  if (!data.data) {
    return (
      <div className="page-wrap">
        <div className="product-detail-error">
          <h2>Product Not Found</h2>
          <p>The product you&apos;re looking for doesn&apos;t exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <ProductDetail product={data.data} />
    </div>
  );
}

/**
 * Error boundary component for the product detail route.
 * Shown when the loader or component throws an unrecoverable error.
 */
function ProductDetailError() {
  return (
    <div className="page-wrap">
      <div className="product-detail-error">
        <h2>Something went wrong</h2>
        <p>We couldn&apos;t load this product. Please try again later.</p>
      </div>
    </div>
  );
}
