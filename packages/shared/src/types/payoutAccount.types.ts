/**
 * Prism Pay Account (PPA) types — Violet payout account tracking.
 *
 * A PPA wraps a Stripe Connect account (or EXTERNAL account) for a merchant.
 * Created during Violet Connect onboarding. Only one PPA is active per merchant
 * at any given time.
 *
 * @see https://docs.violet.io/prism/payments/payouts/prism-payout-accounts
 */

/** Payment provider backing the PPA. */
export type PayoutProvider = "STRIPE" | "EXTERNAL";

/** Stripe account type. */
export type StripeAccountType = "EXPRESS" | "STANDARD" | "CUSTOM";

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
