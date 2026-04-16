/**
 * Prism Pay Account (PPA) types — Violet payout account tracking.
 *
 * A PPA wraps a Stripe Connect account (or EXTERNAL account) for a merchant.
 * Created during Violet Connect onboarding. Only one PPA is active per merchant
 * at any given time.
 *
 * @see https://docs.violet.io/prism/payments/payouts/prism-payout-accounts
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account
 */

/** Payment provider backing the PPA. */
export type PayoutProvider = "STRIPE" | "NUVEI" | "CREDOVA" | "EXTERNAL";

/** Account type in the payment provider. */
export type PayoutProviderAccountType = "EXPRESS" | "STANDARD" | "CUSTOM" | "PLATFORM";

/** Account type entity in Violet. */
export type VioletAccountType = "MERCHANT" | "DEVELOPER";

/** Stripe account type (deprecated alias — use PayoutProviderAccountType). */
export type StripeAccountType = PayoutProviderAccountType;

/** Stripe KYC requirements for a Connect account. */
export interface StripeRequirements {
  alternatives: string[];
  currently_due: string[];
  errors: string[];
  eventually_due: string[];
  past_due: string[];
  pending_verification: string[];
}

/** Stripe account details embedded in the PPA. */
export interface StripeProviderAccount {
  account_id: string;
  account_type: StripeAccountType;
  email?: string;
  banking_country: string;
  banking_currency: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements: StripeRequirements;
  date_created?: string;
  date_last_modified?: string;
}

/** Supabase row type for the `merchant_payout_accounts` table. */
export interface MerchantPayoutAccountRow {
  id: string;
  violet_payout_account_id: string;
  merchant_id: string;
  app_id: string | null;
  is_active: boolean;
  country_code: string | null;
  payment_provider: PayoutProvider;
  payment_provider_account_id: string | null;
  account_type: string | null;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
  banking_country: string | null;
  banking_currency: string | null;
  requirements: StripeRequirements | null;
  currently_due: string[];
  past_due: string[];
  pending_verification: string[];
  errors: unknown[];
  date_created: string;
  date_last_modified: string;
  synced_at: string;
}

/**
 * Error associated to a Payout Account from the Violet API.
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account
 */
export interface PayoutAccountError {
  id: number;
  payout_account_id: number;
  error_code: number | null;
  error_message: string;
  resolved: boolean | null;
  date_resolved: string | null;
  date_created: string | null;
}

/**
 * Payout Account from the Violet API.
 *
 * Full model from `GET /payments/{account_type}/{account_id}/payout_account`
 * with `extended=true` to include Stripe Connect account details.
 *
 * @see https://docs.violet.io/api-reference/payments/payout-accounts/get-payout-account
 */
export interface VioletPayoutAccount {
  /** Unique identifier for the Payout Account in Violet. */
  id: number;
  /** Type of account entity — MERCHANT or DEVELOPER. */
  account_type: VioletAccountType | null;
  /** ID of the account entity (merchant_id or developer_id). */
  account_id: number | null;
  /** Merchant ID. */
  merchant_id: number | null;
  /** App ID this PPA is associated with. */
  app_id: number | null;
  /** Whether this is the currently active PPA for the merchant-app pair. */
  is_active: boolean;
  /** ISO-3166-1 alpha-2 country code of the bank. */
  country_code: string | null;
  /** Payment provider: STRIPE, NUVEI, CREDOVA, or EXTERNAL. */
  payment_provider: PayoutProvider;
  /** ID of the payout account in the payment provider system. */
  payment_provider_account_id: string | null;
  /** Type of account in the payment provider (EXPRESS, STANDARD, CUSTOM, PLATFORM). */
  payment_provider_account_type: PayoutProviderAccountType | null;
  /** Metadata from the payment provider. */
  payment_provider_metadata: Record<string, unknown> | null;
  /** Stripe Connect account details (only with extended=true). */
  payment_provider_account: {
    account_id: string;
    account_type: string;
    email?: string;
    banking_country: string;
    banking_currency: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    requirements?: Partial<StripeRequirements>;
    date_created?: string;
    date_last_modified?: string;
  } | null;
  /** Time at which this PPA was deactivated. */
  date_deactivated: string | null;
  /** Errors associated with this PPA. */
  errors: PayoutAccountError[];
  /** Time at which the object was created. */
  date_created: string | null;
  /** Time at which the object was last modified. */
  date_last_modified: string | null;
}
