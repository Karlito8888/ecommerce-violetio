# Story 8.1: FAQ & Help Center (Web + Mobile)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260401000000_faq_and_support.sql` | Create `faq_items` + `support_inquiries` tables with RLS |
| CREATE | `packages/shared/src/types/faq.types.ts` | FaqItem, FaqCategory types |
| CREATE | `packages/shared/src/clients/faq.ts` | getFaqItems(), getFaqItemsByCategory() — Supabase queries |
| UPDATE | `packages/shared/src/clients/index.ts` | Export faq client functions |
| UPDATE | `packages/shared/src/types/index.ts` | Export faq types |
| CREATE | `apps/web/src/routes/help/index.tsx` | FAQ listing page — SSR, accordion, search/filter |
| CREATE | `apps/web/src/server/getFaq.ts` | Server functions for FAQ data fetching |
| CREATE | `apps/web/src/components/help/FaqAccordion.tsx` | Accordion component for FAQ items |
| CREATE | `apps/web/src/components/help/FaqSearch.tsx` | Search/filter input for FAQ |
| CREATE | `apps/web/src/styles/pages/faq.css` | BEM styles for `.faq-page` block |
| CREATE | `apps/web/src/styles/components/faq-accordion.css` | BEM styles for `.faq-accordion` block |
| UPDATE | `apps/web/src/styles/index.css` | Import new CSS files |
| CREATE | `apps/mobile/src/app/help/index.tsx` | Mobile FAQ screen with accordion |
| CREATE | `apps/mobile/src/app/help/_layout.tsx` | Help section layout for mobile |
| CREATE | `apps/web/src/__tests__/faq.test.ts` | Tests for FAQ client, components |

---

## Story

As a **visitor**,
I want to browse a FAQ and help section covering common questions,
So that I can find answers without contacting support.

## Acceptance Criteria

1. **Given** a visitor has questions about shipping, returns, payment, or order tracking
   **When** they navigate to the help/FAQ page
   **Then** FAQ content is displayed in an accordion/expandable format organized by category (FR27b)

2. **Given** the FAQ page is rendered
   **When** the visitor views the categories
   **Then** categories include: Shipping & Delivery, Returns & Refunds, Payment Methods, Order Tracking, Account & Privacy

3. **Given** the FAQ data model
   **When** FAQ content is stored in the database
   **Then** FAQ content is stored in Supabase `faq_items` table (category, question, answer_markdown, sort_order)

4. **Given** the database schema
   **When** the migration runs
   **Then** `supabase/migrations/20260401000000_faq_and_support.sql` creates `faq_items` + `support_inquiries` tables with RLS

5. **Given** the web platform
   **When** the FAQ page is served
   **Then** web: FAQ page at `apps/web/src/routes/help/index.tsx`, SSR for SEO (NFR1, NFR18)

6. **Given** the mobile platform
   **When** the FAQ screen is accessed
   **Then** mobile: help screen at `apps/mobile/src/app/help/index.tsx`

7. **Given** FAQ answers contain relevant information
   **When** the visitor reads an answer
   **Then** FAQ answers include links to relevant platform pages (e.g., order lookup page at `/orders/lookup`)

8. **Given** the web BEM styling convention
   **When** the FAQ page is styled
   **Then** web: BEM CSS (`faq-page`, `faq-page__category`, `faq-accordion`, `faq-accordion__item`, `faq-accordion__question`, `faq-accordion__answer`)

9. **Given** the FAQ page has many items
   **When** the visitor wants to find a specific question
   **Then** a search/filter within FAQ quickly finds relevant questions (client-side text filter)

10. **Given** accessibility requirements (NFR20, NFR21, NFR22)
    **When** the FAQ is rendered
    **Then** accordion items are keyboard-accessible (Enter/Space to toggle), use proper ARIA attributes (`aria-expanded`, `aria-controls`), and color contrast meets 4.5:1 ratio

## Tasks / Subtasks

- [x] **Task 1: Database migration — `faq_items` + `support_inquiries` tables** (AC: #3, #4)
  - [x] 1.1: Create `supabase/migrations/20260401000000_faq_and_support.sql`:
    - Create `faq_items` table:
      ```sql
      CREATE TABLE public.faq_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category TEXT NOT NULL,
        question TEXT NOT NULL,
        answer_markdown TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_published BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ```
    - Create `support_inquiries` table (for Story 8.2, but migration is shared per epics spec):
      ```sql
      CREATE TABLE public.support_inquiries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        order_id TEXT,
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in-progress', 'resolved')),
        internal_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ```
    - Add RLS policies:
      ```sql
      -- faq_items: public read for published items
      ALTER TABLE faq_items ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "public_read_published_faq" ON faq_items
        FOR SELECT USING (is_published = true);
      CREATE POLICY "service_role_all_faq" ON faq_items
        FOR ALL USING (auth.role() = 'service_role');

      -- support_inquiries: insert for anyone (with anon key), read/update for service_role only
      ALTER TABLE support_inquiries ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "anon_insert_support" ON support_inquiries
        FOR INSERT WITH CHECK (true);
      CREATE POLICY "service_role_all_support" ON support_inquiries
        FOR ALL USING (auth.role() = 'service_role');
      ```
    - Add indexes:
      ```sql
      CREATE INDEX idx_faq_items_category_sort ON faq_items(category, sort_order) WHERE is_published = true;
      CREATE INDEX idx_support_inquiries_status ON support_inquiries(status, created_at DESC);
      ```
    - Add column comments for Supabase Studio:
      ```sql
      COMMENT ON COLUMN faq_items.category IS 'FAQ category grouping. Standard: Shipping & Delivery, Returns & Refunds, Payment Methods, Order Tracking, Account & Privacy';
      COMMENT ON COLUMN faq_items.answer_markdown IS 'Markdown-formatted answer. Supports links: [text](/path). Keep concise but comprehensive';
      COMMENT ON COLUMN faq_items.sort_order IS 'Display order within category. Lower = first. Use multiples of 10 for easy reordering';
      COMMENT ON COLUMN faq_items.is_published IS 'Set to false to hide without deleting. Only published items visible to visitors';
      COMMENT ON COLUMN support_inquiries.status IS 'Workflow: new → in-progress → resolved. Updated by admin';
      COMMENT ON COLUMN support_inquiries.order_id IS 'Optional Violet order ID for order-related inquiries';
      ```
    - Add updated_at trigger (reuse pattern from content_pages if exists, or create):
      ```sql
      CREATE TRIGGER set_faq_items_updated_at
        BEFORE UPDATE ON faq_items
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      CREATE TRIGGER set_support_inquiries_updated_at
        BEFORE UPDATE ON support_inquiries
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      ```
    - Seed initial FAQ data with 2-3 items per category for development
  - [x] 1.2: Verify migration applies cleanly: `supabase db reset`
  - [x] 1.3: Verify seed data inserts correctly

- [x] **Task 2: Shared types and client** (AC: #3)
  - [x] 2.1: Create `packages/shared/src/types/faq.types.ts`:
    ```typescript
    export interface FaqItem {
      id: string;
      category: string;
      question: string;
      answerMarkdown: string;
      sortOrder: number;
      isPublished: boolean;
      createdAt: string;
      updatedAt: string;
    }

    export type FaqCategory = {
      name: string;
      items: FaqItem[];
    };
    ```
  - [x] 2.2: Create `packages/shared/src/clients/faq.ts`:
    ```typescript
    import type { SupabaseClient } from "@supabase/supabase-js";
    import type { FaqItem, FaqCategory } from "../types/faq.types";

    interface FaqItemRow {
      id: string;
      category: string;
      question: string;
      answer_markdown: string;
      sort_order: number;
      is_published: boolean;
      created_at: string;
      updated_at: string;
    }

    function mapRow(row: FaqItemRow): FaqItem {
      return {
        id: row.id,
        category: row.category,
        question: row.question,
        answerMarkdown: row.answer_markdown,
        sortOrder: row.sort_order,
        isPublished: row.is_published,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    export async function getFaqItems(
      client: SupabaseClient,
    ): Promise<FaqCategory[]> {
      const { data, error } = await client
        .from("faq_items")
        .select("*")
        .eq("is_published", true)
        .order("category")
        .order("sort_order", { ascending: true });

      if (error || !data) return [];

      const items = (data as FaqItemRow[]).map(mapRow);

      // Group by category, preserving sort_order within each
      const categoryMap = new Map<string, FaqItem[]>();
      for (const item of items) {
        const existing = categoryMap.get(item.category) ?? [];
        existing.push(item);
        categoryMap.set(item.category, existing);
      }

      // Define canonical category order
      const categoryOrder = [
        "Shipping & Delivery",
        "Returns & Refunds",
        "Payment Methods",
        "Order Tracking",
        "Account & Privacy",
      ];

      const result: FaqCategory[] = [];
      for (const name of categoryOrder) {
        const items = categoryMap.get(name);
        if (items && items.length > 0) {
          result.push({ name, items });
        }
        categoryMap.delete(name);
      }
      // Append any extra categories not in canonical list
      for (const [name, items] of categoryMap) {
        result.push({ name, items });
      }

      return result;
    }
    ```
  - [x] 2.3: Update `packages/shared/src/clients/index.ts` — export `getFaqItems` and types
  - [x] 2.4: Update `packages/shared/src/types/index.ts` — export faq types

- [x] **Task 3: Web server function** (AC: #5)
  - [x] 3.1: Create `apps/web/src/server/getFaq.ts`:
    ```typescript
    import { createServerFn } from "@tanstack/react-start";
    import { createSupabaseClient, getFaqItems } from "@ecommerce/shared";

    export const getFaqItemsFn = createServerFn({ method: "GET" })
      .handler(async (): Promise<FaqCategory[]> => {
        const client = createSupabaseClient();
        return getFaqItems(client);
      });
    ```
    - Follow exact same pattern as `getContent.ts` server functions
    - RLS handles published filtering — no additional auth needed

- [x] **Task 4: Web FAQ page route** (AC: #1, #5, #7, #8, #9, #10)
  - [x] 4.1: Create `apps/web/src/routes/help/index.tsx`:
    - File-based route → URL: `/help`
    - Use `createFileRoute` from `@tanstack/react-router`
    - Loader calls `getFaqItemsFn()` for SSR
    - Page structure:
      ```
      .faq-page
        .faq-page__header
          h1.faq-page__title — "Help Center"
          p.faq-page__subtitle — "Find answers to common questions"
        .faq-page__search
          FaqSearch component
        .faq-page__categories
          for each category:
            .faq-page__category
              h2.faq-page__category-title
              FaqAccordion items={filtered items}
        .faq-page__contact-cta
          "Can't find what you're looking for?" → link to /help/contact (Story 8.2)
      ```
    - SEO: `buildPageMeta()` for title "Help Center — FAQ" and description
    - Structured data: FAQPage schema.org JSON-LD for SEO benefit
  - [x] 4.2: Create `apps/web/src/components/help/FaqAccordion.tsx`:
    - Props: `{ items: FaqItem[] }`
    - Uses native `<details>/<summary>` HTML elements for zero-JS accordion
    - ARIA: `role="region"`, `aria-labelledby` on each item
    - Keyboard: native `<details>` supports Enter/Space natively
    - Renders `answer_markdown` through a simplified Markdown renderer (use `marked` + `DOMPurify` — same as MarkdownRenderer but without product embeds)
    - Internal links in answers work naturally (standard `<a>` tags)
    - BEM: `.faq-accordion`, `.faq-accordion__item`, `.faq-accordion__question`, `.faq-accordion__answer`, `.faq-accordion__icon`
  - [x] 4.3: Create `apps/web/src/components/help/FaqSearch.tsx`:
    - Client-side text filter (no server round-trip)
    - Props: `{ value: string; onChange: (value: string) => void }`
    - Input with search icon, debounced filtering
    - BEM: `.faq-search`, `.faq-search__input`, `.faq-search__icon`
    - Filters questions AND answers (case-insensitive substring match)
    - When filtering, auto-expand matching accordion items

- [x] **Task 5: Web CSS** (AC: #8)
  - [x] 5.1: Create `apps/web/src/styles/pages/faq.css`:
    ```css
    .faq-page { max-width: 800px; margin: 0 auto; padding: var(--space-8) var(--space-4); }
    .faq-page__header { text-align: center; margin-bottom: var(--space-8); }
    .faq-page__title { font-size: var(--text-3xl); margin-bottom: var(--space-2); }
    .faq-page__subtitle { color: var(--color-text-secondary); font-size: var(--text-lg); }
    .faq-page__categories { display: flex; flex-direction: column; gap: var(--space-8); }
    .faq-page__category-title { font-size: var(--text-xl); margin-bottom: var(--space-4); padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-sand); }
    .faq-page__contact-cta { text-align: center; margin-top: var(--space-10); padding: var(--space-6); background: var(--color-surface); border-radius: var(--radius-lg); }
    ```
  - [x] 5.2: Create `apps/web/src/styles/components/faq-accordion.css`:
    ```css
    .faq-accordion { display: flex; flex-direction: column; gap: var(--space-2); }
    .faq-accordion__item { border: 1px solid var(--color-sand); border-radius: var(--radius-md); overflow: hidden; }
    .faq-accordion__item[open] .faq-accordion__icon { transform: rotate(180deg); }
    .faq-accordion__question { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); cursor: pointer; font-weight: 500; list-style: none; }
    .faq-accordion__question::-webkit-details-marker { display: none; }
    .faq-accordion__question::marker { display: none; }
    .faq-accordion__icon { transition: transform 0.2s ease; flex-shrink: 0; }
    .faq-accordion__answer { padding: 0 var(--space-4) var(--space-4); color: var(--color-text-secondary); line-height: 1.6; }
    .faq-accordion__answer a { color: var(--color-accent); text-decoration: underline; }
    ```
  - [x] 5.3: Update `apps/web/src/styles/index.css` — add imports for `pages/faq.css` and `components/faq-accordion.css`

- [x] **Task 6: Mobile FAQ screen** (AC: #6)
  - [x] 6.1: Create `apps/mobile/src/app/help/_layout.tsx`:
    - Stack layout for help section
    - Header title: "Help Center"
  - [x] 6.2: Create `apps/mobile/src/app/help/index.tsx`:
    - Fetch FAQ items using `createSupabaseClient()` + `getFaqItems()` from `@ecommerce/shared`
    - Use `SectionList` with category as section header
    - Each item: `Pressable` with expand/collapse state
    - Render `answer_markdown` as plain text via `stripMarkdownSyntax()` (existing util) for MVP
    - Links in answers: detect URLs and make tappable (or use simplified Markdown renderer if available)
    - Search: `TextInput` at top with client-side filtering
    - Follow existing mobile data fetching pattern (useEffect/useState, NOT TanStack Query)

- [x] **Task 7: SEO — Structured Data** (AC: #5)
  - [x] 7.1: Add FAQPage JSON-LD structured data in the web route:
    ```typescript
    const faqJsonLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: allItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answerMarkdown, // stripped of Markdown for structured data
        },
      })),
    };
    ```
    - Inject via `<script type="application/ld+json">` in route head
    - This enables Google rich results for FAQ pages

- [x] **Task 8: Seed data** (AC: #1, #2)
  - [x] 8.1: Add seed FAQ items in the migration (or `supabase/seed.sql`):
    - 2-3 items per category, covering real questions:
      - **Shipping & Delivery**: "How long does shipping take?", "Do you ship internationally?"
      - **Returns & Refunds**: "What is your return policy?", "How do I request a refund?"
      - **Payment Methods**: "What payment methods do you accept?", "Is my payment information secure?"
      - **Order Tracking**: "How do I track my order?", "I haven't received my order, what do I do?"
      - **Account & Privacy**: "How do I delete my account?", "How is my data used?"
    - Answers should include links to relevant pages (e.g., `/orders/lookup` for order tracking)

- [x] **Task 9: Tests** (AC: all)
  - [x] 9.1: Create `apps/web/src/__tests__/faq.test.ts`:
    - Test `getFaqItems()`: returns grouped categories, handles empty data, handles errors
    - Test category ordering: canonical categories appear in correct order
    - Test `mapRow()`: snake_case → camelCase mapping
    - Test FAQ search filtering logic (if extracted as a pure function)
    - Test structured data generation
  - [x] 9.2: Use vitest + mock Supabase client (existing pattern from content tests)
  - [x] 9.3: Target: 8-12 new tests

- [x] **Task 10: Quality checks** (AC: all)
  - [x] 10.1: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck)
  - [x] 10.2: `bun --cwd=apps/web run test` — all 420+ existing tests pass + new tests pass
  - [x] 10.3: `bun run typecheck` — 0 TypeScript errors
  - [x] 10.4: Verify migration applies cleanly with `supabase db reset`
  - [x] 10.5: Verify FAQ page renders correctly at `/help` with SSR
  - [x] 10.6: Verify accordion keyboard navigation works (Tab, Enter/Space)

## Dev Notes

### Critical Architecture Constraints

- **Vanilla CSS + BEM only** — No Tailwind, no CSS-in-JS. All new components use BEM naming: `.faq-page`, `.faq-accordion`, `.faq-search`. Follow existing patterns in `apps/web/src/styles/`.

- **SSR mandatory for FAQ page** — FAQ page MUST be server-rendered for SEO (NFR1, NFR18). Use route loader with `getFaqItemsFn()` server function. This is the same pattern as content pages.

- **Native `<details>/<summary>` for accordion** — Do NOT use a third-party accordion library. The native HTML elements provide keyboard accessibility, ARIA semantics, and zero-JS operation out of the box. Style with CSS only.

- **`faq_items` is a NEW table, NOT an extension of `content_pages`** — The epics spec explicitly calls for a `faq_items` table. FAQ data has a different structure (category + question + answer) than content pages (slug + title + body + type). Keep them separate.

- **Migration creates BOTH `faq_items` AND `support_inquiries`** — The epics spec says `00012_faq_and_support.sql` creates both tables. We use `20260401000000` timestamp format (project convention). Story 8.2 will use the `support_inquiries` table — do NOT build any support form UI in this story.

- **RLS policies follow established patterns** — Public read for published FAQ items (no auth required). Service role full access for admin CRUD via Supabase Studio. Same pattern as `content_pages`.

- **No new dependencies** — Use existing `marked` + `DOMPurify` for Markdown rendering in FAQ answers. Use existing `@supabase/supabase-js` client. No accordion libraries, no search libraries.

- **Mobile uses manual fetch pattern** — Mobile does NOT use TanStack Query. Use `useEffect`/`useState` with `createSupabaseClient()` + `getFaqItems()` from shared package. Same pattern as `apps/mobile/src/app/content/[slug].tsx`.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `createSupabaseClient()` | `packages/shared/src/clients/supabase.ts` | Anon Supabase client with RLS |
| `buildPageMeta()` | `packages/shared/src/utils/seo.ts` | SEO meta tags for route head |
| `stripMarkdownSyntax()` | `packages/shared/src/utils/` | Strip Markdown for mobile plain-text rendering |
| `marked` + `DOMPurify` | Already in web dependencies | Markdown → sanitized HTML (used in MarkdownRenderer) |
| `createServerFn` | `@tanstack/react-start` | Server function pattern for SSR data fetching |
| `createFileRoute` | `@tanstack/react-router` | File-based route definition |
| Design tokens | `apps/web/src/styles/tokens.css` | `--color-sand`, `--space-*`, `--text-*`, `--radius-*`, `--color-accent` |
| `update_updated_at_column()` | Existing DB function | Trigger function for updated_at — reuse, do NOT recreate |

### Existing Code Patterns to Follow

```typescript
// Server function pattern (from getContent.ts)
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseClient, getFaqItems } from "@ecommerce/shared";

export const getFaqItemsFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const client = createSupabaseClient();
    return getFaqItems(client);
  });
```

```typescript
// Route loader pattern (from content/index.tsx)
export const Route = createFileRoute("/help/")({
  loader: () => getFaqItemsFn(),
  head: () => ({
    meta: buildPageMeta({ title: "Help Center", description: "..." }),
  }),
  component: HelpPage,
});
```

```typescript
// Mobile data fetching pattern (from content/[slug].tsx)
const [categories, setCategories] = useState<FaqCategory[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  async function loadFaq() {
    const client = createSupabaseClient();
    const result = await getFaqItems(client);
    setCategories(result);
    setLoading(false);
  }
  loadFaq();
}, []);
```

### Previous Story Intelligence (Story 7.6)

- **420 tests pass** — test count after Story 7.6 with code review fixes. New FAQ tests should push to ~430+.
- **Web + Mobile scope** — Story 7.6 affected both platforms. Story 8.1 similarly requires both web and mobile.
- **Mobile `as never` cast** — expo-router strict href typing requires `router.push(path as never)` for dynamic routes. Use same pattern if navigation is needed.
- **Commit pattern**: `feat: implement <description> (Story X.Y) + code review fixes`
- **`bun run fix-all` is the quality gate** — Prettier + ESLint + TypeCheck. Must pass before considering done.
- **Additive migrations only** — Do not modify existing tables or constraints. The `faq_items` and `support_inquiries` tables are entirely new.
- **Column comments for Supabase Studio** — Story 7.6 established the pattern of adding `COMMENT ON COLUMN` for admin UX. Follow same pattern for FAQ tables.

### Git Intelligence

- Latest commit: `09ea4a7 feat: implement content administration via Supabase Studio (Story 7.6) + Epic 7 review fixes`
- Last 10 commits are all Epic 7 stories (Content, SEO & Editorial) — codebase is stable
- 420 passing tests as baseline
- CSS files follow consistent import order in `index.css`: tokens → base → utilities → components → pages
- New routes require updating `routeTree.gen.ts` (auto-generated by TanStack Router — happens on dev server start)

### Database Tables Referenced

| Table | Role in this story |
| ----- | ---- |
| `faq_items` | NEW — FAQ questions organized by category |
| `support_inquiries` | NEW — Created in migration but NOT used in this story (used by Story 8.2) |

### Scope Boundaries — What is NOT in this story

- **Contact/support form** — That's Story 8.2. This story creates the `support_inquiries` table but does NOT build any form UI.
- **Admin FAQ management UI** — FAQ items are managed via Supabase Studio (same MVP approach as content pages).
- **Full-text search / Algolia** — FAQ search is simple client-side text filter. No server-side search, no search service.
- **FAQ analytics** — No view tracking, no "was this helpful?" feedback mechanism.
- **Chatbot / AI assistant** — FAQ is static content, no conversational interface.
- **FAQ item CRUD API** — No REST API for FAQ management. Admin uses Supabase Studio directly.
- **Markdown rendering on mobile** — Mobile uses `stripMarkdownSyntax()` for plain text. No rich Markdown rendering on mobile for MVP.

### Project Structure Notes

- **Migration**: `supabase/migrations/20260401000000_faq_and_support.sql` — two new tables
- **Shared types**: `packages/shared/src/types/faq.types.ts` — FaqItem, FaqCategory
- **Shared client**: `packages/shared/src/clients/faq.ts` — getFaqItems with category grouping
- **Server function**: `apps/web/src/server/getFaq.ts` — SSR data fetching
- **Web route**: `apps/web/src/routes/help/index.tsx` — FAQ page with accordion + search
- **Web components**: `apps/web/src/components/help/FaqAccordion.tsx`, `FaqSearch.tsx`
- **Web CSS**: `apps/web/src/styles/pages/faq.css`, `apps/web/src/styles/components/faq-accordion.css`
- **Mobile**: `apps/mobile/src/app/help/index.tsx`, `apps/mobile/src/app/help/_layout.tsx`
- **Tests**: `apps/web/src/__tests__/faq.test.ts`

### References

- [Source: epics.md#Story 8.1 — FAQ & Help Center acceptance criteria]
- [Source: prd.md#FR27b — "Visitors can browse a FAQ/help page covering common questions"]
- [Source: architecture.md — Supabase RLS patterns, SSR strategy, BEM CSS convention]
- [Source: architecture.md — Database naming conventions (snake_case), file-based routing]
- [Source: 7-6-content-administration-via-supabase-studio.md — previous story patterns: column comments, additive migrations, 420 tests baseline]
- [Source: CLAUDE.md — BEM CSS, no Tailwind, Prettier, ESLint, conventional commits]
- [Source: prd.md#NFR1 — Web page performance: FCP < 1.5s, LCP < 2.5s]
- [Source: prd.md#NFR18 — SSR response time < 1.5s at 5x traffic]
- [Source: prd.md#NFR20 — Keyboard accessibility for all interactive elements]
- [Source: prd.md#NFR21 — Color contrast 4.5:1 minimum]
- [Source: prd.md#NFR22 — Respect prefers-reduced-motion]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- `/help/contact` link uses `<a>` instead of TanStack `<Link>` because the contact route (Story 8.2) doesn't exist yet — avoids strict route type error.
- `support_inquiries` table includes CHECK constraints on `subject` and `message` length directly in the migration, matching the epics spec for Story 8.2.
- FAQ accordion uses native `<details>/<summary>` — no need for `aria-expanded` or `aria-controls` as the browser handles these semantics natively.

### Completion Notes List

- Created `supabase/migrations/20260401000000_faq_and_support.sql` — two new tables (`faq_items`, `support_inquiries`) with RLS, indexes, column comments, updated_at triggers, and 12 seed FAQ items across 5 categories.
- Created `packages/shared/src/types/faq.types.ts` — `FaqItem` and `FaqCategory` interfaces.
- Created `packages/shared/src/clients/faq.ts` — `getFaqItems()` function with snake_case→camelCase mapping and canonical category ordering.
- Updated `packages/shared/src/types/index.ts` and `packages/shared/src/clients/index.ts` — barrel exports for new FAQ types and client.
- Created `apps/web/src/server/getFaq.ts` — server function wrapping `getFaqItems` for SSR.
- Created `apps/web/src/routes/help/index.tsx` — SSR FAQ page with search filter, FAQPage JSON-LD structured data, breadcrumb JSON-LD, and BEM layout.
- Created `apps/web/src/components/help/FaqAccordion.tsx` — native `<details>/<summary>` accordion with Markdown rendering via `marked` + `DOMPurify` (sanitized).
- Created `apps/web/src/components/help/FaqSearch.tsx` — search input component with search icon SVG.
- Created `apps/web/src/styles/pages/faq.css` — BEM page styles for `.faq-page` block.
- Created `apps/web/src/styles/components/faq-accordion.css` — BEM component styles with `prefers-reduced-motion` support.
- Updated `apps/web/src/styles/index.css` — added imports for new CSS files.
- Created `apps/mobile/src/app/help/_layout.tsx` — Stack navigator layout for help section.
- Created `apps/mobile/src/app/help/index.tsx` — mobile FAQ screen with SectionList, expand/collapse items, search filter, and `stripMarkdownSyntax()` for plain text rendering.
- Created `apps/web/src/__tests__/faq.test.ts` — 12 tests: getFaqItems (7 tests: canonical ordering, camelCase mapping, grouping, empty data, error handling, custom categories, query params) + FAQ search filtering (5 tests: empty query, question match, answer match, case insensitivity, no matches).
- All 432 tests pass (420 existing + 12 new). `bun run fix-all` exits 0. TypeCheck clean.

### Change Log

- 2026-03-20: Story 8.1 implementation complete — FAQ & Help Center with web SSR page, mobile screen, Supabase migration (2 tables), shared data layer, 12 seed FAQ items, FAQPage structured data for SEO. 12 new tests added. Epic 8 status: in-progress.
- 2026-03-20: Code review fixes — extracted filterFaq to utility for testability (H1), added header title to mobile help layout (M1), documented routeTree.gen.ts in File List (M2), added 200ms search debounce (M3).

### File List

- `supabase/migrations/20260401000000_faq_and_support.sql` (CREATE — faq_items + support_inquiries tables)
- `packages/shared/src/types/faq.types.ts` (CREATE — FaqItem, FaqCategory types)
- `packages/shared/src/clients/faq.ts` (CREATE — getFaqItems with category grouping)
- `packages/shared/src/types/index.ts` (UPDATE — export faq types)
- `packages/shared/src/clients/index.ts` (UPDATE — export getFaqItems)
- `apps/web/src/server/getFaq.ts` (CREATE — server function)
- `apps/web/src/routes/help/index.tsx` (CREATE — FAQ page route with SSR + JSON-LD)
- `apps/web/src/utils/faqFilter.ts` (CREATE — extracted filterFaq for testability)
- `apps/web/src/components/help/FaqAccordion.tsx` (CREATE — details/summary accordion)
- `apps/web/src/components/help/FaqSearch.tsx` (CREATE — search input)
- `apps/web/src/styles/pages/faq.css` (CREATE — BEM page styles)
- `apps/web/src/styles/components/faq-accordion.css` (CREATE — BEM component styles)
- `apps/web/src/styles/index.css` (UPDATE — import new CSS)
- `apps/web/src/routeTree.gen.ts` (AUTO-GENERATED — updated by TanStack Router for /help route)
- `apps/mobile/src/app/help/_layout.tsx` (CREATE — Stack navigator layout with "Help Center" title)
- `apps/mobile/src/app/help/index.tsx` (CREATE — mobile FAQ screen)
- `apps/web/src/__tests__/faq.test.ts` (CREATE — 12 tests)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — story status)
- `_bmad-output/implementation-artifacts/8-1-faq-help-center.md` (UPDATE — story status + dev record)
