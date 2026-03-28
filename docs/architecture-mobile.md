# Architecture — Mobile App (`apps/mobile`)

## Executive Summary

Expo SDK 55 mobile app for **Maison Emile** — a curated shopping platform. React Native 0.83.2, expo-router ~55.0.4, with biometric authentication, push notifications, and Stripe PaymentSheet for checkout.

**Critical constraint:** `react@19.2.0`, `react-native@0.83.2`, and `react-native-reanimated@4.2.1` are version-pinned by Expo SDK 55. Never bump these independently of an Expo SDK upgrade.

---

## Technology Stack

### Runtime Dependencies (key packages)

| Package                         | Version         | Purpose                                     |
| ------------------------------- | --------------- | ------------------------------------------- |
| `expo`                          | ~55.0.5         | Core SDK                                    |
| `react`                         | 19.2.0 (PINNED) | UI framework                                |
| `react-native`                  | 0.83.2 (PINNED) | Native runtime                              |
| `expo-router`                   | ~55.0.4         | File-based routing                          |
| `react-native-reanimated`       | 4.2.1 (PINNED)  | Animations                                  |
| `@stripe/stripe-react-native`   | ^0.59.2         | PaymentSheet checkout                       |
| `expo-local-authentication`     | ~55.0.8         | Biometric auth (Face ID, Touch ID)          |
| `expo-secure-store`             | ^55.0.8         | Encrypted token storage (Keychain/Keystore) |
| `expo-notifications`            | ^55.0.12        | Push notifications                          |
| `@react-navigation/bottom-tabs` | ^7.10.1         | Tab navigation                              |
| `@ecommerce/shared`             | workspace:\*    | Business logic, API clients, types          |
| `@ecommerce/ui`                 | workspace:\*    | Design tokens, colors                       |
| `@ecommerce/config`             | workspace:\*    | Shared configuration                        |

### Dev Dependencies

`typescript ~5.9.3`, `@types/react ~19.2.14`, `vitest ^4.0.18`

---

## Architecture Pattern

Feature-based file-system routing with a shared-package data layer.

- All routing lives under `src/app/` — expo-router maps the file tree to screens.
- Business logic and API calls are delegated to `@ecommerce/shared` (never call Violet.io or Supabase directly from screen components when a shared hook or util exists).
- Violet.io is never called from the client. All Violet operations go through Supabase Edge Functions.
- `_layout.tsx` files define navigator boundaries; `[param].tsx` files define dynamic routes.

---

## Navigation Structure

```
src/app/
├── _layout.tsx              # Root layout — AuthProvider, StripeProvider, ThemeProvider
├── index.tsx                # Home tab
├── search.tsx               # Search tab
├── wishlist.tsx             # Wishlist tab (auth-only)
├── cart.tsx                 # Cart tab
├── profile.tsx              # Profile tab
├── checkout.tsx             # Checkout screen (pushed from cart)
├── explore.tsx              # Explore screen
├── auth/
│   ├── _layout.tsx          # Stack (slide_from_right, no header)
│   ├── login.tsx
│   ├── signup.tsx
│   └── verify.tsx
├── products/
│   ├── _layout.tsx          # Stack (href: null — hidden from tab bar)
│   ├── index.tsx
│   └── [productId].tsx      # Product detail
├── order/
│   ├── _layout.tsx
│   ├── lookup.tsx
│   └── [orderId]/confirmation.tsx
├── content/
│   ├── _layout.tsx
│   ├── index.tsx
│   └── [slug].tsx
├── help/
│   ├── _layout.tsx
│   ├── index.tsx
│   └── contact.tsx
├── settings/
│   ├── _layout.tsx
│   └── notifications.tsx
└── legal/
    ├── _layout.tsx
    └── [slug].tsx
```

The `products/` stack does not appear as a tab — it is registered in `app-tabs.tsx` with `href: null`. Navigation into it happens via product card presses or deep links.

---

## Component Inventory

### General (`src/components/`)

| Component                                | Description                                                        |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `AnimatedIcon` / `animated-icon.web.tsx` | Animated splash overlay; web variant uses CSS module               |
| `AppTabs` / `app-tabs.web.tsx`           | Bottom tab bar (native) / horizontal top bar (web)                 |
| `BiometricPrompt`                        | Full-screen prompt shown on app restart when biometric is enrolled |
| `BiometricToggle`                        | Settings toggle to enable/disable biometric login                  |
| `ExternalLink`                           | Wrapper around `expo-web-browser` for safe external URL opening    |
| `HintRow`                                | Labeled hint UI row                                                |
| `Skeleton`                               | Loading placeholder component                                      |
| `ThemedText`                             | Text with theme-aware color via `useTheme()`                       |
| `ThemedView`                             | View with theme-aware background                                   |
| `WebBadge`                               | Badge component (used on web target)                               |

### Product (`src/components/product/`)

| Component       | Description                              |
| --------------- | ---------------------------------------- |
| `ProductCard`   | Single product card (image, name, price) |
| `ProductDetail` | Full product detail view                 |
| `ProductList`   | Virtualized list of `ProductCard` items  |

### UI (`src/components/ui/`)

| Component     | Description                              |
| ------------- | ---------------------------------------- |
| `Collapsible` | Expandable/collapsible section container |

### Platform Splits

Files with `.web.tsx` / `.web.ts` suffix are resolved by Metro instead of the base file on web targets:

- `app-tabs.web.tsx` — horizontal nav bar instead of bottom tabs
- `animated-icon.web.tsx` — CSS-module-based animation instead of Reanimated
- `use-color-scheme.web.ts` — re-exports from `react-native` (same API, explicit split)

---

## Hooks

| Hook                       | Location                       | Description                                                        |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `useColorScheme`           | `hooks/use-color-scheme.ts`    | Re-exports RN `useColorScheme`; `.web.ts` variant available        |
| `useTheme`                 | `hooks/use-theme.ts`           | Returns `Colors[scheme]` object from `@/constants/theme`           |
| `usePushRegistration`      | `hooks/usePushRegistration.ts` | Registers device for push notifications, upserts token to Supabase |
| `useNotificationListeners` | `hooks/usePushRegistration.ts` | Subscribes to foreground and tap notification events               |
| `useCartSync`              | `@ecommerce/shared`            | Supabase Realtime cross-device cart sync (used in root layout)     |

---

## Auth Architecture

### AuthContext (`src/context/AuthContext.tsx`)

Single source of truth for session state, biometric state, and anonymous-to-authenticated cart migration.

**State exposed via `useAuth()`:**

```typescript
interface BiometricAuthSession {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAnonymous: boolean;
  biometricStatus: BiometricStatus | null; // device hardware capability
  biometricEnabled: boolean; // user preference + local credentials present
  attemptBiometricLogin: () => Promise<BiometricAuthResult>;
  enableBiometric: () => Promise<{ success: boolean; error?: string }>;
  disableBiometric: () => Promise<void>;
}
```

**Initialization sequence (module load → first render):**

1. `configureEnv()` reads `Constants.expoConfig.extra` (injected by `app.config.ts`).
2. `initSupabaseMobile()` creates the Supabase singleton with SecureStore adapter.
3. `AuthProvider` subscribes to `supabase.auth.onAuthStateChange`.
4. On `INITIAL_SESSION` with no session → `initAnonymousSession()` is called.
5. On `SIGNED_IN` → biometric preference fetched from Supabase; cart merge triggered if applicable.

**Anonymous sessions:** All users are silently signed in as anonymous Supabase users on first launch. The cart (`violet_cart_id`) is stored in SecureStore under this anonymous identity. On explicit sign-in, the cart is merged into the authenticated account.

### Cart Merge Flow (anonymous → authenticated)

Triggered in `AuthContext` on `SIGNED_IN` event when `wasAnonymousRef.current === true`:

```
GET /functions/v1/cart/user          — check if authenticated user has an existing cart
├── existing cart found  →  POST /functions/v1/cart/merge   (anonymous items merged in)
└── no existing cart     →  POST /functions/v1/cart/claim   (anonymous cart claimed)
```

After merge/claim, the `violet_cart_id` in SecureStore is updated to the final cart ID.

### Supabase Storage Adapter

`src/utils/authInit.ts` provides a SecureStore-backed storage adapter for Supabase auth tokens. On `Platform.OS === "web"` (including static export pre-rendering), a no-op adapter is used to avoid crashing on missing native modules.

---

## Biometric Authentication

All biometric logic is in `src/services/biometricService.ts`.

### Exported Functions

| Function                                       | Description                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `checkBiometricAvailability()`                 | Returns `BiometricStatus` — hardware available, enrolled biometrics, supported types    |
| `authenticateWithBiometric(prompt?)`           | Triggers OS biometric prompt (used during enrollment)                                   |
| `storeCredentials(email, sessionToken)`        | Stores refresh token with `requireAuthentication: true` in SecureStore                  |
| `retrieveCredentials()`                        | Reads biometric-protected credentials; triggers OS prompt automatically                 |
| `clearCredentials()`                           | Deletes both keys from SecureStore                                                      |
| `enrollBiometric(userId, email, sessionToken)` | Full enrollment: availability check → authenticate → store → update Supabase preference |
| `disableBiometric(userId)`                     | Clears credentials and updates Supabase preference                                      |
| `attemptBiometricLogin()`                      | Retrieves credentials → restores Supabase session; implements 3-strike counter          |
| `hasBiometricCredentials()`                    | Non-blocking check for presence of stored email key (used before auth state is known)   |
| `resetBiometricFailCount()`                    | Resets in-memory fail counter (called on `SIGNED_OUT` or password login)                |

### 3-Strike Lockout

`attemptBiometricLogin()` tracks consecutive failures in a module-level counter (`biometricFailCount`). After 3 failures, `fallbackToPassword: true` is returned and the counter resets. The counter is in-memory and resets on app restart.

### Security Model

- The **refresh token** is stored with `requireAuthentication: true` — the OS will refuse to read it without a successful biometric check.
- The **email** is stored without biometric protection (display-only).
- Both keys share the `biometric-credentials` keychain service to keep them isolated from other app secrets.
- The refresh token, not the access token, is stored. On login, `supabase.auth.setSession({ access_token: "", refresh_token })` is called; Supabase exchanges it for a fresh session.

---

## Push Notifications

`src/hooks/usePushRegistration.ts` — mobile-only, do not import from `apps/web`.

### Registration Flow

1. Verify physical device (`Device.isDevice` — simulators cannot receive push).
2. Create Android notification channel `"default"` (required for Android 8+, max importance).
3. Request OS permission (`Notifications.requestPermissionsAsync()`).
4. Get Expo push token using `EAS_PROJECT_ID` from `app.config.ts`.
5. Upsert token to `user_push_tokens` table via `upsertPushToken()` from `@ecommerce/shared`.

Registration is idempotent — `registeredForRef` prevents re-registration for the same `userId` within a session.

### Notification Handling

`setupNotificationHandler()` must be called once at module level (before any render) in `_layout.tsx`. It configures foreground notifications to show banner, sound, and list entry.

`useNotificationListeners(callback)` handles tap-to-open: the notification `data` payload is passed to `mobilePushDataToPath()` (from `@ecommerce/shared`) which returns an Expo Router path, then `router.push(path)` navigates directly to the relevant screen.

---

## Checkout Flow

Checkout is a stack screen pushed from the cart tab (`router.push("/checkout")`).

**Steps (enforced by local state machine in `checkout.tsx`):**

1. **Address** — shipping address form
2. **Shipping methods** — fetched per bag from Edge Function
3. **Guest info** — name and email (for guest users)
4. **Billing** — billing address
5. **Payment** — Stripe PaymentSheet (native modal)

All Violet API calls go through `EXPO_PUBLIC_SUPABASE_URL/functions/v1/cart/{id}/...`. The Violet token never leaves the Edge Function.

**Stripe integration:** `StripeProvider` wraps the entire app in `_layout.tsx` using `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`. The checkout screen calls `useStripe()` and presents `PaymentSheet` — a native modal that handles card input, Apple Pay, and Google Pay.

---

## Design Tokens

`src/constants/theme.ts` re-exports color palette from `@ecommerce/ui` and adds mobile-specific values:

| Export                       | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `Colors.light / Colors.dark` | Semantic color map (text, background, tint, etc.) keyed to design tokens |
| `Fonts`                      | Platform-specific font families (iOS system fonts, CSS variables on web) |
| `Spacing`                    | Scale from 2px (`half`) to 64px (`six`)                                  |
| `BottomTabInset`             | Platform-specific inset: iOS=50, Android=80                              |
| `MaxContentWidth`            | 800px max content width                                                  |

There is a pending TODO: dark palette tokens are not fully represented in `@ecommerce/ui`; `backgroundElement` for dark mode is currently hardcoded as `#333333`.

---

## Deep Linking

### iOS Universal Links

`app.config.ts` sets `associatedDomains: ["applinks:www.maisonemile.com"]`. Tapping a `maisonemile.com` URL on iOS opens the app if installed.

### Android Intent Filters

Registered in `app.config.ts` under `android.intentFilters` for `https://www.maisonemile.com` with path prefixes:

- `/products`
- `/order`
- `/account`
- `/search`

### URL Mapping

`webUrlToMobilePath()` in `@ecommerce/shared` maps incoming web URLs to Expo Router paths. `mobilePushDataToPath()` does the same for push notification payloads.

---

## Environment Configuration

`app.config.ts` loads `../../.env.local` manually (Expo CLI does not traverse parent directories for `.env` files). On CI or production, values come from EAS build environment variables.

### Required Variables

| Variable                             | Usage                                                            |
| ------------------------------------ | ---------------------------------------------------------------- |
| `SUPABASE_URL`                       | Supabase project URL (injected via `Constants.expoConfig.extra`) |
| `SUPABASE_ANON_KEY`                  | Supabase anonymous key                                           |
| `EAS_PROJECT_ID`                     | Required for Expo push token registration                        |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_test_...` or `pk_live_...`)          |
| `EXPO_PUBLIC_SUPABASE_URL`           | Used directly in client code for Edge Function URLs              |

`EXPO_PUBLIC_` prefixed variables are inlined by Metro at build time and safe for client-side use.

---

## Testing

Vitest 4.0 (`vitest.config.ts`), pure unit tests — no component rendering, no native module execution.

**Test coverage:**

- `src/services/__tests__/biometricService.test.ts` — 26 test cases covering all exported functions, 3-strike lockout logic, `enrollmentInProgress` guard, and session restoration.

Native modules (`expo-local-authentication`, `expo-secure-store`) and `@ecommerce/shared` are fully mocked with `vi.mock()`.

---

## Build & CI/CD

### Local Development

```bash
bun run dev:mobile        # Start Expo dev server (from monorepo root)
cd apps/mobile
bun run ios               # iOS simulator
bun run android           # Android emulator
bun run web               # Web (static export preview)
bun run typecheck         # TypeScript check
bun run test              # Vitest unit tests
```

### EAS Build Profiles (`eas.json`)

| Profile       | Distribution | Notes                                                   |
| ------------- | ------------ | ------------------------------------------------------- |
| `development` | Internal     | `developmentClient: true`, points to localhost Supabase |
| `preview`     | Internal     | Staging environment                                     |
| `production`  | Store        | `autoIncrement: true` for build numbers                 |

### GitHub Actions (`.github/workflows/mobile-build.yml`)

Triggered on push/PR to `main`:

1. Install dependencies (`bun install --frozen-lockfile`)
2. Run lint (`bun run lint`)
3. Run type check (`bun run typecheck`)
4. If push to `main` and `EXPO_TOKEN` secret is set → `eas build --platform all --non-interactive --no-wait`

EAS Build is skipped on PRs and on push if the secret is not configured, allowing the lint+typecheck gates to run in forks.

### Expo Plugins Registered

`expo-router`, `expo-secure-store`, `expo-notifications`, `@stripe/stripe-react-native`, `expo-local-authentication` (with Face ID permission string), `expo-splash-screen`.

The React Compiler (`experiments.reactCompiler: true`) and typed routes (`experiments.typedRoutes: true`) are both enabled.
