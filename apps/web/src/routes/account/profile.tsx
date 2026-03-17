/**
 * Profile Page — /account/profile (Story 6.1)
 *
 * Allows authenticated users to view and edit their display name, avatar URL,
 * and change their password. Email is displayed read-only (managed by Supabase Auth).
 *
 * ## Auth
 * Protected by the `/account` layout auth guard (account/route.tsx).
 *
 * ## Data
 * Uses `profileQueryOptions` for SSR-compatible data fetching and
 * `useUpdateProfile` for optimistic mutations via TanStack Query.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  profileQueryOptions,
  useUpdateProfile,
  updateProfileSchema,
  mapAuthError,
  buildPageMeta,
} from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "#/utils/supabase";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/account/profile")({
  head: () => ({
    meta: buildPageMeta({
      title: "My Profile | Maison Émile",
      description: "Manage your Maison Émile account settings.",
      url: "/account/profile",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  loader: async ({ context }) => {
    const { user } = context as { user: { id: string; email: string | null } };
    await context.queryClient.ensureQueryData(profileQueryOptions(user.id));
    return { user };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useLoaderData();
  const profile = useQuery(profileQueryOptions(user.id));
  const updateProfile = useUpdateProfile(user.id);

  // Profile form state — synced from query data via useEffect
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [preferenceError, setPreferenceError] = useState("");

  useEffect(() => {
    if (profile.data) {
      setDisplayName(profile.data.display_name ?? "");
      setAvatarUrl(profile.data.avatar_url ?? "");
    }
  }, [profile.data]);

  // Password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setFieldErrors({});

    const parsed = updateProfileSchema.safeParse({
      display_name: displayName || null,
      avatar_url: avatarUrl || null,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? "form";
        errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    try {
      await updateProfile.mutateAsync(parsed.data);
      setProfileSuccess("Profile updated successfully.");
    } catch {
      setProfileError("Failed to update profile. Please try again.");
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsPasswordLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(mapAuthError(error.message));
        return;
      }
      setPasswordSuccess("Password changed successfully.");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError("An unexpected error occurred.");
    } finally {
      setIsPasswordLoading(false);
    }
  }

  if (profile.isLoading) {
    return (
      <section className="page-wrap profile">
        <h1 className="profile__heading">My Profile</h1>
        <div className="profile__section">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </section>
    );
  }

  return (
    <section className="page-wrap profile">
      <h1 className="profile__heading">My Profile</h1>
      <p className="profile__subheading">Manage your account details</p>

      {/* ── Profile Info Section ── */}
      <div className="profile__section">
        <h2 className="profile__section-title">Personal Information</h2>
        <form onSubmit={handleProfileSubmit} noValidate>
          {profileSuccess && <div className="profile__success">{profileSuccess}</div>}
          {profileError && <div className="profile__error">{profileError}</div>}

          <div className="profile__field">
            <label className="profile__label" htmlFor="profile-email">
              Email
            </label>
            <input
              id="profile-email"
              className="profile__input profile__input--readonly"
              type="email"
              value={user.email ?? ""}
              readOnly
            />
            <p className="profile__field-hint">Email is managed by your login provider.</p>
          </div>

          <div className="profile__field">
            <label className="profile__label" htmlFor="profile-display-name">
              Display Name
            </label>
            <input
              id="profile-display-name"
              className={`profile__input${fieldErrors.display_name ? " profile__input--error" : ""}`}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you'd like to be called"
              maxLength={100}
            />
            {fieldErrors.display_name && (
              <p className="profile__field-error">{fieldErrors.display_name}</p>
            )}
          </div>

          <div className="profile__field">
            <label className="profile__label" htmlFor="profile-avatar">
              Avatar URL
            </label>
            <input
              id="profile-avatar"
              className={`profile__input${fieldErrors.avatar_url ? " profile__input--error" : ""}`}
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
            />
            {fieldErrors.avatar_url && (
              <p className="profile__field-error">{fieldErrors.avatar_url}</p>
            )}
          </div>

          <div className="profile__actions">
            <button className="profile__submit" type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Preferences Section (Story 6.3) ── */}
      <div className="profile__section">
        <h2 className="profile__section-title">Preferences</h2>
        {preferenceError && <div className="profile__error">{preferenceError}</div>}
        <div className="profile__field profile__field--toggle">
          <div className="profile__toggle-info">
            <label className="profile__label" htmlFor="personalized-search">
              Personalized search results
            </label>
            <p className="profile__field-hint">
              When enabled, search results are tailored based on your browsing history and
              preferences.
            </p>
          </div>
          <input
            type="checkbox"
            id="personalized-search"
            className="profile__checkbox"
            checked={profile.data?.preferences?.personalized_search !== false}
            onChange={async (e) => {
              setPreferenceError("");
              try {
                await updateProfile.mutateAsync({
                  preferences: { personalized_search: e.target.checked },
                });
              } catch {
                setPreferenceError("Failed to update preference. Please try again.");
              }
            }}
          />
        </div>
      </div>

      {/* ── Password Section ── */}
      <div className="profile__section">
        <h2 className="profile__section-title">Change Password</h2>
        <form onSubmit={handlePasswordSubmit} noValidate>
          {passwordSuccess && <div className="profile__success">{passwordSuccess}</div>}
          {passwordError && <div className="profile__error">{passwordError}</div>}

          <div className="profile__field">
            <label className="profile__label" htmlFor="profile-new-password">
              New Password
            </label>
            <input
              id="profile-new-password"
              className="profile__input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          <div className="profile__field">
            <label className="profile__label" htmlFor="profile-confirm-password">
              Confirm Password
            </label>
            <input
              id="profile-confirm-password"
              className="profile__input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="profile__actions">
            <button className="profile__submit" type="submit" disabled={isPasswordLoading}>
              {isPasswordLoading ? "Changing..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
