# Story 1.3: Design Token System & Cross-Platform Styling Foundation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want a shared design token system that works across web (CSS custom properties) and mobile (React Native StyleSheet),
So that visual consistency is maintained across platforms from a single source of truth.

## Acceptance Criteria

1. **AC1 - colors.ts:** `packages/ui/src/tokens/colors.ts` exports the full color palette: Ivory (`#FAFAF8`), Linen (`#F0EEEB`), Sand (`#E8E4DF`), Stone (`#D5CEC6`), Taupe (`#B8A28F`), Sienna (`#8B7355`), Gold (`#C9A96E`), Amber (`#A68B4B`), Midnight (`#2C2C2C`), Ink (`#1A1A1A`), Charcoal (`#3D3D3D`), Steel (`#5A5A5A`), Silver (`#999999`), and semantic colors (success `#5A7A4A`, warning `#C17A2A`, error `#B54A4A`, info `#4A6A8A`)

2. **AC2 - typography.ts:** `packages/ui/src/tokens/typography.ts` exports font families (`"Cormorant Garamond"` for display, `"Inter"` for body), the complete type scale (sizes, weights, line-heights, letter-spacings for Display through Overline), and font loading strategy notes

3. **AC3 - spacing.ts:** `packages/ui/src/tokens/spacing.ts` exports the 4px-base spacing scale (space1=4 through space16=64, plus space5, space10 as px numbers and rem strings)

4. **AC4 - tokens.css replaced:** `apps/web/src/styles/tokens.css` is fully replaced with the Warm Neutral + Midnight Gold design tokens as CSS custom properties, importing Cormorant Garamond and Inter from Google Fonts, with dark theme overrides using `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`

5. **AC5 - CSS components migrated:** All existing CSS files in `apps/web/src/styles/` that reference old token variables (sea-ink, lagoon, palm, foam, surface, Manrope, Fraunces, etc.) are updated to use the new token names

6. **AC6 - base.css updated:** `apps/web/src/styles/base.css` uses new token variables for body text/background, retains the decorative background gradients (adapted to new palette), includes `focus-visible` accessibility styles, `prefers-reduced-motion` query, and a BEM naming convention comment block

7. **AC7 - packages/ui barrel export:** `packages/ui/src/index.ts` and `packages/ui/src/tokens/index.ts` export all token objects, and both `apps/web` and `apps/mobile` can import from `@ecommerce/ui` without build errors

8. **AC8 - typecheck/lint pass:** `bun run typecheck` and `bun run lint` both pass with zero errors/warnings after all changes

## Tasks / Subtasks

- [x] Task 1: Create design token TypeScript files (AC: 1, 2, 3, 7)
  - [x] Create `packages/ui/src/tokens/` directory
  - [x] Create `packages/ui/src/tokens/colors.ts` — export `colors` object with all named color values
  - [x] Create `packages/ui/src/tokens/typography.ts` — export `typography` object (fontFamilies, typeScale, fontWeights, lineHeights, letterSpacings)
  - [x] Create `packages/ui/src/tokens/spacing.ts` — export `spacing` object with both px numbers and rem strings per value
  - [x] Create `packages/ui/src/tokens/index.ts` — barrel re-exporting colors, typography, spacing
  - [x] Update `packages/ui/src/index.ts` to re-export from `./tokens`
  - [x] Add `packages/ui/tsconfig.json` if not already present (extend root tsconfig.base.json)

- [x] Task 2: Replace tokens.css with UX-spec design system (AC: 4)
  - [x] Replace entire content of `apps/web/src/styles/tokens.css` — Google Fonts import (Cormorant Garamond + Inter), `:root` CSS custom properties for all colors, typography, spacing, shadows, breakpoints, transitions, border-radius
  - [x] Add `[data-theme="dark"]` overrides (inverted neutrals, preserved gold accents)
  - [x] Add `@media (prefers-color-scheme: dark)` fallback matching dark theme values

- [x] Task 3: Migrate all existing CSS files to new token names (AC: 5)
  - [x] Update `apps/web/src/styles/base.css` — replace all old variable references, keep decorative gradients using new palette variables (AC: 6)
  - [x] Update `apps/web/src/styles/components/header.css`
  - [x] Update `apps/web/src/styles/components/footer.css`
  - [x] Update `apps/web/src/styles/components/island.css`
  - [x] Update `apps/web/src/styles/components/chip.css`
  - [x] Update `apps/web/src/styles/components/nav-link.css`
  - [x] Update `apps/web/src/styles/components/icon-link.css`
  - [x] Update `apps/web/src/styles/components/theme-toggle.css`
  - [x] Update `apps/web/src/styles/pages/home.css`
  - [x] Update `apps/web/src/styles/pages/about.css`

- [x] Task 4: Verify cross-platform import and quality gates (AC: 7, 8)
  - [x] Verify `apps/web` can import `{ colors, typography, spacing }` from `@ecommerce/ui`
  - [x] Verify `apps/mobile` can import `{ colors, spacing }` from `@ecommerce/ui` (for use in StyleSheet.create)
  - [x] Run `bun run typecheck` — zero errors in web + mobile
  - [x] Run `bun run lint` — zero warnings/errors
  - [x] Run `bun run dev` — verify web app renders without CSS errors (no broken var() references)

## Dev Notes

### CRITICAL: Existing tokens.css Uses Wrong Design System — Full Replace Required

The current `apps/web/src/styles/tokens.css` was created in Story 1.1 as a scaffold placeholder using a **sea/ocean theme** that is completely incompatible with the UX spec. It must be **fully replaced**, not patched:

| Current (WRONG — Story 1.1 scaffold) | Required (UX Spec) |
|---|---|
| `Fraunces` (display font) | `Cormorant Garamond` |
| `Manrope` (body font) | `Inter` |
| `--sea-ink: #173a40` | `--color-ink: #1A1A1A` |
| `--lagoon: #4fb8b2` | `--color-gold: #C9A96E` |
| `--palm: #2f6a4a` | `--color-sienna: #8B7355` |
| `--foam: #f3faf5` | `--color-ivory: #FAFAF8` |
| `--surface`, `--line`, `--kicker`, etc. | Semantic names per UX spec |

**Cascade effect**: ALL 9 other CSS files reference old variable names. You MUST update every file in Task 3 or the app will silently have invisible/broken styles (CSS `var()` failures are silent — no console errors).

### Token Architecture: JS Values → CSS Custom Properties → React Native StyleSheet

The design token distribution pattern (from architecture.md):

```
packages/ui/src/tokens/
├── colors.ts      ← TypeScript constants (canonical values)
├── typography.ts  ← TypeScript constants
├── spacing.ts     ← TypeScript constants
└── index.ts       ← barrel

apps/web/src/styles/tokens.css  ← CSS custom properties (derive from JS values manually)
apps/mobile/src/...             ← uses StyleSheet.create({ ... colors.ivory ... })
```

The CSS custom property values in `tokens.css` MUST match the JS constants in `packages/ui/`. There is no automated sync — enforce by convention. The dev must keep both in sync.

[Source: architecture.md#Design Token Distribution]
[Source: ux-design-specification.md#Cross-Platform Token Sharing]

### Token File Specifications

#### colors.ts — Complete Color Map

```typescript
export const colors = {
  // Warm Neutral Base
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

  // Text Scale
  ink: "#1A1A1A",
  charcoal: "#3D3D3D",
  steel: "#5A5A5A",
  silver: "#999999",

  // Semantic
  success: "#5A7A4A",
  warning: "#C17A2A",
  error: "#B54A4A",
  info: "#4A6A8A",
} as const;

export type ColorToken = keyof typeof colors;
```

[Source: ux-design-specification.md#Color System]

#### typography.ts — Type Scale

```typescript
export const typography = {
  fontFamilies: {
    display: '"Cormorant Garamond", "Georgia", "Times New Roman", serif',
    body: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  // Type scale (1.25 Major Third ratio)
  typeScale: {
    display: { size: 48, weight: 600, lineHeight: 1.1, letterSpacing: "-0.02em" },
    h1:      { size: 40, weight: 600, lineHeight: 1.15, letterSpacing: "-0.01em" },
    h2:      { size: 30, weight: 500, lineHeight: 1.2,  letterSpacing: "0" },
    h3:      { size: 22, weight: 500, lineHeight: 1.3,  letterSpacing: "-0.01em" },
    h4:      { size: 18, weight: 600, lineHeight: 1.4,  letterSpacing: "0" },
    body:    { size: 16, weight: 400, lineHeight: 1.6,  letterSpacing: "0" },
    bodySmall: { size: 14, weight: 400, lineHeight: 1.5, letterSpacing: "0" },
    caption: { size: 13, weight: 400, lineHeight: 1.5,  letterSpacing: "0.01em" },
    overline: { size: 11, weight: 500, lineHeight: 1.4, letterSpacing: "0.08em" },
  },
} as const;
```

H3 and below use Inter; Display/H1/H2 use Cormorant Garamond. Never mix serif/sans within the same element.
[Source: ux-design-specification.md#Typography System]

#### spacing.ts — 4px Base Scale

```typescript
export const spacing = {
  // px values (useful for React Native StyleSheet)
  px: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },
  // rem strings (useful for CSS reference)
  rem: { 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem", 5: "1.25rem",
         6: "1.5rem", 8: "2rem", 10: "2.5rem", 12: "3rem", 16: "4rem" },
} as const;
```

[Source: ux-design-specification.md#Spacing & Layout Foundation]

### CSS Custom Properties for tokens.css

The new `tokens.css` should define these CSS custom properties matching the JS values above:

```css
@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap");

:root {
  /* Warm Neutral Base */
  --color-ivory:    #FAFAF8;
  --color-linen:    #F0EEEB;
  --color-sand:     #E8E4DF;
  --color-stone:    #D5CEC6;
  --color-taupe:    #B8A28F;
  --color-sienna:   #8B7355;

  /* Midnight Gold Accents */
  --color-gold:     #C9A96E;
  --color-amber:    #A68B4B;
  --color-midnight: #2C2C2C;

  /* Text Scale */
  --color-ink:      #1A1A1A;
  --color-charcoal: #3D3D3D;
  --color-steel:    #5A5A5A;
  --color-silver:   #999999;

  /* Semantic */
  --color-success: #5A7A4A;
  --color-warning: #C17A2A;
  --color-error:   #B54A4A;
  --color-info:    #4A6A8A;

  /* Typography */
  --font-display: "Cormorant Garamond", "Georgia", "Times New Roman", serif;
  --font-body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;

  /* Spacing */
  --space-1: 0.25rem;  --space-2: 0.5rem;  --space-3: 0.75rem;
  --space-4: 1rem;     --space-5: 1.25rem; --space-6: 1.5rem;
  --space-8: 2rem;     --space-10: 2.5rem; --space-12: 3rem;
  --space-16: 4rem;

  /* Shadows (warm-tinted) */
  --shadow-sm: 0 1px 2px rgba(26, 26, 26, 0.06);
  --shadow-md: 0 4px 6px rgba(26, 26, 26, 0.08);
  --shadow-lg: 0 10px 15px rgba(26, 26, 26, 0.1);

  /* Border radius */
  --radius-sm: 4px;  --radius-md: 8px;  --radius-lg: 12px;  --radius-full: 9999px;

  /* Breakpoints (reference only — use in media queries directly) */
  --bp-sm: 640px;  --bp-md: 768px;  --bp-lg: 1024px;
  --bp-xl: 1280px; --bp-2xl: 1440px;

  /* Transitions */
  --transition-fast: 120ms ease;
  --transition-normal: 200ms ease;
  --transition-slow: 300ms ease;
}
```

Dark theme: Map neutrals in reverse (ivory ↔ midnight for bg/text), preserve gold/amber accents as-is (they work well on dark backgrounds — gold on midnight is 7.2:1 contrast, AAA).

### Legacy Token Variable Mapping (for Task 3 migration)

When updating the 9 CSS files, use this mapping table:

| Old Variable | New Variable | Notes |
|---|---|---|
| `--sea-ink` | `--color-ink` | Primary text |
| `--sea-ink-soft` | `--color-charcoal` | Secondary text |
| `--lagoon` | `--color-gold` | Primary accent (CTAs) |
| `--lagoon-deep` | `--color-amber` | Accent hover/active |
| `--palm` | `--color-sienna` | Secondary buttons |
| `--sand` (light) | `--color-linen` | Surface background |
| `--foam` | `--color-ivory` | Page background |
| `--surface` | `color-mix(in oklab, white 74%, transparent)` or `rgba(250,250,248,0.74)` |
| `--surface-strong` | `rgba(250,250,248,0.9)` |
| `--line` | `--color-sand` with opacity | Border color |
| `--bg-base` | `--color-ivory` | Page background |
| `--header-bg` | `rgba(250,250,248,0.84)` | Frosted header |
| `--chip-bg` | `rgba(250,250,248,0.8)` |
| `--chip-line` | `rgba(201,169,110,0.18)` | Gold-tinted border |
| `--link-bg-hover` | `rgba(250,250,248,0.9)` |
| `--hero-a` | `rgba(201,169,110,0.18)` | Gold haze |
| `--hero-b` | `rgba(139,115,85,0.12)` | Sienna haze |
| `--kicker` | `rgba(139,115,85,0.9)` | Badge background |
| `--inset-glint` | `rgba(255,255,255,0.82)` | Unchanged |
| `--font-sans` | `--font-body` |
| `--font-display` | `--font-display` | Same name, different value |

Dark overrides follow the same inversion logic (sand/foam ↔ midnight/ink).

### Fonts: Google Fonts vs Self-Hosted

Use Google Fonts CDN `@import` in `tokens.css` (as in the current file). Self-hosting is a Phase 2 performance optimization. The subset `latin+latin-extended` is sufficient for MVP.

- Cormorant Garamond: weights 500 (h2), 600 (display, h1)
- Inter: weights 400, 500, 600

Font loading strategy (from UX spec):
- Inter: `font-display: swap` — system-ui fallback visually close
- Cormorant Garamond: `font-display: optional` — Georgia fallback prevents layout shift

Google Fonts handles `font-display` — no additional CSS needed.

[Source: ux-design-specification.md#Font Loading Strategy]

### CSS Architecture (Existing — Do Not Change Structure)

The web app uses this CSS import order (already established):

```
index.css → tokens.css → base.css → utilities.css → components/*.css → pages/*.css
```

Do NOT restructure. Only replace content within files.

The `CLAUDE.md` (project root) documents this CSS architecture. Follow BEM strictly:
```
.block__element--modifier
```

Add a BEM convention comment block in `base.css` or `tokens.css` (per AC6 requirement for the global.css/base.css file).

[Source: CLAUDE.md#CSS Architecture]
[Source: architecture.md#Naming Conventions — CSS classes (BEM)]

### Mobile Usage Pattern (React Native)

Mobile imports tokens directly as JS constants:

```typescript
// apps/mobile/src/some-screen.tsx
import { colors, spacing, typography } from "@ecommerce/ui";

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.ivory,
    padding: spacing.px[4], // 16
  },
  title: {
    fontFamily: typography.fontFamilies.display,
    fontSize: typography.typeScale.h1.size,
    fontWeight: String(typography.typeScale.h1.weight) as "600",
    color: colors.ink,
  },
});
```

Mobile does NOT use CSS custom properties — it uses the JS values directly. No CSS files for mobile.

**Package name note**: The `packages/ui/package.json` registers as `@ecommerce/ui` (no hyphen). The epics.md AC incorrectly says `@e-commerce/ui` — the correct import is `@ecommerce/ui`.

[Source: packages/ui/package.json]
[Source: architecture.md#packages/ui → apps/]

### Project Structure Notes

**Alignment with architecture.md:**

The target file structure from architecture.md:
```
packages/ui/
├── src/
│   ├── index.ts
│   └── tokens/
│       ├── colors.ts
│       ├── typography.ts
│       └── spacing.ts
├── package.json        ← already exists, correct
└── tsconfig.json       ← already exists
```

Current state:
- `packages/ui/src/index.ts` exists (empty placeholder: `export {};`)
- `packages/ui/src/tokens/` does NOT exist yet — must be created
- `apps/web/src/styles/tokens.css` exists but uses wrong design system

**Path correction vs epics AC**: The epics.md AC references `apps/web/app/styles/tokens.css` — this is wrong. The correct path (confirmed by actual codebase and CLAUDE.md) is `apps/web/src/styles/tokens.css`.

### Previous Story Intelligence (Stories 1.1 & 1.2)

**From Story 1.2:**
- Package entry point pattern: `"main": "./src/index.ts"`, `"exports": { ".": "./src/index.ts" }` — already set in packages/ui/package.json ✓
- Direct TypeScript source imports (no build step for packages) ✓
- `bun run typecheck` pattern: `cd apps/web && bun run typecheck` pattern (avoid `bun --cwd` flag issues)

**From Story 1.1:**
- `bun --cwd` has CLI flag parsing issues — always `cd dir && bun run` in scripts
- Both apps extend `tsconfig.base.json` at root — packages/ui/tsconfig.json should too

**Review follow-ups completed in 1.2:** L1 (FlatConfig type), M3 (tsconfig drift) — no open items affecting Story 1.3.

### Git Context

Recent commits:
1. `feat: add shared packages with types, utils, and adapter interface` (Story 1.2)
2. `docs: add CLAUDE.md with project conventions and architecture`
3. `chore: update dependencies to latest safe versions`
4. `refactor: replace Tailwind with Vanilla CSS + BEM, add ESLint/Prettier`
5. `feat: monorepo initialization with TanStack Start + Expo SDK 55` (Story 1.1)

Commit convention: conventional commits, `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

### Testing / Verification

No unit tests required for this story. Verification:

1. `bun run typecheck` — zero errors (web + mobile). Catches broken imports from `@ecommerce/ui`.
2. `bun run lint` — zero warnings/errors
3. `bun run dev` — visual verification: open `http://localhost:3000`. The app should render with:
   - Warm ivory/cream background (not teal/green)
   - Cormorant Garamond headers (serif, not Fraunces)
   - Inter body text (not Manrope)
   - Gold accent colors on interactive elements
4. Import test in mobile: add temporary `import { colors } from "@ecommerce/ui"` in any mobile file, confirm `bun run typecheck` still passes, then remove.

The `bun run dev` visual check is critical — CSS `var()` failures are silent (no JS errors, no build failures). A broken variable just renders as an empty value.

### Accessibility Requirements

From UX spec and AC (these must be in base.css after migration):

```css
/* Focus visible — never remove outline */
:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}

/* Respect motion preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Color contrast requirements (WCAG AA minimum):
- Ink on Ivory: 16.5:1 — AAA ✓
- Gold on Midnight: 7.2:1 — AAA ✓
- Gold on Ivory: 3.4:1 — AA Large only (use only for headings ≥18px or buttons)

[Source: ux-design-specification.md#Accessibility]
[Source: NFR19, NFR20, NFR21, NFR22]

### References

- [Source: ux-design-specification.md#Color System]
- [Source: ux-design-specification.md#Typography System]
- [Source: ux-design-specification.md#Spacing & Layout Foundation]
- [Source: ux-design-specification.md#Cross-Platform Token Sharing]
- [Source: ux-design-specification.md#Font Loading Strategy]
- [Source: ux-design-specification.md#Design Token Governance]
- [Source: architecture.md#Design Token Distribution]
- [Source: architecture.md#packages/ui/ file structure]
- [Source: architecture.md#Naming Conventions — CSS classes (BEM), CSS custom properties]
- [Source: architecture.md#Structure Patterns — Design tokens]
- [Source: CLAUDE.md#CSS Architecture (apps/web)]
- [Source: packages/ui/package.json]
- [Source: implementation-artifacts/1-1-monorepo-initialization-workspace-configuration.md]
- [Source: implementation-artifacts/1-2-shared-packages-setup-types-utils-config.md]
- [Source: epics.md#Story 1.3: Design Token System & Cross-Platform Styling Foundation]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `packages/ui/src/tokens/` directory with `colors.ts`, `typography.ts`, `spacing.ts`, and `index.ts` barrel.
- Updated `packages/ui/src/index.ts` to export all tokens (replacing the empty placeholder).
- `packages/ui/tsconfig.json` already existed and extends root `tsconfig.base.json` — no change needed.
- Fully replaced `apps/web/src/styles/tokens.css` with Warm Neutral + Midnight Gold design system (Google Fonts CDN for Cormorant Garamond + Inter, full CSS custom properties, dark theme via `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`).
- Migrated all 9 CSS files in `apps/web/src/styles/` from old sea/ocean token names to new `--color-*`, `--font-*`, `--space-*` naming.
- `apps/web/src/styles/base.css` updated with `focus-visible` accessibility styles and `prefers-reduced-motion` query; BEM convention comment added.
- All decorative gradients preserved and adapted to use gold/sienna palette inline rgba values.
- `bun run typecheck` — zero errors (web + mobile). `bun run lint` — zero warnings. `bun run build` — success (1.14s build).
- Bun runtime test confirmed: `colors.ivory = #FAFAF8`, `spacing.px[4] = 16`.

### File List

packages/ui/src/tokens/colors.ts (created)
packages/ui/src/tokens/typography.ts (created)
packages/ui/src/tokens/spacing.ts (created)
packages/ui/src/tokens/index.ts (created)
packages/ui/src/index.ts (modified)
apps/web/src/styles/tokens.css (replaced)
apps/web/src/styles/base.css (modified)
apps/web/src/styles/components/header.css (modified)
apps/web/src/styles/components/footer.css (modified)
apps/web/src/styles/components/island.css (modified)
apps/web/src/styles/components/chip.css (modified)
apps/web/src/styles/components/nav-link.css (modified)
apps/web/src/styles/components/icon-link.css (modified)
apps/web/src/styles/components/theme-toggle.css (modified)
apps/web/src/styles/pages/home.css (modified)
apps/web/src/styles/pages/about.css (modified)
_bmad-output/implementation-artifacts/sprint-status.yaml (modified)
_bmad-output/implementation-artifacts/1-3-design-token-system-cross-platform-styling-foundation.md (modified)
