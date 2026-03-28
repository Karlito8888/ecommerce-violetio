# Development Guide

## Prerequisites

| Tool             | Version    | Purpose                                                       |
| ---------------- | ---------- | ------------------------------------------------------------- |
| **Bun**          | 1.2.4+     | Package manager and script runner                             |
| **Node.js**      | 22+        | Required by expo/expo-github-action and EAS CLI internals     |
| **Docker**       | Any recent | Required by Supabase local stack (minimum 7 GB RAM allocated) |
| **Supabase CLI** | 2.76.8+    | Local backend, migrations, Edge Functions                     |
| **Git**          | Any recent | Version control                                               |

Install Supabase CLI:

```bash
brew install supabase/tap/supabase
# or follow https://supabase.com/docs/guides/cli/getting-started
```

---

## Quick Start

```bash
# 1. Clone and install dependencies
git clone <repo>
cd e-commerce
bun install

# 2. Set up environment variables (see section below)
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local
cp supabase/.env.example supabase/.env.local
# Edit each .env.local with your actual API keys

# 3. Start Docker, then start Supabase local services
supabase start           # downloads images on first run (~few minutes)
supabase db reset        # applies migrations + seed.sql

# 4. Copy the anon and service role keys printed by `supabase start`
# into apps/web/.env.local (SUPABASE_ANON_KEY) and supabase/.env.local

# 5. Start the web dev server
bun run dev              # http://localhost:3000

# 6. (Optional) Start the mobile dev server
bun run dev:mobile       # Expo on port 8081
```

---

## Environment Variables

The project uses three separate `.env` files. Each has a `.env.example` to copy from.

### Root `.env.example`

Used by scripts and tooling at the monorepo level.

| Variable                             | Description                          | Where to get it                                        |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------------ |
| `VIOLET_APP_ID`                      | Violet.io application ID             | Violet developer dashboard                             |
| `VIOLET_APP_SECRET`                  | Violet.io application secret         | Violet developer dashboard                             |
| `VIOLET_USERNAME`                    | Violet.io account email              | Your Violet account                                    |
| `VIOLET_PASSWORD`                    | Violet.io account password           | Your Violet account                                    |
| `VIOLET_API_BASE`                    | Violet.io API base URL               | Use `https://sandbox-api.violet.io/v1` for development |
| `SUPABASE_URL`                       | Supabase project URL                 | `supabase start` output, or Supabase dashboard         |
| `SUPABASE_ANON_KEY`                  | Supabase publishable anon key        | `supabase start` output, or Supabase dashboard         |
| `STRIPE_PUBLISHABLE_KEY`             | Stripe publishable key               | Stripe dashboard → Developers → API keys               |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Same key with Expo prefix for mobile | Same as above                                          |
| `OPENAI_API_KEY`                     | OpenAI API key for embeddings        | platform.openai.com                                    |

### `apps/web/.env.example`

Used by the TanStack Start web app (Vite). The `VITE_` prefix exposes variables to the browser bundle.

| Variable                      | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `VIOLET_APP_ID`               | Same as root — used server-side in API routes                        |
| `VIOLET_APP_SECRET`           | Same as root — server-side only, never exposed to browser            |
| `VIOLET_USERNAME`             | Same as root                                                         |
| `VIOLET_PASSWORD`             | Same as root                                                         |
| `VIOLET_API_BASE`             | Same as root                                                         |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key — safe for client, exposed via `VITE_` prefix |
| `SUPABASE_URL`                | Local: `http://localhost:54321`                                      |
| `SUPABASE_ANON_KEY`           | Anon key from `supabase start` output                                |

### `supabase/.env.example`

Used by Supabase Edge Functions (Deno runtime).

| Variable             | Description                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `VIOLET_APP_ID`      | Same as root                                                                                                     |
| `VIOLET_APP_SECRET`  | Same as root                                                                                                     |
| `VIOLET_USERNAME`    | Same as root                                                                                                     |
| `VIOLET_PASSWORD`    | Same as root                                                                                                     |
| `VIOLET_API_BASE`    | Same as root                                                                                                     |
| `OPENAI_API_KEY`     | Used by `generate-embeddings` and `search-products` Edge Functions                                               |
| `RESEND_API_KEY`     | Resend email API key — used by `send-notification` and `send-support-email` Edge Functions. Get it at resend.com |
| `EMAIL_FROM_ADDRESS` | Sender address for outgoing emails (e.g. `noreply@yourdomain.com`)                                               |
| `APP_URL`            | App base URL used in email links (e.g. `http://localhost:3000`)                                                  |
| `SUPPORT_EMAIL`      | Destination address for support inquiries                                                                        |

---

## Available Commands

All commands run from the monorepo root unless noted.

### Development

```bash
bun run dev              # Start web app (TanStack Start on port 3000)
bun run dev:mobile       # Start Expo mobile app (port 8081)
bun run build            # Production build of the web app
```

### Quality Checks

```bash
bun run fix-all          # Prettier write + ESLint fix + TypeScript check — run before committing
bun run lint             # ESLint only, --max-warnings 0 (fails on any warning)
bun run lint:fix         # ESLint with auto-fix
bun run format           # Prettier check (read-only)
bun run format:fix       # Prettier write
bun run typecheck        # TypeScript check across web + mobile
```

### Tests

```bash
bun run test                          # Run all test suites (web + shared)
bun --cwd=apps/web run test           # Web tests only (Vitest 3)
bun --cwd=packages/shared run test    # Shared package tests (Vitest 4)
```

### Database and Backend

```bash
supabase start                        # Start all local Supabase services
supabase start -x storage,realtime,imgproxy  # Start with reduced services (RAM-constrained)
supabase stop                         # Stop services, preserve data
supabase stop --no-backup             # Stop services, wipe all local data
supabase status                       # Check service health and print URLs/keys
supabase db reset                     # Drop data, re-apply migrations, apply seed.sql
supabase migration new <name>         # Create a timestamped migration file
supabase functions serve              # Serve Edge Functions locally
```

### Utilities

```bash
bun run generate:sitemap              # Generate sitemap.xml from route definitions
```

---

## Testing Conventions

### Framework

- **Web** (`apps/web`): Vitest 3, jsdom environment
- **Shared** (`packages/shared`): Vitest 4

### File Location

Tests live in `__tests__/` subfolders alongside the source they cover:

```
apps/web/src/__tests__/
packages/shared/src/__tests__/   # (when tests are added)
```

### Rendering Pattern

The project does **not** use `@testing-library/react` for rendering. Instead, tests use React DOM directly to avoid the Bun workspace CJS dual-instance issue (where `@testing-library/react` loads `react-dom` via Node's native require, creating a separate React module instance from Vite's):

```ts
import React, { act } from "react";
import { createRoot } from "react-dom/client";

function renderHook<T>(hookFn: () => T) {
  let _current: T;
  const container = document.createElement("div");
  document.body.appendChild(container);

  function TestComponent() {
    _current = hookFn();
    return null;
  }

  act(() => {
    createRoot(container).render(React.createElement(TestComponent));
  });

  return {
    result: {
      get current() {
        return _current;
      },
    },
  };
}
```

### Mock Factory Pattern

Mocks use a `createMockXxx(overrides?)` factory pattern for clarity and reusability:

```ts
function createMockSupabaseClient(overrides?: Partial<...>) {
  return {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    ...overrides,
  };
}
```

### Pre-commit Requirement

Always run `bun run fix-all` before committing. The CI pipeline runs `lint` and `typecheck` on every push and PR and will fail if they are not clean.

---

## Code Style

| Concern              | Rule                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| **Formatter**        | Prettier — double quotes, semicolons, trailing commas, 100 char line width |
| **Linter**           | ESLint flat config (`eslint.config.js`), `typescript-eslint` recommended   |
| **Console**          | `no-console: warn` — remove logs before merging                            |
| **Debugger**         | `no-debugger: error` — never commit                                        |
| **Unused vars**      | Prefix with `_` to suppress warnings (applies to both args and vars)       |
| **CSS**              | Vanilla CSS + BEM — no Tailwind, no CSS-in-JS                              |
| **Naming**           | Descriptive English names for variables and functions                      |
| **Mobile exception** | `@typescript-eslint/no-require-imports` is disabled in `apps/mobile/`      |

### CSS Architecture

Styles live in `apps/web/src/styles/` and must be imported in order:

```
tokens.css       → base.css → utilities.css → components/*.css → pages/*.css
```

BEM naming convention: `.block__element--modifier`
Example: `.site-header__nav`, `.hero__title--accent`

---

## Git Conventions

### Commit Format

Conventional commits are required:

```
feat: add wishlist persistence to Supabase
fix: correct cart quantity update on variant change
refactor: extract violet auth token refresh logic
docs: add Edge Functions deployment section
test: add coverage for mapAuthError edge cases
chore: bump Vitest to 3.0.5
```

### Co-author Trailer

All commits made with Claude assistance must include:

```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### Pre-commit Checklist

1. `bun run fix-all` — format, lint, and typecheck pass with zero warnings/errors
2. Tests pass: `bun run test`
3. Commit message follows conventional format

---

## CI/CD Pipelines

Four GitHub Actions workflows run on push to `main` and on pull requests targeting `main`.

### `web-deploy.yml` — Web App

1. Install dependencies (`bun install --frozen-lockfile`)
2. `bun run lint`
3. `bun run typecheck`
4. `bun run build`
5. Deploy to Cloudflare Workers (placeholder — requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets)

### `edge-functions-deploy.yml` — Supabase Edge Functions

Two jobs:

- **quality**: install and lint/typecheck
- **deploy** (main branch only, requires secrets): install Supabase CLI 2.76.8, run `supabase functions deploy --project-ref`

Required GitHub secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`

### `mobile-build.yml` — Expo Mobile

1. Install dependencies (Node.js 22 + Bun 1.2.4)
2. `bun run lint`
3. `bun run typecheck`
4. On push to main (if `EXPO_TOKEN` secret is set): trigger EAS build for all platforms via `eas build --platform all --non-interactive --no-wait`

Required GitHub secret: `EXPO_TOKEN`

### `semgrep.yml` — SAST Security Scan

Runs on push to `main`, on PRs, and on a weekly schedule (Mondays at 06:00 UTC). Uses the `semgrep/semgrep:latest` Docker image with `--config=auto` rules. Results are uploaded as SARIF to the GitHub Security tab. Failures are non-blocking during initial rollout (`continue-on-error: true`).

Optional secret: `SEMGREP_APP_TOKEN` (enables Semgrep Cloud Platform integration)

---

## Project Structure Overview

```
e-commerce/
├── apps/
│   ├── web/          # TanStack Start v1 SSR web app (port 3000)
│   └── mobile/       # Expo SDK 55 React Native app
├── packages/
│   ├── shared/       # @ecommerce/shared — business logic, types, API clients
│   ├── ui/           # @ecommerce/ui — design tokens, cross-platform components
│   └── config/       # @ecommerce/config — shared configuration
├── supabase/
│   ├── functions/    # Deno Edge Functions
│   ├── migrations/   # Timestamped SQL migrations
│   └── seed.sql      # Development seed data
├── docs/             # Project documentation
├── scripts/          # Utility scripts (sitemap generation, etc.)
└── _bmad-output/     # Project management artifacts (PRD, stories, sprint status)
```

See `docs/source-tree-analysis.md` for the fully annotated directory tree.

---

## Supabase Local Development

The full setup guide is at `docs/supabase-local-setup.md`. Key points:

**Service URLs after `supabase start`:**

| Service          | URL                                                       |
| ---------------- | --------------------------------------------------------- |
| API Gateway      | `http://localhost:54321`                                  |
| PostgreSQL       | `postgresql://postgres:postgres@localhost:54322/postgres` |
| Studio Dashboard | `http://localhost:54323`                                  |
| Edge Functions   | `http://localhost:54321/functions/v1/{function-name}`     |

**Common operations:**

```bash
# Reset the database (drops all data, re-runs migrations, applies seed.sql)
supabase db reset

# Create a new migration
supabase migration new add_product_tags

# Serve Edge Functions locally with hot reload
supabase functions serve

# Tail Edge Function logs (functions run in Docker)
docker logs -f supabase_functions_$(basename $PWD)

# Connect to PostgreSQL directly
psql 'postgresql://postgres:postgres@localhost:54322/postgres'
```

**Note on Edge Functions:** When an Edge Function connects to the local PostgreSQL database, use `host.docker.internal` instead of `localhost` — functions run inside Docker containers and cannot reach `localhost:54322` directly.

**Low-RAM option:** If Docker is memory-constrained, exclude heavy services:

```bash
supabase start -x storage,realtime,imgproxy
```

This keeps PostgreSQL, Auth, and Edge Functions running while staying under 7 GB.
