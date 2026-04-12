import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { HamburgerMenu } from "./HamburgerMenu";

/**
 * Tab navigator with 4 core tabs: Home, Search, Cart, Profile.
 * All secondary routes (help, legal, order, content, checkout, settings, etc.)
 * are hidden from the tab bar with href: null — they remain accessible via the
 * HamburgerMenu or programmatic navigation.
 */
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "unspecified" ? "light" : (scheme ?? "light")];
  const [menuVisible, setMenuVisible] = useState(false);

  const headerRight = () => (
    <Pressable
      onPress={() => setMenuVisible(true)}
      style={({ pressed }) => [styles.hamburgerBtn, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityLabel="Ouvrir le menu"
      accessibilityRole="button"
    >
      <Ionicons name="menu-outline" size={26} color={colors.text} />
    </Pressable>
  );

  const headerTitle = () => (
    <Text style={[styles.headerBrand, { color: colors.text, fontFamily: Fonts?.serif }]}>
      Maison Émile
    </Text>
  );

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTitle: headerTitle,
          headerRight: headerRight,
          headerLeft: () => <View style={styles.headerLeftSpacer} />,
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: [
            styles.tabBar,
            Platform.select({
              ios: { position: "absolute" },
              default: { backgroundColor: colors.background },
            }),
          ],
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Accueil",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Recherche",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "search" : "search-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="cart"
          options={{
            title: "Panier",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "bag" : "bag-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profil",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
            ),
          }}
        />

        {/* Hidden secondary routes — accessible via HamburgerMenu or deep links */}
        <Tabs.Screen name="wishlist" options={{ href: null }} />
        <Tabs.Screen name="explore" options={{ href: null }} />
        <Tabs.Screen name="auth" options={{ href: null }} />
        <Tabs.Screen name="products" options={{ href: null }} />
        <Tabs.Screen name="collections" options={{ href: null }} />
        <Tabs.Screen name="checkout" options={{ href: null }} />
        <Tabs.Screen name="content" options={{ href: null }} />
        <Tabs.Screen name="help" options={{ href: null }} />
        <Tabs.Screen name="legal" options={{ href: null }} />
        <Tabs.Screen name="order" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>

      <HamburgerMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  headerBrand: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  headerLeftSpacer: {
    width: 44,
  },
  hamburgerBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  tabBar: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 4,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.2,
    marginBottom: 2,
  },
});
