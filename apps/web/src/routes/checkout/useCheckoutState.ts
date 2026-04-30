/**
 * Shared types for the web checkout flow.
 *
 * Exported from this module so they can be shared across:
 * - checkoutStorage.ts (persistence)
 * - index.tsx (main page)
 * - PaymentForm.tsx (Stripe form)
 * - WalletCheckoutForm.tsx (Apple/Google Pay)
 *
 * The full useReducer will be extracted here in a future iteration.
 */

export type CheckoutStep =
  | "address"
  | "methods"
  | "confirmed"
  | "guestInfo"
  | "billing"
  | "payment";

export interface AddressFormState {
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Contact phone for carrier delivery notifications — optional per Violet docs. */
  phone: string;
}

export interface AddressFormErrors {
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}
