/**
 * Profile Page — /account/profile
 *
 * Migrated from Supabase to Convex Auth (Phase 5).
 * Fix M4: Change password flow now includes inline OTP + new password form.
 *
 * Uses Convex queries for profile data and mutations for updates.
 * No more Supabase client or server functions needed.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "#convex/_generated/api";
import { buildPageMeta } from "@ecommerce/shared";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

type PasswordStep = "idle" | "otp-sent" | "success";

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
  component: ProfilePage,
});

function ProfilePage() {
  const { isAuthenticated } = useConvexAuth();
  const identity = useQuery(api.users.queries.getIdentity, isAuthenticated ? {} : "skip");
  const profile = useQuery(api.users.queries.getProfile, isAuthenticated ? {} : "skip");
  const updateProfile = useMutation(api.users.mutations.updateProfile);
  const { signIn } = useAuthActions();

  // Profile form state — synced from query data via useEffect
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [preferenceError, setPreferenceError] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? "");
      setAvatarUrl(profile.avatarUrl ?? "");
    }
  }, [profile]);

  // Password form state — multi-step: idle → otp-sent → success
  const [passwordStep, setPasswordStep] = useState<PasswordStep>("idle");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setFieldErrors({});

    try {
      await updateProfile({
        displayName: displayName || undefined,
        avatarUrl: avatarUrl || undefined,
      });
      setProfileSuccess("Profile updated successfully.");
    } catch {
      setProfileError("Failed to update profile. Please try again.");
    }
  }

  /** Step 1: Request password reset — sends OTP to email. */
  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");

    if (!identity?.email) {
      setPasswordError("No email associated with account.");
      return;
    }

    setIsPasswordLoading(true);
    try {
      await signIn("password", {
        email: identity.email,
        flow: "reset",
      });
      setPasswordStep("otp-sent");
    } catch {
      setPasswordError("Failed to send verification code. Please try again.");
    } finally {
      setIsPasswordLoading(false);
    }
  }

  /** Step 2: Verify OTP + set new password. */
  async function handleCompleteReset(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");

    if (!otp || otp.length !== 6) {
      setPasswordError("Please enter the 6-digit code from your email.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(
        "Password must be at least 8 characters with uppercase, lowercase, and a digit.",
      );
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError("Password must include uppercase, lowercase, and a digit.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (!identity?.email) {
      setPasswordError("No email associated with account.");
      return;
    }

    setIsPasswordLoading(true);
    try {
      await signIn("password", {
        email: identity.email,
        flow: "reset-verification",
        code: otp,
        newPassword,
      });
      setPasswordStep("success");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("invalid") || msg.includes("code") || msg.includes("verification")) {
        setPasswordError("Invalid verification code. Please try again.");
      } else if (msg.includes("expired")) {
        setPasswordError("Verification code expired. Please request a new one.");
      } else {
        setPasswordError("Failed to change password. Please try again.");
      }
    } finally {
      setIsPasswordLoading(false);
    }
  }

  if (profile === undefined) {
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
              value={identity?.email ?? ""}
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
            <button className="profile__submit" type="submit">
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* ── Preferences Section ── */}
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
            checked={profile?.preferences?.personalized_search !== false}
            onChange={async (e) => {
              setPreferenceError("");
              try {
                await updateProfile({
                  preferences: {
                    ...(profile?.preferences as Record<string, unknown>),
                    personalized_search: e.target.checked,
                  },
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

        {passwordStep === "success" ? (
          <div className="profile__success">Password changed successfully.</div>
        ) : passwordStep === "otp-sent" ? (
          /* Step 2: Enter OTP + new password */
          <form onSubmit={handleCompleteReset} noValidate>
            {passwordError && <div className="profile__error">{passwordError}</div>}

            <p className="profile__field-hint" style={{ marginBottom: "1rem" }}>
              We sent a 6-digit code to <strong>{identity?.email}</strong>.
            </p>

            <div className="profile__field">
              <label className="profile__label" htmlFor="profile-otp">
                Verification Code
              </label>
              <input
                id="profile-otp"
                className="profile__input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                autoComplete="one-time-code"
                autoFocus
              />
            </div>

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
              <button
                type="button"
                className="profile__submit profile__submit--secondary"
                onClick={() => {
                  setPasswordStep("idle");
                  setPasswordError("");
                  setOtp("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          /* Step 1: Request password reset */
          <form onSubmit={handleRequestReset} noValidate>
            {passwordError && <div className="profile__error">{passwordError}</div>}

            <p className="profile__field-hint" style={{ marginBottom: "1rem" }}>
              Click below to receive a verification code at your email address. You&apos;ll then
              enter the code along with your new password.
            </p>

            <div className="profile__actions">
              <button className="profile__submit" type="submit" disabled={isPasswordLoading}>
                {isPasswordLoading ? "Sending..." : "Send Verification Code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
