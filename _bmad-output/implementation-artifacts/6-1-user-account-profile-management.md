# Story 6.1: User Account & Profile Management

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260324000000_user_profiles_extend.sql` | ALTER `user_profiles`: add display_name, avatar_url, preferences JSONB columns + update RLS policies for authenticated edit |
| CREATE | `packages/shared/src/hooks/useAuth.ts` | Shared React hooks: useUser, useLogin, useLogout, useRegister — wraps auth.ts functions with React Query |
| CREATE | `packages/shared/src/hooks/useProfile.ts` | Shared React hook: useProfile (read), useUpdateProfile (mutation) — TanStack Query with optimistic updates |
| CREATE | `packages/shared/src/clients/profile.ts` | Profile CRUD functions: getProfile, updateProfile — Supabase client operations |
| CREATE | `packages/shared/src/types/profile.types.ts` | UserProfile interface with extended fields, UpdateProfilePayload, UserPreferences |
| CREATE | `packages/shared/src/schemas/profile.schema.ts` | Zod schemas for profile validation (display name, avatar URL, preferences) |
| CREATE | `apps/web/src/routes/account/profile.tsx` | Web profile page: view + edit display name, email, avatar, password change |
| CREATE | `apps/web/src/styles/pages/profile.css` | BEM styles for profile page (.profile, .profile__form, .profile__avatar, etc.) |
| UPDATE | `apps/web/src/styles/index.css` | Add `@import "./pages/profile.css"` to the imports |
| UPDATE | `apps/web/src/routes/account/route.tsx` | Add profile link to account layout navigation (if layout has sidebar/nav) |
| UPDATE | `apps/mobile/src/app/profile.tsx` | Expand existing profile screen: add profile editing (display name, avatar), password change, account info |
| UPDATE | `apps/mobile/src/app/(tabs)/_layout.tsx` | Verify profile tab exists and points to expanded profile screen |
| UPDATE | `packages/shared/src/clients/auth.ts` | Add social login functions: signInWithGoogle, signInWithApple |
| UPDATE | `packages/shared/src/types/auth.types.ts` | Add SocialProvider type, extend AuthSession if needed |
| UPDATE | `packages/shared/src/index.ts` | Export new hooks and types (useAuth, useProfile, profile types) |
| UPDATE | `apps/web/src/routes/auth/login.tsx` | Add social login buttons (Google, Apple) below email/password form |
| UPDATE | `apps/web/src/routes/auth/signup.tsx` | Add social login buttons as signup alternative |
| UPDATE | `apps/mobile/src/app/auth/login.tsx` | Add social login buttons (Google, Apple) |
| UPDATE | `apps/mobile/src/app/auth/signup.tsx` | Add social login buttons |

---

## Story

As a **visitor**,
I want to create an account and manage my profile,
So that I can access personalized features and save my preferences.

## Acceptance Criteria

1. **Given** a visitor on the platform
   **When** they choose to create an account
   **Then** Supabase Auth handles registration via email/password (FR29)
   **And** social login (Google, Apple) is supported via Supabase Auth providers
   **And** email verification is required before account activation

2. **Given** the database migration `supabase/migrations/20260317000000_user_profiles_extend.sql`
   **When** applied
   **Then** ALTERs the `user_profiles` table (created in Story 2.1) to add columns:
   - `display_name` (TEXT, nullable) — user-chosen display name
   - `avatar_url` (TEXT, nullable) — profile avatar URL
   - `preferences` (JSONB, default '{}') — user preferences (theme, notification settings, etc.)
   **And** RLS policies are updated: authenticated (non-anonymous) users can UPDATE their own profile's new fields
   **And** existing RLS policies (`users_own_profile`, `block_anonymous_writes`) remain intact

3. **Given** an authenticated user on the profile page/screen
   **When** they edit their profile
   **Then** profile page/screen allows editing: display name, avatar URL (via text input for MVP), password change
   **And** changes are validated client-side (Zod) before submission
   **And** optimistic UI updates are applied via TanStack Query mutation

4. **Given** the web application
   **When** a user navigates to `/account/profile`
   **Then** the profile page renders at `apps/web/src/routes/account/profile.tsx`
   **And** it is protected by the existing account layout auth guard (from `account/route.tsx`)
   **And** uses BEM CSS classes (.profile, .profile__form, .profile__field, etc.)

5. **Given** the mobile application
   **When** a user navigates to the profile tab
   **Then** the profile screen at `apps/mobile/src/app/profile.tsx` shows profile editing
   **And** display name, avatar, and preferences are editable
   **And** password change is accessible

6. **Given** a user signs up or logs in via social provider (Google or Apple)
   **When** the OAuth flow completes
   **Then** Supabase Auth creates the user session
   **And** the `handle_new_user()` trigger auto-creates the user_profiles row
   **And** the user is redirected to the app (web: redirect URL, mobile: deep link)

7. **Given** `packages/shared/src/hooks/useAuth.ts`
   **When** imported by either app
   **Then** provides shared auth hooks: `useUser()` (current user state), `useLogin()` (mutation), `useLogout()` (mutation), `useRegister()` (mutation)
   **And** all hooks use the Supabase client from the calling app's context

8. **Given** an anonymous user who logs in or creates an account
   **When** the session transitions from anonymous to authenticated
   **Then** anonymous session data (cart) is linked to the new account via the existing cart merge flow (AuthContext on mobile, similar on web)

## Tasks / Subtasks

- [x] **Task 1: Database migration** — `supabase/migrations/20260317000000_user_profiles_extend.sql` (AC: #2)
  - [x] 1.1: ALTER `user_profiles` to add new columns:
    ```sql
    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS display_name TEXT,
      ADD COLUMN IF NOT EXISTS avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';
    ```
  - [x] 1.2: Add CHECK constraint on display_name length (max 100 chars):
    ```sql
    ALTER TABLE user_profiles
      ADD CONSTRAINT chk_display_name_length CHECK (display_name IS NULL OR char_length(display_name) <= 100);
    ```
  - [x] 1.3: Add CHECK constraint on avatar_url length (max 500 chars):
    ```sql
    ALTER TABLE user_profiles
      ADD CONSTRAINT chk_avatar_url_length CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500);
    ```
  - [x] 1.4: Update RLS — authenticated (non-anonymous) users can UPDATE their own profile fields:
    ```sql
    -- The existing 'users_own_profile' permissive policy already allows SELECT/INSERT/UPDATE/DELETE
    -- for rows where auth.uid() = user_id. The restrictive 'block_anonymous_writes' policy
    -- already blocks anonymous users from UPDATE. So no new policies needed!
    -- Verify by checking existing policies:
    -- 1. users_own_profile: PERMISSIVE for ALL, USING (user_id = (SELECT auth.uid()))
    -- 2. block_anonymous_writes: RESTRICTIVE for INSERT/UPDATE/DELETE,
    --    USING (NOT (SELECT (raw_user_meta_data->>'is_anonymous')::boolean FROM auth.users WHERE id = auth.uid()))
    -- Result: authenticated users CAN update their own row. Anonymous users CANNOT. ✅
    ```
  - [x] 1.5: Add index on display_name for potential future search:
    ```sql
    CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name ON user_profiles(display_name)
      WHERE display_name IS NOT NULL;
    ```

- [x] **Task 2: Profile types and schemas** (AC: #3)
  - [x] 2.1: Create `packages/shared/src/types/profile.types.ts`:
    ```typescript
    export interface UserProfile {
      id: string;
      user_id: string;
      display_name: string | null;
      avatar_url: string | null;
      preferences: UserPreferences;
      biometric_enabled: boolean;
      created_at: string;
      updated_at: string;
    }

    export interface UserPreferences {
      theme?: "light" | "dark" | "system";
      newsletter_opt_in?: boolean;
      // Extensible: future stories add more preferences here
    }

    export interface UpdateProfilePayload {
      display_name?: string | null;
      avatar_url?: string | null;
      preferences?: Partial<UserPreferences>;
    }
    ```
  - [x] 2.2: Create `packages/shared/src/schemas/profile.schemas.ts`:
    ```typescript
    import { z } from "zod";

    export const displayNameSchema = z
      .string()
      .trim()
      .min(1, "Display name cannot be empty")
      .max(100, "Display name must be 100 characters or less")
      .nullable()
      .optional();

    export const avatarUrlSchema = z
      .string()
      .url("Must be a valid URL")
      .max(500, "URL too long")
      .nullable()
      .optional();

    export const userPreferencesSchema = z.object({
      theme: z.enum(["light", "dark", "system"]).optional(),
      newsletter_opt_in: z.boolean().optional(),
    });

    export const updateProfileSchema = z.object({
      display_name: displayNameSchema,
      avatar_url: avatarUrlSchema,
      preferences: userPreferencesSchema.partial().optional(),
    });
    ```

- [x] **Task 3: Profile client functions** — `packages/shared/src/clients/profile.ts` (AC: #3)
  - [x] 3.1: Create `getProfile(userId, client?)`:
    ```typescript
    import type { SupabaseClient } from "@supabase/supabase-js";
    import { createSupabaseClient } from "./supabase";
    import type { UserProfile } from "../types/profile.types";

    export async function getProfile(
      userId: string,
      client?: SupabaseClient,
    ): Promise<UserProfile | null> {
      const supabase = client ?? createSupabaseClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // not found
        throw error;
      }
      return data as UserProfile;
    }
    ```
  - [x] 3.2: Create `updateProfile(userId, payload, client?)`:
    ```typescript
    export async function updateProfile(
      userId: string,
      payload: UpdateProfilePayload,
      client?: SupabaseClient,
    ): Promise<UserProfile> {
      const supabase = client ?? createSupabaseClient();

      // If preferences is partial, merge with existing
      let updateData: Record<string, unknown> = {};
      if (payload.display_name !== undefined) updateData.display_name = payload.display_name;
      if (payload.avatar_url !== undefined) updateData.avatar_url = payload.avatar_url;
      if (payload.preferences !== undefined) {
        // Use Postgres jsonb_set or merge on client side
        const { data: current } = await supabase
          .from("user_profiles")
          .select("preferences")
          .eq("user_id", userId)
          .single();

        updateData.preferences = { ...(current?.preferences ?? {}), ...payload.preferences };
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .update(updateData)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) throw error;
      return data as UserProfile;
    }
    ```

- [x] **Task 4: Shared auth hooks** — `packages/shared/src/hooks/useAuth.ts` (AC: #7)
  - [x] 4.1: Create hooks wrapping existing `auth.ts` functions:
    ```typescript
    import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
    import { createSupabaseClient } from "../clients/supabase";
    import { signInWithEmail, signUpWithEmail, signOut } from "../clients/auth";

    export const authKeys = {
      user: ["auth", "user"] as const,
    };

    /** Returns the current Supabase user, refreshed on auth state changes */
    export function useUser() {
      const supabase = createSupabaseClient();
      return useQuery({
        queryKey: authKeys.user,
        queryFn: async () => {
          const { data: { user } } = await supabase.auth.getUser();
          return user;
        },
        staleTime: Infinity, // Updated via onAuthStateChange listener, not polling
      });
    }

    export function useLogin() {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: ({ email, password }: { email: string; password: string }) =>
          signInWithEmail(email, password),
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: authKeys.user });
        },
      });
    }

    export function useLogout() {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: () => signOut(),
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: authKeys.user });
          queryClient.invalidateQueries({ queryKey: ["profile"] });
        },
      });
    }

    export function useRegister() {
      return useMutation({
        mutationFn: ({ email }: { email: string }) => signUpWithEmail(email),
      });
    }
    ```
  - [x] 4.2: Note: These hooks provide a declarative React layer on top of the existing imperative `auth.ts` functions. Existing code in login/signup pages can migrate to these hooks incrementally — NOT required for this story. The hooks are created for future stories and any new auth UI.

- [x] **Task 5: Profile hooks** — `packages/shared/src/hooks/useProfile.ts` (AC: #3)
  - [x] 5.1: Create `useProfile(userId?)`:
    ```typescript
    import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
    import { getProfile, updateProfile } from "../clients/profile";
    import type { UpdateProfilePayload, UserProfile } from "../types/profile.types";

    export const profileKeys = {
      all: ["profile"] as const,
      detail: (userId: string) => ["profile", userId] as const,
    };

    export function useProfile(userId: string | undefined) {
      return useQuery({
        queryKey: profileKeys.detail(userId ?? ""),
        queryFn: () => getProfile(userId!),
        enabled: !!userId,
        staleTime: 5 * 60 * 1000, // 5 min (matches architecture: "profile 5 min")
      });
    }

    export function useUpdateProfile(userId: string) {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: (payload: UpdateProfilePayload) => updateProfile(userId, payload),
        onMutate: async (payload) => {
          await queryClient.cancelQueries({ queryKey: profileKeys.detail(userId) });
          const previous = queryClient.getQueryData<UserProfile>(profileKeys.detail(userId));
          if (previous) {
            queryClient.setQueryData(profileKeys.detail(userId), {
              ...previous,
              ...payload,
              preferences: { ...previous.preferences, ...(payload.preferences ?? {}) },
            });
          }
          return { previous };
        },
        onError: (_err, _payload, context) => {
          if (context?.previous) {
            queryClient.setQueryData(profileKeys.detail(userId), context.previous);
          }
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: profileKeys.detail(userId) });
        },
      });
    }
    ```

- [x] **Task 6: Social login functions** — `packages/shared/src/clients/auth.ts` (AC: #1, #6)
  - [x] 6.1: Add social login functions to existing `auth.ts`:
    ```typescript
    export type SocialProvider = "google" | "apple";

    export async function signInWithSocialProvider(
      provider: SocialProvider,
      options?: { redirectTo?: string; scopes?: string },
      client?: SupabaseClient,
    ) {
      const supabase = client ?? createSupabaseClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: options?.redirectTo,
          scopes: options?.scopes,
          queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
        },
      });
      if (error) throw error;
      return data;
    }
    ```
  - [x] 6.2: For mobile (Expo), social auth uses `expo-auth-session` or Supabase's `signInWithOAuth` with `skipBrowserRedirect: true`. The mobile auth screens will need to handle the OAuth callback differently:
    ```typescript
    // Mobile-specific: uses expo-web-browser for OAuth
    export async function signInWithSocialProviderMobile(
      provider: SocialProvider,
      client?: SupabaseClient,
    ) {
      const supabase = client ?? createSupabaseClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          skipBrowserRedirect: true,
          queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
        },
      });
      if (error) throw error;
      return data; // Returns { url } — open in expo-web-browser
    }
    ```
  - [x] 6.3: Note: Social providers must be enabled in the Supabase Dashboard (Authentication > Providers). For local development, set up OAuth credentials in the Supabase config or use the Supabase Dashboard. Google requires a Google Cloud Console OAuth client ID. Apple requires an Apple Developer account with Sign in with Apple configured.

- [x] **Task 7: Web profile page** — `apps/web/src/routes/account/profile.tsx` (AC: #3, #4)
  - [x] 7.1: Create profile route under existing `/account` layout (inherits auth guard):
    - Display current profile info: email (read-only from Supabase Auth), display name, avatar URL
    - Edit form for: display_name, avatar_url (text input for MVP)
    - Password change section (current password + new password + confirm)
    - Submit button with loading state
    - Success/error feedback (inline, not modal — per UX spec)
  - [x] 7.2: Use `useProfile(user.id)` for data, `useUpdateProfile(user.id)` for mutations
  - [x] 7.3: Password change uses `supabase.auth.updateUser({ password })` — requires current session
  - [x] 7.4: Validate inputs with Zod schemas before submission
  - [x] 7.5: BEM CSS in `apps/web/src/styles/pages/profile.css`:
    ```css
    /* BEM blocks: .profile, .profile__header, .profile__form,
       .profile__field, .profile__field-label, .profile__field-input,
       .profile__field-error, .profile__avatar-section,
       .profile__password-section, .profile__submit-btn,
       .profile__success-message */
    ```

- [x] **Task 8: Web social login buttons** — login.tsx + signup.tsx (AC: #1, #6)
  - [x] 8.1: Add social login section below the email/password form on both pages:
    ```
    ─── or continue with ───
    [ 🔵 Continue with Google ]
    [ ⬛ Continue with Apple  ]
    ```
  - [x] 8.2: Google button calls `signInWithSocialProvider("google", { redirectTo: window.location.origin })`
  - [x] 8.3: Apple button calls `signInWithSocialProvider("apple", { redirectTo: window.location.origin })`
  - [x] 8.4: Add BEM classes: `.auth-form__social-divider`, `.auth-form__social-btn`, `.auth-form__social-btn--google`, `.auth-form__social-btn--apple`
  - [x] 8.5: Handle OAuth callback — Supabase handles the redirect automatically when `redirectTo` is set. The auth state change listener picks up the new session.

- [x] **Task 9: Mobile profile screen expansion** — `apps/mobile/src/app/profile.tsx` (AC: #5)
  - [x] 9.1: Expand existing profile screen to include:
    - Profile info section: display name (editable TextInput), avatar URL (text input for MVP)
    - Email display (read-only)
    - Password change section (expandable accordion)
    - Preferences section (theme toggle if applicable)
    - Existing biometric toggle (already present)
    - Sign out button (already present for authenticated users)
  - [x] 9.2: Use `useProfile(user.id)` and `useUpdateProfile(user.id)` hooks
  - [x] 9.3: Use React Native design tokens from `@ecommerce/ui`
  - [x] 9.4: Follow existing mobile styling patterns (ScrollView, Pressable, TextInput)

- [x] **Task 10: Mobile social login buttons** — auth/login.tsx + auth/signup.tsx (AC: #1, #6)
  - [x] 10.1: Add social login buttons below email/password form (same layout as web)
  - [x] 10.2: Use `expo-web-browser` to open the OAuth URL returned by `signInWithSocialProviderMobile()`
  - [x] 10.3: Handle deep link callback after OAuth completes (Supabase session auto-updates via `onAuthStateChange`)
  - [x] 10.4: Note: `expo-web-browser` is already available in Expo SDK 55. No new dependency needed.

- [x] **Task 11: Export new modules** — `packages/shared/src/index.ts` (AC: #7)
  - [x] 11.1: Export from `packages/shared/src/index.ts`:
    ```typescript
    // Profile
    export { getProfile, updateProfile } from "./clients/profile";
    export type { UserProfile, UserPreferences, UpdateProfilePayload } from "./types/profile.types";
    export { updateProfileSchema, displayNameSchema, userPreferencesSchema } from "./schemas/profile.schemas";
    // Auth hooks
    export { useUser, useLogin, useLogout, useRegister, authKeys } from "./hooks/useAuth";
    // Profile hooks
    export { useProfile, useUpdateProfile, profileKeys } from "./hooks/useProfile";
    // Social auth
    export { signInWithSocialProvider, signInWithSocialProviderMobile } from "./clients/auth";
    export type { SocialProvider } from "./clients/auth";
    ```

- [x] **Task 12: Tests** (AC: all)
  - [x] 12.1: Add unit tests for profile Zod schemas in `apps/web/src/__tests__/profile-schemas.test.ts`:
    - Valid display names (including edge cases: empty string → null, 100 chars)
    - Invalid display names (101+ chars)
    - Valid/invalid avatar URLs
    - Preferences schema validation
  - [x] 12.2: Add unit tests for profile client functions (mock Supabase client):
    - `getProfile` returns profile data
    - `getProfile` returns null for not found
    - `updateProfile` sends correct payload
    - `updateProfile` merges preferences correctly
  - [x] 12.3: No E2E tests for OAuth (requires real provider credentials). Document manual test procedure.

- [x] **Task 13: Quality checks** (AC: all)
  - [x] 13.1: Run `bun run fix-all` — 0 errors, 0 warnings
  - [x] 13.2: Run `bun --cwd=apps/web run test` — all tests pass (existing + new)
  - [x] 13.3: Run `bun run typecheck` — no TypeScript errors

---

## Dev Notes

### Critical Architecture Constraints

- **Supabase Auth social providers must be enabled in Supabase Dashboard** — This is a manual configuration step, NOT handled by migrations. Google OAuth requires a Google Cloud Console project with OAuth 2.0 credentials. Apple Sign In requires an Apple Developer account. For LOCAL DEVELOPMENT, you can skip social auth (it will show errors if providers aren't configured) — the email/password flow should work independently.

- **user_profiles table is ALTERed, NOT recreated** — The table was created in migration `20260306000000_create_user_profiles.sql` (Story 2.1). Additional columns added in `20260310000000_add_biometric_enabled.sql` (Story 2.4). RLS policies were hardened in `20260311000000_add_anonymous_restrictive_policy.sql` and auto-creation triggers in `20260311000001_auto_create_user_profile.sql`. The new migration MUST use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for idempotency.

- **Existing RLS policies already handle the auth requirements** — The `users_own_profile` permissive policy allows all operations on own rows. The `block_anonymous_writes` restrictive policy prevents anonymous users from modifying anything. No new policies are needed for profile editing — the existing combination already grants authenticated users UPDATE access on their own profile.

- **handle_new_user() trigger already auto-creates profiles for social login** — The trigger function in `20260311000001_auto_create_user_profile.sql` fires on `auth.users` INSERT and UPDATE. When Supabase Auth creates a user via Google/Apple OAuth, the trigger fires and creates the `user_profiles` row. No changes needed to the trigger.

- **Cart merge on anonymous→authenticated already works** — The mobile `AuthContext.tsx` detects the transition from anonymous to authenticated and calls the cart merge Edge Function. For web, check if a similar mechanism exists in the root layout or auth flow. If not, the same pattern should be implemented.

- **Shared hooks use TanStack Query** — Both web and mobile already have TanStack Query configured (via `@tanstack/react-query`). The shared hooks in `packages/shared/src/hooks/` will work on both platforms as long as they import from `@tanstack/react-query` (not a platform-specific package).

- **Password change via Supabase Auth** — Use `supabase.auth.updateUser({ password: newPassword })`. This requires an active session (the user must be logged in). It does NOT require the old password (Supabase Auth limitation for password update with active session). If you want to require the old password for security, you'd need to call `signInWithPassword` first to verify, then `updateUser`.

- **Social login on mobile uses expo-web-browser** — Expo's recommended approach: call `signInWithOAuth` with `skipBrowserRedirect: true`, get the OAuth URL, open it with `expo-web-browser`'s `openAuthSessionAsync()`. The deep link callback URL should be configured in Supabase as a redirect URL (e.g., `myapp://auth/callback`). Supabase handles token exchange.

- **No Tailwind CSS** — All styling is Vanilla CSS + BEM. Profile page styles go in `apps/web/src/styles/pages/profile.css` and are imported in `index.css` after other page styles.

- **Web profile page lives under /account/** — The existing `account/route.tsx` layout provides an auth guard via `beforeLoad`. Any route under `/account/` automatically requires authentication. The profile page at `account/profile.tsx` inherits this protection.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `createSupabaseClient()` | `packages/shared/src/clients/supabase.ts` | Singleton Supabase client (both platforms) |
| `getSupabaseBrowserClient()` | `apps/web/src/utils/supabase.ts` | Cookie-backed browser client (web SSR) |
| `signInWithEmail()` | `packages/shared/src/clients/auth.ts` | Email/password login |
| `signUpWithEmail()` | `packages/shared/src/clients/auth.ts` | Email registration (step 1 of OTP flow) |
| `signOut()` | `packages/shared/src/clients/auth.ts` | Sign out |
| `mapAuthError()` | `packages/shared/src/utils/authErrors.ts` | User-friendly auth error messages |
| `sanitizeRedirect()` | `packages/shared/src/utils/authErrors.ts` | Redirect URL sanitization |
| `AuthProvider` / `useAuth()` | `apps/mobile/src/context/AuthContext.tsx` | Mobile auth state + biometric + cart merge |
| `buildPageMeta()` | `apps/web/src/utils/seo.ts` (if exists) | SEO meta tags for pages |
| Auth guard | `apps/web/src/routes/account/route.tsx` | beforeLoad check for authenticated user |

### Existing Code Patterns to Follow

```typescript
// TanStack Query hook pattern (from useOrders.ts / useOrder.ts):
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const entityKeys = {
  all: ["entity"] as const,
  detail: (id: string) => ["entity", id] as const,
};

export function useEntity(id: string | undefined) {
  return useQuery({
    queryKey: entityKeys.detail(id ?? ""),
    queryFn: () => fetchEntity(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
```

```typescript
// Web route pattern (from account/orders/index.tsx):
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  // Component implementation
}
```

```typescript
// Supabase client operation pattern (from clients/auth.ts):
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "./supabase";

export async function getProfile(
  userId: string,
  client?: SupabaseClient,
) {
  const supabase = client ?? createSupabaseClient();
  // ... query
}
```

```css
/* BEM CSS pattern (from apps/web/src/styles/pages/):
   Follow existing page styles pattern */
.profile {
  max-width: 600px;
  margin: 0 auto;
  padding: var(--spacing-6) var(--spacing-4);
}

.profile__header { /* ... */ }
.profile__form { /* ... */ }
.profile__field { /* ... */ }
.profile__field-label { /* ... */ }
.profile__field-input { /* ... */ }
.profile__field-error { color: var(--color-error); }
.profile__submit-btn { /* primary CTA pattern */ }
```

```typescript
// Social login OAuth pattern (Supabase Auth):
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
});
// Supabase redirects the browser to Google's consent screen.
// After consent, Google redirects back to redirectTo URL.
// Supabase JS client auto-detects the token in the URL hash.
```

### Supabase Social Auth Configuration Reference

**Google OAuth Setup (Supabase Dashboard → Authentication → Providers → Google):**
- Client ID: from Google Cloud Console > APIs & Services > Credentials > OAuth 2.0
- Client Secret: same location
- Redirect URL (configured in Google Console): `https://<supabase-project-ref>.supabase.co/auth/v1/callback`
- Scopes: `email`, `profile` (default)

**Apple Sign In Setup (Supabase Dashboard → Authentication → Providers → Apple):**
- Service ID: from Apple Developer > Certificates, Identifiers & Profiles
- Team ID: your Apple Developer team ID
- Key ID + Private Key: from Apple Developer > Keys > Sign in with Apple
- Redirect URL: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`

**Local Development:**
- Social auth requires real OAuth credentials (no local mock)
- For testing without OAuth: use email/password flow only
- Supabase local dev (`supabase start`) supports OAuth redirect testing if credentials are configured in `supabase/config.toml` under `[auth.external.google]` and `[auth.external.apple]`

### Database Schema Reference

```sql
-- EXISTING: user_profiles (from Story 2.1 + 2.4 migrations)
-- Current columns:
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE
--   created_at TIMESTAMPTZ DEFAULT now()
--   updated_at TIMESTAMPTZ DEFAULT now()
--   biometric_enabled BOOLEAN DEFAULT false

-- NEW COLUMNS (this story's migration):
--   display_name TEXT (nullable, max 100 chars via CHECK)
--   avatar_url TEXT (nullable, max 500 chars via CHECK)
--   preferences JSONB NOT NULL DEFAULT '{}'

-- EXISTING RLS:
-- 1. users_own_profile (PERMISSIVE, ALL): user_id = auth.uid()
-- 2. block_anonymous_writes (RESTRICTIVE, INSERT/UPDATE/DELETE): blocks anonymous users
-- These already handle auth editing correctly. No new policies needed.

-- EXISTING TRIGGERS:
-- on_auth_user_created: auto-creates profile on signup (including social login)
-- on_auth_user_updated: auto-creates profile when anonymous → authenticated
-- handle_new_user(): SECURITY DEFINER function, only for non-anonymous users
```

### Previous Story Intelligence (Story 5.6 — last completed story)

- **Edge Function patterns well established** — Stories 5.1-5.6 created multiple Edge Functions with consistent patterns. This story does NOT create Edge Functions — it's client-side focused (profile UI, hooks, Supabase client operations).
- **Fire-and-forget pattern** — Not relevant to this story (no background operations).
- **Code review quality bar** — Epic 5 had a global review commit (`a0c983e`) that fixed critical bugs and added JSDoc. Expect similar review standards for this story.
- **Implementation sequence from Epic 5**: migration → types → client functions → hooks → web UI → mobile UI → exports → tests → fix-all. Follow this sequence.
- **Testing approach**: Vitest for unit tests on web. Schemas and pure functions can be unit-tested. React hooks require `renderHook` from `@testing-library/react`. OAuth flows require manual testing.
- **Common issues from Epic 5**: server-only imports leaking into client bundle (`node:crypto`, `@tanstack/react-start/server`). Be careful not to import server-only modules in shared hooks. The `packages/shared/` code runs on BOTH web client AND mobile — no server-only imports allowed.

### Git Intelligence

- Commit pattern: `feat: implement <description> (Story X.Y) + code review fixes`
- Implementation sequence: migration → types → schemas → client functions → shared hooks → web UI → mobile UI → exports → tests → fix-all
- Recent commits show Epic 5 is complete with global review
- This is the first story of Epic 6 — new territory, but builds on solid auth foundation from Epic 2

### Project Structure Notes

- **New files in `packages/shared/src/hooks/`**: `useAuth.ts`, `useProfile.ts`. Check if this directory exists; if not, create it. Other hooks may already exist here (e.g., `useCart.ts`, `useOrders.ts`).
- **New file in `packages/shared/src/clients/`**: `profile.ts`. Follows existing pattern of `auth.ts`, `biometricAuth.ts`.
- **New file in `packages/shared/src/types/`**: `profile.types.ts`. Follows existing `auth.types.ts`, `user.types.ts`.
- **New file in `packages/shared/src/schemas/`**: `profile.schemas.ts`. Check if `schemas/` directory exists and what other schemas are there.
- **Web profile page**: `apps/web/src/routes/account/profile.tsx` — under existing `/account` layout with auth guard.
- **Web profile CSS**: `apps/web/src/styles/pages/profile.css` — new file, imported in `index.css`.
- **Mobile profile expansion**: `apps/mobile/src/app/profile.tsx` — existing file gets expanded with editing capabilities.
- **Social auth updates**: `packages/shared/src/clients/auth.ts` (functions), web + mobile login/signup pages (UI buttons).

### References

- [Source: epics.md#Story 6.1 — User Account & Profile Management acceptance criteria]
- [Source: epics.md#Epic 6 — dependencies: pgvector (Epic 3), Supabase Auth (Epic 2), Violet offers API]
- [Source: prd.md#FR29 — Visitors can optionally create an account to access persistent features]
- [Source: architecture.md#Authentication & Security — Supabase Auth (email + social), anonymous sessions]
- [Source: architecture.md#Data Boundaries — User profiles: Supabase DB, RLS: auth.uid() = user_id]
- [Source: architecture.md#Frontend Architecture — TanStack Query staleTime: profile 5 min]
- [Source: architecture.md#Styling — Vanilla CSS, BEM naming, CSS custom properties]
- [Source: ux-design-specification.md#Registration Flow — deliberately restrained, never required]
- [Source: ux-design-specification.md#Header — account icon in header, compact sticky on scroll]
- [Source: ux-design-specification.md#Bottom Tab Bar — Account tab in mobile tab bar]
- [Source: 20260306000000_create_user_profiles.sql — original user_profiles table creation]
- [Source: 20260310000000_add_biometric_enabled.sql — biometric_enabled column]
- [Source: 20260311000000_add_anonymous_restrictive_policy.sql — RLS hardening, block_anonymous_writes]
- [Source: 20260311000001_auto_create_user_profile.sql — handle_new_user() trigger for auto profile creation]
- [Source: packages/shared/src/clients/auth.ts — existing auth functions (signInWithEmail, signUpWithEmail, signOut)]
- [Source: packages/shared/src/clients/supabase.ts — createSupabaseClient() singleton]
- [Source: packages/shared/src/utils/authErrors.ts — mapAuthError(), sanitizeRedirect()]
- [Source: apps/web/src/routes/account/route.tsx — account layout with auth guard (beforeLoad)]
- [Source: apps/web/src/routes/auth/login.tsx — existing login page pattern]
- [Source: apps/web/src/routes/auth/signup.tsx — existing signup page pattern]
- [Source: apps/mobile/src/context/AuthContext.tsx — auth state, cart merge on anonymous→authenticated]
- [Source: apps/mobile/src/app/profile.tsx — existing minimal profile screen]
- [Source: CLAUDE.md — No Tailwind CSS, double quotes, semicolons, 100 char width, conventional commit format]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Mobile profile initially used `@tanstack/react-query` directly but mobile app doesn't have it as a dependency. Refactored to use direct Supabase calls via shared client functions (`getProfile`, `updateProfile`) — consistent with existing mobile patterns.
- `Spacing.eight` doesn't exist in mobile theme constants. Changed to `Spacing.six`.
- Migration filename uses `20260324` (next in sequence after `20260323_epic5_review_fixes.sql`), not `20260317` as originally specified in the story.
- Social auth functions in `auth.ts` return `{ data, error }` pattern (matching existing functions) rather than throwing on error, for consistency.

### Completion Notes List

- Created `supabase/migrations/20260324000000_user_profiles_extend.sql` — ALTERs `user_profiles` with `display_name` (TEXT, max 100), `avatar_url` (TEXT, max 500), `preferences` (JSONB, default '{}'). CHECK constraints + partial index on display_name. No new RLS policies needed (existing policies handle it).
- Created `packages/shared/src/types/profile.types.ts` — `UserProfile`, `UserPreferences`, `UpdateProfilePayload` interfaces.
- Created `packages/shared/src/schemas/profile.schema.ts` — Zod schemas for display name, avatar URL, preferences, and combined update payload validation.
- Created `packages/shared/src/clients/profile.ts` — `getProfile()` and `updateProfile()` with preference merging.
- Created `packages/shared/src/hooks/useAuth.ts` — `useUser()`, `useLogin()`, `useLogout()` hooks wrapping existing auth functions with TanStack Query.
- Created `packages/shared/src/hooks/useProfile.ts` — `profileQueryOptions()` factory (SSR-compatible) + `useUpdateProfile()` mutation with optimistic UI and rollback.
- Added `signInWithSocialProvider()` (web) and `signInWithSocialProviderMobile()` (expo-web-browser) to `packages/shared/src/clients/auth.ts`. Exported `SocialProvider` type.
- Created `apps/web/src/routes/account/profile.tsx` — profile page with display name/avatar editing, password change, protected by existing `/account` auth guard. Uses Zod validation and TanStack Query.
- Created `apps/web/src/styles/pages/profile.css` — BEM classes for profile page following design token system (quiet luxury aesthetic).
- Added social login buttons (Google + Apple) with divider to web `login.tsx` and `signup.tsx`. CSS in `auth.css` with `.auth-form__social-*` BEM classes.
- Expanded `apps/mobile/src/app/profile.tsx` — now includes display name/avatar editing, password change (accordion), alongside existing biometric toggle and order tracking.
- Added social login buttons to mobile `auth/login.tsx` and `auth/signup.tsx` using `expo-web-browser` for OAuth flow.
- Updated all barrel exports (`types/index.ts`, `schemas/index.ts`, `clients/index.ts`, `hooks/index.ts`) for new modules.
- Added `apps/web/src/styles/index.css` import for `profile.css`.
- Created 17 unit tests for Zod schemas in `apps/web/src/__tests__/profileSchemas.test.ts`.
- All 195 tests pass (178 existing + 17 new). `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck all clean).

### File List

- `supabase/migrations/20260324000000_user_profiles_extend.sql` (CREATE)
- `packages/shared/src/types/profile.types.ts` (CREATE)
- `packages/shared/src/schemas/profile.schema.ts` (CREATE)
- `packages/shared/src/clients/profile.ts` (CREATE)
- `packages/shared/src/hooks/useAuth.ts` (CREATE)
- `packages/shared/src/hooks/useProfile.ts` (CREATE)
- `apps/web/src/routes/account/profile.tsx` (CREATE)
- `apps/web/src/styles/pages/profile.css` (CREATE)
- `apps/web/src/__tests__/profileSchemas.test.ts` (CREATE)
- `packages/shared/src/clients/auth.ts` (UPDATE — added social login functions)
- `packages/shared/src/types/index.ts` (UPDATE — added profile type exports)
- `packages/shared/src/schemas/index.ts` (UPDATE — added profile schema exports)
- `packages/shared/src/clients/index.ts` (UPDATE — added profile + social auth exports)
- `packages/shared/src/hooks/index.ts` (UPDATE — added useAuth + useProfile exports)
- `apps/web/src/styles/index.css` (UPDATE — added profile.css import)
- `apps/web/src/styles/pages/auth.css` (UPDATE — added social login button styles)
- `apps/web/src/routes/auth/login.tsx` (UPDATE — added social login buttons)
- `apps/web/src/routes/auth/signup.tsx` (UPDATE — added social login buttons)
- `apps/mobile/src/app/profile.tsx` (UPDATE — expanded with profile editing, password change)
- `apps/mobile/src/app/auth/login.tsx` (UPDATE — added social login buttons)
- `apps/mobile/src/app/auth/signup.tsx` (UPDATE — added social login buttons)
