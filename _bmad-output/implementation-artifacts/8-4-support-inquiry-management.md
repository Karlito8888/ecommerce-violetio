# Story 8.4: Support Inquiry Management (Internal)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `supabase/migrations/20260403000000_admin_support_rls.sql` | Admin SELECT/UPDATE RLS policy on support_inquiries |
| CREATE | `packages/shared/src/types/admin-support.types.ts` | SupportInquiry, SupportInquiryFilters, SupportReplyInput types |
| UPDATE | `packages/shared/src/types/index.ts` | Export admin-support types |
| CREATE | `packages/shared/src/clients/admin-support.ts` | getSupportInquiries(), getSupportInquiry(), updateInquiryStatus(), addInternalNote() |
| UPDATE | `packages/shared/src/clients/index.ts` | Export admin-support client functions |
| CREATE | `apps/web/src/server/getAdminSupport.ts` | Server function: list inquiries with filters |
| CREATE | `apps/web/src/server/getAdminSupportHandler.ts` | Handler: admin auth + service role queries |
| CREATE | `apps/web/src/server/updateSupportInquiry.ts` | Server function: update status / add notes |
| CREATE | `apps/web/src/server/updateSupportInquiryHandler.ts` | Handler: admin auth + update logic |
| CREATE | `apps/web/src/server/replySupportInquiry.ts` | Server function: send reply email via Edge Function |
| CREATE | `apps/web/src/server/replySupportInquiryHandler.ts` | Handler: admin auth + invoke send-support-reply Edge Function |
| CREATE | `supabase/functions/send-support-reply/index.ts` | Edge Function: sends admin reply email to customer via Resend |
| CREATE | `apps/web/src/routes/admin/support/index.tsx` | Support inquiry list page with inline filters (protected, admin-only) |
| CREATE | `apps/web/src/routes/admin/support/$inquiryId.tsx` | Support inquiry detail page with status/notes/reply (protected, admin-only) |
| CREATE | `apps/web/src/components/admin/SupportStatusBadge.tsx` | Shared status badge component (new/in-progress/resolved) |
| UPDATE | `apps/web/src/styles/pages/admin.css` | Add BEM styles for `.admin-support` block |
| CREATE | `apps/web/src/__tests__/admin-support.test.ts` | Tests for support management logic |

---

## Story

As an **administrator**,
I want to view and manage customer support inquiries,
So that I can respond to customer issues efficiently.

## Acceptance Criteria

1. **Given** support inquiries exist in the `support_inquiries` table
   **When** an admin accesses the support management page
   **Then** inquiries are listed with: date, name, email, subject, status (new/in-progress/resolved), associated order ID

2. **Given** the inquiry list
   **When** admin interacts with filter controls
   **Then** filtering by status and subject type is available

3. **Given** an admin views the inquiry list
   **When** they click on an inquiry
   **Then** full details are shown with the customer's message and any linked order info

4. **Given** an admin views an inquiry
   **When** they update the status
   **Then** status workflow follows: new → in-progress → resolved

5. **Given** an admin views an inquiry
   **When** they add internal notes
   **Then** internal notes are saved to `internal_notes` column

6. **Given** an admin views an inquiry detail
   **When** they compose and send a reply
   **Then** an email is sent to the customer via an Edge Function (send-support-reply)

7. **Given** the admin support page
   **When** admin navigates to it
   **Then** web-only: admin support page at `apps/web/src/routes/admin/support/index.tsx`

## Tasks / Subtasks

- [x] **Task 1: Admin RLS policy for support_inquiries** (AC: #1)
  - [x] 1.1: Create `supabase/migrations/20260403000000_admin_support_rls.sql`:
    - Add RLS policy `admin_read_support` on `support_inquiries` for SELECT when `is_admin()` returns true
    - Add RLS policy `admin_update_support` on `support_inquiries` for UPDATE when `is_admin()` returns true
    - **IMPORTANT**: The `support_inquiries` table already has RLS enabled and policies `anon_insert_support` (for form submissions) and `service_role_all_support`. These new policies are **additive** — they allow admin users to read/update via session client, not just service role.
    - Reuses `is_admin()` function from migration `20260402000000_admin_roles.sql`
    ```sql
    -- Admin can read all support inquiries
    CREATE POLICY "admin_read_support" ON public.support_inquiries
      FOR SELECT TO authenticated
      USING (is_admin());

    -- Admin can update support inquiries (status, internal_notes)
    CREATE POLICY "admin_update_support" ON public.support_inquiries
      FOR UPDATE TO authenticated
      USING (is_admin())
      WITH CHECK (is_admin());
    ```

- [x] **Task 2: Shared types for admin support** (AC: #1, #2, #3, #4, #5)
  - [x] 2.1: Create `packages/shared/src/types/admin-support.types.ts`:
    ```typescript
    import type { SupportSubject } from "./support.types.js";

    /** A support inquiry row as returned from the database. */
    export interface SupportInquiry {
      id: string;
      name: string;
      email: string;
      subject: SupportSubject;
      message: string;
      orderId: string | null;
      status: SupportInquiryStatus;
      internalNotes: string | null;
      createdAt: string;   // ISO string
      updatedAt: string;   // ISO string
    }

    export type SupportInquiryStatus = "new" | "in-progress" | "resolved";

    export const SUPPORT_STATUSES: SupportInquiryStatus[] = ["new", "in-progress", "resolved"];

    /** Filter parameters for the inquiry list. */
    export interface SupportInquiryFilters {
      status?: SupportInquiryStatus;
      subject?: SupportSubject;
    }

    /** Input for admin reply email. */
    export interface SupportReplyInput {
      inquiryId: string;
      replyMessage: string;
    }

    /** Data returned for the support list page. */
    export interface AdminSupportListData {
      inquiries: SupportInquiry[];
    }

    /** Data returned for a single inquiry detail. */
    export interface AdminSupportDetailData {
      inquiry: SupportInquiry;
      linkedOrder: LinkedOrderInfo | null;
    }

    /** Linked order summary (from orders table via order_id). */
    export interface LinkedOrderInfo {
      id: string;
      violetOrderId: string;
      status: string;
      total: number;
      createdAt: string;
    }
    ```
  - [x] 2.2: Update `packages/shared/src/types/index.ts` — export all admin-support types

- [x] **Task 3: Shared client functions for admin support** (AC: #1, #2, #3, #4, #5)
  - [x] 3.1: Create `packages/shared/src/clients/admin-support.ts`:
    ```typescript
    import type { SupabaseClient } from "@supabase/supabase-js";
    import type {
      SupportInquiry,
      SupportInquiryFilters,
      SupportInquiryStatus,
      LinkedOrderInfo,
    } from "../types/admin-support.types.js";

    /** Map DB row (snake_case) to SupportInquiry (camelCase). */
    function mapRow(row: Record<string, unknown>): SupportInquiry {
      return {
        id: row.id as string,
        name: row.name as string,
        email: row.email as string,
        subject: row.subject as SupportInquiry["subject"],
        message: row.message as string,
        orderId: (row.order_id as string) ?? null,
        status: row.status as SupportInquiryStatus,
        internalNotes: (row.internal_notes as string) ?? null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      };
    }

    /** Fetch all support inquiries with optional filters, ordered newest first. */
    export async function getSupportInquiries(
      client: SupabaseClient,
      filters?: SupportInquiryFilters,
    ): Promise<SupportInquiry[]> {
      let query = client
        .from("support_inquiries")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.subject) {
        query = query.eq("subject", filters.subject);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapRow);
    }

    /** Fetch a single inquiry by ID. */
    export async function getSupportInquiry(
      client: SupabaseClient,
      inquiryId: string,
    ): Promise<SupportInquiry | null> {
      const { data, error } = await client
        .from("support_inquiries")
        .select("*")
        .eq("id", inquiryId)
        .single();

      if (error) return null;
      return mapRow(data);
    }

    /** Update inquiry status. */
    export async function updateInquiryStatus(
      client: SupabaseClient,
      inquiryId: string,
      status: SupportInquiryStatus,
    ): Promise<boolean> {
      const { error } = await client
        .from("support_inquiries")
        .update({ status })
        .eq("id", inquiryId);
      return !error;
    }

    /** Add/replace internal notes on an inquiry. */
    export async function updateInternalNotes(
      client: SupabaseClient,
      inquiryId: string,
      notes: string,
    ): Promise<boolean> {
      const { error } = await client
        .from("support_inquiries")
        .update({ internal_notes: notes })
        .eq("id", inquiryId);
      return !error;
    }

    /** Fetch linked order info by order_id (Violet order ID). */
    export async function getLinkedOrder(
      client: SupabaseClient,
      orderId: string,
    ): Promise<LinkedOrderInfo | null> {
      const { data, error } = await client
        .from("orders")
        .select("id, violet_order_id, status, total, created_at")
        .eq("violet_order_id", orderId)
        .single();

      if (error || !data) return null;
      return {
        id: data.id,
        violetOrderId: data.violet_order_id,
        status: data.status,
        total: data.total,
        createdAt: data.created_at,
      };
    }
    ```
  - [x] 3.2: Update `packages/shared/src/clients/index.ts` — export all admin-support functions

- [x] **Task 4: Web server functions** (AC: #1, #2, #3, #4, #5, #6)
  - [x] 4.1: Create `apps/web/src/server/getAdminSupport.ts`:
    ```typescript
    import { createServerFn } from "@tanstack/react-start";
    import type { SupportInquiryFilters, AdminSupportListData } from "@ecommerce/shared";

    export const getAdminSupportListFn = createServerFn({ method: "GET" })
      .inputValidator((data: { filters?: SupportInquiryFilters }) => data)
      .handler(async ({ data }): Promise<AdminSupportListData> => {
        const { getAdminSupportListHandler } = await import("./getAdminSupportHandler");
        return getAdminSupportListHandler(data.filters);
      });

    export const getAdminSupportDetailFn = createServerFn({ method: "GET" })
      .inputValidator((data: { inquiryId: string }) => data)
      .handler(async ({ data }) => {
        const { getAdminSupportDetailHandler } = await import("./getAdminSupportHandler");
        return getAdminSupportDetailHandler(data.inquiryId);
      });
    ```
  - [x] 4.2: Create `apps/web/src/server/getAdminSupportHandler.ts`:
    - Admin auth check: `getSupabaseSessionClient().auth.getUser()`, verify `user.app_metadata.user_role === 'admin'`
    - If not admin → throw `new Response("Forbidden", { status: 403 })`
    - List handler: `getSupabaseServer()` → `getSupportInquiries(serviceClient, filters)`
    - Detail handler: `getSupabaseServer()` → `getSupportInquiry(serviceClient, id)` + `getLinkedOrder(serviceClient, orderId)` if orderId exists
    - **Two clients**: session for auth, service role for data (same pattern as `getAdminDashboardHandler.ts`)
  - [x] 4.3: Create `apps/web/src/server/updateSupportInquiry.ts`:
    ```typescript
    import { createServerFn } from "@tanstack/react-start";
    import type { SupportInquiryStatus } from "@ecommerce/shared";

    export const updateSupportStatusFn = createServerFn({ method: "POST" })
      .inputValidator((data: { inquiryId: string; status: SupportInquiryStatus }) => data)
      .handler(async ({ data }) => {
        const { updateSupportStatusHandler } = await import("./updateSupportInquiryHandler");
        return updateSupportStatusHandler(data.inquiryId, data.status);
      });

    export const updateSupportNotesFn = createServerFn({ method: "POST" })
      .inputValidator((data: { inquiryId: string; notes: string }) => data)
      .handler(async ({ data }) => {
        const { updateSupportNotesHandler } = await import("./updateSupportInquiryHandler");
        return updateSupportNotesHandler(data.inquiryId, data.notes);
      });
    ```
  - [x] 4.4: Create `apps/web/src/server/updateSupportInquiryHandler.ts`:
    - Admin auth check (same pattern)
    - Status handler: `updateInquiryStatus(serviceClient, id, status)`
    - Notes handler: `updateInternalNotes(serviceClient, id, notes)`
    - Return `{ success: boolean; error?: string }`
  - [x] 4.5: Create `apps/web/src/server/replySupportInquiry.ts`:
    ```typescript
    import { createServerFn } from "@tanstack/react-start";
    import type { SupportReplyInput } from "@ecommerce/shared";

    export const replySupportFn = createServerFn({ method: "POST" })
      .inputValidator((data: SupportReplyInput) => data)
      .handler(async ({ data }) => {
        const { replySupportHandler } = await import("./replySupportInquiryHandler");
        return replySupportHandler(data);
      });
    ```
  - [x] 4.6: Create `apps/web/src/server/replySupportInquiryHandler.ts`:
    - Admin auth check (same pattern)
    - Fetch the inquiry via `getSupportInquiry(serviceClient, data.inquiryId)` to get customer email
    - Invoke `supabase.functions.invoke("send-support-reply", { body: { ... } })`
    - Auto-update inquiry status to `"in-progress"` if currently `"new"` (admin responding = now in progress)
    - Return `{ success: boolean; error?: string }`

- [x] **Task 5: Edge Function for admin reply email** (AC: #6)
  - [x] 5.1: Create `supabase/functions/send-support-reply/index.ts`:
    - Follows exact same pattern as `send-support-email/index.ts`
    - Payload: `{ inquiry_id, customer_email, customer_name, subject, reply_message, admin_email }`
    - Sends reply email to customer: "Reply from our support team"
    - Uses Resend API with raw fetch (same as existing Edge Functions)
    - Idempotency key: `support-reply-{inquiry_id}-{timestamp_hash}`
    - CORS headers from `../_shared/cors.ts`
    - HTML email template: simple, professional, includes original subject as reference
    - `EMAIL_FROM_ADDRESS` env var for sender
    - Always returns HTTP 200 (fire-and-forget pattern)
    - Graceful skip if `RESEND_API_KEY` not configured

- [x] **Task 6: Admin support list route** (AC: #1, #2, #7)
  - [x] 6.1: Create `apps/web/src/routes/admin/support/index.tsx`:
    - File-based route → URL: `/admin/support`
    - `createFileRoute("/admin/support/")`
    - `beforeLoad`: call `getAdminUserFn()`, redirect to `/` if not admin (same pattern as admin/index.tsx)
    - `loader`: call `getAdminSupportListFn({ filters: {} })` for initial load (no filters = all inquiries)
    - `head`: `buildPageMeta({ title: "Support Inquiries | Maison Émile", noindex: true })`
    - Page structure:
      ```
      .page-wrap .admin-support
        .admin-support__header
          h1 "Support Inquiries"
          .admin-support__filters — SupportFilters component
        .admin-support__list
          SupportInquiryList component
      ```
    - Filter changes trigger client-side refetch via `getAdminSupportListFn`
    - Each row clickable → navigates to `/admin/support/{inquiry.id}`
  - [x] 6.2: Create `apps/web/src/components/admin/SupportFilters.tsx`:
    - Two dropdowns: Status filter (All / New / In Progress / Resolved) + Subject filter (All / Order Issue / Payment Problem / General Question / Other)
    - On change → calls parent handler with new `SupportInquiryFilters`
    - BEM: `.support-filters`, `.support-filters__select`
    - Uses `SUPPORT_STATUSES` and `SUPPORT_SUBJECTS` from `@ecommerce/shared`
  - [x] 6.3: Create `apps/web/src/components/admin/SupportInquiryList.tsx`:
    - Table with columns: Date, Name, Email, Subject, Status, Order ID
    - Each row is a `<Link>` to `/admin/support/{id}`
    - Status shown via `SupportStatusBadge` component
    - Date formatted with `toLocaleDateString()`
    - Empty state: "No inquiries found"
    - BEM: `.inquiry-list`, `.inquiry-list__table`, `.inquiry-list__row`, `.inquiry-list__empty`
  - [x] 6.4: Create `apps/web/src/components/admin/SupportStatusBadge.tsx`:
    - Visual badge: green for "resolved", amber for "in-progress", red-ish for "new"
    - BEM: `.status-badge`, `.status-badge--new`, `.status-badge--in-progress`, `.status-badge--resolved`

- [x] **Task 7: Admin support detail route** (AC: #3, #4, #5, #6)
  - [x] 7.1: Create `apps/web/src/routes/admin/support/$inquiryId.tsx`:
    - File-based route → URL: `/admin/support/:inquiryId`
    - `createFileRoute("/admin/support/$inquiryId")`
    - `beforeLoad`: admin auth guard (same pattern)
    - `loader`: `getAdminSupportDetailFn({ inquiryId: params.inquiryId })`
    - Page structure:
      ```
      .page-wrap .admin-support-detail
        .admin-support-detail__header
          Link back to /admin/support
          h1 "Inquiry from {name}"
          SupportStatusBadge
        .admin-support-detail__meta
          p Date / Email / Subject / Order ID (with link if exists)
        .admin-support-detail__message
          h2 "Customer Message"
          p (whitespace: pre-wrap)
        .admin-support-detail__order (if linked order)
          h2 "Linked Order"
          p Order ID, Status, Total (formatPrice), Date
        .admin-support-detail__actions
          .admin-support-detail__status-update
            select (status dropdown) + "Update" button
          .admin-support-detail__notes
            h2 "Internal Notes"
            textarea + "Save Notes" button
          .admin-support-detail__reply
            h2 "Reply to Customer"
            textarea + "Send Reply" button
      ```
    - Status update calls `updateSupportStatusFn` → optimistic UI update
    - Notes save calls `updateSupportNotesFn` → shows success message
    - Reply sends calls `replySupportFn` → shows success/error, disables button while sending

- [x] **Task 8: CSS styles** (AC: all)
  - [x] 8.1: Append to `apps/web/src/styles/pages/admin.css` (do NOT create new file — reuse existing):
    - `.admin-support` — max-width: 1200px, centered, padding (same layout as `.admin-dashboard`)
    - `.admin-support__header` — flex, space-between
    - `.support-filters` — flex, gap
    - `.support-filters__select` — styled native select
    - `.inquiry-list__table` — full-width, same style as `.commission-table__table`
    - `.inquiry-list__row` — hover state, cursor pointer
    - `.inquiry-list__empty` — centered text, muted
    - `.status-badge` — inline pill, rounded, small font
    - `.status-badge--new` — red-ish tint (`#dc2626` / dark: `#ef4444`)
    - `.status-badge--in-progress` — amber tint (`#d97706` / dark: `#f59e0b`)
    - `.status-badge--resolved` — green tint (`#16a34a` / dark: `#22c55e`)
    - `.admin-support-detail` — max-width: 800px, centered
    - `.admin-support-detail__message` — styled blockquote with background, pre-wrap
    - `.admin-support-detail__actions` — stacked sections with spacing
    - `.admin-support-detail__reply textarea` — full-width, min-height 120px, border, radius
    - Dark theme overrides via `[data-theme="dark"]`
    - Responsive breakpoints matching existing admin patterns
  - [x] 8.2: No import update needed — `admin.css` is already imported in `index.css`

- [x] **Task 9: Tests** (AC: all)
  - [x] 9.1: Create `apps/web/src/__tests__/admin-support.test.ts`:
    - Test `getSupportInquiries()`: returns mapped inquiries, handles empty, applies filters
    - Test `getSupportInquiry()`: returns single inquiry, handles not found
    - Test `updateInquiryStatus()`: valid status update, invalid ID
    - Test `updateInternalNotes()`: notes saved correctly
    - Test `getLinkedOrder()`: returns order info, handles missing order
    - Test `mapRow()`: correct snake_case → camelCase mapping
    - Test status transitions: new → in-progress, in-progress → resolved
    - Test filter combinations: status-only, subject-only, both, none
    - Test admin auth guard: admin can access, non-admin redirected
    - Test reply handler: validates input, calls Edge Function
  - [x] 9.2: Use vitest + mock Supabase client (same pattern as `admin.test.ts`)
  - [x] 9.3: Target: 18-22 new tests

- [x] **Task 10: Quality checks** (AC: all)
  - [x] 10.1: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck)
  - [x] 10.2: `bun --cwd=apps/web run test` — all tests pass (489 existing + ~20 new)
  - [x] 10.3: `bun run typecheck` — 0 TypeScript errors
  - [x] 10.4: Verify support list renders at `/admin/support`
  - [x] 10.5: Verify inquiry detail renders at `/admin/support/:id`
  - [x] 10.6: Verify filters work (status, subject)
  - [x] 10.7: Verify status update works
  - [x] 10.8: Verify internal notes save
  - [x] 10.9: Verify non-admin user is redirected from `/admin/support`

## Dev Notes

### Critical Architecture Constraints

- **Vanilla CSS + BEM only** — No Tailwind, no CSS-in-JS. Append to existing `admin.css`. BEM blocks: `.admin-support`, `.admin-support-detail`, `.inquiry-list`, `.support-filters`, `.status-badge`. Reuse design tokens from `tokens.css`.

- **Web-only admin** — No mobile admin interface at MVP. Do NOT create any files in `apps/mobile/` for this story.

- **Admin auth via Supabase custom claims** — `user_role: 'admin'` in `app_metadata`. Reuse `getAdminUserFn()` from `apps/web/src/server/adminAuth.ts` for `beforeLoad` guards. Reuse `is_admin()` SQL function for RLS policies.

- **Two Supabase server clients** — `getSupabaseSessionClient()` for auth check (reads JWT from cookies), `getSupabaseServer()` for data queries (service role, bypasses RLS). Same pattern as `getAdminDashboardHandler.ts`.

- **Dynamic import in server functions** — Handler body loaded via `await import("./handler")` to keep server-only code out of client bundle. Same pattern as `submitSupportHandler.ts` and `getAdminDashboardHandler.ts`.

- **`support_inquiries` table already exists** — Created in migration `20260401000000_faq_and_support.sql`. Has columns: `id`, `name`, `email`, `subject`, `message`, `order_id`, `status`, `internal_notes`, `created_at`, `updated_at`. RLS is already enabled with `anon_insert_support` and `service_role_all_support` policies. This story only adds admin SELECT/UPDATE policies.

- **`is_admin()` function already exists** — Created in migration `20260402000000_admin_roles.sql`. Returns true if JWT `app_metadata.user_role = 'admin'`.

- **Order linking uses `violet_order_id`** — The `support_inquiries.order_id` column stores the Violet order ID (string), not the UUID primary key. When looking up linked orders, query `orders.violet_order_id` — NOT `orders.id`. Same issue as the send-notification bug fix (see `send-notification/index.ts` line 167 comment).

- **Edge Function pattern for reply emails** — Follow `send-support-email/index.ts` exactly: Resend API via raw fetch, `corsHeaders` from `_shared/cors.ts`, `EMAIL_FROM_ADDRESS` env var, `RESEND_API_KEY` env var, idempotency key, always returns HTTP 200, graceful skip if no API key.

- **No new npm dependencies** — Use existing `@supabase/supabase-js`, `@tanstack/react-start`, `@tanstack/react-router`. No rich text editor for reply — simple `<textarea>` is sufficient for MVP.

- **Protected route pattern** — Use `beforeLoad` guard calling `getAdminUserFn()` server function. If not admin → `throw redirect({ to: "/" })`. Same exact pattern as `/admin/` route. Do NOT use `context.user`.

- **SEO: noindex** — Admin pages must have `noindex: true` in `buildPageMeta()`.

- **Monetary values in cents** — If displaying linked order total, use `formatPrice(cents)` from `packages/shared/src/utils/formatPrice.ts`.

- **Route file structure** — `/admin/support` uses a `support/` subdirectory under `routes/admin/`. TanStack Router auto-generates route types in `routeTree.gen.ts` on dev server start. The `$inquiryId` parameter uses TanStack's `$` prefix convention for dynamic segments.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `getAdminUserFn()` | `apps/web/src/server/adminAuth.ts` | Admin auth server function for beforeLoad guard |
| `getSupabaseServer()` | `apps/web/src/server/supabaseServer.ts` | Service role client (bypasses RLS) |
| `getSupabaseSessionClient()` | `apps/web/src/server/supabaseServer.ts` | Session client (reads JWT from cookies) |
| `buildPageMeta()` | `packages/shared/src/utils/seo.ts` | SEO meta tags with noindex option |
| `formatPrice()` | `packages/shared/src/utils/formatPrice.ts` | Format cents → currency string |
| `SUPPORT_SUBJECTS` | `packages/shared/src/types/support.types.ts` | Array of valid subject values |
| `SupportSubject` | `packages/shared/src/types/support.types.ts` | Type for subject dropdown |
| `is_admin()` | `supabase/migrations/20260402000000_admin_roles.sql` | SQL function for admin RLS checks |
| `corsHeaders` | `supabase/functions/_shared/cors.ts` | CORS headers for Edge Functions |
| Design tokens | `apps/web/src/styles/tokens.css` | `--color-gold`, `--surface-elevated`, `--border-subtle`, `--space-*`, `--radius-*` |
| `createServerFn` | `@tanstack/react-start` | Server function pattern |
| `createFileRoute` | `@tanstack/react-router` | File-based route definition |
| `Link` | `@tanstack/react-router` | Client-side navigation links |

### Existing Code Patterns to Follow

```typescript
// Auth guard — EXACT pattern from admin/index.tsx
export const Route = createFileRoute("/admin/support/")({
  beforeLoad: async () => {
    const adminUser = await getAdminUserFn();
    if (!adminUser) throw redirect({ to: "/" });
  },
  loader: async () => getAdminSupportListFn({ data: { filters: {} } }),
  head: () => ({
    meta: buildPageMeta({
      title: "Support Inquiries | Maison Émile",
      noindex: true,
      // ... other meta
    }),
  }),
  component: AdminSupportPage,
});
```

```typescript
// Server function with dynamic import — same as getAdminDashboard.ts
export const getAdminSupportListFn = createServerFn({ method: "GET" })
  .inputValidator((data: { filters?: SupportInquiryFilters }) => data)
  .handler(async ({ data }) => {
    const { getAdminSupportListHandler } = await import("./getAdminSupportHandler");
    return getAdminSupportListHandler(data.filters);
  });
```

```typescript
// Handler with two clients — same as getAdminDashboardHandler.ts
export async function getAdminSupportListHandler(
  filters?: SupportInquiryFilters,
): Promise<AdminSupportListData> {
  const sessionClient = getSupabaseSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || user.is_anonymous || user.app_metadata?.user_role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  const serviceClient = getSupabaseServer();
  const inquiries = await getSupportInquiries(serviceClient, filters);
  return { inquiries };
}
```

```typescript
// Edge Function fire-and-forget invocation — same as submitSupportHandler.ts
try {
  await supabase.functions.invoke("send-support-reply", {
    body: { inquiry_id, customer_email, customer_name, subject, reply_message, admin_email },
  });
} catch {
  // Email failure should not block the action
}
```

### Previous Story Intelligence (Story 8.3)

- **489 tests pass** — baseline after Story 8.3. New support management tests should push to ~509+.
- **Admin auth pattern** — `getAdminUserFn()` in `adminAuth.ts` is the reusable admin auth check. Do NOT create another one.
- **Admin route guard** — `beforeLoad` calls `getAdminUserFn()`, redirects if null. Used in `admin/index.tsx`.
- **Handler pattern** — Two Supabase clients (session for auth, service role for data). Dynamic import in server function.
- **CSS** — All admin styles are in `admin.css`. Append new styles; do NOT create a separate file. Import is already in `index.css`.
- **No charting or complex UI** — Simple tables, badges, buttons. No external UI libraries.
- **Commission table CSS patterns** — Reuse `.commission-table` styling patterns for `.inquiry-list__table`. Same table layout, hover states, borders.
- **Commit pattern**: `feat: implement <description> (Story X.Y) + code review fixes`
- **`bun run fix-all` is the quality gate** — must pass before done.

### Git Intelligence

- Latest commit: `516bffe feat: implement analytics & commission dashboard (Story 8.3) + code review fixes`
- Story 8.3 established: admin route guard, server functions with two Supabase clients, BEM CSS for admin pages
- 489 passing tests as baseline
- Admin routes auto-generate in `routeTree.gen.ts`
- `admin.css` already imported in `index.css`

### Scope Boundaries — What is NOT in this story

- **Rich text editor for replies** — Simple `<textarea>` for MVP. No WYSIWYG editors.
- **Email threading / conversation history** — Single reply action. No multi-message threads.
- **Customer-facing reply view** — Replies go to customer's email only. No in-app inbox.
- **Automated responses / templates** — No pre-built reply templates at MVP.
- **Pagination** — MVP loads all inquiries. Pagination is a future optimization if volume grows.
- **Real-time updates** — No Supabase Realtime subscription. Manual page refresh to see new inquiries.
- **Mobile admin interface** — Explicitly excluded. Web-only.
- **Health monitoring** — That's Story 8.5.
- **Legal pages** — That's Story 8.6.
- **Bulk actions** — No bulk status update or bulk delete.
- **Inquiry deletion** — Admin can only update status and notes, not delete inquiries.

### Project Structure Notes

- Admin routes use the `/admin/support/` subdirectory: `routes/admin/support/index.tsx` + `routes/admin/support/$inquiryId.tsx`
- The `support/` folder is NEW — TanStack Router will auto-detect it and add routes to `routeTree.gen.ts`
- All shared types and clients go in `packages/shared/src/types/` and `packages/shared/src/clients/` respectively
- Edge Function goes in `supabase/functions/send-support-reply/` with its own `index.ts`
- CSS goes in existing `admin.css` — no new CSS file needed

### References

- [Source: epics.md#Story 8.4 — Support Inquiry Management acceptance criteria]
- [Source: supabase/migrations/20260401000000_faq_and_support.sql — support_inquiries table schema with status, internal_notes columns]
- [Source: supabase/migrations/20260402000000_admin_roles.sql — is_admin() function and admin RLS pattern]
- [Source: supabase/functions/send-support-email/index.ts — email Edge Function pattern with Resend API]
- [Source: apps/web/src/server/adminAuth.ts — getAdminUserFn() reusable admin auth]
- [Source: apps/web/src/server/getAdminDashboardHandler.ts — two-client handler pattern]
- [Source: apps/web/src/routes/admin/index.tsx — admin route with beforeLoad guard]
- [Source: apps/web/src/styles/pages/admin.css — existing admin BEM CSS styles]
- [Source: packages/shared/src/types/support.types.ts — SUPPORT_SUBJECTS, SupportSubject types]
- [Source: packages/shared/src/clients/support.ts — insertSupportInquiry, countRecentInquiries patterns]
- [Source: 8-3-analytics-commission-dashboard.md — previous story patterns and learnings]
- [Source: CLAUDE.md — BEM CSS, no Tailwind, Prettier, ESLint, conventional commits]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed test mock builders: Supabase query builder requires thenable `.then()` mock, not `mockResolvedValue` on chain methods
- Route tree types auto-generated on `bun run build` — TS errors in route files are expected before build

### Completion Notes List

- All 10 tasks completed successfully
- 23 new tests (512 total, up from 489)
- `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck)
- Admin RLS policies additive to existing `anon_insert_support` and `service_role_all_support`
- Filters/status/notes/reply inline in route files; StatusBadge extracted to shared component
- Edge Function `send-support-reply` follows established `send-support-email` pattern exactly
- Auto-status advancement: replying to a "new" inquiry auto-sets status to "in-progress"
- Order linking uses `violet_order_id` (not UUID `id`) per established codebase pattern

### Code Review Fixes Applied

- **C2**: Deduplicated `requireAdmin()` — consolidated to `requireAdminOrThrow()` in `adminAuth.ts`; all 3 handlers now import from single source
- **H1**: Extracted `StatusBadge` to shared `SupportStatusBadge.tsx` component (was duplicated in both route files)
- **H2**: Added 6 new tests (23 total): filter combos, error handling distinction, status transitions, violet_order_id verification
- **H3**: Made entire table row clickable with `onClick`, `role="link"`, keyboard support (was only Date+Name cells)
- **H4**: Fixed non-idempotent key in Edge Function — now uses deterministic content hash instead of `Date.now()`
- **M1**: Added `SUPPORT_STATUSES.includes()` validation in `updateSupportStatusHandler`
- **M2**: `getSupportInquiry` now distinguishes "not found" (PGRST116 → null) from unexpected errors (throw)
- **C1**: Updated Quick Reference table to reflect actual file structure (removed 4 phantom component files)

### File List

- `supabase/migrations/20260403000000_admin_support_rls.sql` (CREATE)
- `packages/shared/src/types/admin-support.types.ts` (CREATE)
- `packages/shared/src/types/index.ts` (UPDATE — added admin-support exports)
- `packages/shared/src/clients/admin-support.ts` (CREATE)
- `packages/shared/src/clients/index.ts` (UPDATE — added admin-support exports)
- `apps/web/src/server/adminAuth.ts` (UPDATE — added requireAdminOrThrow)
- `apps/web/src/server/getAdminSupport.ts` (CREATE)
- `apps/web/src/server/getAdminSupportHandler.ts` (CREATE)
- `apps/web/src/server/updateSupportInquiry.ts` (CREATE)
- `apps/web/src/server/updateSupportInquiryHandler.ts` (CREATE)
- `apps/web/src/server/replySupportInquiry.ts` (CREATE)
- `apps/web/src/server/replySupportInquiryHandler.ts` (CREATE)
- `supabase/functions/send-support-reply/index.ts` (CREATE)
- `apps/web/src/routes/admin/support/index.tsx` (CREATE)
- `apps/web/src/routes/admin/support/$inquiryId.tsx` (CREATE)
- `apps/web/src/components/admin/SupportStatusBadge.tsx` (CREATE)
- `apps/web/src/styles/pages/admin.css` (UPDATE — added support styles)
- `apps/web/src/__tests__/admin-support.test.ts` (CREATE)
- `apps/web/src/routeTree.gen.ts` (UPDATE — auto-generated by TanStack Router plugin)
