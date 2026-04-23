/**
 * Theme constants — single source of truth for mobile dark/light.
 * Colors are 1:1 mirrors of apps/web/src/styles/tokens.css:
 *   - Light palette → :root tokens
 *   - Dark palette  → [data-theme="dark"] overrides
 *
 * Import order: import "@/global.css" for NativeWind if needed.
 */

import "@/global.css";

import { Platform } from "react-native";

import { colors, darkColors } from "@ecommerce/ui";

/**
 * Light theme — maps exactly to web :root tokens.
 * Every key here corresponds to a --color-* or --surface-* CSS custom property.
 */
const lightTheme = {
  // Base surfaces
  background: colors.ivory, // --color-ivory: #FAFAF8
  backgroundElement: colors.linen, // --color-linen: #F0EEEB
  backgroundSelected: colors.sand, // --color-sand: #E8E4DF
  surfaceCard: "rgba(250, 250, 248, 0.9)", // --surface-elevated
  surfaceInput: "#FFFFFF", // --surface-input: #fff

  // Text hierarchy
  text: colors.charcoal, // --color-text → --color-charcoal: #3D3D3D
  textSecondary: colors.steel, // --color-text-secondary → --color-steel: #5A5A5A
  textMuted: colors.silver, // --color-text-muted → --color-silver: #999999
  textInverse: colors.ivory, // Text on dark/accent backgrounds

  // Accent & interactive
  accent: colors.gold, // --color-accent → --color-gold: #C9A96E
  accentDark: colors.amber, // --color-gold-dark → --color-amber: #A68B4B
  accentHover: colors.sienna, // Link hover: --color-sienna: #8B7355
  btnText: "#FFFFFF", // --color-btn-text (on colored buttons)

  // Borders
  borderSubtle: "rgba(213, 206, 198, 0.5)", // --border-subtle
  borderAccent: "rgba(201, 169, 110, 0.18)", // --border-accent

  // Semantic
  success: colors.success, // #5A7A4A
  warning: colors.warning, // #C17A2A
  error: colors.error, // #B54A4A
  info: colors.info, // #4A6A8A

  // Shadows
  shadowColor: "rgba(26, 26, 26, 0.08)", // --shadow-sm/md base

  // Placeholder
  placeholder: "rgba(26, 26, 26, 0.3)", // --color-placeholder (light)
} as const;

/**
 * Dark theme — maps exactly to web [data-theme="dark"] overrides.
 */
const darkTheme = {
  // Base surfaces
  background: darkColors.ivory, // #2C2C2C
  backgroundElement: darkColors.linen, // #333333
  backgroundSelected: darkColors.sand, // #3D3D3D
  surfaceCard: "rgba(44, 44, 44, 0.9)", // --surface-elevated (dark)
  surfaceInput: "#333333", // --surface-input (dark)

  // Text hierarchy
  text: darkColors.charcoal, // #E8E4DF
  textSecondary: darkColors.steel, // #D5CEC6
  textMuted: darkColors.silver, // #B8A28F
  textInverse: darkColors.midnight, // #FAFAF8 — midnight flips in dark

  // Accent & interactive (gold/amber preserved — AAA on dark bg)
  accent: darkColors.gold, // #C9A96E — same
  accentDark: darkColors.amber, // #A68B4B — same
  accentHover: darkColors.sienna, // #B8A28F
  btnText: "#1A1A1A", // --color-btn-text (dark): ink on gold buttons

  // Borders
  borderSubtle: "rgba(74, 74, 74, 0.5)", // --border-subtle (dark)
  borderAccent: "rgba(201, 169, 110, 0.28)", // --border-accent (dark)

  // Semantic
  success: darkColors.success, // #7AAD5A
  warning: darkColors.warning, // #D4943A
  error: darkColors.error, // #D46A6A
  info: darkColors.info, // #6A9ABA

  // Shadows
  shadowColor: "rgba(0, 0, 0, 0.25)", // --shadow-sm/md (dark)

  // Placeholder
  placeholder: "rgba(250, 250, 248, 0.3)", // --color-placeholder (dark)
} as const;

export const Colors = {
  light: lightTheme,
  dark: darkTheme,
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
