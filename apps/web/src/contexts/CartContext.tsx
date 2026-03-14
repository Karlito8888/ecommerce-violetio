import { createContext, useContext, useState } from "react";

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
 * ## CartProvider mounting
 * `<CartDrawer />` is rendered INSIDE `CartProvider` so it can access context.
 * Wrap `<CartProvider>` around the app shell in `__root.tsx`, above `<Header>`.
 *
 * @see apps/web/src/routes/__root.tsx — loader reads cookie, passes initialVioletCartId
 * @see apps/web/src/server/cartActions.ts — createCartFn sets the HttpOnly cookie
 */

interface CartContextValue {
  /** Supabase cart UUID — used for Supabase DB operations */
  cartId: string | null;
  /** Violet cart integer ID as string — used for Violet API calls */
  violetCartId: string | null;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  setCart: (cartId: string, violetCartId: string) => void;
  clearCart: () => void;
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
}: CartProviderProps) {
  const [cartId, setCartId] = useState<string | null>(initialCartId);
  const [violetCartId, setVioletCartId] = useState<string | null>(initialVioletCartId);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  const setCart = (newCartId: string, newVioletCartId: string) => {
    setCartId(newCartId);
    setVioletCartId(newVioletCartId);
  };

  const clearCart = () => {
    setCartId(null);
    setVioletCartId(null);
  };

  return (
    <CartContext.Provider
      value={{ cartId, violetCartId, isDrawerOpen, openDrawer, closeDrawer, setCart, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}
