# Progress

## Status
In Progress

## Tasks

### Phase 11 Migration Audit — Research Subagent
- [x] Research TanStack Start, Expo, and React Native best practices for Phase 11
- [x] Analyze server function auth validation patterns (Supabase JWT → Convex Auth migration)
- [x] Analyze mobile Convex client setup best practices (ConvexReactClient, SecureStore, provider stack)
- [x] Analyze API client patterns for mobile (apiClient.ts auth header cohabitation)
- [x] Identify DRY/KISS anti-patterns to avoid during cleanup
- [x] Document Phase 11 specific migration priorities
- [x] Write findings to `/tmp/phase11-audit/tanstack-expo-rn-docs.md`

## Files Changed
- `/tmp/phase11-audit/tanstack-expo-rn-docs.md` — Research findings (30 findings across 6 sections)
- `/tmp/phase11-audit/fetch_all.py` — crawl4ai fetch script (for optional follow-up)
- `/tmp/phase11-audit/fetch_urllib.py` — Simple urllib fallback fetch script

## Notes
### Key Findings
1. **3 API routes still validate Supabase JWTs** — `api/cart/user.ts`, `api/cart/claim.ts`, `api/guest-order-lookup.ts`. Recommended: move cart ownership logic into Convex queries (native `ctx.auth`) rather than building Convex JWT validation in server functions.
2. **Mobile apiClient sends empty auth headers** — `getAuthHeaders()` returns `{}` after Supabase removal. Authenticated cart/order endpoints need migration.
3. **28 dead shared client files** — Zero active imports, safe to delete.
4. **39 public Convex functions lack `returns` validators** — TypeScript-only typing, no runtime validation.
5. **Project already follows best practices** for: ConvexReactClient creation (useState for RN, per-request for SSR), SecureStore token storage, provider stack ordering, self-hosted URL handling.

### Gap: crawl4ai URLs
- Could not fetch llms.txt URLs with read/write tools only (requires HTTP execution).
- Fetch scripts written to `/tmp/phase11-audit/` — can be executed by parent agent or manually.
