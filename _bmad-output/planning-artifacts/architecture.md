---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: "complete"
completedAt: "2026-03-05"
lastStep: 8
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/product-brief-E-commerce-2026-03-03.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "_bmad-output/planning-artifacts/research/technical-tanstack-expo-supabase-stack-research-2026-03-03.md"
  - "_bmad-output/planning-artifacts/research/domain-white-label-affiliate-suppliers-research-2026-03-03.md"
  - "docs/IMPLEMENTATION-ROADMAP-2026.md"
  - "docs/violet-io-integration-guide.md"
  - "docs/violet-io-action-plan.md"
  - "docs/VIOLET_QUICK_REFERENCE.md"
  - "docs/firmly-ai-exploration-guide.md"
  - "docs/supplier-comparison-strategy.md"
  - "docs/google-ucp-strategy-2026.md"
externalSources:
  - "Archon MCP: Violet.io official docs (180k words)"
  - "Archon MCP: TanStack docs (93k words)"
  - "Archon MCP: Supabase docs (514k words)"
  - "Archon MCP: Expo docs (752k words)"
workflowType: "architecture"
project_name: "E-commerce"
user_name: "Charles"
date: "2026-03-04"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

10 core MVP features spanning the full e-commerce lifecycle:

1. **AI Conversational Search** — Semantic product discovery via OpenAI embeddings + pgvector, combining natural language understanding with traditional filters (price, category, brand). Architectural implication: vector similarity search must coexist with SQL queries in PostgreSQL.

2. **Product Catalog** — Synced from Violet.io via API polling + webhook updates. Products are "Offers" (merchant-specific) containing "SKUs" (purchasable variants). Architectural implication: data normalization layer between Violet's model and internal schema.

3. **Unified Multi-Merchant Checkout** — Violet's Cart/Bag model where one Cart contains multiple Bags (one per merchant). Each Bag has independent lifecycle (IN_PROGRESS → SUBMITTED → ACCEPTED → COMPLETED → REFUNDED). Architectural implication: complex state machine management, partial order success/failure handling.

4. **Stripe Elements Payment** — Wallet-based checkout via Violet-provided `payment_intent_client_secret`. Frontend orchestrates PaymentElement → confirmPayment → 3D Secure handling → order submission. Architectural implication: payment flow lives in frontend with server-side secret management.

5. **Order Tracking** — Real-time order status via Violet webhooks. Multiple bag statuses within single order. Architectural implication: webhook ingestion pipeline with idempotency, real-time UI updates via Supabase Realtime.

6. **Customer Support Routing** — Per-merchant support routing since orders span multiple merchants. Architectural implication: support context must include bag-level merchant info.

7. **Web Platform (TanStack Start)** — SSR/streaming, file-based routing, SEO-optimized. Server Functions for secure API calls. Architectural implication: full-stack web framework with server-side rendering pipeline.

8. **Mobile App (Expo Router)** — Native iOS/Android with file-based routing, Stack/Tabs navigation, push notifications, EAS build/deploy. Architectural implication: separate navigation system, shared business logic via monorepo packages.

9. **Backend Infrastructure (Supabase)** — PostgreSQL + Auth + Edge Functions + Realtime + Storage. Architectural implication: serverless functions with 2s CPU / 10MB bundle limits constrain function complexity.

10. **Brand/Design System + Content/SEO** — Vanilla CSS with BEM naming, CSS custom properties as design tokens, editorial content for organic acquisition. Architectural implication: design token system must work across web (CSS) and mobile (StyleSheet).

**Non-Functional Requirements:**

| Category        | Requirement                                     | Architectural Impact                           |
| --------------- | ----------------------------------------------- | ---------------------------------------------- |
| Performance     | Web: First paint < 1.5s, TTI < 3s               | SSR/streaming mandatory, code splitting        |
| Performance     | Mobile: App launch < 2s, smooth 60fps           | Lazy loading, optimized renders                |
| Security        | User data protection, PCI compliance via Stripe | No card data touches our servers               |
| Security        | Webhook HMAC validation                         | Edge Function signature verification           |
| Security        | Row-Level Security (RLS)                        | All Supabase tables require RLS policies       |
| Scalability     | Edge Functions: 2s CPU, 10MB bundle             | Decompose complex operations                   |
| Reliability     | Webhook idempotency                             | X-Violet-Event-Id deduplication                |
| Accessibility   | WCAG 2.1 AA                                     | Semantic HTML, ARIA, keyboard nav              |
| SEO             | Server-rendered product pages                   | TanStack Start SSR, meta tags, structured data |
| Maintainability | TypeScript end-to-end                           | Shared types in monorepo packages              |

**Scale & Complexity:**

- Primary domain: Full-stack dual-platform e-commerce (web SSR + mobile native + serverless backend + external commerce API)
- Complexity level: Medium-High
- Estimated architectural components: 12-15 (auth, catalog, cart, checkout, payment, orders, webhooks, search, notifications, design system, web app, mobile app, shared packages, edge functions, supplier adapters)

### Technical Constraints & Dependencies

1. **Violet.io API dependency** — All product, cart, and order data flows through Violet. API availability directly impacts system availability. JWT tokens expire every 24h with refresh mechanism required.

2. **Supabase Edge Function limits** — 2s CPU timeout, 10MB bundle size. Complex operations must be decomposed or moved to client-side processing where appropriate.

3. **TanStack Start RC status** — Framework is Release Candidate (not stable). API surface may change. Risk: breaking changes during development.

4. **Separate routing systems** — TanStack Router (web) and Expo Router (mobile) are fundamentally different. No shared routing code possible. Navigation logic must be platform-specific.

5. **Stripe Elements client-side requirement** — Payment UI must render client-side (Stripe.js). Cannot be server-rendered. Impacts SSR strategy for checkout pages.

6. **Monorepo tooling** — Bun workspaces for package sharing. Build pipeline must handle multiple targets (web bundle, native bundle, Edge Functions).

7. **Vanilla CSS constraint** — No CSS framework (Tailwind, styled-components). Design tokens via CSS custom properties on web, must be translated to React Native StyleSheet for mobile.

### Cross-Cutting Concerns Identified

1. **Dual Authentication Layer** — Supabase Auth (user sessions, JWT, RLS) + Violet Auth (commerce API tokens, refresh). Server must manage Violet token lifecycle transparently. Both must coordinate for authorized commerce operations.

2. **Supplier Abstraction (Adapter Pattern)** — Core architectural decision. `SupplierAdapter` interface must abstract: product sync, cart management, checkout flow, order tracking, webhook handling. Must support Violet now, firmly.ai and Google UCP later without frontend changes.

3. **Cross-Platform State Management** — TanStack Query as shared async state manager for both web and mobile. Query keys, cache policies, and optimistic updates must be consistent. Platform-specific mutations for navigation after state changes.

4. **Error Handling & Resilience** — Violet API errors (rate limits, auth failures, merchant-specific errors) must map to user-friendly messages. Bag-level failures in multi-merchant orders require partial success UX.

5. **Type Safety Pipeline** — TypeScript types must flow from Violet API responses → Supabase schema → shared packages → platform-specific UI. Zod or similar for runtime validation at API boundaries.

6. **Design Token Distribution** — CSS custom properties (web) ↔ React Native StyleSheet values (mobile). Single source of truth for colors, typography, spacing across platforms.

7. **Webhook Event Processing** — Idempotent processing pipeline: receive → validate HMAC → deduplicate (X-Violet-Event-Id) → process → update Supabase → notify clients via Realtime. Must handle out-of-order delivery.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack dual-platform e-commerce: Web SSR (TanStack Start) + Mobile native (Expo Router) + Serverless backend (Supabase), organized as a Bun workspaces monorepo.

### Starter Options Considered

| Option | Starter                                                             | Verdict      | Reason                                                                                   |
| ------ | ------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| 1      | [g3r4n/tanstack-starter](https://github.com/g3r4n/tanstack-starter) | Rejected     | Uses Tailwind, tRPC, Drizzle, AuthJS — all diverge from our stack. Outdated Expo SDK 51. |
| 2      | Official CLIs + Custom Bun monorepo                                 | **Selected** | Full control, latest versions, zero unwanted dependencies, Bun-native performance.       |
| 3      | [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo)        | Rejected     | Next.js-based, wrong web framework entirely.                                             |

### Selected Starter: Official CLIs + Custom Bun Monorepo

**Rationale for Selection:**

No existing starter matches our specific combination: TanStack Start (Vanilla CSS, no tRPC) + Expo Router v7 (no NativeWind) + Supabase (native client, not Drizzle) + Violet.io Adapter Pattern. The custom Bun monorepo approach gives us:

1. Latest framework versions without upgrade debt
2. No unwanted dependencies to remove
3. Clean Adapter Pattern foundation from day one
4. Vanilla CSS design system without framework conflicts
5. Bun-native performance: faster installs (up to 25x vs npm), native workspaces resolution, hardlinks instead of copies

**Initialization Commands:**

```bash
# 1. Create monorepo root
mkdir e-commerce && cd e-commerce
bun init

# 2. Configure Bun workspaces in package.json
# Add: "workspaces": ["apps/*", "packages/*"]
# Add: "private": true

# 3. Create web app (TanStack Start RC, Bun preset)
bunx @tanstack/cli create apps/web

# 4. Create mobile app (Expo SDK 55, Router v7)
bunx create-expo-app apps/mobile --template default@sdk-55

# 5. Create shared packages
mkdir -p packages/shared/src packages/ui/src packages/config

# 6. Install all workspace dependencies
bun install
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**

- TypeScript 5.x end-to-end (configured by both CLIs)
- Bun as package manager and script runner across the monorepo
- React 19.x (TanStack Start) / React 19.2 (Expo SDK 55) — aligned
- Bun runtime for web server (TanStack Start Bun preset), Hermes for mobile

**Styling Solution:**

- Vanilla CSS with BEM naming + CSS custom properties (web) — manual setup
- React Native StyleSheet (mobile) — default from Expo
- Shared design tokens in `packages/ui/` — manual setup

**Build Tooling:**

- Vite (TanStack Start) for web bundling, Bun preset for SSR production server
- Metro (Expo) for mobile bundling — auto-configured for Bun monorepo since SDK 52
- Bun workspaces for package resolution (native, zero-config)

**Testing Framework:**

- Bun test runner or Vitest (web) — aligned with Bun/Vite ecosystem
- Jest + React Native Testing Library (mobile) — Expo default
- Shared test utilities in `packages/shared/`

**Code Organization:**

```
e-commerce/
├── apps/
│   ├── web/                    # TanStack Start (SSR, Server Functions, Bun preset)
│   │   ├── app/
│   │   │   ├── routes/         # File-based routing (TanStack Router)
│   │   │   ├── components/     # Web-specific components
│   │   │   └── styles/         # Vanilla CSS (BEM)
│   │   ├── app.config.ts
│   │   └── package.json
│   └── mobile/                 # Expo Router v7 (React Native)
│       ├── src/app/            # File-based routing (Expo Router)
│       ├── src/components/     # Mobile-specific components
│       └── package.json
├── packages/
│   ├── shared/                 # Business logic, types, TanStack Query hooks
│   │   ├── src/
│   │   │   ├── types/          # Shared TypeScript types (Violet, Supabase, domain)
│   │   │   ├── hooks/          # TanStack Query hooks (platform-agnostic)
│   │   │   ├── adapters/       # SupplierAdapter interface + implementations
│   │   │   ├── utils/          # Shared utilities
│   │   │   └── validation/     # Zod schemas
│   │   └── package.json
│   ├── ui/                     # Design tokens, shared UI primitives
│   │   ├── src/
│   │   │   ├── tokens/         # Colors, typography, spacing values
│   │   │   └── primitives/     # Cross-platform UI primitives (if any)
│   │   └── package.json
│   └── config/                 # Shared configs (TypeScript, ESLint)
│       └── package.json
├── supabase/                   # Supabase local dev + Edge Functions
│   ├── functions/              # Edge Functions (Deno)
│   ├── migrations/             # SQL migrations
│   └── config.toml
├── package.json                # Root: workspaces config, private: true
├── bun.lock                    # Bun lockfile
└── tsconfig.base.json
```

**Development Experience:**

- HMR via Vite (web) and Metro Fast Refresh (mobile)
- Bun for all script execution (`bun run dev`, `bun run build`, etc.)
- Supabase CLI for local development (`supabase start`)
- EAS CLI for mobile builds and OTA updates
- TypeScript strict mode across all packages

**Current Verified Versions (March 2026):**

| Technology      | Version        | Status                                              |
| --------------- | -------------- | --------------------------------------------------- |
| Bun             | 1.x (latest)   | Stable                                              |
| TanStack Start  | v1.154.0+ (RC) | Release Candidate, API stable, Bun preset supported |
| TanStack Router | v1.x           | Stable                                              |
| TanStack Query  | v5.x           | Stable                                              |
| Expo SDK        | 55             | Stable (released Feb 25, 2026)                      |
| Expo Router     | v7             | Stable (included in SDK 55)                         |
| React Native    | 0.83           | Stable                                              |
| React           | 19.2           | Stable                                              |
| Supabase        | latest         | Stable                                              |

**Note:** Project initialization using these commands should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

1. Product data strategy: cache-on-demand from Violet API (no full catalog sync)
2. Server-side code split: Server Functions (user-triggered) vs Edge Functions (external events)
3. Supplier abstraction via Adapter Pattern interface

**Important Decisions (Shape Architecture):**

4. Dual auth layer: Supabase Auth (users) + Violet JWT (commerce API)
5. SSR boundaries: product pages SSR (SEO), checkout CSR (Stripe)
6. Design token distribution: CSS custom properties (web) ↔ StyleSheet (mobile)

**Deferred Decisions (Post-MVP):**

- Error tracking service (Sentry or alternative) — revisit after launch
- Advanced caching strategies (Redis, CDN) — evaluate based on traffic
- Multi-provider support activation (firmly.ai, Google UCP) — Phase 2+

### Data Architecture

| Decision        | Choice                                   | Rationale                                                                                                                                                                       |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database        | Supabase PostgreSQL                      | Auth, RLS, Realtime, Edge Functions — all-in-one backend                                                                                                                        |
| Product storage | Cache-on-demand from Violet API          | Violet is source of truth for catalog and real-time stock. No full sync needed. TanStack Query caches responses client-side (staleTime: 2-5 min for catalog, 0 for cart/stock). |
| AI search data  | Embeddings stored in Supabase (pgvector) | Product text descriptions + embeddings stored locally for semantic search. Prices/stock fetched live from Violet at query time.                                                 |
| Data validation | Zod schemas at API boundaries            | Runtime validation of Violet API responses and user input. TypeScript types alone don't protect at runtime.                                                                     |
| Migrations      | Supabase CLI (supabase db diff)          | SQL migrations versioned in git, applied via CLI.                                                                                                                               |
| Caching         | TanStack Query (client-side)             | staleTime per domain: catalog 5 min, search 2 min, cart/stock 0 (always fresh), profile 5 min. No server-side cache layer for MVP.                                              |

### Authentication & Security

| Decision           | Choice                         | Rationale                                                                                                                |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| User auth          | Supabase Auth (email + social) | Built-in JWT, RLS integration, anonymous sessions for guest cart.                                                        |
| Anonymous sessions | Supabase anonymous auth        | Allows cart creation without signup. Convert to full account at checkout.                                                |
| Commerce API auth  | Violet JWT (server-side only)  | 24h tokens with auto-refresh 5 min before expiry. Never exposed to client. Managed by Server Functions / Edge Functions. |
| Authorization      | Supabase RLS policies          | Products: public read. Cart/orders: `auth.uid() = user_id`. Admin data: service role key only (Edge Functions).          |
| Webhook security   | HMAC signature validation      | Violet signs webhooks. Edge Functions verify HMAC before processing.                                                     |
| CORS               | Restrictive                    | Only app web domains allowed.                                                                                            |
| Secrets management | Environment variables          | Violet API keys, Supabase service role key — never in client bundles. Server Functions and Edge Functions only.          |

### API & Communication Patterns

| Decision                  | Choice                               | Rationale                                                                                                                                                            |
| ------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User-triggered operations | TanStack Server Functions            | Cart CRUD, checkout, product detail fetch, search queries. Collocated with web code, full TypeScript e2e type safety.                                                |
| External event handling   | Supabase Edge Functions              | Webhook reception (Violet order/merchant/offer events), product embedding generation, scheduled tasks. Independent runtime (Deno).                                   |
| Real-time updates         | Supabase Realtime (Postgres Changes) | Order status updates pushed to clients after webhook processing updates DB rows.                                                                                     |
| Error handling            | Structured error responses           | Violet API errors mapped to user-friendly messages. Bag-level failures in multi-merchant orders shown as partial success. Standard error shape across all endpoints. |
| API documentation         | TypeScript types as documentation    | Zod schemas + TypeScript interfaces in `packages/shared/` serve as living API docs. No separate OpenAPI spec for MVP.                                                |
| Webhook idempotency       | X-Violet-Event-Id deduplication      | Store processed event IDs in Supabase table. Skip duplicates. Handle out-of-order delivery gracefully.                                                               |

### Frontend Architecture

| Decision          | Choice                                            | Rationale                                                                                              |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| State management  | TanStack Query (shared hooks in packages/shared/) | Platform-agnostic async state. Query keys, cache policies consistent across web and mobile.            |
| Component sharing | Business logic shared, UI separate                | Hooks and types in `packages/shared/`. Visual components platform-specific (HTML/CSS vs React Native). |
| SSR strategy      | Product/catalog pages: SSR. Checkout: CSR.        | SEO requires server-rendered product pages. Stripe Elements requires client-side rendering.            |
| Styling (web)     | Vanilla CSS, BEM naming, CSS custom properties    | Per UX spec. No framework. Design tokens as custom properties.                                         |
| Styling (mobile)  | React Native StyleSheet                           | Default Expo approach. Design tokens imported from `packages/ui/`.                                     |
| Images            | Violet CDN URLs direct                            | Lazy loading (web: `loading="lazy"`, mobile: Expo `<Image>`). No image proxy for MVP.                  |
| Routing           | Separate per platform                             | TanStack Router (web, file-based). Expo Router v7 (mobile, file-based). No shared routing code.        |

### Infrastructure & Deployment

| Decision            | Choice                                         | Rationale                                                                                                                            |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Web hosting         | Cloudflare Workers (TanStack Start Bun preset) | Edge deployment, global CDN, compatible with Bun SSR preset.                                                                         |
| Mobile build/deploy | EAS Build + EAS Submit + EAS Update            | Expo's official pipeline. OTA updates for JS changes without App Store review.                                                       |
| Backend hosting     | Supabase Cloud                                 | Free tier for MVP → Pro ($25/mo) for production. Managed PostgreSQL + Auth + Edge Functions + Realtime.                              |
| Package manager     | Bun                                            | Native workspace resolution, fast installs, script runner.                                                                           |
| CI/CD               | GitHub Actions                                 | Three pipelines: web (build → deploy Cloudflare), mobile (EAS build), Edge Functions (supabase functions deploy).                    |
| Environments        | local / staging / production                   | Local: Supabase local + Violet sandbox. Staging: Supabase staging project + Violet sandbox. Production: Supabase prod + Violet live. |
| Monitoring          | Supabase dashboard + Cloudflare analytics      | Built-in monitoring from both platforms. No third-party error tracking for MVP.                                                      |

### Decision Impact Analysis

**Implementation Sequence:**

1. Bun monorepo setup + packages/shared types
2. Supabase project + schema + RLS policies
3. SupplierAdapter interface + VioletAdapter (Server Functions)
4. Edge Functions: webhook handler + embedding generation
5. Web app: product pages (SSR) + search (AI)
6. Web app: cart + checkout (CSR, Stripe Elements)
7. Mobile app: product browsing + cart + checkout
8. CI/CD pipelines + staging environment
9. Production deployment

**Cross-Component Dependencies:**

- Adapter Pattern (packages/shared) → blocks all commerce features
- Supabase schema + RLS → blocks auth flows and data access
- Violet webhook Edge Function → blocks real-time order tracking
- TanStack Query hooks (packages/shared) → used by both web and mobile apps
- Design tokens (packages/ui) → used by both web CSS and mobile StyleSheet

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 5 categories where AI agents could make incompatible choices if not specified.

### Naming Patterns

**Database Naming Conventions:**

| Element      | Convention                   | Example                                          |
| ------------ | ---------------------------- | ------------------------------------------------ |
| Tables       | snake_case, plural           | `orders`, `webhook_events`, `product_embeddings` |
| Columns      | snake_case                   | `user_id`, `created_at`, `order_status`          |
| Foreign keys | referenced_table_singular_id | `user_id`, `order_id`                            |
| Indexes      | idx_table_column             | `idx_orders_user_id`                             |
| Enums        | snake_case                   | `order_status`, `bag_lifecycle`                  |

**API Naming Conventions:**

| Element               | Convention               | Example                                                       |
| --------------------- | ------------------------ | ------------------------------------------------------------- |
| Route paths           | kebab-case, plural nouns | `/products`, `/cart-items`, `/order-history`                  |
| Route params          | camelCase                | `/products/:productId`                                        |
| Query params          | camelCase                | `?sortBy=price&pageSize=20`                                   |
| Server Function names | camelCase, verb+Noun     | `getProduct`, `addToCart`, `submitCheckout`                   |
| Edge Function names   | kebab-case folders       | `search-products/`, `handle-webhook/`, `generate-embeddings/` |

**Code Naming Conventions:**

| Element                     | Convention                 | Example                                                  |
| --------------------------- | -------------------------- | -------------------------------------------------------- |
| Files (components)          | PascalCase.tsx             | `ProductCard.tsx`, `CheckoutForm.tsx`                    |
| Files (utilities)           | camelCase.ts               | `formatPrice.ts`, `violetAuth.ts`                        |
| Files (hooks)               | use + PascalCase.ts        | `useProduct.ts`, `useCart.ts`, `useSearch.ts`            |
| Files (types)               | camelCase.types.ts         | `product.types.ts`, `cart.types.ts`, `search.types.ts`   |
| Files (schemas)             | camelCase.schema.ts        | `product.schema.ts`, `cart.schema.ts`                    |
| Files (CSS)                 | component-name.css         | `product-card.css`, `checkout-form.css`                  |
| React components            | PascalCase                 | `ProductCard`, `SearchBar`, `SearchResults`              |
| Functions                   | camelCase                  | `formatPrice()`, `validateCart()`                        |
| Variables                   | camelCase                  | `productList`, `cartTotal`, `searchQuery`                |
| Constants                   | UPPER_SNAKE_CASE           | `MAX_CART_ITEMS`, `VIOLET_API_BASE`                      |
| TypeScript types/interfaces | PascalCase                 | `Product`, `CartItem`, `SearchResult`, `VioletOffer`     |
| Zod schemas                 | camelCase + Schema         | `productSchema`, `searchFiltersSchema`                   |
| CSS classes (BEM)           | block\_\_element--modifier | `product-card__price--sale`, `search-bar__input--active` |
| CSS custom properties       | --category-name            | `--color-primary`, `--font-heading`                      |

### Structure Patterns

**Project Organization:**

| Concern        | Rule                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Tests          | Co-located: `ProductCard.test.tsx` next to `ProductCard.tsx`                                                  |
| Components     | Organized by feature, not by type. Example: `features/cart/` contains CartView, CartItem, useCart, cart.types |
| Shared hooks   | `packages/shared/src/hooks/` — platform-agnostic TanStack Query hooks (useProduct, useCart, useSearch, etc.)  |
| Adapters       | `packages/shared/src/adapters/` — SupplierAdapter interface + implementations                                 |
| Types          | `packages/shared/src/types/` — shared TypeScript types and Zod schemas                                        |
| Design tokens  | `packages/ui/src/tokens/` — colors, typography, spacing values                                                |
| Edge Functions | `supabase/functions/` — one folder per function (Deno convention)                                             |
| Migrations     | `supabase/migrations/` — timestamped SQL files                                                                |
| Config         | Root level: `tsconfig.base.json`, `.eslintrc.js`, `biome.json` or equivalent                                  |
| Env files      | `.env.local` (gitignored), `.env.example` (committed with placeholder values)                                 |

**Feature Folder Structure (web example):**

```
app/routes/products/
├── index.tsx              # Route component (product listing page)
├── $productId.tsx         # Dynamic route (product detail page)
├── components/
│   ├── ProductCard.tsx
│   ├── ProductCard.css
│   ├── ProductCard.test.tsx
│   ├── ProductGrid.tsx
│   └── ProductFilters.tsx
└── utils/
    └── productHelpers.ts
```

### Format Patterns

**API Response Format:**

All Server Functions and Edge Functions return a consistent shape:

```typescript
// Success
{ data: T, error: null }

// Error
{ data: null, error: { code: string, message: string } }
```

Error codes follow the pattern: `DOMAIN.ACTION_FAILURE`
Examples: `CART.ADD_FAILED`, `AUTH.TOKEN_EXPIRED`, `VIOLET.API_ERROR`, `SEARCH.QUERY_FAILED`

**Data Exchange Formats:**

| Concern                  | Convention                                                                      |
| ------------------------ | ------------------------------------------------------------------------------- |
| JSON fields (internal)   | camelCase                                                                       |
| JSON fields (Violet API) | snake_case (as received, transformed at adapter boundary)                       |
| Dates in JSON            | ISO 8601 strings (`2026-03-05T14:30:00Z`)                                       |
| Money amounts            | Integer cents (following Violet convention) + currency code                     |
| Null handling            | Explicit `null` for missing optional fields, never `undefined` in API responses |
| Booleans                 | `true`/`false`, never `1`/`0`                                                   |
| IDs                      | String type (Violet uses numeric IDs but stored/passed as strings for safety)   |

**Money Display Pattern:**

```typescript
// Violet sends amounts in cents
// Always transform at the adapter boundary
function formatPrice(cents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
```

### Communication Patterns

**Server-Side Code Split:**

| Responsibility            | Technology                       | When to use                                                                                           |
| ------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TanStack Server Functions | Web-only user actions            | Cart CRUD, checkout, product detail — only called from web app                                        |
| Supabase Edge Functions   | Cross-platform + external events | AI search (used by web AND mobile), webhooks, embedding generation, any operation both platforms need |

Rule: If both web and mobile need it → Edge Function. If only web needs it → Server Function.

**TanStack Query Key Convention:**

```
// Pattern: [domain, action, ...params]
['products', 'list', { category, page }]
['products', 'detail', productId]
['cart', 'current']
['orders', 'list', { status }]
['orders', 'detail', orderId]
['search', 'results', { query, filters }]
```

**Supabase Realtime Channel Convention:**

```typescript
// Pattern: entity:scope
"orders:user_{userId}"; // User's order updates
"products:updates"; // Product catalog changes
```

**Webhook Event Processing:**

```typescript
// Edge Function handler pattern
// 1. Validate HMAC signature
// 2. Check idempotency (X-Violet-Event-Id)
// 3. Parse and validate payload (Zod)
// 4. Process business logic
// 5. Update Supabase
// 6. Return 200 (or 500 on failure)
```

### Process Patterns

**Error Handling:**

| Layer              | Pattern                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| Server Functions   | Try/catch → return `{ data: null, error: { code, message } }`               |
| Edge Functions     | Try/catch → return `{ data: null, error: { code, message } }` (same format) |
| TanStack Query     | `onError` callback → show toast notification                                |
| Violet API errors  | Map to domain error codes at adapter boundary                               |
| User-facing errors | Friendly message in user's language, no technical details                   |
| Dev logging        | `console.error` with context object (never in production client)            |

**Loading State Pattern:**

```typescript
// TanStack Query provides loading states automatically
const { data, isLoading, isError, error } = useProduct(productId);

// Components handle 3 states: loading, error, success
if (isLoading) return <Skeleton />;
if (isError) return <ErrorMessage error={error} />;
return <ProductDetail product={data} />;
```

**Adapter Pattern Contract:**

```typescript
// Every adapter implementation MUST follow this interface
interface SupplierAdapter {
  // Catalog
  getProducts(params: ProductQuery): Promise<PaginatedResult<Product>>;
  getProduct(id: string): Promise<Product>;

  // Search (AI)
  searchProducts(query: string, filters?: SearchFilters): Promise<SearchResult>;

  // Cart
  createCart(userId: string): Promise<Cart>;
  addToCart(cartId: string, item: CartItemInput): Promise<Cart>;
  removeFromCart(cartId: string, itemId: string): Promise<Cart>;

  // Checkout
  getPaymentIntent(cartId: string): Promise<PaymentIntent>;
  submitOrder(cartId: string): Promise<Order>;

  // Orders
  getOrder(orderId: string): Promise<Order>;
  getOrders(userId: string): Promise<Order[]>;

  // Webhooks
  validateWebhook(headers: Headers, body: string): boolean;
  processWebhook(event: WebhookEvent): Promise<void>;
}
```

### Enforcement Guidelines

**All AI Agents MUST:**

1. Follow naming conventions exactly as specified above — no variations
2. Use the `{ data, error }` response format for all Server Functions AND Edge Functions
3. Transform Violet snake_case → camelCase at the adapter boundary, never in UI code
4. Co-locate test files with source files
5. Use TanStack Query key convention `[domain, action, ...params]`
6. Handle all 3 UI states (loading, error, success) in every data-fetching component
7. Put shared business logic in `packages/shared/`, never duplicate across apps
8. Use Zod schemas for all external data validation (Violet responses, user input)
9. Store money as integer cents, display via `formatPrice()` utility
10. Never expose Violet API tokens or Supabase service role key to client code
11. If both platforms need an operation → Edge Function. If web-only → Server Function.

**Anti-Patterns (NEVER do this):**

```typescript
// ❌ Wrong: inconsistent naming
const UserData = fetchUsers();  // PascalCase variable
const user_list = [];           // snake_case variable

// ✅ Correct
const userData = fetchUsers();  // camelCase variable
const userList = [];            // camelCase variable

// ❌ Wrong: Violet data leaking into UI
return <span>{product.retail_price}</span>;  // snake_case from Violet

// ✅ Correct: transformed at adapter boundary
return <span>{product.retailPrice}</span>;   // camelCase in UI

// ❌ Wrong: raw cents in UI
return <span>${product.price / 100}</span>;  // Manual division

// ✅ Correct: utility function
return <span>{formatPrice(product.price)}</span>;  // Consistent formatting

// ❌ Wrong: duplicated hook in web and mobile
// apps/web/hooks/useProduct.ts
// apps/mobile/hooks/useProduct.ts

// ✅ Correct: shared hook
// packages/shared/src/hooks/useProduct.ts

// ❌ Wrong: search in Server Function (mobile can't access it)
// apps/web/app/server/searchProducts.ts

// ✅ Correct: search in Edge Function (both platforms access it)
// supabase/functions/search-products/index.ts
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
e-commerce/
├── .github/
│   └── workflows/
│       ├── web-deploy.yml              # Build + deploy TanStack Start → Cloudflare Workers
│       ├── mobile-build.yml            # EAS Build for iOS/Android
│       └── edge-functions-deploy.yml   # supabase functions deploy
├── .env.example                        # Placeholder values (committed)
├── .env.local                          # Real secrets (gitignored)
├── .gitignore
├── bun.lock
├── package.json                        # Root: workspaces, private: true, scripts
├── tsconfig.base.json                  # Shared TypeScript config (strict mode)
│
├── apps/
│   ├── web/                            # TanStack Start (SSR, Bun preset)
│   │   ├── app/
│   │   │   ├── routes/
│   │   │   │   ├── __root.tsx          # Root layout (header, footer, providers)
│   │   │   │   ├── index.tsx           # Homepage (hero, featured products)
│   │   │   │   ├── products/
│   │   │   │   │   ├── index.tsx       # Product listing (SSR, filters)
│   │   │   │   │   └── $productId.tsx  # Product detail page (SSR)
│   │   │   │   ├── search/
│   │   │   │   │   └── index.tsx       # AI search results page
│   │   │   │   ├── cart/
│   │   │   │   │   └── index.tsx       # Cart view (CSR)
│   │   │   │   ├── checkout/
│   │   │   │   │   └── index.tsx       # Checkout + Stripe Elements (CSR)
│   │   │   │   ├── orders/
│   │   │   │   │   ├── index.tsx       # Order history
│   │   │   │   │   └── $orderId.tsx    # Order detail + tracking
│   │   │   │   ├── auth/
│   │   │   │   │   ├── login.tsx       # Login page
│   │   │   │   │   └── signup.tsx      # Signup page
│   │   │   │   └── content/
│   │   │   │       └── $slug.tsx       # SEO editorial pages
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── Header.tsx
│   │   │   │   │   ├── Header.css
│   │   │   │   │   ├── Footer.tsx
│   │   │   │   │   ├── Footer.css
│   │   │   │   │   └── Navigation.tsx
│   │   │   │   ├── product/
│   │   │   │   │   ├── ProductCard.tsx
│   │   │   │   │   ├── ProductCard.css
│   │   │   │   │   ├── ProductGrid.tsx
│   │   │   │   │   ├── ProductGrid.css
│   │   │   │   │   ├── ProductDetail.tsx
│   │   │   │   │   └── ProductFilters.tsx
│   │   │   │   ├── search/
│   │   │   │   │   ├── SearchBar.tsx
│   │   │   │   │   ├── SearchBar.css
│   │   │   │   │   ├── SearchResults.tsx
│   │   │   │   │   └── SearchSuggestions.tsx
│   │   │   │   ├── cart/
│   │   │   │   │   ├── CartItem.tsx
│   │   │   │   │   ├── CartSummary.tsx
│   │   │   │   │   └── CartEmpty.tsx
│   │   │   │   ├── checkout/
│   │   │   │   │   ├── CheckoutForm.tsx
│   │   │   │   │   ├── StripePayment.tsx
│   │   │   │   │   ├── OrderConfirmation.tsx
│   │   │   │   │   └── BagSummary.tsx
│   │   │   │   ├── order/
│   │   │   │   │   ├── OrderCard.tsx
│   │   │   │   │   ├── OrderTimeline.tsx
│   │   │   │   │   └── BagStatus.tsx
│   │   │   │   └── ui/
│   │   │   │       ├── Skeleton.tsx
│   │   │   │       ├── ErrorMessage.tsx
│   │   │   │       ├── Toast.tsx
│   │   │   │       └── Button.tsx
│   │   │   ├── styles/
│   │   │   │   ├── global.css          # CSS reset, custom properties, base styles
│   │   │   │   ├── tokens.css          # Design tokens (colors, typography, spacing)
│   │   │   │   └── utilities.css       # Utility classes (spacing, layout helpers)
│   │   │   └── server/
│   │   │       ├── getProduct.ts       # Server Function: fetch product from Violet
│   │   │       ├── getProducts.ts      # Server Function: fetch product list
│   │   │       ├── cartActions.ts      # Server Function: cart CRUD via Violet
│   │   │       ├── checkout.ts         # Server Function: checkout + payment intent
│   │   │       └── violetAuth.ts       # Violet JWT token management (server-only)
│   │   ├── app.config.ts               # TanStack Start config (Bun preset)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── mobile/                         # Expo Router v7 (React Native)
│       ├── src/
│       │   ├── app/
│       │   │   ├── _layout.tsx         # Root layout (Tab navigator)
│       │   │   ├── (tabs)/
│       │   │   │   ├── _layout.tsx     # Tab bar config
│       │   │   │   ├── index.tsx       # Home tab (featured products)
│       │   │   │   ├── search.tsx      # AI search tab
│       │   │   │   ├── cart.tsx        # Cart tab
│       │   │   │   └── profile.tsx     # Profile / orders tab
│       │   │   ├── products/
│       │   │   │   └── [productId].tsx # Product detail (Stack push)
│       │   │   ├── checkout/
│       │   │   │   └── index.tsx       # Checkout + Stripe (Stack push)
│       │   │   ├── orders/
│       │   │   │   ├── index.tsx       # Order history
│       │   │   │   └── [orderId].tsx   # Order detail
│       │   │   └── auth/
│       │   │       ├── login.tsx       # Login screen
│       │   │       └── signup.tsx      # Signup screen
│       │   └── components/
│       │       ├── product/
│       │       │   ├── ProductCard.tsx
│       │       │   ├── ProductList.tsx
│       │       │   └── ProductDetail.tsx
│       │       ├── search/
│       │       │   ├── SearchInput.tsx
│       │       │   └── SearchResults.tsx
│       │       ├── cart/
│       │       │   ├── CartItem.tsx
│       │       │   └── CartSummary.tsx
│       │       ├── checkout/
│       │       │   ├── CheckoutForm.tsx
│       │       │   └── StripePayment.tsx
│       │       ├── order/
│       │       │   ├── OrderCard.tsx
│       │       │   └── OrderTimeline.tsx
│       │       └── ui/
│       │           ├── Skeleton.tsx
│       │           ├── ErrorMessage.tsx
│       │           └── Toast.tsx
│       ├── app.json                    # Expo config
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── shared/                         # Business logic shared across web + mobile
│   │   ├── src/
│   │   │   ├── index.ts                # Package entry point (re-exports)
│   │   │   ├── types/
│   │   │   │   ├── product.types.ts    # Product, Offer, SKU types
│   │   │   │   ├── cart.types.ts       # Cart, Bag, CartItem types
│   │   │   │   ├── order.types.ts      # Order, BagStatus types
│   │   │   │   ├── search.types.ts     # SearchResult, SearchFilters types
│   │   │   │   ├── user.types.ts       # User, AuthState types
│   │   │   │   └── api.types.ts        # ApiResponse<T>, ApiError types
│   │   │   ├── schemas/
│   │   │   │   ├── product.schema.ts   # Zod: Violet product response validation
│   │   │   │   ├── cart.schema.ts      # Zod: cart/bag validation
│   │   │   │   ├── order.schema.ts     # Zod: order validation
│   │   │   │   └── search.schema.ts    # Zod: search input/result validation
│   │   │   ├── hooks/
│   │   │   │   ├── useProducts.ts      # TanStack Query: product list
│   │   │   │   ├── useProduct.ts       # TanStack Query: single product
│   │   │   │   ├── useSearch.ts        # TanStack Query: AI search (→ Edge Function)
│   │   │   │   ├── useCart.ts          # TanStack Query: cart operations
│   │   │   │   ├── useOrders.ts        # TanStack Query: order list
│   │   │   │   └── useOrder.ts         # TanStack Query: single order + realtime
│   │   │   ├── adapters/
│   │   │   │   ├── supplierAdapter.ts  # SupplierAdapter interface definition
│   │   │   │   ├── violetAdapter.ts    # Violet.io implementation
│   │   │   │   └── adapterFactory.ts   # Factory: returns correct adapter by config
│   │   │   └── utils/
│   │   │       ├── formatPrice.ts      # Money formatting (cents → display)
│   │   │       ├── dateUtils.ts        # Date formatting helpers
│   │   │       └── constants.ts        # Shared constants (API URLs, limits)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                             # Design tokens + cross-platform values
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── tokens/
│   │   │       ├── colors.ts           # Color values (used by CSS + StyleSheet)
│   │   │       ├── typography.ts       # Font families, sizes, weights
│   │   │       └── spacing.ts          # Spacing scale (4px base)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── config/                         # Shared dev configs
│       ├── tsconfig.base.json          # Base TypeScript config
│       ├── eslint.base.js              # Base ESLint config
│       └── package.json
│
└── supabase/                           # Supabase project
    ├── config.toml                     # Supabase local dev config
    ├── seed.sql                        # Dev seed data
    ├── migrations/
    │   ├── 00001_users_profiles.sql    # User profiles table + RLS
    │   ├── 00002_product_embeddings.sql # pgvector embeddings table
    │   ├── 00003_orders.sql            # Orders + webhook events tables
    │   └── 00004_cart_sessions.sql     # Anonymous cart sessions
    └── functions/
        ├── search-products/
        │   └── index.ts                # AI search: pgvector query + Violet enrichment
        ├── handle-webhook/
        │   └── index.ts                # Violet webhook: HMAC + idempotency + process
        └── generate-embeddings/
            └── index.ts                # Product text → OpenAI embeddings → pgvector
```

### Architectural Boundaries

**API Boundaries:**

```
┌─────────────┐     Server Functions      ┌──────────────┐
│   Web App   │ ◄──────────────────────►  │  Violet API  │
│ (TanStack)  │    (cart, checkout,        │  (Commerce)  │
└──────┬──────┘     product detail)        └──────────────┘
       │                                          ▲
       │  Supabase Client                         │
       ▼                                          │
┌──────────────┐    Edge Functions         ┌──────┴──────┐
│   Supabase   │ ◄────────────────────►    │   Violet    │
│  (Auth, DB,  │   (search, webhooks,      │  Webhooks   │
│   Realtime)  │    embeddings)            └─────────────┘
└──────┬──────┘
       ▲
       │  Supabase Client
       │
┌──────┴──────┐     Edge Functions
│ Mobile App  │ ◄──────────────────────►  (search-products)
│   (Expo)    │   (AI search, direct
└─────────────┘    Supabase access)
```

**Key boundary rules:**

- Web app → Violet API: always through Server Functions (never direct client calls)
- Mobile app → Violet API: through Edge Functions for shared operations (search), through Supabase client for data reads
- Both apps → Supabase: through Supabase client SDK (Auth, Realtime, DB reads)
- Violet → Our system: through webhooks → Edge Function `handle-webhook`
- Secrets (Violet tokens, service role key): never cross the server boundary to client

**Component Boundaries:**

| Boundary                                | Rule                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/shared/` → `apps/`            | Shared exports types, hooks, adapters. Apps import, never modify.                                   |
| `packages/ui/` → `apps/`                | Tokens exported as JS values. Web converts to CSS custom properties. Mobile uses in StyleSheet.     |
| `apps/web/server/` → `apps/web/routes/` | Server Functions called from route loaders/actions. Never imported in client components directly.   |
| `supabase/functions/` → everything      | Edge Functions are independent. Called via HTTP (from apps) or triggered by webhooks (from Violet). |
| Web components → Mobile components      | NO sharing. Each has its own visual components. Only hooks/types shared via packages.               |

**Data Boundaries:**

| Data                             | Source of Truth              | Access Pattern                                              |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Products (catalog, stock, price) | Violet API                   | Cache-on-demand via TanStack Query                          |
| Product embeddings (AI search)   | Supabase pgvector            | Written by `generate-embeddings`, read by `search-products` |
| User accounts                    | Supabase Auth                | Client SDK (both apps)                                      |
| User profiles                    | Supabase DB                  | RLS: `auth.uid() = user_id`                                 |
| Cart state                       | Violet API (Cart/Bag)        | Server Functions (web), Edge Functions (mobile)             |
| Orders                           | Violet API + Supabase mirror | Webhook updates → Supabase → Realtime to clients            |
| Webhook events                   | Supabase DB                  | `handle-webhook` writes, idempotency table                  |

### Requirements to Structure Mapping

**Feature Mapping:**

| Feature         | Web Routes                             | Mobile Screens                        | Shared Hooks                      | Edge Functions     | Server Functions                  |
| --------------- | -------------------------------------- | ------------------------------------- | --------------------------------- | ------------------ | --------------------------------- |
| AI Search       | `search/index.tsx`                     | `(tabs)/search.tsx`                   | `useSearch.ts`                    | `search-products/` | —                                 |
| Product Catalog | `products/index.tsx`, `$productId.tsx` | `(tabs)/index.tsx`, `[productId].tsx` | `useProducts.ts`, `useProduct.ts` | —                  | `getProducts.ts`, `getProduct.ts` |
| Cart            | `cart/index.tsx`                       | `(tabs)/cart.tsx`                     | `useCart.ts`                      | —                  | `cartActions.ts`                  |
| Checkout        | `checkout/index.tsx`                   | `checkout/index.tsx`                  | —                                 | —                  | `checkout.ts`                     |
| Order Tracking  | `orders/index.tsx`, `$orderId.tsx`     | `orders/index.tsx`, `[orderId].tsx`   | `useOrders.ts`, `useOrder.ts`     | `handle-webhook/`  | —                                 |
| Auth            | `auth/login.tsx`, `auth/signup.tsx`    | `auth/login.tsx`, `auth/signup.tsx`   | —                                 | —                  | —                                 |
| SEO Content     | `content/$slug.tsx`                    | —                                     | —                                 | —                  | —                                 |

**Cross-Cutting Concerns Mapping:**

| Concern           | Location                                                        |
| ----------------- | --------------------------------------------------------------- |
| Adapter Pattern   | `packages/shared/src/adapters/`                                 |
| Type definitions  | `packages/shared/src/types/`                                    |
| Zod validation    | `packages/shared/src/schemas/`                                  |
| Design tokens     | `packages/ui/src/tokens/`                                       |
| Violet auth (JWT) | `apps/web/app/server/violetAuth.ts`                             |
| Error handling    | `{ data, error }` pattern enforced in all Server/Edge Functions |
| Money formatting  | `packages/shared/src/utils/formatPrice.ts`                      |

### Integration Points

**Internal Communication:**

```
Web App ←→ Supabase: @supabase/supabase-js client (Auth, Realtime subscriptions)
Web App ←→ Server Functions: TanStack Start createServerFn() (type-safe RPC)
Mobile App ←→ Supabase: @supabase/supabase-js client (Auth, Realtime subscriptions)
Mobile App ←→ Edge Functions: fetch() to Supabase Edge Function URL
Both Apps ←→ Realtime: Supabase channels (order status updates)
```

**External Integrations:**

| Service         | Integration Point                           | Auth Method                    |
| --------------- | ------------------------------------------- | ------------------------------ |
| Violet.io API   | Server Functions + Edge Functions           | JWT (`X-Violet-Token` header)  |
| Violet Webhooks | `handle-webhook/` Edge Function             | HMAC signature validation      |
| Stripe          | Client-side Stripe.js (`@stripe/stripe-js`) | Publishable key (client)       |
| OpenAI          | `generate-embeddings/` Edge Function        | API key (env var, server-only) |

**Data Flow — Product Search:**

```
User types query → useSearch hook → Edge Function (search-products)
  → pgvector similarity search (Supabase)
  → get matching product IDs
  → fetch live prices/stock from Violet API
  → return enriched results
  → TanStack Query cache (staleTime: 2 min)
  → render SearchResults component
```

**Data Flow — Checkout:**

```
User clicks checkout → Server Function (checkout.ts)
  → Violet API: POST /checkout/cart/{id}/payment
  → returns payment_intent_client_secret
  → StripePayment component: PaymentElement renders
  → User confirms → Stripe confirmPayment()
  → 3D Secure if needed → handleNextAction()
  → Server Function: POST /checkout/cart/{id}/submit
  → Violet processes order → sends webhook
  → handle-webhook Edge Function → updates Supabase
  → Realtime pushes status → OrderConfirmation renders
```

### Development Workflow Integration

**Local Development:**

```bash
# Terminal 1: Supabase local
supabase start

# Terminal 2: Web app (TanStack Start dev server)
cd apps/web && bun run dev

# Terminal 3: Mobile app (Expo dev server)
cd apps/mobile && bun run start

# Terminal 4 (optional): Edge Function local testing
supabase functions serve
```

**Build Process:**

```bash
# Web: Vite build → Cloudflare Workers bundle
cd apps/web && bun run build

# Mobile: EAS Build (cloud)
cd apps/mobile && eas build --platform all

# Edge Functions: deployed via Supabase CLI
supabase functions deploy search-products
supabase functions deploy handle-webhook
supabase functions deploy generate-embeddings
```

**Environment Variables:**

```bash
# .env.example (committed)
VIOLET_APP_ID=your_app_id
VIOLET_APP_SECRET=your_app_secret
VIOLET_API_BASE=https://sandbox-api.violet.io/v1
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
OPENAI_API_KEY=sk-xxx
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices form a coherent stack without conflicts:

- Bun workspaces + TanStack Start (Bun preset) + Expo SDK 55 — compatible monorepo setup
- React 19.x aligned across both platforms (TanStack Start React 19, Expo SDK 55 React 19.2)
- TanStack Query v5 works identically in both web and mobile contexts
- Supabase client SDK compatible with both Bun (web SSR) and React Native runtimes
- Stripe.js (client-side) + Violet payment_intent_client_secret — no conflicts with SSR strategy
- Zod works in all runtimes (Bun, Deno Edge Functions, React Native Hermes)
- TypeScript 5.x strict mode across all packages — consistent type checking

**Pattern Consistency:**

- Naming conventions are internally consistent: snake_case (DB), camelCase (code/API), PascalCase (components), kebab-case (CSS/Edge Functions)
- The `{ data, error }` response format is specified for both Server Functions AND Edge Functions — no ambiguity
- TanStack Query key convention `[domain, action, ...params]` applied uniformly
- BEM naming for CSS classes consistent with vanilla CSS approach
- Adapter Pattern interface is complete with all required commerce operations

**Structure Alignment:**

- Feature-folder organization (web) and screen-based organization (mobile) both align with file-based routing paradigms
- `packages/shared/` as the single source for business logic prevents cross-platform drift
- `packages/ui/tokens/` as JS values (not CSS-only) enables both CSS custom properties (web) and StyleSheet (mobile) consumption
- Edge Functions in `supabase/functions/` follow Deno one-folder-per-function convention
- Server Functions in `apps/web/app/server/` properly scoped to web-only operations

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**

| PRD Requirement            | Architecture Support                                                                          | Status           |
| -------------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| Product Discovery & Search | AI search via pgvector + Edge Function `search-products`, useSearch hook                      | ✅ Covered       |
| Product Presentation       | SSR product pages (TanStack Start), cache-on-demand from Violet, useProduct/useProducts hooks | ✅ Covered       |
| Shopping Cart & Checkout   | Server Functions (cartActions, checkout), Violet Cart/Bag model, Stripe Elements CSR          | ✅ Covered       |
| Order Management           | Webhook Edge Function, Supabase Realtime, useOrders/useOrder hooks                            | ✅ Covered       |
| Customer Support           | Per-merchant routing via Bag-level merchant info (implicit in order types)                    | ✅ Covered       |
| User Accounts              | Supabase Auth (email + social), anonymous sessions for guest cart                             | ✅ Covered       |
| Content & SEO              | SSR via TanStack Start, `content/$slug.tsx` route, structured data                            | ✅ Covered       |
| Mobile Experience          | Expo Router v7, Tab navigator, Stack pushes, EAS Build/Update                                 | ✅ Covered       |
| Administration             | Supabase dashboard for MVP (deferred admin panel)                                             | ✅ Covered (MVP) |
| Compliance & Trust         | RLS policies, HMAC webhook validation, PCI via Stripe (no card data)                          | ✅ Covered       |

**Non-Functional Requirements Coverage:**

| NFR Category                             | Architecture Support                                                             | Status      |
| ---------------------------------------- | -------------------------------------------------------------------------------- | ----------- |
| Performance (Web: FP < 1.5s, TTI < 3s)   | TanStack Start SSR/streaming, Cloudflare Workers edge deployment, code splitting | ✅ Covered  |
| Performance (Mobile: launch < 2s, 60fps) | Expo optimized builds, lazy loading, TanStack Query cache                        | ✅ Covered  |
| Security (PCI compliance)                | Stripe Elements client-side, no card data on our servers                         | ✅ Covered  |
| Security (Webhook HMAC)                  | Edge Function signature verification specified                                   | ✅ Covered  |
| Security (RLS)                           | All Supabase tables require RLS policies, explicit rules per table type          | ✅ Covered  |
| Scalability (Edge Function limits)       | 2s CPU / 10MB bundle constraints documented, decomposition strategy              | ✅ Covered  |
| Reliability (Webhook idempotency)        | X-Violet-Event-Id deduplication in Supabase table                                | ✅ Covered  |
| Accessibility (WCAG 2.1 AA)              | Mentioned in NFRs, semantic HTML approach                                        | ⚠️ Implicit |
| SEO (Server-rendered products)           | SSR product pages via TanStack Start, content routes                             | ✅ Covered  |
| Maintainability (TypeScript e2e)         | Shared types in monorepo packages, Zod at boundaries                             | ✅ Covered  |

### Implementation Readiness Validation ✅

**Decision Completeness:**

- All critical decisions documented with specific technology versions (Expo SDK 55, TanStack Start RC v1.154.0+, React 19.2, etc.)
- Implementation patterns are comprehensive with concrete code examples (Adapter Pattern, error handling, query keys, money formatting)
- Consistency rules are explicit with 11 enforcement guidelines and anti-patterns section
- Real code examples provided for all major patterns (adapter interface, error responses, loading states, query keys)

**Structure Completeness:**

- Complete directory structure down to individual file level (~100+ files specified)
- Every feature mapped to specific routes (web), screens (mobile), hooks, Edge Functions, and Server Functions
- Integration points clearly specified with ASCII architecture diagram
- Component boundaries defined with 5 explicit boundary rules

**Pattern Completeness:**

- All 5 critical conflict points addressed (naming, structure, format, communication, process)
- Naming conventions cover database, API, code, and CSS layers comprehensively
- Communication patterns specify the Server Function vs Edge Function decision rule clearly
- Process patterns cover error handling, loading states, webhook processing, and adapter contracts

### Gap Analysis Results

**Critical Gaps:** None identified ✅

All blocking architectural decisions are documented. The Adapter Pattern interface, data architecture, auth layers, and deployment strategies are complete.

**Important Gaps (non-blocking, address during implementation):**

1. **Mobile → Violet API access pattern**: The architecture specifies mobile uses Edge Functions for search but doesn't fully specify how mobile handles cart/checkout operations. Currently the Adapter Pattern and Server Functions are web-scoped. **Recommendation:** During implementation, create Edge Function wrappers for cart/checkout that mobile can call, or extend the boundary diagram to show mobile → Edge Function → Violet for commerce operations.

2. **WCAG 2.1 AA implementation details**: Accessibility is listed as an NFR but no specific architectural patterns are defined (ARIA component patterns, focus management strategy, screen reader testing approach). **Recommendation:** Address in implementation stories as component-level requirements rather than architectural decisions.

3. **Push notifications (mobile)**: The PRD mentions push notifications for order updates. The architecture covers Supabase Realtime for in-app updates but doesn't specify the push notification service/integration. **Recommendation:** Add Expo Notifications + Supabase Edge Function trigger as a deferred decision or implementation detail.

**Nice-to-Have Gaps:**

1. **Logging/observability strategy**: No structured logging convention defined. Could help debugging in production.
2. **Rate limiting**: No client-side rate limiting or throttling pattern for search queries.
3. **Offline support (mobile)**: No offline-first strategy defined. TanStack Query's `gcTime` handles some cases but no explicit offline mode.
4. **i18n/l10n**: No internationalization architecture if the platform expands beyond English.

### Validation Issues Addressed

No critical issues found that would block implementation. The three important gaps identified above are implementation-level concerns that can be resolved in individual stories without changing the architecture.

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed (10 FRs, comprehensive NFRs)
- [x] Scale and complexity assessed (Medium-High, 12-15 components)
- [x] Technical constraints identified (7 constraints including Violet API, Edge Function limits, TanStack Start RC)
- [x] Cross-cutting concerns mapped (7 concerns: dual auth, adapter pattern, state management, error handling, type safety, design tokens, webhooks)

**✅ Architectural Decisions**

- [x] Critical decisions documented with versions (Bun, TanStack Start RC, Expo SDK 55, React 19.2, etc.)
- [x] Technology stack fully specified (language, runtime, frameworks, styling, testing, build)
- [x] Integration patterns defined (Server Functions vs Edge Functions rule, Supabase Realtime, Stripe Elements)
- [x] Performance considerations addressed (SSR/streaming, edge deployment, cache policies per domain)

**✅ Implementation Patterns**

- [x] Naming conventions established (database, API, code, CSS — all layers covered)
- [x] Structure patterns defined (feature folders, co-located tests, shared packages)
- [x] Communication patterns specified (Server Function vs Edge Function decision rule, query keys, realtime channels)
- [x] Process patterns documented (error handling, loading states, webhook processing, adapter contract)

**✅ Project Structure**

- [x] Complete directory structure defined (~100+ files, all apps + packages + supabase)
- [x] Component boundaries established (5 boundary rules + ASCII diagram)
- [x] Integration points mapped (internal + 4 external services)
- [x] Requirements to structure mapping complete (feature → routes/screens/hooks/functions table)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — based on comprehensive validation results. All critical decisions are documented, patterns are internally consistent, and the architecture covers all 10 functional requirements and key NFRs.

**Key Strengths:**

- Exceptionally clear server-side code split rule (web-only → Server Function, cross-platform → Edge Function)
- Complete Adapter Pattern interface enabling future supplier integration without frontend changes
- Comprehensive naming conventions eliminating potential AI agent inconsistencies
- Detailed directory structure down to individual file level
- Strong anti-patterns section with concrete wrong/right examples

**Areas for Future Enhancement:**

- Mobile commerce operations routing (cart/checkout via Edge Functions)
- Push notification integration (Expo Notifications)
- Accessibility component patterns (WCAG 2.1 AA specifics)
- Observability/logging strategy for production debugging
- Offline support strategy for mobile

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions

**First Implementation Priority:**
Run the initialization commands from the "Starter Template Evaluation" section to set up the Bun monorepo, then implement `packages/shared/src/types/` and `packages/shared/src/adapters/supplierAdapter.ts` as the foundation all other features depend on.
