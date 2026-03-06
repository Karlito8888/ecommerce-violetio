const AUTH_ERROR_MAP: Record<string, string> = {
  "User already registered": "An account with this email already exists",
  "Email already in use": "An account with this email already exists",
  "Invalid login credentials": "Email or password is incorrect",
  "Email not confirmed": "Please verify your email before signing in",
  over_request_rate_limit: "Too many attempts, please wait before trying again",
  "Password should be at least 6 characters": "Password must be at least 6 characters",
};

/** Maps Supabase auth error messages to user-friendly strings. */
export function mapAuthError(message: string): string {
  return AUTH_ERROR_MAP[message] ?? message;
}
