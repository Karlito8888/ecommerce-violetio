# Go-Live Checklist — Maison Émile × Violet

This checklist must be fully checked before scheduling the Violet go-live demo.
Share this file with the Violet team at support@violet.io when booking.

## Stripe Platform Account

- [x] Stripe Platform account created (`acct_1TGHSsLL5d4dVawJ`)
- [x] Stripe Connect activated as Marketplace
- [x] Restricted key `violet-test` created with all required scopes
- [x] OAuth enabled with Violet redirect URIs configured
- [x] OAuth Client ID: `ca_UEm0xAdznqYjzTFRGqvRWFj99mbOiuZD`
- [x] Test publishable key added to `.env.local`
- [x] Test secret key added to `.env.local` (server-side only)
- [ ] KYC completed and approved by Stripe (required for Live Mode)
- [ ] Live restricted key `violet-live` created (when ready for production)
- [ ] Live publishable key (`pk_live_...`) added to production environment

## Violet Credentials & Contract

- [x] Encrypted credentials generated via Violet Credentials Encryptor (saved in `docs/stripe-encrypted-credentials-test.json`)
- [ ] **ACTION REQUIRED**: Send encrypted credentials to Violet Support via Slack or DevRev
- [ ] **ACTION REQUIRED**: Sign formal agreement/contract with Violet
- [ ] **ACTION REQUIRED**: Confirm payment settings (capture, transfer, tax-remitter) with Violet Support

## Violet Webhooks

- [x] 18 webhooks registered on sandbox (endpoint: `https://maison-emile.netlify.app/api/webhooks/violet`)
  - Orders: ACCEPTED, UPDATED, COMPLETED, SHIPPED, DELIVERED, REFUNDED, CANCELED, FAILED
  - Merchants: CONNECTED, DISCONNECTED, ENABLED, DISABLED, COMPLETE, PAYOUT_ACCOUNT_CREATED
  - Payments: TRANSFER_SENT, TRANSFER_FAILED, CAPTURE_CAPTURED, CAPTURE_FAILED
- [ ] Webhook handler endpoint implemented in the app
- [ ] Webhook URL updated to actual deployment URL (when deployed)

## Violet Connect Configuration

- [x] App name configured on channel.violet.io — "Maison Émile"
- [ ] App logo uploaded
- [x] Redirect URL set (post-merchant-onboarding landing page) — `maisonemile.com/admin/merchants`
- [ ] At least one real merchant onboarded in Test Mode and verified end-to-end
- [ ] Commission rates configured per merchant on channel.violet.io

## Application Testing (Test Mode)

- [ ] Complete checkout flow tested: address → shipping → customer info → Stripe payment → confirmation
- [ ] 3DS challenge scenario tested (use Stripe test card `4000 0027 6000 3184`)
- [ ] Refund tested and commission correctly reversed
- [ ] Order confirmation page displays correct order details
- [ ] Admin dashboard: commission summary shows real rates (not 10% for all)
- [ ] Admin dashboard: distributions sync works for a completed test order

## Production Environment Variables

- [ ] `VIOLET_API_BASE=https://api.violet.io/v1` (not sandbox-api)
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
- [ ] `STRIPE_SECRET_KEY=sk_live_...`
- [ ] `VIOLET_APP_ID` and `VIOLET_APP_SECRET` updated to Live Mode credentials

## Pre-Demo

- [ ] Run full checkout flow in production environment with a real card (small test amount)
- [ ] Confirm distribution appears in admin dashboard after order
- [ ] Book go-live demo with Violet: support@violet.io
