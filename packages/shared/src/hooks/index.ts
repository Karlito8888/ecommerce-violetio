export {
  productsQueryOptions,
  productsInfiniteQueryOptions,
  productDetailQueryOptions,
} from "./useProducts.js";
export type { ProductsFetchFn, ProductDetailFetchFn } from "./useProducts.js";
export { searchQueryOptions, useSearch } from "./useSearch.js";
export {
  cartDetailQueryOptions,
  useCartQuery,
  useAddToCart,
  useUpdateCartItem,
  useRemoveFromCart,
  getCartItemCount,
} from "./useCart.js";
export type { CartFetchFn, AddToCartFn, UpdateCartItemFn, RemoveFromCartFn } from "./useCart.js";
export { useCartSync } from "./useCartSync.js";
export {
  ordersQueryOptions,
  orderDetailQueryOptions,
  useOrderRealtime,
  createOrdersRealtimeChannel,
} from "./useOrders.js";
export type {
  OrdersFetchFn,
  OrderDetailFetchFn,
  OrderWithBagCount,
  OrderBagWithItems,
  OrderWithBagsAndItems,
} from "./useOrders.js";
export type { OrderRefundRow } from "../types/orderPersistence.types.js";
export { useUser, useLogin, useRegister, useLogout } from "./useAuth.js";
export { profileQueryOptions, useProfile, useUpdateProfile, profileKeys } from "./useProfile.js";
export { useTracking, getDedupKey } from "./useTracking.js";
export {
  useBrowsingHistory,
  browsingHistoryKeys,
  browsingHistoryQueryOptions,
} from "./useBrowsingHistory.js";
export {
  wishlistKeys,
  wishlistQueryOptions,
  wishlistProductIdsQueryOptions,
  useWishlist,
  useWishlistProductIds,
  useIsInWishlist,
  useAddToWishlist,
  useRemoveFromWishlist,
} from "./useWishlist.js";
export { recommendationQueryOptions, useRecommendations } from "./useRecommendations.js";
export {
  recentlyViewedQueryOptions,
  useRecentlyViewed,
  getRecentlyViewedFromStorage,
  addToRecentlyViewedStorage,
} from "./useRecentlyViewed.js";
export type { UseRecentlyViewedOptions } from "./useRecentlyViewed.js";
export {
  mergeWithDefaults,
  notificationPreferencesQueryOptions,
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from "./useNotificationPreferences.js";
export { contentDetailQueryOptions, contentListQueryOptions } from "./useContent.js";
export type { ContentDetailFetchFn, ContentListFetchFn } from "./useContent.js";
