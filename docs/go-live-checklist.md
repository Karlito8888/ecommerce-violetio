# Go-Live Checklist — Maison Émile × Violet

This checklist must be fully checked before scheduling the Violet go-live demo.
Share this file with the Violet team at support@violet.io when booking.

## Stripe

- [ ] Stripe Platform account created at stripe.com
- [ ] Stripe Connect activated (Settings → Connect settings → Platform)
- [ ] KYC completed and approved by Stripe
- [ ] Stripe Platform account linked to Violet via channel.violet.io → App Settings → Payments
- [ ] Live publishable key (`pk_live_...`) added to production environment
- [ ] Live secret key (`sk_live_...`) added to production environment (server-side only)

## Violet Connect Configuration

- [ ] App name configured on channel.violet.io
- [ ] App logo uploaded
- [ ] Redirect URL set (post-merchant-onboarding landing page)
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
