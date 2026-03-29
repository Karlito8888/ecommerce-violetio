---
title: 'Homepage & About — Replace Boilerplate with Real Content'
slug: 'homepage-about-replace-boilerplate'
created: '2026-03-29'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TanStack Start v1', 'Vanilla CSS + BEM', 'React 19.2', 'TanStack Router (Link for SPA nav)']
files_to_modify: ['apps/web/src/routes/index.tsx', 'apps/web/src/routes/about.tsx', 'apps/web/src/styles/pages/home.css', 'apps/web/src/styles/pages/about.css']
code_patterns: ['island-shell glass cards', 'BEM naming', 'named function components', 'Link with search params for navigation', 'FALLBACK_CATEGORIES pattern for category data']
test_patterns: ['no existing unit tests for index.tsx or about.tsx — manual verification required']
---

# Tech-Spec: Homepage & About — Replace Boilerplate with Real Content

**Created:** 2026-03-29

## Overview

### Problem Statement

The homepage and About page contain TanStack Start scaffold content (developer feature cards, quick-start guide, generic About text) instead of real e-commerce content for Maison Émile. This makes the site look like a boilerplate demo rather than a curated shopping platform.

### Solution

Replace boilerplate sections with customer-facing value propositions, a popular categories teaser row, and real brand content on the About page. Reuse existing CSS grid and island-shell design patterns.

### Scope

**In Scope:**
- Replace 4 `features` cards with e-commerce value props (AI Search, Curated Merchants, Unified Checkout, Secure Payments)
- Remove `quick-start` section entirely
- Add a popular categories teaser row on the homepage
- Rewrite About page with Maison Émile brand identity content
- Clean up orphaned CSS (`.quick-start*`)

**Out of Scope:**
- Hero section redesign (stays as-is)
- Design system / token changes
- New API fetching for categories (hardcoded popular categories initially, or reuse existing loader pattern)
- RecentlyViewedRow changes

## Context for Development

### Codebase Patterns

- Components use named function exports (`export default function ComponentName()`)
- CSS follows BEM: `.block__element--modifier`
- Glass-morphism cards use `.island-shell` class from `styles/components/island.css`
- SPA links use `<Link>` from `@tanstack/react-router` (never raw `<a>`)
- CSS imports ordered: tokens → base → utilities → components → pages
- `Link` to `/products` requires ALL `ProductSearchParams` fields in `search` prop (category, minPrice, maxPrice, inStock, sortBy, sortDirection — set unused ones to `undefined`). See hero Link pattern in `index.tsx` for reference.
- Design tokens: warm neutral palette (ivory, linen, sand, stone) + midnight gold accents (gold, amber)
- Fonts: Cormorant Garamond (display) + Inter (body)
- `FALLBACK_CATEGORIES` in `getProducts.ts`: `[All, Fashion→"Clothing", Home & Living→"Home"]`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/web/src/routes/index.tsx` | Homepage — replace features + remove quick-start + add categories teaser |
| `apps/web/src/routes/about.tsx` | About page — rewrite scaffold content with brand identity |
| `apps/web/src/styles/pages/home.css` | Homepage CSS — keep `.features*`, remove `.quick-start*`, add `.categories-teaser*` |
| `apps/web/src/styles/components/island.css` | Island shell glass card pattern (reference only) |
| `apps/web/src/server/getProducts.ts` | `FALLBACK_CATEGORIES` + `CategoryItem` type (reference for category filter values) |
| `apps/web/src/styles/pages/about.css` | About page CSS — MUST add `.about__text + .about__text` spacing rule for multi-paragraph layout |

### Technical Decisions

- Reuse `.features` CSS grid and `.features__card` island-shell styles — only JSX content changes
- Remove `.quick-start*` CSS block entirely (the `/* Quick Start */` section in `home.css`)
- Categories teaser: new `.categories-teaser` BEM block in `home.css`, hardcoded popular categories using `<Link to="/products" search={{ category: "X" }}>` — matches existing `FALLBACK_CATEGORIES` filter values
- About page: static brand content, no new dependencies, reuse existing `.about__section` / `.about__title` / `.about__text` CSS
- No new CSS file needed — all additions go in existing `home.css` and `about.css`

## Implementation Plan

### Tasks

- [x] Task 1: Replace features card content in homepage
  - File: `apps/web/src/routes/index.tsx`
  - Action: Replace the hardcoded TanStack feature array (the `<section className="features">` block containing "Type-Safe Routing", "Server Functions", etc.) with e-commerce value props:
    1. "AI-Powered Search" — "Describe what you're looking for in your own words — our search understands intent, not just keywords."
    2. "Curated Merchants" — "Every seller is handpicked for quality, authenticity, and reliability."
    3. "Unified Checkout" — "One cart, multiple merchants — a single seamless checkout experience."
    4. "Secure Payments" — "Stripe-powered payments with full buyer protection on every order."
  - Notes: Keep the `.map()` rendering pattern, `island-shell features__card rise-in` classes, and staggered `animationDelay` (`${index * 90 + 80}ms`). Only the data array changes.

- [x] Task 2: Remove quick-start section from homepage
  - File: `apps/web/src/routes/index.tsx`
  - Action: Delete the entire `<section className="island-shell quick-start">` block (the one containing "Edit `src/routes/index.tsx`..." developer instructions).
  - Notes: No replacement — this section is purely scaffold.

- [x] Task 3: Add categories teaser section to homepage
  - File: `apps/web/src/routes/index.tsx`
  - Action: Add a new section after `<RecentlyViewedRow />` (before the features section) with popular category links. Structure:
    ```jsx
    <section className="categories-teaser">
      <h2 className="island-kicker categories-teaser__kicker">Shop by Category</h2>
      <div className="categories-teaser__grid">
        {POPULAR_CATEGORIES.map((cat, index) => (
          <Link
            key={cat.slug}
            to="/products"
            search={{
              category: cat.filter,
              minPrice: undefined,
              maxPrice: undefined,
              inStock: undefined,
              sortBy: undefined,
              sortDirection: undefined,
            }}
            className="island-shell categories-teaser__card rise-in"
            style={{ animationDelay: `${index * 90 + 80}ms` }}
          >
            <span className="categories-teaser__label">{cat.label}</span>
          </Link>
        ))}
      </div>
    </section>
    ```
  - Notes:
    - **CRITICAL (F3 fix)**: The `search` prop MUST include ALL `ProductSearchParams` fields with unused ones set to `undefined`. The type requires `category`, `minPrice`, `maxPrice`, `inStock`, `sortBy`, `sortDirection`. Omitting fields causes a TypeScript error.
    - **Accessibility (F8 fix)**: Use `<h2>` for the kicker instead of `<p>` to give screen readers a heading for this section.
    - **Animation (F6 fix)**: Include staggered `animationDelay` like the features cards for visual consistency.
    - **(F12 fix)**: Do NOT include an "All" category — it would duplicate the hero's "Browse Products" button.
    - Define `POPULAR_CATEGORIES` as a module-level constant. Use ONLY filter values that exist in `FALLBACK_CATEGORIES` from `getProducts.ts`:
      ```ts
      const POPULAR_CATEGORIES = [
        { slug: "fashion", label: "Fashion", filter: "Clothing" },
        { slug: "home", label: "Home & Living", filter: "Home" },
      ] as const;
      ```
    - **(F4 fix)**: Do NOT invent category filter values (e.g., "Beauty", "Electronics") that don't exist in `FALLBACK_CATEGORIES`. Only use `"Clothing"` and `"Home"`. Additional categories can be added later when the Violet catalog provides real category data.

- [x] Task 4: Add categories teaser CSS to home.css
  - File: `apps/web/src/styles/pages/home.css`
  - Action: Add `.categories-teaser` BEM block after the `/* Features Grid */` CSS section. Structure:
    ```css
    /* Categories Teaser */

    .categories-teaser {
      margin-top: 2rem;
    }

    .categories-teaser__kicker {
      margin-bottom: 0.75rem;
    }

    .categories-teaser__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 1rem;
    }

    .categories-teaser__card {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-xl);
      padding: 1.25rem 1rem;
      text-decoration: none;
      transition: transform 180ms ease, border-color 180ms ease;
    }

    .categories-teaser__card:hover {
      transform: translateY(-2px);
      border-color: color-mix(in oklab, var(--color-amber) 35%, var(--border-subtle));
    }

    .categories-teaser__label {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-ink);
    }
    ```
  - Notes:
    - **(F11 note)**: Cards use `.island-shell` base (plain gradient) rather than `.features__card` override (which adds a white `color-mix`). This creates a subtle visual distinction — intentional, as category cards are navigation links, not content cards.
    - **(F7 fix)**: The `margin-top: 2rem` on `.categories-teaser` provides consistent spacing whether or not `RecentlyViewedRow` renders (it returns null when empty).
    - Responsive by design via `auto-fill` — no media queries needed.

- [x] Task 5: Remove quick-start CSS from home.css
  - File: `apps/web/src/styles/pages/home.css`
  - Action: Delete the entire `/* Quick Start */` CSS block: `.quick-start`, `.quick-start__kicker`, `.quick-start__list`, `.quick-start__list li + li`. Locate by the `/* Quick Start */` comment, not by line number.

- [x] Task 6: Rewrite About page content
  - File: `apps/web/src/routes/about.tsx`
  - Action: Replace the TanStack boilerplate text with Maison Émile brand content:
    - Kicker: "Our Story"
    - Title: "Curated shopping, powered by people and AI."
    - Body (2 paragraphs, both using `className="about__text"`):
      1. "Maison Émile brings together handpicked merchants who share our commitment to quality and authenticity. Every product in our catalog has been curated — not by algorithms alone, but by people who care about what they recommend."
      2. "Powered by AI-driven search and a seamless multi-merchant checkout, we make it effortless to discover and purchase from the best independent sellers — all in one place, with full buyer protection on every order."
  - Notes: No new imports needed. Use two `<p className="about__text">` elements.

- [x] Task 7: Update About page CSS for multi-paragraph spacing
  - File: `apps/web/src/styles/pages/about.css`
  - Action: Add sibling spacing rule after the `.about__text` block:
    ```css
    .about__text + .about__text {
      margin-top: 1rem;
    }
    ```
  - Notes: **(F2 fix)** Current CSS has `margin: 0` on `.about__text` — without this rule, consecutive paragraphs stack with zero spacing.

- [x] Task 8: Update About page meta description
  - File: `apps/web/src/routes/about.tsx`
  - Action: Update the `buildPageMeta` description to:
    `"Maison Émile curates handpicked merchants and AI-powered search for a seamless multi-merchant shopping experience."`
  - Notes: **(F10 fix)** Exact string provided — 120 characters, under the 160-char SEO limit. Aligns with the new body content.

- [x] Task 9: Verify with fix-all
  - Action: Run `bun run fix-all` to ensure Prettier, ESLint, and TypeScript checks pass.

### Acceptance Criteria

- [x] AC 1: Given the homepage loads, when the user views the section below the hero, then 4 value prop cards are displayed with e-commerce content (AI Search, Curated Merchants, Unified Checkout, Secure Payments) — no TanStack/developer content visible.
- [x] AC 2: Given the homepage loads, when the user scrolls past the hero, then no "Quick Start" section with developer instructions is visible.
- [x] AC 3: Given the homepage loads, when the user views the categories teaser, then clickable category cards are displayed for Fashion and Home & Living, each with a proper heading for accessibility.
- [x] AC 4: Given the user clicks the "Fashion" category card, when navigation completes, then `/products?category=Clothing` loads with the category filter pre-applied.
- [x] AC 5: Given the user clicks the "Home & Living" category card, when navigation completes, then `/products?category=Home` loads with the category filter pre-applied.
- [x] AC 6: Given the About page loads, when the user reads the content, then two paragraphs of Maison Émile brand messaging are displayed with visible spacing between them — no TanStack Start boilerplate text visible.
- [x] AC 7: Given the About page is indexed by search engines, when the meta description is read, then it contains "Maison Émile curates handpicked merchants and AI-powered search" (not TanStack Start).
- [x] AC 8: Given the codebase, when `bun run fix-all` is executed, then Prettier, ESLint, and TypeScript checks pass with zero warnings.
- [x] AC 9: Given the homepage CSS, when inspected, then no `.quick-start*` CSS rules exist.
- [x] AC 10: Given a screen reader navigates the homepage, when it reaches the categories teaser, then it encounters an `<h2>` heading "Shop by Category".

## Additional Context

### Dependencies

None — no new packages or API endpoints required. Category filter values are restricted to those defined in `FALLBACK_CATEGORIES` from `getProducts.ts`: `"Clothing"` (Fashion) and `"Home"` (Home & Living).

### Testing Strategy

- **Manual testing**: Load homepage and About page in browser, verify visual output and navigation.
- **Link verification**: Click each category teaser card, confirm `/products?category=X` loads with correct filter.
- **Responsive check**: Verify categories teaser grid and features grid render correctly at mobile (1-col), tablet (2-col), and desktop (4-col) breakpoints.
- **Dark theme**: Verify both pages render correctly in dark mode (island-shell and design tokens handle this automatically).
- **Quality gate**: `bun run fix-all` passes.
- **No automated tests**: These pages are static content with no business logic — manual verification is sufficient.

### Notes

- The `.features` grid CSS (2-col on tablet, 4-col on desktop) is well-designed and preserved for the value props cards.
- CategoryChips exists but is designed for filter interaction on product listing pages. The homepage teaser is a simpler, non-interactive version with navigation links — deliberately not reusing CategoryChips to keep concerns separate.
- Categories teaser uses hardcoded data. If the catalog grows, this can later be connected to a route loader fetching from Violet's categories API — but that's out of scope.
- About page content should sound premium and human — matching the "Maison Émile" luxury-curated brand tone.
- Category teaser currently limited to 2 categories (Fashion, Home & Living) — maps 1:1 to `FALLBACK_CATEGORIES`. Additional categories should only be added when real Violet catalog data provides reliable filter values.
- The `<h2>` used for the categories kicker is styled identically to `.island-kicker` (uppercase, small) — it won't look like a heading visually, but provides correct semantic structure for accessibility.

## Review Notes

- Adversarial review completed
- Findings: 12 total, 3 fixed, 9 skipped (noise/out-of-scope)
- Resolution approach: auto-fix
- Fixed: F3 (`:focus-visible` on category cards), F9 (restored `max-width: 48rem` on hero title), F11 (`max-width: 20rem` on categories grid to prevent sprawl)
