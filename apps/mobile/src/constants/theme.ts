/**
 * Theme constants aligned with shared design tokens from @ecommerce/ui.
 * Colors use the warm neutral + midnight gold palette.
 */

import "@/global.css";

import { Platform } from "react-native";

import { colors } from "@ecommerce/ui";

export const Colors = {
  light: {
    text: colors.ink,
    background: colors.ivory,
    backgroundElement: colors.linen,
    backgroundSelected: colors.sand,
    textSecondary: colors.steel,
    tint: colors.gold,
    buttonText: colors.ivory,
  },
  dark: {
    text: colors.ivory,
    background: colors.midnight,
    backgroundElement: "#333333", // TODO: add dark palette tokens to @ecommerce/ui
    backgroundSelected: colors.charcoal,
    textSecondary: colors.stone,
    tint: colors.gold,
    buttonText: colors.midnight,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
