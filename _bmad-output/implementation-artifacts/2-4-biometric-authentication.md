# Story 2.4: Biometric Authentication (Mobile)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **registered mobile user**,
I want to authenticate using Face ID or fingerprint,
So that I can log in quickly and securely on my mobile device.

## Acceptance Criteria

1. **Given** a registered user on the mobile app
   **When** they enable biometric authentication in their profile settings
   **Then** subsequent app launches offer biometric login (Face ID on iOS, fingerprint on Android)

2. **And** biometric auth is optional — password login remains available

3. **And** biometric credentials are stored in the device's secure enclave (Expo SecureStore with `requireAuthentication: true`)

4. **And** if biometric auth fails 3 times, the app falls back to password login

5. **And** biometric preference is stored in the user's profile (Supabase `user_profiles.biometric_enabled`)

## Tasks / Subtasks

- [x] Task 1: Add `biometric_enabled` column to `user_profiles` table (AC: 5)
  - [x] Create migration `supabase/migrations/YYYYMMDDHHMMSS_add_biometric_enabled.sql`
  - [x] Add `biometric_enabled BOOLEAN NOT NULL DEFAULT false` column to `user_profiles`
  - [x] Existing RLS policy (`users_own_profile`) already covers this column — no RLS changes needed

- [x] Task 2: Install `expo-local-authentication` and configure (AC: 1, 2)
  - [x] Run `bun --cwd=apps/mobile add expo-local-authentication`
  - [x] Add Expo config plugin to `apps/mobile/app.config.ts` with `faceIDPermission` string
  - [x] Verify the package version is compatible with Expo SDK 55

- [x] Task 3: Create biometric utility functions in shared package (AC: 1, 3, 4)
  - [x] Create `packages/shared/src/types/biometric.types.ts` — `BiometricStatus`, `BiometricEnrollResult`, `BiometricAuthResult` types
  - [x] Export from `packages/shared/src/types/index.ts`
  - [x] Create `packages/shared/src/clients/biometricAuth.ts` — platform-agnostic interface types and preference persistence functions:
    - `getBiometricPreference(userId, client?)` — reads `user_profiles.biometric_enabled` from Supabase
    - `setBiometricPreference(userId, enabled, client?)` — updates `user_profiles.biometric_enabled` in Supabase
  - [x] Export from `packages/shared/src/clients/index.ts`

- [x] Task 4: Create mobile biometric service (AC: 1, 2, 3, 4)
  - [x] Create `apps/mobile/src/services/biometricService.ts` — mobile-only service wrapping `expo-local-authentication` and `expo-secure-store`:
    - `checkBiometricAvailability()` → calls `hasHardwareAsync()` + `isEnrolledAsync()` + `supportedAuthenticationTypesAsync()` → returns `BiometricStatus` with `{ isAvailable, isEnrolled, supportedTypes }`
    - `authenticateWithBiometric(promptMessage?)` → calls `authenticateAsync({ promptMessage, disableDeviceFallback: true, cancelLabel: "Use Password" })` → returns `BiometricAuthResult`
    - `storeCredentials(email, sessionToken)` → stores session refresh token in SecureStore with `requireAuthentication: true` key `biometric_session_token` (protected by biometric at OS level)
    - `retrieveCredentials()` → retrieves biometric-protected credentials from SecureStore (triggers OS biometric prompt automatically)
    - `clearCredentials()` → removes biometric-protected SecureStore entries
    - `enrollBiometric(userId, email, sessionToken)` → orchestrates: `checkBiometricAvailability()` → `authenticateWithBiometric()` → `storeCredentials()` → `setBiometricPreference(userId, true)` → returns `BiometricEnrollResult`
    - `disableBiometric(userId)` → `clearCredentials()` → `setBiometricPreference(userId, false)`
  - [x] Implement 3-strike fallback counter: track consecutive failures in memory, reset on success, trigger fallback at 3

- [x] Task 5: Integrate biometric into AuthContext (AC: 1, 2, 4)
  - [x] Extend `apps/mobile/src/context/AuthContext.tsx`:
    - Add `biometricStatus: BiometricStatus | null` to context state
    - Add `biometricEnabled: boolean` to context state
    - Add `attemptBiometricLogin()` function — calls `retrieveCredentials()` → uses token to restore Supabase session → handles 3-strike fallback
    - Add `enableBiometric()` / `disableBiometric()` functions to context
    - On auth state change (user login), check biometric preference from Supabase profile
    - On app start (registered user), check biometric availability and preference, offer biometric login if enabled
  - [x] Update `useAuth()` hook return type to include biometric state and actions

- [x] Task 6: Create biometric login prompt UI (AC: 1, 2, 4)
  - [x] Create `apps/mobile/src/components/BiometricPrompt.tsx` — shown at app launch for users with biometric enabled:
    - Displays biometric icon (fingerprint / face based on `supportedAuthenticationTypesAsync()` result)
    - "Use [Face ID / Fingerprint]" button triggers `attemptBiometricLogin()`
    - "Use Password Instead" link navigates to password login screen
    - Shows remaining attempts after each failure (e.g., "2 attempts remaining")
    - After 3 failures: auto-navigates to password login with a toast "Biometric failed — please use your password"
  - [x] Integrate into the app launch flow in `apps/mobile/src/app/_layout.tsx` or root navigation

- [x] Task 7: Create biometric settings toggle (AC: 1, 2, 5)
  - [x] Create `apps/mobile/src/components/BiometricToggle.tsx` — for use in profile/settings screen:
    - Shows biometric availability status (hardware check)
    - Toggle switch to enable/disable biometric auth
    - Enable flow: triggers biometric enrollment (authenticate → store credentials → update Supabase)
    - Disable flow: confirms → clears credentials → updates Supabase
    - Disabled state with explanation if hardware not available or no biometric enrolled on device
  - [x] Add to profile/settings screen (created at `apps/mobile/src/app/profile.tsx`)

- [x] Task 8: Tests (AC: 1-5)
  - [x] Unit test `biometricService.ts` — mock `expo-local-authentication` and `expo-secure-store`:
    - `checkBiometricAvailability()` — hardware available/unavailable, enrolled/not enrolled
    - `authenticateWithBiometric()` — success, user cancel, lockout, not enrolled
    - `storeCredentials()` / `retrieveCredentials()` / `clearCredentials()` — SecureStore mock
    - `enrollBiometric()` — full flow success, biometric unavailable, auth failure
    - 3-strike counter: verify fallback triggers after 3 consecutive failures, resets on success
  - [x] Unit test `getBiometricPreference()` / `setBiometricPreference()` — mock Supabase client
  - [ ] Unit test AuthContext biometric integration (optional — complex React Native context testing)
  - [ ] Test migration: verify `biometric_enabled` column exists and defaults to false (requires running Supabase locally)

## Dev Notes

### Critical Implementation Details

#### Biometric Auth Architecture

The biometric authentication flow follows a **credential storage model**, not a direct auth model:

1. **Enrollment**: User authenticates normally (email/password) → enables biometric → the Supabase session refresh token is stored in SecureStore protected by biometric (`requireAuthentication: true`)
2. **Login**: On app launch → OS prompts biometric → if successful, SecureStore releases the stored refresh token → Supabase client restores session
3. **Fallback**: If biometric fails 3x → redirect to password login (standard email/password flow)

This is the standard pattern because biometrics don't replace passwords — they protect access to stored credentials.

```
App Launch (registered user with biometric enabled)
     │
     ▼
Check biometric preference (Supabase profile)
     │ enabled=true
     ▼
Show BiometricPrompt
     │
     ├── User taps "Use Biometric" ──► retrieveCredentials()
     │                                    │ (OS shows Face ID/fingerprint)
     │                                    │
     │                                    ├── Success → Restore Supabase session
     │                                    │              → Navigate to home
     │                                    │
     │                                    └── Failure → Increment strike counter
     │                                                  │
     │                                                  ├── strikes < 3 → Show retry
     │                                                  └── strikes >= 3 → Fallback
     │
     └── User taps "Use Password" ──► Navigate to login screen
```

#### SecureStore + Biometric Integration (CRITICAL)

The key insight: `expo-secure-store` with `requireAuthentication: true` **automatically triggers the OS biometric prompt** when reading the stored value. We don't need to call `expo-local-authentication.authenticateAsync()` for the login flow — SecureStore handles it.

However, we DO need `expo-local-authentication` for:

- **Enrollment check**: `hasHardwareAsync()` + `isEnrolledAsync()` — to show/hide biometric options in UI
- **Type detection**: `supportedAuthenticationTypesAsync()` — to show correct icon (fingerprint vs face)
- **Explicit enrollment prompt**: During enable flow, we want a controlled biometric prompt before storing credentials

**Storage keys:**

```typescript
const BIOMETRIC_SESSION_KEY = "biometric_session_token";
const BIOMETRIC_USER_EMAIL_KEY = "biometric_user_email";
```

**Store with biometric protection:**

```typescript
await SecureStore.setItemAsync(BIOMETRIC_SESSION_KEY, refreshToken, {
  requireAuthentication: true,
  authenticationPrompt: "Authenticate to enable biometric login",
});
```

**Retrieve (triggers OS biometric automatically):**

```typescript
const refreshToken = await SecureStore.getItemAsync(BIOMETRIC_SESSION_KEY, {
  requireAuthentication: true,
  authenticationPrompt: "Log in with biometric",
});
```

#### Important: iOS `keychainService` Limitation

On iOS, `requireAuthentication: true` cannot share the same `keychainService` as non-authenticated items. The Supabase auth adapter already uses SecureStore without `requireAuthentication` for session storage. The biometric-protected keys MUST use a **different keychainService** or the default (no custom keychainService).

**Solution:** Use a distinct `keychainService` for biometric-protected items:

```typescript
const BIOMETRIC_KEYCHAIN = "biometric-credentials";

await SecureStore.setItemAsync(key, value, {
  requireAuthentication: true,
  keychainService: BIOMETRIC_KEYCHAIN,
});
```

#### 3-Strike Fallback Logic

```typescript
// In-memory counter (resets on app restart — intentional)
let biometricFailCount = 0;
const MAX_BIOMETRIC_ATTEMPTS = 3;

async function attemptBiometricLogin(): Promise<BiometricAuthResult> {
  const result = await retrieveCredentials();
  if (result.success) {
    biometricFailCount = 0; // Reset on success
    return restoreSession(result.data.refreshToken);
  }
  biometricFailCount++;
  if (biometricFailCount >= MAX_BIOMETRIC_ATTEMPTS) {
    biometricFailCount = 0; // Reset for next time
    return { success: false, fallbackToPassword: true };
  }
  return { success: false, attemptsRemaining: MAX_BIOMETRIC_ATTEMPTS - biometricFailCount };
}
```

#### Supabase Session Restoration from Refresh Token

To restore a Supabase session from a stored refresh token:

```typescript
const { data, error } = await supabaseClient.auth.setSession({
  access_token: "", // Will be refreshed
  refresh_token: storedRefreshToken,
});
```

Note: `setSession` with a valid `refresh_token` and empty `access_token` will trigger a token refresh, returning a new valid session. Verify this behavior in the Supabase JS client docs.

### Relevant Architecture Patterns and Constraints

1. **Mobile-Only Feature** (Source: epics.md §Story 2.4)
   - This story is exclusively for `apps/mobile/` — no web implementation needed
   - Web users authenticate via email/password only (standard browser behavior)

2. **Expo SecureStore Already in Use** (Source: Story 2.1 implementation)
   - `apps/mobile/src/utils/authInit.ts` already configures SecureStore as the Supabase session storage adapter
   - The existing adapter uses `SecureStore.getItemAsync`/`setItemAsync`/`deleteItemAsync` WITHOUT `requireAuthentication`
   - Biometric-protected items MUST use a separate `keychainService` to avoid conflicts on iOS

3. **AuthContext Pattern** (Source: Story 2.2 implementation)
   - `apps/mobile/src/context/AuthContext.tsx` provides `useAuth()` hook
   - All auth state flows through this context — biometric state must be added here
   - Context subscribes to `onAuthStateChange` — biometric session restoration should trigger this

4. **Shared Package for Types + DB Operations** (Source: architecture.md §Implementation Patterns)
   - Types go in `packages/shared/src/types/` — biometric types shared for potential future web API
   - DB operations (read/write `user_profiles`) go in `packages/shared/src/clients/`
   - Mobile-specific code (Expo APIs) stays in `apps/mobile/` — NOT in shared package

5. **Error Handling Pattern** (Source: architecture.md §Process Patterns)
   - Return `{ data, error }` shape (ApiResponse type)
   - Error codes: `BIOMETRIC.NOT_AVAILABLE`, `BIOMETRIC.NOT_ENROLLED`, `BIOMETRIC.AUTH_FAILED`, `BIOMETRIC.CREDENTIAL_ERROR`
   - Never expose technical errors to user — map to friendly messages

6. **Design Tokens for Mobile UI** (Source: Story 1.3)
   - Use design tokens from `packages/ui/src/tokens/` for colors, spacing
   - Follow existing mobile component patterns from `apps/mobile/src/`
   - No Tailwind on mobile — use `StyleSheet.create()` with token values

### Library / Framework Requirements

| Library                     | Version                       | Purpose                                                         | Notes                                                                                |
| --------------------------- | ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `expo-local-authentication` | `~55.x` (SDK 55 compatible)   | Biometric hardware detection, type detection, enrollment prompt | Must match Expo SDK 55 version range                                                 |
| `expo-secure-store`         | `^55.0.8` (already installed) | Biometric-protected credential storage                          | Already used for Supabase session — use separate keychainService for biometric items |
| `@supabase/supabase-js`     | (already installed)           | Session restoration from stored refresh token                   | `setSession()` API for refresh token restore                                         |

**CRITICAL: Version Pinning**

- Do NOT upgrade `expo-secure-store` beyond what's compatible with Expo SDK 55
- Use `npx expo install expo-local-authentication` (not `bun add`) to ensure SDK-compatible version
- Check `expo doctor` after installation to verify compatibility

### File Structure Requirements

```
# NEW files
packages/shared/src/types/biometric.types.ts          # Biometric type definitions
packages/shared/src/clients/biometricAuth.ts           # Supabase biometric preference CRUD
apps/mobile/src/services/biometricService.ts           # Mobile biometric service (Expo APIs)
apps/mobile/src/components/BiometricPrompt.tsx          # Launch-time biometric login UI
apps/mobile/src/components/BiometricToggle.tsx          # Settings toggle component
supabase/migrations/YYYYMMDDHHMMSS_add_biometric_enabled.sql  # DB migration

# MODIFIED files
packages/shared/src/types/index.ts                     # Export biometric types
packages/shared/src/clients/index.ts                   # Export biometric client functions
apps/mobile/src/context/AuthContext.tsx                 # Add biometric state + actions
apps/mobile/app.json                                   # Add expo-local-authentication plugin config
apps/mobile/src/app/_layout.tsx                         # Integrate biometric login prompt on launch

# DO NOT TOUCH
apps/mobile/src/utils/authInit.ts                      # Existing SecureStore Supabase adapter — separate concern
apps/web/                                              # Web has no biometric auth
packages/shared/src/clients/auth.ts                    # Supabase user auth — don't modify
packages/shared/src/clients/violetAuth.ts              # Violet API auth — unrelated
supabase/functions/                                     # Edge Functions — not needed for this story
```

### Testing Requirements

1. **Unit Tests (Vitest for shared, Jest/Vitest for mobile):**
   - Mock `expo-local-authentication` module entirely (all methods return controlled values)
   - Mock `expo-secure-store` module (control `getItemAsync`/`setItemAsync` behavior)
   - Mock Supabase client for `user_profiles` queries
   - Test the 3-strike fallback counter thoroughly (boundary cases: 0, 1, 2, 3 failures)
   - Test enrollment flow: happy path + each failure mode
   - Test credential storage with separate keychainService

2. **Manual Testing (REQUIRED — biometrics don't work in simulator easily):**
   - iOS: FaceID requires development build (NOT Expo Go) — use `npx expo run:ios` or EAS development build
   - Android: Fingerprint works in emulator with `adb emu finger touch <id>` command
   - Test full flow: enable biometric → close app → reopen → biometric prompt → login
   - Test fallback: enable biometric → fail 3 times → redirected to password login
   - Test disable: disable biometric → close app → reopen → no biometric prompt → password login
   - Test edge case: user changes biometrics on device (adds new fingerprint) → stored credentials become inaccessible → graceful fallback

3. **Migration Test:**
   - Run `supabase db reset` locally to verify migration applies cleanly
   - Verify `biometric_enabled` defaults to `false` for existing rows
   - Verify RLS still works (existing `users_own_profile` policy covers all columns)

### Previous Story Intelligence (Story 2.3)

From the Story 2.3 implementation:

1. **Singleton/module-scoped pattern**: Story 2.3 used module-scoped singletons for `VioletTokenManager`. For mobile biometric service, use module-scoped state for the failure counter (simpler than a class for this use case).

2. **Error code convention**: Follow `DOMAIN.ERROR_NAME` pattern: `VIOLET.AUTH_FAILED` → `BIOMETRIC.AUTH_FAILED`, `BIOMETRIC.NOT_AVAILABLE`, `BIOMETRIC.NOT_ENROLLED`, `BIOMETRIC.CREDENTIAL_ERROR`, `BIOMETRIC.STORAGE_ERROR`

3. **Test patterns**: Story 2.3 used `vi.fn()` for mocking fetch. For biometric tests, mock the entire `expo-local-authentication` and `expo-secure-store` modules with `vi.mock()`.

4. **Code review findings from 2.3**: Added concurrent call deduplication — consider if biometric enrollment could be triggered multiple times (e.g., double-tap). Add a guard: `if (enrollmentInProgress) return`.

### Git Intelligence (Recent Commits)

```
d5d16ed feat: Story 2.3 — Violet API token lifecycle management (server-side)
464f42f feat: Story 2.2 — user registration & login with email verification
982e101 fix: CI build failure — conditional React aliases + skip integration tests
60ff7bd fix: suppress no-console warnings breaking CI (--max-warnings 0)
8b8149e feat: Story 2.1 — anonymous session & Supabase auth setup (web + mobile)
```

**Patterns observed:**

- Commit message format: `feat: Story X.Y — description`
- Server-side code in `apps/web/src/server/`, mobile code in `apps/mobile/src/`
- Shared types always go through barrel exports (`index.ts`)
- CI runs `bun run fix-all` — ensure new code passes lint + format + typecheck
- Integration tests skipped in CI — mobile biometric tests will be manual anyway

### Latest Technology Information

1. **expo-local-authentication API (Expo SDK 55):**
   - `hasHardwareAsync()` → boolean (hardware scanner exists)
   - `isEnrolledAsync()` → boolean (biometric data saved on device)
   - `supportedAuthenticationTypesAsync()` → `AuthenticationType[]` (FINGERPRINT=1, FACIAL_RECOGNITION=2, IRIS=3)
   - `authenticateAsync(options)` → `{ success: true } | { success: false, error: string }`
   - Options: `{ promptMessage, cancelLabel, disableDeviceFallback, fallbackLabel, biometricsSecurityLevel }`
   - iOS FaceID requires `NSFaceIDUsageDescription` in Info.plist (handled by config plugin)
   - **Does NOT work in Expo Go for FaceID** — needs development build
   - Source: [Expo LocalAuthentication Docs](https://docs.expo.dev/versions/latest/sdk/local-authentication/)

2. **expo-secure-store `requireAuthentication` (Expo SDK 55):**
   - `setItemAsync(key, value, { requireAuthentication: true, authenticationPrompt: "..." })` — stores with biometric protection
   - `getItemAsync(key, { requireAuthentication: true, authenticationPrompt: "..." })` — auto-triggers biometric prompt on read
   - `canUseBiometricAuthentication()` — check if device supports biometric SecureStore
   - **iOS caveat**: Cannot share `keychainService` with non-authenticated items — use separate keychainService
   - **Android**: Authentication required for all operations (get, set, delete)
   - Data becomes inaccessible if user changes biometric settings (adds new fingerprint) — handle gracefully
   - Source: [Expo SecureStore Docs](https://docs.expo.dev/versions/latest/sdk/securestore/)

3. **Supabase JS `setSession()` for token restoration:**
   - `supabaseClient.auth.setSession({ access_token: "", refresh_token })` triggers refresh
   - Returns `{ data: { session, user }, error }` — new valid session if refresh token is valid
   - If refresh token is expired/invalid, returns error — should trigger password fallback

### Project Structure Notes

- **Alignment with unified structure:**
  - `apps/mobile/src/services/` — new directory for mobile-only service layer (follows platform-specific pattern)
  - `apps/mobile/src/components/` — new directory for mobile components (separate from shared `packages/ui/`)
  - `packages/shared/src/types/biometric.types.ts` — follows existing `auth.types.ts`, `violet.types.ts` convention
  - `packages/shared/src/clients/biometricAuth.ts` — follows existing `auth.ts`, `violetAuth.ts` convention

- **Detected variances / clarifications:**
  - The epics file says "stored in the device's secure enclave (Expo SecureStore)" — SecureStore uses Keychain (iOS) / Keystore (Android), not the secure enclave directly. However, with `requireAuthentication: true`, the keys are protected by the Secure Enclave's biometric verification. The distinction is accurate enough for the story.
  - No existing `apps/mobile/src/services/` directory — this will be a new directory. Alternatively, the service could live in `apps/mobile/src/utils/` alongside `authInit.ts`, but `services/` better communicates its role.

### References

- [Expo LocalAuthentication Docs](https://docs.expo.dev/versions/latest/sdk/local-authentication/) — Full API reference
- [Expo SecureStore Docs](https://docs.expo.dev/versions/latest/sdk/securestore/) — `requireAuthentication` option
- [Expo Authentication Overview](https://docs.expo.dev/develop/authentication/) — General auth patterns
- [Architecture §Authentication & Security](../planning-artifacts/architecture.md#authentication--security) — Dual auth layer decision
- [Story 2.1](./2-1-anonymous-session-supabase-auth-setup.md) — SecureStore adapter setup, anonymous sessions
- [Story 2.2](./2-2-user-registration-login.md) — AuthContext pattern, login/signup flow, error mapping
- [Story 2.3](./2-3-violet-api-token-management.md) — Singleton pattern, error code convention, test patterns
- [FR33](../planning-artifacts/prd.md) — "Registered users can authenticate using biometric methods (Face ID, fingerprint) on mobile"
- [NFR9](../planning-artifacts/prd.md) — "API tokens must never be exposed to client-side code"

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- No blocking issues encountered during implementation.
- Pre-existing integration test `rlsPolicy.integration.test.ts` fails due to Supabase not running locally — unrelated to this story.
- expo-doctor reports 4 pre-existing package version mismatches — unrelated to this story.

### Completion Notes List

- Implemented full biometric authentication flow: enrollment, login, fallback, disable
- Used credential storage model (not direct auth): refresh token stored in SecureStore protected by biometric
- Separate `keychainService` ("biometric-credentials") to avoid iOS keychain conflicts with existing Supabase auth adapter
- Added enrollment guard (`enrollmentInProgress` flag) to prevent double-tap issues
- Created `BiometricAuthSession` interface extending `AuthSession` — backward compatible with existing `useAuth()` consumers
- Profile/Settings screen created as placeholder with BiometricToggle integrated
- 29 unit tests: 8 for shared biometric preference functions, 21 for mobile biometric service (3-strike logic tested at boundaries)
- All quality checks pass: Prettier, ESLint, TypeScript (both web and mobile)

### Change Log

- 2026-03-10: Story 2.4 implementation — Biometric authentication for mobile (Face ID / Fingerprint)
- 2026-03-10: Code review — Fixed 6 issues (3 HIGH, 3 MEDIUM):
  - H1: Replaced hardcoded colors with design tokens (tint/buttonText) in BiometricPrompt
  - H2: Fixed race condition in BiometricToggle disable flow (Alert is non-blocking)
  - H3: Created profile tab icon asset, replaced duplicate explore.png reference
  - M1: Added local SecureStore credential check to resolve server-state dependency for biometric prompt
  - M2: Removed redundant resetBiometricFailCount() call in AuthContext
  - M3: Added bun.lock and theme.ts to File List documentation

### File List

**New files:**

- `supabase/migrations/20260310000000_add_biometric_enabled.sql` — DB migration
- `packages/shared/src/types/biometric.types.ts` — BiometricStatus, BiometricAuthResult, BiometricEnrollResult, BiometricErrorCode types
- `packages/shared/src/clients/biometricAuth.ts` — getBiometricPreference, setBiometricPreference
- `packages/shared/src/clients/__tests__/biometricAuth.test.ts` — 8 unit tests
- `apps/mobile/src/services/biometricService.ts` — Full biometric service (check, auth, store, enroll, disable, login)
- `apps/mobile/src/services/__tests__/biometricService.test.ts` — 21 unit tests
- `apps/mobile/src/components/BiometricPrompt.tsx` — Launch-time biometric login UI
- `apps/mobile/src/components/BiometricToggle.tsx` — Settings toggle component
- `apps/mobile/src/app/profile.tsx` — Placeholder profile/settings screen
- `apps/mobile/vitest.config.ts` — Vitest config for mobile tests

**Modified files:**

- `packages/shared/src/types/index.ts` — Export biometric types
- `packages/shared/src/clients/index.ts` — Export biometric client functions
- `packages/shared/package.json` — Added vitest devDep + test script
- `apps/mobile/src/context/AuthContext.tsx` — Added biometric state + actions to context
- `apps/mobile/src/app/_layout.tsx` — Integrated BiometricPrompt in launch flow
- `apps/mobile/src/components/app-tabs.tsx` — Added Profile tab
- `apps/mobile/app.config.ts` — Added expo-local-authentication config plugin
- `apps/mobile/package.json` — Added expo-local-authentication dep, vitest devDep, test script
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story status updated
- `bun.lock` — Updated by expo-local-authentication installation
- `apps/mobile/src/constants/theme.ts` — Added tint/buttonText design tokens (code review fix)
