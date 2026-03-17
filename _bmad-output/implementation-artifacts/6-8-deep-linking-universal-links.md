# Story 6.8: Deep Linking & Universal Links

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `apps/web/public/.well-known/apple-app-site-association` | AASA file for iOS Universal Links (JSON, no extension) |
| CREATE | `apps/web/public/.well-known/assetlinks.json` | Digital Asset Links for Android App Links |
| CREATE | `packages/shared/src/utils/deepLink.ts` | URL mapping utility: web path ↔ mobile screen mapping |
| CREATE | `apps/web/src/__tests__/deep-link.test.ts` | Unit tests for URL mapping utility |
| UPDATE | `apps/mobile/app.config.ts` | Add `ios.bundleIdentifier`, `android.package`, `associatedDomains`, `intentFilters` |
| UPDATE | `apps/mobile/src/app/_layout.tsx` | Update notification tap callback to use shared deep link mapper |
| UPDATE | `packages/shared/src/utils/index.ts` | Add deepLink exports (if barrel exists) |

---

## Story

As a **user**,
I want web URLs to open directly in the mobile app when installed, and shared app content to work on web,
So that I have seamless navigation between web and mobile.

## Acceptance Criteria

1. **Given** the mobile app is installed on a user's device
   **When** they tap a platform URL (e.g., from email, social media, or browser)
   **Then** the URL opens in the mobile app at the corresponding screen (FR43)
   **And** if the app is not installed, the URL opens normally in the web browser (graceful fallback)

2. **Given** iOS Universal Links configuration
   **When** Apple's CDN fetches `https://www.maisonemile.com/.well-known/apple-app-site-association`
   **Then** the file is valid JSON with `applinks.details[].appIDs` matching `<APPLE_TEAM_ID>.<BUNDLE_IDENTIFIER>`
   **And** the `components` array specifies paths that should open in the app: `/products/*`, `/order/*`, `/search`, `/account/*`
   **And** paths that should NOT open in the app are excluded: `/auth/*`, `/checkout/*`, `/cart`

3. **Given** Android App Links configuration
   **When** Android verifies `https://www.maisonemile.com/.well-known/assetlinks.json`
   **Then** the file contains a valid Digital Asset Links statement with `package_name` and `sha256_cert_fingerprints` matching the app's signing certificate
   **And** the `android.package` in `app.config.ts` matches the `package_name` in `assetlinks.json`

4. **Given** the Expo app configuration
   **When** `app.config.ts` is processed for a production build
   **Then** `ios.associatedDomains` includes `applinks:www.maisonemile.com`
   **And** `android.intentFilters` includes a BROWSABLE/VIEW intent for `https://www.maisonemile.com` with matching path patterns
   **And** `ios.bundleIdentifier` and `android.package` are set to production values

5. **Given** the URL-to-screen mapping utility at `packages/shared/src/utils/deepLink.ts`
   **When** a web URL is provided
   **Then** it maps correctly to the corresponding mobile screen path:
   - `/products/{id}` → `/products/{id}` (product detail)
   - `/order/{id}/confirmation` → `/order/{id}/confirmation` (order confirmation)
   - `/order/lookup` → `/order/lookup` (guest order lookup)
   - `/account/orders/{id}` → `/order/{id}/confirmation` (order detail — mapped to closest mobile equivalent)
   - `/account/wishlist` → `/wishlist` (wishlist tab)
   - `/account/profile` → `/profile` (profile tab)
   - `/search` → `/search` (search tab)
   - `/` → `/` (home)
   **And** unmapped paths fall back to opening in the browser (no crash)
   **And** query parameters are preserved (e.g., UTM tracking, search queries, tokens)

6. **Given** the push notification deep link handler (Story 6.7)
   **When** a user taps a notification
   **Then** the existing `useNotificationListeners` uses the shared deep link mapper for consistent routing
   **And** the `data.screen` field in push payloads maps to the same routes as universal links

7. **Given** deep links preserve query parameters
   **When** a URL like `https://www.maisonemile.com/order/lookup?token=abc123` opens in the app
   **Then** the `token` query parameter is available in the destination screen via `useLocalSearchParams()`

## Tasks / Subtasks

- [x] **Task 1: Shared URL mapping utility** — `packages/shared/src/utils/deepLink.ts` (AC: #5)
  - [x]1.1: Define `ROUTE_MAPPINGS` array: `{ webPattern: RegExp, mobilePath: (matches) => string }[]`
  - [x]1.2: `webUrlToMobilePath(url: string): string | null` — extracts pathname from URL, matches against patterns, returns mobile path with query params preserved, or null for unmapped paths
  - [x]1.3: `mobilePushDataToPath(data: Record<string, unknown>): string | null` — maps push notification `data.screen` + params to a mobile path (e.g., `{ screen: "order", order_id: "123" }` → `/order/123/confirmation`)
  - [x]1.4: Route mapping table (web → mobile):
    ```
    /products/:id           → /products/:id
    /order/:id/confirmation → /order/:id/confirmation
    /order/lookup           → /order/lookup
    /account/orders/:id     → /order/:id/confirmation
    /account/wishlist       → /wishlist
    /account/profile        → /profile
    /account/orders         → /profile (fallback — no orders list screen on mobile)
    /search                 → /search
    /                       → /
    ```
  - [x]1.5: Export from `packages/shared/src/utils/index.ts` (if barrel exists, otherwise note path)
  - [x]1.6: NOTE: This utility is pure TypeScript with zero dependencies — safe for both web and mobile

- [x]**Task 2: Apple Universal Links (AASA file)** — `apps/web/public/.well-known/apple-app-site-association` (AC: #2)
  - [x]2.1: Create `apps/web/public/.well-known/` directory
  - [x]2.2: Create `apple-app-site-association` (no `.json` extension — Apple requirement):
    ```json
    {
      "applinks": {
        "details": [
          {
            "appIDs": ["<APPLE_TEAM_ID>.com.maisonemile.app"],
            "components": [
              { "/": "/products/*", "comment": "Product detail pages" },
              { "/": "/order/*", "comment": "Order tracking and confirmation" },
              { "/": "/search", "comment": "Search screen" },
              { "/": "/account/*", "comment": "Account pages" },
              { "exclude": true, "/": "/auth/*", "comment": "Auth flows stay in browser" },
              { "exclude": true, "/": "/checkout/*", "comment": "Checkout stays in browser" },
              { "exclude": true, "/": "/cart", "comment": "Cart stays in browser" }
            ]
          }
        ]
      }
    }
    ```
  - [x]2.3: Use placeholder `<APPLE_TEAM_ID>` — add a TODO comment at top of file for Charles to replace with real Team ID
  - [x]2.4: NOTE: File MUST be served over HTTPS with `content-type: application/json`. Vite serves `public/` files with correct MIME types.
  - [x]2.5: NOTE: The AASA file cannot exceed 128KB uncompressed. Apple's CDN checks it at app install time.

- [x]**Task 3: Android App Links (assetlinks.json)** — `apps/web/public/.well-known/assetlinks.json` (AC: #3)
  - [x]3.1: Create `assetlinks.json`:
    ```json
    [
      {
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
          "namespace": "android_app",
          "package_name": "com.maisonemile.app",
          "sha256_cert_fingerprints": ["<SHA256_FINGERPRINT>"]
        }
      }
    ]
    ```
  - [x]3.2: Use placeholder `<SHA256_FINGERPRINT>` — add TODO comment for Charles to replace with real signing certificate fingerprint (from `eas credentials -p android`)
  - [x]3.3: NOTE: Android verification takes ~20 seconds. Must be served over HTTPS with `content-type: application/json`.

- [x]**Task 4: Update Expo app config** — `apps/mobile/app.config.ts` (AC: #4)
  - [x]4.1: Add `ios.bundleIdentifier: "com.maisonemile.app"` (placeholder — confirm with Charles)
  - [x]4.2: Add `android.package: "com.maisonemile.app"` (placeholder — confirm with Charles)
  - [x]4.3: Add `ios.associatedDomains: ["applinks:www.maisonemile.com"]`
  - [x]4.4: Add `android.intentFilters` for App Links:
    ```typescript
    android: {
      ...existingAndroidConfig,
      package: "com.maisonemile.app",
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "www.maisonemile.com",
              pathPrefix: "/products",
            },
            {
              scheme: "https",
              host: "www.maisonemile.com",
              pathPrefix: "/order",
            },
            {
              scheme: "https",
              host: "www.maisonemile.com",
              pathPrefix: "/search",
            },
            {
              scheme: "https",
              host: "www.maisonemile.com",
              pathPrefix: "/account",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    }
    ```
  - [x]4.5: Add `extra.eas.projectId` placeholder if not already present (needed for push tokens AND app links)
  - [x]4.6: NOTE: Keep existing `scheme: "mobile"` for custom URL scheme fallback (`mobile://` links)

- [x]**Task 5: Update push notification deep link handler** — `apps/mobile/src/hooks/usePushRegistration.ts` (AC: #6)
  - [x]5.1: Import `mobilePushDataToPath` from `@ecommerce/shared`
  - [x]5.2: Replace the hardcoded `if (data.screen === "order")` routing with:
    ```typescript
    const path = mobilePushDataToPath(data);
    if (path) {
      router.push(path as never);
    }
    ```
  - [x]5.3: This makes push notification routing use the same mapper as universal links, ensuring consistency
  - [x]5.4: NOTE: The existing `useNotificationListeners` callback signature stays the same — only the routing logic inside changes

- [x]**Task 6: Tests** — `apps/web/src/__tests__/deep-link.test.ts` (AC: #5, #6, #7)
  - [x]6.1: Test `webUrlToMobilePath()` for each route mapping:
    - Product detail: `https://www.maisonemile.com/products/abc123` → `/products/abc123`
    - Order confirmation: `https://www.maisonemile.com/order/xyz/confirmation` → `/order/xyz/confirmation`
    - Order lookup with token: `https://www.maisonemile.com/order/lookup?token=abc` → `/order/lookup?token=abc`
    - Account wishlist: `https://www.maisonemile.com/account/wishlist` → `/wishlist`
    - Account profile: `https://www.maisonemile.com/account/profile` → `/profile`
    - Account orders: `https://www.maisonemile.com/account/orders/oid123` → `/order/oid123/confirmation`
    - Search: `https://www.maisonemile.com/search` → `/search`
    - Home: `https://www.maisonemile.com/` → `/`
  - [x]6.2: Test unmapped paths return `null`:
    - `/auth/login` → `null`
    - `/checkout` → `null`
    - `/cart` → `null`
  - [x]6.3: Test query parameter preservation:
    - `/search?q=shoes&utm_source=email` → `/search?q=shoes&utm_source=email`
    - `/order/lookup?token=abc123` → `/order/lookup?token=abc123`
  - [x]6.4: Test `mobilePushDataToPath()`:
    - `{ screen: "order", order_id: "123" }` → `/order/123/confirmation`
    - `{ screen: "product", product_id: "abc" }` → `/products/abc`
    - `{ screen: "unknown" }` → `null`
  - [x]6.5: Follows established pattern: test pure functions, not hooks

- [x]**Task 7: Quality checks** (AC: all)
  - [x]7.1: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean)
  - [x]7.2: `bun --cwd=apps/web run test` — all tests pass
  - [x]7.3: `bun run typecheck` — 0 TypeScript errors
  - [x]7.4: Verify `.well-known` files are valid JSON (no trailing commas, correct structure)

---

## Dev Notes

### Critical Architecture Constraints

- **Expo Router handles deep linking automatically** — File-based routes become deep-linkable paths without manual configuration. No `linking` prop or `prefixes` array needed. Expo Router introspects the `app/` directory and builds the linking config at build time.

- **Separate routing systems, shared mapping logic** — Architecture confirms "No shared routing code possible" (architecture.md, risk #4). However, a shared *URL mapping utility* is valid because it operates on strings, not routing framework APIs. The utility converts web URLs to mobile paths — it doesn't import any router.

- **Static .well-known files via public/ directory** — Vite serves `apps/web/public/` at the root. Files placed in `public/.well-known/` will be served at `https://www.maisonemile.com/.well-known/`. No API route needed.

- **apple-app-site-association has NO file extension** — Apple requires the file to be named exactly `apple-app-site-association` (not `.json`). It must return `content-type: application/json`. Vite may need a custom MIME type config if it doesn't detect JSON content without the extension.

- **Placeholder values for Team ID, fingerprints, and bundle ID** — The AASA and assetlinks files contain `<APPLE_TEAM_ID>` and `<SHA256_FINGERPRINT>` placeholders. The bundle identifier `com.maisonemile.app` is a suggested convention — Charles must confirm the actual values. These CANNOT be filled in without Apple Developer / Google Play Console access.

- **`autoVerify: true` is critical for Android** — Without this flag in `intentFilters`, Android treats links as regular deep links (shows disambiguation dialog) rather than App Links (opens directly). The `autoVerify` flag triggers Android's Digital Asset Links verification at install time.

- **Checkout/auth/cart excluded from deep linking** — These flows require browser-specific state (Stripe.js, CSRF tokens, form state). Opening them in the app would create a broken experience. The AASA/assetlinks exclude patterns prevent the app from intercepting these URLs.

- **Query parameter preservation** — Both `useLocalSearchParams()` in Expo Router and `useSearch()` in TanStack Router automatically parse query parameters. The deep link utility must preserve the query string when mapping URLs.

- **No Tailwind CSS** — Web uses Vanilla CSS + BEM. Mobile uses React Native StyleSheet. No Tailwind, no NativeWind.

- **Expo SDK 55 pinning** — No new dependencies needed for this story. Deep linking uses built-in Expo Router + `expo-linking` (already included in SDK 55).

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `usePushRegistration()` | `apps/mobile/src/hooks/usePushRegistration.ts` | Push token registration + notification listener — update routing logic |
| `useNotificationListeners()` | `apps/mobile/src/hooks/usePushRegistration.ts` | Notification tap handler — replace hardcoded routing with shared mapper |
| `useLocalSearchParams()` | Expo Router built-in | Accesses deep link query parameters in mobile screens |
| `robots.txt` | `apps/web/public/robots.txt` | Already blocks `/auth/*`, `/checkout/*`, `/cart` from crawlers |
| `sitemap.xml` | `apps/web/public/sitemap.xml` | Static sitemap with product URLs — confirms public URL patterns |

### Existing Code Patterns to Follow

```typescript
// URL mapping utility pattern (pure function, zero dependencies):
export interface RouteMapping {
  /** Regex matching the web URL pathname */
  webPattern: RegExp;
  /** Function to convert regex matches to a mobile path */
  toMobilePath: (matches: RegExpMatchArray) => string;
}

export const ROUTE_MAPPINGS: RouteMapping[] = [
  {
    webPattern: /^\/products\/([^/]+)$/,
    toMobilePath: (m) => `/products/${m[1]}`,
  },
  {
    webPattern: /^\/order\/([^/]+)\/confirmation$/,
    toMobilePath: (m) => `/order/${m[1]}/confirmation`,
  },
  // ... etc
];

export function webUrlToMobilePath(url: string): string | null {
  const parsed = new URL(url, "https://www.maisonemile.com");
  const pathname = parsed.pathname;

  for (const mapping of ROUTE_MAPPINGS) {
    const matches = pathname.match(mapping.webPattern);
    if (matches) {
      const mobilePath = mapping.toMobilePath(matches);
      const query = parsed.search; // preserves ?key=value
      return query ? `${mobilePath}${query}` : mobilePath;
    }
  }

  return null; // unmapped path
}
```

```typescript
// Push data to path mapper:
export function mobilePushDataToPath(
  data: Record<string, unknown>,
): string | null {
  const screen = data.screen as string | undefined;
  if (!screen) return null;

  switch (screen) {
    case "order":
      return data.order_id ? `/order/${data.order_id}/confirmation` : null;
    case "product":
      return data.product_id ? `/products/${data.product_id}` : null;
    case "wishlist":
      return "/wishlist";
    case "search":
      return "/search";
    default:
      return null;
  }
}
```

```json
// AASA file format (apple-app-site-association):
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAMID.com.maisonemile.app"],
        "components": [
          { "/": "/products/*" },
          { "/": "/order/*" },
          { "exclude": true, "/": "/auth/*" }
        ]
      }
    ]
  }
}
```

```json
// assetlinks.json format:
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.maisonemile.app",
      "sha256_cert_fingerprints": ["AA:BB:CC:..."]
    }
  }
]
```

```typescript
// Expo app.config.ts — intentFilters pattern:
android: {
  package: "com.maisonemile.app",
  intentFilters: [
    {
      action: "VIEW",
      autoVerify: true,
      data: [
        { scheme: "https", host: "www.maisonemile.com", pathPrefix: "/products" },
      ],
      category: ["BROWSABLE", "DEFAULT"],
    },
  ],
}
```

### Previous Story Intelligence (Story 6.7)

- **Implementation sequence**: Types/utils → static files → config updates → hook updates → tests → quality checks.
- **Deep imports don't work**: Must use barrel exports via `@ecommerce/shared`. Always update barrel files.
- **`renderHook` issues in monorepo**: Test pure functions (URL mapping, push data mapping), not hooks directly.
- **Barrel exports**: Update `utils/index.ts` when adding new modules.
- **Mobile route typing**: Use `router.push("..." as never)` cast for dynamic Expo Router paths.
- **Push notification handler already exists**: `useNotificationListeners()` in `usePushRegistration.ts` — only the routing logic inside needs updating, not the hook signature.
- **Fire-and-forget pattern**: Push notification payloads include `data.screen` and entity IDs — the shared mapper should handle these.

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Recent commits: Stories 6.1-6.7 built the full personalization + notification pipeline. This story adds the cross-platform link handoff layer.
- The `usePushRegistration.ts` was recently moved from shared to mobile-only (Story 6.7 debug log) — be careful not to import shared utils that pull in RN dependencies.

### Scope Boundaries — What is NOT in this story

- **Content deep links (`/content/[slug]`)**: Content pages don't exist yet (Epic 7). The AASA/assetlinks can be updated in Story 7.1 when content routes are added.
- **Category deep links (`/category/[slug]`)**: No category route exists in the mobile app (products are browsed via search/filters). The epics mention this but there's no matching mobile screen.
- **Deferred links (app not installed)**: If the app isn't installed, the URL opens in the browser — that's the graceful fallback. No "smart banner" or "install prompt" is in scope.
- **Dynamic App Links or Firebase Dynamic Links**: Not needed. Static AASA + assetlinks files are sufficient for the current domain setup.
- **Testing on physical devices**: Deep link verification requires a production build + real domain. Local dev testing can use `npx uri-scheme` or Expo's `--tunnel` mode. Real verification is a QA concern post-deploy.
- **Custom URL scheme handling (`mobile://`)**: The existing `scheme: "mobile"` in app.config.ts already enables `mobile://` links. This story focuses on HTTPS Universal/App Links for the production domain.

### Project Structure Notes

- **New shared utility**: `packages/shared/src/utils/deepLink.ts` — pure TypeScript, zero deps
- **New static files**: `apps/web/public/.well-known/apple-app-site-association`, `assetlinks.json`
- **New tests**: `apps/web/src/__tests__/deep-link.test.ts`
- **Modified mobile config**: `apps/mobile/app.config.ts` (bundleId, package, associatedDomains, intentFilters)
- **Modified push handler**: `apps/mobile/src/hooks/usePushRegistration.ts` (use shared mapper)
- **Modified barrel**: `packages/shared/src/utils/index.ts` (add deepLink exports)

### References

- [Source: epics.md#Story 6.8 — Deep Linking & Universal Links acceptance criteria]
- [Source: architecture.md — "Separate routing systems" risk #4, "No shared routing code possible"]
- [Source: architecture.md — "Routing: Separate per platform" decision table]
- [Source: 6-7-push-notification-infrastructure-preferences.md — Previous story dev notes, push handler patterns, barrel export approach]
- [Source: Expo Docs — iOS Universal Links](https://docs.expo.dev/linking/ios-universal-links/)
- [Source: Expo Docs — Android App Links](https://docs.expo.dev/linking/android-app-links/)
- [Source: Expo Docs — Linking Overview](https://docs.expo.dev/linking/overview/)
- [Source: Expo Blog — Universal and App Links with Expo Router](https://expo.dev/blog/universal-and-app-links)
- [Source: Android Developers — Digital Asset Links](https://developer.android.com/training/app-links/configure-assetlinks)
- [Source: CLAUDE.md — No Tailwind CSS, double quotes, semicolons, 100 char width, conventional commit format]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- AASA file has no `.json` extension per Apple specification. Vite serves files from `public/` — verify MIME type is `application/json` in production.
- `XXXXXXXXXX` in AASA file is a placeholder for the Apple Team ID — must be replaced before deploying to production.
- `TODO:REPLACE_WITH_SHA256_FINGERPRINT_FROM_EAS_CREDENTIALS` in assetlinks.json — run `eas credentials -p android` to get the real fingerprint.
- `com.maisonemile.app` used as bundle identifier/package name — confirm with Charles before production build.
- Added `extra.eas.projectId` to app.config.ts — reads from `EAS_PROJECT_ID` env var (needed for both push tokens and app links verification).
- Push notification tap handler updated to use shared `mobilePushDataToPath()` — now supports order, product, wishlist, and search screens (previously only order).

### Completion Notes List

- Created `packages/shared/src/utils/deepLink.ts` — `webUrlToMobilePath()`, `mobilePushDataToPath()`, `ROUTE_MAPPINGS` array. Pure TypeScript, zero dependencies. Maps 9 web routes to mobile paths with query parameter preservation.
- Created `apps/web/public/.well-known/apple-app-site-association` — iOS Universal Links AASA file with include/exclude component rules (products, orders, account, search included; auth, checkout, cart excluded).
- Created `apps/web/public/.well-known/assetlinks.json` — Android Digital Asset Links file with `delegate_permission/common.handle_all_urls` relation.
- Created `apps/web/src/__tests__/deep-link.test.ts` — 24 tests: webUrlToMobilePath (16 tests covering all mapped routes, excluded routes, query params, edge cases) + mobilePushDataToPath (8 tests covering all screen types and missing data).
- Updated `apps/mobile/app.config.ts` — Added `ios.bundleIdentifier`, `ios.associatedDomains`, `android.package`, `android.intentFilters` (4 path prefixes with autoVerify), `extra.eas.projectId`.
- Updated `apps/mobile/src/app/_layout.tsx` — Replaced hardcoded push notification routing with shared `mobilePushDataToPath()` mapper.
- Updated `packages/shared/src/utils/index.ts` — Added deepLink barrel exports (`webUrlToMobilePath`, `mobilePushDataToPath`, `ROUTE_MAPPINGS`, `RouteMapping` type).
- All 303 web tests pass (279 existing + 24 new). `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean).

### Change Log

- 2026-03-17: Story 6.8 implementation complete — deep linking infrastructure with iOS Universal Links, Android App Links, shared URL mapper, and unified push notification routing.
- 2026-03-17: Code review fixes — AASA simplified to `/order/*` per AC #2, base URL fallback added to `webUrlToMobilePath`, `home` screen added to push mapper, tests added for malformed URLs and trailing slashes. **Note:** Push notification order tap now navigates to `/order/{id}/confirmation` (was `/order/{id}` in Story 6.7) — intentional per route mapping spec.

### File List

- `packages/shared/src/utils/deepLink.ts` (CREATE)
- `apps/web/public/.well-known/apple-app-site-association` (CREATE)
- `apps/web/public/.well-known/assetlinks.json` (CREATE)
- `apps/web/src/__tests__/deep-link.test.ts` (CREATE)
- `apps/mobile/app.config.ts` (UPDATE — added bundleIdentifier, package, associatedDomains, intentFilters, eas.projectId)
- `apps/mobile/src/app/_layout.tsx` (UPDATE — replaced hardcoded push routing with mobilePushDataToPath)
- `packages/shared/src/utils/index.ts` (UPDATE — added deepLink barrel exports)
