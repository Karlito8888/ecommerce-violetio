/**
 * Step components for the checkout flow.
 *
 * Each component renders its step's UI and delegates actions to the parent
 * via callbacks. No API calls, no dispatch — pure presentation + event handling.
 *
 * ## Pattern
 * ```
 * <AddressStep state={state} onUpdate={updateAddress} onSubmit={submit} />
 *          ↕ callbacks
 * Parent (CheckoutScreen) → hooks → reducer → API
 * ```
 *
 * @see checkoutReducer.ts — state shape per step
 * @see checkoutHooks.ts — mutation logic per step
 */

import React from "react";
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { formatPrice } from "@ecommerce/shared";
import type { ShippingMethodsAvailable } from "@ecommerce/shared";
import type { CheckoutState, AddressFields } from "./checkoutReducer";

// ─── Shared UI helpers ──────────────────────────────────────────────────────

/** Section card wrapper used by all steps. */
function Section({ children }: { children: React.ReactNode }) {
  return <ThemedView style={styles.section}>{children}</ThemedView>;
}

/** Section title (uppercase, muted). */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <ThemedText style={styles.sectionTitle}>{children}</ThemedText>;
}

/** Field label. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <ThemedText style={styles.fieldLabel}>{children}</ThemedText>;
}

/** Error text block. */
function ErrorText({ children }: { children: React.ReactNode }) {
  return <ThemedText style={styles.errorText}>{children}</ThemedText>;
}

/** Primary CTA button. */
function PrimaryButton({
  onPress,
  disabled,
  loading,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryButton, (disabled || loading) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <ThemedText style={styles.primaryButtonText}>{children}</ThemedText>
      )}
    </TouchableOpacity>
  );
}

/** Checkbox row (marketing consent, same as shipping). */
function CheckboxRow({
  checked,
  onToggle,
  label,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.consentRow} onPress={onToggle} disabled={disabled}>
      <View style={[styles.consentCheckbox, checked && styles.consentChecked]}>
        {checked && <ThemedText style={styles.consentCheckmark}>✓</ThemedText>}
      </View>
      <ThemedText style={styles.consentLabel}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

// ─── Address Fields Form ────────────────────────────────────────────────────

/** Reusable address form fields (shipping + billing). */
function AddressFormFields({
  address,
  onChange,
  editable,
}: {
  address: AddressFields;
  onChange: (fields: Partial<AddressFields>) => void;
  editable: boolean;
}) {
  return (
    <>
      <FieldLabel>Street Address</FieldLabel>
      <TextInput
        style={styles.input}
        value={address.address1}
        onChangeText={(v) => onChange({ address1: v })}
        placeholder="123 Main Street"
        autoComplete="street-address"
        editable={editable}
      />

      <View style={styles.row}>
        <View style={styles.rowFieldWide}>
          <FieldLabel>City</FieldLabel>
          <TextInput
            style={styles.input}
            value={address.city}
            onChangeText={(v) => onChange({ city: v })}
            autoComplete="address-line2"
            editable={editable}
          />
        </View>
        <View style={styles.rowFieldNarrow}>
          <FieldLabel>State</FieldLabel>
          <TextInput
            style={styles.input}
            value={address.state}
            onChangeText={(v) => onChange({ state: v })}
            autoComplete="address-line1"
            editable={editable}
          />
        </View>
      </View>

      <FieldLabel>ZIP / Postal Code</FieldLabel>
      <TextInput
        style={styles.input}
        value={address.postalCode}
        onChangeText={(v) => onChange({ postalCode: v })}
        autoComplete="postal-code"
        keyboardType="numbers-and-punctuation"
        editable={editable}
      />

      <FieldLabel>Country</FieldLabel>
      <TextInput
        style={styles.input}
        value={address.country}
        onChangeText={(v) => onChange({ country: v.toUpperCase() })}
        placeholder="US"
        autoCapitalize="characters"
        maxLength={2}
        editable={editable}
      />

      <FieldLabel>Phone (optional)</FieldLabel>
      <TextInput
        style={styles.input}
        value={address.phone}
        onChangeText={(v) => onChange({ phone: v })}
        placeholder="+1 555 123 4567"
        autoComplete="tel"
        keyboardType="phone-pad"
        editable={editable}
      />
    </>
  );
}

// ─── Address Step ────────────────────────────────────────────────────────────

export function AddressStep({
  state,
  onUpdate,
  onSubmit,
}: {
  state: CheckoutState;
  onUpdate: (fields: Partial<AddressFields>) => void;
  onSubmit: () => void;
}) {
  return (
    <Section>
      <SectionTitle>SHIPPING ADDRESS</SectionTitle>
      <AddressFormFields
        address={state.address}
        onChange={onUpdate}
        editable={state.step === "address"}
      />
      {state.addressError && <ErrorText>{state.addressError}</ErrorText>}
      {state.step === "address" && (
        <PrimaryButton onPress={onSubmit} loading={state.isAddressSubmitting}>
          Continue →
        </PrimaryButton>
      )}
    </Section>
  );
}

// ─── Shipping Step ───────────────────────────────────────────────────────────

export function ShippingStep({
  state,
  onSelectMethod,
  onRetry,
  onSubmit,
  allBagsSelected,
}: {
  state: CheckoutState;
  onSelectMethod: (bagId: string, methodId: string) => void;
  onRetry: () => void;
  onSubmit: () => void;
  allBagsSelected: boolean;
}) {
  const { shipping, step } = state;

  if (step === "address") return null;

  return (
    <Section>
      <SectionTitle>SHIPPING METHOD</SectionTitle>

      {shipping.isLoadingMethods && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.loadingText}>Fetching shipping rates from carriers…</ThemedText>
          <ThemedText style={styles.loadingSubText}>(This may take a few seconds)</ThemedText>
        </View>
      )}

      {!shipping.isLoadingMethods && shipping.methodsError && (
        <View style={styles.bagError}>
          <ErrorText>{shipping.methodsError}</ErrorText>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {!shipping.isLoadingMethods &&
        !shipping.methodsError &&
        shipping.availableMethods.map((bagMethods) => (
          <BagMethodSelector
            key={bagMethods.bagId}
            bagMethods={bagMethods}
            bagError={shipping.bagErrors[bagMethods.bagId]}
            selectedMethodId={shipping.selectedMethods[bagMethods.bagId]}
            onSelect={onSelectMethod}
            onRetry={onRetry}
          />
        ))}

      {shipping.shippingError && (
        <ThemedText style={[styles.errorText, { marginTop: Spacing.two }]}>
          {shipping.shippingError}
        </ThemedText>
      )}

      {step !== "methods" && (
        <ThemedText style={styles.confirmedText}>✓ Shipping confirmed.</ThemedText>
      )}

      {step === "methods" && (
        <PrimaryButton
          onPress={onSubmit}
          disabled={!allBagsSelected || shipping.isSubmittingShipping}
          loading={shipping.isSubmittingShipping}
        >
          Continue to Payment
        </PrimaryButton>
      )}
    </Section>
  );
}

/** Bag-level shipping method selector. */
function BagMethodSelector({
  bagMethods,
  bagError,
  selectedMethodId,
  onSelect,
  onRetry,
}: {
  bagMethods: ShippingMethodsAvailable;
  bagError?: string;
  selectedMethodId?: string;
  onSelect: (bagId: string, methodId: string) => void;
  onRetry: () => void;
}) {
  return (
    <View style={styles.bagSection}>
      <ThemedText style={styles.bagTitle}>Bag {bagMethods.bagId}</ThemedText>

      {bagError ? (
        <View style={styles.bagError}>
          <ErrorText>{bagError}</ErrorText>
          <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      ) : bagMethods.shippingMethods.length === 0 ? null : (
        <>
          {bagMethods.shippingMethods.length === 1 && (
            <ThemedText style={styles.autoSelectNote}>Only one option — auto-selected.</ThemedText>
          )}
          {bagMethods.shippingMethods.map((method) => {
            const isSelected = selectedMethodId === method.id;
            return (
              <TouchableOpacity
                key={method.id}
                style={[styles.methodOption, isSelected && styles.methodOptionSelected]}
                onPress={() => onSelect(bagMethods.bagId, method.id)}
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
  );
}

// ─── Guest Info Step ─────────────────────────────────────────────────────────

export function GuestInfoStep({
  state,
  onUpdate,
  onSubmit,
}: {
  state: CheckoutState;
  onUpdate: (
    fields: Partial<
      Pick<typeof state.guest, "email" | "firstName" | "lastName" | "marketingConsent">
    >,
  ) => void;
  onSubmit: () => void;
}) {
  const { step, guest } = state;

  if (step !== "guestInfo" && step !== "billing" && step !== "payment") return null;

  return (
    <Section>
      <SectionTitle>CONTACT INFORMATION</SectionTitle>

      <FieldLabel>Email</FieldLabel>
      <TextInput
        style={styles.input}
        value={guest.email}
        onChangeText={(v) => onUpdate({ email: v })}
        placeholder="you@example.com"
        autoComplete="email"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={step === "guestInfo"}
      />

      <View style={styles.row}>
        <View style={styles.rowFieldWide}>
          <FieldLabel>First Name</FieldLabel>
          <TextInput
            style={styles.input}
            value={guest.firstName}
            onChangeText={(v) => onUpdate({ firstName: v })}
            autoComplete="given-name"
            editable={step === "guestInfo"}
          />
        </View>
        <View style={styles.rowFieldNarrow}>
          <FieldLabel>Last Name</FieldLabel>
          <TextInput
            style={styles.input}
            value={guest.lastName}
            onChangeText={(v) => onUpdate({ lastName: v })}
            autoComplete="family-name"
            editable={step === "guestInfo"}
          />
        </View>
      </View>

      <CheckboxRow
        checked={guest.marketingConsent}
        onToggle={() =>
          step === "guestInfo" && onUpdate({ marketingConsent: !guest.marketingConsent })
        }
        label="Receive updates and offers from merchants"
        disabled={step !== "guestInfo"}
      />

      {guest.error && <ErrorText>{guest.error}</ErrorText>}

      {step === "guestInfo" && (
        <PrimaryButton onPress={onSubmit} loading={guest.isSubmitting}>
          Continue to Payment →
        </PrimaryButton>
      )}

      {(step === "billing" || step === "payment") && (
        <ThemedText style={styles.confirmedText}>
          ✓ {guest.email} · {guest.firstName} {guest.lastName}
        </ThemedText>
      )}
    </Section>
  );
}

// ─── Billing Step ────────────────────────────────────────────────────────────

export function BillingStep({
  state,
  onToggleSameAsShipping,
  onUpdateAddress,
  onSubmit,
}: {
  state: CheckoutState;
  onToggleSameAsShipping: () => void;
  onUpdateAddress: (fields: Partial<AddressFields>) => void;
  onSubmit: () => void;
}) {
  const { step, billing } = state;

  if (step !== "billing" && step !== "payment") return null;

  return (
    <Section>
      <SectionTitle>BILLING ADDRESS</SectionTitle>

      <CheckboxRow
        checked={billing.sameAsShipping}
        onToggle={onToggleSameAsShipping}
        label="Same as shipping address"
        disabled={step !== "billing"}
      />

      {!billing.sameAsShipping && step === "billing" && (
        <>
          <FieldLabel>Street Address</FieldLabel>
          <TextInput
            style={styles.input}
            value={billing.address.address1}
            onChangeText={(v) => onUpdateAddress({ address1: v })}
            placeholder="123 Main Street"
          />

          <View style={styles.row}>
            <View style={styles.rowFieldWide}>
              <FieldLabel>City</FieldLabel>
              <TextInput
                style={styles.input}
                value={billing.address.city}
                onChangeText={(v) => onUpdateAddress({ city: v })}
              />
            </View>
            <View style={styles.rowFieldNarrow}>
              <FieldLabel>State</FieldLabel>
              <TextInput
                style={styles.input}
                value={billing.address.state}
                onChangeText={(v) => onUpdateAddress({ state: v })}
              />
            </View>
          </View>

          <FieldLabel>ZIP / Postal Code</FieldLabel>
          <TextInput
            style={styles.input}
            value={billing.address.postalCode}
            onChangeText={(v) => onUpdateAddress({ postalCode: v })}
            keyboardType="numbers-and-punctuation"
          />

          <FieldLabel>Country</FieldLabel>
          <TextInput
            style={styles.input}
            value={billing.address.country}
            onChangeText={(v) => onUpdateAddress({ country: v.toUpperCase() })}
            placeholder="US"
            autoCapitalize="characters"
            maxLength={2}
          />
        </>
      )}

      {billing.error && <ErrorText>{billing.error}</ErrorText>}

      {step === "billing" && (
        <PrimaryButton onPress={onSubmit} loading={billing.isSubmitting}>
          Continue to Payment →
        </PrimaryButton>
      )}

      {step === "payment" && (
        <ThemedText style={styles.confirmedText}>
          {billing.sameAsShipping
            ? "✓ Same as shipping address"
            : `✓ ${billing.address.address1}, ${billing.address.city}`}
        </ThemedText>
      )}
    </Section>
  );
}

// ─── Payment Step ────────────────────────────────────────────────────────────

export function PaymentStep({ state, onSubmit }: { state: CheckoutState; onSubmit: () => void }) {
  if (state.step !== "payment") return null;

  return (
    <Section>
      <SectionTitle>PAYMENT</SectionTitle>

      <ThemedText style={styles.paymentInfo}>
        Tap the button below to enter your payment details securely via Stripe.
      </ThemedText>

      {state.payment.error && (
        <ThemedText style={[styles.errorText, { marginBottom: Spacing.two }]}>
          {state.payment.error}
        </ThemedText>
      )}

      <TouchableOpacity
        style={[styles.placeOrderButton, state.payment.isProcessing && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={state.payment.isProcessing}
      >
        {state.payment.isProcessing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.placeOrderText}>Place Order</ThemedText>
        )}
      </TouchableOpacity>
    </Section>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────────

export function CheckoutHeader() {
  return (
    <ThemedView style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <ThemedText style={styles.backText}>← Back</ThemedText>
      </TouchableOpacity>
      <ThemedText style={styles.title}>Checkout</ThemedText>
    </ThemedView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Layout
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e8e4df",
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  backButton: { paddingVertical: Spacing.one, paddingRight: Spacing.two },
  backText: { fontSize: 14 },
  title: { fontSize: 24, fontWeight: "600" },

  // ── Typography
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: Spacing.three,
    opacity: 0.6,
  },
  fieldLabel: { fontSize: 13, fontWeight: "500", marginBottom: Spacing.one, opacity: 0.8 },
  errorText: { color: "#b54a4a", fontSize: 13, marginTop: Spacing.one },
  confirmedText: { color: "#5a7a4a", fontWeight: "500", fontSize: 14, marginTop: Spacing.two },

  // ── Inputs
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

  // ── Buttons
  primaryButton: {
    backgroundColor: "#2c2c2c",
    borderRadius: 8,
    padding: Spacing.three,
    alignItems: "center",
    marginTop: Spacing.two,
  },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  placeOrderButton: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: Spacing.three,
    alignItems: "center",
  },
  placeOrderText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },

  // ── Loading
  loadingContainer: { alignItems: "center", paddingVertical: Spacing.four, gap: Spacing.two },
  loadingText: { fontSize: 14, textAlign: "center" },
  loadingSubText: { fontSize: 12, opacity: 0.6, textAlign: "center" },

  // ── Shipping methods
  bagSection: { marginBottom: Spacing.three },
  bagTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
    opacity: 0.6,
    textTransform: "uppercase",
  },
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

  // ── Checkbox
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

  // ── Payment
  paymentInfo: { fontSize: 14, opacity: 0.7, marginBottom: Spacing.three, lineHeight: 20 },
});
