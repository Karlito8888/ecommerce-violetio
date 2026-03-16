import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCartSync } from "@ecommerce/shared";
import type { CartHealthStatus } from "@ecommerce/shared";
import { getUserCartFn, mergeAnonymousCartFn, claimCartFn } from "../server/cartSync";
import { clearCartCookieFn } from "../server/checkout";

/**
 * CartContext — manages cart ID state and drawer visibility app-wide.
 *
 * ## Design decisions
 *
 * - **React Context (no Zustand)**: consistent with the `useAuthSession.ts` pattern.
 *   The cart state is simple (2 IDs + 1 boolean) — no need for an external store.
 *
 * - **Two cart IDs**: `cartId` (Supabase UUID) for DB operations; `violetCartId`
 *   (Violet integer as string) for Violet API calls. Both are needed at different
 *   layers of the stack.
 *
 * - **Server-side hydration**: `CartProvider` accepts `initialVioletCartId` from
 *   the root route loader (which reads the `violet_cart_id` HttpOnly cookie).
 *   This means the cart badge count and drawer are populated immediately on any
 *   page load/refresh — no client-side fetch required to know IF a cart exists.
 *
 * - **Drawer state**: Lives exclusively here. No component-local state for the
 *   drawer — any component (ProductDetail, Header badge) can call `openDrawer()`.
 *
 * - **Cross-device sync (Story 4.6)**: `useCartSync` subscribes to Supabase
 *   Realtime when `userId` is set. Cart merge runs when `userId` transitions
 *   from null → non-null (anonymous → authenticated).
 *
 * ## CartProvider mounting
 * `<CartDrawer />` is rendered INSIDE `CartProvider` so it can access context.
 * Wrap `<CartProvider>` around the app shell in `__root.tsx`, above `<Header>`.
 *
 * @see apps/web/src/routes/__root.tsx — loader reads cookie, passes initialVioletCartId
 * @see apps/web/src/server/cartActions.ts — createCartFn sets the HttpOnly cookie
 * @see apps/web/src/server/cartSync.ts — merge/claim server functions
 */

interface CartContextValue {
  /** Supabase cart UUID — used for Supabase DB operations */
  cartId: string | null;
  /** Violet cart integer ID as string — used for Violet API calls */
  violetCartId: string | null;
  isDrawerOpen: boolean;
  /** Cart health for recovery logic (Story 4.7) */
  cartHealth: CartHealthStatus;
  openDrawer: () => void;
  closeDrawer: () => void;
  setCart: (cartId: string, violetCartId: string) => void;
  clearCart: () => void;
  /** Set cart health status (Story 4.7) */
  setCartHealth: (status: CartHealthStatus) => void;
  /** Clear cart and cookie, guide user to start fresh (Story 4.7) */
  resetCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Hook to consume CartContext. Throws if used outside CartProvider.
 */
export function useCartContext(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCartContext must be used within a CartProvider");
  }
  return ctx;
}

interface CartProviderProps {
  children: React.ReactNode;
  /** Initial cartId from server-read HttpOnly cookie (passed from root loader). */
  initialCartId?: string | null;
  /** Initial violetCartId from server-read HttpOnly cookie. */
  initialVioletCartId?: string | null;
  /** Supabase browser client for Realtime subscription (Story 4.6) */
  supabase: SupabaseClient;
  /** Authenticated (non-anonymous) user ID for Realtime subscription (Story 4.6). Null = no sync. */
  userId?: string | null;
}

/**
 * CartProvider — wraps the app to provide cart state globally.
 *
 * Mount at the root level (`__root.tsx`) so the cart drawer is available
 * on every page. Pass `initialCartId` and `initialVioletCartId` from the
 * root loader to hydrate state from the HttpOnly cookie.
 */
export function CartProvider({
  children,
  initialCartId = null,
  initialVioletCartId = null,
  supabase,
  userId = null,
}: CartProviderProps) {
  const [cartId, setCartId] = useState<string | null>(initialCartId);
  const [violetCartId, setVioletCartId] = useState<string | null>(initialVioletCartId);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [cartHealth, setCartHealth] = useState<CartHealthStatus>("healthy");

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  const setCart = (newCartId: string, newVioletCartId: string) => {
    setCartId(newCartId);
    setVioletCartId(newVioletCartId);
    setCartHealth("healthy");
  };

  const clearCart = () => {
    setCartId(null);
    setVioletCartId(null);
  };

  /** Clear cart + cookie and reset health — for expired/invalid cart recovery (Story 4.7) */
  const resetCart = useCallback(async () => {
    setCartId(null);
    setVioletCartId(null);
    setCartHealth("healthy");
    await clearCartCookieFn();
  }, []);

  const queryClient = useQueryClient();

  // Invalidate all cart queries when another device modifies the cart
  const handleCartUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cart"] });
  }, [queryClient]);

  // Called when another device changes the cart's violet_cart_id (e.g., merge)
  const handleRemoteCartChange = useCallback(
    (newVioletCartId: string) => {
      setVioletCartId(newVioletCartId);
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    [queryClient],
  );

  // Subscribe to Realtime cart changes for authenticated users (Story 4.6)
  useCartSync({
    supabase,
    userId,
    currentVioletCartId: violetCartId,
    onCartUpdated: handleCartUpdated,
    onRemoteCartChange: handleRemoteCartChange,
  });

  // ── Cart merge on anonymous → authenticated transition (Story 4.6) ──
  // When userId changes from null to a value and we have an anonymous cart,
  // merge or claim the cart so it's associated with the authenticated user.
  // Initialize prevUserIdRef with userId to avoid triggering on initial mount
  // when the user is already authenticated (e.g., page refresh).
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const mergeInProgressRef = useRef(false);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    // Skip initial mount (undefined → any), only trigger on null → non-null transition
    if (
      prevUserId === undefined ||
      !userId ||
      prevUserId !== null ||
      !violetCartId ||
      mergeInProgressRef.current
    ) {
      return;
    }

    mergeInProgressRef.current = true;

    (async () => {
      try {
        // Check if user already has an authenticated cart
        const { violetCartId: existingCartId } = await getUserCartFn({
          data: { userId },
        });

        if (existingCartId && existingCartId !== violetCartId) {
          // User has an existing cart → merge anonymous items into it
          const result = await mergeAnonymousCartFn({
            data: {
              anonymousVioletCartId: violetCartId,
              targetVioletCartId: existingCartId,
            },
          });
          if (result.success) {
            setVioletCartId(existingCartId);
          }
        } else if (!existingCartId) {
          // No existing cart → claim the anonymous cart (transfer ownership)
          await claimCartFn({
            data: { violetCartId, userId },
          });
          // Keep using the same violetCartId — ownership transferred server-side
        }
        // If existingCartId === violetCartId, no action needed (already the same cart)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[cart-sync] merge/claim failed:", err);
      } finally {
        mergeInProgressRef.current = false;
      }
    })();
  }, [userId, violetCartId]);

  return (
    <CartContext.Provider
      value={{
        cartId,
        violetCartId,
        isDrawerOpen,
        cartHealth,
        openDrawer,
        closeDrawer,
        setCart,
        clearCart,
        setCartHealth,
        resetCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
