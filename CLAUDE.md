# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

E-commerce monorepo for a curated shopping platform powered by Violet.io (multi-merchant affiliate commerce API). Dual-platform: web (TanStack Start) + mobile (Expo Router), with Supabase backend and AI-powered product search.

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
  mobile/       # Expo SDK 55, expo-router, React Native 0.83.2
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

- **Framework**: Expo SDK 55, expo-router ~55.0.4
- **Navigation**: File-based with `_layout.tsx` pattern, tab navigation
- **Key constraint**: Expo pins exact versions for react (19.2.0), react-native (0.83.2), reanimated (4.2.1) — never bump these independently of the SDK
- **Path alias**: `@/*` resolves to `./src/*`, `@/assets/*` to `./assets/*`

### Shared TypeScript Config

`tsconfig.base.json` at root: strict mode, ESNext modules, bundler resolution, ES2022 target. Both apps extend it.

### External Services

- **Violet.io**: Multi-merchant commerce API (products, cart, checkout, orders)
- **Supabase**: PostgreSQL + Auth + Edge Functions + Realtime + Storage
- **Stripe**: Payment processing via Violet-provided payment intents
- **OpenAI**: Embeddings for semantic product search (pgvector)

## Documentation Access

### Violet.io (API principale)

**Index de la documentation** : `/home/charles/Documents/Obsidian Vault/External Docs/Violet.io - API Reference Index.md`

Ce fichier contient la table des matières complète de la doc Violet.io avec les URLs directes. Workflow :

1. **Lire l'index** dans le vault Obsidian pour identifier les pages pertinentes
2. **Fetch la page** via `WebFetch("https://docs.violet.io/{path}")` pour obtenir la doc à jour
3. Ne jamais coder contre l'API Violet sans avoir consulté la doc officielle

Sections clés :

- Auth : `concepts/overview.md` (tokens, refresh, environments)
- Catalog : `prism/catalog/offers.md`, `skus.md`, `collections.md`
- Checkout : `prism/checkout-guides/` (cart lifecycle, bags, shipping, payment)
- Payments : `prism/payments/` (Stripe integration, transfers, payouts)
- Webhooks : `prism/webhooks/` (events, simulation, headers)
- API Reference : `api-reference/` (endpoints détaillés)

### Autres docs

- **Supabase, Expo, TanStack, React** : utiliser le MCP **Context7** (`resolve-library-id` → `query-docs`)
- **Docs niche non couvertes** : `WebFetch` / `WebSearch` en dernier recours

### BMAD Framework

Project management artifacts live in `_bmad-output/`:

- `planning-artifacts/` — PRD, architecture, epics, UX spec, research
- `implementation-artifacts/` — story files, sprint-status.yaml

Sprint stories are tracked in `sprint-status.yaml`. Story files use format `{epic#}-{story#}-{slug}.md`.

## Code Style

- **Prettier**: double quotes, semicolons, trailing commas, 100 char width
- **ESLint**: flat config (eslint.config.js), typescript-eslint recommended, `no-console: warn`, `no-debugger: error`
- **Unused vars**: prefix with `_` to suppress warnings (both args and vars)
- **Mobile exception**: `@typescript-eslint/no-require-imports` is off for `apps/mobile/`

## Key Constraints

- **No Tailwind CSS** — architectural decision. Use Vanilla CSS + BEM exclusively
- **Expo version pinning** — never update react, react-native, or reanimated versions without an Expo SDK upgrade
- Deferred major bumps: `vite-tsconfig-paths` v5->v6, `vitest` v3->v4 (need dedicated testing)
- All commits use conventional format with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
