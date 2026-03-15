import { useEffect, useRef } from "react";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

interface UseCartSyncOptions {
  /** Supabase client instance (browser client, not service-role) */
  supabase: SupabaseClient;
  /** Authenticated user ID — null means no subscription (anonymous users don't sync) */
  userId: string | null;
  /** Current violet cart ID on this device (used to detect remote vs local changes) */
  currentVioletCartId: string | null;
  /** Called when the same cart was updated on another device (e.g., item added) */
  onCartUpdated?: () => void;
  /** Called when another device changes the cart's violet_cart_id (e.g., after merge) */
  onRemoteCartChange?: (violetCartId: string) => void;
}

/**
 * Subscribes to Supabase Realtime changes on the `carts` table,
 * filtered by the authenticated user's ID. When another device
 * modifies the cart, calls the appropriate callback so the consumer
 * can refresh the cart state (e.g., invalidate TanStack Query cache
 * on web, or trigger a re-fetch on mobile).
 *
 * Does nothing when `userId` is null (anonymous users are per-device).
 *
 * Channel name convention: `cart:user_{userId}` (from architecture.md).
 *
 * @see supabase/migrations/20260316000000_enable_carts_realtime.sql — enables Realtime on carts
 */
export function useCartSync({
  supabase,
  userId,
  currentVioletCartId,
  onCartUpdated,
  onRemoteCartChange,
}: UseCartSyncOptions): void {
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Stabilize callback refs to avoid re-subscribing on every render
  const onCartUpdatedRef = useRef(onCartUpdated);
  onCartUpdatedRef.current = onCartUpdated;

  const onRemoteCartChangeRef = useRef(onRemoteCartChange);
  onRemoteCartChangeRef.current = onRemoteCartChange;

  const currentVioletCartIdRef = useRef(currentVioletCartId);
  currentVioletCartIdRef.current = currentVioletCartId;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`cart:user_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "carts",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newRow = payload.new as Record<string, unknown>;
          const newVioletCartId = newRow.violet_cart_id as string | undefined;

          if (!newVioletCartId) return;

          if (newVioletCartId === currentVioletCartIdRef.current) {
            // Same cart updated on another device — notify consumer to refresh
            onCartUpdatedRef.current?.();
          } else if (onRemoteCartChangeRef.current) {
            // Different violet_cart_id (e.g., merge switched carts) — notify consumer
            onRemoteCartChangeRef.current(newVioletCartId);
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [supabase, userId]);
}
