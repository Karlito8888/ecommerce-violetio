# Maison Emile — Project Documentation Index

> Multi-merchant e-commerce platform powered by Violet.io. Dual-platform: Web (TanStack Start) + Mobile (Expo). Supabase backend with AI-powered search.

---

## Project Overview

- **Type:** Monorepo (Bun 1.2.4 workspaces) with 6 parts
- **Primary Language:** TypeScript 5.9.3 (strict mode)
- **Architecture:** SSR web + native mobile + serverless backend + external commerce API

### Parts

| Part           | Type    | Path               | Tech                                           |
| -------------- | ------- | ------------------ | ---------------------------------------------- |
| Web App        | web     | `apps/web/`        | TanStack Start v1.166+, React 19.2.4, Vite 7.3 |
| Mobile App     | mobile  | `apps/mobile/`     | Expo SDK 55, React Native 0.83.2               |
| Shared Package | library | `packages/shared/` | TanStack Query v5, Zod 4.3                     |
| UI Package     | library | `packages/ui/`     | Design tokens (colors, typography, spacing)    |
| Config Package | library | `packages/config/` | Shared tsconfig + eslint                       |
| Supabase       | backend | `supabase/`        | PostgreSQL 17, 12 Edge Functions (Deno)        |

---

## Generated Documentation

### Architecture

- [Project Overview](./project-overview.md) — Executive summary, tech stack, key decisions
- [Architecture — Web](./architecture-web.md) — TanStack Start SSR, routing, components, CSS
- [Architecture — Mobile](./architecture-mobile.md) — Expo, navigation, biometric auth, push
- [Architecture — Shared Package](./architecture-shared.md) — 5-layer business logic, adapter pattern
- [Architecture — Supabase](./architecture-supabase.md) — Database, Edge Functions, webhooks, auth

### Data & APIs

- [Data Models](./data-models-supabase.md) — Full PostgreSQL schema (15+ tables, RLS, triggers, RPCs)
- [API Contracts — Edge Functions](./api-contracts-supabase.md) — 12 Edge Functions with request/response specs
- [Integration Architecture](./integration-architecture.md) — Cross-part communication, data flows, dual-copy sync

### Components

- [Component Inventory — Web](./component-inventory-web.md) — 50+ React components by domain
- [Component Inventory — Mobile](./component-inventory-mobile.md) — 17+ React Native components

### Development

- [Source Tree Analysis](./source-tree-analysis.md) — Full annotated directory tree
- [Development Guide](./development-guide.md) — Setup, commands, testing, CI/CD, conventions

---

## Existing Documentation

### Violet.io (Commerce API)

- [Violet.io Integration Guide](./violet-io-integration-guide.md) — How the platform integrates with Violet
- [Violet.io Action Plan](./violet-io-action-plan.md) — Implementation roadmap for Violet features
- [Violet Quick Reference](./VIOLET_QUICK_REFERENCE.md) — Cheat sheet for Violet API endpoints

### Strategy & Planning

- [Implementation Roadmap 2026](./IMPLEMENTATION-ROADMAP-2026.md) — Full project roadmap
- [Supplier Comparison Strategy](./supplier-comparison-strategy.md) — Violet vs alternatives
- [Google UCP Strategy 2026](./google-ucp-strategy-2026.md) — Google Universal Commerce Platform plans
- [Firmly.ai Exploration Guide](./firmly-ai-exploration-guide.md) — Alternative supplier evaluation

### Operations

- [Supabase Local Setup](./supabase-local-setup.md) — Local development environment setup
- [Content Administration Guide](./content-administration-guide.md) — CMS and content management

---

## Getting Started

```bash
# 1. Install dependencies
bun install

# 2. Setup environment
cp .env.example .env.local
# Edit .env.local with your API keys (see Development Guide)

# 3. Start Supabase locally
supabase start && supabase db reset

# 4. Start development
bun run dev          # Web → http://localhost:3000
bun run dev:mobile   # Mobile → Expo on port 8081

# 5. Quality checks (before committing)
bun run fix-all      # Prettier + ESLint + TypeScript
```

---

_Generated on 2026-03-28 | Scan level: exhaustive | 12 documents generated_
