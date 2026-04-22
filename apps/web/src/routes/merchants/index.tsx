import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getMerchantsFn } from "../../server/getMerchants";

// ─── Query options ────────────────────────────────────────────────────

function merchantsQueryOptions() {
  return queryOptions({
    queryKey: ["merchants"],
    queryFn: () => getMerchantsFn(),
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
              <div className="merchants-page__card-icon">
                <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" width="40" height="40">
                  <rect width="48" height="48" rx="12" fill="var(--color-sand)" />
                  <path d="M16 20h16v2H16zM16 26h12v2H16z" fill="var(--color-stone)" />
                  <rect
                    x="14"
                    y="14"
                    width="20"
                    height="20"
                    rx="3"
                    stroke="var(--color-stone)"
                    strokeWidth="2"
                    fill="none"
                  />
                </svg>
              </div>
              <div className="merchants-page__card-info">
                <h2 className="merchants-page__card-name">{merchant.name}</h2>
                {merchant.platform && (
                  <span className="merchants-page__card-platform">
                    {merchant.platform.charAt(0) + merchant.platform.slice(1).toLowerCase()}
                  </span>
                )}
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
