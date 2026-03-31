import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  buildPageMeta,
  buildWebSiteJsonLd,
  buildOrganizationJsonLd,
  productsInfiniteQueryOptions,
} from "@ecommerce/shared";
import type { ProductsFetchFn } from "@ecommerce/shared";
import { getProductsFn, getCategoriesFn } from "../server/getProducts";
import SearchBar from "../components/search/SearchBar";
import RecentlyViewedRow from "../components/product/RecentlyViewedRow";
import ProductGrid from "../components/product/ProductGrid";
import ProductGridSkeleton from "../components/product/ProductGridSkeleton";
import CategoryChips from "../components/product/CategoryChips";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

const fetchProducts: ProductsFetchFn = (params) => getProductsFn({ data: params });

export const Route = createFileRoute("/")({
  loader: async ({ context: { queryClient } }) => {
    const [categories] = await Promise.all([
      getCategoriesFn(),
      queryClient.ensureInfiniteQueryData(
        productsInfiniteQueryOptions({ pageSize: 12 }, fetchProducts),
      ),
    ]);
    return { categories };
  },
  pendingComponent: HomePending,
  component: App,
  head: () => ({
    meta: buildPageMeta({
      title: "Maison Émile — Curated Shopping",
      description:
        "Discover unique products from curated merchants — powered by AI search. Maison Émile brings you a handpicked shopping experience.",
      url: "/",
      siteUrl: SITE_URL,
    }),
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(buildWebSiteJsonLd(SITE_URL)),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(buildOrganizationJsonLd(SITE_URL)),
      },
    ],
  }),
});

function HomePending() {
  return (
    <section className="page-wrap" style={{ padding: "3.5rem 1rem 2rem" }}>
      <section className="island-shell hero rise-in">
        <div className="hero__glow hero__glow--top" />
        <div className="hero__glow hero__glow--bottom" />
        <p className="island-kicker hero__kicker">Curated Shopping, Reimagined</p>
        <h1 className="display-title hero__title">Find exactly what you&apos;re looking for.</h1>
        <SearchBar variant="hero" />
      </section>
      <ProductGridSkeleton />
    </section>
  );
}

function App() {
  const { categories } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/" });

  const { data } = useSuspenseInfiniteQuery(
    productsInfiniteQueryOptions({ pageSize: 12 }, fetchProducts),
  );

  const products = data.pages.flatMap((p) => p.data?.data ?? []);
  const total = data.pages[0]?.data?.total ?? 0;

  return (
    <section className="page-wrap" style={{ padding: "3.5rem 1rem 2rem" }}>
      {/* Hero */}
      <section className="island-shell hero rise-in">
        <div className="hero__glow hero__glow--top" />
        <div className="hero__glow hero__glow--bottom" />
        <p className="island-kicker hero__kicker">Curated Shopping, Reimagined</p>
        <h1 className="display-title hero__title">Find exactly what you&apos;re looking for.</h1>
        <p className="hero__desc">
          Discover unique products from curated merchants — powered by AI search.
        </p>
        <SearchBar variant="hero" />
      </section>

      <RecentlyViewedRow />

      {/* Category chips — navigate to /products with filter */}
      <div style={{ marginTop: "2rem" }}>
        <CategoryChips
          categories={categories}
          activeCategory={undefined}
          onCategoryChange={(cat) =>
            navigate({
              to: "/products",
              search: {
                category: cat ?? undefined,
                minPrice: undefined,
                maxPrice: undefined,
                inStock: undefined,
                sortBy: undefined,
                sortDirection: undefined,
              },
            })
          }
        />
      </div>

      {/* Featured products */}
      <div style={{ marginTop: "1.5rem" }}>
        <ProductGrid products={products} />
      </div>

      {/* See all */}
      {total > 12 && (
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <Link
            to="/products"
            search={{
              category: undefined,
              minPrice: undefined,
              maxPrice: undefined,
              inStock: undefined,
              sortBy: undefined,
              sortDirection: undefined,
            }}
            className="hero__btn hero__btn--primary"
          >
            Browse all {total} products →
          </Link>
        </div>
      )}
    </section>
  );
}
