# Component Inventory — Mobile (`apps/mobile/src`)

All components, hooks, services, contexts, and utilities in the mobile application (Expo SDK 55, React Native 0.83.2).

---

## Product Components (3)

### `ProductCard`

**File:** `components/product/ProductCard.tsx`
**Props:** `product: Product`
**Purpose:** Native product card for the catalog grid. Matches the web card anatomy: 3:4 aspect ratio image (or placeholder), "Sold Out" badge, product name (serif font), merchant name, and price via `formatPrice()`. Out-of-stock images are rendered at 50% opacity. Styled with `StyleSheet.create` using `Colors` and `Spacing` design tokens.

---

### `ProductList`

**File:** `components/product/ProductList.tsx`
**Props:** `products: Product[]`, `total: number`, `hasNext: boolean`, `isLoading: boolean`, `onLoadMore: () => void`
**Purpose:** `FlatList` with `numColumns={2}` for the products screen. Shows `ActivityIndicator` when loading with no products. Header shows a product count. Footer shows a "Load more" text button when `hasNext` is true (no infinite scroll per UX spec). `onEndReached` is intentionally not used.

---

### `MobileProductDetail` (default export: `ProductDetail`)

**File:** `components/product/ProductDetail.tsx`
**Props:** `product: Product`
**Purpose:** Mobile product detail layout. Full-width hero images in a horizontal `ScrollView` with `pagingEnabled` for swipe-to-navigate. Stacked layout: images → name → merchant → price → description → recommendations. Displays `useRecommendations` results as a horizontal scroll of tappable product items. Description is stripped of HTML via `stripHtml()`. Shares via React Native's native `Share` API.

---

## Auth Components (2)

### `BiometricPrompt`

**File:** `components/BiometricPrompt.tsx`
**Props:** `onFallbackToPassword: () => void`
**Purpose:** Full-screen biometric login prompt (Face ID / Fingerprint / fallback). Shows the appropriate icon based on `biometricStatus.supportedTypes`. Tracks attempts (max 3) and calls `attemptBiometricLogin` from `AuthContext`. On failure: decrements counter, offers fallback to password. On `result.fallbackToPassword`: calls `onFallbackToPassword`. On success: auth state change navigates automatically.

---

### `BiometricToggle`

**File:** `components/BiometricToggle.tsx`
**Props:** none (reads `AuthContext` internally)
**Purpose:** Switch component on the settings screen to enable/disable biometric login. Renders nothing if `biometricStatus` is null (device not checked yet). Shows a native `Alert.alert` confirmation before disabling. On enable failure, shows an error alert with a specific message (not enrolled, not available, or generic). Uses `enableBiometric` / `disableBiometric` from `AuthContext`.

---

## UI Primitives (5)

### `ThemedText`

**File:** `components/themed-text.tsx`
**Props:** `type?: "default" | "title" | "small" | "smallBold" | "subtitle" | "link" | "linkPrimary" | "code"`, `themeColor?: ThemeColor`, `...TextProps`
**Purpose:** Theme-aware `<Text>` wrapper. Applies color from the active theme (`Colors.light` or `Colors.dark`) and a predefined font style from the `type` prop. Uses `useTheme()` for the current color scheme. Accepts all standard React Native `TextProps`.

---

### `ThemedView`

**File:** `components/themed-view.tsx`
**Props:** `type?: ThemeColor`, `lightColor?: string`, `darkColor?: string`, `...ViewProps`
**Purpose:** Theme-aware `<View>` wrapper. Sets `backgroundColor` from `Colors[scheme][type]`. The `type` prop accepts any `ThemeColor` key (`"background"`, `"backgroundElement"`, `"backgroundSelected"`, etc.). Accepts all standard React Native `ViewProps`.

---

### `Skeleton`

**File:** `components/Skeleton.tsx`
**Props:** `width?: number`, `height?: number`, `borderRadius?: number`, `style?: ViewStyle`
**Purpose:** Animated loading placeholder. Uses `Animated.loop` with a fade opacity (1 → 0.4 → 1) at 750ms per step. Respects `AccessibilityInfo.isReduceMotionEnabled()` — sets a static 70% opacity when motion is reduced. Background color from the active theme's `backgroundElement` token.

---

### `Collapsible`

**File:** `components/ui/collapsible.tsx`
**Props:** `title: string`, `children: ReactNode`
**Purpose:** Animated expand/collapse panel. Toggle button uses `SymbolView` for a platform-appropriate chevron icon (iOS/Android/web). Content fades in with `FadeIn.duration(200)` from Reanimated. Used on the explore screen for expandable sections.

---

### `ExternalLink`

**File:** `components/external-link.tsx`
**Props:** `href: Href & string`, `...LinkProps`
**Purpose:** Link that opens URLs in an in-app browser on native (via `expo-web-browser` with `AUTOMATIC` presentation style), while using default browser behavior on web. Prevents default navigation on native to avoid leaving the app.

---

## Tab Navigation (2 components + platform split)

### `AppTabs` (native)

**File:** `components/app-tabs.tsx`
**Props:** none (reads `useUser`, `useWishlistProductIds` internally)
**Purpose:** Expo Router `<Tabs>` navigator for native (compatible with Expo Go). Tabs: Home, Products, Search, Wishlist, Cart, Profile. Wishlist tab uses `href: null` for unauthenticated/anonymous users (hides the tab while keeping the route registered). When the wishlist has items, `tabBarBadge` shows a dot indicator. Tab bar is positioned absolutely on iOS.

---

### `AppTabs` (web)

**File:** `components/app-tabs.web.tsx`
**Props:** none
**Purpose:** Web-specific tab navigator using `expo-router/ui`'s `Tabs`/`TabList`/`TabTrigger`/`TabSlot` components. Renders a custom `TabList` layout with text-based `TabButton` components. Web variant because `expo-router/ui` components require a dev build and have a different API than the standard `Tabs`.

---

## Content Component (1)

### `ContentCard`

**File:** `components/ContentCard.tsx`
**Props:** `content: ContentListItem`, `compact?: boolean`
**Purpose:** Content article card in two layouts. `compact=true` (horizontal scroll on home tab): 200px wide, 16:9 image, title + badge. `compact=false` (vertical list on content screen): full width, image, badge, title, author. Type-label placeholder shown when `featuredImageUrl` is null. Navigates to `/content/{slug}` via `useRouter().push`.

---

## Splash / Branding (2 components + platform split)

### `AnimatedIcon` / `AnimatedSplashOverlay` (native)

**File:** `components/animated-icon.tsx`
**Props:** none
**Purpose:** Animated app icon for the splash/explore screen. `AnimatedIcon` uses Reanimated `Keyframe` animations: background scales from `SCREEN_HEIGHT/90` to 1 over 600ms, logo fades in with elastic easing, glow image rotates continuously (4-minute loop). `AnimatedSplashOverlay` renders a full-screen colored view that fades out after the keyframe completes, using `scheduleOnRN` for the Reanimated worklet callback.

---

### `AnimatedIcon` / `AnimatedSplashOverlay` (web)

**File:** `components/animated-icon.web.tsx`
**Props:** none
**Purpose:** Web-specific variant with a shorter 300ms animation and no `AnimatedSplashOverlay` (returns `null`). Uses a CSS module (`animated-icon.module.css`) for the background instead of the native `experimental_backgroundImage` gradient. Separate file because Reanimated worklets and `scheduleOnRN` are not available on web.

---

## Scaffold Component (1)

### `HintRow`

**File:** `components/hint-row.tsx`
**Props:** `title?: string`, `hint?: ReactNode`
**Purpose:** Two-column row showing a label and a code-snippet-style hint. Used on the explore screen for getting-started tips. Defaults: title `"Try editing"`, hint `"app/index.tsx"`.

---

### `WebBadge`

**File:** `components/web-badge.tsx`
**Props:** none
**Purpose:** Displays the Expo version number and the Expo badge logo image (light/dark variant based on color scheme). Used on the explore screen.

---

## Context (1)

### `AuthContext` / `AuthProvider` / `useAuth`

**File:** `context/AuthContext.tsx`
**Props (provider):** `children: ReactNode`
**Purpose:** Provides full auth state to the app: `user`, `session`, `isLoading`, `isAnonymous`, plus biometric extension fields: `biometricStatus`, `biometricEnabled`, `attemptBiometricLogin`, `enableBiometric`, `disableBiometric`. Initializes anonymous Supabase session on mount via `initAnonymousSession`. Subscribes to `supabase.auth.onAuthStateChange`. Stores session in `expo-secure-store` (Keychain/Keystore). Provides a cart fetch URL (`EDGE_FN_BASE`) for the cart Edge Function. `useAuth()` hook throws if called outside the provider.

---

## Hooks (4)

### `useTheme`

**File:** `hooks/use-theme.ts`
**Purpose:** Returns the active `Colors` palette (`Colors.light` or `Colors.dark`) based on `useColorScheme()`. Used by `ThemedText`, `ThemedView`, and any component that needs direct color token access.

---

### `useColorScheme` (native)

**File:** `hooks/use-color-scheme.ts`
**Purpose:** Re-exports `useColorScheme` from `react-native` directly. Thin shim so all components import from `@/hooks/use-color-scheme` regardless of platform.

---

### `useColorScheme` (web)

**File:** `hooks/use-color-scheme.web.ts`
**Purpose:** Web-specific variant that handles SSR hydration. Returns `"light"` on the server (before hydration) to prevent a color scheme flash, then switches to the real value after `useEffect` runs. Required because Expo's static web export pre-renders in Node.js where `window` is unavailable.

---

### `useMobileTracking`

**File:** `hooks/useMobileTracking.ts`
**Purpose:** Mobile tracking hook that sends events to the `track-event` Supabase Edge Function via `fetch`. Reads `user.id` and auth token from `AuthContext`. Only tracks authenticated non-anonymous users. Wraps `useTracking` from `@ecommerce/shared` with a mobile-specific `sendEvent` function. Errors are logged via `console.warn` (not silently dropped).

---

### `usePushRegistration`

**File:** `hooks/usePushRegistration.ts`
**Props:** `userId: string | undefined`
**Purpose:** Registers the device for Expo push notifications and upserts the token to Supabase. Flow: verify physical device → create Android notification channel → request permission → get Expo push token → call `upsertPushToken`. Skips registration if `userId` is undefined or if already registered for this user (tracked via a `useRef`). Silently fails on errors.

---

## Services (1)

### `biometricService`

**File:** `services/biometricService.ts`
**Exports:** `checkBiometricAvailability`, `authenticateWithBiometric`, `attemptBiometricLogin`, `enrollBiometric`, `disableBiometric`, `hasBiometricCredentials`, `resetBiometricFailCount`
**Purpose:** Low-level biometric auth service wrapping `expo-local-authentication` and `expo-secure-store`. Manages enrollment (stores session token + email in SecureStore under `biometric-credentials` key), authentication (prompts OS biometric dialog, retrieves stored Supabase session token, re-hydrates session), and credential cleanup on disable. Enforces a max of 3 failed attempts (`biometricFailCount` module-level counter) before falling back to password.

---

## Utilities (2)

### `biometricLabel`

**File:** `utils/biometricLabel.ts`
**Exports:** `getBiometricLabel(supportedTypes: number[]): string`
**Purpose:** Returns a human-readable label for the device's biometric type: `"Face ID"` for `FACIAL_RECOGNITION`, `"Fingerprint"` for `FINGERPRINT`, `"Biometric"` as fallback. Used by `BiometricPrompt` and `BiometricToggle`.

---

### `authInit`

**File:** `utils/authInit.ts`
**Exports:** `initAnonymousSession` (re-export), `secureStoreAdapter` (internal)
**Purpose:** Provides a SecureStore-backed Supabase auth storage adapter. Encrypts session tokens via Keychain (iOS) / Keystore (Android). Includes a no-op web/Node.js fallback to prevent crashes during `expo export --platform web` static pre-rendering (when `Platform.OS === "web"`, SecureStore native module is unavailable). Called once at app startup from `AuthProvider`.

---

## Constants (1)

### `theme`

**File:** `constants/theme.ts`
**Exports:** `Colors`, `Fonts`, `Spacing`, `MaxContentWidth`, `ThemeColor`
**Purpose:** Design token constants aligned with `@ecommerce/ui`. `Colors` has `light` and `dark` palettes using the warm neutral + midnight gold tokens (`ink`, `ivory`, `linen`, `sand`, `steel`, `gold`, `midnight`, `charcoal`). `Spacing` is a numeric scale. `Fonts` provides serif/sans/mono font family names. Used by every component that needs direct style values.
