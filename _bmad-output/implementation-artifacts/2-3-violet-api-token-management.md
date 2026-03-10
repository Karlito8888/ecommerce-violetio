# Story 2.3: Violet API Token Management (Server-Side)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want automated Violet API token lifecycle management on the server,
So that commerce API calls always have valid authentication without user impact.

## Acceptance Criteria

1. **Given** the server environment has `VIOLET_APP_ID`, `VIOLET_APP_SECRET`, and Violet account credentials (`VIOLET_USERNAME`, `VIOLET_PASSWORD`)
   **When** a commerce API call is needed
   **Then** the server authenticates via `POST /login` with `X-Violet-App-Id` and `X-Violet-App-Secret` headers + body `{ username, password }`

2. **And** the JWT `token` and `refresh_token` are stored securely server-side (never exposed to client)

3. **And** token refresh is triggered proactively **5 minutes before expiry** (24h token lifetime → refresh at ~23h55m)

4. **And** if refresh fails, a full re-login is attempted automatically

5. **And** zero user-facing errors from expired tokens (NFR28)

6. **And** web: token management lives in `apps/web/src/server/violetAuth.ts` (Server Function module)

7. **And** Edge Functions can access Violet tokens via a shared utility or environment variables

8. **And** all Violet API calls include `X-Violet-Token`, `X-Violet-App-Id`, `X-Violet-App-Secret` headers

## Tasks / Subtasks

- [x] Task 1: Create Violet auth types in shared package (AC: 1, 2, 8)
  - [x] Create `packages/shared/src/types/violet.types.ts` with `VioletAuthConfig`, `VioletTokenData`, `VioletLoginResponse`, `VioletAuthHeaders` types
  - [x] Export from `packages/shared/src/types/index.ts`

- [x] Task 2: Create Violet auth client in shared package (AC: 1, 2, 3, 4, 5)
  - [x] Create `packages/shared/src/clients/violetAuth.ts` — pure logic module (no framework dependency)
  - [x] Implement `violetLogin(config: VioletAuthConfig)` — calls `POST {VIOLET_API_BASE}/login` with `X-Violet-App-Id` + `X-Violet-App-Secret` headers, body `{ username, password }`
  - [x] Implement `violetRefreshToken(refreshToken, config)` — calls `POST {VIOLET_API_BASE}/auth/token` with `X-Violet-App-Id` + `X-Violet-App-Secret` headers, body `{ refresh_token }`
  - [x] Implement `VioletTokenManager` class — singleton pattern, manages token state (token, refreshToken, expiresAt), handles proactive refresh (5 min before 24h expiry), auto-fallback to full re-login on refresh failure
  - [x] `getValidToken()` method — returns a valid `token` string: checks expiry, refreshes proactively, re-logins as last resort. Returns `ApiResponse<string>` shape.
  - [x] `getAuthHeaders()` method — returns `{ "X-Violet-Token": token, "X-Violet-App-Id": appId, "X-Violet-App-Secret": appSecret }` ready to spread into fetch calls
  - [x] Token expiry tracked by storing login timestamp + 24h offset (Violet tokens have 24h lifetime; the JWT `exp` claim can also be decoded if needed, but timestamp tracking is simpler and sufficient)
  - [x] Export from `packages/shared/src/clients/index.ts`

- [x] Task 3: Create web Server Function module (AC: 6, 8)
  - [x] Create `apps/web/src/server/violetAuth.ts` — creates `VioletTokenManager` instance configured from env vars (`VIOLET_APP_ID`, `VIOLET_APP_SECRET`, `VIOLET_USERNAME`, `VIOLET_PASSWORD`, `VIOLET_API_BASE`)
  - [x] Export `getVioletHeaders()` Server Function using `createServerFn` from `@tanstack/react-start` — calls `tokenManager.getAuthHeaders()` and returns headers
  - [x] Export `ensureVioletAuth()` helper for other Server Functions to call before making Violet API requests
  - [x] Handle missing env vars gracefully: return `{ data: null, error: { code: "VIOLET.CONFIG_MISSING", message } }` instead of crashing

- [x] Task 4: Create Edge Function utility for Violet auth (AC: 7, 8)
  - [x] Create `supabase/functions/_shared/violetAuth.ts` — Deno-compatible Violet token manager using `Deno.env.get()` for config
  - [x] Same `VioletTokenManager` logic but adapted for Deno runtime (use global `fetch`, `Deno.env`)
  - [x] Export `getVioletHeaders()` function for use by Edge Functions (search-products, handle-webhook, etc.)
  - [x] Note: Edge Functions run independently — each cold start may need a fresh login. Token can be cached in-memory for warm invocations.

- [x] Task 5: Add environment variables configuration (AC: 1)
  - [x] Add `VIOLET_APP_ID`, `VIOLET_APP_SECRET`, `VIOLET_USERNAME`, `VIOLET_PASSWORD`, `VIOLET_API_BASE` to `apps/web/.env.example`
  - [x] Add same variables to `supabase/.env.example` (or document in README)
  - [x] Update `.env` files locally (not committed — .gitignore already excludes .env)
  - [x] Verify `VIOLET_API_BASE` defaults: `https://sandbox-api.violet.io/v1` for dev, `https://api.violet.io/v1` for production

- [x] Task 6: Tests (AC: 1–8)
  - [x] Unit test `violetLogin()` — mock fetch, verify correct endpoint/headers/body, verify token extraction from response
  - [x] Unit test `violetRefreshToken()` — mock fetch, verify refresh endpoint call, verify new token extraction
  - [x] Unit test `VioletTokenManager.getValidToken()` — test fresh login on first call, cached token on subsequent calls, proactive refresh at 23h55m, fallback to re-login on refresh failure
  - [x] Unit test `VioletTokenManager.getAuthHeaders()` — verify correct header shape
  - [x] Unit test error scenarios: network failure, invalid credentials (401), rate limit (429), missing env vars
  - [x] Integration test (optional, requires Violet sandbox): full login → get token → refresh flow against sandbox API

## Dev Notes

### Critical Implementation Details

#### Violet API Authentication Flow

The Violet API uses a **dual-layer auth** model:

1. **App-level credentials** (per-request headers): `X-Violet-App-Id` + `X-Violet-App-Secret` — these go on EVERY API call
2. **User-level JWT** (from login): `X-Violet-Token` — obtained via `POST /login`, expires in 24h, refreshable

**Login endpoint:**
```
POST https://sandbox-api.violet.io/v1/login
Headers:
  X-Violet-App-Id: 11371
  X-Violet-App-Secret: <secret>
  Content-Type: application/json
Body:
  { "username": "owner@email.com", "password": "password" }
```

**Response** (success):
```json
{
  "id": "...",
  "email": "...",
  "token": "eyJ...",
  "refresh_token": "...",
  "type": "...",
  "verified": true,
  "status": "...",
  "roles": [...]
}
```

**Refresh endpoint:**
```
POST https://sandbox-api.violet.io/v1/auth/token
Headers:
  X-Violet-App-Id: 11371
  X-Violet-App-Secret: <secret>
  Content-Type: application/json
Body:
  { "refresh_token": "<refresh_token_value>" }
```

**Authenticated API call headers:**
```typescript
{
  "X-Violet-Token": "<jwt_token>",
  "X-Violet-App-Id": "11371",
  "X-Violet-App-Secret": "<secret>",
  "Content-Type": "application/json"
}
```

#### Token Lifecycle Strategy

```
Cold start → violetLogin() → store { token, refreshToken, loginTimestamp }
                ↓
API call → getValidToken() → check: (now - loginTimestamp) < (24h - 5min)?
                ↓ YES                           ↓ NO
         return cached token        → violetRefreshToken(refreshToken)
                                          ↓ SUCCESS          ↓ FAILURE
                                    update token/ts    → violetLogin() (full re-auth)
                                                          ↓ SUCCESS     ↓ FAILURE
                                                       update all   → return error
```

#### CRITICAL: Never Expose to Client

- `VioletTokenManager` is server-side ONLY
- The `token`, `refreshToken`, and `VIOLET_APP_SECRET` must NEVER appear in client bundles
- Web: use Server Functions (`createServerFn`) — TanStack Start strips server code from client bundle
- Mobile: API calls go through Edge Functions which handle Violet auth internally

### Relevant Architecture Patterns and Constraints

1. **Server Function pattern (Source: architecture.md §Communication Patterns)**
   - TanStack Start `createServerFn()` for web-only server-side operations
   - Server Functions live in `apps/web/src/server/` — auto-stripped from client bundle
   - Return `{ data, error }` shape (ApiResponse type from `@ecommerce/shared`)

2. **Edge Function pattern (Source: architecture.md §Communication Patterns)**
   - Supabase Edge Functions in `supabase/functions/` — Deno runtime
   - Each function is a folder with `index.ts`
   - Shared utilities in `supabase/functions/_shared/`
   - Use `Deno.env.get()` for environment variables

3. **Dual Auth Layer (Source: architecture.md §Authentication & Security)**
   - Supabase Auth = user sessions (JWT, RLS, anonymous)
   - Violet Auth = commerce API tokens (server-side only, 24h expiry)
   - Both must coordinate for authorized commerce operations
   - Violet tokens managed by Server Functions + Edge Functions, never by client

4. **Error Handling (Source: architecture.md §Process Patterns)**
   - Error codes: `VIOLET.AUTH_FAILED`, `VIOLET.TOKEN_EXPIRED`, `VIOLET.CONFIG_MISSING`
   - Try/catch → return `{ data: null, error: { code, message } }`
   - Never expose technical details to user-facing errors

5. **Naming Conventions (Source: architecture.md §Naming Conventions)**
   - Files: `violetAuth.ts` (camelCase)
   - Constants: `VIOLET_API_BASE`, `TOKEN_REFRESH_BUFFER_MS` (UPPER_SNAKE_CASE)
   - Types: `VioletAuthConfig`, `VioletTokenData` (PascalCase)
   - Server Function names: `getVioletHeaders`, `ensureVioletAuth` (camelCase, verb+Noun)

6. **Singleton Pattern for Token Manager**
   - Web: single `VioletTokenManager` instance per server process (Node.js long-lived)
   - Edge Functions: per-invocation instance (cold start = fresh login, warm = cached in module scope)

### Source Tree Components to Touch

```
packages/shared/src/types/violet.types.ts     # NEW — Violet auth types
packages/shared/src/types/index.ts            # MODIFY — export violet types
packages/shared/src/clients/violetAuth.ts     # NEW — VioletTokenManager, login, refresh
packages/shared/src/clients/index.ts          # MODIFY — export violet auth functions

apps/web/src/server/violetAuth.ts             # NEW — Server Function wrapper, env config
apps/web/.env.example                         # MODIFY — add Violet env vars

supabase/functions/_shared/violetAuth.ts      # NEW — Deno-compatible violet auth utility

packages/shared/src/__tests__/violetAuth.test.ts  # NEW — unit tests for token manager
```

**Do NOT touch:**
- `packages/shared/src/clients/auth.ts` — this is Supabase user auth, not Violet
- `packages/shared/src/clients/supabase.ts` — Supabase client, unrelated
- `apps/web/src/server/authInit.ts` — Supabase anonymous session init
- `packages/shared/src/adapters/supplierAdapter.ts` — interface only, no implementation yet (Story 3.1)
- Any client-side code (routes, components, hooks) — this is server-side only

### Testing Standards Summary

1. **Unit Tests (Vitest):**
   - Mock `fetch` globally for Violet API calls
   - Test `violetLogin()` with mock success/failure responses
   - Test `VioletTokenManager` state machine: fresh login → cached → proactive refresh → re-login fallback
   - Test error mapping for all failure modes (network, 401, 429, missing config)
   - Test `getAuthHeaders()` output shape

2. **Integration Tests (optional, against Violet sandbox):**
   - Full login cycle with real sandbox credentials
   - Skip in CI (same pattern as Supabase integration tests from Stories 2.1/2.2)
   - Guard with `VIOLET_APP_SECRET` env var check

3. **Manual Testing:**
   - Verify env vars load correctly in dev server
   - Call `getVioletHeaders()` from a test route/console
   - Verify token never appears in client-side network requests (DevTools → Network tab)

### Project Structure Notes

- **Alignment with unified structure:**
  - `apps/web/src/server/violetAuth.ts` matches architecture.md file tree (`apps/web/app/server/violetAuth.ts` in architecture uses `app/` but actual codebase uses `src/` — same variance noted in Story 2.2)
  - `packages/shared/src/clients/violetAuth.ts` extends the existing auth client pattern
  - `supabase/functions/_shared/` is the standard Supabase Edge Function shared utilities directory

- **Detected variances / clarifications:**
  - Architecture.md shows `apps/web/app/server/` but actual codebase uses `apps/web/src/server/` — use `src/` (matches existing `authInit.ts`)
  - The epics file says "Edge Functions access Violet tokens via environment variables or a shared token service" — we implement the shared token service approach (more robust than raw env vars for tokens)

### Story 2.2 Learnings (Previous Story Intelligence)

From the Story 2.2 implementation and code review:

1. **Bun workspace mock strategy (CRITICAL for tests):**
   - ✅ `vi.mock('@ecommerce/shared')` — correct level to mock for web tests
   - For Violet auth tests, mock `fetch` directly since `violetAuth.ts` uses raw `fetch`

2. **Web server directory**: `apps/web/src/server/` already exists with `authInit.ts` — new `violetAuth.ts` follows same pattern

3. **Error mapping pattern**: Story 2.2 established `mapAuthError()` in `@ecommerce/shared` — follow the same centralized error mapping approach for Violet errors

4. **Code review findings to avoid:**
   - Always create `_layout.tsx` for new Expo Router directories — NOT APPLICABLE (server-side only story)
   - Use `<Link>` not `<a href>` — NOT APPLICABLE (no UI)
   - Centralize error mapping — APPLICABLE: put Violet error mapping in shared package

5. **Integration tests skip in CI**: Pattern established — guard with env var existence check. Use same pattern for Violet sandbox tests.

### Git Intelligence (Recent Commits)

- `464f42f` — Story 2.2: user registration & login with email verification
- `982e101` — CI fix: conditional React aliases + skip integration tests
- `60ff7bd` — ESLint fix: no-console warnings suppressed
- `8b8149e` — Story 2.1: full auth setup (anonymous sessions, RLS, dual-platform)

**Patterns observed:**
- Server-side code lives in `apps/web/src/server/` (not `app/server/`)
- Integration tests are skipped in CI (guarded by env var check)
- `@ecommerce/shared` is the central place for reusable logic and types
- Existing client pattern: functions accept optional `client` param for testability

### Latest Technology Information

1. **Violet.io API Authentication (2026):**
   - Login: `POST /v1/login` with `X-Violet-App-Id` + `X-Violet-App-Secret` headers
   - Body: `{ "username": "owner@email.com", "password": "password" }`
   - Only the app **owner's** credentials work (not other dashboard users)
   - Response includes `token` (JWT, 24h) and `refresh_token`
   - Refresh: `POST /v1/auth/token` with `{ "refresh_token": "..." }` body
   - All API calls need 3 headers: `X-Violet-Token`, `X-Violet-App-Id`, `X-Violet-App-Secret`
   - Sandbox base URL: `https://sandbox-api.violet.io/v1`
   - Production base URL: `https://api.violet.io/v1`
   - Ref: [Violet Auth Docs](https://docs.violet.io/getting-started/authentication/overview)

2. **TanStack Start Server Functions (v1):**
   - Use `createServerFn()` from `@tanstack/react-start`
   - Server code is automatically tree-shaken from client bundle
   - Can access `process.env` for server-side env vars
   - Ref: [TanStack Start Server Functions](https://tanstack.com/start/latest/docs/framework/react/server-functions)

3. **Supabase Edge Functions Shared Utils:**
   - `supabase/functions/_shared/` is the convention for shared Deno code
   - Import with relative paths: `import { ... } from '../_shared/violetAuth.ts'`
   - Use `Deno.env.get('VAR_NAME')` for env vars
   - Edge Functions have 2s CPU / 10MB bundle limits — keep token management lightweight

### References

- [Violet API Auth — Login](https://docs.violet.io/api-reference/auth/login) — POST /login endpoint
- [Violet API Auth — Refresh Token](https://docs.violet.io/api-reference/login/refresh-token) — POST /auth/token endpoint
- [Violet Auth Overview](https://docs.violet.io/getting-started/authentication/overview) — Auth concepts and flow
- [Architecture §Authentication](../planning-artifacts/architecture.md#authentication--security) — Dual auth layer decision
- [Architecture §Communication Patterns](../planning-artifacts/architecture.md#communication-patterns) — Server Function vs Edge Function rule
- [Architecture §File Structure](../planning-artifacts/architecture.md#file-structure) — `violetAuth.ts` placement
- [NFR28 — Token Refresh Transparency](../planning-artifacts/prd.md) — Zero user-facing errors from expired tokens
- [Story 2.2](./2-2-user-registration-login.md) — Previous story learnings (test patterns, error mapping)
- [VIOLET_QUICK_REFERENCE.md](../../docs/VIOLET_QUICK_REFERENCE.md) — App ID: 11371, credentials info
- [violet-io-integration-guide.md](../../docs/violet-io-integration-guide.md) — Full integration context

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No issues encountered during implementation.

### Completion Notes List

- **Task 1**: Created `VioletAuthConfig`, `VioletTokenData`, `VioletLoginResponse`, `VioletAuthHeaders` types in `packages/shared/src/types/violet.types.ts`. Exported via barrel index.
- **Task 2**: Implemented `violetLogin()`, `violetRefreshToken()`, and `VioletTokenManager` class in `packages/shared/src/clients/violetAuth.ts`. Token lifecycle: cold login → cache → proactive refresh (5 min before 24h expiry) → re-login fallback. All functions return `ApiResponse<T>` with proper error codes (`VIOLET.AUTH_FAILED`, `VIOLET.RATE_LIMITED`, `VIOLET.NETWORK_ERROR`).
- **Task 3**: Created `apps/web/src/server/violetAuth.ts` with `createServerFn()` from `@tanstack/react-start`. Singleton `VioletTokenManager` instance per server process. Graceful `VIOLET.CONFIG_MISSING` error on missing env vars. Both `getVioletHeaders()` (Server Function) and `ensureVioletAuth()` (helper) exported.
- **Task 4**: Created `supabase/functions/_shared/violetAuth.ts` — self-contained Deno-compatible version with `Deno.env.get()`. Module-scoped singleton for warm invocation reuse. Types duplicated locally (Edge Functions can't import from `@ecommerce/shared`).
- **Task 5**: Added `VIOLET_USERNAME` and `VIOLET_PASSWORD` to root `.env.example`. Created `apps/web/.env.example` and `supabase/.env.example` with all 5 Violet env vars. Fixed `VIOLET_API_BASE` to include `/v1` path.
- **Task 6**: 16 unit tests covering: login (endpoint, headers, body, success, 401, 429, network error, timestamp), refresh (endpoint, success, failure), VioletTokenManager (fresh login, caching, proactive refresh at 23h55m, re-login fallback, dual failure, getAuthHeaders shape, getAuthHeaders error).

### Change Log

- 2026-03-10: Story 2.3 implemented — Violet API token lifecycle management (server-side). 6 tasks completed, 16 unit tests added. All quality checks pass.
- 2026-03-10: Code review fixes — H1: Added concurrent call deduplication (pendingToken pattern) in VioletTokenManager (shared + Edge Function). H2: Added resetTokenManager() for singleton recovery. M1: Added SYNC markers between shared and Edge Function. M2: Fixed misleading JSDoc on ensureVioletAuth(). M3: Added 4 new tests (concurrent dedup, ensureVioletAuth config missing/success, resetTokenManager recovery). Total: 20 tests.

### File List

- `packages/shared/src/types/violet.types.ts` — NEW: Violet auth type definitions
- `packages/shared/src/types/index.ts` — MODIFIED: Added violet type exports
- `packages/shared/src/clients/violetAuth.ts` — NEW: VioletTokenManager, violetLogin, violetRefreshToken
- `packages/shared/src/clients/index.ts` — MODIFIED: Added violet auth exports
- `apps/web/src/server/violetAuth.ts` — NEW: Server Function wrapper with env config
- `apps/web/.env.example` — NEW: Web app environment variables template
- `supabase/functions/_shared/violetAuth.ts` — NEW: Deno-compatible Violet auth utility
- `supabase/.env.example` — NEW: Edge Functions environment variables template
- `.env.example` — MODIFIED: Added VIOLET_USERNAME, VIOLET_PASSWORD, fixed VIOLET_API_BASE
- `apps/web/src/__tests__/violetAuth.test.ts` — NEW: 16 unit tests for Violet auth
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED: Story status updated
