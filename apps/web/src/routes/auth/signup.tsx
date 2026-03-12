import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signUpWithEmail, mapAuthError } from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "../../utils/supabase";

export const Route = createFileRoute("/auth/signup")({
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
      const { error: authError } = await signUpWithEmail(email, supabase);

      if (authError) {
        setError(mapAuthError(authError.message));
        return;
      }

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
