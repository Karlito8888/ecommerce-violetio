// packages/shared/src/hooks/convex/index.ts
//
// Barrel export for all Convex-based hooks.
//
// Consumers import from "@ecommerce/shared/hooks/convex" to use the new hooks.
// Old Supabase-based hooks remain available until Phase 11 (cleanup).

export {
  useWishlistConvex,
  useWishlistProductIdsConvex,
  useIsInWishlistConvex,
  useAddToWishlistConvex,
  useRemoveFromWishlistConvex,
} from "./useWishlist";

export { useRecordEvent, useUserEventsConvex } from "./useTracking";

export { useProfileConvex, useUpdateProfileConvex } from "./useProfile";

export { useOrdersConvex, useOrderDetailConvex, useGuestOrderByToken } from "./useOrders";

export { useContentPageBySlug, useFaqItemsConvex, useRelatedContent } from "./useContent";

export {
  useRecentInquiryCount,
  useInsertSupportInquiry,
  useUpdateInquiryStatus,
  useUpdateInternalNotes,
} from "./useSupport";

export {
  usePushTokensConvex,
  useNotificationPreferencesConvex,
  useUpsertPushToken,
  useDeletePushToken,
  useUpsertNotificationPreference,
} from "./useNotifications";
