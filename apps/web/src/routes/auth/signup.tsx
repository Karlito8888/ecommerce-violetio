import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  signUpWithEmail,
  signInWithSocialProvider,
  mapAuthError,
  sanitizeRedirect,
  buildPageMeta,
} from "@ecommerce/shared";
import type { SocialProvider } from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "../../utils/supabase";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * /auth/signup route — Account creation page.
 *
 * ## SEO (Story 3.8)
 *
 * Uses `buildPageMeta({ noindex: true })` — consistent with all auth routes.
 * @see /auth/login for rationale on using buildPageMeta on noindex pages.
 */
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);

  async function handleSocialLogin(provider: SocialProvider) {
    setError("");
    setSocialLoading(provider);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: oauthError } = await signInWithSocialProvider(
        provider,
        { redirectTo: `${window.location.origin}${sanitizeRedirect(redirect)}` },
        supabase,
      );
      if (oauthError) {
        setError(mapAuthError(oauthError.message));
        setSocialLoading(null);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setSocialLoading(null);
    }
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!email) errors.email = "Email is required";
    if (!password) errors.password = "Password is required";
    else if (password.length < 6) errors.password = "Password must be at least 6 characters";
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
      const supabase = getSupabaseBrowserClient();
      const { data, error: authError } = await signUpWithEmail(email, password, supabase);

      if (authError) {
        setError(mapAuthError(authError.message));
        return;
      }

      // When email confirmations are disabled, the email is confirmed immediately
      // and the account is ready to use — skip the OTP verify page.
      if (data?.user?.email_confirmed_at) {
        await navigate({ to: sanitizeRedirect(redirect) });
        return;
      }

      // Email confirmations enabled — OTP was sent, go to verify page.
      await navigate({
        to: "/auth/verify",
        search: { email, redirect },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- password passed via in-memory router state
        state: { password } as any,
      });
    } catch {
      setError("An unexpected error occurred. Please try again.");
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

        <div className="auth-form__social-divider">
          <span>or continue with</span>
        </div>

        <div className="auth-form__social-buttons">
          <button
            type="button"
            className="auth-form__social-btn auth-form__social-btn--google"
            onClick={() => handleSocialLogin("google")}
            disabled={socialLoading !== null}
          >
            {socialLoading === "google" ? "Redirecting..." : "Continue with Google"}
          </button>
          <button
            type="button"
            className="auth-form__social-btn auth-form__social-btn--apple"
            onClick={() => handleSocialLogin("apple")}
            disabled={socialLoading !== null}
          >
            {socialLoading === "apple" ? "Redirecting..." : "Continue with Apple"}
          </button>
        </div>

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
