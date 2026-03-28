import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "../utils/supabase";

/**
 * Web-specific useUser hook that uses the SSR-compatible browser client
 * (from @supabase/ssr) instead of the shared singleton.
 * This avoids creating a second GoTrueClient instance in the browser.
 */
export function useUser() {
  const supabase = getSupabaseBrowserClient();
  return useQuery({
    queryKey: queryKeys.user.current(),
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
    staleTime: Infinity,
  });
}
