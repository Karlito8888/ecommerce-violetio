import type { Session, User } from "@supabase/supabase-js";

export type { Session, User as SupabaseUser };

/** Auth state managed by useAuthSession (web) and AuthContext (mobile). */
export interface AuthSession {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  /** True when the user has no email/password — anonymous Supabase session. */
  isAnonymous: boolean;
}
