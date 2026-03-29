/** Configure environment variables for platforms without process.env (React Native) */
export {
  configureEnv,
  createSupabaseClient,
  _resetSupabaseClient,
  _setSupabaseClient,
} from "./supabase.js";
export type { SupabaseBrowserConfig, SupportedStorage } from "./supabase.js";
export {
  initAnonymousSession,
  signUpWithEmail,
  verifyEmailOtp,
  setAccountPassword,
  signInWithEmail,
  signOut,
} from "./auth.js";
export { violetLogin, violetRefreshToken, VioletTokenManager } from "./violetAuth.js";
export { getBiometricPreference, setBiometricPreference } from "./biometricAuth.js";
export { getProfile, updateProfile } from "./profile.js";
export type { SocialProvider } from "./auth.js";
export { signInWithSocialProvider, signInWithSocialProviderMobile } from "./auth.js";
export { recordEvent, getUserEvents } from "./tracking.js";
export {
  getWishlist,
  getWishlistProductIds,
  addToWishlist,
  removeFromWishlist,
} from "./wishlist.js";
export {
  upsertPushToken,
  deletePushToken,
  getUserPushTokens,
  getNotificationPreferences,
  upsertNotificationPreference,
} from "./notifications.js";
export { getContentPageBySlug, getContentPages, getRelatedContent } from "./content.js";
export type { RelatedContentItem } from "./content.js";
export { getFaqItems } from "./faq.js";
export { insertSupportInquiry, countRecentInquiries } from "./support.js";
export {
  resolveTimeRange,
  getDashboardMetrics,
  getCommissionSummary,
  refreshDashboardViews,
  getOrderDistributions,
} from "./admin.js";
export {
  getSupportInquiries,
  getSupportInquiry,
  updateInquiryStatus,
  updateInternalNotes,
  getLinkedOrder,
} from "./admin-support.js";
export { getHealthMetrics, getRecentErrors, getAlertRules } from "./health.js";
