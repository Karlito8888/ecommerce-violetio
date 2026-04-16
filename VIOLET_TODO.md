# Violet.io — Remaining Actions

> Generated from the exhaustive audit of `violet-io.md` (158 endpoints + 96 doc pages).
> Last updated: 2026-04-16

---

## 🔴 A. Code to Implement (API endpoints with ⚠️ in violet-io.md)

These are Violet.io API endpoints that are **pertinent to our Channel/affiliate role** but not yet implemented in the codebase.

### A1. `Search Distributions` — `POST /payments/distributions/search`

| | |
|---|---|
| **Doc link** | https://docs.violet.io/api-reference/payments/distributions/search-distributions.md |
| **Status** | ✅ **COMPLÈTEMENT IMPLÉMENTÉ** (commit a9de118) |
| **What it does** | Advanced distribution search with filters (status, merchant, date range, type). |
| **Details** | `searchDistributions()` with 8 filters + pagination, server function admin, 6 unit tests. |

### A2. `Get Transfer` — `GET /payments/transfers/{id}`

| | |
|---|---|
| **Doc link** | https://docs.violet.io/api-reference/payments/transfers/get-transfer-by-id.md |
| **Status** | ✅ **COMPLÈTEMENT IMPLÉMENTÉ** (2026-04-16) |
| **What it does** | Fetch a single transfer by its Violet Transfer ID with full detail. |
| **Details** | `getTransfer()` returns `TransferDetail` (extends base Transfer with 17 additional fields: payout references, transfer mechanism, effective related IDs, reversal IDs, extended errors with resolved status). Server function `getTransferFn` with Zod validation. 6 unit tests. |

### A3. `Get Transfer by Payment Provider Transfer ID` — `GET /payments/transfers/external/{external_transfer_id}`

| | |
|---|---|
| **Doc link** | https://docs.violet.io/api-reference/payments/transfers/get-transfer-by-payment-provider-transfer-id.md |
| **Status** | ✅ **COMPLÈTEMENT IMPLÉMENTÉ** (2026-04-16) |
| **What it does** | Look up a Violet transfer by its Stripe transfer ID. |
| **Details** | `getTransferByProviderId()` returns same `TransferDetail` as `getTransfer()`. Server function `getTransferByProviderIdFn` with Zod validation. 4 unit tests. |

### A4. `Get Pending Transfers` — `GET /payments/transfers/pending`

| | |
|---|---|
| **Doc link** | https://docs.violet.io/api-reference/payments/transfers/get-pending-transfers.md |
| **Status** | ✅ **COMPLÈTEMENT IMPLÉMENTÉ** (2026-04-16) |
| **What it does** | Returns all transfers in PENDING status aggregated by merchant, with payout account details. |
| **Details** | `getPendingTransfers()` with optional merchant_id/app_id filters, `PendingTransferSummary` type with embedded `PendingTransferPayoutAccount`, server function `getPendingTransfersFn` with Zod validation, 7 unit tests. |

### A5. `Set Merchant/Channel Commission Rate` — `PUT /apps/{app_id}/merchants/{merchant_id}/commission_rate`

| | |
|---|---|
| **Doc link** | https://docs.violet.io/api-reference/apps/commission-rates/set-merchant-app-commission-rate.md |
| **Status** | ✅ **COMPLÈTEMENT IMPLÉMENTÉ** (2026-04-16) |
| **What it does** | Set commission rate for a merchant with optional lock. |
| **Details** | `setCommissionRate()` with rate 0–50 + lock. Returns `AppInstall` record. New `violetMerchants.ts` module, server function `setCommissionRateFn` with Zod validation, 8 unit tests. |

---

## 🟡 B. Code Enhancements (implemented but incomplete)

### B1. Cross-Border Duties Warning

| | |
|---|---|
| **Doc link** | https://docs.violet.io/prism/checkout-guides/guides/cross-border-duties.md |
| **Status** | ⚠️ Non implémenté — Option C recommandée (avertissement cross-border) |
| **What to do** | Detect when `shippingAddress.country ≠ merchantCountry` and display a warning on checkout: "Customs duties may apply. You are responsible for any import fees upon delivery." |
| **Files to modify** | `checkout/index.tsx` — add cross-border detection + warning banner. |
| **Effort** | ~2h |
| **Priority** | Medium — protects UX for international orders. |

### B2. Custom Properties on OrderSku

| | |
|---|---|
| **Doc link** | https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/add-items-to-cart.md |
| **Status** | ⚠️ Non implémenté — `custom_properties` field |
| **What to do** | Add `customProperties` to `CartItemInput` and forward to Violet's `POST /checkout/cart/{id}/skus` body. Used for product personalization (engraving, gift wrapping, etc.). |
| **Effort** | ~3h — schema, adapter, UI for custom property inputs. |
| **Priority** | Low — no merchant demand yet. BigCommerce/Wix don't support it. |

### B3. Payment Transaction Webhooks

| | |
|---|---|
| **Doc link** | https://docs.violet.io/prism/webhooks/events/payment-transaction-webhooks.md |
| **Status** | ⚠️ Non implémenté — 6 event types (UPDATED, AUTHORIZED, CAPTURED, REFUNDED, PARTIALLY_REFUNDED, FAILED) |
| **What to do** | Subscribe to `PAYMENT_TRANSACTION_*` events. Add processors for financial monitoring (especially FAILED = critical capture failure alert). |
| **Effort** | ~3h — webhook schemas, processors, DB table, admin alerts. |
| **Priority** | Low — Automatic Capture makes most events redundant. FAILED is the only critical one. |

### B4. Distribution Fields Enrichment (34 fields)

| | |
|---|---|
| **Doc link** | https://docs.violet.io/prism/payments/payouts/distributions/distributions-apis.md |
| **Status** | ⚠️ 5/39 fields captured |
| **What to do** | Capture additional distribution fields: `commission` (exact revenue), `payout_account_id` (PPA link), `external_order_id` (Shopify Order ID), `payment_provider_transaction_id` (Stripe Charge ID), `currency`, timestamps. |
| **Effort** | ~4h — schema updates, DB migration, adapter mapping, admin UI. |
| **Priority** | Low — only needed for advanced financial reporting. |

### B5. Redirect URL for Merchant Detection

| | |
|---|---|
| **Doc link** | https://docs.violet.io/prism/violet-connect/guides/detecting-merchants-post-connection.md |
| **Status** | ⚠️ Non implémenté — webhook MERCHANT_CONNECTED suffit |
| **What to do** | Add `?merchant_id={id}` redirect handling after Violet Connect onboarding. Provides instant feedback (webhook has a few seconds delay). |
| **Effort** | ~1h — callback route in web app. |
| **Priority** | Low — webhook is already real-time enough. |

---

## 🔵 C. Operational Actions (no code — manual steps)

### C1. Stripe KYC Completion

| | |
|---|---|
| **Status** | ⚠️ `charges_enabled=false`, `payouts_enabled=false` |
| **What to do** | Complete Stripe KYC in Stripe Dashboard. Required before Live Mode. |
| **Reference** | https://docs.violet.io/prism/payments/payouts/guides/stripe-kyc-guide.md |
| **Priority** | 🔴 **Critical** — blocks Live Mode. |

### C2. Share Stripe Credentials with Violet

| | |
|---|---|
| **Status** | ⚠️ Not done yet |
| **What to do** | Use Violet's Credentials Encryptor to share Stripe Platform Account credentials. Enables Prism Pay for your channel. |
| **Reference** | https://docs.violet.io/prism/payments/payment-integrations/supported-providers/stripe/connecting-a-platform-stripe-account.md |
| **Priority** | 🔴 **Critical** — blocks Live Mode. |

### C3. Sign Violet Contract

| | |
|---|---|
| **Status** | ⚠️ Unknown — needs confirmation |
| **What to do** | Contact support@violet.io to confirm contract status. Required for Test/Live Mode activation. |
| **Reference** | https://docs.violet.io/prism/payments/setup/test-mode/test-mode-requirements.md |
| **Priority** | 🔴 **Critical** — blocks Live Mode. |

### C4. Go-Live Demo with Violet

| | |
|---|---|
| **Status** | ⚠️ Not done |
| **What to do** | Schedule go-live demo at cal.com/team/violet/violet-go-live-demo. Violet team reviews your integration before approving Live Mode. |
| **Reference** | https://docs.violet.io/prism/payments/setup/live-mode/live-mode-requirements.md |
| **Priority** | 🟡 High — required before production launch. |

### C5. Verify Stripe Scopes on Live Keys

| | |
|---|---|
| **Status** | ⚠️ To verify when going live |
| **What to do** | When creating live restricted keys, ensure all required scopes are present (Charges WRITE, PaymentIntents WRITE, Connect ALL, etc.). |
| **Reference** | https://docs.violet.io/prism/payments/payment-integrations/supported-providers/stripe/required-stripe-scopes.md |
| **Priority** | 🟡 High — before Live Mode switch. |

### C6. Strategic Decision: Stripe Account Geography

| | |
|---|---|
| **Status** | ⚠️ Decision needed |
| **What to do** | Current Stripe account = FR (EU). This limits onboarding to EEA merchants only. For US/international merchants, a US Stripe Platform Account will be needed. Decide target markets. |
| **Reference** | https://docs.violet.io/prism/payments/payment-settings/supported-countries.md |
| **Priority** | 🟡 High — impacts business model scope. |

---

## ✅ Completed (not actionable)

These were previously ⚠️ and are now ✅:

- [x] **Currency Exchange Rates** — `GET /catalog/currencies/latest` — implemented with live rates + fallback (commit 5421230)
- [x] **Get Payout Account** — `GET /payments/MERCHANT/{id}/payout_account` — implemented (commit 5421230)
- [x] **Get all Payout Accounts** — `GET /payments/MERCHANT/{id}/payout_accounts` — implemented (commit 5421230)
- [x] **Get Payout Account by ID** — `GET /payments/payout_accounts/{id}` — implemented (commit 5421230)
- [x] **Search Distributions** — `POST /payments/DEVELOPER/{id}/distributions/search` — implemented (commit a9de118)
- [x] **Register an External Transfer** — `POST /payments/transfers/external/register` — not applicable (no EXTERNAL merchants)
- [x] **Set Merchant/Channel Commission Rate** — `PUT /apps/{app_id}/merchants/{merchant_id}/commission_rate` — implemented with rate + lock (2026-04-16)
- [x] **Get Transfer by Payment Provider Transfer ID** — `GET /payments/transfers/external/{id}` — implemented with TransferDetail (2026-04-16)
- [x] **Get Transfer** — `GET /payments/transfers/{id}` — implemented with TransferDetail + 17 extra fields (2026-04-16)
- [x] **Payment Integration Health** — Dashboard page, appears after Live Mode setup
- [x] **Get Pending Transfers** — `GET /payments/transfers/pending` — implemented with aggregated summaries + payout account details (2026-04-16)

---

## 📊 Summary

| Category | Count | Priority |
|----------|-------|----------|
| 🔴 Code to implement (APIs) | 0 | — Toutes implémentées ! |
| 🟡 Code enhancements | 5 | B1 Medium, rest Low |
| 🔵 Operational (manual) | 6 | C1-C3 Critical, C4-C6 High |
| ✅ Already done | 11 | — |
