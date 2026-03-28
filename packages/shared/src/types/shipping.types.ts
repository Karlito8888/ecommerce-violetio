/**
 * Shipping and geo-filtering types for country-based catalog filtering
 * and delivery estimate display.
 */

/** A country within a merchant's shipping zone. */
export interface ShippingZone {
  countryCode: string;
  countryName: string;
}

/** Estimated delivery timeframe for a product. */
export interface DeliveryEstimate {
  minDays: number;
  maxDays: number;
  /** Human-readable label, e.g. "5-8 business days" */
  label: string;
}

/**
 * Shipping information attached to a Product after geo-processing.
 *
 * - `source === "SHOPIFY"`: real shipping zone data available
 * - `source === "OTHER"`: no zone data, product shown with "Shipping TBD"
 */
export interface ShippingInfo {
  shipsToUserCountry: boolean;
  shippingZones: ShippingZone[];
  deliveryEstimate: DeliveryEstimate | null;
  source: "SHOPIFY" | "OTHER";
}

/** A selectable country option for the country selector UI. */
export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  productCount: number;
}
