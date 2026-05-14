import React, { useCallback } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import {
  useIsInWishlist,
  useAddToWishlist,
  useRemoveFromWishlist,
  useUser,
} from "@ecommerce/shared";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";

/**
 * Mobile wishlist heart toggle button.
 *
 * Mirrors the web WishlistButton component:
 * - Only renders for authenticated (non-anonymous) users
 * - Animated heart icon (filled ♥ when in wishlist, outline ♡ when not)
 * - Scale bounce animation on toggle
 * - Two sizes: "sm" for product cards, "md" for product detail page
 *
 * Uses shared hooks from @ecommerce/shared for wishlist state management.
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
  const { data: user } = useUser();
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const theme = useTheme();
  const scale = useSharedValue(1);

  // Don't render for guests or anonymous users
  if (!userId) return null;

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
  const isInWishlist = useIsInWishlist(productId, userId);
  const addMutation = useAddToWishlist(userId);
  const removeMutation = useRemoveFromWishlist(userId);

  const isPending = addMutation.isPending || removeMutation.isPending;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleProp.value }],
  }));

  const handlePress = useCallback(() => {
    if (isPending) return;

    // Bounce animation
    scaleProp.value = withSequence(
      withTiming(1.3, { duration: 100 }),
      withTiming(1, { duration: 150 }),
    );

    if (isInWishlist) {
      removeMutation.mutate(productId);
    } else {
      addMutation.mutate(productId);
    }
  }, [isPending, isInWishlist, addMutation, removeMutation, productId, scaleProp]);

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
