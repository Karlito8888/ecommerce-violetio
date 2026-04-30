export { formatPrice, formatDate } from "./formatPrice.js";
export { stripHtml } from "./stripHtml.js";
export { VIOLET_API_BASE, queryKeys } from "./constants.js";
export { mapAuthError, sanitizeRedirect } from "./authErrors.js";
export {
  buildPageMeta,
  buildProductJsonLd,
  buildItemListJsonLd,
  buildWebSiteJsonLd,
  buildBreadcrumbJsonLd,
  buildOrganizationJsonLd,
  wordCount,
} from "./seo.js";
export type { MetaTag, PageMetaOptions, BreadcrumbItem } from "./seo.js";
export { logError } from "./errorLogger.js";
export {
  deriveOrderStatusFromBags,
  getBagStatusSummary,
  BAG_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from "./orderStatusDerivation.js";
export { webUrlToMobilePath, mobilePushDataToPath, ROUTE_MAPPINGS } from "./deepLink.js";
export type { RouteMapping } from "./deepLink.js";
export { optimizeImageUrl, optimizeWithPreset, IMAGE_PRESETS } from "./imageOptimize.js";
export type { ImageResizeOptions, ImagePreset } from "./imageOptimize.js";
export { isValidSlug, CONTENT_TYPE_LABELS, CONTENT_FIELD_GUIDE } from "./contentValidation.js";
export { stripMarkdownSyntax } from "./stripMarkdown.js";
export {
  EEA_COUNTRIES,
  getSupportedCountries,
  COUNTRY_LABELS,
  getDefaultCountry,
} from "./eeaCountries.js";
export {
  convertPrice,
  formatLocalPrice,
  getDeliveryEstimate,
  getCurrencyForCountry,
  getCountryName,
  countryFlag,
  FALLBACK_EXCHANGE_RATES,
  setLiveExchangeRates,
  getActiveExchangeRates,
  COUNTRY_TO_CURRENCY,
  COUNTRY_NAMES,
} from "./currency.js";
export { getDiscountDisplay } from "./discountDisplay.js";
export type { DiscountDisplay, DiscountVariant } from "./discountDisplay.js";
export { ORDER_STATUS_MESSAGES } from "./orderMessages.js";

// guestToken and orderPersistence are server-only (use node:crypto).
// Import them directly: "@ecommerce/shared/src/utils/guestToken" / "orderPersistence"
// Do NOT re-export here — it breaks the client bundle.
