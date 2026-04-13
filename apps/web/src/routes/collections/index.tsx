import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import type { CollectionItem } from "@ecommerce/shared";
import { getCollectionsFn } from "../../server/getCollections";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

// ─── Query options ────────────────────────────────────────────────────

const collectionsQueryOptions = queryOptions({
  queryKey: ["collections"],
  queryFn: () => getCollectionsFn(),
  staleTime: 5 * 60 * 1000, // 5 min — collections are synced daily by Violet
});

// ─── Route ───────────────────────────────────────────────────────────

export const Route = createFileRoute("/collections/")({
  head: () => ({
    meta: [
      { title: "Collections — Maison Émile" },
      {
        name: "description",
        content:
          "Browse our curated collections of exceptional products from our merchant partners.",
      },
      { property: "og:title", content: "Collections — Maison Émile" },
      { property: "og:url", content: `${SITE_URL}/collections` },
    ],
  }),

  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(collectionsQueryOptions);
  },

  pendingComponent: CollectionsSkeleton,

  component: CollectionsPage,
});

// ─── Components ───────────────────────────────────────────────────────

function CollectionsPage() {
  const { data: result } = useSuspenseQuery(collectionsQueryOptions);
  const collections = result.data ?? [];

  return (
    <main className="page-wrap collections-page">
      <h1 className="display-title collections-page__title">Collections</h1>
      <p className="collections-page__subtitle">Curated selections from our merchant partners.</p>

      {collections.length === 0 ? (
        <div className="collections-page__empty" role="status">
          <p>No collections available yet.</p>
          <p className="collections-page__empty-hint">
            Collections are synced daily from our merchants.
          </p>
        </div>
      ) : (
        <ul className="collections-page__grid" role="list" aria-label="Product collections">
          {collections.map((collection) => (
            <li key={collection.id}>
              <CollectionCard collection={collection} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function CollectionCard({ collection }: { collection: CollectionItem }) {
  return (
    <Link
      to="/collections/$collectionId"
      params={{ collectionId: collection.id }}
      className="collection-card"
      aria-label={`${collection.name} collection`}
    >
      <div className="collection-card__image-wrap">
        {collection.imageUrl ? (
          <img
            src={collection.imageUrl}
            alt={collection.imageAlt ?? collection.name}
            className="collection-card__image"
            loading="lazy"
            width={400}
            height={300}
          />
        ) : (
          <div className="collection-card__placeholder" aria-hidden="true">
            <span className="collection-card__placeholder-icon">✦</span>
          </div>
        )}
        <span className="collection-card__type-badge" aria-hidden="true">
          {collection.type === "AUTOMATED" ? "Auto" : "Curated"}
        </span>
      </div>

      <div className="collection-card__body">
        <h2 className="collection-card__name">{collection.name}</h2>
        {collection.description && (
          <p className="collection-card__description">{collection.description}</p>
        )}
        {collection.productCount > 0 && (
          <p className="collection-card__count">
            {collection.productCount} product{collection.productCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </Link>
  );
}

function CollectionsSkeleton() {
  return (
    <main className="page-wrap collections-page" aria-busy="true" aria-label="Loading collections">
      <div
        className="collection-detail__skeleton-title"
        style={{ marginBottom: "var(--space-8)" }}
      />
      <ul className="collections-page__grid" role="list">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i}>
            <div className="collection-card">
              <div
                className="collection-card__image-wrap"
                style={{
                  animation: "pulse 1.5s ease-in-out infinite",
                  background: "var(--color-sand)",
                }}
              />
              <div className="collection-card__body">
                <div
                  style={{
                    height: "1.125rem",
                    width: "70%",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-sand)",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
