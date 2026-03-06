# Supabase Local Development Setup

This guide explains how to set up and use Supabase for local development on the E-commerce project.

## Prerequisites

- **Docker Desktop** (or Docker Engine + Docker Compose) — must be running before starting Supabase
- **Supabase CLI** (`brew install supabase/tap/supabase` or see [official install guide](https://supabase.com/docs/guides/cli/getting-started))
- **Minimum 7GB RAM** allocated to Docker (Docker Desktop → Settings → Resources → Memory)
- **~2GB free disk space** for local database and function artifacts

## Setup Steps

### 1. Initialize (already done for this project)

```bash
supabase init
```

This creates `supabase/config.toml`. Already committed to the repo — no need to re-run.

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Then start Supabase to get your actual keys:

```bash
supabase start
```

Copy the `Publishable` key (= anon key) and `Secret` key (= service role key) from the output into `.env.local`.

### 3. Start local services

```bash
supabase start
```

First run downloads Docker images (~few minutes). Subsequent starts are faster.

To exclude services when RAM is limited (keeps DB + Auth + Edge Functions):

```bash
supabase start -x storage,realtime,imgproxy
```

## Service URLs

| Service              | URL                                                       | Notes                                      |
| -------------------- | --------------------------------------------------------- | ------------------------------------------ |
| **API Gateway**      | `http://localhost:54321`                                  | Main entry point for all Supabase services |
| **PostgreSQL**       | `postgresql://postgres:postgres@localhost:54322/postgres` | Direct DB connection                       |
| **Studio Dashboard** | `http://localhost:54323`                                  | Web UI for database management             |
| **Edge Functions**   | `http://localhost:54321/functions/v1/{function-name}`     | Via API Gateway                            |

> **Edge Functions Note:** When an Edge Function needs to connect to the local PostgreSQL database, use `host.docker.internal` instead of `localhost` (functions run in Docker containers).

## Studio Dashboard Authentication

The Studio dashboard requires a password. Check `supabase/config.toml` under the `[studio]` section for `DASHBOARD_PASSWORD`. The default password requirements:

- Must include at least one letter (no numbers-only passwords)
- No special characters

Change these in `supabase/config.toml` before first run if needed.

## Managing Services

```bash
# Check status of all services
supabase status

# Stop all services (preserves data)
supabase stop

# Stop and reset all data (destructive)
supabase stop --no-backup

# View service logs
docker logs -f supabase_db_$(basename $PWD)
docker logs -f supabase_auth_$(basename $PWD)
docker logs -f supabase_functions_$(basename $PWD)
```

## Health Check

After `supabase start`, verify all services are green:

```bash
supabase status
```

Expected output shows all services as `RUNNING`. If any service fails:

1. Check Docker Desktop has enough memory allocated (≥ 7GB)
2. Check available disk space (`df -h`)
3. Check for port conflicts on 54321-54329

## Seed Data Workflow

`supabase/seed.sql` is applied after migrations when resetting the database:

```bash
# Reset DB: drops all data, re-runs migrations, applies seed.sql
supabase db reset
```

To add development seed data:

1. Edit `supabase/seed.sql` with `INSERT` statements
2. Run `supabase db reset` to apply

## Migrations

SQL migrations live in `supabase/migrations/`. Naming convention:

```
00001_initial_schema.sql
00002_add_users_table.sql
```

Migrations are auto-applied on `supabase start` (already-applied migrations are skipped).

## Debugging Edge Functions

Edge Function logs are only visible via Docker (not in browser console):

```bash
docker logs -f supabase_functions_$(basename $PWD)
```

Use `console.log()` in your functions — output appears in the Docker logs above.

## Connecting to PostgreSQL Directly

If `psql` is installed:

```bash
psql 'postgresql://postgres:postgres@localhost:54322/postgres'
```

You should see the `postgres=#` prompt.

## Environment Variables in Mobile (Expo/EAS)

The mobile app uses Expo's dynamic config (`app.config.ts`) to inject env vars at build time via `extra`:

```ts
// app.config.ts → extra
extra: {
  supabaseUrl: process.env.SUPABASE_URL ?? "http://localhost:54321",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
}
```

At runtime, the root layout calls `configureEnv()` from `@ecommerce/shared` with values from `Constants.expoConfig.extra`. This bridges the gap since `process.env` is unavailable in React Native.

**Local development:** Env vars are read from your shell environment when running `expo start`.

**EAS Build:** Env vars are configured per profile in `apps/mobile/eas.json`. For production, use [EAS Secrets](https://docs.expo.dev/build-reference/variables/) instead of hardcoding values.

## Troubleshooting

| Problem                  | Solution                                                               |
| ------------------------ | ---------------------------------------------------------------------- |
| `supabase start` hangs   | Increase Docker memory, check `docker ps` for stale containers         |
| Port already in use      | `supabase stop`, then `docker ps` to find conflicting containers       |
| Docker images won't pull | Check internet connection, retry `supabase start`                      |
| Out of disk space        | `docker system prune -a` (**destructive** — removes all unused images) |
