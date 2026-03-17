export { formatPrice, formatDate } from "./formatPrice.js";
export { stripHtml } from "./stripHtml.js";
export { VIOLET_API_BASE, queryKeys } from "./constants.js";
export { mapAuthError, sanitizeRedirect } from "./authErrors.js";
export {
  buildPageMeta,
  buildProductJsonLd,
  buildItemListJsonLd,
  buildWebSiteJsonLd,
} from "./seo.js";
export type { MetaTag, PageMetaOptions } from "./seo.js";
export { logError } from "./errorLogger.js";
export {
  deriveOrderStatusFromBags,
  getBagStatusSummary,
  BAG_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from "./orderStatusDerivation.js";
export { webUrlToMobilePath, mobilePushDataToPath, ROUTE_MAPPINGS } from "./deepLink.js";
export type { RouteMapping } from "./deepLink.js";
// guestToken and orderPersistence are server-only (use node:crypto).
// Import them directly: "@ecommerce/shared/src/utils/guestToken" / "orderPersistence"
// Do NOT re-export here — it breaks the client bundle.
