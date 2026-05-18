// @ecommerce/shared — Auth error mapping for Convex Auth.
//
// Replaces the Supabase-specific mapAuthError with a Convex Auth version.
// Each auth context (login, signup, verify, reset) has different error patterns
// to map — controlled via the `context` parameter.
//
// Used by:
//   apps/web/src/routes/auth/*.tsx
//   apps/mobile/src/app/auth/*.tsx

type AuthErrorContext = "signIn" | "signUp" | "verify" | "reset";

/**
 * Maps a Convex Auth error to a user-friendly message.
 *
 * Convex Auth throws Error instances with lowercase messages containing
 * keywords like "invalid", "expired", "rate", etc. We match on substrings
 * rather than exact messages because the error text varies between providers.
 *
 * @param error - The error thrown by signIn() / signOut()
 * @param context - The auth flow context for context-specific messages
 */
export function mapAuthError(error: unknown, context: AuthErrorContext): string {
  if (!(error instanceof Error)) {
    return "An unexpected error occurred. Please try again.";
  }

  const msg = error.message.toLowerCase();

  // Common patterns across all contexts
  if (msg.includes("rate") || msg.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  // Context-specific patterns
  switch (context) {
    case "signIn":
      if (msg.includes("invalid") || msg.includes("credential") || msg.includes("password")) {
        return "Invalid email or password.";
      }
      if (msg.includes("not found") || msg.includes("no user")) {
        return "No account found with this email.";
      }
      break;

    case "signUp":
      if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
        return "An account with this email already exists.";
      }
      if (msg.includes("invalid") || msg.includes("password")) {
        return "Invalid email or password.";
      }
      break;

    case "verify":
      if (msg.includes("expired")) {
        return "Verification code expired. Please sign up again.";
      }
      if (msg.includes("invalid") || msg.includes("code") || msg.includes("verification")) {
        return "Invalid verification code. Please try again.";
      }
      break;

    case "reset":
      if (msg.includes("expired")) {
        return "Verification code expired. Please request a new one.";
      }
      if (msg.includes("invalid") || msg.includes("code") || msg.includes("verification")) {
        return "Invalid verification code. Please try again.";
      }
      break;
  }

  return error.message;
}

/** Validates a redirect URL to prevent open redirect attacks. Only allows relative paths. */
export function sanitizeRedirect(redirect: string): string {
  if (redirect.startsWith("/") && !redirect.includes("://")) return redirect;
  return "/";
}
