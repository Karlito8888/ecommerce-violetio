# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Code Mode Specific Rules (Non-Obvious Only)

### Testing Implementation
- **NEVER use `@testing-library/react`** — causes Bun workspace CJS dual-instance issue
- Use `createRoot` from `react-dom/client` directly: `act(() => createRoot(container).render(element))`
- Shared package tests MUST run via `vitest run`, not `bun test` (Bun's runner lacks Vitest APIs)
- Web uses Vitest 3, shared uses Vitest 4 — different versions, different capabilities

### Supabase Client Injection (Critical for Web)
- Web app MUST call `_setSupabaseClient(supabase)` in `__root.tsx` BEFORE any shared hooks run
- Without injection, shared hooks (wishlist, profile, etc.) use localStorage client → no session → RLS mutations fail
- Mobile apps do NOT call `_setSupabaseClient()` — localStorage is correct there
- Always check `{ error }` from Supabase calls — errors are returned, not thrown

### Violet Adapter Singleton (Performance Critical)
- Server functions MUST use `getAdapter()` singleton, never `createSupplierAdapter()` directly
- Without singleton: each function call triggers new Violet login → 100-500ms latency + rate limit risk
- Token is cached for 24h with proactive refresh 5min before expiry
- Violet passwords MUST use Unicode escape (`\uXXXX`) for special chars due to server-side bug

### Edge Functions Code Duplication
- `VioletTokenManager` logic exists in TWO places and MUST stay in sync:
  1. `packages/shared/src/clients/violetAuth.ts` (Node.js)
  2. `supabase/functions/_shared/violetAuth.ts` (Deno)
- Edge Functions cannot import from `@ecommerce/shared` — Deno runtime constraint
- Changes to token management logic MUST be applied to BOTH files

### Server Function Pattern
- TanStack Start Server Functions use `.({ data: ... })` wrapper convention
- Shared hooks expect plain function signatures — create adapter wrappers in `apps/web/src/server/`
- Example: `const fetchCart: CartFetchFn = (violetCartId) => getCartFn({ data: violetCartId });`

### Environment Variable Access (Vite 7+)
- NEVER use dynamic access like `import.meta.env[key]` — Vite 7+ static analysis fails
- Each variable must be referenced by full static key in source
- Use `getEnvVar()` helper which has static references internally

### CSS Architecture
- Import order in `apps/web/src/styles/index.css` MUST be: tokens → base → utilities → components → pages
- BEM naming required: `.block__element--modifier` (e.g., `.site-header__nav`, `.hero__title--accent`)
- No Tailwind CSS, no CSS-in-JS — Vanilla CSS only

### Package Imports
- Workspace packages use direct TypeScript source imports: `import { X } from "@ecommerce/shared"`
- No build step for packages — source is imported directly
- Path aliases: `#/*` and `@/*` both resolve to `./src/*` in web app

### Error Handling
- Supabase: check `{ error }` property, never assume success
- Violet: check `ApiResponse<T>` type — `{ data: T | null, error: ApiError | null }`
- Never ignore error properties — failures masquerade as "not found" otherwise

### Cookie Management
- Cart ID stored in HttpOnly cookie `violet_cart_id` (30 days)
- Use `getCookie()` and `setCookie()` from `@tanstack/react-start/server`
- Root route loader reads cookie server-side to hydrate CartProvider without client round-trip
