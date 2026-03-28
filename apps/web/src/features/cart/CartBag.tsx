// Using shared formatPrice to avoid duplication — see packages/shared/src/utils/formatPrice.ts
import {
  formatPrice,
  getDeliveryEstimate,
  convertPrice,
  formatLocalPrice,
  getCurrencyForCountry,
} from "@ecommerce/shared";
import type { Bag } from "@ecommerce/shared";
import { useUserLocationSafe } from "../../contexts/UserLocationContext";
import CartItem from "./CartItem";

interface CartBagProps {
  bag: Bag;
  onUpdateQty: (orderSkuId: string, skuId: string, quantity: number) => void;
  onRemove: (orderSkuId: string, skuId: string) => void;
  isUpdating?: boolean;
}

/**
 * Merchant bag wrapper — groups items from one merchant within the cart drawer.
 *
 * Violet manages bag grouping automatically; we just render what they return.
 * Shows per-bag errors from the Violet 200-with-errors pattern (AC: #12).
 */
export default function CartBag({ bag, onUpdateQty, onRemove, isUpdating }: CartBagProps) {
  const countryCode = useUserLocationSafe()?.countryCode ?? null;

  // Compute estimated delivery date range based on user's country.
  // TODO: use actual merchant origin when Violet exposes merchant.country
  const merchantOrigin = "US";
  const estimate = countryCode ? getDeliveryEstimate(merchantOrigin, countryCode) : null;
  const deliveryDateRange = estimate
    ? formatDeliveryDateRange(estimate.minDays, estimate.maxDays)
    : null;

  // Local currency conversion (informational)
  const localCurrency = countryCode ? getCurrencyForCountry(countryCode) : null;
  const showLocal = localCurrency && localCurrency !== "USD";

  return (
    <div className="cart-drawer__bag">
      <p className="cart-drawer__bag-merchant">
        {bag.merchantName || `Merchant ${bag.merchantId}`}
      </p>

      {bag.errors.length > 0 && (
        <div className="cart-drawer__bag-errors" role="alert">
          {bag.errors.map((err, i) => (
            <p key={i} className="cart-drawer__bag-error">
              {err.message}
            </p>
          ))}
        </div>
      )}

      {bag.items.map((item) => (
        <CartItem
          key={item.skuId}
          item={item}
          onUpdateQty={onUpdateQty}
          onRemove={onRemove}
          isUpdating={isUpdating}
        />
      ))}

      <div className="cart-drawer__bag-subtotal">
        <span>Subtotal</span>
        <span>
          {formatPrice(bag.subtotal)}
          {showLocal && (
            <span className="cart-drawer__local-price">
              {"\u2248 "}
              {formatLocalPrice(convertPrice(bag.subtotal, "USD", localCurrency), localCurrency)}
            </span>
          )}
        </span>
      </div>
      <div className="cart-drawer__bag-tax">
        <span>Est. Tax</span>
        <span>{formatPrice(bag.tax)}</span>
      </div>
      <div className="cart-drawer__bag-shipping">
        <span>Est. Shipping</span>
        <span>
          {bag.shippingTotal > 0 ? formatPrice(bag.shippingTotal) : "Calculated at checkout"}
        </span>
      </div>
      {deliveryDateRange && (
        <div className="cart-drawer__bag-delivery">Est. delivery: {deliveryDateRange}</div>
      )}
    </div>
  );
}

function formatDeliveryDateRange(minDays: number, maxDays: number): string {
  const now = new Date();
  const minDate = new Date(now);
  minDate.setDate(now.getDate() + minDays);
  const maxDate = new Date(now);
  maxDate.setDate(now.getDate() + maxDays);

  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${fmt.format(minDate)}\u2013${fmt.format(maxDate)}`;
}
