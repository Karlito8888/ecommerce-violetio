export const colors = {
  // Warm Neutral Base (Light)
  ivory: "#FAFAF8",
  linen: "#F0EEEB",
  sand: "#E8E4DF",
  stone: "#D5CEC6",
  taupe: "#B8A28F",
  sienna: "#8B7355",

  // Midnight Gold Accents
  gold: "#C9A96E",
  amber: "#A68B4B",
  midnight: "#2C2C2C",

  // Text Scale (Light)
  ink: "#1A1A1A",
  charcoal: "#3D3D3D",
  steel: "#5A5A5A",
  silver: "#999999",

  // Semantic (Light)
  success: "#5A7A4A",
  warning: "#C17A2A",
  error: "#B54A4A",
  info: "#4A6A8A",
} as const;

/**
 * Dark palette — mirrors [data-theme="dark"] from apps/web/src/styles/tokens.css.
 * Every value MUST stay in sync with the CSS custom property overrides.
 */
export const darkColors = {
  // Warm Neutral Base (Dark)
  ivory: "#2C2C2C",
  linen: "#333333",
  sand: "#3D3D3D",
  stone: "#4A4A4A",
  taupe: "#D5CEC6",
  sienna: "#B8A28F",

  // Midnight Gold Accents (gold/amber unchanged — AAA on dark bg)
  gold: "#C9A96E",
  amber: "#A68B4B",
  midnight: "#FAFAF8",

  // Text Scale (Dark)
  ink: "#FAFAF8",
  charcoal: "#E8E4DF",
  steel: "#D5CEC6",
  silver: "#B8A28F",

  // Semantic (Dark)
  success: "#7AAD5A",
  warning: "#D4943A",
  error: "#D46A6A",
  info: "#6A9ABA",
} as const;

export type ColorToken = keyof typeof colors;
