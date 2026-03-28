# Geo-Filtered Catalog & Delivery Estimates — Analysis

**Date:** 2026-03-28
**Status:** Pre-planning — to be specced in a dedicated session

---

## Current State

### What works
- Catalogue displays all 39 products from Violet sandbox (all merchants)
- User can add any product to cart, update quantity, remove
- Cart persists across reloads via cookie + Supabase

### What's broken in the UX
- **No country awareness** — a French user sees US-only products they can't buy
- **Shipping failure is late** — user discovers at checkout (Story 4-3, `GET /shipping-methods`) that the merchant doesn't ship to their country
- **No delivery estimates** — user has zero visibility on when they'd receive the product
- **No currency localization** — all prices in USD regardless of user location

### Violet API capabilities

| Feature | Available | Notes |
|---------|-----------|-------|
| Shipping zones per offer | Yes | `?include=shipping` — requires `sync_product_shipping` flag enabled |
| Shipping methods + pricing | Yes | Retrieved at checkout per bag after address submission |
| Delivery time estimates | Partial | Depends on what the merchant configured in Shopify |
| Country restrictions | Indirect | Inferred from shipping zones (no explicit "ships to" field) |
| Multi-currency | Yes | Violet supports `currency` param on cart creation |
| **Limitation** | Shopify only | Shipping data sync not available for non-Shopify merchants |

---

## Ideal UX Vision

### 1. First Visit — Auto-detect Country

```
┌──────────────────────────────────────────┐
│  🇫🇷 Shipping to: France  [Change ▾]     │
│  Showing 24 products deliverable to you  │
└──────────────────────────────────────────┘
```

- IP geolocation detects country (Cloudflare `CF-IPCountry` or similar)
- Country stored in cookie, overridable via dropdown
- Catalogue immediately filtered to show only deliverable products

### 2. Product Card — Delivery Badge

```
┌─────────────────────┐
│  [Product Image]    │
│  Unicorn Hoodie     │
│  StyleSphere        │
│  €189.00            │
│  📦 5-8 days        │
└─────────────────────┘
```

- Price converted to user's local currency
- Delivery estimate badge on each card
- Out-of-zone products hidden (not shown with "unavailable")

### 3. Product Detail — Shipping Section

```
┌─────────────────────────────────────┐
│  Shipping to 🇫🇷 France              │
│                                     │
│  📦 Standard — 5-8 business days   │
│     Free over €100 / €4.99         │
│  ⚡ Express — 2-3 business days    │
│     €12.99                         │
│                                     │
│  [Change country ▾]                │
└─────────────────────────────────────┘
```

- Shows available shipping methods + costs BEFORE add-to-cart
- User can change country to see alternatives
- No surprises at checkout

### 4. Cart Drawer — Per-Bag Delivery Info

```
┌──────────────────────────────────┐
│  STYLESPHERE                     │
│  Unicorn Hoodie × 2    €378.00  │
│  📦 Standard (5-8 days)  Free   │
│                                  │
│  Subtotal              €378.00  │
│  Shipping                 Free  │
│  Est. delivery     Apr 2-5      │
└──────────────────────────────────┘
```

### 5. Empty State — Country Has No Products

```
┌──────────────────────────────────────────┐
│  😔 No products available for shipping   │
│     to 🇲🇬 Madagascar                    │
│                                          │
│  Try browsing from:                      │
│  🇫🇷 France  🇺🇸 United States  🇬🇧 UK    │
└──────────────────────────────────────────┘
```

---

## Technical Architecture (High-Level)

### Data Flow

```
User visit
    ↓
IP → Country code (CF-IPCountry header or GeoIP API)
    ↓
Store in cookie + React context (UserLocationContext)
    ↓
Product fetch: GET /catalog/offers?include=shipping
    ↓
Server-side filter: keep only offers with shipping zones covering user's country
    ↓
Transform: extract delivery estimates per offer for user's country
    ↓
Display filtered catalog with delivery badges
```

### Key Components to Build/Modify

| Component | Change |
|-----------|--------|
| **UserLocationContext** (new) | Stores detected/selected country, exposes to all components |
| **GeoIP middleware** (new) | Server-side IP detection, sets cookie on first visit |
| **VioletAdapter.getProducts** | Add `?include=shipping`, filter by country server-side |
| **VioletAdapter.getProduct** | Add `?include=shipping`, extract delivery estimates |
| **Product types** | Add `shippingZones`, `deliveryEstimate` fields |
| **ProductCard** | Add delivery badge |
| **ProductDetail** | Add shipping section with methods/estimates |
| **CartBag** | Show selected shipping method + estimated delivery |
| **CountrySelector** (new) | Dropdown to override detected country |
| **Violet config** | Enable `sync_product_shipping` feature flag |

### Dependencies

- Violet `sync_product_shipping` flag must be enabled for each merchant
- Hosting platform must provide IP geolocation (Cloudflare/Vercel/Netlify all do)
- Shipping data availability is Shopify-only (non-Shopify merchants would need fallback UX)

---

## Recommended Approach

**Phase 1 — Foundation (1 story)**
- Enable `sync_product_shipping` on Violet sandbox
- Add `?include=shipping` to catalog API calls
- Implement UserLocationContext + GeoIP detection
- Server-side filtering of offers by country

**Phase 2 — UX (1 story)**
- Delivery badges on product cards
- Shipping section on PDP
- Country selector in header
- "No products for your country" empty state

**Phase 3 — Checkout integration (1 story)**
- Pre-select shipping method based on earlier display
- Show delivery estimates in cart drawer
- Currency localization (if Violet supports it for the merchant)

---

*This document is a pre-planning analysis. Launch a dedicated session with `/bmad-bmm-quick-spec` or `/bmad-bmm-create-story` to turn this into implementation-ready specs.*
