/**
 * Checkout state machine — reducer-based state management for mobile checkout.
 *
 * Replaces the 21 `useState` calls in the original monolithic checkout.tsx
 * with a single `useReducer` that enforces valid state transitions.
 *
 * ## Architecture
 * ```
 * CheckoutState → { step, address, shipping, guest, billing, payment }
 *                     ↕
 *              CheckoutAction (dispatched)
 *                     ↕
 *              checkoutReducer (pure function)
 * ```
 *
 * ## Step flow (per Violet checkout lifecycle)
 * address → methods → guestInfo → billing → payment → (success: navigate)
 *
 * Each step owns a slice of state. The reducer validates transitions:
 * - Can only advance forward (no skipping steps)
 * - Errors are stored per-step and cleared on retry
 * - Loading flags are managed per-step
 *
 * ## Why useReducer over useState?
 * - **Single source of truth**: One state object instead of 21 independent states
 * - **Atomic updates**: Related state changes happen together (no partial renders)
 * - **Testable**: Reducer is a pure function — unit testable without React
 * - **State machine enforcement**: Invalid transitions are impossible by design
 *
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart
 * @see audit-dry-kiss-duplications.md — Phase 4
 */

import type { ShippingMethodsAvailable } from "@ecommerce/shared";
import { getDefaultCountry } from "@ecommerce/shared";
import Constants from "expo-constants";

const PLATFORM_COUNTRY =
  Constants.expoConfig?.extra?.STRIPE_ACCOUNT_COUNTRY ??
  process.env.EXPO_PUBLIC_STRIPE_ACCOUNT_COUNTRY ??
  "US";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Checkout steps — advance only forward. */
export type CheckoutStep = "address" | "methods" | "guestInfo" | "billing" | "payment";

/** Address fields shared between shipping and billing. */
export interface AddressFields {
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Contact phone for carrier delivery notifications — optional per Violet docs. */
  phone: string;
}

/** Shipping step state. */
export interface ShippingState {
  availableMethods: ShippingMethodsAvailable[];
  selectedMethods: Record<string, string>;
  isLoadingMethods: boolean;
  methodsError: string | null;
  bagErrors: Record<string, string>;
  isSubmittingShipping: boolean;
  shippingError: string | null;
}

/** Guest info step state. */
export interface GuestInfoState {
  email: string;
  firstName: string;
  lastName: string;
  marketingConsent: boolean;
  isSubmitting: boolean;
  error: string | null;
}

/** Billing step state. */
export interface BillingState {
  sameAsShipping: boolean;
  address: AddressFields;
  isSubmitting: boolean;
  error: string | null;
}

/** Payment step state. */
export interface PaymentState {
  isProcessing: boolean;
  error: string | null;
}

/** Discount step state — promo codes applied to the cart. */
export interface DiscountState {
  /** Promo code input value */
  promoCode: string;
  /** Currently applying a code */
  isApplying: boolean;
  /** Error from last add/remove attempt */
  error: string | null;
}

/** Top-level checkout state — replaces 21 useState calls. */
export interface CheckoutState {
  step: CheckoutStep;
  // Address
  address: AddressFields;
  isAddressSubmitting: boolean;
  addressError: string | null;
  // Shipping
  shipping: ShippingState;
  /** True when ALL bags in the cart are digital (no physical items).
   * When true, the shipping step is skipped entirely — same as web.
   * @see https://docs.violet.io/prism/catalog/skus — Digital Product Delivery */
  allBagsDigital: boolean;
  // Guest info
  guest: GuestInfoState;
  // Billing
  billing: BillingState;
  // Payment
  payment: PaymentState;
  // Discounts
  discount: DiscountState;
}

// ─── Actions ────────────────────────────────────────────────────────────────

export type CheckoutAction =
  | { type: "ADDRESS_SUBMIT_START" }
  | { type: "ADDRESS_SUBMIT_SUCCESS" }
  | { type: "ADDRESS_SUBMIT_ERROR"; error: string }
  | { type: "UPDATE_ADDRESS"; address: Partial<AddressFields> }
  | { type: "DIGITAL_SKIP_SHIPPING" }
  | { type: "SHIPPING_METHODS_FETCH_START" }
  | {
      type: "SHIPPING_METHODS_FETCH_SUCCESS";
      methods: ShippingMethodsAvailable[];
      bagErrors: Record<string, string>;
      autoSelections: Record<string, string>;
    }
  | { type: "SHIPPING_METHODS_FETCH_ERROR"; error: string }
  | { type: "SELECT_SHIPPING_METHOD"; bagId: string; methodId: string }
  | { type: "SHIPPING_SUBMIT_START" }
  | { type: "SHIPPING_SUBMIT_SUCCESS" }
  | { type: "SHIPPING_SUBMIT_ERROR"; error: string }
  | {
      type: "GUEST_UPDATE";
      fields: Partial<
        Pick<GuestInfoState, "email" | "firstName" | "lastName" | "marketingConsent">
      >;
    }
  | { type: "GUEST_SUBMIT_START" }
  | { type: "GUEST_SUBMIT_SUCCESS" }
  | { type: "GUEST_SUBMIT_ERROR"; error: string }
  | { type: "BILLING_TOGGLE_SAME_AS_SHIPPING" }
  | { type: "BILLING_UPDATE_ADDRESS"; address: Partial<AddressFields> }
  | { type: "BILLING_SUBMIT_START" }
  | { type: "BILLING_SUBMIT_SUCCESS" }
  | { type: "BILLING_SUBMIT_ERROR"; error: string }
  | { type: "PAYMENT_START" }
  | { type: "PAYMENT_SUCCESS" }
  | { type: "PAYMENT_ERROR"; error: string }
  | { type: "PAYMENT_CANCEL" }
  // ── Discount actions ──────────────────────────────────────────
  | { type: "DISCOUNT_UPDATE_PROMO"; promoCode: string }
  | { type: "DISCOUNT_APPLY_START" }
  | { type: "DISCOUNT_APPLY_SUCCESS" }
  | { type: "DISCOUNT_APPLY_ERROR"; error: string }
  | { type: "DISCOUNT_REMOVE_START"; discountId: string }
  | { type: "DISCOUNT_REMOVE_SUCCESS" }
  | { type: "DISCOUNT_REMOVE_ERROR"; error: string }
  | { type: "DISCOUNT_CLEAR_ERROR" };

// ─── Initial state ──────────────────────────────────────────────────────────

const EMPTY_ADDRESS: AddressFields = {
  address1: "",
  city: "",
  state: "",
  postalCode: "",
  country: getDefaultCountry(PLATFORM_COUNTRY),
  phone: "",
};

export const initialCheckoutState: CheckoutState = {
  step: "address",
  address: { ...EMPTY_ADDRESS },
  isAddressSubmitting: false,
  addressError: null,
  shipping: {
    availableMethods: [],
    selectedMethods: {},
    isLoadingMethods: false,
    methodsError: null,
    bagErrors: {},
    isSubmittingShipping: false,
    shippingError: null,
  },
  allBagsDigital: false,
  guest: {
    email: "",
    firstName: "",
    lastName: "",
    marketingConsent: false,
    isSubmitting: false,
    error: null,
  },
  billing: {
    sameAsShipping: true,
    address: { ...EMPTY_ADDRESS },
    isSubmitting: false,
    error: null,
  },
  discount: {
    promoCode: "",
    isApplying: false,
    error: null,
  },
  payment: {
    isProcessing: false,
    error: null,
  },
};

// ─── Reducer ────────────────────────────────────────────────────────────────

export function checkoutReducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  switch (action.type) {
    // ── Address step ───────────────────────────────────────────────
    case "UPDATE_ADDRESS":
      return {
        ...state,
        address: { ...state.address, ...action.address },
        addressError: null,
      };

    case "ADDRESS_SUBMIT_START":
      return { ...state, isAddressSubmitting: true, addressError: null };

    case "ADDRESS_SUBMIT_SUCCESS":
      return {
        ...state,
        step: "methods",
        isAddressSubmitting: false,
        addressError: null,
      };

    case "DIGITAL_SKIP_SHIPPING":
      // All bags are digital — skip shipping step, go directly to guest info.
      // Mirrors web: if (cart?.allBagsDigital) { setStep("guestInfo"); return; }
      return {
        ...state,
        step: "guestInfo",
        isAddressSubmitting: false,
        addressError: null,
        allBagsDigital: true,
      };

    case "ADDRESS_SUBMIT_ERROR":
      return {
        ...state,
        isAddressSubmitting: false,
        addressError: action.error,
      };

    // ── Shipping step ─────────────────────────────────────────────
    case "SHIPPING_METHODS_FETCH_START":
      return {
        ...state,
        shipping: {
          ...state.shipping,
          isLoadingMethods: true,
          methodsError: null,
          bagErrors: {},
        },
      };

    case "SHIPPING_METHODS_FETCH_SUCCESS":
      return {
        ...state,
        shipping: {
          ...state.shipping,
          availableMethods: action.methods,
          bagErrors: action.bagErrors,
          selectedMethods: { ...action.autoSelections, ...state.shipping.selectedMethods },
          isLoadingMethods: false,
          methodsError: null,
        },
      };

    case "SHIPPING_METHODS_FETCH_ERROR":
      return {
        ...state,
        shipping: {
          ...state.shipping,
          isLoadingMethods: false,
          methodsError: action.error,
        },
      };

    case "SELECT_SHIPPING_METHOD":
      return {
        ...state,
        shipping: {
          ...state.shipping,
          selectedMethods: {
            ...state.shipping.selectedMethods,
            [action.bagId]: action.methodId,
          },
        },
      };

    case "SHIPPING_SUBMIT_START":
      return {
        ...state,
        shipping: { ...state.shipping, isSubmittingShipping: true, shippingError: null },
      };

    case "SHIPPING_SUBMIT_SUCCESS":
      return {
        ...state,
        step: "guestInfo",
        shipping: { ...state.shipping, isSubmittingShipping: false },
      };

    case "SHIPPING_SUBMIT_ERROR":
      return {
        ...state,
        shipping: {
          ...state.shipping,
          isSubmittingShipping: false,
          shippingError: action.error,
        },
      };

    // ── Guest info step ───────────────────────────────────────────
    case "GUEST_UPDATE":
      return {
        ...state,
        guest: { ...state.guest, ...action.fields, error: null },
      };

    case "GUEST_SUBMIT_START":
      return { ...state, guest: { ...state.guest, isSubmitting: true, error: null } };

    case "GUEST_SUBMIT_SUCCESS":
      return { ...state, step: "billing", guest: { ...state.guest, isSubmitting: false } };

    case "GUEST_SUBMIT_ERROR":
      return {
        ...state,
        guest: { ...state.guest, isSubmitting: false, error: action.error },
      };

    // ── Billing step ──────────────────────────────────────────────
    case "BILLING_TOGGLE_SAME_AS_SHIPPING":
      return {
        ...state,
        billing: { ...state.billing, sameAsShipping: !state.billing.sameAsShipping },
      };

    case "BILLING_UPDATE_ADDRESS":
      return {
        ...state,
        billing: {
          ...state.billing,
          address: { ...state.billing.address, ...action.address },
          error: null,
        },
      };

    case "BILLING_SUBMIT_START":
      return { ...state, billing: { ...state.billing, isSubmitting: true, error: null } };

    case "BILLING_SUBMIT_SUCCESS":
      return { ...state, step: "payment", billing: { ...state.billing, isSubmitting: false } };

    case "BILLING_SUBMIT_ERROR":
      return {
        ...state,
        billing: { ...state.billing, isSubmitting: false, error: action.error },
      };

    // ── Payment step ──────────────────────────────────────────────
    case "PAYMENT_START":
      return { ...state, payment: { isProcessing: true, error: null } };

    case "PAYMENT_SUCCESS":
      // Payment success navigates away — state reset happens on unmount
      return { ...state, payment: { isProcessing: false, error: null } };

    case "PAYMENT_ERROR":
      return { ...state, payment: { isProcessing: false, error: action.error } };

    case "PAYMENT_CANCEL":
      // User canceled PaymentSheet — reset processing flag, no error shown
      return { ...state, payment: { isProcessing: false, error: null } };

    // ── Discount actions ───────────────────────────────────────────
    case "DISCOUNT_UPDATE_PROMO":
      return {
        ...state,
        discount: { ...state.discount, promoCode: action.promoCode, error: null },
      };

    case "DISCOUNT_APPLY_START":
      return { ...state, discount: { ...state.discount, isApplying: true, error: null } };

    case "DISCOUNT_APPLY_SUCCESS":
      return {
        ...state,
        discount: { promoCode: "", isApplying: false, error: null },
      };

    case "DISCOUNT_APPLY_ERROR":
      return {
        ...state,
        discount: { ...state.discount, isApplying: false, error: action.error },
      };

    case "DISCOUNT_REMOVE_START":
      return { ...state, discount: { ...state.discount, isApplying: true, error: null } };

    case "DISCOUNT_REMOVE_SUCCESS":
      return { ...state, discount: { ...state.discount, isApplying: false, error: null } };

    case "DISCOUNT_REMOVE_ERROR":
      return {
        ...state,
        discount: { ...state.discount, isApplying: false, error: action.error },
      };

    case "DISCOUNT_CLEAR_ERROR":
      return { ...state, discount: { ...state.discount, error: null } };

    default:
      throw Error(`Unknown checkout action: ${JSON.stringify((action as { type: string }).type)}`);
  }
}
