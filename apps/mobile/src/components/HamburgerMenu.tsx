/**
 * Slide-in drawer menu from the right side.
 * Contains secondary navigation (Orders, Wishlist, Content, Help, Legal, Settings).
 * Designed to match the Maison Émile warm neutral + gold aesthetic.
 */
import { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";

import { Colors, Fonts, Spacing } from "@/constants/theme";
import { useUser } from "@ecommerce/shared";

const SCREEN_WIDTH = Dimensions.get("window").width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 320);

interface MenuItem {
  label: string;
  sublabel?: string;
  icon: string;
  path: string;
  authRequired?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { label: "Wishlist", icon: "♡", path: "/wishlist", authRequired: true },
  { label: "My Orders", sublabel: "Track your purchases", icon: "↗", path: "/order/lookup" },
  {
    label: "Guides & Reviews",
    sublabel: "Curated editorial content",
    icon: "✦",
    path: "/content",
  },
  { label: "Help Center", sublabel: "FAQ and support", icon: "?", path: "/help" },
  { label: "Legal", sublabel: "Privacy, Terms, Cookies", icon: "§", path: "/legal/privacy" },
];

export interface HamburgerMenuProps {
  visible: boolean;
  onClose: () => void;
}

export function HamburgerMenu({ visible, onClose }: HamburgerMenuProps) {
  const scheme = useColorScheme();
  const theme = Colors[scheme === "unspecified" ? "light" : (scheme ?? "light")];
  const router = useRouter();
  const { data: user } = useUser();
  const isAuthenticated = !!user && !user.is_anonymous;

  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 220,
          mass: 0.8,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  const navigate = useCallback(
    (path: string) => {
      onClose();
      // Slight delay to let the drawer close animation start
      setTimeout(() => router.push(path as never), 180);
    },
    [onClose, router],
  );

  const visibleItems = MENU_ITEMS.filter((item) => !item.authRequired || isAuthenticated);

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      animationType="none"
    >
      {/* Backdrop */}
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        accessibilityLabel="Close menu"
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: "#1A1A1A",
              opacity: backdropAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }),
            },
          ]}
        />
      </Pressable>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          {
            width: DRAWER_WIDTH,
            backgroundColor: theme.background,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* Brand header */}
        <View style={[styles.drawerHeader, { borderBottomColor: theme.tint }]}>
          <Text style={[styles.brandName, { color: theme.text, fontFamily: Fonts?.serif }]}>
            Maison{"\n"}Émile
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: pressed ? theme.backgroundElement : "transparent" },
            ]}
            accessibilityLabel="Fermer le menu"
          >
            <Text style={[styles.closeIcon, { color: theme.textSecondary }]}>✕</Text>
          </Pressable>
        </View>

        {/* Navigation items */}
        <View style={styles.menuList}>
          {visibleItems.map((item) => (
            <Pressable
              key={item.path}
              onPress={() => navigate(item.path)}
              style={({ pressed }) => [
                styles.menuItem,
                { backgroundColor: pressed ? theme.backgroundElement : "transparent" },
              ]}
              accessibilityRole="button"
            >
              <View
                style={[styles.menuIconContainer, { backgroundColor: theme.backgroundElement }]}
              >
                <Text style={[styles.menuIconText, { color: theme.tint }]}>{item.icon}</Text>
              </View>
              <View style={styles.menuItemContent}>
                <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
                {item.sublabel ? (
                  <Text style={[styles.menuSublabel, { color: theme.textSecondary }]}>
                    {item.sublabel}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.menuChevron, { color: theme.textSecondary }]}>›</Text>
            </Pressable>
          ))}
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: theme.backgroundElement }]} />

        {/* Sign Out / Sign In */}
        <View style={styles.footer}>
          {isAuthenticated ? (
            <Pressable
              style={({ pressed }) => [
                styles.footerButton,
                { backgroundColor: pressed ? theme.backgroundElement : "transparent" },
              ]}
              onPress={() => navigate("/auth/login")}
            >
              <Text style={[styles.footerButtonText, { color: theme.textSecondary }]}>
                Sign Out
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.footerButton,
                { backgroundColor: pressed ? theme.backgroundElement : "transparent" },
              ]}
              onPress={() => navigate("/auth/login")}
            >
              <Text style={[styles.footerButtonText, { color: theme.tint }]}>Sign In</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    marginBottom: Spacing.two,
  },
  brandName: {
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: 0.5,
    lineHeight: 28,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: "400",
  },
  menuList: {
    paddingVertical: Spacing.one,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconText: {
    fontSize: 16,
    fontWeight: "500",
  },
  menuItemContent: {
    flex: 1,
    gap: 2,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  menuSublabel: {
    fontSize: 12,
    letterSpacing: 0.1,
  },
  menuChevron: {
    fontSize: 20,
    fontWeight: "300",
  },
  divider: {
    height: 1,
    marginHorizontal: Spacing.four,
    marginVertical: Spacing.two,
  },
  footer: {
    paddingHorizontal: Spacing.four,
  },
  footerButton: {
    paddingVertical: Spacing.three,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
});
