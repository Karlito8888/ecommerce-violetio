export const typography = {
  fontFamilies: {
    display: '"Cormorant Garamond", "Georgia", "Times New Roman", serif',
    body: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  // Type scale (1.25 Major Third ratio)
  // Display/H1/H2: Cormorant Garamond — H3 and below: Inter
  typeScale: {
    display: { size: 48, weight: 600, lineHeight: 1.1, letterSpacing: "-0.02em" },
    h1: { size: 40, weight: 600, lineHeight: 1.15, letterSpacing: "-0.01em" },
    h2: { size: 30, weight: 500, lineHeight: 1.2, letterSpacing: "0" },
    h3: { size: 22, weight: 500, lineHeight: 1.3, letterSpacing: "-0.01em" },
    h4: { size: 18, weight: 600, lineHeight: 1.4, letterSpacing: "0" },
    body: { size: 16, weight: 400, lineHeight: 1.6, letterSpacing: "0" },
    bodySmall: { size: 14, weight: 400, lineHeight: 1.5, letterSpacing: "0" },
    caption: { size: 13, weight: 400, lineHeight: 1.5, letterSpacing: "0.01em" },
    overline: { size: 11, weight: 500, lineHeight: 1.4, letterSpacing: "0.08em" },
  },
} as const;
