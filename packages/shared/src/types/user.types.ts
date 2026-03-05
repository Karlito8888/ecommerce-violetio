/**
 * User-related placeholder types.
 * Full implementation in Story 2.1 (anonymous sessions) and Story 2.2 (registration/login).
 */

/** An authenticated or anonymous user. */
export interface User {
  id: string;
  email: string | null;
  /** True if the user has not completed registration (anonymous Supabase session). */
  isAnonymous: boolean;
  createdAt: string;
}

/** Current authentication state. */
export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
