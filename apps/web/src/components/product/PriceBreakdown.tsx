import {
  formatPrice,
  convertPrice,
  formatLocalPrice,
  getCurrencyForCountry,
} from "@ecommerce/shared";
import type { SKU, ShippingInfo } from "@ecommerce/shared";
import { useUserLocationSafe } from "../../contexts/UserLocationContext";

import "./PriceBreakdown.css";

/**
 * Transparent pricing display for the product detail page.
 *
 * ## Violet.io Pricing Best Practices
 *
 * - All amounts are **integer cents** — `formatPrice()` is the single conversion point
 * - `SKU.salePrice` = current selling price, `SKU.retailPrice` = original/compare-at price
 * - Discount display: only when `retailPrice > salePrice` — no fake "was $X" patterns
 * - Offer-level `minPrice`/`maxPrice` shown as range when no specific SKU is selected
 * - Shipping/tax estimates: "Calculated at checkout" — actual values come from Cart API (Story 4.3)
 *
 * ## Accessibility
 *
 * Rendered as `<dl>` (definition list) for screen readers — each price line is a
 * `<dt>`/`<dd>` pair, making the pricing structure machine-readable.
 *
 * @see https://docs.violet.io/concepts/skus — SKU pricing fields
 */
export default function PriceBreakdown({
  selectedSku,
  minPrice,
  maxPrice,
  currency,
  shippingInfo,
}: {
  selectedSku: SKU | null;
  minPrice: number;
  maxPrice: number;
  currency: string;
  shippingInfo?: ShippingInfo | null;
}) {
  const countryCode = useUserLocationSafe()?.countryCode ?? null;
  const hasDiscount = selectedSku && selectedSku.retailPrice > selectedSku.salePrice;
  const showRange = !selectedSku && minPrice !== maxPrice;

  // Local currency conversion (informational only)
  const localCurrency = countryCode ? getCurrencyForCountry(countryCode) : null;
  const showLocalCurrency = localCurrency && localCurrency !== currency;
  const displayPrice = selectedSku ? selectedSku.salePrice : minPrice;

  return (
    <dl className="price-breakdown">
      {/* Product price */}
      <div className="price-breakdown__row price-breakdown__row--main">
        <dt className="price-breakdown__label">Price</dt>
        <dd className="price-breakdown__value">
          {showRange ? (
            <span className="price-breakdown__range">
              From {formatPrice(minPrice, currency)} — {formatPrice(maxPrice, currency)}
            </span>
          ) : hasDiscount ? (
            <>
              <span className="price-breakdown__original">
                {formatPrice(selectedSku.retailPrice, currency)}
              </span>
              <span className="price-breakdown__sale">
                {formatPrice(selectedSku.salePrice, currency)}
              </span>
            </>
          ) : (
            formatPrice(displayPrice, currency)
          )}
          {showLocalCurrency && !showRange && (
            <span className="price-breakdown__local" title="Approximate. Charged in USD">
              {"\u2248 "}
              {formatLocalPrice(convertPrice(displayPrice, currency, localCurrency), localCurrency)}
            </span>
          )}
        </dd>
      </div>

      {/* Shipping estimate */}
      <div className="price-breakdown__row">
        <dt className="price-breakdown__label">Shipping</dt>
        <dd className="price-breakdown__value">
          {shippingInfo?.deliveryEstimate
            ? shippingInfo.deliveryEstimate.label
            : "Calculated at checkout"}
        </dd>
      </div>

      {/* Tax estimate */}
      <div className="price-breakdown__row">
        <dt className="price-breakdown__label">Tax</dt>
        <dd className="price-breakdown__value">Calculated at checkout</dd>
      </div>

      {/* Total */}
      <div className="price-breakdown__row price-breakdown__total">
        <dt className="price-breakdown__label">Estimated Total</dt>
        <dd className="price-breakdown__value">
          {showRange
            ? `From ${formatPrice(minPrice, currency)}`
            : formatPrice(displayPrice, currency)}
          {showLocalCurrency && !showRange && (
            <span className="price-breakdown__local" title="Approximate. Charged in USD">
              {"\u2248 "}
              {formatLocalPrice(convertPrice(displayPrice, currency, localCurrency), localCurrency)}
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}
