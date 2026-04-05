# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Ask Mode Specific Rules (Non-Obvious Only)

### Project Structure (Counterintuitive)
- `packages/` contains shared business logic, types, and adapters — consumed as workspace dependencies
- `apps/web/src/server/` contains TanStack Start server functions (NOT just API routes)
- `apps/web/src/routes/` contains file-based routing — NOT just page components
- `supabase/functions/_shared/` contains shared Edge Function code (cannot import from packages)

### Documentation Locations
- Violet.io API: Index at `/home/charles/Documents/Obsidian Vault/External Docs/Violet.io - API Reference Index.md`
- BMAD artifacts: `_bmad-output/` contains PRD, architecture, epics, UX spec, sprint status
- Project docs: `docs/` directory contains architecture, development guide, integration guides

### Hidden Dependencies
- Shared package requires `_setSupabaseClient()` injection in web app — not obvious from imports
- Violet adapter singleton `getAdapter()` required for performance — not enforced by types
- Edge Functions duplicate `VioletTokenManager` — no import relationship between files

### Environment Variable Complexity
- Three separate `.env` files: root, apps/web, supabase — each service uses different file
- Vite 7+ requires static `import.meta.env` references — dynamic access fails silently
- `getEnvVar()` helper bridges Vite and Metro (React Native) — not obvious from usage

### Testing Framework Differences
- Web uses Vitest 3, shared uses Vitest 4 — different capabilities
- Bun's native test runner fails with Vitest-specific APIs in shared package
- Tests use React DOM directly instead of `@testing-library/react` — Bun workspace constraint

### Package Import Patterns
- Workspace packages use direct TypeScript source imports: `import { X } from "@ecommerce/shared"`
- No build step for packages — source imported directly
- Path aliases: `#/*` and `@/*` both resolve to `./src/*` in web app

### Cookie Management (Hidden)
- Cart ID stored in HttpOnly cookie `violet_cart_id` — not accessible from client JavaScript
- Root route loader reads cookie server-side — hydration happens without client round-trip
- Cookie management via `@tanstack/react-start/server` utilities

### CSS Architecture
- Import order in `apps/web/src/styles/index.css` MUST be: tokens → base → utilities → components → pages
- BEM naming: `.block__element--modifier` (e.g., `.site-header__nav`, `.hero__title--accent`)
- No Tailwind CSS, no CSS-in-JS — Vanilla CSS only

### Server Function Convention
- TanStack Start Server Functions use `.({ data: ... })` wrapper convention
- Shared hooks expect plain function signatures — adapter functions wrap them
- Example: `const fetchCart: CartFetchFn = (violetCartId) => getCartFn({ data: violetCartId });`

### External Documentation Access
- **Violet.io API**: Use Obsidian index at `/home/charles/Documents/Obsidian Vault/External Docs/Violet.io - API Reference Index.md`
- **Supabase, Expo, TanStack, React**: Use MCP Context7 (`resolve-library-id` → `query-docs`)
- **BMAD artifacts**: `_bmad-output/` contains PRD, architecture, epics, UX spec, sprint status
