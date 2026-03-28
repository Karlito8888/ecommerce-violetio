---
project_name: "E-commerce"
user_name: "Charles"
date: "2026-03-28"
sections_completed: ["technology_stack", "language_rules", "framework_rules", "testing_rules", "code_quality", "workflow_rules", "critical_rules"]
status: "complete"
rule_count: 87
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Monorepo

- **Package Manager**: Bun 1.2.4 (workspaces: apps/\*, packages/\*)
- **TypeScript**: 5.9.3 (strict mode, bundler resolution, ES2022 target)

### Web (apps/web)

- **Framework**: TanStack Start v1.166+ (RC) with Vite 7.3
- **Router**: TanStack Router v1.166+ (file-based routing)
- **State**: TanStack Query v5.90+ (suspense-first)
- **React**: 19.2.4
- **Styling**: Vanilla CSS + BEM (NO Tailwind)
- **Payment**: Stripe Elements (react-stripe-js 5.6, stripe-js 8.9)
- **Sanitization**: isomorphic-dompurify 3.4, marked 17.0
- **Validation**: Zod 4.3
- **Icons**: lucide-react 0.577
- **Testing**: Vitest 3.0 + jsdom 28.1

### Mobile (apps/mobile)

- **Framework**: Expo SDK 55.0 + expo-router ~55.0.4
- **React Native**: 0.83.2 (PINNED — do not bump without SDK upgrade)
- **React**: 19.2.0 (PINNED — Expo-specific version)
- **Reanimated**: 4.2.1 (PINNED)
- **Testing**: Vitest 4.0

### Backend

- **Supabase**: PostgreSQL + Auth + Edge Functions (Deno) + Realtime + Storage
- **Supabase JS**: 2.98+ | SSR: 0.9+

### External Services

- **Violet.io**: Multi-merchant commerce API (products, cart, checkout, orders)
- **Stripe**: Payment via Violet-provided payment intents
- **OpenAI**: Embeddings for semantic search (pgvector)

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **Strict mode enforced** — `tsconfig.base.json` has `strict: true`. All apps extend it. No `any` unless absolutely necessary.
- **Path aliases differ per app**:
  - Web: `#/*` AND `@/*` both resolve to `./src/*` (prefer `#/*` — it's the Node subpath import in package.json)
  - Mobile: `@/*` resolves to `./src/*`, `@/assets/*` to `./assets/*`
  - Shared packages: no aliases, use relative imports
- **Unused variables**: prefix with `_` to suppress ESLint warnings (both args and vars via `argsIgnorePattern: "^_"`, `varsIgnorePattern: "^_"`)
- **Module system**: ESM everywhere (`"type": "module"`). Use `import`/`export`, never `require` (exception: mobile has `no-require-imports` disabled for Expo compatibility)
- **Return tuples for API calls**: all client functions in `packages/shared/src/clients/` return `{ data, error }` tuples (matching Supabase's pattern). Never throw from API clients.
- **camelCase internally, snake_case at boundaries**: Violet API sends snake_case. All mapping happens in the adapter layer (`packages/shared/src/adapters/`). Internal types use camelCase exclusively.
- **Zod for runtime validation at API boundaries**: schemas in `packages/shared/src/schemas/`. Use `z.string()` catch-alls for forward compatibility.
- **IDs are `string`**, prices are `number` (integer cents) in all internal types.
- **No `console.log`** — ESLint warns on `no-console`. Use proper error handling or remove debug logs.
- **No `debugger`** — ESLint errors on `no-debugger`.

### Framework-Specific Rules

#### TanStack Start / Router (Web)

- **File-based routing** in `apps/web/src/routes/`. Route tree auto-generated in `routeTree.gen.ts` — NEVER edit manually.
- **Router config** in `src/router.tsx` — scroll restoration, intent-based preloading.
- **Root layout** in `src/routes/__root.tsx` — HTML shell, theme init script, Header/Footer.
- **Server Functions** for secure API calls — Violet API keys and Supabase service role NEVER in client bundle.
- **NOT Vinxi** — uses `tanstackStart()` Vite plugin directly.

#### TanStack Query

- **Suspense-first**: `useSuspenseQuery` / `useSuspenseInfiniteQuery`, not `useQuery`.
- **queryOptions factories** in `packages/shared/src/hooks/` — accept `fetchFn` parameter for cross-platform reuse.
- **Centralized query keys** in `packages/shared/src/utils/constants.ts`. Never hardcode keys.
- **staleTime**: 5 min for catalog, `Infinity` for user/session.
- **Cache invalidation**: `useMutation` → `onSuccess` → `queryClient.invalidateQueries(...)`.

#### React Patterns

- **Named function components** (not arrow): `export default function ProductCard() {}`.
- **No Redux/Zustand/Context for global state** — TanStack Query cache IS the store.
- **`useState` only for ephemeral UI state**.
- **Auth**: `useAuthSession` hook with `onAuthStateChange()`, auto-creates anonymous session.

#### Expo / React Native (Mobile)

- **PINNED versions** — react 19.2.0, react-native 0.83.2, reanimated 4.2.1. NEVER bump without SDK upgrade.
- **File-based routing** with `_layout.tsx`, tab navigation.
- **`no-require-imports` is OFF** for mobile only.

#### Supabase

- **RLS mandatory** on every table — `ENABLE ROW LEVEL SECURITY` + explicit policies.
- **Edge Functions**: Deno runtime, directory + `index.ts` entry, shared code in `_shared/`.
- **Edge Function limits**: 2s CPU, 10MB bundle.
- **Response shape**: `{ data: T | null, error: { code, message } | null }`.
- **Webhook HMAC**: raw body → HMAC check → idempotency via `webhook_events` table → always 200 (except 401 on HMAC failure).

#### Violet.io Commerce API

- **Adapter Pattern**: `SupplierAdapter` interface abstracts all commerce operations. Current impl: Violet. Designed for firmly.ai / Google UCP later.
- **Adapter layer** (`packages/shared/src/adapters/`) handles ALL snake_case → camelCase.
- **Domain model**: Products are "Offers" (merchant-specific) containing "SKUs" (purchasable variants).
- **Cart/Bag model**: one Cart → multiple Bags (one per merchant). Each Bag has independent lifecycle: `IN_PROGRESS → SUBMITTED → ACCEPTED → COMPLETED → REFUNDED`.
- **JWT auth**: tokens expire every 24h. Refresh via `/api-reference/auth/refresh-token`. Always include `X-Violet-Token` and `X-Violet-App-Secret` headers.
- **Iterative checkout flow** (strict sequence): Create Cart → Add SKUs → Apply Customer info (+ addresses) → Get Shipping Methods → Set Shipping → Apply Payment (Stripe `payment_intent_client_secret`) → Submit Cart.
- **Stripe integration**: Violet provides `payment_intent_client_secret`. Frontend uses Stripe Elements `PaymentElement` → `confirmPayment()` → handle 3D Secure → submit order. NO card data touches our servers.
- **Webhooks**: events for Orders, Merchants, Offers, Collections, Syncs, Payout Accounts, Payment Transactions, Transfers. Validate via HMAC (`X-Violet-Hmac-SHA256`), deduplicate via `X-Violet-Event-Id`.
- **Rate limits**: respect rate limits per Violet docs. Implement exponential backoff.
- **Environments**: Demo (mock), Test (sandbox), Live. API base URL changes per environment.
- **Pagination**: cursor-based. Use `page` + `size` params. Check `hasMore` / `totalPages` in response.
- **Media transformations**: Violet supports dynamic image resizing — use for thumbnails/responsive images instead of serving full-size.
- **Refunds & Cancellations**: operate at Bag level (not Cart/Order level). Each bag can be independently refunded/cancelled.
- **Documentation reference**: full API index at `/home/charles/Bureau/E-commerce/violet-ai-llms-txt.md`. Fetch live docs via `WebFetch("https://docs.violet.io/{path}")`.

### Testing Rules

- **Framework**: Vitest (web: v3.0, mobile: v4.0). Config in each app's `vitest.config.ts`.
- **Test location**: `__tests__/` subfolder alongside source (e.g., `components/product/__tests__/ProductCard.test.tsx`).
- **NO `@testing-library/react`** for rendering — use direct React DOM `createRoot` + `act()` to avoid Bun workspace CJS dual-instance issues. `@testing-library/dom` IS available for DOM queries.
- **Mock factories**: `createMockXxx(overrides?)` pattern — typed fixtures with sensible defaults + per-test overrides.
- **Render helper**: `renderToContainer(element)` — creates real DOM container, appends to `document.body`, renders with `act()`.
- **Cleanup**: `afterEach` manually removes all children from `document.body`.
- **Router mocks**: `vi.mock` TanStack Router's `<Link>` → replace with plain `<a>` resolving `$param` patterns.
- **Assertions**: `container.querySelector`, `textContent`, `getAttribute` — no Testing Library abstractions.
- **Hook/query tests** (in `packages/shared/`): test `queryOptions` factory functions directly, verifying key shape, `staleTime`, and `queryFn` behavior. Not hooks.
- **Run tests**: `bun --cwd=apps/web run test` (web), `bun --cwd=packages/shared run test` (shared).
- **Quality gate**: `bun run fix-all` (Prettier + ESLint + TypeScript check) must pass before committing.

### Code Quality & Style Rules

#### Formatting (Prettier)

- Double quotes, semicolons, trailing commas, 100 char width, 2-space tabs, bracket spacing.
- Run: `bun run format:fix` to auto-format.

#### Linting (ESLint)

- Flat config (`eslint.config.js`), typescript-eslint recommended.
- `--max-warnings 0` — all warnings must be resolved.
- Run: `bun run lint:fix` to auto-fix.

#### File Naming Conventions

- **Routes**: kebab-case directories + `index.tsx` or `$paramId.tsx` for dynamic segments.
- **Components**: PascalCase `.tsx` files, grouped by domain subfolder (kebab-case folder name).
- **Hooks**: camelCase `useXxx.ts` with `use` prefix.
- **Shared package**: domain-grouped directories, `kebab-case.purpose.ts` (e.g., `product.types.ts`, `product.schema.ts`).
- **CSS**: kebab-case everywhere in `styles/` tree (e.g., `product-card.css`).
- **Supabase migrations**: `YYYYMMDDHHMMSS_description.sql`.
- **Edge Functions**: kebab-case directories, `index.ts` entry point.

#### Component Structure Pattern

1. CSS import first (co-located `.css` file)
2. Named interface exports for props/types
3. Module-level constants (`ALL_CAPS`)
4. `export default function ComponentName()` (named function, not arrow)
5. Internal helper functions as plain `function` declarations inside component body

#### CSS Architecture

- **Entry point**: `styles/index.css` with ordered `@import`s: tokens → base → utilities → components → pages.
- **BEM naming**: `.block__element--modifier` (e.g., `.site-header__nav`, `.hero__title--accent`).
- **Design tokens**: CSS custom properties on `:root` in `tokens.css` (e.g., `--color-ivory`, `--space-4`).
- **Dark theme**: `[data-theme="dark"]` selector overrides color tokens. JS sets `data-theme` on `<html>`.
- **NO Tailwind, NO CSS-in-JS** — Vanilla CSS + BEM exclusively.
- **Co-located CSS**: component `.css` files imported directly in component; canonical styles in `styles/components/`.

#### Documentation

- Comments only when logic isn't self-evident.
- No dead code left in comments.
- JSDoc on complex components explaining purpose and design decisions.

### Development Workflow Rules

#### Git & Commits

- **Conventional commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, etc.
- **Co-author line required**: all commits end with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`.
- **Pre-commit quality gate**: run `bun run fix-all` before every commit.

#### Build & Dev

- **Dev server**: `bun run dev` (web on port 3000), `bun run dev:mobile` (Expo).
- **Build**: `bun run build` (web only).
- **Typecheck**: `bun run typecheck` (checks both web + mobile).
- **All scripts via Bun**: never use `npm` or `yarn`.

#### Package Management

- **Bun workspaces**: packages consumed as `workspace:*` with direct TS source imports (no build step for packages).
- **Adding dependencies**: `bun add <pkg>` at root or `bun --cwd=apps/web add <pkg>` for app-specific.
- **Deferred upgrades**: `vite-tsconfig-paths` v5→v6 and `vitest` v3→v4 need dedicated testing — don't bump casually.

#### BMAD Framework

- **Sprint tracking**: `_bmad-output/implementation-artifacts/sprint-status.yaml`.
- **Story files**: format `{epic#}-{story#}-{slug}.md` in `_bmad-output/implementation-artifacts/`.
- **Planning artifacts**: PRD, architecture, epics, UX spec in `_bmad-output/planning-artifacts/`.

#### Documentation Access

- **Violet.io docs**: read index at `/home/charles/Bureau/E-commerce/violet-ai-llms-txt.md`, then fetch via `WebFetch("https://docs.violet.io/{path}")`.
- **Supabase, Expo, TanStack, React docs**: use Context7 MCP (`resolve-library-id` → `query-docs`).
- **Niche docs**: `WebFetch` / `WebSearch` as last resort.

### Critical Don't-Miss Rules

#### Anti-Patterns — NEVER Do

- **NEVER use Tailwind or CSS-in-JS** — architectural decision. Vanilla CSS + BEM only.
- **NEVER edit `routeTree.gen.ts`** — auto-generated by TanStack Router plugin.
- **NEVER bump Expo-pinned versions** (react, react-native, reanimated) without SDK upgrade.
- **NEVER use `useQuery`** — always `useSuspenseQuery` (suspense-first pattern).
- **NEVER throw from API clients** — return `{ data, error }` tuples.
- **NEVER hardcode query keys** — use `queryKeys` factory from `packages/shared/src/utils/constants.ts`.
- **NEVER store Violet API keys or Supabase service role in client bundle** — Server Functions only.
- **NEVER create a Supabase table without RLS** + explicit policies.
- **NEVER skip HMAC validation on webhooks** — always validate before processing.
- **NEVER process card data on our servers** — Stripe Elements handles all payment UI client-side.

#### Security

- **RLS on every table** — `auth.uid() = user_id` pattern for user-scoped policies.
- **HMAC webhook validation** — raw body text → HMAC check → 401 on failure.
- **Idempotent webhook processing** — `webhook_events` table with `UNIQUE` constraint on `event_id`.
- **Server Functions for secrets** — API keys, tokens, service roles stay server-side.
- **Input sanitization** — `isomorphic-dompurify` for HTML content, `zod` for API boundaries.

#### Performance

- **SSR mandatory** for product pages (SEO + Core Web Vitals).
- **Edge Function 2s CPU limit** — decompose complex operations.
- **Code splitting** — route-based via TanStack Start, lazy loading for heavy components.
- **Image optimization** — use Violet media transformations for responsive images.
- **staleTime tuning** — 5 min catalog, Infinity for session. Avoid unnecessary refetches.

#### Multi-Merchant Edge Cases

- **Partial order success** — individual bags can fail while others succeed. UX must handle this.
- **Per-bag refunds/cancellations** — operate at bag level, not order level.
- **Per-merchant support routing** — support context must include bag-level merchant info.
- **Shipping per bag** — each bag gets independent shipping methods from its merchant.
- **Out-of-order webhook delivery** — design for eventual consistency, not strict ordering.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Consult Violet.io docs via the llms-txt index before coding against the API

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-03-28
