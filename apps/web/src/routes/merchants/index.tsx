import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getMerchantsWithCountsFn } from "../../server/getMerchants";

// ─── Query options ────────────────────────────────────────────────────

function merchantsQueryOptions() {
  return queryOptions({
    queryKey: ["merchants-with-counts"],
    queryFn: () => getMerchantsWithCountsFn(),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Route ────────────────────────────────────────────────────────────

export const Route = createFileRoute("/merchants/")({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(merchantsQueryOptions());
  },
  component: MerchantsPage,
  head: () => ({
    meta: [{ title: "Our Merchants | Maison Émile" }],
  }),
});

// ─── Component ────────────────────────────────────────────────────────

function MerchantsPage() {
  const { data: merchants } = useSuspenseQuery(merchantsQueryOptions());

  return (
    <main className="page-wrap merchants-page">
      <header className="merchants-page__header">
        <h1 className="merchants-page__title">Our Merchants</h1>
        <p className="merchants-page__subtitle">
          Curated sellers from the world's best e-commerce platforms.
        </p>
      </header>

      {!merchants || merchants.length === 0 ? (
        <p className="merchants-page__empty">No merchants connected yet. Check back soon!</p>
      ) : (
        <div className="merchants-page__grid">
          {merchants.map((merchant) => (
            <Link
              key={merchant.merchant_id}
              to="/merchants/$merchantId"
              params={{ merchantId: merchant.merchant_id }}
              className="merchants-page__card"
            >
              <div className="merchants-page__card-info">
                <h2 className="merchants-page__card-name">{merchant.name}</h2>
                <div className="merchants-page__card-meta">
                  {merchant.platform && (
                    <span className="merchants-page__card-platform">
                      {merchant.platform.charAt(0) + merchant.platform.slice(1).toLowerCase()}
                    </span>
                  )}
                  {merchant.offer_count !== null && (
                    <span className="merchants-page__card-count">
                      {merchant.offer_count} product{merchant.offer_count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <span className="merchants-page__card-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
