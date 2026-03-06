import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { verifyEmailOtp, setAccountPassword, mapAuthError } from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "../../utils/supabase";

export const Route = createFileRoute("/auth/verify")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
    redirect: (search.redirect as string) || "/",
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { email, redirect } = Route.useSearch();
  const navigate = useNavigate();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasPendingPassword, setHasPendingPassword] = useState(false);

  useEffect(() => {
    setHasPendingPassword(!!sessionStorage.getItem("_signup_pwd"));
  }, []);

  // Redirect to signup if no email or no pending password
  if (!email) {
    return (
      <main className="page-wrap auth-page">
        <h1 className="auth-page__heading">Verification</h1>
        <p className="auth-page__subheading">
          No email to verify.{" "}
          <Link to="/auth/signup" search={{ redirect }}>
            Sign up
          </Link>
        </p>
      </main>
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

      // Step 2: Verify OTP
      const { error: verifyError } = await verifyEmailOtp(email, otp, supabase);
      if (verifyError) {
        setError(mapAuthError(verifyError.message));
        return;
      }

      // Step 3: Set password
      const pendingPassword = sessionStorage.getItem("_signup_pwd");
      if (pendingPassword) {
        const { error: pwError } = await setAccountPassword(pendingPassword, supabase);
        if (pwError) {
          setError(mapAuthError(pwError.message));
          return;
        }
        sessionStorage.removeItem("_signup_pwd");
      }

      // Step 4: Create user_profiles row
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

      await navigate({ to: redirect });
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page-wrap auth-page">
      <h1 className="auth-page__heading">Check Your Email</h1>
      <p className="auth-page__subheading">
        We sent a 6-digit code to <strong>{email}</strong>
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="auth-form__global-error">{error}</div>}

        {!hasPendingPassword && (
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

        <button
          className="auth-form__submit"
          type="submit"
          disabled={isLoading || !hasPendingPassword}
        >
          {isLoading ? "Verifying..." : "Verify & Create Account"}
        </button>

        <div className="auth-form__footer">
          Didn&apos;t receive a code?{" "}
          <Link to="/auth/signup" search={{ redirect }}>
            Try again
          </Link>
        </div>
      </form>
    </main>
  );
}
