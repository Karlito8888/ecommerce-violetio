# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Critical Non-Obvious Patterns

### Testing (Bun workspace CJS dual-instance issue)
- **Do NOT use `@testing-library/react`** — it creates separate React module instances in Bun workspaces
- Use React DOM directly: `import { createRoot } from "react-dom/client"`
- Tests live in `__tests__/` subfolders alongside source code
- Web uses Vitest 3, shared uses Vitest 4 (version mismatch)
- Shared package MUST use `vitest run`, NOT `bun test` (Bun's native runner fails with Vitest-specific APIs)

### Supabase Client Singleton Pattern
- Shared package uses `_setSupabaseClient()` to inject external client
- Web app MUST call `_setSupabaseClient(supabase)` early in `__root.tsx` to inject cookie-based client
- Mobile apps do NOT need this (localStorage is correct there)
- Without injection, shared hooks default to localStorage-based client with no session → RLS mutations fail
- Supabase client returns errors in `{ error }` WITHOUT throwing — ignoring this causes DB failures to masquerade as "not found"

### Violet Adapter Singleton (Performance & Rate Limiting)
- `getAdapter()` in `apps/web/src/server/violetAdapter.ts` is a module-scoped singleton
- Without singleton: every server function triggers new Violet login → 100-500ms latency + rate limit risk
- Token cached for 24h with proactive refresh 5min before expiry
- Violet password MUST be escaped with Unicode escape sequences (`\uXXXX`) due to server-side bug with special chars like `!`

### Edge Functions Duplication (Deno Runtime Constraint)
- `VioletTokenManager` class is duplicated in `supabase/functions/_shared/violetAuth.ts`
- Edge Functions cannot import from `@ecommerce/shared` due to Deno runtime
- Any changes to core logic MUST be applied to BOTH files
- See `packages/shared/src/clients/violetAuth.ts` and `supabase/functions/_shared/violetAuth.ts`

### Environment Variables (Vite 7+ Static Analysis)
- Three separate `.env` files: root, apps/web, supabase
- Vite 7+ forbids dynamic access to `import.meta.env` — each variable must be referenced by full static key
- Lazy getter pattern in `getEnvVar()` satisfies Vite's static analysis while supporting Metro (React Native)

### Server Functions Convention
- TanStack Start Server Functions use `.({ data: ... })` convention
- Shared hook types expect plain function signatures — adapter functions wrap them
- Cart ID persisted in HttpOnly cookie (`violet_cart_id`, 30 days)
- Root route loader reads cookie server-side to hydrate CartProvider without client-side round-trip

### CSS Import Order
- `apps/web/src/styles/index.css` import order: tokens → base → utilities → components → pages
- BEM naming: `.block__element--modifier` (e.g., `.site-header__nav`, `.hero__title--accent`)

### Package Structure
- Packages consumed as `workspace:*` dependencies
- Direct TypeScript source imports (no build step for packages)

## Commands

```bash
# Development
bun run dev              # Web app (TanStack Start on port 3000)
bun run dev:mobile       # Expo mobile app (port 8081)
bun run dev:functions    # Supabase Edge Functions locally

# Quality checks (run before committing)
bun run fix-all          # Prettier write + ESLint fix + TypeScript check
bun run lint             # ESLint only (--max-warnings 0)
bun run lint:fix         # ESLint with auto-fix
bun run format:fix       # Prettier write
bun run typecheck        # TypeScript check (web + mobile)

# Tests
bun run test                          # All test suites (web + shared)
bun --cwd=apps/web run test           # Web tests only (Vitest 3)
bun --cwd=packages/shared run test    # Shared package tests (Vitest 4) — MUST use vitest, not bun test

# Database
supabase start                        # Start local Supabase services
supabase db reset                     # Apply migrations + seed.sql
supabase functions serve              # Serve Edge Functions locally
```

## Code Style

- Prettier: double quotes, semicolons, trailing commas, 100 char width
- ESLint: flat config, `no-console: warn`, `no-debugger: error`
- Prefix unused vars with `_` to suppress warnings (both args and vars)
- Mobile exception: `@typescript-eslint/no-require-imports` is off for `apps/mobile/`
- No Tailwind CSS — use Vanilla CSS + BEM exclusively
- Conventional commits required with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## External Documentation Access

- **Violet.io API**: Index at `/home/charles/Documents/Obsidian Vault/External Docs/Violet.io - API Reference Index.md`
- **Supabase, Expo, TanStack, React**: Use MCP Context7 (`resolve-library-id` → `query-docs`)
- **BMAD artifacts**: `_bmad-output/` contains PRD, architecture, epics, UX spec, sprint status
