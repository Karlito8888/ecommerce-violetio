# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Architect Mode Specific Rules (Non-Obvious Only)

### Architectural Constraints (Hidden Coupling)
- Shared package uses singleton pattern for Supabase client via `_setSupabaseClient()` — web app MUST inject
- Violet adapter singleton `getAdapter()` required for performance — each new instance triggers login
- Edge Functions cannot import from `@ecommerce/shared` — Deno runtime constraint forces code duplication

### Code Duplication (Intentional)
- `VioletTokenManager` class duplicated in TWO locations:
  1. `packages/shared/src/clients/violetAuth.ts` (Node.js)
  2. `supabase/functions/_shared/violetAuth.ts` (Deno)
- Changes to token management logic MUST be applied to BOTH files
- TODO: Add CI check to compare core logic hash between both files

### Performance Bottlenecks
- Violet API login adds 100-500ms latency per request without singleton adapter
- Rate limiting enforced by Violet — multiple adapter instances will be throttled
- Token cached for 24h with proactive refresh 5min before expiry
- Cart ID stored in HttpOnly cookie to avoid client-side round-trip

### State Management Patterns
- Shared hooks expect plain function signatures — server functions must wrap with `.({ data: ... })`
- CartProvider hydrated server-side via root route loader reading HttpOnly cookie
- Supabase client injection required for web app — mobile apps use localStorage directly

### Monorepo Structure
- Packages consumed as `workspace:*` dependencies with direct TypeScript source imports
- No build step for packages — source imported directly
- Path aliases: `#/*` and `@/*` both resolve to `./src/*` in web app
- Web uses Vitest 3, shared uses Vitest 4 — version mismatch due to different capabilities

### Testing Architecture
- Tests do NOT use `@testing-library/react` — Bun workspace CJS dual-instance issue
- Tests use React DOM directly via `createRoot()` from `react-dom/client`
- Shared package MUST use Vitest, not Bun's native test runner (lacks Vitest-specific APIs)
- Tests live in `__tests__/` subfolders alongside source code

### Environment Variable Architecture
- Three separate `.env` files: root, apps/web, supabase — each service uses different file
- Vite 7+ static analysis requires full static key references — dynamic access fails
- `getEnvVar()` helper bridges Vite and Metro (React Native) with lazy getter pattern

### CSS Architecture
- Import order in `apps/web/src/styles/index.css` MUST be: tokens → base → utilities → components → pages
- BEM naming: `.block__element--modifier` (e.g., `.site-header__nav`, `.hero__title--accent`)
- No Tailwind CSS, no CSS-in-JS — Vanilla CSS only

### Server Function Architecture
- TanStack Start Server Functions use `.({ data: ... })` wrapper convention
- Adapter functions in `apps/web/src/server/` wrap shared hook types
- Cart ID persisted in HttpOnly cookie (`violet_cart_id`, 30 days)
- Root route loader reads cookie server-side to hydrate CartProvider

### External Service Integration
- Violet.io: Multi-merchant commerce API — requires token management, rate limiting awareness
- Supabase: PostgreSQL + Auth + Edge Functions + Realtime + Storage
- Stripe: Payment processing via Violet-provided payment intents
- OpenAI: Embeddings for semantic product search (pgvector)

### Documentation Locations
- Violet.io API: Index at `/home/charles/Documents/Obsidian Vault/External Docs/Violet.io - API Reference Index.md`
- BMAD artifacts: `_bmad-output/` contains PRD, architecture, epics, UX spec, sprint status
- Project docs: `docs/` directory contains architecture, development guide, integration guides
