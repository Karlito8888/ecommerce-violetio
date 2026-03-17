/**
 * Wishlist Page — /account/wishlist (Story 6.4)
 *
 * Displays the user's saved products with live pricing from Violet.
 * Protected by the `/account` layout auth guard (account/route.tsx).
 *
 * ## Code Review Fixes Applied
 * - **H1**: Added "Add to Bag" button per AC #5 — uses existing cart context
 * - **M1**: Added merchant name display per AC #3 — shows `product.seller`
 * - Both fixes integrate with existing cart infrastructure (CartContext, addToCartFn)
 *   rather than duplicating logic.
 *
 * ## Architecture Note: Why live Violet fetch per item?
 * AC #3 requires "prices and availability are re-fetched from Violet on view".
 * We intentionally do NOT cache price/availability in the wishlist_items table.
 * This means a Violet API call per item, but wishlists are low-frequency pages
 * and stale prices would be a worse UX than a slightly slower load.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  wishlistQueryOptions,
  useRemoveFromWishlist,
  productDetailQueryOptions,
  buildPageMeta,
  formatPrice,
  useAddToCart,
} from "@ecommerce/shared";
import type { Product, ProductDetailFetchFn, AddToCartFn } from "@ecommerce/shared";
import { getProductFn } from "#/server/getProduct";
import { addToCartFn, createCartFn } from "#/server/cartActions";
import WishlistButton from "#/components/product/WishlistButton";
import { useToast } from "#/components/ui/Toast";
import { useCartContext } from "#/contexts/CartContext";
import { getSupabaseBrowserClient } from "#/utils/supabase";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/** Adapter: wraps TanStack Start Server Function to match shared hook signature. */
const fetchProductAdapter: ProductDetailFetchFn = (id) => getProductFn({ data: id });

/**
 * Add-to-cart adapter for wishlist "Add to Bag" action.
 *
 * ## Why a dedicated adapter here? (Code Review Fix H1)
 * The wishlist page needs to add items to cart (AC #5). Rather than
 * duplicating the cart creation + add logic from ProductDetail, we use
 * the same shared `useAddToCart` hook with the Server Function adapter.
 */
const addToCartAdapter: AddToCartFn = (input) => addToCartFn({ data: input });

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
  loader: async ({ context }) => {
    const { user } = context as { user: { id: string; email: string | null } };
    await context.queryClient.ensureQueryData(wishlistQueryOptions(user.id));
    return { user };
  },
  component: WishlistPage,
});

function WishlistPage() {
  const { user } = Route.useLoaderData();
  const wishlist = useQuery(wishlistQueryOptions(user.id));
  const removeMutation = useRemoveFromWishlist(user.id);
  const toast = useToast();
  const { violetCartId, setCart, openDrawer } = useCartContext();

  /**
   * Cart mutation for "Add to Bag" on wishlist items (AC #5).
   * On success, updates CartContext and opens the cart drawer.
   */
  const cartMutation = useAddToCart(violetCartId, addToCartAdapter, (cart) => {
    setCart(cart.id, cart.violetCartId);
    openDrawer();
  });

  const items = wishlist.data?.items ?? [];
  const isEmpty = items.length === 0;

  // Fetch live product data from Violet for each wishlisted item
  const productQueries = useQueries({
    queries: items.map((item) => ({
      ...productDetailQueryOptions(item.product_id, fetchProductAdapter),
    })),
  });

  // Build product map from query results
  const productMap = new Map<string, Product>();
  for (const query of productQueries) {
    if (query.data?.data) {
      productMap.set(query.data.data.id, query.data.data);
    }
  }

  /**
   * Handle "Add to Bag" for a wishlist item.
   *
   * ## Why this logic is inline (not extracted)
   * This mirrors ProductDetail's handleAddToCart but is simpler:
   * wishlist items use the first available SKU (no variant selection).
   * If the product has multiple SKUs, we pick the first in-stock one.
   */
  const handleAddToCart = async (product: Product) => {
    const sku = product.skus.find((s) => s.inStock && s.qtyAvailable > 0) ?? product.skus[0];
    if (!sku) return;

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      const authUser = userData?.user ?? null;
      const userId = authUser && !authUser.is_anonymous ? authUser.id : null;
      const sessionId = authUser?.is_anonymous ? authUser.id : null;

      let currentVioletCartId = violetCartId;

      if (!currentVioletCartId) {
        const createResult = await createCartFn({ data: { userId, sessionId } });
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
        sessionId,
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
            const product = productMap.get(item.product_id);
            const isOutOfStock = product ? !product.available : false;

            return (
              <article
                key={item.id}
                className={`wishlist-item${isOutOfStock ? " wishlist-item--out-of-stock" : ""}`}
              >
                <Link
                  to="/products/$productId"
                  params={{ productId: item.product_id }}
                  className="wishlist-item__link"
                >
                  <div className="wishlist-item__image-wrap">
                    {product?.thumbnailUrl ? (
                      <img
                        src={product.thumbnailUrl}
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
                    {/* Merchant name — AC #3 requires this (Code Review Fix M1) */}
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
                    productId={item.product_id}
                    productName={product?.name}
                    size="sm"
                  />
                  {/* Add to Bag — AC #5 (Code Review Fix H1) */}
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
                    onClick={() => removeMutation.mutate(item.product_id)}
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
