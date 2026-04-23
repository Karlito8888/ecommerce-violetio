import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useSuspenseInfiniteQuery,
  queryOptions,
  infiniteQueryOptions,
} from "@tanstack/react-query";
import { optimizeWithPreset } from "@ecommerce/shared";
import { getMerchantFn, getMerchantProductsFn } from "../../server/getMerchant";
import BaseProductCard from "../../components/product/BaseProductCard";
import ProductGridSkeleton from "../../components/product/ProductGridSkeleton";

const PAGE_SIZE = 12;

// ─── Query options ────────────────────────────────────────────────────

function merchantQueryOptions(merchantId: string) {
  return queryOptions({
    queryKey: ["merchant", merchantId],
    queryFn: () => getMerchantFn({ data: merchantId }),
    staleTime: 5 * 60 * 1000,
  });
}

function merchantProductsQueryOptions(merchantId: string) {
  return infiniteQueryOptions({
    queryKey: ["merchant-products", merchantId],
    queryFn: ({ pageParam = 1 }) =>
      getMerchantProductsFn({
        data: { merchantId, page: pageParam as number, pageSize: PAGE_SIZE },
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.data?.hasNext) return undefined;
      return (lastPage.data.page ?? 1) + 1;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Route ────────────────────────────────────────────────────────────

export const Route = createFileRoute("/merchants/$merchantId")({
  loader: async ({ context: { queryClient }, params: { merchantId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(merchantQueryOptions(merchantId)),
      queryClient.ensureInfiniteQueryData(merchantProductsQueryOptions(merchantId)),
    ]);
  },
  pendingComponent: ProductGridSkeleton,
  component: MerchantPage,
  head: () => ({
    meta: [{ title: `Merchant | Maison \u00c9mile` }],
  }),
});

// ─── Component ────────────────────────────────────────────────────────

function MerchantPage() {
  const { merchantId } = Route.useParams();
  const merchantQuery = useSuspenseQuery(merchantQueryOptions(merchantId));
  const productsQuery = useSuspenseInfiniteQuery(merchantProductsQueryOptions(merchantId));

  const merchant = merchantQuery.data?.data;
  const allProducts = productsQuery.data?.pages.flatMap((p) => p.data?.data ?? []) ?? [];

  if (!merchant) {
    return (
      <div className="page-wrap">
        <p style={{ padding: "4rem 0", textAlign: "center" }}>Merchant not found.</p>
        <p style={{ textAlign: "center" }}>
          <Link to="/" className="nav-link">
            ← Back to home
          </Link>
        </p>
      </div>
    );
  }

  const platformLabel = merchant.platform
    ? merchant.platform.charAt(0) + merchant.platform.slice(1).toLowerCase()
    : null;

  return (
    <main className="page-wrap merchant-page">
      {/* ── Breadcrumb ─────────────────────────────────────────────── */}
      <nav className="merchant-page__breadcrumb" aria-label="Breadcrumb">
        <Link to="/" className="nav-link">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{merchant.name}</span>
      </nav>

      {/* ── Merchant header ────────────────────────────────────────── */}
      <header className="merchant-page__header">
        <h1 className="merchant-page__title">{merchant.name}</h1>
        <div className="merchant-page__meta">
          {platformLabel && <span className="merchant-page__badge">{platformLabel} merchant</span>}
          <span className="merchant-page__badge merchant-page__badge--verified">✓ Verified</span>
        </div>
      </header>

      {/* ── Products grid ──────────────────────────────────────────── */}
      <section className="merchant-page__products" aria-label="Products">
        <h2 className="merchant-page__section-title">
          Products
          <span className="merchant-page__count">
            {productsQuery.data?.pages[0]?.data?.total ?? allProducts.length} items
          </span>
        </h2>

        {allProducts.length === 0 ? (
          <p className="merchant-page__empty">No products available from this merchant yet.</p>
        ) : (
          <div className="product-grid">
            {allProducts.map((product) => (
              <BaseProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                merchantName={product.seller}
                merchantId={product.merchantId}
                thumbnailUrl={
                  product.thumbnailUrl
                    ? optimizeWithPreset(product.thumbnailUrl, "productCard")
                    : product.images[0]?.url
                      ? optimizeWithPreset(product.images[0].url, "productCard")
                      : null
                }
                minPrice={product.minPrice}
                currency={product.currency}
                available={product.available}
              />
            ))}
          </div>
        )}

        {/* ── Load more ────────────────────────────────────────────── */}
        {productsQuery.hasNextPage && (
          <div className="merchant-page__load-more">
            <button
              onClick={() => productsQuery.fetchNextPage()}
              disabled={productsQuery.isFetchingNextPage}
              className="merchant-page__load-more-btn"
            >
              {productsQuery.isFetchingNextPage ? "Loading..." : "Load more products"}
            </button>
          </div>
        )}
      </section>

      {/* ── Back link ──────────────────────────────────────────────── */}
      <div className="merchant-page__back">
        <Link to="/" className="nav-link">
          ← Back to all products
        </Link>
      </div>
    </main>
  );
}
