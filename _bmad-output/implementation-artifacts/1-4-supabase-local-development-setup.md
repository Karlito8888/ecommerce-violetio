# Story 1.4: Supabase Local Development Setup

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want Supabase configured for local development with the initial project structure,
So that I can develop auth, database, and Edge Functions locally before deploying.

## Acceptance Criteria

1. **AC1 - config.toml initialized:** `supabase/config.toml` is created and configured for local development via `supabase init` command
2. **AC2 - local Supabase services start:** `supabase start` launches all services (PostgreSQL, Auth, Storage, Realtime, Edge Functions) successfully with health checks passing (requires 7GB RAM minimum)
3. **AC3 - migrations directory created:** `supabase/migrations/` directory exists and is ready for SQL migration files
4. **AC4 - Edge Functions directory created:** `supabase/functions/` directory exists with the correct structure for TypeScript Edge Functions
5. **AC5 - seed.sql created:** `supabase/seed.sql` file exists in the root of `supabase/` directory, initially empty, ready for dev data seeding
6. **AC6 - Supabase client configured:** `packages/shared/src/clients/supabase.ts` exports a configured `SupabaseClient` that resolves URL and key based on environment (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
7. **AC7 - environment variables documented:** `.env.local.example` file at project root documents all required Supabase environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY with local defaults)
8. **AC8 - cross-platform connectivity:** Both `apps/web` and `apps/mobile` can successfully import and initialize the Supabase client without connection errors (test with `bun run typecheck`)
9. **AC9 - .gitignore updated:** `.gitignore` includes `supabase/` volume directories (`.supabase/db`, `.supabase/storage`, `.supabase/realtime`), and `.env.local` is already ignored
10. **AC10 - documentation created:** `docs/supabase-local-setup.md` documents: how to start/stop services, connection URLs for each service, accessing Studio dashboard locally, debugging Edge Functions, seed data workflow

## Tasks / Subtasks

- [x] Task 1: Initialize Supabase CLI configuration (AC: 1, 3, 4, 5)
  - [x] Run `supabase init --with-sample-data` in project root (flag unavailable in CLI v2.76.8; ran `supabase init` instead)
  - [x] Verify `supabase/config.toml` is created with local defaults
  - [x] Verify `supabase/migrations/` directory exists
  - [x] Verify `supabase/functions/` directory exists with sample functions (remove samples if created)
  - [x] Create `supabase/seed.sql` as empty file with comment: `-- Seed data for local development (optional)`
  - [x] Review and customize `supabase/config.toml` for RAM/disk settings if needed

- [x] Task 2: Configure Supabase client in shared package (AC: 6, 8)
  - [x] Create `packages/shared/src/clients/` directory if not exists
  - [x] Create `packages/shared/src/clients/supabase.ts` with:
    - [x] Import `createClient` from `@supabase/supabase-js`
    - [x] Export function `createSupabaseClient()` that:
      - [x] Detects environment: `process.env.NODE_ENV` or `Platform.OS` (mobile)
      - [x] For local dev: uses `http://localhost:54321` (local API Gateway)
      - [x] For production: uses `process.env.SUPABASE_URL` from environment
      - [x] Resolves anon key from `process.env.SUPABASE_ANON_KEY`
      - [x] Returns typed `SupabaseClient` instance
    - [x] Export helper `getServiceRoleClient()` for server-side operations (uses SERVICE_ROLE_KEY)
    - [x] Add TypeScript strict mode: no implicit any

- [x] Task 3: Set up environment variables and documentation (AC: 7, 10)
  - [x] Create `.env.local.example` at project root with:
    ```
    # Supabase Local Development
    SUPABASE_URL=http://localhost:54321
    SUPABASE_ANON_KEY=sb_publishable_...
    SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

    # (Keys above are from `supabase start` output)
    ```
  - [x] Create `docs/supabase-local-setup.md` with sections:
    - [x] Prerequisites (Docker, Supabase CLI, 7GB RAM)
    - [x] Setup steps: `supabase init`, `supabase start`
    - [x] Service URLs and connection details:
      - [x] API Gateway: `http://localhost:54321`
      - [x] PostgreSQL: `postgresql://postgres:postgres@localhost:54322/postgres`
      - [x] Studio Dashboard: `http://localhost:54323`
      - [x] Note about Edge Functions: use `host.docker.internal` for database access from functions
    - [x] Studio authentication: default password must be changed before starting
    - [x] Starting/stopping services: `supabase start` / `supabase stop` / `supabase status`
    - [x] Accessing logs: `docker logs supabase_db_*`, `docker logs supabase_auth_*`, etc.
    - [x] Health check: verify `supabase status` shows all services green
    - [x] Seed data workflow: populate `supabase/seed.sql`, then `supabase db reset` to apply

- [x] Task 4: Update .gitignore and verify connectivity (AC: 9, 8)
  - [x] Append to `.gitignore`:
    ```
    # Supabase local development
    supabase/.supabase/db
    supabase/.supabase/storage
    supabase/.supabase/realtime
    ```
    Note: `.env.local` was already in `.gitignore` from Story 1.1
  - [x] Verify both apps can import Supabase client:
    - [x] Add temporary import to `apps/web/src/routes/__root.tsx`: `import { createSupabaseClient } from "@ecommerce/shared";`
    - [x] Add temporary import to `apps/mobile/src/app/index.tsx`: `import { createSupabaseClient } from "@ecommerce/shared";`
    - [x] Run `bun run typecheck` — import resolves (TS6133 unused-import warning confirms resolution works)
    - [x] Remove temporary imports
  - [x] Run `supabase start` and verify services are healthy:
    - [x] `supabase status` shows all core services running (imgProxy and pooler are optional/stopped by default)
    - [x] psql available (`/usr/bin/psql`) — Postgres accessible on port 54322

- [x] Task 5: Quality verification (AC: all)
  - [x] Run `bun run typecheck` — zero errors across web + mobile + shared
  - [x] Run `bun run lint` — zero warnings/errors
  - [x] Run `supabase start` and verify no health check failures
  - [x] Document any local setup issues in README.md (documented in Dev Agent Record below)

## Dev Notes

### Official Supabase Documentation Integration

This story is based on the official Supabase CLI and local development documentation (retrieved via Archon MCP on 2026-03-06):

**Key References:**
- **CLI Start Command:** `supabase start` launches local development stack via Docker. Requires `supabase/config.toml` to exist (created via `supabase init`). All services start by default; use `-x` flag to exclude services (e.g., `-x gotrue` to exclude Auth). Health checks verify all containers are running.

- **Local Service URLs (defaults):**
  - PostgreSQL: `postgresql://postgres:postgres@localhost:54322/postgres`
  - API Gateway (Kong): `http://localhost:54321`
  - Studio Dashboard: `http://localhost:54323` (requires DASHBOARD_PASSWORD authentication)
  - Edge Functions: accessible via API Gateway at `/functions/v1/{function-name}`

- **Critical for Edge Functions:** When an Edge Function needs to access the local PostgreSQL database, use `host.docker.internal` instead of `localhost` because functions run in Docker containers.

- **Studio Authentication:** Default username/password must be changed in `.env` file before starting Supabase:
  - `DASHBOARD_PASSWORD`: Change from default (must include at least one letter, no numbers-only, no special characters)
  - `DASHBOARD_USERNAME`: Optional change from default

- **Health Checks:** `supabase start` automatically adds health checks to verify containers. Use `--ignore-health-check` flag to bypass (not recommended for development).

[Source: Supabase CLI Reference — start command](https://supabase.com/llms/cli.txt)
[Source: Supabase Guides — Local Development, Service URLs](https://supabase.com/llms/guides.txt)

### Environment-Based Client Resolution

The Supabase client in `packages/shared/src/clients/supabase.ts` must detect the environment and resolve the correct URL:

**Local Development (web):**
- `process.env.NODE_ENV === "development"` → use `http://localhost:54321`
- `.env.local` provides `SUPABASE_ANON_KEY` (from `supabase start` output)

**Local Development (mobile):**
- Expo CLI is running → use `http://localhost:54321`
- `SUPABASE_ANON_KEY` from `.env.local` copied to mobile's env config

**Production:**
- `SUPABASE_URL` from environment (e.g., GitHub Secrets, Vercel/EAS env)
- `SUPABASE_ANON_KEY` from environment

Pattern from Story 1.2 (shared packages):
```typescript
// packages/shared/src/clients/supabase.ts
import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key = process.env.SUPABASE_ANON_KEY || "";

  return createClient(url, key);
}

export function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || "http://localhost:54321";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  return createClient(url, key);
}
```

[Source: Story 1.2 — Supabase client pattern]
[Source: architecture.md#Server-side code split: Server Functions vs Edge Functions]

### Docker & RAM Requirements

- **Minimum RAM:** 7GB for all services (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- If less than 7GB available, exclude services with `-x` flag: `supabase start -x storage,realtime` (keeps DB + Auth + Edge Functions)
- **Docker Desktop settings:** Ensure Docker is allocated sufficient memory (Settings → Resources → Memory slider)
- **Disk space:** Plan for ~2GB for local database and function artifacts

[Source: Supabase CLI Reference — start command]

### Migration & Seed Workflow

**Migrations directory:** `supabase/migrations/` is where all SQL schema changes live. Each file is a migration:
- Naming convention: `00001_initial_schema.sql`, `00002_add_users_table.sql`, etc.
- Auto-applied on `supabase start` (migrations already applied are skipped)
- Reversible: migration down is handled by Supabase (track via internal table)

**Seed data:** `supabase/seed.sql` is applied after migrations when resetting:
- `supabase db reset` — drop all data, re-run migrations, then seed.sql
- Useful for development: populate test users, test products, test orders
- Empty by default — populate as features are built

[Source: Story 1.5 (CI/CD) will add `supabase functions deploy` to workflows]
[Source: Story 2.1 will create first migration: `user_profiles` table]

### Project Structure After Story 1.4

```
E-commerce/
├── supabase/
│   ├── config.toml          ← local Supabase config
│   ├── migrations/          ← SQL migration files (created by story, empty)
│   ├── functions/           ← Edge Functions (created by story, empty)
│   └── seed.sql             ← seed data (empty initially)
├── packages/shared/
│   └── src/clients/
│       └── supabase.ts      ← Supabase client configuration
├── .env.local               ← developer's local env (Git-ignored)
├── .env.local.example       ← committed example with local defaults
├── docs/
│   └── supabase-local-setup.md  ← local dev setup guide
└── .gitignore               ← updated to exclude local supabase volumes
```

[Source: architecture.md#Monorepo structure]
[Source: Story 1.1 — base monorepo layout]

### Previous Story Intelligence (Story 1.3)

**Learning from design token story:**
- Shared package pattern is solid: direct TypeScript imports, no build step
- `packages/shared/src/clients/` follows the same pattern as `packages/shared/src/tokens/`
- Both `apps/web` and `apps/mobile` can import from `@ecommerce/shared` without issues
- Use direct imports like `import { createSupabaseClient } from "@ecommerce/shared"` (barrel exports from `packages/shared/src/index.ts`)

**Pattern to replicate:**
- Create `packages/shared/src/clients/index.ts` that re-exports `createSupabaseClient` and `getServiceRoleClient`
- Update `packages/shared/src/index.ts` to export from `./clients`
- Mobile can safely import client creation function (type-safe, no runtime errors)

[Source: Story 1.3 — token sharing pattern]
[Source: Story 1.2 — shared package setup]

### Git Context

Recent commits:
1. `fix: add composite surface tokens for dark theme support` (2026-03-06)
2. `feat: add design token system and migrate CSS to Warm Neutral palette` (Story 1.3)
3. `feat: add shared packages with types, utils, and adapter interface` (Story 1.2)
4. `docs: add CLAUDE.md with project conventions and architecture`
5. `chore: update dependencies to latest safe versions`

Commit convention: conventional commits + `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

**Next story (1.5):** CI/CD pipeline will add `supabase functions deploy` to workflows, so this story prepares the local structure.

[Source: sprint-status.yaml]

### Architectural Constraints to Remember

**Dual Authentication Layer:**
- Supabase Auth manages user sessions and RLS policies
- Violet JWT tokens are separate and require 24h refresh
- This story focuses on Supabase Auth infrastructure only (Violet integration is Story 2.3)

**Edge Function Limits:**
- 2s CPU timeout, 10MB bundle size per function
- Functions can be written in TypeScript, deployed via CLI
- Local debugging uses Docker logs

**Row-Level Security (RLS):**
- All tables created in future stories must have RLS policies
- `packages/shared/src/clients/supabase.ts` will be used by both authenticated and anonymous users
- getServiceRoleClient() is for server-side operations that bypass RLS (use cautiously)

[Source: architecture.md#Technical Constraints]

### Testing / Verification

No unit tests required. Verification:

1. `supabase status` — all services show "ready" status (no errors, no timeouts)
2. PostgreSQL connection: `psql 'postgresql://postgres:postgres@localhost:54322/postgres'` → `postgres=#` prompt (if psql installed)
3. Studio access: `http://localhost:54323` → login with DASHBOARD_PASSWORD → see empty database schema
4. TypeScript import: `import { createSupabaseClient } from "@ecommerce/shared"` in either app, `bun run typecheck` → zero errors
5. Visual verification: run `bun run dev` (web), open DevTools Network tab, confirm no 404 errors for Supabase API calls

### Key Gotchas & Notes

**Gotcha 1: `.env.local` must be created manually**
- `supabase init` does NOT create `.env.local`
- Developer must copy `.env.local.example` to `.env.local` and populate with keys from `supabase start` output
- Keys are printed to stdout when services start

**Gotcha 2: DASHBOARD_PASSWORD character requirements**
- Must include at least one letter (no numbers-only passwords)
- Cannot include special characters
- Default can be found in `supabase/config.toml` under `[auth]` section

**Gotcha 3: Docker resource exhaustion**
- If `supabase start` hangs or times out, check: Docker Desktop memory allocation, disk space, existing containers (`docker ps`)
- Solution: `docker system prune -a` to clean unused images (destructive — clears local supabase volumes)

**Gotcha 4: Edge Function debugging is via Docker logs**
- Function stdout doesn't appear in browser console
- Inspect with: `docker logs -f supabase_functions_*` in another terminal
- No interactive debugger; use `console.log` → check Docker logs

### References

- [Source: Supabase CLI Reference](https://supabase.com/llms/cli.txt)
- [Source: Supabase Local Development Guide](https://supabase.com/llms/guides.txt)
- [Source: architecture.md#Server-side code split: Server Functions vs Edge Functions]
- [Source: architecture.md#Technical Constraints — Edge Function limits]
- [Source: CLAUDE.md#Architecture — Supabase + Violet dual auth]
- [Source: epics.md#Story 1.4: Supabase Local Development Setup]
- [Source: implementation-artifacts/1-1-monorepo-initialization-workspace-configuration.md]
- [Source: implementation-artifacts/1-2-shared-packages-setup-types-utils-config.md]
- [Source: implementation-artifacts/1-3-design-token-system-cross-platform-styling-foundation.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Supabase CLI v2.76.8: `--with-sample-data` flag does not exist; ran `supabase init` directly
- First `supabase start` attempt failed: port 54322 occupied by another Supabase project (Archon). Resolved by stopping Archon temporarily, verifying E-commerce services, then restarting Archon
- Supabase CLI v2.76.8 uses new key format: "Publishable" (was "anon key") and "Secret" (was "service_role key"). Updated `.env.local.example` accordingly
- `supabase/migrations/.gitkeep` causes "Skipping migration .gitkeep" warning on start (non-blocking — Supabase only processes `<timestamp>_name.sql` files)

### Completion Notes List

- Initialized Supabase local stack with `supabase init` — created `supabase/config.toml` with project_id="E-commerce", API on 54321, DB on 54322, Studio on 54323
- Created `supabase/migrations/` and `supabase/functions/` directories (not created by `supabase init` in CLI v2.76.8)
- Created `supabase/seed.sql` with initial comment
- Installed `@supabase/supabase-js@2.98.0` in `packages/shared`
- Created `packages/shared/src/clients/supabase.ts` with `createSupabaseClient()` and `getServiceRoleClient()` — both return typed `SupabaseClient`, use env vars with localhost fallback
- Created `packages/shared/src/clients/index.ts` barrel export
- Updated `packages/shared/src/index.ts` to export from `./clients/index.js`
- Created `.env.local.example` reflecting CLI v2.76.8 key format (sb_publishable_* / sb_secret_*)
- Created `docs/supabase-local-setup.md` with all required sections (prerequisites, URLs, auth, seed workflow, migrations, Edge Function debugging, troubleshooting)
- Updated root `.gitignore` with Supabase volume directories
- Verified `bun run typecheck`: zero errors | `bun run lint`: zero warnings
- Verified `supabase start`: all core services started successfully (Studio 54323, API 54321, DB 54322, Edge Functions)

### File List

- `supabase/config.toml` (created by `supabase init`)
- `supabase/.gitignore` (created by `supabase init` — ignores `.branches`, `.temp`, `.env.local`)
- `supabase/migrations/.gitkeep` (created)
- `supabase/functions/.gitkeep` (created)
- `supabase/seed.sql` (created)
- `packages/shared/src/clients/supabase.ts` (created)
- `packages/shared/src/clients/index.ts` (created)
- `packages/shared/src/index.ts` (modified — added clients export)
- `packages/shared/package.json` (modified — added @supabase/supabase-js@2.98.0)
- `bun.lock` (modified — lockfile updated)
- `.env.local.example` (created)
- `.gitignore` (modified — added Supabase volume dirs)
- `docs/supabase-local-setup.md` (created)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status updated)

### Change Log

- 2026-03-06: Story 1.4 implemented — Supabase local development setup complete. Initialized Supabase CLI config, configured shared Supabase client, documented local dev workflow, verified cross-platform TypeScript imports and service health.
- 2026-03-06: Code review (claude-opus-4-6) — Fixed 7 issues (3 HIGH, 4 MEDIUM). Rewrote supabase.ts with singleton pattern, server-only guard on getServiceRoleClient(), env var validation with clear errors, and cross-platform getEnvVar helper. Simplified .gitignore to glob pattern. Updated .env.local.example with explicit placeholders. Fixed bun.lock filename in File List. Aligned doc terminology to CLI v2.76.8 key format.
