import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  verifyEmailOtp,
  setAccountPassword,
  mapAuthError,
  sanitizeRedirect,
  buildPageMeta,
} from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "../../utils/supabase";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * /auth/verify route — Email OTP verification page.
 *
 * ## SEO (Story 3.8)
 *
 * Uses `buildPageMeta({ noindex: true })` — consistent with all auth routes.
 * @see /auth/login for rationale on using buildPageMeta on noindex pages.
 */
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
      const supabase = getSupabaseBrowserClient();

      const { error: verifyError } = await verifyEmailOtp(email, otp, supabase);
      if (verifyError) {
        setError(mapAuthError(verifyError.message));
        return;
      }

      if (password) {
        const { error: pwError } = await setAccountPassword(password, supabase);
        if (pwError) {
          setError(mapAuthError(pwError.message));
          return;
        }
      }

      // Create user_profiles row
      // Note: user_profiles row is auto-created by DB trigger (on_auth_user_created/on_auth_user_updated).
      // This upsert is a safety net in case the trigger hasn't fired yet due to race conditions.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .upsert({ user_id: user.id });
        if (profileError) {
          // eslint-disable-next-line no-console
          console.error("[auth] Failed to create user profile:", profileError.message);
        }
      }

      await navigate({ to: sanitizeRedirect(redirect) });
    } catch {
      setError("An unexpected error occurred. Please try again.");
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
