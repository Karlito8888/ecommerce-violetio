/**
 * Checkout module — barrel export.
 *
 * @see checkoutReducer.ts — state machine (useReducer)
 * @see checkoutHooks.ts — per-step mutation hooks
 * @see checkoutSteps.tsx — per-step UI components
 * @see getCheckout.ts — API fetch functions
 */

export {
  checkoutReducer,
  initialCheckoutState,
  type CheckoutState,
  type CheckoutAction,
  type CheckoutStep,
  type AddressFields,
  type ShippingState,
  type GuestInfoState,
  type BillingState,
  type PaymentState,
} from "./checkoutReducer";

export {
  useAddressStep,
  useShippingStep,
  useGuestInfoStep,
  useBillingStep,
  usePaymentStep,
} from "./checkoutHooks";

export {
  AddressStep,
  ShippingStep,
  GuestInfoStep,
  BillingStep,
  PaymentStep,
  CheckoutHeader,
} from "./checkoutSteps";
