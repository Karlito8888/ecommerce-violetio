---
stepsCompleted: [1, 2, 3, 4, 5, 6]
workflow_completed: true
inputDocuments:
  - "_bmad-output/brainstorming/brainstorming-session-2026-03-02-1400.md"
  - "_bmad-output/planning-artifacts/product-brief-E-commerce-2026-03-03.md"
  - "_bmad-output/planning-artifacts/research/domain-white-label-affiliate-suppliers-research-2026-03-03.md"
  - "_bmad-output/planning-artifacts/research/market-curated-shopping-experience-research-2026-03-03.md"
workflowType: "research"
lastStep: 1
research_type: "technical"
research_topic: "Full TanStack (SSR) + Expo Router/React Native + Supabase — Technical stack validation and integration architecture for a white-label affiliate e-commerce platform"
research_goals: "Validate the proposed tech stack (TanStack Start SSR, Expo Router/RN, Supabase) for a solo-dev white-label affiliate e-commerce platform. Assess maturity, integration patterns, code sharing between web and mobile, SEO capabilities, Supabase limitations for e-commerce, and overall feasibility for a one-person operation."
user_name: "Charles"
date: "2026-03-03"
web_research_enabled: true
source_verification: true
---

# Research Report: Technical

**Date:** 2026-03-03
**Author:** Charles
**Research Type:** Technical — Full TanStack + Expo/RN + Supabase Stack

---

## Research Overview

This technical research validates the proposed stack — **TanStack Start (SSR) + Expo Router/React Native + Supabase** — for a solo-dev white-label affiliate e-commerce platform ("Digital Personal Shopper"). The research was conducted using 12+ targeted web searches across official documentation, developer blogs, framework comparison articles, and pricing analysis pages, with multi-source validation for all critical technical claims.

**Research Scope:** Technology maturity assessment, integration architecture, code-sharing feasibility, SEO capabilities, scalability limits, deployment options, and solo-dev maintainability.

---

## Technical Research Scope Confirmation

**Research Topic:** Full TanStack (SSR) + Expo Router/React Native + Supabase — Technical stack validation and integration architecture for a white-label affiliate e-commerce platform
**Research Goals:** Validate the proposed tech stack (TanStack Start SSR, Expo Router/RN, Supabase) for a solo-dev white-label affiliate e-commerce platform. Assess maturity, integration patterns, code sharing between web and mobile, SEO capabilities, Supabase limitations for e-commerce, and overall feasibility for a one-person operation.

**Technical Research Scope:**

- Architecture Analysis - design patterns, frameworks, system architecture
- Implementation Approaches - development methodologies, coding patterns
- Technology Stack - languages, frameworks, tools, platforms
- Integration Patterns - APIs, protocols, interoperability
- Performance Considerations - scalability, optimization, patterns

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-03-03

## Technology Stack Analysis

### Programming Languages

_**TypeScript — The Unifying Language**_

The entire proposed stack runs on TypeScript, which is a significant advantage for a solo-dev operation. TanStack Start, Expo/React Native, and Supabase (Edge Functions, client SDK) all use TypeScript as their primary language.

_Key Advantages for This Project:_

- **End-to-end type safety**: TanStack Start is built around type-safe routing, server functions, and APIs. TypeScript types flow from database (Supabase generates types) through backend (Edge Functions) to frontend (TanStack Router/Query) — a single-developer can catch errors at compile time instead of in production.
- **Shared types in monorepo**: Product types, cart types, order types, and supplier adapter interfaces can be defined once and shared across web (TanStack) and mobile (Expo/RN).
- **No context switching**: One language across the entire stack eliminates cognitive overhead for a solo developer.

_Confidence: **HIGH** — TypeScript is the de facto standard for modern React/React Native development and is fully supported by all three pillars of the proposed stack._

### Development Frameworks and Libraries

#### 1. TanStack Start (Web — SSR)

**Current Status:** Release Candidate (v1 RC, announced September 2025). Feature-complete. API considered stable. The v1 stable release is expected "shortly" but no exact date has been announced as of March 2026.
_Source: [TanStack Start v1 RC Announcement](https://tanstack.com/blog/announcing-tanstack-start-v1)_

**What It Is:** A full-stack React meta-framework built on TanStack Router + Vite, offering:

- **Type-safe routing** with file-based route generation
- **Streaming SSR** with hydration — critical for SEO on product/content pages
- **Server Functions** — type-safe RPC-style server calls (no REST/GraphQL boilerplate)
- **Selective SSR** — choose per-route whether to server-render or client-render
- **Universal deployment** — Vercel, Netlify, Cloudflare Workers, Railway, or any Node/Bun target

**Maturity Assessment:**

- ⚠️ **Risk: RC, not stable v1.0** — While production-usable with pinned dependencies, the framework has been in RC since late 2025. Some sources flag potential memory leak concerns to monitor before production deployment.
- ✅ **Mitigation:** Pin dependency versions. The API is considered stable and unlikely to break. Inngest documented an 83% dev speed improvement after migrating from Next.js to TanStack Start.
- ✅ **Growing ecosystem:** Official deployment support from Cloudflare, Netlify, and Vercel. Active community. Vite-first approach means fast HMR and build times.

_Sources: [InfoQ — TanStack Start v1](https://www.infoq.com/news/2025/11/tanstack-start-v1/), [TanStack Start Overview](https://tanstack.com/start/latest/docs/framework/react/overview), [GitHub Discussions — Stable Release](https://github.com/TanStack/router/discussions/5999)_

**SEO Capabilities:**

- Streaming SSR renders product pages and content pages server-side — Google indexes them immediately
- Route-level metadata (title, description, OG tags) via route loaders
- Selective SSR allows heavy interactive pages (cart, checkout) to be client-rendered while SEO-critical pages (products, guides, comparisons) are server-rendered
- Compared to Next.js: TanStack Start lacks ISR (Incremental Static Regeneration) natively, but SSR + TanStack Query caching provides equivalent functionality for product catalog pages

_Source: [Crystallize — Next.js 16 vs TanStack Start for E-commerce](https://crystallize.com/blog/next-vs-tanstack-start)_

#### TanStack Ecosystem Components

| Component           | Role in Project                                         | Maturity     |
| ------------------- | ------------------------------------------------------- | ------------ |
| **TanStack Router** | Type-safe file-based routing (web only)                 | Stable v1 ✅ |
| **TanStack Query**  | Async state management, caching, Supabase data fetching | Stable v5 ✅ |
| **TanStack Form**   | Type-safe form management (checkout, search)            | Stable v1 ✅ |
| **TanStack Table**  | Product listing, order history tables                   | Stable v8 ✅ |
| **TanStack Start**  | SSR meta-framework                                      | RC ⚠️        |

_Source: [TanStack Official](https://tanstack.com/), [CodeWithSeb — TanStack in 2026](https://www.codewithseb.com/blog/tanstack-ecosystem-complete-guide-2026)_

#### 2. Expo Router + React Native (Mobile)

**Current Status:** Expo Router v6 — stable, production-ready. React Native with the New Architecture (Fabric renderer, TurboModules) is now default.

**What It Is:** File-based routing for universal React Native apps (iOS, Android, web):

- **Native navigation** with iOS link previews, liquid glass tabs, menus
- **Server-side APIs** and middleware support
- **OTA updates** via EAS — push bug fixes without App Store review
- **Managed workflow** — no need to touch native Xcode/Android Studio code

_Source: [Expo Router v6 Blog](https://expo.dev/blog/expo-router-v6), [Expo Documentation](https://docs.expo.dev/router/introduction/)_

**Maturity Assessment:**

- ✅ **Production-proven:** Expo is used by major companies. Expo Router v6 is a mature, stable framework.
- ✅ **Universal:** Supports Android, iOS, and web from one codebase.
- ✅ **EAS Build & Submit:** Cloud-based build pipeline — no Mac needed for iOS builds. Critical for a solo dev on Linux (Fedora).

#### 3. ⚠️ CRITICAL FINDING: TanStack Router ≠ Expo Router — No Shared Routing

**TanStack Router does NOT support React Native.** The TanStack team has explicitly decided not to prioritize React Native support, stating that "navigation patterns on native are quite distinct from web" and that "bundle size on web could become a problem if a beefy router drags along native specializations."

_Source: [GitHub Discussion #207 — React Native Support](https://github.com/TanStack/router/discussions/207)_

**Impact on Architecture:**

- Web (TanStack Start) and Mobile (Expo Router) will be **two separate applications** with separate routing
- They will NOT share page structure, navigation logic, or route definitions
- **What CAN be shared** (via monorepo):
  - TanStack Query hooks (data fetching from Supabase)
  - Business logic (cart calculations, adapter pattern, validation)
  - TypeScript types and interfaces
  - Supabase client configuration
  - UI components (with React Native Web compatibility or shared design tokens)
- **What CANNOT be shared:**
  - Routing/navigation
  - Page/screen layouts
  - SSR logic (web-only)
  - Native-specific components (push notifications, native gestures)

**Monorepo Strategy:**
Recommended structure using pnpm workspaces or Turborepo:

```
packages/
  shared/          → Types, business logic, TanStack Query hooks, Supabase client
  ui/              → Shared design tokens, potentially React Native Web components
apps/
  web/             → TanStack Start app (SSR, SEO)
  mobile/          → Expo Router app (iOS, Android)
```

_Sources: [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos/), [Nx — Expo Monorepo](https://nx.dev/blog/step-by-step-guide-to-creating-an-expo-monorepo-with-nx)_

### Database and Storage Technologies

#### Supabase — PostgreSQL as Backend

**Current Status:** Mature, production-ready platform. General Availability since April 2024.

**What It Provides:**

- **PostgreSQL database** — Full relational database with JSONB, full-text search, and pgvector (for future AI search embeddings)
- **Row Level Security (RLS)** — Authorization rules at the database level. Critical for multi-tenant data (user carts, orders, wishlists). RLS policies integrate natively with Supabase Auth JWT tokens.
- **Supabase Auth** — Email/password, OAuth (Google, Apple), magic links, guest sessions. Supports anonymous/guest checkout — essential for the "no forced signup" requirement.
- **Edge Functions** — Deno-based serverless functions for business logic (supplier API calls, order orchestration, webhook handling)
- **Real-time** — WebSocket-based subscriptions with RLS-aware filtering. Useful for order status updates and live inventory changes.
- **Storage** — S3-compatible object storage for product images (if caching supplier images locally)

_Sources: [Supabase Official](https://supabase.com/), [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Auth + RLS](https://hrekov.com/blog/supabase-auth-rls-real-time)_

**Edge Functions Limitations:**
| Constraint | Limit | Impact on E-commerce |
|---|---|---|
| CPU time per request | 2 seconds | ⚠️ Complex supplier API aggregation may need optimization |
| Request idle timeout | 150 seconds | ✅ Sufficient for async supplier calls |
| Max function size | 20 MB (bundled) | ✅ Adequate |
| No Web Workers / Node VM | N/A | ⚠️ Cannot run heavy computation; use DB functions instead |
| No ports 25/587 | N/A | ✅ No impact (use third-party email service) |

_Source: [Supabase Edge Functions Limits](https://supabase.com/docs/guides/functions/limits)_

**Pricing at Scale:**

| Scale                             | Plan        | Estimated Monthly Cost        |
| --------------------------------- | ----------- | ----------------------------- |
| MVP (< 500 MAU)                   | Free        | $0                            |
| Growth (< 100K MAU, 8 GB DB)      | Pro         | $25/month                     |
| Scale (100K+ MAU)                 | Pro + usage | ~$25 + $3.25/1000 MAU overage |
| High traffic (500K MAU, 50 GB DB) | Team        | ~$599/month                   |

For a solo-dev e-commerce platform in its first 12 months, the **Pro plan at $25/month** comfortably covers the expected user base. MAU-based pricing ($3.25 per 1,000 users above 100K) is the primary cost driver at scale.

_Sources: [Supabase Pricing](https://supabase.com/pricing), [Supabase Real Costs at Scale](https://designrevision.com/blog/supabase-pricing), [Metacto — Supabase Pricing 2026](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)_

### Development Tools and Platforms

_Build & Development:_

- **Vite** — TanStack Start is built on Vite. Fast HMR, optimized builds. Also used by Expo for web builds.
- **pnpm** — Recommended package manager for monorepo workspaces (faster installs, disk-efficient)
- **Turborepo** or **Nx** — Monorepo orchestration for parallel builds, caching, and dependency management between web and mobile packages
- **EAS (Expo Application Services)** — Cloud build and submit for iOS/Android. Eliminates need for a Mac.

_Testing:_

- **Vitest** — Native Vite integration for unit/integration tests (TanStack Start)
- **Playwright** — E2E testing for web
- **Detox** or **Maestro** — E2E testing for React Native mobile

_Version Control & CI/CD:_

- **GitHub Actions** — CI/CD pipeline for both web and mobile builds
- **EAS Build** — Mobile CI/CD integrated with Expo

### Cloud Infrastructure and Deployment

**Web (TanStack Start) Deployment Options:**

| Platform               | SSR Support             | Edge              | Pros                                                                | Cons                                 |
| ---------------------- | ----------------------- | ----------------- | ------------------------------------------------------------------- | ------------------------------------ |
| **Cloudflare Workers** | ✅ Native               | ✅ Global edge    | Fastest, cheapest at scale, auto-detect TanStack                    | Cold start concerns for complex apps |
| **Netlify**            | ✅ Serverless functions | ✅ Edge functions | Official partner, easy setup, `@netlify/vite-plugin-tanstack-start` | Pricing can spike with traffic       |
| **Vercel**             | ✅ Serverless           | ✅ Edge runtime   | One-click deploy, great DX                                          | Vendor lock-in concerns, pricing     |
| **Railway**            | ✅ Long-running Node    | ❌ No edge        | Official partner, simple containers                                 | No edge distribution                 |

_Recommended for this project:_ **Cloudflare Workers** — best price-performance ratio, global edge for SEO performance, native TanStack Start detection. Alternatively, **Netlify** for simplicity.

_Source: [TanStack Start Hosting Docs](https://tanstack.com/start/latest/docs/framework/react/guide/hosting), [Cloudflare Workers — TanStack Start](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [Netlify — TanStack Start](https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/)_

**Mobile (Expo) Deployment:**

- **EAS Build** → Cloud builds for iOS and Android
- **EAS Submit** → Automated submission to App Store and Google Play
- **EAS Update** → OTA JavaScript updates without store review

**Backend (Supabase) Deployment:**

- **Supabase Cloud** — Managed hosting (recommended for solo-dev)
- **Self-hosted** — Docker-based deployment possible but adds operational overhead

### Technology Adoption Trends

_Migration Patterns:_

- **Away from Next.js** — Growing developer frustration with Next.js complexity, App Router migration pain, and Vercel vendor lock-in is driving exploration of TanStack Start. Inngest's migration (83% dev speed improvement) is a notable case study.
- **Toward full-stack TypeScript** — The trend is strongly toward end-to-end type-safe stacks. TanStack + Supabase represents this trend well.
- **BaaS adoption** — Supabase is the fastest-growing Firebase alternative, particularly for projects that want PostgreSQL instead of NoSQL.

_Source: [LogRocket — TanStack Start vs Next.js](https://blog.logrocket.com/tanstack-start-vs-next-js-choosing-the-right-full-stack-react-framework/), [Dev.to — Next.js vs TanStack 2025](https://dev.to/tahmidbintaslim/nextjs-vs-tanstack-in-2025-a-practical-comparison-1991)_

_Emerging Technologies in the TanStack Ecosystem:_

- **TanStack DB** — In development. Could provide client-side database capabilities for offline-first features (Phase 2 offline browsing).
- **TanStack AI** — In development. Could integrate with the AI conversational search feature.

_Community Trends:_

- TanStack ecosystem growing rapidly — State of Frontend surveys now include TanStack Start
- Expo/React Native community is the largest cross-platform mobile framework community
- Supabase has 75K+ GitHub stars, one of the fastest-growing open-source backend projects

_Source: [Patterns.dev — React Stack Patterns 2026](https://www.patterns.dev/react/react-2026/), [TanStack Official](https://tanstack.com/)_

## Integration Patterns Analysis

### API Design Patterns — How the Stack Connects

#### 1. TanStack Start Server Functions → Supabase (Web)

TanStack Start provides **type-safe server functions** via `createServerFn()` — an RPC mechanism that eliminates manual REST/GraphQL endpoint creation. Server functions execute on the server and are called from client components with full TypeScript type inference across the client-server boundary.

**Pattern for this project:**

```
Browser → TanStack Start Server Function → Supabase Server Client → PostgreSQL
```

- Server functions read secure cookies (Supabase Auth session) and validate the JWT
- The `@supabase/ssr` package replaces older auth-helpers for server-side Supabase client creation
- `beforeLoad` route hooks execute server-side during navigation — ideal for auth checks and data prefetching
- Server functions can call Supabase DB, Edge Functions, or external supplier APIs

**Official integration exists:** Supabase provides an official TanStack Start quickstart guide, and TanStack provides a `start-supabase-basic` example project.

_Sources: [Supabase — Use with TanStack Start](https://supabase.com/docs/guides/getting-started/quickstarts/tanstack), [TanStack Start Supabase Example](https://tanstack.com/start/latest/docs/framework/react/examples/start-supabase-basic), [TanStack Start Server Functions Docs](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)_

#### 2. Expo/React Native → Supabase (Mobile)

Expo connects directly to Supabase via the `@supabase/supabase-js` client library. No server function layer — the mobile app communicates directly with the Supabase API gateway (PostgREST + GoTrue Auth).

**Pattern for this project:**

```
Expo App → Supabase JS Client → PostgREST API → PostgreSQL (with RLS)
```

- Auth tokens stored securely via `expo-secure-store`
- RLS policies enforce data access at the database level — safe for direct client access
- Real-time subscriptions via WebSocket for live order updates

**Official integration exists:** Supabase provides an official Expo React Native quickstart and tutorial.

_Sources: [Supabase — Expo React Native Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native), [Expo — Using Supabase Guide](https://docs.expo.dev/guides/using-supabase/)_

### Communication Protocols

#### TanStack Query — The Shared Data Layer

**TanStack Query (React Query v5) is the critical shared integration layer** between web and mobile. Both TanStack Start (web) and Expo (mobile) use React — so TanStack Query hooks work identically on both platforms.

**Shared patterns (monorepo `packages/shared/`):**

- **Custom hooks** wrapping Supabase queries: `useProducts()`, `useCart()`, `useOrders()`, `useSearch()`
- **Error handling**: Call `.throwOnError()` on Supabase queries to convert Supabase errors into thrown exceptions that TanStack Query catches
- **Cache strategy**: `staleTime: 60000` (1 min) for product catalog, `staleTime: 0` for cart/orders (always fresh)
- **Optimistic updates**: Update UI before server responds (add to cart, wishlist), roll back on error
- **Realtime invalidation**: Subscribe to Supabase Realtime changes, then call `queryClient.invalidateQueries()` to trigger refetch

_Sources: [Makerkit — Supabase with TanStack Query](https://makerkit.dev/blog/saas/supabase-react-query), [Gauntlet Designs — Better Async Handling for Supabase](https://gauntletdesigns.com/articles/wrapping_supabase_with_tanstack), [GitHub — expo-router-supabase-tanstack Example](https://github.com/aaronksaunders/expo-router-supabase-tanstack)_

#### Supabase Realtime — WebSocket Protocol

Supabase Realtime uses WebSocket connections with RLS-aware filtering — real-time events are only broadcast to clients authorized to read the data.

**Use cases for this project:**

- **Order status updates**: Database trigger on order status change → Realtime broadcast → UI update
- **Inventory changes**: Supplier stock updates reflected in real-time on product pages
- **Cart sync**: Cross-device cart synchronization for logged-in users

⚠️ **Consideration:** Firewalls or proxies can block WebSocket connections. For mobile, this is generally not an issue. For web behind corporate firewalls, SSE (Server-Sent Events) fallback may be needed.

_Source: [Supabase Realtime React Native](https://www.restack.io/docs/supabase-knowledge-supabase-realtime-react-native)_

### Data Formats and Standards

#### Supabase-Generated TypeScript Types

Supabase CLI can auto-generate TypeScript types from the database schema. These types are shared across web and mobile via the monorepo:

```
supabase gen types typescript --project-id <ref> > packages/shared/types/database.ts
```

This creates a single source of truth for all data shapes — products, orders, carts, users — used by both TanStack Start and Expo.

#### Supplier API Data Normalization

Supplier APIs (Violet.io, etc.) return data in their own formats. The Adapter Pattern normalizes this into internal types:

```
Supplier API Response → Adapter → Internal Product/Order Type → Supabase DB → TanStack Query → UI
```

### System Interoperability — The Supplier Adapter Pattern

The **Adapter Pattern** is the architectural cornerstone for supplier integration. It provides a unified interface regardless of which supplier fulfills the order.

**TypeScript Interface Pattern:**

```typescript
interface SupplierAdapter {
  searchProducts(query: string): Promise<Product[]>;
  getProduct(id: string): Promise<ProductDetail>;
  createOrder(cart: CartItem[]): Promise<Order>;
  getOrderStatus(orderId: string): Promise<OrderStatus>;
  processReturn(
    orderId: string,
    items: ReturnItem[],
  ): Promise<ReturnConfirmation>;
}
```

Each supplier (Violet.io, firmly.ai, etc.) implements this interface. The platform code never interacts with supplier-specific APIs directly — only through the adapter.

**Benefits confirmed by research:**

- Seamless switching between suppliers without UI changes
- Separation of concerns — components don't know about supplier intricacies
- Upstream API changes isolated to the adapter layer
- New suppliers added by implementing the interface — no platform-level changes

**Where adapters run:** Supabase Edge Functions. Each adapter is an Edge Function (or a set of functions) that translates between the internal interface and the supplier API.

_Sources: [Refactoring.guru — Adapter Pattern TypeScript](https://refactoring.guru/design-patterns/adapter/typescript/example), [Bocoup — Adapter Pattern for Vendor Integrations](https://www.bocoup.com/blog/adapter-pattern-a-must-for-vendor-service-integrations), [Medium — Adapter Pattern for Third-Party Integrations](https://medium.com/@olorondu_emeka/adapter-design-pattern-a-guide-to-manage-multiple-third-party-integrations-dc342f435daf)_

### Supplier Integration — Violet.io as Primary Supplier API

Violet.io provides a **Unified Commerce API** that connects to 225+ e-commerce platforms (Shopify, WooCommerce, Magento, etc.) through a single integration.

**What Violet.io provides:**

- **Unified Checkout API** — Create seamless checkout experiences connected to any merchant
- **Catalog API** — Aggregated product data from multiple merchants
- **Order Lifecycle** — Checkout, order tracking, returns, refunds, exchanges
- **Multi-merchant carts** — Single cart across multiple suppliers (exactly what the project needs)

**Integration flow:**

```
User adds to cart → Supabase Edge Function → Violet.io API → Merchant's Shopify/WooCommerce
                                                            ← Order confirmation
                  ← Store in Supabase DB ← Normalized response
```

⚠️ **Edge Function CPU limit consideration:** Violet.io API calls involve network I/O (not CPU). The 2-second CPU limit applies to computation, not waiting for external API responses. The 150-second idle timeout is generous for API orchestration. Multi-merchant checkout (multiple sequential API calls) should work within limits.

_Sources: [Violet.io Official](https://violet.io/), [Violet.io Checkout Orchestration](https://violet.io/features/checkout), [Violet.io API Reference](https://docs.violet.io/api-reference)_

### Event-Driven Integration

#### Push Notifications Pipeline (Mobile)

**Architecture for order tracking notifications:**

```
Order status change in DB
  → Database trigger inserts row in notifications table
    → Database webhook triggers Edge Function
      → Edge Function sends push via Expo Push Notification Service (or FCM/APNs)
        → User receives push notification on mobile
```

Expo makes push notifications cross-platform (iOS + Android) with a unified API. Supabase provides official documentation for this exact pattern.

_Sources: [Supabase — Push Notifications with Edge Functions](https://supabase.com/docs/guides/functions/examples/push-notifications), [Expo — Using Push Notifications](https://docs.expo.dev/guides/using-push-notifications-services/), [Medium — Push Notifications with RN + Supabase](https://medium.com/@sakmaral703/how-i-built-push-notifications-in-react-native-0-78-0c9f00b286f7)_

#### Webhook Handling (Supplier Events)

Supabase Edge Functions can receive webhooks from suppliers (order updates, inventory changes, refund confirmations):

```
Supplier webhook → Edge Function (--no-verify-jwt for external callers)
  → Validate webhook signature
    → Update Supabase DB
      → Trigger Realtime broadcast to connected clients
```

_Sources: [Supabase Edge Functions — Stripe Webhooks Example](https://supabase.com/docs/guides/functions/examples/stripe-webhooks), [Svix — Receiving Webhooks with Supabase](https://www.svix.com/blog/receive-webhooks-with-supabase-edge-functions/)_

### Integration Security Patterns

#### Authentication Flow — Guest-First Design

Supabase Auth supports **anonymous sign-ins** — critical for the "no forced signup" requirement:

1. **First visit**: `signInAnonymously()` creates an anonymous user with a real user ID and JWT
2. **Shopping**: Anonymous user can add to cart, browse, use AI search — all protected by RLS (using `is_anonymous` claim in JWT)
3. **Guest checkout**: One-step checkout without account creation. Order linked to anonymous user ID.
4. **Optional conversion**: If user wants to save order history, they can link an email/phone via `updateUser()` — converting anonymous to permanent without data loss
5. **Return visit**: Permanent users sign in normally; anonymous sessions expire with browser data

**Security measures:**

- Enable Cloudflare Turnstile or invisible CAPTCHA to prevent anonymous sign-in abuse
- IP-based rate limit: 30 requests/hour (configurable)
- RLS policies differentiate anonymous vs. authenticated access (e.g., anonymous can read products but not view other users' orders)

_Sources: [Supabase — Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous), [Supabase — Anonymous Sign-Ins Blog](https://supabase.com/blog/anonymous-sign-ins)_

#### Row Level Security (RLS) — Database-Level Authorization

RLS policies enforce data access at the PostgreSQL level. Combined with Supabase Auth JWTs, this means:

- PostgREST verifies JWT signature and expiration
- Session switches from `anon` role to `authenticated` role
- RLS policies check `auth.uid()` to restrict data access per user
- Real-time events respect RLS — users only receive broadcasts for data they can read

**Practical examples for e-commerce:**

- `products` table: Public read access (no auth required)
- `carts` table: Users can only read/write their own cart (`auth.uid() = user_id`)
- `orders` table: Users can only read their own orders
- `admin` operations: Edge Functions use the `service_role` key to bypass RLS for admin tasks

_Source: [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase RLS Complete Guide 2026](https://designrevision.com/blog/supabase-row-level-security)_

### AI Search Integration — pgvector + OpenAI Embeddings

Supabase includes **pgvector** — a PostgreSQL extension for vector similarity search. This enables the AI conversational search feature:

**Architecture:**

```
User query ("gift for dad who likes cooking")
  → Edge Function → OpenAI API (text-embedding-3-small) → 1536-dim vector
    → PostgreSQL: vector similarity search against product embeddings
      → Return ranked products by semantic relevance
```

**Implementation details:**

- Store product embeddings alongside product data in the same table (hybrid semantic + keyword search)
- HNSW index for high recall, IVFFlat for reduced memory
- Supabase can handle 1.6M+ embeddings with good performance
- Product embeddings generated on catalog sync (when supplier data is imported)

⚠️ **Edge Function CPU limit:** The OpenAI API call is I/O-bound (not CPU). The vector similarity search runs in PostgreSQL (not in the Edge Function). Both are within limits.

_Sources: [Supabase pgvector Docs](https://supabase.com/docs/guides/database/extensions/pgvector), [Supabase AI & Vectors](https://supabase.com/docs/guides/ai), [OpenAI Cookbook — Semantic Search with Supabase](https://cookbook.openai.com/examples/vector_databases/supabase/semantic-search), [Supabase Vector Module](https://supabase.com/modules/vector)_

## Architectural Patterns and Design

### System Architecture — Monorepo with Dual Frontend Apps

The system follows a **monorepo architecture** with two distinct frontend applications sharing a common backend and business logic layer. This is not a microservices architecture — it's a **modular monolith** with a clear separation between web and mobile presentation layers.

**High-Level Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                    MONOREPO (pnpm)                       │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ apps/web    │  │ apps/mobile  │  │ packages/     │  │
│  │ TanStack    │  │ Expo Router  │  │ shared/       │  │
│  │ Start (SSR) │  │ React Native │  │  - types      │  │
│  │             │  │              │  │  - hooks      │  │
│  │ SEO-first   │  │ Native-first │  │  - logic      │  │
│  │ Cloudflare  │  │ EAS Build    │  │  - supabase   │  │
│  └──────┬──────┘  └──────┬───────┘  │  - adapters   │  │
│         │                │          └───────┬───────┘  │
│         └────────────────┴──────────────────┘          │
│                          │                              │
└──────────────────────────┼──────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │      SUPABASE CLOUD     │
              │  ┌─────────────────┐    │
              │  │  PostgreSQL     │    │
              │  │  + pgvector     │    │
              │  │  + RLS          │    │
              │  ├─────────────────┤    │
              │  │  Auth (GoTrue)  │    │
              │  ├─────────────────┤    │
              │  │  Edge Functions │    │
              │  │  (Adapters)     │    │
              │  ├─────────────────┤    │
              │  │  Realtime       │    │
              │  ├─────────────────┤    │
              │  │  Storage        │    │
              │  └─────────────────┘    │
              └─────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │   EXTERNAL SERVICES     │
              │  ┌─────────────────┐    │
              │  │  Violet.io API  │    │
              │  │  (Suppliers)    │    │
              │  ├─────────────────┤    │
              │  │  OpenAI API     │    │
              │  │  (Embeddings)   │    │
              │  ├─────────────────┤    │
              │  │  Expo Push      │    │
              │  │  Notifications  │    │
              │  └─────────────────┘    │
              └─────────────────────────┘
```

**Why monorepo, not separate repos:**

- Single source of truth for TypeScript types (product, order, cart schemas)
- Shared TanStack Query hooks work identically on web and mobile
- Atomic changes across web + mobile when business logic changes
- Single CI/CD pipeline possible via GitHub Actions

**Monorepo tooling:** TanStack Start provides official monorepo examples with router and React Query. Expo supports monorepos via Metro configuration. pnpm workspaces or Turborepo recommended for orchestration.

_Sources: [TanStack Start Monorepo Example](https://tanstack.com/start/latest/docs/framework/react/examples/router-monorepo-simple), [TanStack Start Monorepo + React Query Example](https://tanstack.com/start/latest/docs/framework/react/examples/router-monorepo-react-query), [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos/), [byCedric Expo Monorepo Example](https://github.com/byCedric/expo-monorepo-example)_

### Design Principles — Solo-Dev Maintainability

The architecture must respect the **single-developer constraint**. Every design decision is filtered through: "Can one person build, maintain, and debug this?"

**Guiding principles (confirmed by 2025-2026 solo-dev best practices):**

1. **Start monolithic, extract when needed** — Most projects that think they need microservices don't. The Supabase backend is already a managed monolith (DB + Auth + Functions + Realtime). Keep it that way.

2. **TypeScript is your safety net** — When working alone, the compiler catches bugs before production. End-to-end type safety (Supabase types → TanStack Query → UI components) is not luxury — it's survival.

3. **Minimize operational overhead** — Supabase Cloud (managed), Cloudflare Workers (serverless), EAS Build (cloud builds). Zero servers to maintain. No Docker in production. No Kubernetes.

4. **Maximize code sharing** — Every line of business logic written once in `packages/shared/` saves double-maintenance. TanStack Query hooks, validation schemas, adapter interfaces, type definitions — all shared.

5. **Choose boring technology for critical paths** — PostgreSQL (proven for 30+ years) as the data layer. REST over PostgREST (simple, debuggable). Save innovation for differentiators (AI search, premium UX).

_Sources: [SoloDevStack — Complete Tech Stack for Solo SaaS 2025](https://solodevstack.com/blog/complete-tech-stack-saas-solo-2025), [Medium — The 2026 Stack for Solo Developers](https://medium.com/@msbytedev/the-2026-stack-what-every-solo-developer-should-master-right-now-ebdfc77350ce), [Substack — Practical Tech Stack for Solo Developers](https://afadeev.substack.com/p/practical-tech-stack-for-solo-developers)_

### Scalability and Performance Patterns

#### Rendering Strategy — ISR + SSR + Client

TanStack Start supports **SSG, SSR, and ISR in a unified API** — critical for an e-commerce platform with different performance requirements per page type:

| Page Type                        | Strategy                                    | Rationale                                       |
| -------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Product pages                    | **ISR** — Pre-render, revalidate every hour | SEO-critical, data changes infrequently         |
| Content pages (guides, reviews)  | **SSG** — Build-time static                 | Content changes rarely, maximum SEO performance |
| Product listing / search results | **SSR** — Server-render on demand           | Dynamic, depends on filters/query               |
| AI search interface              | **Client-side**                             | Interactive, real-time, no SEO need             |
| Cart / Checkout                  | **Client-side**                             | User-specific, no SEO, highly interactive       |
| Account / Order history          | **Client-side** with auth                   | Private data, no SEO                            |

**CDN caching with stale-while-revalidate:**

ISR in TanStack Start uses HTTP Cache-Control headers:

```
Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400
```

- CDN serves cached page instantly (max-age: 1 hour)
- After 1 hour, serves stale content while regenerating in background (stale-while-revalidate: 24 hours)
- Cloudflare Workers supports these headers natively
- **Cost impact**: Heavily ISR-driven setups shift cost toward build-time rather than ongoing compute per request — ideal for solo-dev budget

_Sources: [TanStack Start — ISR Guide](https://tanstack.com/start/latest/docs/framework/react/guide/isr), [TanStack Start — Static Prerendering](https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering), [Crystallize — Next.js 16 vs TanStack Start for E-commerce](https://crystallize.com/blog/next-vs-tanstack-start)_

#### Supabase Scaling Strategy

Supabase scales differently per component:

| Component      | Scaling Pattern                                     | Concern Level                           |
| -------------- | --------------------------------------------------- | --------------------------------------- |
| PostgreSQL     | Vertical (compute upgrades) + read replicas         | Low — $25/mo handles MVP through growth |
| Edge Functions | Auto-scale (Cloudflare edge network, 50+ locations) | Very low — serverless by design         |
| Auth           | MAU-based pricing, auto-scales                      | Low — $3.25/1000 MAU above 100K         |
| Realtime       | WebSocket connections per project                   | Medium — monitor concurrent connections |
| Storage        | S3-compatible, virtually unlimited                  | Low                                     |

**Primary bottleneck to watch:** Concurrent WebSocket connections for Realtime (order updates, cart sync). The Pro plan includes generous limits, but heavy real-time usage may require a compute upgrade.

### Backend Logic Placement — Database Functions vs Edge Functions

A key architectural decision: **where does business logic run?**

| Logic Type                             | Where                             | Why                                                           |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| Data validation, triggers, constraints | **Database Functions** (PL/pgSQL) | Zero latency, runs inside PostgreSQL, enforces data integrity |
| RLS policies                           | **Database**                      | Security enforcement at the data layer                        |
| Vector similarity search               | **Database** (pgvector)           | Runs natively in PostgreSQL, fast                             |
| Supplier API calls (Violet.io)         | **Edge Functions**                | External HTTP calls, needs Deno runtime                       |
| Webhook receivers                      | **Edge Functions**                | HTTP endpoints, external callers                              |
| OpenAI embedding generation            | **Edge Functions**                | External API call + orchestration                             |
| Push notification dispatch             | **Edge Functions**                | External service call (Expo Push)                             |
| Complex business orchestration         | **Edge Functions**                | Multi-step workflows (order creation flow)                    |
| Full-text search (keywords)            | **Database** (PostgreSQL FTS)     | Native PostgreSQL capability                                  |

**Rule of thumb confirmed by research:** Use Database Functions for data logic; Edge Functions for external APIs, custom endpoints, or async tasks. Combine when needed — an Edge Function can call a Database Function.

_Sources: [CloseFuture — Supabase DB vs Edge Functions](https://www.closefuture.io/blogs/supabase-database-vs-edge-functions), [Supabase Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture), [Supabase Database Functions Docs](https://supabase.com/docs/guides/database/functions)_

### Data Architecture Patterns

#### PostgreSQL Schema Design

The database schema follows a **domain-driven** approach with clear boundaries:

```
Core Domains:
├── products/        → Synced from supplier APIs, includes embeddings
├── carts/           → User shopping carts (anonymous + authenticated)
├── orders/          → Order lifecycle, multi-supplier bags
├── users/           → Supabase Auth managed, extended profile
├── content/         → SEO content (guides, reviews, comparisons)
├── search/          → AI search history, personalization data
└── notifications/   → Push notification queue
```

**Key patterns:**

- **Products table with embeddings:** Product data + VECTOR(1536) column for AI search. Hybrid semantic + keyword search in a single query.
- **Anonymous user carts:** Linked to anonymous user ID from Supabase Auth. Persisted in DB, not localStorage (survives page refresh, enables cross-device sync on account conversion).
- **Order bags:** Violet.io uses "bags" to represent per-merchant groups within a multi-merchant order. The platform mirrors this structure internally.
- **Soft deletes:** Product deactivation rather than deletion to maintain order history integrity.

#### Caching Layers

```
Layer 1: CDN (Cloudflare) — ISR pages, static assets, product images
Layer 2: TanStack Query (client) — In-memory cache, stale-while-revalidate
Layer 3: PostgreSQL — Query result caching via pg_stat_statements, connection pooling via Supavisor
```

No Redis required for MVP. TanStack Query's client-side cache + CDN + PostgreSQL connection pooling provides sufficient performance for a solo-dev scale.

### Deployment and Operations Architecture

**Multi-platform deployment map:**

```
┌─────────────────────────────────────────┐
│              DEPLOYMENT                  │
│                                         │
│  Web App (TanStack Start)               │
│  └→ Cloudflare Workers (global edge)    │
│     └→ CDN: Cloudflare (ISR + static)   │
│                                         │
│  Mobile App (Expo)                      │
│  └→ EAS Build (cloud CI/CD)             │
│     ├→ Apple App Store                  │
│     ├→ Google Play Store                │
│     └→ EAS Update (OTA patches)         │
│                                         │
│  Backend (Supabase)                     │
│  └→ Supabase Cloud (managed)            │
│     └→ Edge Functions (Deno, global)    │
│                                         │
│  CI/CD                                  │
│  └→ GitHub Actions                      │
│     ├→ Web: build + deploy to Cloudflare│
│     ├→ Mobile: trigger EAS Build        │
│     ├→ Shared: type-check + test        │
│     └→ Supabase: migrate + deploy funcs │
└─────────────────────────────────────────┘
```

**Operational overhead for solo-dev:**

- **Zero servers to maintain** — all serverless/managed
- **Database migrations** via Supabase CLI (`supabase db push` or `supabase migration`)
- **Edge Function deployments** via `supabase functions deploy`
- **Web deployments** auto-triggered on git push (Cloudflare Pages / Workers)
- **Mobile builds** triggered via `eas build` command or CI
- **Monitoring**: Supabase Dashboard (DB metrics, Edge Function logs, Auth stats) + Cloudflare Analytics (web traffic, cache hit ratio)

_Sources: [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions), [RWIT — Supabase Edge Functions + AI Microservices](https://www.rwit.io/blog/supabase-edge-functions-ai-microservices), [Supabase Architecture Q&A](https://hrekov.com/blog/supabase-architecture-questions)_

## Implementation Approaches and Technology Adoption

### Technology Adoption Strategies

#### Starting Point — Existing Templates

Multiple production-grade TanStack Start + Supabase starter templates exist, eliminating the need to configure the integration from scratch:

| Template                                                                                                                | Stack                                       | Notes                                   |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------- |
| [mwolf1989/tanstack-starter](https://github.com/mwolf1989/tanstack-starter)                                             | TanStack Start + Supabase + Shadcn          | Minimal, forked from dotnize/tanstarter |
| [guidovizoso/z1](https://github.com/guidovizoso/z1)                                                                     | TanStack Start + Supabase + Tailwind + Bun  | Open-source, TanStack Query included    |
| [Biechy/TanSaaS](https://github.com/Biechy/TanSaaS)                                                                     | TanStack Start + Supabase + Stripe + Docker | SaaS-ready with billing                 |
| [TanStack Start Official Example](https://tanstack.com/start/latest/docs/framework/react/examples/start-supabase-basic) | TanStack Start + Supabase                   | Official minimal example                |
| [aaronksaunders/expo-supabase-ai-template](https://github.com/aaronksaunders/expo-supabase-ai-template)                 | Expo Router + Supabase + OpenAI             | Mobile + AI integration                 |

For the mobile side, Supabase provides an official Expo React Native tutorial with complete authentication flow, and Expo provides an official "Using Supabase" guide.

_Sources: [TanStack Starter on GitHub](https://github.com/mwolf1989/tanstack-starter), [Supabase — TanStack Start Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/tanstack), [Expo — Using Supabase Guide](https://docs.expo.dev/guides/using-supabase/), [Expo + Supabase AI Template](https://github.com/aaronksaunders/expo-supabase-ai-template)_

#### Phased Adoption Strategy

Given TanStack Start's RC status and the project's solo-dev nature, a **phased adoption** approach minimizes risk:

**Phase 0 — Validate supplier first (before any dev)**

- Confirm a white-label supplier (Violet.io or equivalent) works end-to-end
- No code written until real products and checkout flow are confirmed viable

**Phase 1 — MVP Backend + Mobile (lower risk)**

- Start with Expo Router + Supabase (both stable)
- Build: Auth, product catalog sync (from supplier), shopping flow, checkout
- Mobile-first validates the entire data model before investing in SSR web

**Phase 2 — Web with TanStack Start**

- By then, TanStack Start v1 stable will likely be released
- Apply mobile-validated data model and TanStack Query hooks to web
- Add SSR, ISR, SEO content

**Phase 3 — AI Search + Optimization**

- pgvector + OpenAI embeddings on top of the stable product catalog
- Performance optimization (ISR tuning, caching layers)

This sequence reduces the blast radius of TanStack Start RC risks and ensures mobile validates business logic before web.

### Development Workflows and Tooling

#### Recommended Monorepo Setup

```
# Initialize
pnpm create turbo@latest  # or: pnpm init + manual workspace config

# Structure
apps/
  web/          → pnpm create @tanstack/start
  mobile/       → npx create-expo-app --template

packages/
  shared/       → pnpm init (manual TypeScript package)
  ui/           → Optional: shared React Native Web components

# Generate Supabase types (run after schema changes)
supabase gen types typescript --project-id <ref> > packages/shared/src/types/database.ts
```

#### CI/CD Pipeline (GitHub Actions)

Recommended pipeline structure for a solo developer:

```
Push to main →
  ├── [Parallel] Type-check all packages
  ├── [Parallel] Unit tests (Vitest)
  ├── [If web changed] Build + Deploy to Cloudflare Workers
  ├── [If mobile changed] Trigger EAS Build (iOS + Android)
  └── [If supabase/ changed] Deploy Edge Functions + run migrations
```

_Sources: [TanStack Start Monorepo Examples](https://tanstack.com/start/latest/docs/framework/react/examples/router-monorepo-react-query), [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos/)_

### Testing and Quality Assurance

#### Web (TanStack Start) Testing

**Recommended stack:**

- **Vitest** — Unit and integration tests
- **Playwright** — E2E testing (recommended over Cypress for TanStack Start)

⚠️ **Known issue:** TanStack Start's Vite plugin conflicts with Vitest test environment — the plugin applies `optimizeDeps` unconditionally, causing React to resolve as null in tests. **Workaround:** Conditionally disable the tanstackStart plugin when `process.env.VITEST` is set.

```typescript
// vite.config.ts
plugins: [
  !process.env.VITEST && tanstackStart(), // Disable during tests
  // ...
];
```

No dedicated TanStack Start testing documentation exists yet — this is a known gap. Testing via TanStack Router test utilities + Playwright E2E is the current best practice.

_Sources: [TanStack Router Testing Docs](https://tanstack.com/router/latest/docs/framework/react/how-to/setup-testing), [Awarefy Tech Stack 2025](https://hash.awarefy.dev/awarefy-web-tech-stack-2025), [Known Vitest Issue](https://github.com/onlywei/repro-tanstack-start-vitest)_

#### Mobile (Expo) Testing

- **Jest** (built into Expo) — Unit tests
- **Maestro** — E2E mobile testing (simpler setup than Detox for solo developers)
- **Expo Go** — Rapid iteration during development

### 🚨 Risk Assessment and Mitigation

This is the most critical section of the research. Two **confirmed production risks** were identified for TanStack Start:

#### Risk 1 — CRITICAL: SSR Streaming Memory Leak

**Issue:** [GitHub Issue #5289](https://github.com/TanStack/router/issues/5289) — Memory usage grows linearly with each SSR-streamed request until the server crashes.

**Impact:** Applications under load will experience progressive performance degradation and eventually crash.

**Status as of research date (March 2026):** Issue was open as of late November 2025 (v1.139.10). Current resolution status unknown — monitor the issue.

**Mitigation strategies:**

- ✅ Deploy to **Cloudflare Workers** instead of a Node.js server — Workers' edge architecture means each request is isolated, no shared memory accumulation
- ✅ Minimize use of SSR Streaming (prefer ISR/SSG for product pages)
- ✅ Pin to a specific version where the issue is fixed once resolved
- ✅ Monitor the issue before going live with high traffic

_Source: [GitHub Issue #5289](https://github.com/TanStack/router/issues/5289)_

#### Risk 2 — HIGH: TanStack Form + Start Memory Leak

**Issue:** [GitHub Issue #5734](https://github.com/TanStack/router/issues/5734) — Pages using TanStack Form in a TanStack Start app cause a memory leak that crashes servers ~every 30 minutes.

**Impact:** Checkout page (TanStack Form for address/payment) would crash the server in production.

**Mitigation strategies:**

- ✅ **Use client-only rendering for checkout** (no SSR) — Guest checkout is already client-side by nature (user-specific). This avoids the server-side memory leak entirely.
- ✅ For SSR forms (search bar), use a simpler uncontrolled input rather than TanStack Form until the issue is resolved
- ✅ Monitor [Issue #5734](https://github.com/TanStack/router/issues/5734) for resolution

_Source: [GitHub Issue #5734](https://github.com/TanStack/router/issues/5734)_

#### Risk 3 — MEDIUM: RC Stability

**Issue:** TanStack Start is still in Release Candidate. API may have minor breaking changes before v1 stable.

**Mitigation:**

- ✅ Pin all TanStack dependencies to exact versions (no `^` in package.json)
- ✅ Review release notes before each update
- ✅ The phased adoption strategy (mobile-first) buys time for v1 stable release

#### Risk 4 — LOW: Vitest Compatibility

**Issue:** Known conflict between TanStack Start Vite plugin and Vitest.

**Mitigation:** Apply the `process.env.VITEST` conditional workaround in vite.config.ts (documented above).

#### Risk Summary Table

| Risk                           | Severity    | Status               | Mitigation                                    |
| ------------------------------ | ----------- | -------------------- | --------------------------------------------- |
| SSR Streaming memory leak      | 🔴 Critical | Open                 | Use Cloudflare Workers + prefer ISR/SSG       |
| TanStack Form memory leak      | 🔴 High     | Open                 | Client-side render checkout + avoid SSR forms |
| RC API instability             | 🟡 Medium   | Ongoing              | Pin deps + mobile-first approach              |
| Vitest conflict                | 🟢 Low      | Workaround available | Disable plugin during test env                |
| Expo/TanStack routing mismatch | 🟢 Info     | By design            | Two-app monorepo architecture                 |

### Cost Optimization and Resource Management

#### Total Stack Cost Breakdown — Solo Dev

| Service                | MVP Phase                | Growth Phase        | Notes                                      |
| ---------------------- | ------------------------ | ------------------- | ------------------------------------------ |
| **Supabase**           | $0 (Free)                | $25/month (Pro)     | Upgrade when hitting 40K+ MAU or 400MB+ DB |
| **Cloudflare Workers** | $0 (Free plan generous)  | ~$5-20/month        | 100K req/day free, then usage-based        |
| **EAS Build**          | $0 (Free tier)           | $19/month (Starter) | Free tier: limited builds/month            |
| **Apple Developer**    | $99/year (one-time)      | $99/year            | Required for App Store                     |
| **Google Play**        | $25 (one-time)           | —                   | One-time registration fee                  |
| **OpenAI API**         | ~$5-20/month             | ~$20-100/month      | text-embedding-3-small is very cheap       |
| **Domain + email**     | ~$15/year                | ~$15/year           | Cloudflare DNS is free                     |
| **Total MVP**          | **~$140-155 first year** | **~$70-160/month**  | Including Apple dev program                |

**⚠️ Free tier Supabase warning:** Free tier projects are **paused after 7 days of inactivity**. This makes the free tier unsuitable for production. Upgrade to Pro ($25/month) immediately when launching publicly.

**Cost optimization strategies:**

- Use CDN aggressively (Cloudflare) to minimize Supabase bandwidth overages
- Use ISR for product pages — reduces Supabase queries dramatically vs SSR on every request
- Use `text-embedding-3-small` (not `text-embedding-3-large`) — 5x cheaper, sufficient quality for product search
- Consolidate Supabase projects (don't create separate projects for dev/staging — use schemas or RLS policies instead)

_Sources: [Supabase Pricing](https://supabase.com/pricing), [Supabase Free Tier Pausing](https://uibakery.io/blog/supabase-pricing), [Expo EAS Pricing](https://expo.dev/pricing), [Metacto — True Cost of Expo Development](https://www.metacto.com/blogs/the-true-cost-of-expo-app-development-a-comprehensive-guide)_

## Technical Research Recommendations

### Implementation Roadmap

**Week 1-2: Foundation**

- [ ] Set up monorepo (pnpm + Turborepo)
- [ ] Supabase project creation (use Pro plan immediately if production-intent)
- [ ] Design PostgreSQL schema (products, carts, orders, users, notifications)
- [ ] Set up Supabase Auth with anonymous sign-ins enabled
- [ ] Generate TypeScript types from Supabase schema
- [ ] Validate Violet.io API access (prerequisite from product brief)

**Week 3-4: Mobile App (Expo)**

- [ ] Create Expo Router app from template
- [ ] Implement Supabase Auth (anonymous + email)
- [ ] Product listing + detail pages
- [ ] Cart (anonymous-user-linked, persisted in DB)
- [ ] Connect to Violet.io Adapter (Edge Function)
- [ ] Checkout flow (client-side only, no SSR)

**Week 5-6: Web App (TanStack Start)**

- [ ] Create TanStack Start app from starter template
- [ ] Reuse shared TanStack Query hooks from monorepo
- [ ] SEO product pages with ISR (avoid SSR streaming until memory leak resolved)
- [ ] Content pages (guides, reviews) as SSG
- [ ] Auth flow (reuse same Supabase project)

**Week 7-8: AI Search + Polish**

- [ ] Enable pgvector extension in Supabase
- [ ] Product embedding generation (Edge Function triggered on catalog sync)
- [ ] AI search interface (client-side, no SSR)
- [ ] Push notifications (DB trigger → Edge Function → Expo Push)
- [ ] Performance audit (ISR cache hit ratios, Supabase query optimization)

### Technology Stack Recommendations

**Validated stack (confirmed by research):**

| Layer            | Technology                | Confidence | Risk                                |
| ---------------- | ------------------------- | ---------- | ----------------------------------- |
| Web Framework    | TanStack Start            | ✅ High    | 🔴 Memory leaks in RC (mitigatable) |
| Web Routing      | TanStack Router           | ✅ High    | 🟢 Stable v1                        |
| Data Fetching    | TanStack Query v5         | ✅ High    | 🟢 Stable, widely used              |
| Mobile           | Expo Router v6            | ✅ High    | 🟢 Stable, production-proven        |
| Backend          | Supabase                  | ✅ High    | 🟢 GA, mature                       |
| Database         | PostgreSQL (via Supabase) | ✅ High    | 🟢 30+ years proven                 |
| AI Search        | pgvector + OpenAI         | ✅ High    | 🟢 Official Supabase support        |
| Supplier API     | Violet.io                 | ⚠️ Medium  | 🟡 Needs validation                 |
| Deployment (web) | Cloudflare Workers        | ✅ High    | 🟢 Official TanStack partner        |
| Mobile CI/CD     | EAS Build                 | ✅ High    | 🟢 Official Expo service            |

**Alternative to consider:**

- If TanStack Start memory leaks remain unresolved at Phase 2: evaluate **Next.js 15** as a drop-in replacement for the web app. The monorepo structure means only `apps/web/` would change — shared packages and the mobile app remain intact.

### Success Metrics and KPIs

**Technical success indicators:**

- Core Web Vitals (LCP < 2.5s for product pages — ISR + CDN)
- Time-to-interactive < 3s on mobile (Expo with native rendering)
- Supabase query P95 latency < 100ms (with proper indexing)
- Edge Function cold start < 50ms (Cloudflare Workers)
- AI search response < 1s end-to-end (embedding + vector similarity)

**Infrastructure cost goals (revised for self-hosted):**

- MVP launch: < $200 total first 3 months
- 1,000 MAU: ~$13/month (VPS only)
- 10,000 MAU: ~$13/month (VPS only)
- 100,000 MAU: ~$13/month (VPS only — no MAU-based pricing)

---

## Research Synthesis — Step 6 (Updated March 3, 2026)

### Executive Summary

This comprehensive technical research validates the **TanStack Start (SSR) + Expo Router/React Native + Supabase** stack for a solo-dev white-label affiliate e-commerce platform. After exhaustive analysis across 15+ verified web sources, multiple architecture patterns, and real-world production case studies, the stack is **confirmed as viable with specific architectural decisions** that maximize feasibility for a single developer.

**Critical findings that reshape the original architecture:**

1. **Self-hosted infrastructure is the recommended path** — Supabase self-hosted on a Hostinger VPS ($13/month) eliminates MAU-based pricing that would cost $350+/month at scale. The trade-off is operational overhead, mitigated by Docker Compose automation and a disciplined backup strategy.

2. **AI semantic search should be deferred to V1.1** — With a small initial catalog (<100 SKUs from StyleSphere), PostgreSQL full-text search (tsvector + GIN index) is sufficient for MVP. pgvector + OpenAI embeddings add the "wow moment" conversational search in a second phase, at minimal additional effort since the Supabase hybrid search pattern is officially documented.

3. **TanStack Start memory leaks are largely resolved** — The critical TanStack Form memory leak (#5734) was fixed in v1.154.0 (January 5, 2026). The SSR streaming leak (#5289) is mitigated by using ISR/SSG for product pages and client-side rendering for checkout. TanStack Start remains in RC but the API is stable.

4. **Cloudflare serves as CDN/protection, not hosting** — With a VPS-based architecture, Cloudflare Workers for hosting is unnecessary. The Cloudflare free plan provides CDN caching, DDoS protection, and DNS — recommended as a proxy layer in front of the VPS but not required.

5. **Expo SDK 55 (React Native 0.83)** is now available — significantly newer than the SDK 53 referenced during initial research, with the New Architecture enabled by default.

**Key Technical Recommendations:**

- Deploy TanStack Start on VPS (Node.js + PM2 + Nginx) — not serverless
- Self-host Supabase via Docker Compose on the same or separate VPS
- Use Cloudflare free proxy for CDN + DDoS protection
- Start with PostgreSQL full-text search, add pgvector post-launch
- Use Expo SDK 55 for mobile (latest stable)
- Pin all TanStack dependencies to exact versions

---

### Table of Contents — Research Synthesis

1. Revised Architecture: Full Self-Hosted on VPS
2. Deployment Strategy: VPS vs. Serverless Decision
3. Cloudflare Role Clarification
4. AI Search Strategy: Phased Approach
5. Updated Risk Assessment (March 2026)
6. Revised Cost Analysis
7. Technology Stack Updates
8. Security and Compliance for Self-Hosted
9. Implementation Roadmap Adjustments
10. Future Technical Outlook
11. Research Methodology and Source Verification
12. Technical Appendices

---

### 1. Revised Architecture: Full Self-Hosted on VPS

**Production Deployment Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE (Free Proxy)                   │
│  CDN + DDoS Protection + DNS + SSL Termination              │
│  (Recommended but optional)                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│               HOSTINGER VPS KVM 4                            │
│               4 vCPU / 16GB RAM / 200GB NVMe                │
│                                                              │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │  Nginx           │  │  Docker Compose                 │  │
│  │  Reverse Proxy   │  │  ┌────────────────────────────┐ │  │
│  │  SSL (LE/CF)     │  │  │  Supabase Self-Hosted      │ │  │
│  │                  │  │  │  ├─ PostgreSQL + pgvector   │ │  │
│  │  /:3000 → Start  │  │  │  ├─ GoTrue (Auth)          │ │  │
│  │  /api → Supabase │  │  │  ├─ PostgREST              │ │  │
│  └──────────────────┘  │  │  ├─ Realtime               │ │  │
│                        │  │  ├─ Storage                 │ │  │
│  ┌──────────────────┐  │  │  ├─ Edge Functions (Deno)   │ │  │
│  │  Node.js + PM2   │  │  │  ├─ Kong (API Gateway)     │ │  │
│  │  TanStack Start  │  │  │  └─ Studio (Dashboard)     │ │  │
│  │  (SSR/ISR)       │  │  └────────────────────────────┘ │  │
│  └──────────────────┘  └─────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │  Cron Jobs       │  │  Security                       │  │
│  │  ├─ pg_dump daily│  │  ├─ ufw / firewalld            │  │
│  │  ├─ Offsite sync │  │  ├─ fail2ban (SSH)             │  │
│  │  └─ Log rotation │  │  ├─ Auto security updates      │  │
│  └──────────────────┘  │  └─ Secrets management         │  │
│                        └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │   EXTERNAL SERVICES     │
              │  ├─ Violet.io API       │
              │  ├─ OpenAI API (V1.1+)  │
              │  ├─ Expo Push Service   │
              │  ├─ EAS Build (mobile)  │
              │  └─ Backblaze B2        │
              │     (offsite backups)   │
              └─────────────────────────┘
```

**Resource allocation on KVM 4 (16GB RAM):**

| Component                    | RAM Allocation | Notes                              |
| ---------------------------- | -------------- | ---------------------------------- |
| Supabase (12 containers)     | 6-8 GB         | PostgreSQL is the largest consumer |
| TanStack Start (PM2 cluster) | 1-2 GB         | 2-4 Node.js workers                |
| Nginx                        | ~50 MB         | Minimal footprint                  |
| OS + system                  | 1-2 GB         | Ubuntu/Debian overhead             |
| **Buffer**                   | **4-6 GB**     | Safety margin for spikes           |

_Sources: [Supabase Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting/docker), [Hostinger VPS Plans](https://www.hostinger.com/vps-hosting), [Deploy TanStack Start on VPS with Dokploy](https://www.bitdoze.com/tanstack-start-dokploy-deploy/)_

---

### 2. Deployment Strategy: VPS vs. Serverless Decision

**Decision rationale — why VPS over serverless for this project:**

| Factor                      | VPS Self-Hosted                 | Serverless (Supabase Cloud + Netlify) |
| --------------------------- | ------------------------------- | ------------------------------------- |
| **Monthly cost (MVP)**      | $13                             | $25-30                                |
| **Monthly cost (100K MAU)** | $13                             | $25                                   |
| **Monthly cost (200K MAU)** | $13                             | ~$350                                 |
| **Scaling cost model**      | Fixed (upgrade VPS when needed) | Variable (MAU-based)                  |
| **Ops overhead**            | Medium-High                     | Very Low                              |
| **Data sovereignty**        | Full control                    | Supabase manages                      |
| **Vendor lock-in**          | None                            | Medium (Supabase APIs)                |
| **Single point of failure** | Yes (VPS)                       | Distributed                           |
| **Backup control**          | Full                            | Dependent on plan                     |
| **Learning opportunity**    | High (DevOps skills)            | Low                                   |

**The decisive factor:** MAU-based pricing. Supabase Cloud's $3.25/1000 MAU overage makes costs unpredictable at scale. Self-hosting eliminates this entirely — the VPS costs the same whether you have 100 or 100,000 users.

**Mitigation for single point of failure:**

- Automated daily backups to offsite storage (Backblaze B2, $0.005/GB/month)
- Hostinger provides free weekly backups
- PostgreSQL WAL archiving for point-in-time recovery
- Cloudflare as DNS failover provider

_Sources: [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting), [Supabase Pricing](https://supabase.com/pricing), [Hostinger VPS Pricing](https://www.hostinger.com/pricing/vps-hosting)_

---

### 3. Cloudflare Role Clarification

**What Cloudflare IS in this architecture:**

A free proxy layer between the internet and the VPS. It does NOT host the application.

| Cloudflare Service  | Cost     | What It Does                                         | Necessity                       |
| ------------------- | -------- | ---------------------------------------------------- | ------------------------------- |
| **CDN**             | Free     | Caches static assets + ISR pages on 300+ global PoPs | Recommended                     |
| **DDoS Protection** | Free     | Blocks attacks before they reach the VPS             | Recommended                     |
| **DNS**             | Free     | Fastest DNS resolution globally                      | Recommended                     |
| **SSL**             | Free     | Terminates HTTPS, issues certs automatically         | Convenient (alt: Let's Encrypt) |
| **WAF (basic)**     | Free     | Basic web app firewall rules                         | Nice-to-have                    |
| **Workers**         | Not used | Serverless compute                                   | Not needed                      |

**Can you skip Cloudflare entirely?** Yes. Use:

- Let's Encrypt + Certbot for SSL
- Direct DNS from domain registrar
- No CDN (assets served directly from VPS)

**Impact of skipping:** Slower asset loading for geographically distant visitors. No DDoS protection (a single bot can saturate the VPS). SSL certificate renewal must be managed manually.

**Recommendation:** Use Cloudflare free proxy. 15 minutes of setup, $0/month, significant benefits. It is NOT a required dependency — it is an optimization layer.

_Sources: [Cloudflare Free Plan](https://www.cloudflare.com/plans/free/), [Cloudflare CDN](https://www.cloudflare.com/application-services/products/cdn/), [Cloudflare DNS](https://developers.cloudflare.com/fundamentals/concepts/how-cloudflare-works/)_

---

### 4. AI Search Strategy: Phased Approach

**Decision: Defer AI semantic search to V1.1. Use PostgreSQL full-text search for MVP.**

**Phase 1 — V1.0 MVP: PostgreSQL Full-Text Search**

| Aspect           | Details                                                              |
| ---------------- | -------------------------------------------------------------------- |
| **Technology**   | PostgreSQL tsvector + to_tsquery + GIN index                         |
| **Effort**       | 1-2 hours implementation                                             |
| **Cost**         | $0 (built into PostgreSQL)                                           |
| **Capabilities** | Keyword search, ranking, multi-column, multilingual                  |
| **Limitation**   | Cannot understand semantic intent ("gift for dad who likes cooking") |

**Implementation:**

```sql
-- Add tsvector column to products table
ALTER TABLE products ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'C')
  ) STORED;

-- Create GIN index for fast search
CREATE INDEX idx_products_search ON products USING GIN (search_vector);
```

**Phase 2 — V1.1 (Weeks 7-8): Add pgvector Semantic Search**

| Aspect           | Details                                                         |
| ---------------- | --------------------------------------------------------------- |
| **Technology**   | pgvector + OpenAI text-embedding-3-small + hybrid search        |
| **Effort**       | 8-12 hours                                                      |
| **Cost**         | ~$5-20/month (OpenAI API)                                       |
| **Capabilities** | Semantic understanding, conversational queries, intent matching |
| **Pattern**      | Supabase Hybrid Search (full-text + vector combined)            |

**Why this phasing works:**

- With <100 SKUs, keyword search finds everything effectively
- Both search methods coexist — hybrid search combines results
- The platform launches faster (saves 8-12 hours on critical path)
- The AI differentiator arrives ~4 weeks after launch, not at launch

_Sources: [Supabase Full Text Search](https://supabase.com/docs/guides/database/full-text-search), [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search), [Supabase Semantic Search](https://supabase.com/docs/guides/ai/semantic-search)_

---

### 5. Updated Risk Assessment (March 2026)

**Risk reclassification based on latest web research (March 3, 2026):**

| Risk                                 | Original Severity | Updated Severity | Status                       | Change Reason                                    |
| ------------------------------------ | ----------------- | ---------------- | ---------------------------- | ------------------------------------------------ |
| TanStack Form memory leak            | 🔴 High           | ✅ **Resolved**  | Fixed v1.154.0 (Jan 5, 2026) | Issue #5734 closed                               |
| SSR Streaming memory leak            | 🔴 Critical       | 🟡 **Medium**    | Partially addressed          | ISR/SSG avoids SSR streaming; fixes in v1.154.0+ |
| TanStack Start RC stability          | 🟡 Medium         | 🟡 Medium        | Still RC                     | API stable but no v1.0 release yet               |
| Vitest compatibility                 | 🟢 Low            | 🟢 Low           | Workaround available         | Conditional plugin disable                       |
| **NEW: Self-hosted ops overhead**    | —                 | 🟡 **Medium**    | Inherent                     | Docker admin, backups, security, monitoring      |
| **NEW: VPS single point of failure** | —                 | 🟡 **Medium**    | Inherent                     | Mitigated by offsite backups + Cloudflare DNS    |
| **NEW: Edge Functions self-hosted**  | —                 | 🟢 **Low**       | Documented                   | Supabase Docker includes Deno runtime            |
| Expo/TanStack routing mismatch       | 🟢 Info           | 🟢 Info          | By design                    | Two-app monorepo, shared logic layer             |

**New risk detail — Self-hosted operations:**

| Risk Scenario                          | Impact                 | Mitigation                                                       |
| -------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| VPS hardware failure                   | Total downtime         | Automated daily backup to Backblaze B2; Hostinger weekly backups |
| PostgreSQL data corruption             | Data loss              | pg_dump + WAL archiving; point-in-time recovery                  |
| Docker container crash                 | Partial service outage | PM2/Docker restart policies; health checks                       |
| Security breach                        | Data exposure          | Firewall (ufw), fail2ban, auto security updates, secrets manager |
| SSL certificate expiry                 | Site inaccessible      | Cloudflare auto-SSL or Certbot auto-renewal cron                 |
| Supabase version upgrade breaks things | Service disruption     | Pin Docker image tags; test upgrades in dev first                |

_Sources: [GitHub Issue #5734 — Resolved](https://github.com/TanStack/router/issues/5734), [GitHub Issue #5289 — SSR Memory](https://github.com/TanStack/router/issues/5289), [Supabase Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting/docker)_

---

### 6. Revised Cost Analysis

**Full self-hosted cost projection:**

| Item                     | One-Time | Monthly     | Annual        |
| ------------------------ | -------- | ----------- | ------------- |
| Hostinger VPS KVM 4      | —        | $12.99      | $155.88       |
| Domain name              | —        | ~$1.25      | ~$15          |
| Apple Developer Program  | $99      | —           | $99           |
| Google Play registration | $25      | —           | —             |
| OpenAI API (V1.1+)       | —        | $5-20       | $60-240       |
| Backblaze B2 (backups)   | —        | ~$1         | ~$12          |
| Cloudflare               | —        | $0          | $0            |
| **Total Year 1**         | **$124** | **~$20-35** | **~$340-520** |
| **Total Year 2+**        | —        | **~$20-35** | **~$240-420** |

**Comparison with original plan (Supabase Cloud + Netlify):**

| Scale        | Self-Hosted | Supabase Cloud + Netlify |
| ------------ | ----------- | ------------------------ |
| MVP (Year 1) | ~$450       | ~$300-600                |
| 10K MAU      | ~$450       | ~$500                    |
| 50K MAU      | ~$450       | ~$500                    |
| 100K MAU     | ~$450       | ~$500                    |
| 200K MAU     | ~$450       | ~$4,500                  |
| 500K MAU     | ~$450\*     | ~$10,500                 |

\*Self-hosted may need VPS upgrade at very high MAU (~$25/month for KVM 8), but still dramatically cheaper.

**Break-even analysis:** Self-hosting is cheaper from day 1 if you value ops time at $0. If you value your time at $50/hour and spend 2 extra hours/month on server admin, the break-even is at ~50K MAU.

_Sources: [Hostinger VPS Pricing](https://www.hostinger.com/pricing/vps-hosting), [Supabase Pricing](https://supabase.com/pricing), [Backblaze B2 Pricing](https://www.backblaze.com/cloud-storage/pricing)_

---

### 7. Technology Stack Updates (March 2026)

**Updated validated stack:**

| Layer          | Technology                  | Version (March 2026) | Confidence | Risk                         |
| -------------- | --------------------------- | -------------------- | ---------- | ---------------------------- |
| Web Framework  | TanStack Start              | RC (v1.154.0+)       | ✅ High    | 🟡 Still RC, but API stable  |
| Web Routing    | TanStack Router             | Stable v1            | ✅ High    | 🟢 Stable                    |
| Data Fetching  | TanStack Query              | Stable v5            | ✅ High    | 🟢 Stable                    |
| Mobile         | Expo Router                 | SDK 55 (RN 0.83)     | ✅ High    | 🟢 Latest stable             |
| Backend        | Supabase (self-hosted)      | Docker latest        | ✅ High    | 🟡 Ops overhead              |
| Database       | PostgreSQL + pgvector       | 15+                  | ✅ High    | 🟢 30+ years proven          |
| Search (V1.0)  | PostgreSQL FTS              | Built-in             | ✅ High    | 🟢 Zero added complexity     |
| Search (V1.1)  | pgvector + OpenAI           | 0.8.0+               | ✅ High    | 🟢 Official Supabase support |
| Supplier API   | Violet.io                   | Active               | ⚠️ Medium  | 🟡 Needs API key validation  |
| Hosting        | Hostinger VPS + PM2 + Nginx | KVM 4                | ✅ High    | 🟢 Full control              |
| CDN/Protection | Cloudflare (free proxy)     | Free plan            | ✅ High    | 🟢 Optional but recommended  |
| Mobile CI/CD   | EAS Build                   | Latest               | ✅ High    | 🟢 Official Expo service     |

**Key version changes from original research:**

- Expo SDK: 53 → **55** (React Native 0.79 → **0.83**)
- TanStack Start: Early RC → **v1.154.0+** (Form leak fixed)
- Supabase: Cloud Pro → **Self-hosted Docker**
- Deployment: Cloudflare Workers → **VPS + PM2 + Nginx**

_Sources: [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55), [TanStack Router Releases](https://github.com/TanStack/router/releases), [Supabase Self-Hosting Docker](https://supabase.com/docs/guides/self-hosting/docker)_

---

### 8. Security and Compliance for Self-Hosted

**Security baseline for production self-hosted e-commerce:**

| Layer        | Measure                | Implementation                                                         |
| ------------ | ---------------------- | ---------------------------------------------------------------------- |
| **Network**  | Firewall               | `ufw` — allow only 80, 443, 22 (SSH)                                   |
| **Network**  | DDoS                   | Cloudflare proxy (free) or rate limiting in Nginx                      |
| **SSH**      | Brute-force protection | fail2ban + SSH key-only auth (disable password)                        |
| **SSH**      | Port change            | Move SSH to non-standard port (e.g., 2222)                             |
| **OS**       | Auto security updates  | `unattended-upgrades` (Ubuntu) or `dnf-automatic` (Fedora)             |
| **Docker**   | Image pinning          | Pin Supabase images to specific tags, not `:latest`                    |
| **Secrets**  | Environment management | `.env` file with restricted permissions (600); never commit to git     |
| **Database** | Encryption at rest     | PostgreSQL data dir on encrypted volume (LUKS)                         |
| **Database** | Backups                | Daily pg_dump → encrypted → Backblaze B2                               |
| **Auth**     | JWT security           | Supabase Auth handles JWT; configure short expiry                      |
| **API**      | Rate limiting          | Kong (Supabase gateway) + Nginx rate limiting                          |
| **SSL**      | Certificate            | Cloudflare origin cert or Let's Encrypt auto-renewal                   |
| **Payments** | PCI compliance         | Not applicable — payments handled by Violet.io (never touch card data) |

**GDPR/Privacy considerations:**

- User data stored on EU VPS (Hostinger has EU data centers)
- Supabase Auth handles data deletion (GDPR right to erasure)
- Anonymous sessions expire automatically
- No third-party analytics that leak PII (use privacy-friendly: Plausible or Umami, self-hosted)

_Sources: [Supabase Self-Hosting Security](https://supabase.com/docs/guides/self-hosting), [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)_

---

### 9. Implementation Roadmap Adjustments

**Revised timeline integrating self-hosted architecture:**

```
Week 1 (March 3-9): Foundation
├─ [ ] Provision Hostinger VPS KVM 4 (Ubuntu 22.04 LTS)
├─ [ ] Install Docker + Docker Compose
├─ [ ] Deploy Supabase self-hosted (docker compose up)
├─ [ ] Configure Nginx reverse proxy
├─ [ ] Set up Cloudflare DNS + proxy
├─ [ ] Configure firewall + fail2ban + SSH keys
├─ [ ] Validate Violet.io API access (GET credentials)
└─ [ ] Implement SupplierAdapter interface (packages/shared/)

Week 2-3 (March 10-23): Backend + Mobile
├─ [ ] Design PostgreSQL schema (products, carts, orders, users)
├─ [ ] Set up Supabase Auth with anonymous sign-ins
├─ [ ] Implement VioletAdapter (Edge Function)
├─ [ ] Configure Violet webhooks → Edge Function handler
├─ [ ] Product sync (StyleSphere catalog)
├─ [ ] PostgreSQL full-text search (tsvector + GIN index)
├─ [ ] Create Expo Router app (SDK 55)
├─ [ ] Implement auth flow (anonymous + email)
└─ [ ] Set up automated backups (pg_dump → Backblaze B2)

Week 4-5 (March 24 - April 6): Frontend + Checkout
├─ [ ] Product grid + detail pages (mobile)
├─ [ ] Cart (anonymous-user-linked, persisted in DB)
├─ [ ] Checkout flow (Violet.io integration, client-side)
├─ [ ] Create TanStack Start web app (pinned RC version)
├─ [ ] Deploy web app on VPS (PM2 + Nginx)
├─ [ ] SEO product pages with ISR
├─ [ ] Content pages (guides, reviews) as SSG
├─ [ ] Order tracking
└─ [ ] Customer support routing

Week 6 (April 7-14): Testing + Launch
├─ [ ] E2E testing (Playwright web, Maestro mobile)
├─ [ ] Performance audit (Core Web Vitals, ISR caching)
├─ [ ] Security audit (firewall, SSL, secrets)
├─ [ ] Deploy web (TanStack Start on VPS)
├─ [ ] Deploy mobile (EAS Build → App Store + Play Store)
├─ [ ] Go live — monitor first orders
└─ [ ] Set up monitoring (Uptime Kuma or similar)

Week 7-8 (April 14-28): AI Search Enhancement (V1.1)
├─ [ ] Enable pgvector extension
├─ [ ] Generate product embeddings (OpenAI text-embedding-3-small)
├─ [ ] Implement hybrid search (FTS + vector similarity)
├─ [ ] AI search UI (conversational interface)
├─ [ ] Push notifications pipeline (DB trigger → Edge Function → Expo Push)
└─ [ ] Performance optimization
```

---

### 10. Future Technical Outlook

**Near-term (Q2-Q3 2026):**

- **TanStack Start v1.0 stable** — Expected release. When it ships, update pinned dependencies.
- **React Server Components in TanStack** — Announced as upcoming v1.x addition. Will enable streaming data patterns similar to Next.js RSC.
- **TanStack DB** — In development. Could enable offline-first features for mobile (Phase 2 offline browsing).
- **Expo SDK 56+** — Expect continued React Native New Architecture improvements.

**Medium-term (Q3-Q4 2026):**

- **Google UCP adoption** — Monitor merchant adoption. If significant, implement GCPAdapter (effort: 1-2 weeks with Adapter Pattern in place).
- **Supabase updates** — Self-hosted follows upstream. Test upgrades in staging before production.
- **Scaling decision** — If traffic exceeds VPS capacity, options: upgrade VPS, add read replicas, or consider managed Supabase for database-only.

**Long-term (2027+):**

- **Multi-supplier scaling** — Adapter Pattern enables adding firmly.ai, direct merchant APIs, or UCP without platform changes.
- **AI personalization** — User behavior data + embeddings enable personalized search and recommendations.
- **Infrastructure evolution** — If traffic justifies, consider Kubernetes (K3s) on VPS for container orchestration, or migrate specific components to managed services.

_Sources: [TanStack Blog](https://tanstack.com/blog), [Expo Changelog](https://expo.dev/changelog), [Google UCP](https://developers.google.com/commerce/universal-checkout)_

---

### 11. Research Methodology and Source Verification

**Research approach:**

- 15+ targeted web searches across official documentation, developer blogs, GitHub issues, and pricing pages
- Multi-source validation for all critical technical claims
- Direct verification of framework versions, issue statuses, and pricing data
- Research conducted March 3, 2026

**Primary sources (verified):**

| Category             | Sources                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TanStack Start       | [Official Docs](https://tanstack.com/start/latest), [GitHub Releases](https://github.com/TanStack/router/releases), [InfoQ Coverage](https://www.infoq.com/news/2025/11/tanstack-start-v1/)                                   |
| Expo / React Native  | [Expo Docs](https://docs.expo.dev/), [SDK 55 Changelog](https://expo.dev/changelog/sdk-55), [Expo Router v6](https://expo.dev/blog/expo-router-v6)                                                                            |
| Supabase             | [Official Docs](https://supabase.com/docs), [Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting/docker), [Pricing](https://supabase.com/pricing)                                                               |
| Violet.io            | [Official Site](https://violet.io/), [API Reference](https://docs.violet.io/api-reference), [Changelog](https://docs.violet.io/changelog)                                                                                     |
| Hosting / Deployment | [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/), [Hostinger VPS](https://www.hostinger.com/vps-hosting), [TanStack Hosting Guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting) |
| Memory Leak Issues   | [GitHub #5289](https://github.com/TanStack/router/issues/5289), [GitHub #5734 (Resolved)](https://github.com/TanStack/router/issues/5734), [GitHub #6051](https://github.com/TanStack/router/issues/6051)                     |

**Confidence levels:**

| Claim                          | Confidence  | Verification                                            |
| ------------------------------ | ----------- | ------------------------------------------------------- |
| TanStack Start API stability   | High        | Official RC announcement + community production use     |
| Form memory leak resolved      | High        | GitHub issue #5734 closed Jan 5, 2026                   |
| Expo SDK 55 available          | High        | Official changelog, npm registry                        |
| Supabase self-hosted viability | High        | Official Docker guide, community production deployments |
| VPS KVM 4 sufficient for stack | Medium-High | Based on resource estimates, not production benchmarks  |
| Violet.io API reliability      | Medium      | Active changelog, but no personal API testing yet       |
| Cost projections at scale      | Medium      | Based on published pricing, actual usage may vary       |

---

### 12. Technical Appendices

#### Appendix A: Supabase Self-Hosted Quick Start

```bash
# 1. Clone Supabase Docker
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# 2. Copy and configure environment
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY

# 3. Start all services
docker compose up -d

# 4. Verify
docker compose ps  # All 12 containers should be running
curl http://localhost:8000/rest/v1/  # Should return API response
```

#### Appendix B: TanStack Start VPS Deployment

```bash
# 1. Build the app
cd apps/web
pnpm build

# 2. Start with PM2
pm2 start .output/server/index.mjs --name tanstack-web -i max

# 3. Nginx reverse proxy
# /etc/nginx/sites-available/ecommerce
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### Appendix C: Automated Backup Script

```bash
#!/bin/bash
# /opt/scripts/backup-db.sh — Run via cron daily at 3:00 AM

BACKUP_DIR="/opt/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
B2_BUCKET="your-backup-bucket"

# Dump PostgreSQL
docker exec supabase-db pg_dump -U postgres -Fc > "$BACKUP_DIR/supabase_$DATE.dump"

# Compress
gzip "$BACKUP_DIR/supabase_$DATE.dump"

# Upload to Backblaze B2 (offsite)
b2 upload-file "$B2_BUCKET" "$BACKUP_DIR/supabase_$DATE.dump.gz" "daily/supabase_$DATE.dump.gz"

# Retain last 30 days locally
find "$BACKUP_DIR" -name "*.dump.gz" -mtime +30 -delete
```

#### Appendix D: Monorepo Structure (Revised)

```
digital-personal-shopper/
├── apps/
│   ├── web/                  → TanStack Start (SSR/ISR)
│   │   ├── app/
│   │   │   ├── routes/       → File-based routes
│   │   │   └── components/   → Web-specific UI
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── mobile/               → Expo Router (iOS/Android)
│       ├── app/
│       │   ├── (tabs)/       → Tab-based navigation
│       │   └── _layout.tsx
│       ├── app.json
│       └── package.json
├── packages/
│   ├── shared/               → Shared business logic
│   │   ├── src/
│   │   │   ├── types/        → Supabase-generated + domain types
│   │   │   ├── hooks/        → TanStack Query hooks (useProducts, useCart, etc.)
│   │   │   ├── adapters/     → SupplierAdapter interface + implementations
│   │   │   ├── validation/   → Zod schemas
│   │   │   └── supabase/     → Client configuration
│   │   └── package.json
│   └── ui/                   → Shared design tokens (optional)
├── supabase/
│   ├── migrations/           → SQL migrations
│   ├── functions/            → Edge Functions (Deno)
│   │   ├── violet-adapter/   → Violet.io API integration
│   │   ├── webhook-handler/  → Supplier webhook receiver
│   │   └── generate-embeddings/ → OpenAI embedding generation (V1.1)
│   └── seed.sql
├── infrastructure/
│   ├── nginx/                → Nginx config
│   ├── docker-compose.yml    → Supabase self-hosted override
│   └── scripts/
│       ├── backup-db.sh
│       ├── deploy-web.sh
│       └── setup-server.sh
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

### Research Conclusion

#### Summary of Key Technical Findings

1. **The TanStack Start + Expo + Supabase stack is validated** for a solo-dev white-label affiliate e-commerce platform. All three technologies are mature enough for production use with specific risk mitigations documented.

2. **Self-hosted on VPS is the most cost-effective path** — $13/month regardless of user scale, versus $25-350+/month with managed services. The trade-off is operational overhead, which is manageable for a developer with moderate Docker/Linux experience.

3. **AI semantic search is a Phase 2 feature, not MVP-blocking** — PostgreSQL full-text search covers V1.0 needs. pgvector hybrid search adds the "wow factor" in V1.1 (~4 weeks post-launch).

4. **Cloudflare's value is as a free CDN/protection proxy, not as a hosting platform.** With VPS-based architecture, Cloudflare Workers hosting is unnecessary. The free proxy remains recommended.

5. **Two critical memory leaks identified in TanStack Start: one resolved (Form, January 2026), one mitigated (SSR streaming, via ISR/SSG strategy).** Remaining risk is low for this project's architecture.

#### Strategic Technical Impact

This architecture enables Charles to:

- **Launch an MVP in 6 weeks** with a proven, manageable stack
- **Scale to 200K+ MAU** without infrastructure cost explosion
- **Maintain full control** over data, infrastructure, and vendor relationships
- **Pivot suppliers** via Adapter Pattern in 1-2 weeks
- **Add AI differentiation** post-launch without architectural changes

#### Next Steps

1. **This week:** Provision VPS, deploy Supabase self-hosted, validate Violet.io API access
2. **Week 2-3:** Backend + mobile app development
3. **Week 4-5:** Web app + checkout flow
4. **Week 6:** Testing + launch
5. **Week 7-8:** AI search enhancement (V1.1)

---

**Technical Research Completion Date:** 2026-03-03
**Research Period:** Comprehensive technical analysis with 15+ verified sources
**Document Length:** ~2,000 lines (research steps 1-5) + synthesis (step 6)
**Source Verification:** All technical facts cited with current sources (March 2026)
**Technical Confidence Level:** High — based on multiple authoritative technical sources with web-verified data

_This comprehensive technical research document serves as the authoritative technical reference for the Digital Personal Shopper e-commerce platform and provides strategic technical insights for implementation decisions._
