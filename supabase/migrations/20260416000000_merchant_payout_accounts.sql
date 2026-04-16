-- Migration: merchant_payout_accounts table
--
-- Stores Violet Prism Pay Account (PPA) data for each connected merchant.
-- Populated via webhooks: MERCHANT_PAYOUT_ACCOUNT_CREATED,
-- MERCHANT_PAYOUT_ACCOUNT_REQUIREMENTS_UPDATED.
--
-- Tracks Stripe KYC status (charges_enabled, payouts_enabled) and
-- Stripe requirements (currently_due, past_due, pending_verification)
-- for proactive monitoring and alerting.
--
-- One active PPA per merchant per app. Violet may create multiple PPAs
-- but only one is active at a time (is_active = true).
--
-- @see https://docs.violet.io/prism/payments/payouts/prism-payout-accounts

CREATE TABLE public.merchant_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Violet Payout Account ID (the PPA wrapper)
  violet_payout_account_id TEXT NOT NULL UNIQUE,
  merchant_id TEXT NOT NULL REFERENCES public.merchants(merchant_id) ON DELETE CASCADE,
  app_id TEXT,
  -- Whether this is the currently active PPA for the merchant
  is_active BOOLEAN NOT NULL DEFAULT false,
  -- ISO-3166-1 alpha-2 country code of the bank account
  country_code TEXT,
  -- Payment provider: STRIPE or EXTERNAL
  payment_provider TEXT NOT NULL DEFAULT 'STRIPE',
  -- Stripe Connect account ID (e.g., "acct_1R42bBHasdfghjk2")
  payment_provider_account_id TEXT,
  -- Account type: EXPRESS, STANDARD, CUSTOM
  account_type TEXT,
  -- Stripe account status
  charges_enabled BOOLEAN,
  payouts_enabled BOOLEAN,
  -- Banking info
  banking_country TEXT,
  banking_currency TEXT,
  -- Stripe KYC requirements
  requirements JSONB,
  -- Currently due requirements (shortcut for admin alerts)
  currently_due TEXT[] DEFAULT '{}',
  past_due TEXT[] DEFAULT '{}',
  pending_verification TEXT[] DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  -- Timestamps
  date_created TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_last_modified TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_merchant_payout_accounts_merchant ON public.merchant_payout_accounts (merchant_id);
CREATE INDEX idx_merchant_payout_accounts_active ON public.merchant_payout_accounts (merchant_id) WHERE is_active = true;
CREATE INDEX idx_merchant_payout_accounts_provider ON public.merchant_payout_accounts (payment_provider);
CREATE INDEX idx_merchant_payout_accounts_charges ON public.merchant_payout_accounts (charges_enabled) WHERE charges_enabled = false;
CREATE INDEX idx_merchant_payout_accounts_payouts ON public.merchant_payout_accounts (payouts_enabled) WHERE payouts_enabled = false;
-- Find merchants with past_due requirements (urgent KYC issues)
CREATE INDEX idx_merchant_payout_accounts_past_due ON public.merchant_payout_accounts USING GIN (past_due) WHERE array_length(past_due, 1) > 0;

-- Auto-update date_last_modified on row change
CREATE TRIGGER merchant_payout_accounts_modified
  BEFORE UPDATE ON public.merchant_payout_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: service_role only (admin dashboard reads via server functions)
ALTER TABLE public.merchant_payout_accounts ENABLE ROW LEVEL SECURITY;
-- No policies — service_role bypasses RLS by default

COMMENT ON TABLE public.merchant_payout_accounts IS
  'Violet Prism Pay Accounts (PPA) — tracks Stripe Connect account status and KYC requirements per merchant. Populated via webhooks.';

COMMENT ON COLUMN public.merchant_payout_accounts.violet_payout_account_id IS
  'Violet Payout Account ID (the PPA wrapper). Unique across all merchants.';

COMMENT ON COLUMN public.merchant_payout_accounts.requirements IS
  'Full Stripe requirements object: alternatives, currently_due, errors, eventually_due, past_due, pending_verification.';

COMMENT ON COLUMN public.merchant_payout_accounts.currently_due IS
  'Shortcut: array of Stripe requirement fields currently due. Empty = account in good standing.';

COMMENT ON COLUMN public.merchant_payout_accounts.past_due IS
  'Shortcut: array of past-due requirement fields. Non-empty = URGENT — account may be disabled by Stripe.';

COMMENT ON COLUMN public.merchant_payout_accounts.pending_verification IS
  'Shortcut: array of fields pending async verification. May move to currently_due or eventually_due.';
