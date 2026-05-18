// Mobile WishlistButton — migrated from Supabase to Convex queries (Phase 6).
//
// Uses Convex useQuery/useMutation directly instead of
// useIsInWishlist/useAddToWishlist/useRemoveFromWishlist from @ecommerce/shared.
//
// Key difference: Convex ReactMutation is a callable (no isPending).
// Pending state tracked via useState.

import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useQuery, useMutation } from "convex/react";
import { api } from "#convex/_generated/api";

import { useAuth } from "@/context/AuthContext";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";

/**
 * Mobile wishlist heart toggle button.
 *
 * Mirrors the web WishlistButton component:
 * - Only renders for authenticated users
 * - Animated heart icon (filled ♥ when in wishlist, outline ♡ when not)
 * - Scale bounce animation on toggle
 * - Two sizes: "sm" for product cards, "md" for product detail page
 */

interface WishlistButtonProps {
  productId: string;
  productName?: string;
  size?: "sm" | "md";
}

export default function WishlistButton({
  productId,
  productName,
  size = "sm",
}: WishlistButtonProps) {
  const { userId, isAuthenticated } = useAuth();
  const theme = useTheme();
  const scale = useSharedValue(1);

  // Don't render for guests
  if (!isAuthenticated || !userId) return null;

  return (
    <WishlistButtonInner
      productId={productId}
      productName={productName}
      size={size}
      userId={userId}
      theme={theme}
      scale={scale}
    />
  );
}

// Split to avoid conditional hooks — userId is guaranteed non-empty here
function WishlistButtonInner({
  productId,
  productName,
  size,
  userId,
  theme,
  scale: scaleProp,
}: WishlistButtonProps & {
  userId: string;
  theme: ReturnType<typeof useTheme>;
  scale: SharedValue<number>;
}) {
  const [isPending, setIsPending] = useState(false);

  const productIds = useQuery(api.wishlists.queries.getWishlistProductIds, { userId });
  const addMutation = useMutation(api.wishlists.mutations.addToWishlist);
  const removeMutation = useMutation(api.wishlists.mutations.removeFromWishlist);

  const isInWishlist = productIds?.includes(productId) ?? false;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleProp.value }],
  }));

  const handlePress = useCallback(() => {
    if (isPending || productIds === undefined) return;

    // Bounce animation
    scaleProp.value = withSequence(
      withTiming(1.3, { duration: 100 }),
      withTiming(1, { duration: 150 }),
    );

    setIsPending(true);
    const mutation = isInWishlist ? removeMutation : addMutation;
    mutation({ userId, productId })
      .catch(() => {
        // Wishlist failures are non-blocking
      })
      .finally(() => setIsPending(false));
  }, [
    isPending,
    isInWishlist,
    addMutation,
    removeMutation,
    userId,
    productId,
    scaleProp,
    productIds,
  ]);

  const label = isInWishlist
    ? `Remove ${productName ?? "product"} from wishlist`
    : `Add ${productName ?? "product"} to wishlist`;

  const sizeStyle = size === "sm" ? styles.sm : styles.md;
  const heartColor = isInWishlist ? theme.error : theme.textSecondary;
  const bgColor = theme.backgroundElement;
  const heartChar = isInWishlist ? "\u2665" : "\u2661";

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={[styles.button, sizeStyle, { backgroundColor: bgColor }]}
        onPress={handlePress}
        disabled={isPending}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected: isInWishlist, busy: isPending }}
      >
        <ThemedText style={[styles.heart, { color: heartColor }]}>{heartChar}</ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    // Subtle shadow like web's backdrop-filter
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sm: {
    width: 32,
    height: 32,
  },
  md: {
    width: 40,
    height: 40,
  },
  heart: {
    fontSize: 18,
    lineHeight: 20,
  },
});
