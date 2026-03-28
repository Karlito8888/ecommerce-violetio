# Maison Emile — Project Overview

> Reference document for AI agents and new contributors. Last updated: 2026-03-28.

---

## Project Overview

| Field                | Value                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| **Name**             | Maison Emile E-commerce Platform                                        |
| **Purpose**          | Curated multi-merchant shopping platform with AI-powered product search |
| **Repository type**  | Monorepo (Bun 1.2.4 workspaces)                                         |
| **Commerce backend** | Violet.io (multi-merchant affiliate commerce API)                       |
| **Platforms**        | Web (SSR) + Mobile (iOS/Android)                                        |

Maison Emile is a curated shopping destination that aggregates products from multiple merchants through the Violet.io API. It provides an editorial experience on top of commodity commerce infrastructure: semantic search via OpenAI embeddings, personalized recommendations, wishlists, reviews, and a unified checkout across multiple merchant "bags" (Violet's cart model).

---

## Architecture Summary

The repository is split into six workspace packages:

### 1. `apps/web/` — Web Application

- **Framework**: TanStack Start v1.166+ (RC), Vite 7.3, React 19.2.4
- **Rendering**: SSR with file-based routing (27 route files, auto-generated `routeTree.gen.ts`)
- **Styling**: Vanilla CSS + BEM exclusively — no Tailwind, no CSS-in-JS
- **Data fetching**: TanStack Query v5 (`useSuspenseQuery`), `queryOptions` factories
- **Key routes**: home, product detail, category, cart, checkout, account, wishlist, legal, support, admin

### 2. `apps/mobile/` — Mobile Application

- **Framework**: Expo SDK 55, expo-router, React Native 0.83.2 (version-pinned)
- **Navigation**: File-based, 5 tab navigators + 6 stack navigators
- **Auth**: Biometric authentication (Expo LocalAuthentication)
- **Constraint**: React (19.2.0), React Native (0.83.2), and Reanimated (4.2.1) are pinned to Expo SDK — never bump independently

### 3. `packages/shared/` — Business Logic Package (`@ecommerce/shared`)

- Shared types, Zod schemas, TanStack Query `queryOptions` factories
- Violet.io adapter (adapter pattern for future commerce API swaps)
- Supabase client factory (platform-injectable `fetch` for SSR vs native)
- Consumed by both web and mobile with no build step (direct TS source imports)

### 4. `packages/ui/` — Design System Package (`@ecommerce/ui`)

- Design tokens only: 22 color tokens, 9-step typography scale, dual px/rem spacing
- Cross-platform primitive components
- No framework-specific styling — consumed by both web and mobile

### 5. `packages/config/` — Shared Configuration (`@ecommerce/config`)

- Shared `tsconfig.base.json` and ESLint base configs
- Both apps extend from this package

### 6. `supabase/` — Backend Infrastructure

- PostgreSQL 17 database with pgvector extension (1536-dim embeddings)
- 12 Edge Functions written in Deno v2 (proxy for Violet API calls — secrets never reach client)
- 35 migrations tracking schema evolution
- Supabase Auth: anonymous sessions by default, email + social sign-in

---

## Tech Stack Summary

| Category         | Technology                   | Version                           |
| ---------------- | ---------------------------- | --------------------------------- |
| Package Manager  | Bun                          | 1.2.4                             |
| Web Framework    | TanStack Start (RC)          | v1.166+                           |
| Web Build        | Vite                         | 7.3                               |
| Mobile Framework | Expo SDK                     | 55.0                              |
| Mobile Runtime   | React Native                 | 0.83.2 (PINNED)                   |
| React (web)      | React                        | 19.2.4                            |
| React (mobile)   | React                        | 19.2.0 (PINNED)                   |
| State / Data     | TanStack Query               | v5.90+                            |
| Validation       | Zod                          | 4.3                               |
| Database         | Supabase PostgreSQL          | 17                                |
| Auth             | Supabase Auth                | anonymous + email + social        |
| Edge Functions   | Deno                         | v2                                |
| Commerce API     | Violet.io                    | JWT auth, Cart/Bag model          |
| Payments         | Stripe Elements              | via Violet payment intents        |
| Search           | OpenAI embeddings + pgvector | text-embedding-3-small (1536-dim) |
| Styling          | Vanilla CSS + BEM            | No Tailwind                       |
| Testing          | Vitest                       | 3.0 (web), 4.0 (mobile/shared)    |
| CI/CD            | GitHub Actions               | 4 workflows                       |
| SAST             | Semgrep                      | auto-rules                        |

---

## Key Architectural Decisions

### Adapter Pattern for Commerce API

All Violet.io interactions go through an adapter layer in `packages/shared/`. The interface is designed so that Violet can be swapped for firmly.ai or Google UCP without touching application code. This is a planned future migration.

### SSR with TanStack Start

The web app uses server-side rendering for SEO and Core Web Vitals. TanStack Start (not Vinxi) provides the Vite plugin and server entry. Route loaders prefetch data server-side using the same `queryOptions` factories used client-side.

### Suspense-First Data Loading

All data fetching uses `useSuspenseQuery`. Components never handle loading/error states inline — those are delegated to `<Suspense>` and `<ErrorBoundary>` boundaries in route layouts.

### Cross-Platform `queryOptions` Factories

Query factories in `packages/shared/` accept a platform-injected `fetch` function. This allows the same query logic to run in TanStack Start loaders (Node.js fetch), browser, and React Native (native fetch) without code duplication.

### Anonymous Sessions by Default

New visitors are signed in anonymously via Supabase anonymous auth on first load. This enables cart persistence, wishlists, and personalization before the user creates an account. Accounts are upgraded (not replaced) when the user registers.

### No Global State Library

TanStack Query's cache serves as the application store. There is no Redux, Zustand, or Context-based global state for server data. Local UI state uses `useState`/`useReducer`.

### Edge Functions as API Proxy

All Violet.io API calls are routed through Supabase Edge Functions (Deno). This keeps Violet credentials server-side and allows request transformation, caching, and rate-limiting at the proxy layer. Two files are manually kept in sync between the web codebase and Deno: `violetAuth.ts` and `schemas.ts`.

---

## External Services

| Service       | Purpose                                                    | Notes                                                         |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| **Violet.io** | Multi-merchant commerce (products, cart, checkout, orders) | JWT auth, Cart/Bag model, proxied via Edge Functions          |
| **Stripe**    | Payment processing                                         | Via Violet payment intents — Stripe Elements on frontend      |
| **OpenAI**    | Semantic product search                                    | `text-embedding-3-small`, 1536 dimensions, stored in pgvector |
| **Resend**    | Transactional email                                        | Order confirmations, support replies                          |
| **Expo EAS**  | Mobile builds and OTA updates                              | iOS + Android distribution                                    |
| **Supabase**  | Database, Auth, Edge Functions, Storage, Realtime          | Self-hosted schema via migrations                             |

---

## Repository Layout

```
apps/
  web/                  # TanStack Start SSR web app
    src/
      routes/           # File-based routes (27 files)
      components/       # UI components (BEM-named)
      hooks/            # React hooks
      styles/           # Vanilla CSS (tokens -> base -> utilities -> components -> pages)
  mobile/               # Expo mobile app
    src/
      app/              # expo-router file-based routes
      components/       # React Native components
packages/
  shared/               # @ecommerce/shared — business logic
    src/
      clients/          # Supabase, Violet API clients
      hooks/            # TanStack Query queryOptions factories
      types/            # TypeScript types
      schemas/          # Zod schemas
  ui/                   # @ecommerce/ui — design tokens + primitives
  config/               # @ecommerce/config — tsconfig, eslint base
supabase/
  functions/            # 12 Deno Edge Functions
  migrations/           # 35 SQL migrations
_bmad-output/           # BMAD project management artifacts
  planning-artifacts/   # PRD, architecture, epics, UX spec
  implementation-artifacts/ # Story files, sprint-status.yaml
docs/                   # Technical documentation
```

---

## Development Workflow

```bash
# Start web dev server (port 3000)
bun run dev

# Start mobile (Expo)
bun run dev:mobile

# Before committing — format, lint, typecheck
bun run fix-all

# Run web tests
bun --cwd=apps/web run test
```

Conventional commit format is enforced. Co-author all AI-assisted commits with:

```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Links to Detailed Documentation

| Document                                                        | Content                                          |
| --------------------------------------------------------------- | ------------------------------------------------ |
| [Source Tree Analysis](./source-tree-analysis.md)               | Full file-by-file inventory                      |
| [Architecture — Web](./architecture-web.md)                     | Routing, SSR, CSS system, component patterns     |
| [Architecture — Mobile](./architecture-mobile.md)               | Navigation, native modules, auth                 |
| [Architecture — Shared Package](./architecture-shared.md)       | Query factories, adapter pattern, Zod schemas    |
| [Architecture — Supabase](./architecture-supabase.md)           | Edge Functions, RLS policies, pgvector           |
| [Data Models](./data-models-supabase.md)                        | PostgreSQL schema, all tables and relations      |
| [API Contracts — Edge Functions](./api-contracts-supabase.md)   | Endpoint signatures, request/response shapes     |
| [Component Inventory — Web](./component-inventory-web.md)       | All React components with props                  |
| [Component Inventory — Mobile](./component-inventory-mobile.md) | All React Native components with props           |
| [Integration Architecture](./integration-architecture.md)       | Violet.io adapter, Stripe flow, OpenAI pipeline  |
| [Development Guide](./development-guide.md)                     | Onboarding, local setup, contribution guidelines |
