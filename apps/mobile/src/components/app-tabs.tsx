import { Tabs } from "expo-router";
import React from "react";
import { Platform, useColorScheme } from "react-native";
import { useUser, useWishlistProductIds } from "@ecommerce/shared";

import { Colors } from "@/constants/theme";

/**
 * Standard tab navigator using expo-router's Tabs component.
 * Compatible with Expo Go (unlike NativeTabs which requires a dev build).
 *
 * ## Code Review Fix M3 — Wishlist tab auth-gated
 * AC #10 / Task 14.3: "Only show for authenticated users — hide tab for guests"
 * The Wishlist tab uses `href: null` for unauthenticated users, which hides it
 * from the tab bar while keeping the route registered (required by expo-router).
 *
 * ## Code Review Fix L2 — Badge dot on wishlist tab
 * AC #10 / Task 14.4: "badge dot when wishlist has items"
 * Uses `tabBarBadge` with an empty string to show a dot indicator.
 */
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "unspecified" ? "light" : scheme];

  const { data: user } = useUser();
  const isAuthenticated = !!user && !user.is_anonymous;
  const userId = isAuthenticated ? user.id : undefined;
  const { data: wishlistIds } = useWishlistProductIds(userId);
  const hasWishlistItems = (wishlistIds?.length ?? 0) > 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tint,
        tabBarStyle: Platform.select({
          ios: { position: "absolute" },
          default: { backgroundColor: colors.background },
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => <TabIcon name="search" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: "Wishlist",
          tabBarIcon: ({ color }) => <TabIcon name="wishlist" color={color} />,
          // Hide tab for guests (Code Review Fix M3), show badge dot (Fix L2)
          href: isAuthenticated ? undefined : null,
          tabBarBadge: isAuthenticated && hasWishlistItems ? "" : undefined,
          tabBarBadgeStyle: { minWidth: 8, minHeight: 8, borderRadius: 4, maxWidth: 8 },
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarIcon: ({ color }) => <TabIcon name="cart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <TabIcon name="profile" color={color} />,
        }}
      />
      {/* Hide non-tab routes from the tab bar */}
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="auth" options={{ href: null }} />
      <Tabs.Screen name="products" options={{ href: null }} />
    </Tabs>
  );
}

/** Minimal text-based tab icon (avoids native icon dependency issues in Expo Go). */
function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    home: "\u2302",
    search: "\u{1F50D}",
    wishlist: "\u2665",
    cart: "\u{1F6D2}",
    profile: "\u{1F464}",
  };
  const { Text } = require("react-native");
  return <Text style={{ fontSize: 20, color }}>{icons[name] || "?"}</Text>;
}
