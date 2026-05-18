// apps/web/src/routes/auth/signup.tsx
//
// /auth/signup — Account creation page.
// Migrated from Supabase Auth to Convex Auth (Phase 5).
//
// Convex Auth sign-up flow with email verification:
//   1. signIn("password", { email, password, name, flow: "signUp" })
//      → Creates account in "pending verification" state
//      → Sends 6-digit OTP via Resend (configured in convex/lib/resendOTP.ts)
//   2. Navigate to /auth/verify with email + password in router state
//   3. User enters code → signIn("password", { email, password, flow: "signUp", code })
//      → Verifies code, activates account, signs user in
//   4. migrateAnonymousData(localId) called in verify page to transfer wishlist/events

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { buildPageMeta, mapAuthError } from "@ecommerce/shared";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/auth/signup")({
  head: () => ({
    meta: buildPageMeta({
      title: "Create Account | Maison Émile",
      description: "Create a Maison Émile account for a curated shopping experience.",
      url: "/auth/signup",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || "/",
  }),
  component: SignupPage,
});

function SignupPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { signIn } = useAuthActions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!email) errors.email = "Email is required";
    if (!password) errors.password = "Password is required";
    else if (password.length < 8) errors.password = "Password must be at least 8 characters";
    else if (!/[A-Z]/.test(password)) errors.password = "Password must include an uppercase letter";
    else if (!/[a-z]/.test(password)) errors.password = "Password must include a lowercase letter";
    else if (!/\d/.test(password)) errors.password = "Password must include a digit";
    if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!validate()) return;

    setIsLoading(true);
    try {
      // Convex Auth: sign-up sends verification OTP via Resend.
      // Account is created in "pending verification" state.
      await signIn("password", {
        email,
        password,
        ...(name ? { name } : {}),
        flow: "signUp",
      });

      // Navigate to verify page with email + password in router state.
      // Password is passed in-memory only (never persisted to storage).
      await navigate({
        to: "/auth/verify",
        search: { email, redirect },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- password passed via in-memory router state
        state: { password } as any,
      });
    } catch (err) {
      setError(mapAuthError(err, "signUp"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="page-wrap auth-page">
      <h1 className="auth-page__heading">Create Account</h1>
      <p className="auth-page__subheading">Join us for a curated shopping experience</p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="auth-form__global-error">{error}</div>}

        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor="signup-name">
            Name (optional)
          </label>
          <input
            id="signup-name"
            className="auth-form__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="How you'd like to be called"
          />
        </div>

        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor="signup-email">
            Email
          </label>
          <input
            id="signup-email"
            className={`auth-form__input${fieldErrors.email ? " auth-form__input--error" : ""}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {fieldErrors.email && <p className="auth-form__error">{fieldErrors.email}</p>}
        </div>

        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            className={`auth-form__input${fieldErrors.password ? " auth-form__input--error" : ""}`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.password && <p className="auth-form__error">{fieldErrors.password}</p>}
        </div>

        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor="signup-confirm">
            Confirm Password
          </label>
          <input
            id="signup-confirm"
            className={`auth-form__input${fieldErrors.confirmPassword ? " auth-form__input--error" : ""}`}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.confirmPassword && (
            <p className="auth-form__error">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <button className="auth-form__submit" type="submit" disabled={isLoading}>
          {isLoading ? "Sending verification..." : "Create Account"}
        </button>

        <div className="auth-form__footer">
          Already have an account?{" "}
          <Link to="/auth/login" search={{ redirect }}>
            Sign in
          </Link>
        </div>
      </form>
    </section>
  );
}
