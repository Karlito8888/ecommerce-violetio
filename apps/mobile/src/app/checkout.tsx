/**
 * Checkout screen — full checkout flow: address → methods → guest info → payment.
 *
 * ## Architecture
 * Calls the web backend API Routes (`/api/cart/{cartId}/...`) for all Violet API calls.
 * The Violet token NEVER reaches this client — it stays in the web backend.
 *
 * ## Flow (enforced by component state)
 * Story 4.3: address → methods (shipping)
 * Story 4.4: guestInfo → billing → payment (customer + billing + Stripe PaymentSheet)
 *
 * ## Stripe PaymentSheet
 * Mobile uses `@stripe/stripe-react-native` PaymentSheet — a native UI that
 * handles card input, Apple Pay, and Google Pay. Much simpler than web's
 * PaymentElement because it's a pre-built modal.
 *
 * @see apps/web/src/routes/api/cart/ — API Routes
 * @see apps/web/src/routes/checkout/index.tsx — web equivalent
 */

import React, { useCallback, useState, useRef } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useStripe } from "@stripe/stripe-react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import {
  formatPrice,
  COUNTRIES_WITHOUT_POSTAL_CODE,
  BLOCKED_ADDRESS_USER_MESSAGE,
} from "@ecommerce/shared";
import type { ShippingMethodsAvailable } from "@ecommerce/shared";
import { useSetStripeKey } from "./_layout";
import { apiGet, apiPost } from "@/server/apiClient";

/** SecureStore key for the Violet cart ID (set by the cart screen on cart creation). */
const CART_KEY = "violet_cart_id";

interface AddressFields {
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Contact phone for carrier delivery notifications — optional per Violet docs. */
  phone: string;
}

type CheckoutStep = "address" | "methods" | "guestInfo" | "billing" | "payment";

export default function CheckoutScreen() {
  const [step, setStep] = useState<CheckoutStep>("address");
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { setStripePublishableKey } = useSetStripeKey();

  // ── Address state ───────────────────────────────────────────────────
  const [address, setAddress] = useState<AddressFields>({
    address1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
    phone: "",
  });
  const [isAddressSubmitting, setIsAddressSubmitting] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // ── Shipping methods state ──────────────────────────────────────────
  const [availableMethods, setAvailableMethods] = useState<ShippingMethodsAvailable[]>([]);
  const [isLoadingMethods, setIsLoadingMethods] = useState(false);
  const [methodsError, setMethodsError] = useState<string | null>(null);
  const [bagErrorState, setBagErrorState] = useState<Record<string, string>>({});
  const [selectedMethods, setSelectedMethods] = useState<Record<string, string>>({});

  // ── Payment CTA state ───────────────────────────────────────────────
  const [isSubmittingShipping, setIsSubmittingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  // ── Guest info (Story 4.4) ──────────────────────────────────────────
  const [guestEmail, setGuestEmail] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isGuestSubmitting, setIsGuestSubmitting] = useState(false);

  // ── Billing address (Story 4.4) ────────────────────────────────────
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingAddress, setBillingAddress] = useState({
    address1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
    phone: "",
  });
  const [billingError, setBillingError] = useState<string | null>(null);
  const [isBillingSubmitting, setIsBillingSubmitting] = useState(false);

  // ── Payment (Story 4.4) ─────────────────────────────────────────────
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  /**
   * Stable order ID for idempotency — generated once per checkout session.
   * Reused for retries to prevent duplicate orders.
   */
  const appOrderIdRef = useRef(crypto.randomUUID());

  const allBagsSelected =
    availableMethods.length > 0 &&
    availableMethods.every((bag) => Boolean(selectedMethods[bag.bagId]));

  // ── Fetch available shipping methods ────────────────────────────────
  const fetchAvailableShippingMethods = useCallback(async (violetCartId: string) => {
    setIsLoadingMethods(true);
    setMethodsError(null);
    setBagErrorState({});

    try {
      const json = await apiGet<{
        data?: ShippingMethodsAvailable[];
        error?: { message?: string };
      }>(`/api/cart/${violetCartId}/shipping/available`);

      if (json.error) {
        setMethodsError(json.error.message ?? "Failed to load shipping options");
        return;
      }

      const methods: ShippingMethodsAvailable[] = json.data ?? [];
      setAvailableMethods(methods);

      const bagErrors: Record<string, string> = {};
      for (const bag of methods) {
        if (bag.shippingMethods.length === 0) {
          bagErrors[bag.bagId] = "No shipping methods available for this merchant.";
        }
      }
      setBagErrorState(bagErrors);

      // Auto-select bags with only one shipping option (AC#7)
      const autoSelections: Record<string, string> = {};
      for (const bag of methods) {
        if (bag.shippingMethods.length === 1) {
          autoSelections[bag.bagId] = bag.shippingMethods[0].id;
        }
      }
      if (Object.keys(autoSelections).length > 0) {
        setSelectedMethods((prev) => ({ ...autoSelections, ...prev }));
      }
    } catch {
      setMethodsError("Network error loading shipping options. Please try again.");
    } finally {
      setIsLoadingMethods(false);
    }
  }, []);

  // ── Address submit ──────────────────────────────────────────────────
  const handleAddressSubmit = useCallback(async () => {
    // Postal code is required for most countries but exempt for ~60 countries.
    // @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/customers — Postal Code Requirements
    const postalCodeRequired = !COUNTRIES_WITHOUT_POSTAL_CODE.has(address.country);
    if (
      !address.address1.trim() ||
      !address.city.trim() ||
      !address.state.trim() ||
      (postalCodeRequired && !address.postalCode.trim()) ||
      !address.country.trim()
    ) {
      setAddressError("All address fields are required.");
      return;
    }

    const violetCartId = await SecureStore.getItemAsync(CART_KEY);
    if (!violetCartId) {
      setAddressError("No active cart found. Please add items to your cart first.");
      return;
    }

    setIsAddressSubmitting(true);
    setAddressError(null);

    try {
      const body: Record<string, string> = {
        address_1: address.address1,
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: address.country,
      };
      if (address.phone.trim()) {
        body.phone = address.phone.trim();
      }

      const json = await apiPost<{ error?: { message?: string; code?: string } }>(
        `/api/cart/${violetCartId}/shipping_address`,
        body,
      );

      if (json.error) {
        const errMsg = json.error.message ?? "";
        // Detect Violet's blocked address error (code 4236)
        if (
          errMsg.includes("blocked_address") ||
          errMsg.includes("blocked due to a history") ||
          json.error.code === "VIOLET.BLOCKED_ADDRESS"
        ) {
          setAddressError(BLOCKED_ADDRESS_USER_MESSAGE);
        } else {
          setAddressError(errMsg);
        }
        return;
      }

      setStep("methods");
      await fetchAvailableShippingMethods(violetCartId);
    } catch {
      setAddressError("Network error. Please check your connection and try again.");
    } finally {
      setIsAddressSubmitting(false);
    }
  }, [address, fetchAvailableShippingMethods]);

  // ── Retry shipping methods ──────────────────────────────────────────
  const handleRetry = useCallback(async () => {
    const violetCartId = await SecureStore.getItemAsync(CART_KEY);
    if (violetCartId) await fetchAvailableShippingMethods(violetCartId);
  }, [fetchAvailableShippingMethods]);

  /**
   * Confirms shipping method selections and advances to guest info step.
   * All early-return paths set an error state so the user always knows why
   * the action failed — silent returns are a critical UX bug.
   */
  const handleContinueToGuestInfo = useCallback(async () => {
    if (!allBagsSelected) return;

    const violetCartId = await SecureStore.getItemAsync(CART_KEY);
    if (!violetCartId) {
      setShippingError("Cart session expired. Please return to your cart.");
      return;
    }

    setIsSubmittingShipping(true);
    setShippingError(null);

    try {
      const selections = Object.entries(selectedMethods).map(([bagId, shippingMethodId]) => ({
        bag_id: Number(bagId),
        shipping_method_id: shippingMethodId,
      }));

      const json = await apiPost<{ error?: { message?: string } }>(
        `/api/cart/${violetCartId}/shipping`,
        selections,
      );

      if (json.error) {
        setShippingError(json.error.message ?? "Failed to confirm shipping");
        return;
      }

      setStep("guestInfo");
    } catch {
      setShippingError("Network error. Please try again.");
    } finally {
      setIsSubmittingShipping(false);
    }
  }, [allBagsSelected, selectedMethods]);

  /**
   * Submits guest customer info and advances to billing step.
   * All early-return paths set an error state so the user always knows why
   * the action failed — silent returns are a critical UX bug.
   */
  const handleGuestInfoSubmit = useCallback(async () => {
    if (!guestEmail.trim() || !guestFirstName.trim() || !guestLastName.trim()) {
      setGuestError("Email, first name, and last name are required.");
      return;
    }

    const violetCartId = await SecureStore.getItemAsync(CART_KEY);
    if (!violetCartId) {
      setGuestError("Cart session expired. Please return to your cart.");
      return;
    }

    setIsGuestSubmitting(true);
    setGuestError(null);

    try {
      const customerBody: Record<string, unknown> = {
        email: guestEmail,
        first_name: guestFirstName,
        last_name: guestLastName,
      };
      if (marketingConsent) {
        customerBody.communication_preferences = [{ enabled: true }];
      }

      const customerJson = await apiPost<{ error?: { message?: string } }>(
        `/api/cart/${violetCartId}/customer`,
        customerBody,
      );

      if (customerJson.error) {
        setGuestError(customerJson.error.message ?? "Failed to save customer info");
        return;
      }

      setStep("billing");
    } catch {
      setGuestError("Network error. Please try again.");
    } finally {
      setIsGuestSubmitting(false);
    }
  }, [guestEmail, guestFirstName, guestLastName, marketingConsent]);

  /**
   * Confirms billing address, fetches the Stripe payment intent, and
   * initializes the PaymentSheet. All early-return paths set an error
   * state so the user always knows why the action failed.
   */
  const handleBillingConfirm = useCallback(async () => {
    const violetCartId = await SecureStore.getItemAsync(CART_KEY);
    if (!violetCartId) {
      setBillingError("Cart session expired. Please return to your cart.");
      return;
    }

    setIsBillingSubmitting(true);
    setBillingError(null);

    try {
      // If different billing address, send to Violet
      if (!billingSameAsShipping) {
        if (
          !billingAddress.address1.trim() ||
          !billingAddress.city.trim() ||
          !billingAddress.state.trim() ||
          (!billingAddress.postalCode.trim() &&
            !COUNTRIES_WITHOUT_POSTAL_CODE.has(billingAddress.country)) ||
          !billingAddress.country.trim()
        ) {
          setBillingError("All billing address fields are required.");
          setIsBillingSubmitting(false);
          return;
        }

        const billingJson = await apiPost<{ error?: { message?: string } }>(
          `/api/cart/${violetCartId}/billing_address`,
          {
            address_1: billingAddress.address1,
            city: billingAddress.city,
            state: billingAddress.state,
            postal_code: billingAddress.postalCode,
            country: billingAddress.country,
          },
        );

        if (billingJson.error) {
          setBillingError(billingJson.error.message ?? "Failed to set billing address");
          setIsBillingSubmitting(false);
          return;
        }
      }

      // Get payment intent (client secret + stripe key)
      const piJson = await apiGet<{
        data?: { clientSecret?: string; stripePublishableKey?: string };
        error?: { message?: string };
      }>(`/api/cart/${violetCartId}/payment-intent`);

      if (piJson.error || !piJson.data) {
        setBillingError(piJson.error?.message ?? "Failed to load payment information.");
        setIsBillingSubmitting(false);
        return;
      }

      const clientSecret = piJson.data.clientSecret;
      if (!clientSecret) {
        setBillingError("Payment not available. Cart may need to be recreated.");
        setIsBillingSubmitting(false);
        return;
      }

      // Use the Stripe publishable key from Violet's cart response
      const violetStripeKey = piJson.data.stripePublishableKey;
      if (violetStripeKey) {
        setStripePublishableKey(violetStripeKey);
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: "Maison Émile",
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
      });

      if (initError) {
        setBillingError(`Payment setup failed: ${initError.message}`);
        setIsBillingSubmitting(false);
        return;
      }

      setStep("payment");
    } catch {
      setBillingError("Network error. Please try again.");
    } finally {
      setIsBillingSubmitting(false);
    }
  }, [billingSameAsShipping, billingAddress, initPaymentSheet]);

  /**
   * Presents the Stripe PaymentSheet and submits the order to Violet on success.
   *
   * Cart ID and auth token must be validated BEFORE presenting the PaymentSheet.
   * If checked after, the user's card could be authorized but the order never
   * submitted — the worst possible UX outcome.
   */
  const handlePayment = useCallback(async () => {
    // Validate cart ID BEFORE presenting PaymentSheet
    const violetCartId = await SecureStore.getItemAsync(CART_KEY);
    if (!violetCartId) {
      setPaymentError("Cart session expired. Please return to your cart.");
      return;
    }

    setIsPaymentProcessing(true);
    setPaymentError(null);

    try {
      const { error: sheetError } = await presentPaymentSheet();

      if (sheetError) {
        if (sheetError.code !== "Canceled") {
          setPaymentError(sheetError.message ?? "Payment failed. Please try again.");
        }
        setIsPaymentProcessing(false);
        return;
      }

      const submitJson = await apiPost<{
        data?: { status?: string; id?: string };
        error?: { message?: string };
      }>(`/api/cart/${violetCartId}/submit`, {
        app_order_id: appOrderIdRef.current,
      });

      if (submitJson.error) {
        setPaymentError(
          "Payment was authorized but order submission failed. Your card was not charged. Please try again or contact support.",
        );
        setIsPaymentProcessing(false);
        return;
      }

      const orderData = submitJson.data;

      if (orderData?.status === "REJECTED") {
        setPaymentError("Your order was rejected. Please try a different payment method.");
        setIsPaymentProcessing(false);
        return;
      }

      if (orderData?.status === "REQUIRES_ACTION") {
        setPaymentError(
          "Additional verification was required. Your payment may still be processing. Please check your email for confirmation.",
        );
        setIsPaymentProcessing(false);
        return;
      }

      if (orderData?.status === "CANCELED") {
        setPaymentError(
          "Your order was canceled by the merchant. Your card was not charged. Please try again.",
        );
        setIsPaymentProcessing(false);
        return;
      }

      // Success — clear cart and navigate to confirmation page
      await SecureStore.deleteItemAsync("violet_cart_id");
      const orderId = String(orderData?.id ?? "");
      router.push(`/order/${orderId}/confirmation` as never);
    } catch {
      setPaymentError("Network error. Please try again.");
    } finally {
      setIsPaymentProcessing(false);
    }
  }, [presentPaymentSheet]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* ── Header ── */}
        <ThemedView style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ThemedText style={styles.backText}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.title}>Checkout</ThemedText>
        </ThemedView>

        {/* ── Address section ── */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>SHIPPING ADDRESS</ThemedText>

          <ThemedText style={styles.fieldLabel}>Street Address</ThemedText>
          <TextInput
            style={styles.input}
            value={address.address1}
            onChangeText={(v) => setAddress((p) => ({ ...p, address1: v }))}
            placeholder="123 Main Street"
            autoComplete="street-address"
            editable={step === "address"}
          />

          <View style={styles.row}>
            <View style={styles.rowFieldWide}>
              <ThemedText style={styles.fieldLabel}>City</ThemedText>
              <TextInput
                style={styles.input}
                value={address.city}
                onChangeText={(v) => setAddress((p) => ({ ...p, city: v }))}
                autoComplete="address-line2"
                editable={step === "address"}
              />
            </View>
            <View style={styles.rowFieldNarrow}>
              <ThemedText style={styles.fieldLabel}>State</ThemedText>
              <TextInput
                style={styles.input}
                value={address.state}
                onChangeText={(v) => setAddress((p) => ({ ...p, state: v }))}
                autoComplete="address-line1"
                editable={step === "address"}
              />
            </View>
          </View>

          <ThemedText style={styles.fieldLabel}>ZIP / Postal Code</ThemedText>
          <TextInput
            style={styles.input}
            value={address.postalCode}
            onChangeText={(v) => setAddress((p) => ({ ...p, postalCode: v }))}
            autoComplete="postal-code"
            keyboardType="numbers-and-punctuation"
            editable={step === "address"}
          />

          <ThemedText style={styles.fieldLabel}>Country</ThemedText>
          <TextInput
            style={styles.input}
            value={address.country}
            onChangeText={(v) => setAddress((p) => ({ ...p, country: v.toUpperCase() }))}
            placeholder="US"
            autoCapitalize="characters"
            maxLength={2}
            editable={step === "address"}
          />

          <ThemedText style={styles.fieldLabel}>Phone (optional)</ThemedText>
          <TextInput
            style={styles.input}
            value={address.phone}
            onChangeText={(v) => setAddress((p) => ({ ...p, phone: v }))}
            placeholder="+1 555 123 4567"
            autoComplete="tel"
            keyboardType="phone-pad"
            editable={step === "address"}
          />

          {addressError && <ThemedText style={styles.errorText}>{addressError}</ThemedText>}

          {step === "address" && (
            <TouchableOpacity
              style={[styles.primaryButton, isAddressSubmitting && styles.buttonDisabled]}
              onPress={handleAddressSubmit}
              disabled={isAddressSubmitting}
            >
              {isAddressSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>Continue →</ThemedText>
              )}
            </TouchableOpacity>
          )}
        </ThemedView>

        {/* ── Shipping methods section ── */}
        {step !== "address" && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>SHIPPING METHOD</ThemedText>

            {isLoadingMethods && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" />
                <ThemedText style={styles.loadingText}>
                  Fetching shipping rates from carriers…
                </ThemedText>
                <ThemedText style={styles.loadingSubText}>(This may take a few seconds)</ThemedText>
              </View>
            )}

            {!isLoadingMethods && methodsError && (
              <View style={styles.bagError}>
                <ThemedText style={styles.errorText}>{methodsError}</ThemedText>
                <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                  <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
                </TouchableOpacity>
              </View>
            )}

            {!isLoadingMethods &&
              !methodsError &&
              availableMethods.map((bagMethods) => (
                <View key={bagMethods.bagId} style={styles.bagSection}>
                  <ThemedText style={styles.bagTitle}>Bag {bagMethods.bagId}</ThemedText>

                  {bagErrorState[bagMethods.bagId] ? (
                    <View style={styles.bagError}>
                      <ThemedText style={styles.errorText}>
                        {bagErrorState[bagMethods.bagId]}
                      </ThemedText>
                      <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                        <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
                      </TouchableOpacity>
                    </View>
                  ) : bagMethods.shippingMethods.length === 0 ? null : (
                    <>
                      {bagMethods.shippingMethods.length === 1 && (
                        <ThemedText style={styles.autoSelectNote}>
                          Only one option — auto-selected.
                        </ThemedText>
                      )}
                      {bagMethods.shippingMethods.map((method) => {
                        const isSelected = selectedMethods[bagMethods.bagId] === method.id;
                        return (
                          <TouchableOpacity
                            key={method.id}
                            style={[styles.methodOption, isSelected && styles.methodOptionSelected]}
                            onPress={() =>
                              setSelectedMethods((prev) => ({
                                ...prev,
                                [bagMethods.bagId]: method.id,
                              }))
                            }
                            accessibilityRole="radio"
                            accessibilityState={{ checked: isSelected }}
                          >
                            <View style={styles.methodOptionContent}>
                              <View style={styles.methodRadio}>
                                <View
                                  style={[
                                    styles.methodRadioInner,
                                    isSelected && styles.methodRadioInnerSelected,
                                  ]}
                                />
                              </View>
                              <View style={styles.methodInfo}>
                                <ThemedText style={styles.methodName}>{method.label}</ThemedText>
                                {(method.carrier !== undefined || method.minDays !== undefined) && (
                                  <ThemedText style={styles.methodDelivery}>
                                    {method.carrier ? `${method.carrier} · ` : ""}
                                    {method.minDays !== undefined && method.maxDays !== undefined
                                      ? `${method.minDays}–${method.maxDays} days`
                                      : method.minDays !== undefined
                                        ? `${method.minDays}+ days`
                                        : ""}
                                  </ThemedText>
                                )}
                              </View>
                              <ThemedText style={styles.methodPrice}>
                                {method.price === 0 ? "FREE" : formatPrice(method.price)}
                              </ThemedText>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}
                </View>
              ))}

            {shippingError && (
              <ThemedText style={[styles.errorText, { marginTop: Spacing.two }]}>
                {shippingError}
              </ThemedText>
            )}

            {step !== "methods" && (
              <ThemedText style={styles.confirmedText}>✓ Shipping confirmed.</ThemedText>
            )}

            {step === "methods" && (
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (!allBagsSelected || isSubmittingShipping) && styles.buttonDisabled,
                  { marginTop: Spacing.three },
                ]}
                onPress={handleContinueToGuestInfo}
                disabled={!allBagsSelected || isSubmittingShipping}
                accessibilityState={{ disabled: !allBagsSelected }}
              >
                {isSubmittingShipping ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryButtonText}>Continue to Payment</ThemedText>
                )}
              </TouchableOpacity>
            )}
          </ThemedView>
        )}

        {/* ── Guest info section (Story 4.4) ── */}
        {(step === "guestInfo" || step === "billing" || step === "payment") && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>CONTACT INFORMATION</ThemedText>

            <ThemedText style={styles.fieldLabel}>Email</ThemedText>
            <TextInput
              style={styles.input}
              value={guestEmail}
              onChangeText={setGuestEmail}
              placeholder="you@example.com"
              autoComplete="email"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={step === "guestInfo"}
            />

            <View style={styles.row}>
              <View style={styles.rowFieldWide}>
                <ThemedText style={styles.fieldLabel}>First Name</ThemedText>
                <TextInput
                  style={styles.input}
                  value={guestFirstName}
                  onChangeText={setGuestFirstName}
                  autoComplete="given-name"
                  editable={step === "guestInfo"}
                />
              </View>
              <View style={styles.rowFieldNarrow}>
                <ThemedText style={styles.fieldLabel}>Last Name</ThemedText>
                <TextInput
                  style={styles.input}
                  value={guestLastName}
                  onChangeText={setGuestLastName}
                  autoComplete="family-name"
                  editable={step === "guestInfo"}
                />
              </View>
            </View>

            {/* Marketing consent toggle — unchecked by default per FR20 */}
            <TouchableOpacity
              style={styles.consentRow}
              onPress={() => step === "guestInfo" && setMarketingConsent((v) => !v)}
              disabled={step !== "guestInfo"}
            >
              <View style={[styles.consentCheckbox, marketingConsent && styles.consentChecked]}>
                {marketingConsent && <ThemedText style={styles.consentCheckmark}>✓</ThemedText>}
              </View>
              <ThemedText style={styles.consentLabel}>
                Receive updates and offers from merchants
              </ThemedText>
            </TouchableOpacity>

            {guestError && <ThemedText style={styles.errorText}>{guestError}</ThemedText>}

            {step === "guestInfo" && (
              <TouchableOpacity
                style={[styles.primaryButton, isGuestSubmitting && styles.buttonDisabled]}
                onPress={handleGuestInfoSubmit}
                disabled={isGuestSubmitting}
              >
                {isGuestSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryButtonText}>Continue to Payment →</ThemedText>
                )}
              </TouchableOpacity>
            )}

            {(step === "billing" || step === "payment") && (
              <ThemedText style={styles.confirmedText}>
                ✓ {guestEmail} · {guestFirstName} {guestLastName}
              </ThemedText>
            )}
          </ThemedView>
        )}

        {/* ── Billing address section (Story 4.4) ── */}
        {(step === "billing" || step === "payment") && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>BILLING ADDRESS</ThemedText>

            <TouchableOpacity
              style={styles.consentRow}
              onPress={() => step === "billing" && setBillingSameAsShipping((v) => !v)}
              disabled={step !== "billing"}
            >
              <View
                style={[styles.consentCheckbox, billingSameAsShipping && styles.consentChecked]}
              >
                {billingSameAsShipping && (
                  <ThemedText style={styles.consentCheckmark}>✓</ThemedText>
                )}
              </View>
              <ThemedText style={styles.consentLabel}>Same as shipping address</ThemedText>
            </TouchableOpacity>

            {!billingSameAsShipping && step === "billing" && (
              <>
                <ThemedText style={styles.fieldLabel}>Street Address</ThemedText>
                <TextInput
                  style={styles.input}
                  value={billingAddress.address1}
                  onChangeText={(v) => setBillingAddress((p) => ({ ...p, address1: v }))}
                  placeholder="123 Main Street"
                />

                <View style={styles.row}>
                  <View style={styles.rowFieldWide}>
                    <ThemedText style={styles.fieldLabel}>City</ThemedText>
                    <TextInput
                      style={styles.input}
                      value={billingAddress.city}
                      onChangeText={(v) => setBillingAddress((p) => ({ ...p, city: v }))}
                    />
                  </View>
                  <View style={styles.rowFieldNarrow}>
                    <ThemedText style={styles.fieldLabel}>State</ThemedText>
                    <TextInput
                      style={styles.input}
                      value={billingAddress.state}
                      onChangeText={(v) => setBillingAddress((p) => ({ ...p, state: v }))}
                    />
                  </View>
                </View>

                <ThemedText style={styles.fieldLabel}>ZIP / Postal Code</ThemedText>
                <TextInput
                  style={styles.input}
                  value={billingAddress.postalCode}
                  onChangeText={(v) => setBillingAddress((p) => ({ ...p, postalCode: v }))}
                  keyboardType="numbers-and-punctuation"
                />

                <ThemedText style={styles.fieldLabel}>Country</ThemedText>
                <TextInput
                  style={styles.input}
                  value={billingAddress.country}
                  onChangeText={(v) =>
                    setBillingAddress((p) => ({ ...p, country: v.toUpperCase() }))
                  }
                  placeholder="US"
                  autoCapitalize="characters"
                  maxLength={2}
                />
              </>
            )}

            {billingError && <ThemedText style={styles.errorText}>{billingError}</ThemedText>}

            {step === "billing" && (
              <TouchableOpacity
                style={[styles.primaryButton, isBillingSubmitting && styles.buttonDisabled]}
                onPress={handleBillingConfirm}
                disabled={isBillingSubmitting}
              >
                {isBillingSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryButtonText}>Continue to Payment →</ThemedText>
                )}
              </TouchableOpacity>
            )}

            {step === "payment" && (
              <ThemedText style={styles.confirmedText}>
                {billingSameAsShipping
                  ? "✓ Same as shipping address"
                  : `✓ ${billingAddress.address1}, ${billingAddress.city}`}
              </ThemedText>
            )}
          </ThemedView>
        )}

        {/* ── Payment section (Story 4.4) ── */}
        {step === "payment" && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>PAYMENT</ThemedText>

            <ThemedText style={styles.paymentInfo}>
              Tap the button below to enter your payment details securely via Stripe.
            </ThemedText>

            {paymentError && (
              <ThemedText style={[styles.errorText, { marginBottom: Spacing.two }]}>
                {paymentError}
              </ThemedText>
            )}

            <TouchableOpacity
              style={[styles.placeOrderButton, isPaymentProcessing && styles.buttonDisabled]}
              onPress={handlePayment}
              disabled={isPaymentProcessing}
            >
              {isPaymentProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.placeOrderText}>Place Order</ThemedText>
              )}
            </TouchableOpacity>
          </ThemedView>
        )}

        {/* Affiliate disclosure */}
        {/* <ThemedText style={styles.affiliate}>
          We earn a commission on purchases — this doesn't affect your price.
        </ThemedText> */}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: Spacing.three, paddingBottom: Spacing.five },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  backButton: { paddingVertical: Spacing.one, paddingRight: Spacing.two },
  backText: { fontSize: 14 },
  title: { fontSize: 24, fontWeight: "600" },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e8e4df",
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: Spacing.three,
    opacity: 0.6,
  },
  fieldLabel: { fontSize: 13, fontWeight: "500", marginBottom: Spacing.one, opacity: 0.8 },
  input: {
    borderWidth: 1,
    borderColor: "#d5cec6",
    borderRadius: 8,
    padding: Spacing.two,
    fontSize: 15,
    marginBottom: Spacing.two,
    color: "#1a1a1a",
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row", gap: Spacing.two },
  rowFieldWide: { flex: 2 },
  rowFieldNarrow: { flex: 1 },
  errorText: { color: "#b54a4a", fontSize: 13, marginTop: Spacing.one },
  primaryButton: {
    backgroundColor: "#2c2c2c",
    borderRadius: 8,
    padding: Spacing.three,
    alignItems: "center",
    marginTop: Spacing.two,
  },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  loadingContainer: { alignItems: "center", paddingVertical: Spacing.four, gap: Spacing.two },
  loadingText: { fontSize: 14, textAlign: "center" },
  loadingSubText: { fontSize: 12, opacity: 0.6, textAlign: "center" },
  bagError: { gap: Spacing.two },
  retryButton: {
    borderWidth: 1,
    borderColor: "#b54a4a",
    borderRadius: 6,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    alignSelf: "flex-start",
  },
  retryButtonText: { color: "#b54a4a", fontSize: 13 },
  bagSection: { marginBottom: Spacing.three },
  bagTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
    opacity: 0.6,
    textTransform: "uppercase",
  },
  autoSelectNote: { fontSize: 12, opacity: 0.6, marginBottom: Spacing.one },
  methodOption: {
    borderWidth: 1,
    borderColor: "#d5cec6",
    borderRadius: 8,
    marginBottom: Spacing.one,
  },
  methodOptionSelected: { borderColor: "#8b7355", backgroundColor: "rgba(139, 115, 85, 0.05)" },
  methodOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.two,
    gap: Spacing.two,
  },
  methodRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#8b7355",
    alignItems: "center",
    justifyContent: "center",
  },
  methodRadioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "transparent" },
  methodRadioInnerSelected: { backgroundColor: "#8b7355" },
  methodInfo: { flex: 1 },
  methodName: { fontSize: 15, fontWeight: "500" },
  methodDelivery: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  methodPrice: { fontSize: 15, fontWeight: "500" },
  confirmedText: { color: "#5a7a4a", fontWeight: "500", fontSize: 14, marginTop: Spacing.two },
  // ── Story 4.4 additions ──
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.one,
    marginBottom: Spacing.two,
  },
  consentCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#8b7355",
    alignItems: "center",
    justifyContent: "center",
  },
  consentChecked: { backgroundColor: "#8b7355" },
  consentCheckmark: { color: "#fff", fontSize: 12, fontWeight: "700" },
  consentLabel: { fontSize: 13, flex: 1, opacity: 0.8 },
  paymentInfo: { fontSize: 14, opacity: 0.7, marginBottom: Spacing.three, lineHeight: 20 },
  placeOrderButton: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: Spacing.three,
    alignItems: "center",
  },
  placeOrderText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  affiliate: { fontSize: 12, opacity: 0.5, textAlign: "center", marginTop: Spacing.two },
});
