# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Debug Mode Specific Rules (Non-Obvious Only)

### Testing Debugging
- Shared package tests: use `bun --cwd=packages/shared run test` (Vitest 4), NOT `bun test`
- Bun's native test runner lacks Vitest-specific APIs (`vi.stubGlobal`, `vi.mocked`, `vi.useFakeTimers`)
- Web tests: `bun --cwd=apps/web run test` (Vitest 3)
- Test setup in `apps/web/src/__tests__/setup.ts` enables React `act()` in jsdom environment

### Supabase Debugging
- Shared hooks use `_setSupabaseClient()` injection — verify web app calls this in `__root.tsx`
- Without injection: shared hooks use localStorage client with no session → RLS mutations fail silently
- Check `{ error }` property from Supabase calls — errors are returned, not thrown
- Supabase errors logged to `error_logs` table via `logError()` utility

### Violet API Debugging
- Verify `getAdapter()` singleton is used in server functions, not `createSupplierAdapter()`
- Each new adapter triggers Violet login → check for 100-500ms latency or rate limit errors
- Token cached for 24h with 5min proactive refresh — check `VioletTokenManager` logs
- Violet password special chars require Unicode escape (`\uXXXX`) — check `escapePasswordForViolet()`

### Edge Functions Debugging
- Edge Functions cannot import from `@ecommerce/shared` — Deno runtime constraint
- `VioletTokenManager` duplicated in `supabase/functions/_shared/violetAuth.ts` — check both files
- Serve locally: `supabase functions serve --env-file supabase/.env`
- Check Deno console output for runtime errors

### Environment Variable Debugging
- Three `.env` files: root, apps/web, supabase — verify correct file for each service
- Vite 7+ static analysis fails on dynamic `import.meta.env[key]` — use `getEnvVar()` helper
- Check `getEnvVar()` static references include all needed variables

### Cookie Debugging
- Cart ID stored in HttpOnly cookie `violet_cart_id` (30 days) — not visible to client JS
- Root route loader reads cookie server-side — verify `getCartCookieFn()` returns value
- Check `setCookie()` calls in server functions for proper cookie attributes

### Server Function Debugging
- TanStack Start Server Functions use `.({ data: ... })` convention — verify wrapper pattern
- Check adapter wrappers in `apps/web/src/server/` match shared hook type signatures
- Verify `getAdapter()` singleton is called before any Violet API operations

### Error Logging
- Use `logError()` utility from `@ecommerce/shared` for structured error logging
- Errors logged to Supabase `error_logs` table with source, error_type, message, context
- Check `error_logs` table for operational debugging

### Development Server Ports
- Web app: `http://localhost:3000` (TanStack Start)
- Mobile app: `http://localhost:8081` (Expo)
- Supabase local: `http://localhost:54321` (API), `http://localhost:54323` (Studio)
- Edge Functions: `http://localhost:54321/functions/v1/` (when serving)
