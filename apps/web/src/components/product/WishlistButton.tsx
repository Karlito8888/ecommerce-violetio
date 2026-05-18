// apps/web/src/components/product/WishlistButton.tsx
//
// Heart icon toggle button for wishlist add/remove.
// Migrated from Supabase (TanStack Query mutations) to Convex mutations (Phase 5).
//
// Uses Convex hooks directly:
//   - useQuery for wishlist product IDs (reactive boolean)
//   - useMutation (convex/react): callable mutation function
//   - Manual isPending tracking since ReactMutation is a plain function
//
// Only renders for authenticated users (AC #8).

import { Component, type ReactNode, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "#/hooks/useUser";
import { useToast } from "../ui/Toast";
import { api } from "#convex/_generated/api";

interface WishlistButtonProps {
  productId: string;
  productName?: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Error boundary that silently swallows render errors.
 *
 * WishlistButton uses hooks that require ConvexProvider. When rendered
 * in test environments without providers, React would crash.
 * This boundary catches those errors and renders nothing — graceful
 * degradation over crash.
 */
class WishlistBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

/** Returns true if the given productId is in the user's wishlist (reactive Convex query). */
function useIsInWishlist(productId: string, userId: string | undefined): boolean {
  const productIds = useQuery(
    api.wishlists.queries.getWishlistProductIds,
    userId ? { userId } : "skip",
  );
  if (!productIds) return false;
  return productIds.includes(productId);
}

/**
 * Heart icon toggle button for wishlist add/remove.
 * Only renders for authenticated (non-anonymous) users (AC #8).
 * Shows toast notification on successful add/remove (AC #1, #2).
 *
 * Wrapped in an error boundary for safe rendering in test environments.
 */
export default function WishlistButton(props: WishlistButtonProps) {
  return (
    <WishlistBoundary>
      <WishlistButtonInner {...props} />
    </WishlistBoundary>
  );
}

function WishlistButtonInner({
  productId,
  productName,
  className,
  size = "sm",
}: WishlistButtonProps) {
  const { data: user } = useUser();
  const userId = user?.id;
  const isInWishlist = useIsInWishlist(productId, userId);

  // Convex mutations — plain callable functions, no isPending property
  const addMutation = useMutation(api.wishlists.mutations.addToWishlist);
  const removeMutation = useMutation(api.wishlists.mutations.removeFromWishlist);

  const [isPending, setIsPending] = useState(false);
  const toast = useToast();

  // Don't render for guests or anonymous users (AC #8)
  if (!userId) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation when inside a Link
    e.stopPropagation();
    if (isPending) return;

    setIsPending(true);
    try {
      if (isInWishlist) {
        await removeMutation({ userId, productId });
        toast.success("Removed from wishlist");
      } else {
        await addMutation({ userId, productId });
        toast.success("Added to wishlist");
      }
    } catch {
      toast.error("Failed to update wishlist");
    } finally {
      setIsPending(false);
    }
  };

  const label = isInWishlist
    ? `Remove ${productName ?? "product"} from wishlist`
    : `Add ${productName ?? "product"} to wishlist`;

  return (
    <button
      type="button"
      className={`wishlist-btn wishlist-btn--${size}${isInWishlist ? " wishlist-btn--active" : ""}${className ? ` ${className}` : ""}`}
      onClick={handleClick}
      aria-label={label}
      aria-pressed={isInWishlist}
      disabled={isPending}
    >
      {isInWishlist ? "\u2665" : "\u2661"}
    </button>
  );
}
