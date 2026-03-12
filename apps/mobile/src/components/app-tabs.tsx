import { Tabs } from "expo-router";
import React from "react";
import { Platform, useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

/**
 * Standard tab navigator using expo-router's Tabs component.
 * Compatible with Expo Go (unlike NativeTabs which requires a dev build).
 */
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "unspecified" ? "light" : scheme];

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
    </Tabs>
  );
}

/** Minimal text-based tab icon (avoids native icon dependency issues in Expo Go). */
function TabIcon({ name, color }: { name: string; color: string }) {
  const icons: Record<string, string> = {
    home: "\u2302",
    search: "\u{1F50D}",
    cart: "\u{1F6D2}",
    profile: "\u{1F464}",
  };
  const { Text } = require("react-native");
  return <Text style={{ fontSize: 20, color }}>{icons[name] || "?"}</Text>;
}
