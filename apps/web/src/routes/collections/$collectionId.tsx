import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useSuspenseInfiniteQuery,
  queryOptions,
  infiniteQueryOptions,
} from "@tanstack/react-query";
import type { Product } from "@ecommerce/shared";
import { getCollectionByIdFn, getCollectionProductsFn } from "../../server/getCollections";
import ProductGrid from "../../components/product/ProductGrid";
import ProductGridSkeleton from "../../components/product/ProductGridSkeleton";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

const PAGE_SIZE = 12;

// ─── Query options ────────────────────────────────────────────────────

function collectionQueryOptions(collectionId: string) {
  return queryOptions({
    queryKey: ["collection", collectionId],
    queryFn: () => getCollectionByIdFn({ data: collectionId }),
    staleTime: 5 * 60 * 1000,
  });
}

function collectionProductsQueryOptions(collectionId: string) {
  return infiniteQueryOptions({
    queryKey: ["collection-products", collectionId],
    queryFn: ({ pageParam = 1 }) =>
      getCollectionProductsFn({
        data: { collectionId, page: pageParam as number, pageSize: PAGE_SIZE },
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.data?.hasNext) return undefined;
      return (lastPage.data.page ?? 1) + 1;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Route ───────────────────────────────────────────────────────────

export const Route = createFileRoute("/collections/$collectionId")({
  loader: async ({ context: { queryClient }, params: { collectionId } }) => {
    const result = await queryClient.ensureQueryData(collectionQueryOptions(collectionId));
    // Prefetch first page of products in parallel
    try {
      await queryClient.ensureInfiniteQueryData(collectionProductsQueryOptions(collectionId));
    } catch {
      // Product prefetch failure is non-fatal — collection page still renders
    }
    return { collection: result.data ?? null };
  },

  head: ({ loaderData }) => {
    const collection = loaderData?.collection;
    const title = collection?.name
      ? `${collection.name} — Collections — Maison Émile`
      : "Collection — Maison Émile";
    const description = collection?.description ?? "Discover products in this curated collection.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:url", content: `${SITE_URL}/collections/${collection?.id ?? ""}` },
      ],
    };
  },

  pendingComponent: CollectionDetailSkeleton,

  component: CollectionDetailPage,
});

// ─── Components ───────────────────────────────────────────────────────

function CollectionDetailPage() {
  const { collectionId } = Route.useParams();
  const { data: collectionResult } = useSuspenseQuery(collectionQueryOptions(collectionId));
  const collection = collectionResult.data;

  const {
    data: productsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSuspenseInfiniteQuery(collectionProductsQueryOptions(collectionId));

  if (!collection) {
    return (
      <main className="page-wrap collection-detail">
        <Link to="/collections" className="collection-detail__back">
          <span className="collection-detail__back-arrow">←</span> All Collections
        </Link>
        <h1 className="display-title">Collection not found</h1>
        <p style={{ color: "var(--color-steel)", marginTop: "var(--space-4)" }}>
          This collection may have been removed or is no longer available.
        </p>
      </main>
    );
  }

  const allProducts: Product[] = productsData.pages.flatMap((p) => p.data?.data ?? []);
  const total = productsData.pages[0]?.data?.total ?? 0;

  return (
    <main className="page-wrap collection-detail">
      {/* Back link */}
      <Link to="/collections" className="collection-detail__back">
        <span className="collection-detail__back-arrow">←</span> All Collections
      </Link>

      {/* Hero */}
      <section className="collection-detail__hero">
        {collection.imageUrl ? (
          <div className="collection-detail__hero-image-wrap">
            <img
              src={collection.imageUrl}
              alt={collection.name}
              className="collection-detail__hero-image"
            />
          </div>
        ) : (
          <div className="collection-detail__hero-image-wrap">
            <div className="collection-detail__hero-placeholder" aria-hidden="true">
              ✦
            </div>
          </div>
        )}

        <div className="collection-detail__header">
          <h1 className="display-title collection-detail__title">{collection.name}</h1>
          <div className="collection-detail__meta">
            <span className="collection-detail__type">
              {collection.type === "AUTOMATED" ? "Automated collection" : "Curated collection"}
            </span>
          </div>
        </div>

        {collection.description && (
          <p className="collection-detail__description">{collection.description}</p>
        )}
      </section>

      {/* Products */}
      {allProducts.length === 0 ? (
        <p className="collection-detail__empty">No products in this collection yet.</p>
      ) : (
        <>
          <div className="collection-detail__toolbar">
            <p className="collection-detail__count">
              Showing {allProducts.length} of {total} product{total !== 1 ? "s" : ""}
            </p>
          </div>

          <ProductGrid products={allProducts} />

          {hasNextPage && (
            <div className="collection-detail__pagination">
              <button
                type="button"
                className="collection-detail__load-more"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                aria-label="Load more products"
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function CollectionDetailSkeleton() {
  return (
    <main className="page-wrap collection-detail" aria-busy="true" aria-label="Loading collection">
      <div className="collection-detail__skeleton-hero" />
      <div
        className="collection-detail__skeleton-title"
        style={{ marginBottom: "var(--space-8)" }}
      />
      <ProductGridSkeleton />
    </main>
  );
}
