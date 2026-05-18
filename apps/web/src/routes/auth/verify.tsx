// apps/web/src/routes/auth/verify.tsx
//
// /auth/verify — Email OTP verification page.
// Migrated from Supabase Auth to Convex Auth (Phase 5).
//
// Convex Auth verification flow:
//   1. Signup page calls signIn("password", { flow: "signUp" }) → sends OTP via Resend
//   2. This page collects the 6-digit code
//   3. signIn("password", { flow: "signUp", code }) verifies the code
//   4. On success, anonymous data (wishlist, events) is migrated from localId → userId
//   5. Navigate to the redirect URL
//
// The password is passed via TanStack Router's in-memory state (never persisted).
// If the user refreshes, the password is lost and they must start over.

import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { buildPageMeta, clearLocalId, getLocalId, mapAuthError } from "@ecommerce/shared";
import { api } from "#convex/_generated/api";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/auth/verify")({
  head: () => ({
    meta: buildPageMeta({
      title: "Verify Email | Maison Émile",
      description: "Verify your email address to complete Maison Émile account creation.",
      url: "/auth/verify",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
    redirect: (search.redirect as string) || "/",
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { email, redirect } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();

  // Password passed via router state (in-memory only, never persisted to storage)
  const password = (router.state.location.state as { password?: string })?.password ?? "";

  const { signIn } = useAuthActions();
  const migrateAnonymous = useMutation(api.users.mutations.migrateAnonymousData);

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!email) {
    return (
      <section className="page-wrap auth-page">
        <h1 className="auth-page__heading">Verification</h1>
        <p className="auth-page__subheading">
          No email to verify.{" "}
          <Link to="/auth/signup" search={{ redirect }}>
            Sign up
          </Link>
        </p>
      </section>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!otp || otp.length !== 6) {
      setError("Please enter the 6-digit code from your email");
      return;
    }

    setIsLoading(true);
    try {
      // Step 1: Verify OTP and complete sign-up.
      // Convex Auth activates the account and signs the user in.
      await signIn("password", {
        email,
        password,
        flow: "signUp",
        code: otp,
      });

      // Step 2: Migrate anonymous data (wishlist, events) from localId → userId.
      // The user is now authenticated, so the mutation can read their identity.
      const localId = getLocalId();
      if (localId) {
        try {
          await migrateAnonymous({ localId });
          clearLocalId();
        } catch (migrationErr) {
          // Migration failure is non-blocking — user is still signed in.
          // eslint-disable-next-line no-console
          console.warn("[auth] Anonymous data migration failed:", migrationErr);
        }
      }

      // Step 3: Navigate to the redirect URL.
      await navigate({ to: redirect });
    } catch (err) {
      setError(mapAuthError(err, "verify"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="page-wrap auth-page">
      <h1 className="auth-page__heading">Check Your Email</h1>
      <p className="auth-page__subheading">
        We sent a 6-digit code to <strong>{email}</strong>
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="auth-form__global-error">{error}</div>}

        {!password && (
          <div className="auth-form__global-error">
            Session expired. Please{" "}
            <Link to="/auth/signup" search={{ redirect }}>
              start over
            </Link>
            .
          </div>
        )}

        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor="verify-otp">
            Verification Code
          </label>
          <input
            id="verify-otp"
            className={`auth-form__input auth-form__input--otp${error ? " auth-form__input--error" : ""}`}
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

        <button className="auth-form__submit" type="submit" disabled={isLoading || !password}>
          {isLoading ? "Verifying..." : "Verify & Create Account"}
        </button>

        <div className="auth-form__footer">
          Didn&apos;t receive a code?{" "}
          <Link to="/auth/signup" search={{ redirect }}>
            Try again
          </Link>
        </div>
      </form>
    </section>
  );
}
