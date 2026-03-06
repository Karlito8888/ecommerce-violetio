/** Temporary in-memory store for signup data between screens. Cleared after verification. */
export const pendingSignup: { email: string; password: string } = { email: "", password: "" };

export function clearPendingSignup() {
  pendingSignup.email = "";
  pendingSignup.password = "";
}
