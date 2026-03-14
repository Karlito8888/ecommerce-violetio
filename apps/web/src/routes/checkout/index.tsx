import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCartContext } from "../../contexts/CartContext";
import { useCartQuery, queryKeys, formatPrice } from "@ecommerce/shared";
import type {
  CartFetchFn,
  ShippingMethodsAvailable,
  ShippingAddressInput,
} from "@ecommerce/shared";
import { getCartFn } from "../../server/cartActions";
import {
  setShippingAddressFn,
  getAvailableShippingMethodsFn,
  setShippingMethodsFn,
} from "../../server/checkout";

/**
 * /checkout — Shipping address + method selection (CSR, Story 4.3).
 *
 * ## Why no loader (CSR-only)
 * Stripe Elements (Story 4.4) requires client-side rendering. Keeping checkout
 * CSR also avoids server-side cart state management complexity.
 *
 * ## Flow enforced by this component
 * 1. Address form → `setShippingAddressFn` → `getAvailableShippingMethodsFn`
 * 2. Per-bag method selection
 * 3. "Continue to Payment" → `setShippingMethodsFn` → cart totals update
 *
 * The address MUST be submitted before methods are fetched — Violet's
 * `GET /shipping/available` returns empty results without a prior address.
 *
 * @see apps/web/src/server/checkout.ts — Server Functions
 * @see apps/web/src/styles/pages/checkout.css — BEM styles
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-address
 */
export const Route = createFileRoute("/checkout/")({
  component: CheckoutPage,
});

const fetchCart: CartFetchFn = (violetCartId) => getCartFn({ data: violetCartId });

/**
 * Countries supported by Violet's Stripe platform account (US/UK/EU).
 * Used for a client-side warning — Violet enforces the real restriction server-side.
 *
 * @see Story 4.3 AC#11 — country restriction enforcement (FR21)
 */
const SUPPORTED_COUNTRIES = [
  "US",
  "GB",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "BE",
  "AT",
  "PT",
  "FI",
  "SE",
  "DK",
  "NO",
  "IE",
  "PL",
  "CZ",
  "SK",
  "HU",
  "RO",
];

const EU_COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  BE: "Belgium",
  AT: "Austria",
  PT: "Portugal",
  FI: "Finland",
  SE: "Sweden",
  DK: "Denmark",
  NO: "Norway",
  IE: "Ireland",
  PL: "Poland",
  CZ: "Czech Republic",
  SK: "Slovakia",
  HU: "Hungary",
  RO: "Romania",
};

type CheckoutStep = "address" | "methods" | "confirmed";

interface AddressFormState {
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface AddressFormErrors {
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

function CheckoutPage() {
  const { violetCartId } = useCartContext();
  const queryClient = useQueryClient();
  const { data: cartResponse, isLoading: isCartLoading } = useCartQuery(violetCartId, fetchCart);
  const cart = cartResponse?.data ?? null;

  // ── Checkout flow step ──────────────────────────────────────────────
  const [step, setStep] = useState<CheckoutStep>("address");

  // ── Address form ────────────────────────────────────────────────────
  const [address, setAddress] = useState<AddressFormState>({
    address1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });
  const [addressErrors, setAddressErrors] = useState<AddressFormErrors>({});
  const [isAddressSubmitting, setIsAddressSubmitting] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // ── Shipping methods ────────────────────────────────────────────────
  const [availableMethods, setAvailableMethods] = useState<ShippingMethodsAvailable[]>([]);
  /** Tracks loading state per bag (key = bagId) */
  const [bagLoadingState, setBagLoadingState] = useState<Record<string, boolean>>({});
  /** Tracks error state per bag (key = bagId) */
  const [bagErrorState, setBagErrorState] = useState<Record<string, string>>({});
  /** Selected shipping method ID per bag (key = bagId) */
  const [selectedMethods, setSelectedMethods] = useState<Record<string, string>>({});

  // ── Continue to payment ─────────────────────────────────────────────
  const [isSubmittingShipping, setIsSubmittingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  // All bags must have a selection before enabling "Continue to Payment"
  const allBagsSelected =
    availableMethods.length > 0 &&
    availableMethods.every((bag) => Boolean(selectedMethods[bag.bagId]));

  // ── Address field change ────────────────────────────────────────────
  function handleAddressChange(field: keyof AddressFormState, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));

    // Clear error on change
    if (addressErrors[field]) {
      setAddressErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  // ── Address validation ──────────────────────────────────────────────
  function validateAddress(): boolean {
    const errors: AddressFormErrors = {};
    if (!address.address1.trim()) errors.address1 = "Street address is required";
    if (!address.city.trim()) errors.city = "City is required";
    if (!address.state.trim()) errors.state = "State / province is required";
    if (!address.postalCode.trim()) errors.postalCode = "Postal code is required";
    if (!address.country) errors.country = "Country is required";
    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Fetch available methods for all bags ────────────────────────────
  async function fetchAvailableShippingMethods() {
    if (!cart) return;

    // Mark all bags as loading
    const loadingMap: Record<string, boolean> = {};
    cart.bags.forEach((b) => (loadingMap[b.id] = true));
    setBagLoadingState(loadingMap);
    setBagErrorState({});

    const result = await getAvailableShippingMethodsFn();

    if (result.error) {
      // Mark all bags with error if the call itself fails
      const errorMap: Record<string, string> = {};
      cart.bags.forEach((b) => (errorMap[b.id] = result.error!.message));
      setBagErrorState(errorMap);
      setBagLoadingState({});
      return;
    }

    const methods = result.data ?? [];
    setAvailableMethods(methods);

    // Clear loading state for all bags
    setBagLoadingState({});

    // Mark bags with no methods as errors
    const errorMap: Record<string, string> = {};
    cart.bags.forEach((b) => {
      const found = methods.find((m) => m.bagId === b.id);
      if (!found || found.shippingMethods.length === 0) {
        errorMap[b.id] = "No shipping methods available for this merchant.";
      }
    });
    setBagErrorState(errorMap);

    // Auto-select if a bag has only one shipping option (AC#7)
    const autoSelections: Record<string, string> = {};
    for (const bagMethods of methods) {
      if (bagMethods.shippingMethods.length === 1) {
        autoSelections[bagMethods.bagId] = bagMethods.shippingMethods[0].id;
      }
    }
    if (Object.keys(autoSelections).length > 0) {
      setSelectedMethods((prev) => ({ ...autoSelections, ...prev }));
    }
  }

  // ── Address form submit ─────────────────────────────────────────────
  async function handleAddressSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAddress()) return;

    setIsAddressSubmitting(true);
    setAddressError(null);

    const addressInput: ShippingAddressInput = {
      address1: address.address1,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    };

    const result = await setShippingAddressFn({ data: addressInput });

    if (result.error) {
      setAddressError(result.error.message);
      setIsAddressSubmitting(false);
      return;
    }

    // Address accepted — now fetch available shipping methods
    setStep("methods");
    setIsAddressSubmitting(false);
    await fetchAvailableShippingMethods();
  }

  // ── Retry shipping methods for a specific bag ───────────────────────
  // Violet's API doesn't support per-bag retries — we refetch all bags.
  // `fetchAvailableShippingMethods` resets the full bagLoadingState immediately,
  // so we only clear the error for the retried bag before calling it.
  async function handleRetryBag(bagId: string) {
    setBagErrorState((prev) => {
      const next = { ...prev };
      delete next[bagId];
      return next;
    });
    await fetchAvailableShippingMethods();
  }

  // ── Continue to payment ─────────────────────────────────────────────
  async function handleContinueToPayment() {
    if (!allBagsSelected) return;

    setIsSubmittingShipping(true);
    setShippingError(null);

    const selections = Object.entries(selectedMethods).map(([bagId, shippingMethodId]) => ({
      bagId,
      shippingMethodId,
    }));

    const result = await setShippingMethodsFn({ data: { selections } });

    if (result.error) {
      setShippingError(result.error.message);
      setIsSubmittingShipping(false);
      return;
    }

    // Invalidate cart query so CartDrawer and other consumers see updated shippingTotal
    if (violetCartId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cart.detail(violetCartId) });
    }

    setStep("confirmed");
    setIsSubmittingShipping(false);
  }

  // Aggregate totals for sidebar
  const subtotalAll = cart?.bags.reduce((sum, b) => sum + b.subtotal, 0) ?? 0;
  const taxAll = cart?.bags.reduce((sum, b) => sum + b.tax, 0) ?? 0;
  const shippingAll = cart?.bags.reduce((sum, b) => sum + b.shippingTotal, 0) ?? 0;
  const totalAll = subtotalAll + taxAll + shippingAll;

  // ── Empty / loading states ──────────────────────────────────────────
  if (isCartLoading) {
    return (
      <div className="page-wrap">
        <div className="checkout">
          <div className="checkout__bag-loading">
            <div className="checkout__bag-loading-item" />
            <div className="checkout__bag-loading-item" />
            <div className="checkout__bag-loading-item" />
          </div>
        </div>
      </div>
    );
  }

  if (!violetCartId || !cart || cart.bags.length === 0) {
    return (
      <div className="page-wrap">
        <div className="checkout">
          <h1 className="checkout__title">Checkout</h1>
          <p>Your cart is empty. Add items before proceeding to checkout.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="checkout">
        <h1 className="checkout__title">Checkout</h1>

        <div className="checkout__layout">
          {/* ── Left: form ── */}
          <div className="checkout__form">
            {/* ── Section 1: Shipping address ── */}
            <section className="checkout__section" aria-labelledby="checkout-address-title">
              <h2 className="checkout__section-title" id="checkout-address-title">
                Shipping Address
              </h2>

              <form onSubmit={handleAddressSubmit} noValidate>
                <div
                  className={`checkout__field${addressErrors.address1 ? " checkout__field--error" : ""}`}
                >
                  <label className="checkout__field-label" htmlFor="address1">
                    Street Address
                  </label>
                  <input
                    id="address1"
                    className="checkout__field-input"
                    type="text"
                    value={address.address1}
                    onChange={(e) => handleAddressChange("address1", e.target.value)}
                    placeholder="123 Main Street"
                    autoComplete="street-address"
                    disabled={step !== "address"}
                  />
                  {addressErrors.address1 && (
                    <p className="checkout__field-error">{addressErrors.address1}</p>
                  )}
                </div>

                <div className="checkout__field-row checkout__field-row--3col">
                  <div
                    className={`checkout__field${addressErrors.city ? " checkout__field--error" : ""}`}
                  >
                    <label className="checkout__field-label" htmlFor="city">
                      City
                    </label>
                    <input
                      id="city"
                      className="checkout__field-input"
                      type="text"
                      value={address.city}
                      onChange={(e) => handleAddressChange("city", e.target.value)}
                      autoComplete="address-level2"
                      disabled={step !== "address"}
                    />
                    {addressErrors.city && (
                      <p className="checkout__field-error">{addressErrors.city}</p>
                    )}
                  </div>

                  <div
                    className={`checkout__field${addressErrors.state ? " checkout__field--error" : ""}`}
                  >
                    <label className="checkout__field-label" htmlFor="state">
                      State
                    </label>
                    <input
                      id="state"
                      className="checkout__field-input"
                      type="text"
                      value={address.state}
                      onChange={(e) => handleAddressChange("state", e.target.value)}
                      autoComplete="address-level1"
                      disabled={step !== "address"}
                    />
                    {addressErrors.state && (
                      <p className="checkout__field-error">{addressErrors.state}</p>
                    )}
                  </div>

                  <div
                    className={`checkout__field${addressErrors.postalCode ? " checkout__field--error" : ""}`}
                  >
                    <label className="checkout__field-label" htmlFor="postalCode">
                      ZIP / Postal
                    </label>
                    <input
                      id="postalCode"
                      className="checkout__field-input"
                      type="text"
                      value={address.postalCode}
                      onChange={(e) => handleAddressChange("postalCode", e.target.value)}
                      autoComplete="postal-code"
                      disabled={step !== "address"}
                    />
                    {addressErrors.postalCode && (
                      <p className="checkout__field-error">{addressErrors.postalCode}</p>
                    )}
                  </div>
                </div>

                <div
                  className={`checkout__field${addressErrors.country ? " checkout__field--error" : ""}`}
                >
                  <label className="checkout__field-label" htmlFor="country">
                    Country
                  </label>
                  <select
                    id="country"
                    className="checkout__field-select"
                    value={address.country}
                    onChange={(e) => handleAddressChange("country", e.target.value)}
                    autoComplete="country"
                    disabled={step !== "address"}
                  >
                    <option value="">Select a country…</option>
                    {SUPPORTED_COUNTRIES.map((code) => (
                      <option key={code} value={code}>
                        {EU_COUNTRY_LABELS[code] ?? code}
                      </option>
                    ))}
                  </select>
                  {addressErrors.country && (
                    <p className="checkout__field-error">{addressErrors.country}</p>
                  )}
                </div>

                {/* Address submission error */}
                {addressError && (
                  <p className="checkout__field-error" role="alert" style={{ marginTop: "1rem" }}>
                    {addressError}
                  </p>
                )}

                {step === "address" && (
                  <button
                    type="submit"
                    className="checkout__address-submit"
                    disabled={isAddressSubmitting}
                  >
                    {isAddressSubmitting ? "Saving address…" : "Continue →"}
                  </button>
                )}
              </form>

              {step !== "address" && (
                <p style={{ fontSize: "0.875rem", color: "var(--color-steel)", marginTop: "1rem" }}>
                  {address.address1}, {address.city}, {address.state} {address.postalCode},{" "}
                  {EU_COUNTRY_LABELS[address.country] ?? address.country}
                  {" · "}
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-sienna)",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: "inherit",
                      textDecoration: "underline",
                    }}
                    onClick={() => {
                      setStep("address");
                      setAvailableMethods([]);
                      setSelectedMethods({});
                    }}
                  >
                    Edit
                  </button>
                </p>
              )}
            </section>

            {/* ── Section 2: Shipping methods (shown after address submitted) ── */}
            {step !== "address" && (
              <section className="checkout__section" aria-labelledby="checkout-methods-title">
                <h2 className="checkout__section-title" id="checkout-methods-title">
                  Shipping Method
                </h2>

                <div className="checkout__shipping-methods">
                  {cart.bags.map((bag) => {
                    const isLoading = bagLoadingState[bag.id];
                    const error = bagErrorState[bag.id];
                    const bagMethods = availableMethods.find((m) => m.bagId === bag.id);

                    return (
                      <div key={bag.id}>
                        <p className="checkout__bag-title">
                          {bag.merchantName || `Merchant ${bag.merchantId}`}
                        </p>

                        {/* Per-bag loading skeleton (AC#12) */}
                        {isLoading && (
                          <div
                            className="checkout__bag-loading"
                            aria-label="Loading shipping methods…"
                          >
                            <div className="checkout__bag-loading-item" />
                            <div className="checkout__bag-loading-item" />
                          </div>
                        )}

                        {/* Per-bag error with retry (AC#10) */}
                        {!isLoading && error && (
                          <div className="checkout__bag-error" role="alert">
                            <span>{error}</span>
                            <button
                              type="button"
                              className="checkout__bag-error-retry"
                              onClick={() => handleRetryBag(bag.id)}
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {/* Shipping method options */}
                        {!isLoading && !error && bagMethods && (
                          <div role="group" aria-label={`Shipping options for ${bag.merchantName}`}>
                            {bagMethods.shippingMethods.length === 1 && (
                              <p
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--color-steel)",
                                  marginBottom: "0.5rem",
                                }}
                              >
                                Only one shipping option available — auto-selected.
                              </p>
                            )}
                            {bagMethods.shippingMethods.map((method) => {
                              const isSelected = selectedMethods[bag.id] === method.id;
                              return (
                                <div
                                  key={method.id}
                                  className={`checkout__method-option${isSelected ? " checkout__method-option--selected" : ""}`}
                                >
                                  <label className="checkout__method-label">
                                    <input
                                      type="radio"
                                      name={`shipping-${bag.id}`}
                                      value={method.id}
                                      checked={isSelected}
                                      onChange={() =>
                                        setSelectedMethods((prev) => ({
                                          ...prev,
                                          [bag.id]: method.id,
                                        }))
                                      }
                                    />
                                    <span className="checkout__method-info">
                                      <span className="checkout__method-name">{method.label}</span>
                                      {(method.minDays !== undefined ||
                                        method.carrier !== undefined) && (
                                        <span className="checkout__method-delivery">
                                          {method.carrier && `${method.carrier} · `}
                                          {method.minDays !== undefined &&
                                          method.maxDays !== undefined
                                            ? `${method.minDays}–${method.maxDays} days`
                                            : method.minDays !== undefined
                                              ? `${method.minDays}+ days`
                                              : ""}
                                        </span>
                                      )}
                                    </span>
                                    <span className="checkout__method-price">
                                      {method.price === 0 ? "FREE" : formatPrice(method.price)}
                                    </span>
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Shipping submission error */}
                {shippingError && (
                  <p
                    className="checkout__field-error"
                    role="alert"
                    style={{ marginTop: "1rem", marginBottom: "1rem" }}
                  >
                    {shippingError}
                  </p>
                )}

                {/* Confirmation message after successful selection */}
                {step === "confirmed" && (
                  <p
                    style={{
                      marginTop: "1rem",
                      color: "var(--color-success)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    ✓ Shipping confirmed. Payment coming in the next step.
                  </p>
                )}

                {/* Continue to Payment CTA — disabled until all bags selected (AC#4, #5) */}
                {step === "methods" && (
                  <button
                    type="button"
                    className={`checkout__submit${!allBagsSelected ? " checkout__submit--disabled" : ""}`}
                    style={{ marginTop: "1.5rem" }}
                    disabled={!allBagsSelected || isSubmittingShipping}
                    onClick={handleContinueToPayment}
                    aria-disabled={!allBagsSelected}
                  >
                    {isSubmittingShipping ? "Confirming shipping…" : "Continue to Payment"}
                  </button>
                )}
              </section>
            )}
          </div>

          {/* ── Right: Order summary sidebar ── */}
          <aside className="checkout__summary" aria-label="Order summary">
            <h2 className="checkout__summary-title">Order Summary</h2>

            {/* Items grouped by bag */}
            {cart.bags.map((bag) =>
              bag.items.map((item) => (
                <div key={item.skuId} className="checkout__summary-item">
                  {item.thumbnailUrl && (
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="checkout__summary-item-img"
                      aria-hidden="true"
                    />
                  )}
                  <div className="checkout__summary-item-info">
                    <p className="checkout__summary-item-name">
                      {item.name ?? `SKU ${item.skuId}`}
                    </p>
                    <p className="checkout__summary-item-qty">Qty: {item.quantity}</p>
                  </div>
                  <span className="checkout__summary-item-price">
                    {formatPrice(item.unitPrice * item.quantity)}
                  </span>
                </div>
              )),
            )}

            {/* Pricing totals */}
            <div className="checkout__summary-totals">
              <div className="checkout__summary-line">
                <span>Subtotal</span>
                <span>{formatPrice(subtotalAll)}</span>
              </div>
              <div className="checkout__summary-line">
                <span>Est. Shipping</span>
                <span>{shippingAll > 0 ? formatPrice(shippingAll) : "—"}</span>
              </div>
              <div className="checkout__summary-line">
                <span>Est. Tax</span>
                <span>{taxAll > 0 ? formatPrice(taxAll) : "—"}</span>
              </div>
              <div className="checkout__summary-line checkout__summary-line--total">
                <span>Total</span>
                <span>{formatPrice(totalAll)}</span>
              </div>
            </div>

            {/* Affiliate disclosure */}
            <p className="checkout__affiliate">
              We earn a commission on purchases — this doesn&apos;t affect your price.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
