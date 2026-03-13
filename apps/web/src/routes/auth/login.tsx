import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signInWithEmail, mapAuthError, sanitizeRedirect, buildPageMeta } from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "../../utils/supabase";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

/**
 * /auth/login route — Sign in page.
 *
 * ## SEO (Story 3.8)
 *
 * Auth pages use `buildPageMeta({ noindex: true })` for consistency with
 * the centralized SEO utility. Even though noindex pages aren't ranked,
 * `buildPageMeta` ensures OG tags and description are present — useful when
 * users share login links on social media (the preview card still renders).
 */
export const Route = createFileRoute("/auth/login")({
  head: () => ({
    meta: buildPageMeta({
      title: "Sign In | Maison Émile",
      description: "Sign in to your Maison Émile account.",
      url: "/auth/login",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || "/",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!email) errors.email = "Email is required";
    if (!password) errors.password = "Password is required";
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
      const { error: authError } = await signInWithEmail(email, password, supabase);

      if (authError) {
        setError(mapAuthError(authError.message));
        return;
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
      <h1 className="auth-page__heading">Welcome Back</h1>
      <p className="auth-page__subheading">Sign in to your account</p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="auth-form__global-error">{error}</div>}

        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            className={`auth-form__input${fieldErrors.email ? " auth-form__input--error" : ""}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {fieldErrors.email && <p className="auth-form__error">{fieldErrors.email}</p>}
        </div>

        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className={`auth-form__input${fieldErrors.password ? " auth-form__input--error" : ""}`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {fieldErrors.password && <p className="auth-form__error">{fieldErrors.password}</p>}
        </div>

        <button className="auth-form__submit" type="submit" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign In"}
        </button>

        <div className="auth-form__footer">
          Don&apos;t have an account?{" "}
          <Link to="/auth/signup" search={{ redirect }}>
            Create one
          </Link>
        </div>
      </form>
    </section>
  );
}
