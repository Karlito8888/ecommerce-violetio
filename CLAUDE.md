# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

E-commerce monorepo for a curated shopping platform powered by Violet.io (multi-merchant affiliate commerce API). Dual-platform: web (TanStack Start) + mobile (Expo Router), sharing a **single backend** (TanStack Start API Routes). Supabase provides auth + database + webhook processing. AI-powered product search via OpenAI embeddings.

## Commands

```bash
# Development
bun run dev              # Start web app (TanStack Start on port 3000)
bun run dev:mobile       # Start Expo mobile app
bun run build            # Build web app

# Quality checks
bun run fix-all          # Prettier format + ESLint fix + TypeScript check (run before committing)
bun run lint             # ESLint only (--max-warnings 0)
bun run lint:fix         # ESLint with auto-fix
bun run format           # Prettier check only
bun run format:fix       # Prettier write
bun run typecheck        # TypeScript check (web + mobile)

# Tests (web only for now)
bun --cwd=apps/web run test   # Run vitest
```

## Architecture

### Monorepo Structure (Bun workspaces)

```
apps/
  web/          # TanStack Start (Vite-based SSR), file-based routing
  mobile/       # Expo SDK 55, expo-router, React Native 0.83.6
packages/
  shared/       # @ecommerce/shared — business logic, types, API clients
  ui/           # @ecommerce/ui — design tokens, cross-platform components
  config/       # @ecommerce/config — shared configuration
```

Packages are consumed as `workspace:*` dependencies with direct TypeScript source imports (no build step for packages).

### Web App (apps/web)

- **Framework**: TanStack Start v1 with `tanstackStart()` Vite plugin (NOT Vinxi)
- **Routing**: File-based via `@tanstack/react-router`. Route tree auto-generated in `routeTree.gen.ts`
- **Router config**: `src/router.tsx` — scroll restoration, intent-based preloading
- **Root layout**: `src/routes/__root.tsx` — HTML shell, theme init script, Header/Footer
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
- **API calls**: All e-commerce API calls go through web backend API Routes via `EXPO_PUBLIC_API_URL`. See `src/server/apiClient.ts` for the typed client (`apiGet`, `apiPost`, `apiPut`, `apiDelete` with auto-auth).

### Shared TypeScript Config

`tsconfig.base.json` at root: strict mode, ESNext modules, bundler resolution, ES2022 target. Both apps extend it.

### Backend Architecture (Single Backend)

Both web and mobile share the **same TanStack Start backend** — no separate mobile API layer.

- **Web frontend** → TanStack Start server functions (direct, same process)
- **Mobile app** → `EXPO_PUBLIC_API_URL` env var → TanStack Start API Routes (`apps/web/src/routes/api/...`)
- **Supabase Edge Functions** (`supabase/functions/`) — webhook processing (`handle-webhook`) + health-check **only**. NOT used as a mobile API proxy.

Mobile API client (`apps/mobile/src/server/apiClient.ts`) auto-injects `Authorization: Bearer <JWT Supabase>` via `getAuthHeaders()` for protected routes (cart, checkout, orders). Public routes (products, merchants, collections) require no auth.

Migration status: Phase 3 complete. See `audit-dual-backend.md` for details.

### External Services

- **Violet.io**: Multi-merchant commerce API (products, cart, checkout, orders) — called exclusively from web backend via `VioletTokenManager` + `violetAdapter`
- **Supabase**: PostgreSQL + Auth (anonymous + OTP) + Edge Functions (webhook processing only) + Realtime + Storage
- **Stripe**: Payment processing via Violet-provided payment intents
- **OpenAI**: Embeddings for semantic product search (pgvector)

## Documentation Access

### Priorité de consultation (ordre obligatoire)

1. **`/home/charles/Documents/Documentations Officielles`** — dossier local de docs officielles. **Toujours consulter en premier** avant toute autre source.
2. **Skill `find-docs`** (`/home/charles/.agents/skills/find-docs/SKILL.md`) — utiliser ce skill pour localiser et récupérer des docs externes si la doc locale est absente ou insuffisante.

### Violet.io (API principale)

**Documentation locale** : `/home/charles/Documents/Documentations Officielles/violet-io.md`

Ne jamais coder contre l'API Violet sans avoir consulté ce fichier.

### Environment Variables

Single source of truth: `.env.example` at repo root. Copy to `.env.local` and fill in values.
Do NOT create additional `.env.*.example` files.

Key env vars by app:
- **Web** (`apps/web`): `VIOLET_APP_ID`, `VIOLET_APP_SECRET`, `VIOLET_USERNAME`, `VIOLET_PASSWORD`, `VIOLET_API_BASE`, Supabase vars, Stripe keys
- **Mobile** (`apps/mobile`): `EXPO_PUBLIC_API_URL` (web backend URL — `http://10.0.2.2:3000` Android emulator, `http://localhost:3000` iOS, `https://maisonemile.com` prod), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (auth + direct REST only)
- **Supabase** (`supabase/`): Same Violet + Supabase vars as web (used by Edge Functions for webhooks)

## Code Style

- **Prettier**: double quotes, semicolons, trailing commas, 100 char width
- **ESLint**: flat config (eslint.config.js), typescript-eslint recommended, `no-console: warn`, `no-debugger: error`
- **Unused vars**: prefix with `_` to suppress warnings (both args and vars)
- **Mobile exception**: `@typescript-eslint/no-require-imports` is off for `apps/mobile/`

## Key Constraints

- **No Tailwind CSS** — architectural decision. Use Vanilla CSS + BEM exclusively
- **Expo version pinning** — never update react, react-native, or reanimated versions without an Expo SDK upgrade
- Deferred major bumps: `vite-tsconfig-paths` v5->v6, `vitest` v3->v4 (need dedicated testing)
- **Single backend for both platforms** — mobile calls web API Routes, NOT Supabase Edge Functions for e-commerce operations
- All commits use conventional format with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
