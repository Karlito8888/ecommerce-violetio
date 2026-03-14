import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse, Cart } from "../types/index.js";
import { queryKeys } from "../utils/constants.js";

/**
 * Function signature for fetching cart state.
 *
 * Platform-specific implementations:
 * - **Web**: wraps `getCartFn` TanStack Start Server Function
 * - **Mobile**: wraps the `cart` Edge Function call
 */
export type CartFetchFn = (violetCartId: string) => Promise<ApiResponse<Cart>>;

/**
 * Function signature for adding an item to the cart.
 * Returns the updated Cart (full state after mutation).
 */
export type AddToCartFn = (input: {
  violetCartId: string;
  skuId: string;
  quantity: number;
  userId?: string | null;
  sessionId?: string | null;
}) => Promise<ApiResponse<Cart>>;

/** Function signature for updating a cart item quantity. */
export type UpdateCartItemFn = (input: {
  violetCartId: string;
  skuId: string;
  quantity: number;
}) => Promise<ApiResponse<Cart>>;

/** Function signature for removing a cart item. */
export type RemoveFromCartFn = (input: {
  violetCartId: string;
  skuId: string;
}) => Promise<ApiResponse<Cart>>;

/**
 * Cart hooks — TanStack Query integration for cart operations.
 *
 * ## Cross-platform design (web + mobile)
 *
 * These hooks accept platform-specific fetch/mutation functions as parameters
 * (`CartFetchFn`, `AddToCartFn`, etc.) rather than importing Server Functions
 * directly. This allows:
 * - **Web**: pass TanStack Start Server Functions (run in Node.js via SSR)
 * - **Mobile**: pass Supabase Edge Function wrappers (run in Deno)
 *
 * The hooks only contain the query/mutation logic — the transport layer is
 * injected by the caller. See `CartDrawer.tsx` (web) and `cart.tsx` (mobile)
 * for the platform-specific function adapters.
 *
 * ## Optimistic update strategy
 *
 * | Hook                  | Optimistic behavior                                      |
 * |-----------------------|----------------------------------------------------------|
 * | `useAddToCart`        | Increment existing SKU quantity if SKU already in cart   |
 * | `useUpdateCartItem`   | Update quantity of the specific SKU immediately          |
 * | `useRemoveFromCart`   | Remove item + empty bag filter immediately               |
 *
 * New SKUs cannot be added optimistically to `useAddToCart` because Violet
 * assigns items to merchant bags server-side — we don't know which bag until
 * the response comes back. The `onSettled` invalidation fetches real state.
 *
 * All three hooks capture a `previousCart` snapshot in `onMutate` and restore
 * it in `onError` (rollback). All three call `invalidateQueries` in `onSettled`
 * to sync with the server regardless of success/failure.
 *
 * ## Query key conventions
 *
 * `queryKeys.cart.detail(violetCartId)` — per-cart cache entry
 * `queryKeys.cart.count()` — invalidated on add/remove to update badge
 *
 * @see packages/shared/src/utils/constants.ts — queryKeys
 * @see https://docs.violet.io/api-reference/checkout/cart
 */

/**
 * Creates TanStack Query options for the cart detail query.
 *
 * staleTime: 0 — intentional. Cart state must always be fresh to prevent
 * stale inventory counts or pricing showing to users.
 *
 * @see architecture.md#Caching — staleTime: 0 for cart
 */
export function cartDetailQueryOptions(violetCartId: string, fetchFn: CartFetchFn) {
  return queryOptions({
    queryKey: queryKeys.cart.detail(violetCartId),
    queryFn: () => fetchFn(violetCartId),
    staleTime: 0, // Always fetch fresh cart state
    enabled: Boolean(violetCartId),
  });
}

/**
 * Hook to query the current cart state.
 *
 * @param violetCartId - Violet cart ID (from CartContext or cookie)
 * @param fetchFn - Platform-specific fetch function
 */
export function useCartQuery(violetCartId: string | null, fetchFn: CartFetchFn) {
  return useQuery(cartDetailQueryOptions(violetCartId ?? "", fetchFn));
}

/**
 * Hook to add an item to the cart with optimistic updates.
 *
 * ## Optimistic update strategy
 *
 * 1. On `mutate`: if the SKU already exists in a bag, increment its quantity immediately.
 *    New SKUs cannot be optimistically placed because Violet determines the merchant bag
 *    assignment server-side — we cannot know which bag the new item belongs to without
 *    the server response. The `onSettled` invalidation fetches the real state promptly.
 * 2. On `onError`: roll back to the previous cached state
 * 3. On `onSettled`: invalidate the query to get fresh server state
 *
 * This gives instant UI feedback while the Server Function call completes.
 */
export function useAddToCart(
  _violetCartId: string | null,
  addFn: AddToCartFn,
  onSuccess?: (cart: Cart) => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addFn,
    onMutate: async (variables) => {
      const queryKey = queryKeys.cart.detail(variables.violetCartId);
      await queryClient.cancelQueries({ queryKey });
      const previousCart = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);

      // Optimistic: if the SKU already exists in any bag, increment its quantity.
      // We cannot optimistically add new SKUs — Violet assigns them to bags server-side.
      if (previousCart?.data) {
        const skuExists = previousCart.data.bags.some((bag) =>
          bag.items.some((item) => item.skuId === variables.skuId),
        );
        if (skuExists) {
          const optimistic: ApiResponse<Cart> = {
            data: {
              ...previousCart.data,
              bags: previousCart.data.bags.map((bag) => ({
                ...bag,
                items: bag.items.map((item) =>
                  item.skuId === variables.skuId
                    ? { ...item, quantity: item.quantity + variables.quantity }
                    : item,
                ),
              })),
            },
            error: null,
          };
          queryClient.setQueryData(queryKey, optimistic);
        }
      }

      return { previousCart, queryKey };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousCart !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousCart);
      }
    },
    onSuccess: (result) => {
      if (result.data && onSuccess) {
        onSuccess(result.data);
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.cart.detail(variables.violetCartId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.count() });
    },
  });
}

/**
 * Hook to update a cart item quantity with optimistic updates.
 */
export function useUpdateCartItem(updateFn: UpdateCartItemFn) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateFn,
    onMutate: async (variables) => {
      const queryKey = queryKeys.cart.detail(variables.violetCartId);
      await queryClient.cancelQueries({ queryKey });
      const previousCart = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);

      // Optimistic: update quantity in the cached cart
      if (previousCart?.data) {
        const optimistic: ApiResponse<Cart> = {
          data: {
            ...previousCart.data,
            bags: previousCart.data.bags.map((bag) => ({
              ...bag,
              items: bag.items.map((item) =>
                item.skuId === variables.skuId ? { ...item, quantity: variables.quantity } : item,
              ),
            })),
          },
          error: null,
        };
        queryClient.setQueryData(queryKey, optimistic);
      }

      return { previousCart, queryKey };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousCart !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousCart);
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.cart.detail(variables.violetCartId),
      });
      // Invalidate count badge — quantity change affects total item count
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.count() });
    },
  });
}

/**
 * Hook to remove a cart item with optimistic updates.
 */
export function useRemoveFromCart(removeFn: RemoveFromCartFn) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeFn,
    onMutate: async (variables) => {
      const queryKey = queryKeys.cart.detail(variables.violetCartId);
      await queryClient.cancelQueries({ queryKey });
      const previousCart = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);

      // Optimistic: remove item from the cached cart
      if (previousCart?.data) {
        const optimistic: ApiResponse<Cart> = {
          data: {
            ...previousCart.data,
            bags: previousCart.data.bags
              .map((bag) => ({
                ...bag,
                items: bag.items.filter((item) => item.skuId !== variables.skuId),
              }))
              .filter((bag) => bag.items.length > 0),
          },
          error: null,
        };
        queryClient.setQueryData(queryKey, optimistic);
      }

      return { previousCart, queryKey };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousCart !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousCart);
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.cart.detail(variables.violetCartId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.count() });
    },
  });
}

/** Derives total item count from a Cart for badge display. */
export function getCartItemCount(cart: Cart | null | undefined): number {
  if (!cart) return 0;
  return cart.bags.reduce((sum, bag) => sum + bag.items.reduce((s, i) => s + i.quantity, 0), 0);
}
