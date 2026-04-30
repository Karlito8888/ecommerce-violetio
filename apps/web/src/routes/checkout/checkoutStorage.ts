/**
 * Checkout form persistence via sessionStorage.
 *
 * Saves/restores checkout state so the user doesn't lose progress on page refresh.
 * Uses sessionStorage (not localStorage) — data is cleared when the tab closes.
 */

export const CHECKOUT_STORAGE_KEY = "checkout-form";

// Re-export types needed by storage consumers
export type { CheckoutStep, AddressFormState } from "./useCheckoutState";
import type { CheckoutStep, AddressFormState } from "./useCheckoutState";
import type { CustomerInput } from "@ecommerce/shared";

export interface CheckoutPersistedState {
  step: CheckoutStep;
  address: AddressFormState;
  selectedMethods: Record<string, string>;
  guestInfo: CustomerInput;
  billingSameAsShipping: boolean;
  billingAddress: AddressFormState;
}

export function readCheckoutStorage(): Partial<CheckoutPersistedState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<CheckoutPersistedState>) : {};
  } catch {
    return {};
  }
}

export function clearCheckoutStorage() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
  }
}

/**
 * Persist checkout form state to sessionStorage.
 * Called by the main CheckoutPage's useEffect.
 */
export function persistCheckoutStorage(state: CheckoutPersistedState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or private browsing — ignore silently
  }
}
