// apps/web/src/routes/auth/login.tsx
//
// /auth/login — Sign in page.
// Migrated from Supabase Auth to Convex Auth (Phase 5).
//
// Convex Auth sign-in:
//   signIn("password", { email, password, flow: "signIn" })
//   On success, useConvexAuth() updates reactively.
//
// OAuth providers (Google, Apple) are commented out until credentials are configured.
// See convex/auth.ts for OAuth setup instructions.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { buildPageMeta, mapAuthError } from "@ecommerce/shared";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

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
  const { signIn } = useAuthActions();

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
      await signIn("password", { email, password, flow: "signIn" });
      await navigate({ to: redirect });
    } catch (err) {
      setError(mapAuthError(err, "signIn"));
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

        {/* OAuth buttons — uncomment when credentials are configured in convex/auth.ts */}
        {/*
        <div className="auth-form__social-divider">
          <span>or continue with</span>
        </div>

        <div className="auth-form__social-buttons">
          <button
            type="button"
            className="auth-form__social-btn auth-form__social-btn--google"
            onClick={() => signIn("google")}
          >
            Continue with Google
          </button>
          <button
            type="button"
            className="auth-form__social-btn auth-form__social-btn--apple"
            onClick={() => signIn("apple")}
          >
            Continue with Apple
          </button>
        </div>
        */}

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
