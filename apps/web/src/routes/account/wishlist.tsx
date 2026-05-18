/**
 * Wishlist Page — /account/wishlist
 *
 * Migrated from Supabase to Convex queries (Phase 5).
 *
 * Uses Convex queries for wishlist data (reactive by default).
 * Live product data (prices, availability) still comes from Violet API
 * via the existing product detail query options.
 *
 * Protected by the /account layout auth guard (Convex Auth).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQueries } from "@tanstack/react-query";
import { buildPageMeta, formatPrice, useAddToCart } from "@ecommerce/shared";
import type { Product } from "@ecommerce/shared";
import { optimizeWithPreset } from "@ecommerce/shared";
import { api } from "#convex/_generated/api";
import { getProductFn } from "#/server/getProduct";
import { addToCartFn, createCartFn } from "#/server/cartActions";
import WishlistButton from "#/components/product/WishlistButton";
import { useToast } from "#/components/ui/Toast";
import { useCartContext } from "#/contexts/CartContext";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/** Adapter for product detail fetch (Violet API via server function). */
const fetchProductAdapter = (id: string) => getProductFn({ data: id });

/** Add-to-cart adapter for wishlist "Add to Bag" action. */
const addToCartAdapter = (input: Record<string, unknown>) => addToCartFn({ data: input as never });

export const Route = createFileRoute("/account/wishlist")({
  head: () => ({
    meta: buildPageMeta({
      title: "My Wishlist | Maison Émile",
      description: "View and manage your saved items.",
      url: "/account/wishlist",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const { isAuthenticated } = useConvexAuth();
  const identity = useQuery(api.users.queries.getIdentity, isAuthenticated ? {} : "skip");
  const userId = identity?.subject ?? "";

  // Convex query for wishlist (reactive)
  const wishlist = useQuery(api.wishlists.queries.getWishlist, userId ? { userId } : "skip");

  // Convex mutation for removal
  const removeMutation = useMutation(api.wishlists.mutations.removeFromWishlist);

  const toast = useToast();
  const { violetCartId, setCart, openDrawer } = useCartContext();

  // Cart mutation for "Add to Bag"
  const cartMutation = useAddToCart(violetCartId, addToCartAdapter, (cart) => {
    setCart(cart.id, cart.violetCartId);
    openDrawer();
  });

  const items = wishlist?.items ?? [];
  const isEmpty = items.length === 0;

  // Fetch live product data from Violet for each wishlisted item
  const productQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ["product", item.productId],
      queryFn: () => fetchProductAdapter(item.productId),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // Build product map from query results
  const productMap = new Map<string, Product>();
  for (let i = 0; i < items.length; i++) {
    const query = productQueries[i];
    if (query.data?.data) {
      productMap.set(items[i].productId, query.data.data);
    }
  }

  const handleAddToCart = async (product: Product) => {
    const sku = product.skus.find((s) => s.inStock && s.qtyAvailable > 0) ?? product.skus[0];
    if (!sku) return;

    try {
      let currentVioletCartId = violetCartId;

      if (!currentVioletCartId) {
        const createResult = await createCartFn({
          data: { userId, sessionId: null },
        });
        if (createResult.error || !createResult.data) {
          toast.error("Could not create cart");
          return;
        }
        setCart(createResult.data.id, createResult.data.violetCartId);
        currentVioletCartId = createResult.data.violetCartId;
      }

      cartMutation.mutate({
        violetCartId: currentVioletCartId,
        skuId: sku.id,
        quantity: 1,
        userId,
        sessionId: null,
        productName: product.name,
        thumbnailUrl: product.thumbnailUrl ?? undefined,
      });

      toast.success("Added to bag");
    } catch {
      toast.error("Failed to add to bag");
    }
  };

  return (
    <div className="wishlist">
      <h1 className="wishlist__heading">
        My Wishlist{!isEmpty && <span className="wishlist__count"> ({items.length})</span>}
      </h1>

      {isEmpty ? (
        <div className="wishlist__empty">
          <p className="wishlist__empty-message">Your wishlist is empty</p>
          <Link to="/" className="wishlist__empty-cta">
            Discover products
          </Link>
        </div>
      ) : (
        <div className="wishlist__grid">
          {items.map((item) => {
            const product = productMap.get(item.productId);
            const isOutOfStock = product ? !product.available : false;

            return (
              <article
                key={item._id}
                className={`wishlist-item${isOutOfStock ? " wishlist-item--out-of-stock" : ""}`}
              >
                <Link
                  to="/products/$productId"
                  params={{ productId: item.productId }}
                  className="wishlist-item__link"
                >
                  <div className="wishlist-item__image-wrap">
                    {product?.thumbnailUrl ? (
                      <img
                        src={optimizeWithPreset(product.thumbnailUrl, "productCard") ?? undefined}
                        alt={product?.name ?? "Product"}
                        className="wishlist-item__image"
                        loading="lazy"
                      />
                    ) : (
                      <div className="wishlist-item__placeholder" aria-hidden="true">
                        ♡
                      </div>
                    )}
                    {isOutOfStock && <span className="wishlist-item__badge">Sold Out</span>}
                  </div>

                  <div className="wishlist-item__info">
                    <h2 className="wishlist-item__name">{product?.name ?? "Loading…"}</h2>
                    {product?.seller && <p className="wishlist-item__merchant">{product.seller}</p>}
                    {product && (
                      <p className="wishlist-item__price">
                        {formatPrice(product.minPrice, product.currency)}
                      </p>
                    )}
                  </div>
                </Link>

                <div className="wishlist-item__actions">
                  <WishlistButton
                    productId={item.productId}
                    productName={product?.name}
                    size="sm"
                  />
                  {product && !isOutOfStock && (
                    <button
                      type="button"
                      className="wishlist-item__add-to-cart"
                      onClick={() => handleAddToCart(product)}
                      disabled={cartMutation.isPending}
                    >
                      {cartMutation.isPending ? "Adding…" : "Add to Bag"}
                    </button>
                  )}
                  {product && isOutOfStock && (
                    <span className="wishlist-item__sold-out-label">Sold Out</span>
                  )}
                  <button
                    type="button"
                    className="wishlist-item__remove"
                    onClick={() => removeMutation({ userId, productId: item.productId })}
                    aria-label={`Remove ${product?.name ?? "product"} from wishlist`}
                  >
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
