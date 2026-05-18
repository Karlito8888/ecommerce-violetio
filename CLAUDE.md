# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

E-commerce monorepo for a curated shopping platform powered by Violet.io (multi-merchant affiliate commerce API). Dual-platform: web (TanStack Start) + mobile (Expo Router), sharing a **single backend** (TanStack Start API Routes + Convex self-hosted). Convex provides the reactive database, auth, functions, and webhook processing — all self-hosted via the precompiled Rust binary (no Docker, no cloud).

> **Migration en cours** : Le projet migre de Supabase vers Convex. Le guide complet est dans [`MIGRATION-SUPABASE-TO-CONVEX.md`](./MIGRATION-SUPABASE-TO-CONVEX.md). Consulter ce fichier **avant** toute modification du backend.

## Commands

```bash
# Development
bun run dev              # Start web app (TanStack Start on port 3000)
bun run dev:mobile       # Start Expo mobile app
bun run build            # Build web app

# Convex
npx convex dev           # Start Convex backend (local, binaire Rust auto-téléchargé)
npx convex deploy        # Deploy Convex functions to self-hosted backend
npx convex dashboard     # Open Convex dashboard in browser
npx convex env set KEY VALUE  # Set environment variable

# Quality checks
bun run check           # Full gate: format + lint + typecheck + test (run before committing)
bun run fix-all          # Prettier format + ESLint fix + TypeScript check (auto-fix + verify)
bun run lint             # ESLint only (--max-warnings 0)
bun run lint:fix         # ESLint with auto-fix
bun run format           # Prettier check only
bun run format:fix       # Prettier write
bun run typecheck        # TypeScript check (web + mobile)

# Tests (web + shared)
bun run test             # Run all vitest suites
bun --cwd=apps/web run test    # Web tests only
bun --cwd=packages/shared run test  # Shared tests only
```

## Architecture

### Monorepo Structure (Bun workspaces)

```
apps/
  web/          # TanStack Start (Vite-based SSR), file-based routing
  mobile/       # Expo SDK 55, expo-router, React Native 0.83.6
packages/
  shared/       # @ecommerce/shared — business logic, types, hooks
  ui/           # @ecommerce/ui — design tokens, cross-platform components
  config/       # @ecommerce/config — shared configuration
convex/         # Convex backend — schema, functions, auth, webhooks, crons
```

Packages are consumed as `workspace:*` dependencies with direct TypeScript source imports (no build step for packages).

### Web App (apps/web)

- **Framework**: TanStack Start v1 with `tanstackStart()` Vite plugin (NOT Vinxi)
- **Routing**: File-based via `@tanstack/react-router`. Route tree auto-generated in `routeTree.gen.ts`
- **Router config**: `src/router.tsx` — scroll restoration, intent-based preloading, ConvexProvider + ConvexQueryClient
- **Root layout**: `src/routes/__root.tsx` — HTML shell, theme init script, Header/Footer, ConvexAuthProvider
- **Path aliases**: `#/*` and `@/*` both resolve to `./src/*`
- **Styling**: Vanilla CSS + BEM naming (NO Tailwind, NO CSS-in-JS). One allowed external library for badges/notifications only

### CSS Architecture (apps/web/src/styles/)

```
index.css          # Entry point — ordered @imports
tokens.css         # Design tokens (CSS custom properties), fonts, dark theme
base.css           # Reset, body styles, decorative pseudo-elements
utilities.css      # .sr-only, .page-wrap, .display-title, animations
components/*.css   # BEM blocks: header, footer, chip, island, nav-link, etc.
pages/*.css        # Page-specific BEM blocks: home, about, etc.
```

Import order matters: tokens -> base -> utilities -> components -> pages.

BEM convention: `.block__element--modifier` (e.g., `.site-header__nav`, `.hero__title--accent`).

### Mobile App (apps/mobile)

- **Framework**: Expo SDK 55, expo-router ~55.0.13
- **Navigation**: File-based with `_layout.tsx` pattern, tab navigation
- **Key constraint**: Expo pins exact versions for react (19.2.0), react-native (0.83.6), reanimated (4.2.1) — never bump these independently of the SDK
- **Root overrides**: react/react-dom pinned to 19.2.0 at monorepo root to prevent Bun from resolving mismatched versions
- **Path alias**: `@/*` resolves to `./src/*`, `@/assets/*` to `./assets/*`
- **API calls**: E-commerce data (orders, wishlist, profile, etc.) goes through Convex client directly. Violet API calls (products, cart, checkout) still go through web backend API Routes via `EXPO_PUBLIC_API_URL`.

### Shared TypeScript Config

`tsconfig.base.json` at root: strict mode, ESNext modules, bundler resolution, ES2022 target. Both apps extend it.

### Backend Architecture (Convex Self-Hosted + TanStack Start)

The backend has two complementary layers:

1. **Convex** (self-hosted, binaire Rust) — database, auth, reactive queries, mutations, actions, HTTP actions (webhooks), cron jobs, file storage
2. **TanStack Start Server Functions** — Violet API calls requiring secrets (`VIOLET_APP_SECRET`), product catalog, cart/checkout orchestration, Stripe payment flows

Both web and mobile share the **same Convex backend** — no separate mobile API layer.

- **Web frontend** → Convex client (reactive queries) + TanStack Start server functions (Violet API)
- **Mobile app** → Convex client (reactive queries) + `EXPO_PUBLIC_API_URL` → TanStack Start API Routes (Violet API only)

### Convex Self-Hosted

- **Pas de cloud, pas de Docker** — le backend Convex tourne via le binaire Rust précompilé (`convex-local-backend`), téléchargé automatiquement par `npx convex dev`
- **Dev** : `npx convex dev` → backend sur `localhost:3210`, dashboard auto
- **Prod** : binaire Rust + systemd + Caddy (reverse proxy + TLS + dashboard statique)
- **Dashboard** : build statique Next.js (9.5 MB) servi par Caddy sur `dash.maisonemile.com`
- **Configuration client** : `skipConvexDeploymentUrlCheck: true` requis (URL non-standard)
- **Guide complet** : `MIGRATION-SUPABASE-TO-CONVEX.md` §4

### Auth Architecture (Convex Auth + localId)

- **Convex Auth** (`@convex-dev/auth`) : email/password, Google OAuth, Apple OAuth
- **Visiteurs anonymes** : modèle **localId** — `crypto.randomUUID()` dans localStorage/SecureStore. Pas de session serveur. Les données (wishlist, tracking) sont associées au localId, migrées vers le userId Convex Auth à l'inscription via `migrateAnonymousData()`.
- **Admin** : `userProfiles.isAdmin` vérifié applicativement dans chaque query/mutation admin via `assertAdmin()`
- **Violet.io** : aucun concept d'utilisateur côté Channel — le panier et le checkout fonctionnent sans identité utilisateur

### Realtime & Webhook Data Flow

All Violet webhook events are processed by a **Convex HTTP Action** (`convex/webhooks/violet.ts`), which persists results in Convex tables (orders, order_bags, order_items, order_refunds, merchants, order_distributions, order_transfers, merchant_payout_accounts). Both platforms read from the **same Convex tables**.

**Realtime** : Convex queries are **reactive by default** — no manual WebSocket subscriptions needed. When data changes (via mutation), all connected clients are notified automatically.

- **Web**: `useQuery(api.orders.queries.getOrders)` — auto-reactive, no Realtime setup
- **Mobile**: Same Convex queries — auto-reactive

Guest order tracking (`/order/lookup`) remains one-shot fetch (transient lookup by token/email, no Realtime needed).

### External Services

- **Violet.io**: Multi-merchant commerce API (products, cart, checkout, orders) — called exclusively from server-side (TanStack Start server functions or Convex actions) via `VioletTokenManager` + `violetAdapter`
- **Convex**: Reactive database + Auth (Convex Auth + localId) + Functions (queries/mutations/actions) + HTTP Actions (webhook processing) + Cron Jobs + File Storage — **self-hosted via binaire Rust**
- **Stripe**: Payment processing via Violet-provided payment intents

## Documentation Access

### Priorité de consultation (ordre obligatoire)

1. **`/home/charles/Documents/Documentations Officielles`** — dossier local de docs officielles. **Toujours consulter en premier** avant toute autre source.
2. **Skill `crawl4ai`** (`/home/charles/.agents/skills/crawl4ai/SKILL.md`) — utiliser ce skill pour explorer les docs officielles locales en profondeur avant toute implémentation.
3. **Skill `find-docs`** (`/home/charles/.agents/skills/find-docs/SKILL.md`) — utiliser ce skill pour localiser et récupérer des docs externes si la doc locale est absente ou insuffisante.

### Violet.io (API principale)

**Documentation locale** : `/home/charles/Documents/Documentations Officielles/violet-io.md`

Ne jamais coder contre l'API Violet sans avoir consulté ce fichier.

### Convex (backend)

**Documentation locale** : `docs/convex.md`

Contient : schema, queries, mutations, actions, auth, HTTP actions, self-hosting, TanStack Start, React Native, File Storage, Cron, Tests.

**Toujours consulter** avant d'implémenter une fonction Convex, modifier le schéma, configurer l'auth, etc.

### Guide de migration

**`MIGRATION-SUPABASE-TO-CONVEX.md`** (à la racine) — guide complet de la migration Supabase → Convex self-hosted. Contient : vue d'ensemble, résolutions Violet.io, architecture self-hosted, 11 phases détaillées, cartographie Supabase→Convex, risques.

### Environment Variables

Single source of truth: `.env.example` at repo root. Copy to `.env.local` and fill in values.
Do NOT create additional `.env.*.example` files.

Key env vars by app:
- **Web** (`apps/web`): `VITE_CONVEX_URL` (Convex backend URL), `VIOLET_APP_ID`, `VIOLET_APP_SECRET`, `VIOLET_USERNAME`, `VIOLET_PASSWORD`, `VIOLET_API_BASE`, Stripe keys
- **Mobile** (`apps/mobile`): `EXPO_PUBLIC_CONVEX_URL` (Convex backend URL — `http://10.0.2.2:3210` Android emulator, `http://localhost:3210` iOS, `https://api.maisonemile.com` prod), `EXPO_PUBLIC_API_URL` (web backend for Violet API — `http://10.0.2.2:3000` Android, `http://localhost:3000` iOS)
- **Convex** (env vars dans le backend): `VIOLET_APP_ID`, `VIOLET_APP_SECRET`, `VIOLET_USERNAME`, `VIOLET_PASSWORD`, `VIOLET_API_BASE`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `SUPPORT_EMAIL`, `WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`

Convex env vars are set via `npx convex env set KEY VALUE` or the local dashboard.

## Code Style

- **Prettier**: double quotes, semicolons, trailing commas, 100 char width
- **ESLint**: flat config (eslint.config.js), typescript-eslint recommended, `no-console: warn`, `no-debugger: error`
- **Unused vars**: prefix with `_` to suppress warnings (both args and vars)
- **Mobile exception**: `@typescript-eslint/no-require-imports` is off for `apps/mobile/`

## Key Constraints

- **No Tailwind CSS** — architectural decision. Use Vanilla CSS + BEM exclusively
- **Expo version pinning** — never update react, react-native, or reanimated versions without an Expo SDK upgrade
- Deferred major bumps: `vite-tsconfig-paths` v5->v6, `vitest` v3->v4 (need dedicated testing)
- **Single backend for both platforms** — mobile uses Convex client directly for data, TanStack Start API Routes for Violet API calls only
- **Convex self-hosted only** — never use Convex Cloud or Docker. Binaire Rust + systemd + Caddy for production
- **skipConvexDeploymentUrlCheck** — always set to `true` on ConvexReactClient (self-hosted URL)
- **DRY/KISS** — Convex eliminates Supabase complexity (no RLS, no SQL migrations, no manual Realtime). Don't reintroduce it. Factor patterns in `convex/lib/`.
- **Web + Mobile + Tests per phase** — each migration phase must be validated on both platforms with passing tests before moving to the next. See `MIGRATION-SUPABASE-TO-CONVEX.md` methodology section.
- All commits use conventional format with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
