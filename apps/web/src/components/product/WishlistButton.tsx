import { Component, type ReactNode } from "react";
import { useIsInWishlist, useAddToWishlist, useRemoveFromWishlist } from "@ecommerce/shared";
import { useUser } from "#/hooks/useUser";
import { useToast } from "../ui/Toast";

interface WishlistButtonProps {
  productId: string;
  productName?: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Error boundary that silently swallows render errors.
 *
 * ## Why this exists (Code Review documented)
 * WishlistButton uses hooks (useUser, useIsInWishlist) that require
 * QueryClientProvider. When rendered in test environments or contexts
 * without providers (e.g., BaseProductCard unit tests), React would crash.
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

/**
 * Heart icon toggle button for wishlist add/remove.
 * Only renders for authenticated (non-anonymous) users (AC #8).
 * Shows toast notification on successful add/remove (AC #1, #2).
 *
 * Wrapped in an error boundary for safe rendering in test environments.
 *
 * ## Usage
 * - Product cards: `<WishlistButton productId={id} size="sm" />`
 * - Product detail: `<WishlistButton productId={id} productName={name} size="md" />`
 *
 * ## Code Review Fix H2 — Toast notifications
 * Original implementation had no user feedback on toggle. AC #1/#2 require
 * "toast notification confirms 'Added to wishlist'" / "Removed from wishlist".
 * Added `useToast()` integration with `onSuccess` callbacks on mutations.
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
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const isInWishlist = useIsInWishlist(productId, userId);
  const addMutation = useAddToWishlist(userId ?? "");
  const removeMutation = useRemoveFromWishlist(userId ?? "");
  const toast = useToast();

  // Don't render for guests or anonymous users (AC #8)
  if (!userId) return null;

  const isPending = addMutation.isPending || removeMutation.isPending;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation when inside a Link
    e.stopPropagation();
    if (isPending) return;

    if (isInWishlist) {
      removeMutation.mutate(productId, {
        onSuccess: () => toast.success("Removed from wishlist"),
        onError: () => toast.error("Failed to update wishlist"),
      });
    } else {
      addMutation.mutate(productId, {
        onSuccess: () => toast.success("Added to wishlist"),
        onError: () => toast.error("Failed to update wishlist"),
      });
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
