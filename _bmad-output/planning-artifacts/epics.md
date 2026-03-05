---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "https://docs.violet.io/llms.txt (via Archon MCP)"
---

# E-commerce - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for E-commerce, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Visitors can search for products using natural language queries (e.g., "gift for my dad who likes cooking, budget $150")
FR2: The system can return contextual product results with personalized explanations of why each product matches the query
FR3: Visitors can browse products by category and collection
FR4: Visitors can filter and sort product results by relevance, price, and availability
FR5: The system can suggest similar products based on semantic similarity when a viewed product is unavailable
FR6: Returning users can receive search results weighted by their purchase and browsing history, with relevance scoring that improves as interaction data accumulates
FR7: Visitors can view product detail pages displaying hero image, price, essential specifications, and an internal review
FR8: Visitors can view product images optimized for their device viewport via dynamic media transformations
FR9: Visitors can read editorial content pages (guides, comparisons, reviews) that link to relevant products
FR10: Visitors can see transparent pricing with no fake discounts, countdown timers, or dark-pattern manipulation
FR11: Visitors can see clear affiliate disclosure on every page displaying products
FR12: Visitors can add products from multiple merchants to a single unified cart
FR13: Visitors can view their cart with accurate price estimates including tax and shipping
FR14: Visitors can complete checkout as a guest without creating an account
FR15: Visitors can pay using credit/debit card, Apple Pay, or Google Pay
FR16: Visitors can select shipping methods for their order (per merchant when multiple merchants are in cart)
FR17: The system can orchestrate the supplier's multi-step checkout flow (customer details, shipping, billing, payment) behind a single-page UI
FR18: The system can validate inventory availability in real-time at checkout submission
FR19: Visitors can retry payment with a different method if the initial payment fails, without losing cart or address data
FR20: The system can capture and transmit marketing consent status per order as required by Violet.io
FR21: The system can restrict checkout to Violet-supported countries and surface clear messaging for unsupported locations
FR22: Buyers can view order confirmation with summary, tracking information, and estimated delivery
FR23: Buyers can receive email notifications for order status changes (confirmed, shipped, delivered)
FR24: Buyers can track order status across all merchants in a unified view
FR25: The system can map Violet bag-level states to a simplified, user-facing unified order status
FR26: The system can process bag-level refunds and communicate refund status to buyers
FR27: Buyers can look up their order status by email without an account
FR27a: Visitors can access a centralized contact page with an email form to submit support inquiries
FR27b: Visitors can browse a FAQ/help page covering common questions (shipping, returns, payment methods, order tracking)
FR27c: Visitors can view the return and refund policy on a dedicated page accessible from product pages and checkout
FR28: Visitors can use the platform with an anonymous session without any login requirement
FR29: Visitors can optionally create an account to access persistent features (wishlist, order history, cross-device sync)
FR30: Registered users can maintain a wishlist of saved products
FR31: Registered users can access their cart across web and mobile devices in real-time
FR32: Registered users can view their complete order history
FR33: Registered users can authenticate using biometric methods (Face ID, fingerprint) on mobile
FR34: The system can render all pages server-side with complete HTML for search engine crawlers
FR35: The system can generate dynamic meta tags, Open Graph tags, and structured data (JSON-LD) per page
FR36: The system can generate and maintain an XML sitemap covering all product and content pages
FR37: Content editors (admin) can publish and manage editorial content pages (guides, reviews, comparisons)
FR38: Content pages can include internal links to product pages and related editorial content
FR39: Web visitors can be prompted to download the mobile app via a dismissible banner that appears once per session after the first product view
FR40: Mobile users can access all core features (search, browse, cart, checkout, order tracking) within the native app
FR41: Mobile users can receive targeted push notifications for order updates, price drops on wishlisted items, and back-in-stock alerts
FR42: Mobile users can configure push notification preferences by notification type
FR43: The system can deep-link between web URLs and mobile app screens for seamless handoff
FR44: Admin can view a daily dashboard showing key performance indicators (visitors, conversion rate, revenue, AI search usage, app DAU)
FR45: The system can automatically synchronize the product catalog from the supplier API via event-driven updates and scheduled sync
FR46: The system can automatically mark products as unavailable when merchants report out-of-stock
FR47: Admin can monitor webhook delivery health and Edge Function execution logs
FR48: The system can automatically refresh API tokens before expiration without manual intervention
FR49: The system can handle API rate limits gracefully via caching and request queuing
FR50: Admin can receive alert notifications for critical system events (webhook failures, sync errors, unusual order patterns)
FR51: The system can display FTC-compliant affiliate disclosure proximate to all purchase CTAs
FR52: The system can enforce payment processor KYC verification as a prerequisite for payment processing
FR53: The system can display pre-purchase information required by consumer protection laws (total price incl. taxes, delivery estimate, withdrawal rights)
FR54: The system can handle guest user data according to GDPR data minimization principles (collect only what's needed, clear session data post-order)
FR55: The system can process tax calculations during the pricing phase and configure tax remittance settings

### NonFunctional Requirements

NFR1: Web pages must load fast enough to feel premium and satisfy Core Web Vitals — FCP < 1.5s, LCP < 2.5s, CLS < 0.1, TTI < 3.0s (mid-range mobile on 4G)
NFR2: AI conversational search must respond fast enough to feel like a conversation — Query to results < 2s end-to-end
NFR3: Checkout flow must complete without perceptible delays — Cart to confirmation < 3s total perceived time
NFR4: Mobile app must start fast enough to feel native — Cold start < 2s on mid-range device
NFR5: Cross-device cart sync must be imperceptible — Web/mobile sync latency < 1s
NFR6: Product images must load without blocking page rendering — Lazy-loaded, progressive rendering, WebP/AVIF format
NFR7: JavaScript bundle must be small enough for fast initial load — Total JS < 200KB gzipped
NFR8: Payment data must never touch our servers — Zero payment card data stored or transmitted
NFR9: API tokens must never be exposed to client-side code — Zero Violet/Stripe tokens in browser or mobile app
NFR10: All data in transit must be encrypted — 100% HTTPS (TLS 1.2+), HSTS headers enforced
NFR11: All data at rest must be encrypted — Database encryption at rest enabled
NFR12: Guest session data must be minimized and ephemeral — Only name, email, shipping address collected; session cleared post-order
NFR13: Authentication must be resilient against common attacks — Rate-limited login attempts, industry-standard password hashing
NFR14: Webhook endpoints must validate request authenticity — Custom webhook headers verified (X-Violet-Hmac)
NFR15: System must handle organic traffic growth without architecture changes — Support 10x traffic with tier upgrades only
NFR16: Product catalog cache must scale with catalog size — Support 100,000+ products without query degradation
NFR17: Concurrent checkout sessions must not interfere with each other — Support 50+ simultaneous sessions
NFR18: SEO traffic spikes must not degrade performance — SSR response time < 1.5s at 5x normal traffic
NFR19: Web platform must meet WCAG 2.1 Level AA — Lighthouse Accessibility score > 95
NFR20: All interactive elements must be keyboard-accessible — 100% of actions completable via keyboard
NFR21: Color contrast must meet minimum ratios — 4.5:1 for normal text, 3:1 for large text
NFR22: Motion must respect user preferences — All animations respect prefers-reduced-motion
NFR23: Touch targets must be usable on mobile — Minimum 44x44px for all interactive elements
NFR24: Platform must be consistently available — > 99.5% uptime
NFR25: Cart data must survive failures — Zero cart data loss on payment failure, browser crash, or app force-quit
NFR26: Webhook processing must be resilient — Zero lost order status updates; retry within 5 minutes
NFR27: Catalog sync must self-recover from transient errors — Automatic retry with exponential backoff
NFR28: Token refresh must be transparent to users — Zero user-facing errors from expired API tokens
NFR29: Violet.io API dependency must be gracefully degraded — Product browsing available during Violet API outage
NFR30: Stripe payment failures must not corrupt order state — Atomic operations: cart to order only on confirmed payment
NFR31: API rate limits must be handled without user impact — Zero user-facing errors from rate limiting
NFR32: Adapter Pattern must enable supplier switching — New supplier adapter operational within 5 developer-days

### Additional Requirements

**From Architecture:**

- Starter Template: Custom Bun Monorepo with official CLIs (TanStack Start + Expo SDK 55). No existing starter — greenfield setup required as first implementation story.
- Monorepo structure: `apps/web/` (TanStack Start), `apps/mobile/` (Expo Router v7), `packages/shared/`, `packages/ui/`, `packages/config/`, `supabase/`
- Server-side code split: Server Functions (web user-triggered) vs Edge Functions (cross-platform + external events). Rule: if both platforms need it, use Edge Function.
- Dual auth layer: Supabase Auth (user sessions, anonymous sessions, RLS) + Violet JWT (commerce API tokens, 24h expiry, auto-refresh)
- SupplierAdapter interface in `packages/shared/src/adapters/` — blocks all commerce features. VioletAdapter as first implementation.
- Data strategy: Cache-on-demand from Violet API via TanStack Query (no full catalog sync). Embeddings stored in Supabase pgvector for AI search.
- SSR boundaries: Product/catalog pages SSR (SEO). Checkout CSR (Stripe Elements).
- Design token distribution: CSS custom properties (web) mapped to React Native StyleSheet values (mobile) via `packages/ui/src/tokens/`
- Supabase Edge Function limits: 2s CPU timeout, 10MB bundle. Complex operations must be decomposed.
- Web hosting: Cloudflare Workers (TanStack Start Bun preset). Mobile: EAS Build + Submit + Update.
- CI/CD: GitHub Actions — 3 pipelines (web deploy, mobile build, Edge Functions deploy)
- Naming conventions enforced: database snake_case, API kebab-case routes, code camelCase, components PascalCase, CSS BEM
- API response format: `{ data: T, error: null }` or `{ data: null, error: { code, message } }` consistently across all Server/Edge Functions
- Zod schemas at all API boundaries for runtime validation
- Money stored as integer cents, displayed via `formatPrice()` utility
- TanStack Query key convention: `[domain, action, ...params]`
- Webhook processing pipeline: validate HMAC → deduplicate (X-Violet-Event-Id) → parse/validate (Zod) → process → update Supabase → return 200

**From UX Design:**

- Vanilla CSS (99%) with BEM naming — no CSS framework. Exception: lightweight badge/notification library (< 5KB gzipped)
- Dual typeface system: Cormorant Garamond (serif, headings) + Inter (sans-serif, interface)
- Color system: Warm Neutral base (Ivory #FAFAF8, Linen #F0EEEB, Sand #E8E4DF) + Midnight Gold accents (Gold #C9A96E, Amber #A68B4B, Midnight #2C2C2C)
- Responsive mobile-first breakpoints: 640px / 768px / 1024px / 1280px / 1440px
- Accessibility: focus-visible on all interactive elements, prefers-reduced-motion respected, prefers-color-scheme ready (dark mode Phase 2), min 44x44px touch targets
- Anti-dark-patterns mandate: no fake urgency, no manufactured scarcity, no forced upsells, no pop-ups, no newsletter pop-up on arrival
- Skeleton screens for loading states (never spinners)
- One-step guest checkout: shipping + payment (Apple Pay/Google Pay) + confirm on a single page, target < 45 seconds
- AI search: chat-like input but results as curated product grid (not chatbot). Placeholder text suggests natural language. Graceful fallback to keyword search.
- Gallery-style product pages (Apple Store inspiration): hero image dominant, minimal text, generous whitespace
- Post-purchase "wow moment": polished confirmation page as premium branding + app download conversion touchpoint
- Paginated product results with clear count ("Showing 12 of 48 products"), no infinite scroll
- Error states: inline validation, helpful suggestions, never blocking modals. Errors explain what happened AND what to do next.

**From Violet.io Official Documentation:**

- Cart/Bag architecture: Cart contains Bags (one per merchant). Bag lifecycle: IN_PROGRESS → SUBMITTED → ACCEPTED → COMPLETED → REFUNDED
- Order states: IN_PROGRESS → PROCESSING → REQUIRES_ACTION (3D Secure) → COMPLETED
- Wallet-based checkout: `wallet_based_checkout: true`, `stripe_key`, `payment_intent_client_secret` returned by Violet
- Cart API endpoints: POST /checkout/cart (create), POST /checkout/cart/{id}/items (add), POST /checkout/cart/{id}/payment (pay), POST /checkout/cart/{id}/shipping (ship), POST /checkout/cart/{id}/submit (submit)
- Financial values in cents with `base_currency` field. Currency immutable after cart creation.
- Error handling: API returns 200 even with bag-level errors — always check `errors` array
- Webhook events: ORDER_ACCEPTED, ORDER_UPDATED, ORDER_COMPLETED, ORDER_SHIPPED, ORDER_DELIVERED, ORDER_REFUNDED, ORDER_CANCELLED, ORDER_FAILED
- Webhook headers: X-Violet-Hmac (HMAC validation), X-Violet-Event-Id (idempotency), X-Violet-Topic, X-Violet-Order-Id, X-Violet-Bag-Id
- Offer webhooks for catalog sync: OFFER_ADDED, OFFER_UPDATED, OFFER_REMOVED, OFFER_DELETED
- Sync webhooks: PRODUCT_SYNC_STARTED, PRODUCT_SYNC_COMPLETED, PRODUCT_SYNC_FAILED
- Best practices: process webhooks asynchronously (return 2xx quickly), use X-Violet-Event-Id for idempotency, validate HMAC on every webhook

### FR Coverage Map

FR1: Epic 3 - AI conversational search
FR2: Epic 3 - Contextual results with explanations
FR3: Epic 3 - Browse by category/collection
FR4: Epic 3 - Filter and sort results
FR5: Epic 3 - Similar product suggestions
FR6: Epic 3 - Personalized search results for returning users
FR7: Epic 3 - Product detail pages
FR8: Epic 3 - Optimized product images
FR9: Epic 7 - Editorial content pages
FR10: Epic 3 - Transparent pricing, no dark patterns
FR11: Epic 3 - Affiliate disclosure on product pages
FR12: Epic 4 - Multi-merchant unified cart
FR13: Epic 4 - Cart with tax/shipping estimates
FR14: Epic 4 - Guest checkout
FR15: Epic 4 - Payment methods (card, Apple Pay, Google Pay)
FR16: Epic 4 - Per-merchant shipping method selection
FR17: Epic 4 - Single-page checkout orchestration
FR18: Epic 4 - Real-time inventory validation
FR19: Epic 4 - Payment retry without data loss
FR20: Epic 4 - Marketing consent capture
FR21: Epic 4 - Country restriction messaging
FR22: Epic 5 - Order confirmation with tracking
FR23: Epic 5 - Email notifications for order status
FR24: Epic 5 - Unified multi-merchant order tracking
FR25: Epic 5 - Bag-level status mapping
FR26: Epic 5 - Bag-level refund processing
FR27: Epic 5 - Order lookup by email
FR27a: Epic 8 - Contact page with email form
FR27b: Epic 8 - FAQ/help page
FR27c: Epic 8 - Return/refund policy page
FR28: Epic 2 - Anonymous session usage
FR29: Epic 2 - Optional account creation
FR30: Epic 6 - Wishlist for registered users
FR31: Epic 4 - Cross-device cart sync
FR32: Epic 5 - Order history for registered users
FR33: Epic 2 - Biometric authentication (mobile)
FR34: Epic 3/7 - Server-side rendering for SEO
FR35: Epic 3/7 - Dynamic meta tags, OG tags, JSON-LD
FR36: Epic 3/7 - XML sitemap
FR37: Epic 7 - Admin content publishing
FR38: Epic 7 - Internal links in content pages
FR39: Epic 2 Story 2.5 - App download banner (web)
FR40: Epic 6 - Full feature parity in mobile app
FR41: Epic 6 Story 6.7 - Push notifications (order, price drop, back-in-stock)
FR42: Epic 6 Story 6.7 - Push notification preferences
FR43: Epic 6 Story 6.8 - Deep linking web/mobile
FR44: Epic 8 - Admin KPI dashboard
FR45: Epic 3 - Product catalog sync from supplier
FR46: Epic 3 - Auto-mark unavailable products
FR47: Epic 8 - Webhook health monitoring
FR48: Epic 8 - Auto token refresh
FR49: Epic 3 Story 3.1 + Epic 8 - API rate limit handling
FR50: Epic 8 - Admin alert notifications
FR51: Epic 3 - FTC-compliant affiliate disclosure
FR52: Epic 4 - KYC verification enforcement
FR53: Epic 4 - Pre-purchase legal information
FR54: Epic 5 - GDPR guest data handling
FR55: Epic 4 - Tax calculations

## Epic List

### Epic 1: Project Foundation & Dual-Platform Scaffold

Developers have a functional Bun monorepo with web (TanStack Start) and mobile (Expo Router v7) apps sharing types, design tokens, and configuration — ready for feature development.
**FRs covered:** None (infrastructure prerequisite)
**Violet.io dependency:** Violet sandbox account setup, API credentials configuration.

### Epic 2: User Authentication & Anonymous Sessions

Visitors can use the platform without an account (anonymous session), and optionally create an account for persistent features. Authentication works on both web and mobile, including biometric auth on mobile.
**FRs covered:** FR28, FR29, FR33
**Violet.io dependency:** Violet JWT auth (POST /login with X-Violet-App-Id + X-Violet-App-Secret). Server-side only token management with auto-refresh.

### Epic 3: Product Discovery & Browsing

Visitors can discover and browse products — via AI conversational search, categories, or filters — with premium gallery-style product pages showing transparent pricing and affiliate disclosure. Web (SSR for SEO) and mobile (native) in parallel.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR10, FR11, FR34, FR35, FR36, FR45, FR46, FR51
**Violet.io dependency:** Catalog API (POST /catalog/offers/search), Offer webhooks (OFFER_ADDED/UPDATED/REMOVED), Sync webhooks. Offers limited to connected merchants. Violet beta NLP search not used (our pgvector + OpenAI approach instead).

### Epic 4: Shopping Cart & Unified Checkout

Visitors can add multi-merchant products to a unified cart, see total prices (tax + shipping), and complete one-step checkout (guest or logged in) with Apple Pay/Google Pay/card. Cart syncs cross-device in real-time.
**FRs covered:** FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR31, FR52, FR53, FR55
**Violet.io dependency:** Cart API (wallet_based_checkout: true), Bag-level shipping methods, Stripe Elements (REQUIRED for wallet checkout — no API-only path). Apply payment step NOT needed with wallet flow. Always check errors array (200 with errors possible). Currency immutable after cart creation. Taxes handled by Violet automatically. Country restrictions per Stripe platform account (US/UK/EU).

### Epic 5: Order Management & Tracking

Buyers can view order confirmation ("wow moment"), track multi-merchant order status in real-time, receive email/push notifications, and look up orders by email without an account.
**FRs covered:** FR22, FR23, FR24, FR25, FR26, FR27, FR32, FR54
**Violet.io dependency:** Order webhooks (ORDER_ACCEPTED/COMPLETED/SHIPPED/DELIVERED/REFUNDED/CANCELLED/FAILED). Bag states independent within same order (mixed states UX required). CANCELED does NOT auto-refund. Cancellation API: POST /orders/{id}/cancel (unfulfilled bags only). Refund vs Return distinction: check both fulfillment_status AND financial_status.

### Epic 6: Personalization & Engagement

Registered users can maintain a wishlist, receive targeted push notifications (price drops, back-in-stock), and configure notification preferences. Web visitors see an app download banner.
**FRs covered:** FR30, FR39, FR40, FR41, FR42, FR43
**Violet.io dependency:** None direct (Supabase + Expo infrastructure).

### Epic 7: Content, SEO & Editorial

Visitors can read editorial content (guides, comparisons, reviews) linked to products. Admins can publish/manage content. Content is SEO-optimized with meta tags, JSON-LD, and sitemap.
**FRs covered:** FR9, FR34, FR35, FR36, FR37, FR38
**Violet.io dependency:** None direct. Product links reference Violet offer IDs.

### Epic 8: Administration, Operations & Customer Support

Admins can view KPI dashboard, monitor webhooks and Edge Functions, receive system alerts. Visitors access contact page, FAQ, and return policy.
**FRs covered:** FR27a, FR27b, FR27c, FR44, FR47, FR48, FR49, FR50
**Violet.io dependency:** Commission rates managed via channel.violet.io or API. KYC via Stripe Connect Express (merchant onboarding on Violet/Stripe, not our app). Payout account webhooks for monitoring. Token refresh: Violet JWT 24h expiry with refresh_token.

## Epic 1: Project Foundation & Dual-Platform Scaffold

Developers have a functional Bun monorepo with web (TanStack Start) and mobile (Expo Router v7) apps sharing types, design tokens, and configuration — ready for feature development.

### Story 1.1: Monorepo Initialization & Workspace Configuration

As a **developer**,
I want a Bun workspaces monorepo with web and mobile apps scaffolded,
So that I can start building features on both platforms from a single codebase.

**Acceptance Criteria:**

**Given** a fresh project directory
**When** the initialization commands are executed
**Then** the monorepo has the structure: `apps/web/` (TanStack Start with Bun preset), `apps/mobile/` (Expo SDK 55 with Router v7), `packages/shared/`, `packages/ui/`, `packages/config/`
**And** `bun install` resolves all workspace dependencies without errors
**And** `bun run dev` starts the web dev server (Vite HMR)
**And** `bun run start` in apps/mobile starts the Expo dev server (Metro)
**And** `package.json` root has `"private": true` and `"workspaces": ["apps/*", "packages/*"]`
**And** TypeScript strict mode is configured via shared `tsconfig.base.json`
**And** `.env.example` is created with placeholder values for VIOLET_APP_ID, VIOLET_APP_SECRET, VIOLET_API_BASE, SUPABASE_URL, SUPABASE_ANON_KEY, STRIPE_PUBLISHABLE_KEY, OPENAI_API_KEY
**And** `.gitignore` excludes `.env.local`, `node_modules/`, build outputs

### Story 1.2: Shared Packages Setup (Types, Utils, Config)

As a **developer**,
I want shared TypeScript packages for types, utilities, and configuration,
So that business logic and type definitions are shared across web and mobile without duplication.

**Acceptance Criteria:**

**Given** the monorepo from Story 1.1
**When** `packages/shared/` is configured
**Then** it exports a barrel `index.ts` with re-exports
**And** `packages/shared/src/types/` contains placeholder type files (`product.types.ts`, `cart.types.ts`, `order.types.ts`, `search.types.ts`, `user.types.ts`, `api.types.ts`)
**And** `packages/shared/src/utils/formatPrice.ts` implements the money formatting utility (integer cents to localized display)
**And** `packages/shared/src/utils/constants.ts` defines shared constants (VIOLET_API_BASE, query key factories)
**And** `packages/shared/src/adapters/supplierAdapter.ts` defines the SupplierAdapter interface
**And** `packages/config/` contains shared ESLint and TypeScript base configs
**And** both `apps/web` and `apps/mobile` can import from `@e-commerce/shared` without build errors
**And** the `ApiResponse<T>` type (`{ data: T, error: null } | { data: null, error: { code, message } }`) is defined and exported

### Story 1.3: Design Token System & Cross-Platform Styling Foundation

As a **developer**,
I want a shared design token system that works across web (CSS custom properties) and mobile (React Native StyleSheet),
So that visual consistency is maintained across platforms from a single source of truth.

**Acceptance Criteria:**

**Given** the monorepo from Story 1.1
**When** `packages/ui/` is configured
**Then** `packages/ui/src/tokens/colors.ts` exports the full color palette (Ivory, Linen, Sand, Stone, Taupe, Sienna, Gold, Amber, Midnight, Ink, Charcoal, Steel, Silver, semantic colors)
**And** `packages/ui/src/tokens/typography.ts` exports font families (Cormorant Garamond + Inter), sizes, weights, line-heights per the type scale
**And** `packages/ui/src/tokens/spacing.ts` exports the 4px-base spacing scale
**And** `apps/web/app/styles/tokens.css` consumes these values as CSS custom properties
**And** `apps/web/app/styles/global.css` includes a minimal CSS reset, base element styles, and accessibility foundation (focus-visible, prefers-reduced-motion)
**And** `apps/mobile/` can import token values directly from `@e-commerce/ui` for use in `StyleSheet.create()`
**And** the BEM naming convention is documented in a comment block in `global.css`

### Story 1.4: Supabase Local Development Setup

As a **developer**,
I want Supabase configured for local development with the initial project structure,
So that I can develop auth, database, and Edge Functions locally before deploying.

**Acceptance Criteria:**

**Given** the monorepo from Story 1.1
**When** `supabase init` is run in the project root
**Then** `supabase/config.toml` is configured for local development
**And** `supabase start` launches local Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
**And** `supabase/migrations/` directory exists for future SQL migrations
**And** `supabase/functions/` directory exists for Edge Functions
**And** `supabase/seed.sql` exists (empty, ready for dev seed data)
**And** the Supabase client is configured in `packages/shared/` with environment-based URL/key resolution
**And** both web and mobile apps can connect to local Supabase instance

### Story 1.5: CI/CD Pipeline Foundation

As a **developer**,
I want GitHub Actions CI/CD pipelines scaffolded for web, mobile, and Edge Functions,
So that automated builds and deployments are ready as features are developed.

**Acceptance Criteria:**

**Given** the monorepo with web, mobile, and supabase directories
**When** GitHub Actions workflows are created
**Then** `.github/workflows/web-deploy.yml` runs: install, lint, type-check, build (TanStack Start Bun preset), deploy placeholder (Cloudflare Workers)
**And** `.github/workflows/mobile-build.yml` runs: install, lint, type-check, EAS build placeholder
**And** `.github/workflows/edge-functions-deploy.yml` runs: `supabase functions deploy` placeholder
**And** all workflows use Bun for package installation
**And** all workflows run on push to main and on pull requests
**And** environment variables are referenced via GitHub Secrets placeholders

## Epic 2: User Authentication & Anonymous Sessions

Visitors can use the platform without an account (anonymous session), and optionally create an account for persistent features. Authentication works on both web and mobile, including biometric auth on mobile.

### Story 2.1: Anonymous Session & Supabase Auth Setup (Web + Mobile)

As a **visitor**,
I want to use the platform immediately without any login requirement,
So that I can browse and add to cart without friction.

**Acceptance Criteria:**

**Given** a visitor opens the platform (web or mobile) for the first time
**When** the app loads
**Then** a Supabase anonymous session is created automatically
**And** the anonymous session has a unique `auth.uid()` for RLS policies
**And** the session persists across page reloads (web) and app restarts (mobile)
**And** no login UI is shown by default — the platform is fully usable
**And** the Supabase `user_profiles` table and migration are created with RLS policy: `auth.uid() = user_id`
**And** web: the session is managed via Supabase client with cookie-based persistence
**And** mobile: the session is managed via Supabase client with SecureStore persistence

### Story 2.2: User Registration & Login (Web + Mobile)

As a **visitor**,
I want to optionally create an account with email and password,
So that I can access persistent features like wishlist, order history, and cross-device sync.

**Acceptance Criteria:**

**Given** a visitor with an anonymous session
**When** they navigate to the signup page/screen
**Then** they can register with email + password
**And** their anonymous session is converted to a full account (cart data preserved)
**And** a user profile row is created in `user_profiles`
**And** web: login/signup pages are rendered at `/auth/login` and `/auth/signup` with the platform's design system (Cormorant Garamond headings, Inter body, Warm Neutral palette)
**And** mobile: login/signup screens at `auth/login.tsx` and `auth/signup.tsx` with native styling from design tokens
**And** form validation shows inline errors (never blocking modals)
**And** login rate limiting is enforced (NFR13)
**And** on successful login, the user is redirected to their previous page/screen

### Story 2.3: Violet API Token Management (Server-Side)

As a **developer**,
I want automated Violet API token lifecycle management on the server,
So that commerce API calls always have valid authentication without user impact.

**Acceptance Criteria:**

**Given** the server environment has VIOLET_APP_ID, VIOLET_APP_SECRET, and Violet account credentials
**When** a commerce API call is needed
**Then** the server authenticates via `POST /login` with `X-Violet-App-Id` and `X-Violet-App-Secret` headers
**And** the JWT token and refresh_token are stored securely server-side (never exposed to client)
**And** token refresh is triggered proactively 5 minutes before expiry (24h token lifetime)
**And** if refresh fails, a full re-login is attempted automatically
**And** zero user-facing errors from expired tokens (NFR28)
**And** web: token management lives in `apps/web/app/server/violetAuth.ts` (Server Function)
**And** Edge Functions access Violet tokens via environment variables or a shared token service
**And** all Violet API calls include `X-Violet-Token`, `X-Violet-App-Id`, `X-Violet-App-Secret` headers

### Story 2.4: Biometric Authentication (Mobile)

As a **registered mobile user**,
I want to authenticate using Face ID or fingerprint,
So that I can log in quickly and securely on my mobile device.

**Acceptance Criteria:**

**Given** a registered user on the mobile app
**When** they enable biometric authentication in their profile settings
**Then** subsequent app launches offer biometric login (Face ID on iOS, fingerprint on Android)
**And** biometric auth is optional — password login remains available
**And** biometric credentials are stored in the device's secure enclave (Expo SecureStore)
**And** if biometric auth fails 3 times, the app falls back to password login
**And** biometric preference is stored in the user's profile (Supabase)

### Story 2.5: Layout Shell & Navigation (Web + Mobile)

As a **visitor**,
I want a consistent navigation layout with header, footer, and tab navigation,
So that I can access all sections of the platform intuitively on any device.

**Acceptance Criteria:**

**Given** any page/screen on the platform
**When** the layout renders
**Then** web: `__root.tsx` layout includes Header (logo, search bar, cart icon, account icon), Footer (links, affiliate disclosure), and Navigation (max 5-6 top-level categories)
**And** web: Header and Footer use vanilla CSS with BEM naming (`header__logo`, `header__nav`, `footer__links`)
**And** web: responsive layout follows mobile-first breakpoints (640/768/1024/1280/1440px)
**And** mobile: `_layout.tsx` root layout uses Tab navigator with 4 tabs: Home, Search, Cart, Profile
**And** mobile: tab bar uses design tokens for colors and spacing
**And** both platforms: skeleton loading states are used (never spinners)
**And** both platforms: all interactive elements meet 44x44px minimum touch target (NFR23)
**And** web: a dismissible app download banner appears once per session after the first product view, promoting the mobile app (FR39); the banner uses BEM CSS (`app-banner`, `app-banner__text`, `app-banner__dismiss`) and stores dismissal state in sessionStorage
**And** web: keyboard navigation works for all interactive elements (NFR20)

## Epic 3: Product Discovery & Browsing

Visitors can discover and browse products — via AI conversational search, categories, or filters — with premium gallery-style product pages showing transparent pricing and affiliate disclosure. Web (SSR for SEO) and mobile (native) in parallel.

### Story 3.1: Violet Catalog Adapter & Product Types

As a **developer**,
I want a VioletAdapter implementation for catalog operations with complete product types,
So that product data flows from Violet API through the Adapter Pattern into our UI.

**Acceptance Criteria:**

**Given** the SupplierAdapter interface from Story 1.2
**When** the VioletAdapter is implemented
**Then** `packages/shared/src/adapters/violetAdapter.ts` implements `getProducts()` and `getProduct()` methods
**And** `packages/shared/src/types/product.types.ts` defines complete types: `Product`, `Offer`, `SKU`, `ProductImage`, `ProductVariant` mapped from Violet's data model
**And** `packages/shared/src/schemas/product.schema.ts` defines Zod schemas for Violet API response validation
**And** Violet snake_case fields are transformed to camelCase at the adapter boundary (never in UI code)
**And** `packages/shared/src/adapters/adapterFactory.ts` returns the correct adapter by config
**And** the adapter uses Violet auth tokens from `violetAuth.ts` (server-side)
**And** API errors are mapped to structured error responses: `{ data: null, error: { code: "VIOLET.API_ERROR", message } }`
**And** the adapter implements request queuing with exponential backoff for Violet API rate limits (FR49, NFR31), using a configurable retry strategy (max 3 retries, 1s/2s/4s backoff)

### Story 3.2: Product Listing Page with Category Browsing (Web SSR + Mobile)

As a **visitor**,
I want to browse products by category with a clean, paginated grid,
So that I can discover products through traditional browsing.

**Acceptance Criteria:**

**Given** a visitor navigates to the products section
**When** the product listing loads
**Then** web: `products/index.tsx` renders a server-side rendered product grid (SSR for SEO)
**And** mobile: `(tabs)/index.tsx` renders a native product list using FlatList
**And** products are fetched via TanStack Query hook `useProducts()` in `packages/shared/src/hooks/useProducts.ts` calling VioletAdapter
**And** query key follows convention: `['products', 'list', { category, page }]`
**And** results are paginated with clear count: "Showing 12 of 48 products" (no infinite scroll)
**And** each product card shows: image, product name, price (formatted via `formatPrice()`), merchant name
**And** web: product cards use gallery-style layout with generous whitespace, BEM CSS (`product-card`, `product-card__image`, `product-card__price`)
**And** mobile: product cards use React Native StyleSheet with design tokens
**And** category navigation shows max 5-6 top-level categories
**And** loading state shows skeleton screens on both platforms
**And** staleTime is set to 5 minutes for catalog data

### Story 3.3: Product Detail Page (Web SSR + Mobile)

As a **visitor**,
I want to view a product detail page with hero image, transparent pricing, and essential info,
So that I can evaluate a product with all the information I need to decide.

**Acceptance Criteria:**

**Given** a visitor clicks on a product card
**When** the product detail page loads
**Then** web: `products/$productId.tsx` renders SSR with complete HTML for crawlers
**And** mobile: `products/[productId].tsx` renders via Stack push navigation
**And** the page displays: hero image (dominant), product name (Cormorant Garamond heading), price (clear, no fake discounts), essential specs, internal review placeholder
**And** images are lazy-loaded: web uses `loading="lazy"`, mobile uses Expo `<Image>` (NFR6)
**And** affiliate disclosure is displayed proximate to purchase CTAs (FR11, FR51) — positioned as trust signal
**And** transparent pricing shows the actual price with no dark patterns
**And** an "Add to Cart" button is the single primary CTA
**And** web: meta tags, Open Graph tags, and JSON-LD structured data are generated dynamically (FR35)
**And** TanStack Query hook `useProduct(productId)` with query key `['products', 'detail', productId]`
**And** 3 UI states handled: loading (skeleton), error (ErrorMessage component), success (product detail)
**And** if the product is unavailable, similar products are suggested based on semantic similarity (FR5 — placeholder for pgvector integration)

### Story 3.4: Product Filtering & Sorting (Web + Mobile)

As a **visitor**,
I want to filter and sort product results by relevance, price, and availability,
So that I can quickly narrow down to products that match my criteria.

**Acceptance Criteria:**

**Given** a visitor is on the product listing page
**When** they apply filters or sorting
**Then** 3-5 essential filters are available per category (price range, availability, brand)
**And** sorting options include: relevance (default), price low-to-high, price high-to-low
**And** web: filters use progressive disclosure — shown only when browsing a category
**And** mobile: filters accessible via a bottom sheet or filter screen
**And** filter changes update the product list via TanStack Query with updated query params
**And** URL reflects filter state on web (for shareable filtered views)
**And** filter counts update in real-time as selections change

### Story 3.5: AI Conversational Search — Edge Function & Embeddings (Backend)

As a **developer**,
I want an AI search backend that processes natural language queries using pgvector embeddings,
So that the conversational search feature has the data and processing pipeline it needs.

**Acceptance Criteria:**

**Given** the Supabase setup from Story 1.4
**When** the search infrastructure is configured
**Then** `supabase/migrations/00002_product_embeddings.sql` creates the `product_embeddings` table with pgvector extension and HNSW index
**And** `supabase/functions/generate-embeddings/index.ts` Edge Function takes product text descriptions and generates OpenAI embeddings, storing them in pgvector
**And** `supabase/functions/search-products/index.ts` Edge Function accepts a query string, generates query embedding via OpenAI, performs pgvector similarity search, and enriches results with live Violet data (prices, stock)
**And** the search Edge Function returns results with brief explanations of why each product matches (FR2)
**And** search response time target: < 2s end-to-end (NFR2)
**And** both Edge Functions respect the 2s CPU / 10MB bundle limits
**And** Zod schemas validate search input and output
**And** the search hook `useSearch()` is created in `packages/shared/src/hooks/useSearch.ts` with query key `['search', 'results', { query, filters }]` and staleTime of 2 minutes

### Story 3.6: AI Conversational Search UI (Web + Mobile)

As a **visitor**,
I want to search for products using natural language like "gift for my dad who likes cooking, budget $150",
So that I can find relevant products without knowing exact keywords.

**Acceptance Criteria:**

**Given** a visitor on any page/screen
**When** they interact with the search bar
**Then** web: the search bar is always visible in the header with placeholder text: "What are you looking for?"
**And** mobile: the Search tab has a prominent search input with the same placeholder
**And** results are displayed as a curated product grid (not a chatbot conversation)
**And** each result includes a brief "why this matches" explanation (FR2)
**And** the search gracefully falls back to keyword-based results if AI doesn't improve results
**And** web: search results page at `search/index.tsx`
**And** mobile: search results in `(tabs)/search.tsx`
**And** web: SearchBar component uses BEM CSS (`search-bar`, `search-bar__input`, `search-bar__results`)
**And** loading state shows skeleton screen during search
**And** empty state shows helpful suggestions ("Try: 'red dress under $50 for a summer wedding'")

### Story 3.7: Product Catalog Sync via Webhooks

As a **system**,
I want to automatically sync the product catalog from Violet via webhooks and scheduled sync,
So that product data stays current without manual intervention.

**Acceptance Criteria:**

**Given** the Violet webhook infrastructure
**When** Violet sends offer webhooks (OFFER_ADDED, OFFER_UPDATED, OFFER_REMOVED, OFFER_DELETED)
**Then** `supabase/functions/handle-webhook/index.ts` Edge Function receives and processes them
**And** the webhook handler validates HMAC signature via `X-Violet-Hmac` header (NFR14)
**And** deduplication uses `X-Violet-Event-Id` stored in a `webhook_events` table (NFR26)
**And** `supabase/migrations/00003_webhook_events.sql` creates the webhook events table with idempotency index
**And** OFFER_UPDATED triggers re-generation of embeddings for the updated product
**And** OFFER_REMOVED/DELETED marks products as unavailable (FR46)
**And** sync webhooks (PRODUCT_SYNC_STARTED/COMPLETED/FAILED) are logged for monitoring
**And** webhook processing returns 200 quickly and processes asynchronously
**And** the webhook handler uses Zod to validate payloads

### Story 3.8: SEO Foundation (Web)

As a **search engine crawler**,
I want all product and listing pages to have complete SSR HTML with structured data,
So that the platform ranks well in search results.

**Acceptance Criteria:**

**Given** a crawler visits any product or listing page
**When** the page is rendered server-side
**Then** complete HTML is available without JavaScript execution (FR34)
**And** each page has dynamic `<title>`, `<meta description>`, and Open Graph tags (FR35)
**And** product pages include JSON-LD structured data (`Product` schema with name, price, availability, image)
**And** an XML sitemap is generated and maintained at `/sitemap.xml` covering all product and content pages (FR36)
**And** the sitemap updates when products are added/removed via webhook sync
**And** `robots.txt` is configured correctly
**And** SSR response time remains < 1.5s (NFR18)

---

## Epic 4: Shopping Cart & Unified Checkout

**FRs:** FR12-FR21, FR54
**NFRs:** NFR1, NFR4, NFR5, NFR14, NFR18, NFR26
**Violet.io Dependencies:** Cart API, Bag lifecycle, Stripe wallet-based checkout, shipping methods, country restrictions

### Story 4.1: Cart Creation & Item Management (Web + Mobile)

As a **visitor**,
I want to add products from multiple merchants to a single unified cart and manage items,
So that I can shop across merchants seamlessly.

**Acceptance Criteria:**

**Given** a visitor on a product detail page (web or mobile)
**When** they tap/click "Add to Cart"
**Then** a Violet cart is created via `POST /checkout/cart` if none exists (using channel app_id + auth token)
**And** the SKU is added via `POST /checkout/cart/{id}/skus` with `sku_id`, `quantity`, `app_id`
**And** the cart correctly groups items into Bags (one per merchant) — this is Violet-managed, not our logic
**And** the cart state is stored in Supabase (`carts` table) with `violet_cart_id`, `user_id` (nullable for guests), `session_id`
**And** `supabase/migrations/00004_carts.sql` creates carts + cart_items tables with RLS policies
**And** anonymous users get a Supabase anonymous session (FR14) and their cart is linked to `session_id`
**And** web: cart count badge updates in the header via TanStack Query invalidation
**And** web: a cart drawer slides in from the right (250ms ease) when an item is added to cart, showing the added item, bag summary, and a "Proceed to Checkout" CTA; the drawer closes on overlay click, Escape key, or "Continue Shopping" link (per UX Design Specification cart drawer component)
**And** mobile: cart count badge updates on the Cart tab icon
**And** visitors can update quantity via `PUT /checkout/cart/{id}/skus/{sku_id}` (min: 1)
**And** visitors can remove items via `DELETE /checkout/cart/{id}/skus/{sku_id}`
**And** if the API returns 200 with `errors` array, errors are displayed per-bag (e.g., "Item X is out of stock")
**And** all cart API calls go through Server Functions (web) / Edge Functions (mobile) — Violet token never exposed to client
**And** `packages/shared/src/hooks/useCart.ts` provides shared cart mutation hooks with optimistic updates

### Story 4.2: Cart Summary with Transparent Pricing (Web + Mobile)

As a **visitor**,
I want to see a clear cart summary with accurate pricing broken down by merchant,
So that I understand exactly what I'm paying before checkout.

**Acceptance Criteria:**

**Given** a visitor views their cart
**When** cart data is loaded via `GET /checkout/cart/{id}`
**Then** the cart page/screen shows items grouped by merchant (Bag)
**And** each Bag section displays: merchant name, items with images/names/quantities/prices
**And** subtotal per Bag is displayed
**And** estimated tax is shown (from Violet's `tax` field on each Bag)
**And** estimated shipping is shown (from Violet's `shipping_total` on each Bag, or "Calculated at checkout" if not yet set)
**And** cart total = sum of all Bag totals (subtotal + tax + shipping)
**And** no fake discounts, countdown timers, or manipulative urgency indicators (FR10, anti-dark-patterns)
**And** affiliate disclosure is visible on the cart page (FR11)
**And** web: the platform provides BOTH a cart drawer (quick view, triggered by add-to-cart and cart icon click, slides from right with 250ms ease) and a full cart page at `app/routes/cart/index.tsx` for detailed review; the cart drawer includes a "View Full Cart" link to the cart page
**And** web: cart page uses BEM CSS (`cart`, `cart__bag`, `cart__item`, `cart__summary`); cart drawer uses BEM CSS (`cart-drawer`, `cart-drawer__item`, `cart-drawer__summary`, `cart-drawer__overlay`)
**And** mobile: cart screen at `app/(tabs)/cart.tsx` with native ScrollView and merchant grouping
**And** empty cart state shows a friendly message with a "Start Shopping" CTA
**And** `packages/shared/src/hooks/useCart.ts` `useCartQuery` hook handles data fetching with `['cart', 'detail', cartId]` query key

### Story 4.3: Shipping Method Selection (Web + Mobile)

As a **visitor**,
I want to select shipping methods for each merchant in my cart,
So that I can choose my preferred delivery speed and cost.

**Acceptance Criteria:**

**Given** a visitor proceeds to checkout with items in cart
**When** the shipping step is presented
**Then** available shipping methods are fetched via `GET /checkout/cart/{id}/shipping` per Bag
**And** each Bag displays its available shipping methods with name, estimated delivery, and price
**And** visitor selects one shipping method per Bag
**And** selection is applied via `PUT /checkout/cart/{id}/shipping` with the chosen `shipping_method_id` per Bag
**And** the cart total updates to reflect selected shipping costs
**And** if a Bag has only one shipping option, it is auto-selected
**And** web: shipping selection is part of the one-step checkout page (not a separate page)
**And** mobile: shipping selection is an inline section within the checkout screen
**And** if shipping methods fail to load for a Bag, a retry button and error message are shown
**And** country restrictions are enforced: if visitor's shipping address is not in a Violet-supported country, a clear message is shown (FR21) — supported countries depend on Stripe platform account type (US/UK/EU/Other)

### Story 4.4: One-Step Checkout with Stripe Payment (Web + Mobile)

As a **visitor**,
I want to complete checkout in a single page/screen with my payment details,
So that the purchase process is fast and frictionless.

**Acceptance Criteria:**

**Given** a visitor has items in their cart and proceeds to checkout
**When** the checkout page/screen loads
**Then** a single unified checkout UI is presented with sections for: Guest info, Shipping address, Shipping methods, Payment (FR17)
**And** guest info collects: email, first name, last name (submitted via `POST /checkout/cart/{id}/customer`)
**And** shipping address collects: address1, city, state, postal_code, country (submitted via `POST /checkout/cart/{id}/shipping/address`)
**And** billing address defaults to shipping address with an option to enter a different one
**And** payment uses Stripe Elements embedded in the checkout page — `wallet_based_checkout: true` means Stripe handles card + Apple Pay + Google Pay (FR15)
**And** Stripe Payment Element is initialized with the Violet-provided `payment_intent_client_secret`
**And** the Apply Payment step is NOT called (wallet-based checkout skips it)
**And** checkout is submitted via `POST /checkout/cart/{id}/submit` after Stripe confirms payment
**And** marketing consent checkbox is included and its value sent via the customer endpoint (FR20)
**And** guest checkout works without account creation (FR14)
**And** web: checkout page at `app/routes/checkout/index.tsx`, Stripe Elements rendered client-side (CSR boundary)
**And** mobile: checkout screen at `app/checkout.tsx` using `@stripe/stripe-react-native` PaymentSheet
**And** web: form uses BEM CSS (`checkout`, `checkout__section`, `checkout__field`, `checkout__submit`)
**And** form validation happens client-side before API calls (email format, required fields, postal code format)
**And** the submit button shows a loading state and is disabled during processing

### Story 4.5: Payment Confirmation & 3D Secure Handling

As a **visitor**,
I want my payment to be securely processed with 3D Secure when required,
So that my purchase is protected and I receive clear confirmation.

**Acceptance Criteria:**

**Given** a visitor submits checkout
**When** Stripe requires 3D Secure authentication
**Then** the Stripe Payment Element handles the 3DS challenge flow automatically
**And** web: `stripe.confirmPayment()` opens the 3DS modal natively via Stripe.js
**And** mobile: Stripe React Native SDK handles 3DS in-app
**When** payment succeeds
**Then** the visitor is redirected to an order confirmation page/screen
**And** the confirmation displays: order ID, items purchased, total paid, estimated delivery (FR22)
**And** the cart is cleared from local state and Supabase
**And** web: confirmation page at `app/routes/order/[orderId]/confirmation.tsx`
**And** mobile: confirmation screen at `app/order/[orderId]/confirmation.tsx`
**When** payment fails
**Then** the visitor stays on the checkout page with a clear error message
**And** the visitor can retry with a different payment method without losing form data (FR19)
**And** the cart and address data are preserved
**And** all Violet 200-with-errors responses are checked and bag-level errors are surfaced clearly

### Story 4.6: Cross-Device Cart Sync (Web + Mobile)

As a **returning visitor**,
I want my cart to sync across my devices when I'm logged in,
So that I can start shopping on mobile and finish on web (or vice versa).

**Acceptance Criteria:**

**Given** an authenticated user with items in their cart
**When** they access the platform from another device
**Then** their cart is loaded from Supabase (linked by `user_id`)
**And** cart data is synced with Violet's cart state via `GET /checkout/cart/{id}`
**And** if there are conflicts (e.g., item went out of stock), the user is notified
**And** Supabase Realtime subscription on the `carts` table pushes updates to all active sessions (FR54)
**And** sync latency is < 1 second (NFR architecture spec)
**And** web: `packages/shared/src/hooks/useCartSync.ts` subscribes to Realtime changes and invalidates TanStack Query cache
**And** mobile: same hook used via shared package
**And** anonymous cart merging: when a guest logs in, their anonymous cart is merged with any existing authenticated cart
**And** merge strategy: items from anonymous cart are added to authenticated cart, duplicates increase quantity

### Story 4.7: Checkout Error Handling & Edge Cases

As a **system**,
I want robust error handling throughout the checkout flow,
So that visitors never encounter silent failures or lost orders.

**Acceptance Criteria:**

**Given** any step in the checkout process
**When** a Violet API call fails or returns errors
**Then** the error is parsed from the response (check `errors` array even on 200 status)
**And** bag-level errors are displayed next to the relevant merchant section
**And** cart-level errors are displayed at the top of the checkout
**And** inventory validation failures (FR18) show which specific items are unavailable with options to remove or update quantity
**And** network timeouts trigger a retry prompt (not automatic retry) with preserved form state
**When** a cart enters an unexpected state
**Then** the system attempts to recover by re-fetching cart state from Violet
**And** if the cart is no longer valid (e.g., expired), the visitor is informed and guided to create a new cart
**When** checkout is submitted but confirmation is not received
**Then** the system polls for order status before showing an error (handling network interruptions)
**And** duplicate submission prevention: the submit button is disabled after first click, and idempotency is ensured server-side
**And** all errors are logged to the `error_logs` table in Supabase for debugging
**And** `supabase/migrations/00005_error_logs.sql` creates the error logging table

---

## Epic 5: Order Management & Tracking

**FRs:** FR22-FR27, FR32, FR54
**NFRs:** NFR1, NFR4, NFR14, NFR26
**Violet.io Dependencies:** Order/Bag webhooks, Order states lifecycle, Bag states mapping, Refund tracking

### Story 5.1: Order Confirmation & Data Persistence (Web + Mobile)

As a **buyer**,
I want to see a detailed order confirmation immediately after purchase,
So that I know my order was placed successfully.

**Acceptance Criteria:**

**Given** checkout completes successfully
**When** Violet returns the completed cart/order
**Then** order data is persisted in Supabase (`orders` table with `violet_order_id`, `user_id`, `session_id`, `email`, `status`, `total`, `created_at`)
**And** `supabase/migrations/00006_orders.sql` creates orders + order_bags + order_items tables with RLS
**And** each Bag becomes an `order_bag` row with its own `violet_bag_id`, `merchant_name`, `status`, `tracking_number`, `tracking_url`
**And** the confirmation page/screen displays: order ID, items per merchant, subtotal, tax, shipping, total paid, estimated delivery (FR22)
**And** web: confirmation at `app/routes/order/[orderId]/confirmation.tsx`
**And** mobile: confirmation at `app/order/[orderId]/confirmation.tsx`
**And** a confirmation email is queued (via Supabase Edge Function triggering email provider) (FR23)
**And** guest buyers receive an `order_lookup_token` (hashed, stored in Supabase) for later order tracking (FR27)
**And** guest session data (shipping address, email, payment references) is cleared from the client after order confirmation is displayed, retaining only the order_lookup_token for future reference (FR54, GDPR data minimization)

### Story 5.2: Order Status Webhooks Processing

As a **system**,
I want to process Violet order/bag webhooks to keep order status up to date,
So that buyers always see accurate order information.

**Acceptance Criteria:**

**Given** Violet sends order webhooks (ORDER_UPDATED, ORDER_COMPLETED, ORDER_CANCELED, ORDER_REFUNDED, ORDER_RETURNED)
**When** the webhook handler receives them at `supabase/functions/handle-webhook/index.ts`
**Then** HMAC signature is validated via `X-Violet-Hmac` header (NFR14)
**And** deduplication via `X-Violet-Event-Id` in `webhook_events` table (NFR26)
**And** Bag-level webhooks (BAG_SUBMITTED, BAG_ACCEPTED, BAG_SHIPPED, BAG_COMPLETED, BAG_CANCELED, BAG_REFUNDED) update the corresponding `order_bag` row
**And** Bag tracking info (tracking_number, tracking_url, carrier) is extracted and stored when BAG_SHIPPED fires
**And** the order-level status is derived from its bags: all bags same state → that state; mixed states → "Partially Shipped" / "Partially Completed" (FR25)
**And** **CANCELED ≠ REFUNDED** — a canceled bag is tracked separately from a refunded one; cancellation does NOT auto-trigger refund status
**And** status changes trigger email notifications via Edge Function (FR23): shipped, delivered, refunded
**And** Supabase Realtime broadcasts status changes to connected clients (FR54)
**And** webhook handler returns 200 immediately, processes asynchronously

### Story 5.3: Unified Order Tracking View (Web + Mobile)

As a **buyer**,
I want to view all my orders in a unified dashboard with per-merchant tracking,
So that I can follow the status of everything I've purchased.

**Acceptance Criteria:**

**Given** an authenticated buyer
**When** they navigate to their orders page/screen
**Then** all orders are listed in reverse chronological order (FR24)
**And** each order shows: order date, total, overall status, number of merchants
**And** expanding an order reveals per-merchant bags with: merchant name, items, bag status, tracking link (if shipped)
**And** bag statuses are mapped to user-friendly labels: IN_PROGRESS → "Processing", SUBMITTED → "Processing", ACCEPTED → "Confirmed", SHIPPED → "Shipped", COMPLETED → "Delivered", CANCELED → "Canceled", REFUNDED → "Refunded" (FR25)
**And** mixed bag states within an order show a clear summary (e.g., "2 of 3 items shipped")
**And** web: orders page at `app/routes/account/orders/index.tsx` and detail at `app/routes/account/orders/[orderId].tsx`
**And** mobile: orders tab at `app/(tabs)/orders.tsx` and detail at `app/order/[orderId]/index.tsx`
**And** `packages/shared/src/hooks/useOrders.ts` provides `useOrdersQuery` and `useOrderDetailQuery` hooks
**And** Supabase Realtime subscription auto-refreshes order status in real time (FR54)

### Story 5.4: Guest Order Lookup (Web + Mobile)

As a **guest buyer**,
I want to look up my order status using my email address,
So that I can track my purchase without creating an account.

**Acceptance Criteria:**

**Given** a guest buyer who completed checkout without an account
**When** they visit the order lookup page/screen and enter their email
**Then** a verification code is sent to their email (preventing unauthorized lookups)
**And** after verification, orders associated with that email are displayed (FR27)
**And** the order detail view is identical to authenticated users (same component, different data source)
**And** web: order lookup at `app/routes/order/lookup.tsx`
**And** mobile: order lookup accessible from profile/settings screen
**And** rate limiting on lookup requests prevents abuse (NFR security)
**And** the lookup token from Story 5.1 can also be used as a direct link (e.g., `/order/lookup?token=xxx`)

### Story 5.5: Refund Processing & Communication (Web + Mobile)

As a **buyer**,
I want to see refund status clearly when a merchant processes a refund,
So that I know when to expect my money back.

**Acceptance Criteria:**

**Given** a Violet BAG_REFUNDED webhook is received
**When** the webhook is processed
**Then** the corresponding `order_bag` status is updated to "REFUNDED"
**And** refund details (amount, reason if available) are stored in `order_refunds` table
**And** `supabase/migrations/00007_order_refunds.sql` creates the refund tracking table
**And** the buyer receives an email notification about the refund (FR23, FR26)
**And** the order detail view shows refund status per bag: "Refund of $X.XX processed"
**And** the order total is annotated with refund info (e.g., "Total: $150.00 — Refund: $50.00")
**And** **CANCELED bags without refund** show "Canceled" status, NOT "Refunded" — these are distinct states
**And** web + mobile: refund info is displayed inline in the order detail component
**And** Supabase Realtime pushes refund updates to connected clients

### Story 5.6: Email Notifications Pipeline

As a **buyer**,
I want to receive timely email notifications about my order status,
So that I stay informed without having to check the app.

**Acceptance Criteria:**

**Given** an order status change occurs (confirmed, shipped, delivered, refunded)
**When** the webhook handler processes the event
**Then** an email notification is triggered via Supabase Edge Function (FR23)
**And** `supabase/functions/send-notification/index.ts` handles email sending via a transactional email provider (e.g., Resend)
**And** email templates are maintained for: order confirmation, order shipped (with tracking link), order delivered, refund processed
**And** emails include: order ID, relevant items, status-specific details, link to order tracking page
**And** guest buyers receive emails at the address they provided during checkout
**And** authenticated buyers receive emails at their account email
**And** email sending failures are logged and retried (max 3 attempts)
**And** the system respects marketing consent: transactional emails (order updates) are always sent, marketing emails only with consent (FR20)
**And** FR32: email notifications include helpful support information

---

## Epic 6: Personalization & Engagement

**FRs:** FR6, FR30, FR39 (moved to Epic 2 Story 2.5), FR40, FR41 (Story 6.7), FR42 (Story 6.7), FR43 (Story 6.8)
**NFRs:** NFR1, NFR4, NFR18
**Dependencies:** pgvector embeddings (Epic 3), Supabase Auth (Epic 2), Violet offers API

### Story 6.1: User Account & Profile Management (Web + Mobile)

As a **visitor**,
I want to create an account and manage my profile,
So that I can access personalized features and save my preferences.

**Acceptance Criteria:**

**Given** a visitor on the platform
**When** they choose to create an account
**Then** Supabase Auth handles registration via email/password (FR29)
**And** social login (Google, Apple) is supported via Supabase Auth providers
**And** email verification is required before account activation
**And** `supabase/migrations/00008_user_profiles.sql` ALTERs the `user_profiles` table (created in Story 2.1) to add columns: display_name, avatar_url, preferences JSON, with updated RLS policies for authenticated users
**And** profile page/screen allows editing: display name, email, password change
**And** web: profile at `app/routes/account/profile.tsx`
**And** mobile: profile at `app/(tabs)/profile.tsx`
**And** login links anonymous session data (cart, browsing history) to the new account
**And** `packages/shared/src/hooks/useAuth.ts` provides shared auth hooks (useUser, useLogin, useLogout, useRegister)

### Story 6.2: Browsing History & Preference Tracking

As a **system**,
I want to track authenticated users' browsing and purchase history,
So that personalization features have data to work with.

**Acceptance Criteria:**

**Given** an authenticated user browses the platform
**When** they view a product, search for something, or make a purchase
**Then** browsing events are stored in `user_events` table (user_id, event_type, product_id, search_query, timestamp)
**And** `supabase/migrations/00009_user_events.sql` creates the events table with RLS (users can only read their own data)
**And** events are written via a lightweight client-side hook (`packages/shared/src/hooks/useTracking.ts`)
**And** web: tracking hook fires on route navigation (TanStack Router `onRouteChange`)
**And** mobile: tracking hook fires on screen focus (React Navigation `useFocusEffect`)
**And** purchase history is derived from the `orders` table (no duplication)
**And** data retention: browsing events older than 6 months are auto-purged via Supabase pg_cron
**And** tracking respects user privacy: no third-party analytics, no fingerprinting, data stays in Supabase (NFR privacy)

### Story 6.3: Personalized Search Results (Web + Mobile)

As a **returning user**,
I want search results weighted by my browsing and purchase history,
So that I find relevant products faster.

**Acceptance Criteria:**

**Given** an authenticated user with browsing/purchase history
**When** they perform a search
**Then** the AI search Edge Function incorporates user preferences into the embedding query (FR6)
**And** relevance scoring considers: semantic match (primary), category affinity from history, price range preferences
**And** the search results include a subtle personalization indicator (e.g., "Based on your preferences") — no dark pattern manipulation
**And** personalization improves over time as interaction data accumulates (FR6)
**And** users can opt out of personalized results via a toggle in account settings
**And** anonymous users get default (non-personalized) search results — no degraded experience
**And** `packages/shared/src/hooks/useSearch.ts` passes `user_id` to the search Edge Function when authenticated
**And** web + mobile: same search results component, personalization is backend-driven

### Story 6.4: Wishlist / Saved Items (Web + Mobile)

As a **authenticated user**,
I want to save products to a wishlist for later,
So that I can remember items I'm interested in.

**Acceptance Criteria:**

**Given** an authenticated user on a product page or search results
**When** they tap/click a "Save" / heart icon
**Then** the product is added to their wishlist in Supabase (`wishlists` table: user_id, product_id, created_at)
**And** `supabase/migrations/00010_wishlists.sql` creates the wishlist table with RLS
**And** the heart icon toggles between saved/unsaved states with optimistic UI update
**And** web: wishlist page at `app/routes/account/wishlist.tsx`
**And** mobile: wishlist accessible from profile tab
**And** wishlist items show current price and availability (re-fetched from Violet on view)
**And** if a wishlisted item goes out of stock, it's visually marked but not removed
**And** "Add to Cart" action available directly from wishlist
**And** `packages/shared/src/hooks/useWishlist.ts` provides shared wishlist hooks
**And** wishlist syncs across devices for authenticated users (FR54, via Supabase)

### Story 6.5: Product Recommendations (Web + Mobile)

As a **visitor**,
I want to see product recommendations based on what I'm viewing,
So that I can discover related products I might like.

**Acceptance Criteria:**

**Given** a visitor viewing a product detail page
**When** the page loads
**Then** a "You might also like" section shows 4-8 semantically similar products (FR5, FR30)
**And** similarity is computed via pgvector cosine distance on product embeddings
**And** if the user is authenticated, recommendations also factor in browsing history (FR6)
**And** recommendations exclude the current product and out-of-stock items
**And** `supabase/functions/get-recommendations/index.ts` Edge Function handles recommendation logic
**And** web: recommendations section below product details, horizontal scroll on mobile breakpoint
**And** mobile: recommendations in a horizontal FlatList below product details
**And** recommendations load asynchronously (don't block product page render)
**And** `packages/shared/src/hooks/useRecommendations.ts` provides shared hook with `['recommendations', productId]` query key
**And** no manipulative "X people are viewing this" or fake scarcity (anti-dark-patterns)

### Story 6.6: Recently Viewed Products (Web + Mobile)

As a **visitor**,
I want to see products I recently viewed,
So that I can easily go back to items I was interested in.

**Acceptance Criteria:**

**Given** a visitor who has viewed product pages
**When** they navigate to the home page or a dedicated "Recently Viewed" section
**Then** up to 12 recently viewed products are displayed in reverse chronological order
**And** for anonymous users: recently viewed is stored in local storage (web) / AsyncStorage (mobile)
**And** for authenticated users: recently viewed is derived from `user_events` table (cross-device)
**And** web: recently viewed section on homepage and optionally on search results page
**And** mobile: recently viewed section on home screen
**And** each item shows: image, name, price, availability status
**And** `packages/shared/src/hooks/useRecentlyViewed.ts` abstracts the storage layer (local vs Supabase)

### Story 6.7: Push Notification Infrastructure & Preferences (Mobile)

As a **registered mobile user**,
I want to receive relevant push notifications for order updates, price drops, and back-in-stock alerts, and configure which types I receive,
So that I stay informed about things I care about without being spammed.

**Acceptance Criteria:**

**Given** a registered user on the mobile app
**When** they first launch the app after registration
**Then** the app requests push notification permission via Expo Notifications API with a clear value proposition ("Get notified when your order ships or a saved item drops in price")
**And** the Expo push token is stored in Supabase (`user_push_tokens` table: user_id, expo_push_token, device_id, platform, created_at)
**And** `supabase/migrations/00015_push_notifications.sql` creates `user_push_tokens` and `notification_preferences` tables with RLS
**And** transactional notifications are supported: order confirmed, order shipped, order delivered, refund processed (FR41)
**And** marketing notifications are supported: price drop on wishlisted item, back-in-stock for wishlisted item (FR41)
**And** `supabase/functions/send-push/index.ts` Edge Function sends push notifications via Expo Push API (`https://exp.host/--/api/v2/push/send`)
**And** push triggers are integrated into existing webhook handlers (Story 5.2) and wishlist price-check cron job
**And** notification preferences are granular per type: order_updates (default: on), price_drops (default: on), back_in_stock (default: on), marketing (default: off) (FR42)
**And** mobile: notification preferences screen at `app/settings/notifications.tsx` with toggles per type
**And** preferences are stored in `notification_preferences` table (user_id, type, enabled) with RLS
**And** users can opt out of all notifications or specific types at any time
**And** notifications respect the anti-spam principle: max 1 marketing notification per day, no duplicate notifications for the same event
**And** `packages/shared/src/hooks/useNotificationPreferences.ts` provides hooks for reading/updating preferences

### Story 6.8: Deep Linking & Universal Links (Web + Mobile)

As a **user**,
I want web URLs to open directly in the mobile app when installed, and shared app content to work on web,
So that I have seamless navigation between web and mobile.

**Acceptance Criteria:**

**Given** the mobile app is installed on a user's device
**When** they tap a platform URL (e.g., from email, social media, or browser)
**Then** the URL opens in the mobile app at the corresponding screen (FR43)
**And** Apple Universal Links are configured via `apple-app-site-association` file served at `/.well-known/apple-app-site-association` from the web domain
**And** Android App Links are configured via `assetlinks.json` file served at `/.well-known/assetlinks.json` from the web domain
**And** Expo `app.json` / `app.config.ts` configures `intentFilters` (Android) and `associatedDomains` (iOS) for the production domain
**And** URL-to-screen mapping covers: product pages (`/product/[id]` -> `app/product/[id]`), content pages (`/content/[slug]` -> `app/content/[slug]`), order tracking (`/order/[id]` -> `app/order/[id]`), category browsing (`/category/[slug]` -> `app/category/[slug]`)
**And** if the app is not installed, the URL opens normally in the web browser (graceful fallback)
**And** web: the `/.well-known/` files are served via a TanStack Start API route or static file configuration on Cloudflare Workers
**And** `packages/shared/src/utils/deepLink.ts` provides a URL mapping utility shared between web routing and mobile Expo Router linking configuration
**And** deep links preserve query parameters (e.g., UTM tracking, search queries)

---

## Epic 7: Content, SEO & Editorial

**FRs:** FR9, FR34-FR38
**NFRs:** NFR1, NFR4, NFR18
**Dependencies:** SSR TanStack Start (Epic 1), Design System (Epic 1)

### Story 7.1: Editorial Content Pages (Web + Mobile)

As a **visitor**,
I want to read editorial content (guides, comparisons, reviews) that link to relevant products,
So that I can make informed purchasing decisions.

**Acceptance Criteria:**

**Given** editorial content exists in the CMS (Supabase `content_pages` table)
**When** a visitor navigates to a content page
**Then** the page displays formatted content with title, author, date, body (Markdown rendered to HTML) (FR9)
**And** `supabase/migrations/00011_content_pages.sql` creates `content_pages` table (slug, title, type, body_markdown, author, published_at, seo_title, seo_description, featured_image_url) with RLS (public read)
**And** content types: "guide", "comparison", "review"
**And** product links within content are rendered as interactive product cards (image, name, price, "View Product" CTA)
**And** product cards fetch live data from the products table (availability, current price)
**And** web: content pages at `app/routes/content/[slug].tsx`, SSR for SEO (FR34)
**And** mobile: content screen at `app/content/[slug].tsx`
**And** web: BEM CSS (`content-page`, `content-page__header`, `content-page__body`, `content-page__product-card`)
**And** affiliate disclosure banner is visible on every content page (FR11)

### Story 7.2: Content Listing & Navigation (Web + Mobile)

As a **visitor**,
I want to browse all editorial content organized by type,
So that I can find guides and reviews relevant to my interests.

**Acceptance Criteria:**

**Given** a visitor navigates to the content section
**When** the content listing page loads
**Then** content is displayed in a grid/list with: featured image, title, excerpt, type badge, date
**And** content can be filtered by type (guides, comparisons, reviews) (FR9)
**And** content is sorted by publish date (newest first) with pagination
**And** web: content index at `app/routes/content/index.tsx`, SSR
**And** mobile: content accessible via a "Guides" or "Discover" section on the home tab
**And** `packages/shared/src/hooks/useContent.ts` provides `useContentListQuery` hook with `['content', 'list', type, page]` query key
**And** web: BEM CSS (`content-list`, `content-list__card`, `content-list__filter`)

### Story 7.3: Advanced SEO Implementation (Web)

As a **search engine crawler**,
I want comprehensive SEO metadata and structured data on all pages,
So that the platform achieves strong organic search visibility.

**Acceptance Criteria:**

**Given** any page on the web platform
**When** a crawler accesses it
**Then** every page has unique `<title>` and `<meta description>` tags (FR35)
**And** Open Graph tags (og:title, og:description, og:image, og:url) are set for social sharing
**And** Twitter Card meta tags are included
**And** product pages include JSON-LD `Product` schema (name, price, availability, image, brand)
**And** content pages include JSON-LD `Article` schema (headline, author, datePublished, image)
**And** category/collection pages include JSON-LD `ItemList` schema
**And** canonical URLs are set on all pages to prevent duplicate content
**And** `packages/shared/src/utils/seo.ts` provides helper functions for generating SEO metadata
**And** web: TanStack Start `createFileRoute` loader sets meta tags via route `meta` export
**And** mobile: deep linking metadata configured in `app.json` for app indexing

### Story 7.4: Sitemap & Indexing (Web)

As a **search engine crawler**,
I want an up-to-date XML sitemap and proper indexing controls,
So that all important pages are discovered and indexed efficiently.

**Acceptance Criteria:**

**Given** the web platform has product, content, and category pages
**When** a crawler requests `/sitemap.xml`
**Then** a dynamically generated XML sitemap lists all public pages (FR36)
**And** the sitemap includes: product pages, content pages, category pages, static pages (home, about, contact)
**And** each entry has: `<loc>`, `<lastmod>`, `<changefreq>`, `<priority>`
**And** products have `<changefreq>daily</changefreq>`, content has `<changefreq>weekly</changefreq>`
**And** the sitemap updates automatically when products are added/removed (webhook sync) or content is published
**And** `robots.txt` allows crawling of public pages and blocks admin/checkout routes
**And** web: sitemap generated via a Server Function or API route at `app/routes/api/sitemap.xml.ts`
**And** sitemap is split into sub-sitemaps if total URLs exceed 50,000 (sitemap index)
**And** Google Search Console integration is documented for manual submission

### Story 7.5: Social Sharing & Rich Previews (Web + Mobile)

As a **visitor**,
I want to share products and content on social media with rich previews,
So that my shares look attractive and drive traffic back to the platform.

**Acceptance Criteria:**

**Given** a visitor wants to share a product or content page
**When** they use the share functionality
**Then** web: native Web Share API is used (with fallback to copy-to-clipboard) (FR37)
**And** mobile: React Native `Share` API opens the native share sheet (FR38)
**And** shared links generate rich previews on social platforms (Open Graph tags from Story 7.3)
**And** product shares include: product image, name, price in the preview
**And** content shares include: featured image, title, excerpt in the preview
**And** share buttons are present on: product detail pages, content pages
**And** web: BEM CSS (`share-button`, `share-button__icon`)
**And** `packages/shared/src/hooks/useShare.ts` provides a cross-platform share hook
**And** affiliate disclosure is maintained even in shared content previews (FR11)

### Story 7.6: Content Administration via Supabase Studio (MVP)

As an **administrator**,
I want to create, edit, and publish editorial content using Supabase Studio as the CMS interface,
So that I can manage content without building a custom admin UI for MVP.

**Acceptance Criteria:**

**Given** the `content_pages` table exists (from Story 7.1)
**When** an admin needs to create or edit content
**Then** Supabase Studio (Table Editor) is the designated CMS interface for MVP — no custom admin content UI is built (FR37)
**And** the `content_pages` table supports a `status` column (enum: "draft", "published", "archived") to control content visibility
**And** only rows with `status = 'published'` and `published_at <= now()` are visible to visitors (enforced via RLS read policy)
**And** a documentation page in the project README describes the admin content workflow: how to create/edit/publish content via Supabase Studio
**And** the Markdown body field supports embedded product references using a convention (e.g., `{{product:violet_offer_id}}`) that the frontend renders as interactive product cards (FR38)
**And** content pages support internal links to other content pages and product pages (FR38)
**And** future iteration (post-MVP): a custom admin content editor with Markdown preview can replace Supabase Studio

---

## Epic 8: Administration, Operations & Customer Support

**FRs:** FR27a-c, FR44, FR47-FR50
**NFRs:** NFR1, NFR4, NFR9, NFR14, NFR18, NFR20-NFR22
**Dependencies:** Supabase (all tables), Violet.io commission tracking

### Story 8.1: FAQ & Help Center (Web + Mobile)

As a **visitor**,
I want to browse a FAQ and help section covering common questions,
So that I can find answers without contacting support.

**Acceptance Criteria:**

**Given** a visitor has questions about shipping, returns, payment, or order tracking
**When** they navigate to the help/FAQ page
**Then** FAQ content is displayed in an accordion/expandable format organized by category (FR27b)
**And** categories include: Shipping & Delivery, Returns & Refunds, Payment Methods, Order Tracking, Account & Privacy
**And** FAQ content is stored in Supabase `faq_items` table (category, question, answer_markdown, sort_order)
**And** `supabase/migrations/00012_faq_and_support.sql` creates `faq_items` + `support_inquiries` tables with RLS
**And** web: FAQ page at `app/routes/help/index.tsx`, SSR for SEO
**And** mobile: help screen at `app/help/index.tsx`
**And** FAQ answers include links to relevant platform pages (e.g., order lookup page)
**And** web: BEM CSS (`faq`, `faq__category`, `faq__item`, `faq__question`, `faq__answer`)
**And** a search/filter within FAQ to quickly find relevant questions

### Story 8.2: Contact & Support Form (Web + Mobile)

As a **visitor**,
I want to submit a support inquiry via a contact form,
So that I can get help with issues not covered by the FAQ.

**Acceptance Criteria:**

**Given** a visitor needs to contact support
**When** they navigate to the contact page and fill out the form
**Then** the form collects: name, email, subject (dropdown: Order Issue, Payment Problem, General Question, Other), message, optional order ID (FR27a)
**And** form submission creates a row in `support_inquiries` table (name, email, subject, message, order_id, status: "new", created_at)
**And** an email notification is sent to the support email address (configured via env var)
**And** the visitor receives a confirmation message on-screen and a confirmation email
**And** web: contact page at `app/routes/help/contact.tsx`
**And** mobile: contact screen at `app/help/contact.tsx`
**And** rate limiting prevents spam (max 3 submissions per email per hour)
**And** form validation: email format, message length (min 20 chars, max 2000 chars)
**And** honeypot field for basic bot protection (no CAPTCHA for UX)
**And** FR27c: the platform clearly communicates return/exchange policies (handled by individual merchants via Violet)

### Story 8.3: Analytics & Commission Dashboard (Internal)

As an **administrator**,
I want to view key business metrics and commission tracking,
So that I can monitor platform performance and revenue.

**Acceptance Criteria:**

**Given** an authenticated admin user
**When** they access the admin dashboard
**Then** key metrics are displayed: total orders, revenue (gross), commission earned, active users, conversion rate (FR44)
**And** commission data is derived from Violet order data: commission = % of subtotal per bag (not tax/shipping), with Stripe fees deducted from channel share
**And** metrics are computed via Supabase SQL views on existing tables (orders, order_bags, user_events)
**And** `supabase/migrations/00013_admin_views.sql` creates materialized views for dashboard metrics
**And** time-range filtering: today, last 7 days, last 30 days, custom range
**And** web-only: admin dashboard at `app/routes/admin/index.tsx` (protected route, admin RLS)
**And** admin role is managed via Supabase Auth custom claims (`user_role: 'admin'`)
**And** `supabase/migrations/00014_admin_roles.sql` creates admin role management with RLS policies
**And** no mobile admin interface at MVP — admin is web-only

### Story 8.4: Support Inquiry Management (Internal)

As an **administrator**,
I want to view and manage customer support inquiries,
So that I can respond to customer issues efficiently.

**Acceptance Criteria:**

**Given** support inquiries exist in the `support_inquiries` table
**When** an admin accesses the support management page
**Then** inquiries are listed with: date, name, email, subject, status (new/in-progress/resolved), associated order ID
**And** admin can update inquiry status and add internal notes
**And** status workflow: new → in-progress → resolved
**And** filtering by status and subject type
**And** web-only: admin support page at `app/routes/admin/support/index.tsx`
**And** clicking an inquiry shows full details with the customer's message and any linked order info
**And** admin can reply via email directly from the interface (triggers Edge Function to send email)

### Story 8.5: Platform Health Monitoring & Error Tracking

As a **system**,
I want automated monitoring of platform health and error rates,
So that issues are detected and addressed before they impact users.

**Acceptance Criteria:**

**Given** the platform is running in production
**When** errors occur or performance degrades
**Then** all errors are logged in the `error_logs` table (from Story 4.7) with: timestamp, source (web/mobile/edge-function), error_type, message, stack_trace, context
**And** webhook processing failures are tracked with retry counts
**And** Violet API errors (including 200-with-errors) are logged with full request/response context
**And** Supabase Edge Function logs are accessible via Supabase dashboard (NFR20)
**And** key health metrics are available in the admin dashboard: error rate (last 24h), webhook success rate, API latency (p50/p95)
**And** `supabase/functions/health-check/index.ts` Edge Function provides a `/health` endpoint checking: Supabase connectivity, Violet API reachability, Stripe API status
**And** NFR22: the system supports horizontal scaling via Supabase's managed infrastructure and Edge Functions
**And** NFR9: all sensitive data (API keys, tokens) are stored in environment variables, never in code
**And** admin email alerts are triggered for critical system events: webhook processing failures (>3 consecutive), Violet API unreachable (>5 min), unusual order patterns (e.g., >10 failed checkouts in 1 hour), and Edge Function error rate spikes (>5% in 15 min) (FR50); alerts are sent via the `send-notification` Edge Function to the admin email configured in environment variables

### Story 8.6: Legal & Compliance Pages (Web + Mobile)

As a **visitor**,
I want to access privacy policy, terms of service, and cookie policy pages,
So that I understand how my data is handled and my rights.

**Acceptance Criteria:**

**Given** legal requirements for an e-commerce platform
**When** a visitor navigates to legal pages
**Then** the following static pages are available: Privacy Policy, Terms of Service, Cookie Policy (FR51, FR53, FR54)
**And** pages are stored as content in Supabase `content_pages` table (type: "legal")
**And** web: legal pages at `app/routes/legal/[slug].tsx` (privacy, terms, cookies), SSR
**And** mobile: legal pages at `app/legal/[slug].tsx`
**And** footer (web) and profile/settings (mobile) link to all legal pages
**And** cookie consent banner on web (EU compliance) — simple accept/decline, no dark pattern (no pre-checked boxes, no "accept" button larger than "decline")
**And** privacy policy clearly states: data collected, data usage, third-party services (Supabase, Violet, Stripe), user rights (access, deletion), contact for data requests
**And** affiliate disclosure page/section clearly explains the business model (FR11)
