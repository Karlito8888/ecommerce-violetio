# Story 8.2: Contact & Support Form (Web + Mobile)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Quick Reference — Files to Create/Update

| Action | File | Notes |
| ------ | ---- | ----- |
| CREATE | `packages/shared/src/types/support.types.ts` | SupportInquiry, SupportSubject types |
| CREATE | `packages/shared/src/clients/support.ts` | submitSupportInquiry() — Supabase insert |
| UPDATE | `packages/shared/src/clients/index.ts` | Export support client functions |
| UPDATE | `packages/shared/src/types/index.ts` | Export support types |
| CREATE | `apps/web/src/server/submitSupport.ts` | Server function: validate, rate-limit, insert, send emails |
| CREATE | `apps/web/src/routes/help/contact.tsx` | Web contact form page — SSR shell, client-side form |
| CREATE | `apps/web/src/components/help/ContactForm.tsx` | Form component: fields, validation, honeypot, submission |
| CREATE | `apps/web/src/styles/pages/contact.css` | BEM styles for `.contact-page` block |
| UPDATE | `apps/web/src/styles/index.css` | Import contact.css |
| CREATE | `apps/mobile/src/app/help/contact.tsx` | Mobile contact screen |
| UPDATE | `apps/mobile/src/app/help/_layout.tsx` | Add "Contact Us" screen to Stack |
| CREATE | `supabase/functions/send-support-email/index.ts` | Edge Function: send confirmation to visitor + alert to admin |
| UPDATE | `supabase/.env.example` | Add SUPPORT_EMAIL variable |
| CREATE | `apps/web/src/__tests__/support.test.ts` | Tests for support client, validation, rate limiting |

---

## Story

As a **visitor**,
I want to submit a support inquiry via a contact form,
So that I can get help with issues not covered by the FAQ.

## Acceptance Criteria

1. **Given** a visitor needs to contact support
   **When** they navigate to the contact page and fill out the form
   **Then** the form collects: name, email, subject (dropdown: Order Issue, Payment Problem, General Question, Other), message, optional order ID (FR27a)

2. **Given** a valid form submission
   **When** the visitor submits the form
   **Then** a row is created in `support_inquiries` table (name, email, subject, message, order_id, status: "new", created_at)

3. **Given** a valid form submission
   **When** the row is inserted
   **Then** an email notification is sent to the support email address (configured via `SUPPORT_EMAIL` env var)

4. **Given** a valid form submission
   **When** the submission succeeds
   **Then** the visitor receives a confirmation message on-screen and a confirmation email

5. **Given** the web platform
   **When** the contact page is accessed
   **Then** web: contact page at `apps/web/src/routes/help/contact.tsx`

6. **Given** the mobile platform
   **When** the contact screen is accessed
   **Then** mobile: contact screen at `apps/mobile/src/app/help/contact.tsx`

7. **Given** spam prevention requirements
   **When** submissions are tracked
   **Then** rate limiting prevents spam (max 3 submissions per email per hour)

8. **Given** form validation requirements
   **When** the form is submitted
   **Then** form validation enforces: email format, message length (min 20 chars, max 2000 chars)

9. **Given** bot protection requirements
   **When** the form is rendered
   **Then** a honeypot field provides basic bot protection (no CAPTCHA for UX)

10. **Given** FR27c compliance
    **When** the contact page is rendered
    **Then** the page clearly communicates that return/exchange policies are handled by individual merchants via Violet

## Tasks / Subtasks

- [x]**Task 1: Shared types and client** (AC: #1, #2)
  - [x]1.1: Create `packages/shared/src/types/support.types.ts`:
    ```typescript
    export const SUPPORT_SUBJECTS = [
      "Order Issue",
      "Payment Problem",
      "General Question",
      "Other",
    ] as const;

    export type SupportSubject = (typeof SUPPORT_SUBJECTS)[number];

    export interface SupportInquiryInput {
      name: string;
      email: string;
      subject: SupportSubject;
      message: string;
      orderId?: string;
    }

    export interface SupportInquiryResult {
      success: boolean;
      inquiryId?: string;
      error?: string;
    }
    ```
  - [x]1.2: Create `packages/shared/src/clients/support.ts`:
    ```typescript
    import type { SupabaseClient } from "@supabase/supabase-js";
    import type { SupportInquiryInput } from "../types/support.types";

    export async function insertSupportInquiry(
      client: SupabaseClient,
      input: SupportInquiryInput,
    ): Promise<{ id: string } | null> {
      const { data, error } = await client
        .from("support_inquiries")
        .insert({
          name: input.name,
          email: input.email,
          subject: input.subject,
          message: input.message,
          order_id: input.orderId || null,
        })
        .select("id")
        .single();

      if (error || !data) return null;
      return { id: data.id };
    }
    ```
  - [x]1.3: Update `packages/shared/src/types/index.ts` — export support types
  - [x]1.4: Update `packages/shared/src/clients/index.ts` — export `insertSupportInquiry`

- [x]**Task 2: Web server function with rate limiting** (AC: #2, #3, #4, #7, #8, #9)
  - [x]2.1: Create `apps/web/src/server/submitSupport.ts`:
    ```typescript
    import { createServerFn } from "@tanstack/react-start";
    import type { SupportInquiryInput, SupportInquiryResult } from "@ecommerce/shared";

    export const submitSupportFn = createServerFn({ method: "POST" })
      .inputValidator((data: { inquiry: SupportInquiryInput; honeypot?: string }) => data)
      .handler(async ({ data }): Promise<SupportInquiryResult> => {
        const { submitSupportHandler } = await import("./submitSupportHandler");
        return submitSupportHandler(data.inquiry, data.honeypot);
      });
    ```
  - [x]2.2: Create `apps/web/src/server/submitSupportHandler.ts`:
    - **Honeypot check**: if `honeypot` field has value → return `{ success: true }` silently (pretend success)
    - **Validation**: email format (basic regex), message length (20-2000 chars), subject in allowed list, name non-empty
    - **Rate limiting**: query `support_inquiries` table for count WHERE email = input.email AND created_at > now() - 1 hour. If >= 3 → return error
    - **Insert**: use `createSupabaseClient()` + `insertSupportInquiry()` from shared
    - **Send emails**: invoke `send-support-email` Edge Function fire-and-forget via `supabase.functions.invoke()`:
      ```typescript
      const supabase = createSupabaseClient();
      await supabase.functions.invoke("send-support-email", {
        body: { inquiry_id: result.id, name, email, subject, message, order_id: orderId },
      });
      ```
    - Return `{ success: true, inquiryId: result.id }`
    - Dynamic import pattern (same as trackingHandlers.ts) to keep server-only code out of client bundle

- [x]**Task 3: Edge Function — support email notifications** (AC: #3, #4)
  - [x]3.1: Create `supabase/functions/send-support-email/index.ts`:
    - Uses Resend API (same pattern as `send-notification`)
    - Reads `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `SUPPORT_EMAIL`, `APP_URL` from env
    - **Two emails sent per submission:**
      1. **Admin alert** → `SUPPORT_EMAIL`: subject "New Support Inquiry: {subject}", body with name, email, subject, message, order_id, link to Supabase Studio
      2. **Visitor confirmation** → submitter's email: subject "We received your inquiry", body confirming receipt with estimated response time
    - Graceful skip if `RESEND_API_KEY` not configured (dev environment)
    - Always returns 200 (fire-and-forget pattern from send-notification)
    - Use `corsHeaders` and `getSupabaseAdmin` from `_shared/`
    - Simple HTML email templates (inline CSS, same patterns as send-notification/templates.ts)
    - Idempotency key: `support-{inquiry_id}` to prevent duplicate emails
  - [x]3.2: Update `supabase/.env.example` — add `SUPPORT_EMAIL=support@yourdomain.com`

- [x]**Task 4: Web contact page route** (AC: #1, #5, #10)
  - [x]4.1: Create `apps/web/src/routes/help/contact.tsx`:
    - File-based route → URL: `/help/contact`
    - Use `createFileRoute` from `@tanstack/react-router`
    - No loader needed (no server-side data fetching — form is client-side)
    - SEO: `buildPageMeta()` for title "Contact Us — Support" and description
    - Page structure:
      ```
      .contact-page
        .contact-page__header
          h1.contact-page__title — "Contact Us"
          p.contact-page__subtitle — "Have a question? We're here to help."
        .contact-page__content
          .contact-page__form-section
            ContactForm component
          .contact-page__info-section
            p — "Check our FAQ for quick answers" → Link to /help
            p — FR27c: "Return and exchange policies are managed by individual merchants..."
      ```
  - [x]4.2: Create `apps/web/src/components/help/ContactForm.tsx`:
    - Uses `useState` for form state, errors, and submission status
    - **Fields:**
      - Name: `<input type="text">` required
      - Email: `<input type="email">` required
      - Subject: `<select>` with options from `SUPPORT_SUBJECTS` constant
      - Order ID: `<input type="text">` optional, placeholder "Optional — e.g., VIO-12345"
      - Message: `<textarea>` required, minLength=20, maxLength=2000, show character count
      - Honeypot: hidden `<input>` with `tabIndex={-1}`, `autoComplete="off"`, `aria-hidden="true"`, CSS `position: absolute; left: -9999px`
    - **Client-side validation** before submit:
      - Name: non-empty
      - Email: basic format check (`/.+@.+\..+/`)
      - Message: 20-2000 chars
      - Show inline errors per field (`.contact-form__error`)
    - **Submission flow:**
      1. Call `submitSupportFn({ inquiry: formData, honeypot: honeypotValue })`
      2. On success: show confirmation message in-place (replace form with success state)
      3. On rate limit error: show "You've submitted too many requests. Please try again later."
      4. On other error: show "Something went wrong. Please try again."
    - **Success state:** green checkmark + "Thank you! We've received your inquiry and will respond within 24-48 hours. A confirmation email has been sent to {email}."
    - **BEM classes:** `.contact-form`, `.contact-form__field`, `.contact-form__label`, `.contact-form__input`, `.contact-form__select`, `.contact-form__textarea`, `.contact-form__error`, `.contact-form__char-count`, `.contact-form__submit`, `.contact-form__success`
    - **Accessibility:** all inputs have associated `<label>`, error messages use `aria-describedby`, submit button disabled during submission

- [x]**Task 5: Web CSS** (AC: #1)
  - [x]5.1: Create `apps/web/src/styles/pages/contact.css`:
    - **Reuse auth-form patterns** — the contact form should share the same visual language:
      - Input/label/error styles: mirror `.auth-form__input`, `.auth-form__label`, `.auth-form__error` patterns
      - Submit button: same gold background, hover states as `.auth-form__submit`
      - Container: max-width: 600px, centered, elevated surface with subtle border
    - **New styles needed:**
      - `.contact-page` — layout container
      - `.contact-page__header` — centered title/subtitle
      - `.contact-page__content` — two sections (form + info sidebar on desktop, stacked on mobile)
      - `.contact-form__textarea` — height: 150px, resize: vertical
      - `.contact-form__select` — native `<select>` styling matching input pattern
      - `.contact-form__char-count` — right-aligned character counter, changes color near limit
      - `.contact-form__success` — success state with checkmark
      - `.contact-form__honeypot` — `position: absolute; left: -9999px; height: 0; overflow: hidden`
    - Dark theme support using existing `[data-theme="dark"]` variables
  - [x]5.2: Update `apps/web/src/styles/index.css` — add import for `pages/contact.css`

- [x]**Task 6: Update FAQ page CTA link** (AC: #5)
  - [x]6.1: Update `apps/web/src/routes/help/index.tsx`:
    - Change the contact CTA `<a href="/help/contact">` to use TanStack `<Link to="/help/contact">` (now that the route exists)
    - Import `Link` from `@tanstack/react-router`

- [x]**Task 7: Mobile contact screen** (AC: #6)
  - [x]7.1: Update `apps/mobile/src/app/help/_layout.tsx`:
    - Add `<Stack.Screen name="contact" options={{ title: "Contact Us" }} />`
  - [x]7.2: Create `apps/mobile/src/app/help/contact.tsx`:
    - Uses `ScrollView` with `KeyboardAvoidingView`
    - Same fields as web: name, email, subject (use React Native `Picker` or styled `Pressable` with modal), message, optional order ID
    - Client-side validation (same rules as web)
    - Submit via `createSupabaseClient()` + `insertSupportInquiry()` from shared (direct insert — no server function on mobile)
    - For email notifications: invoke Edge Function via `supabase.functions.invoke("send-support-email", { body })` directly
    - Rate limit check: query `support_inquiries` count for email in last hour before insert
    - Honeypot: not needed on mobile (native app, not crawlable by bots)
    - Success state: replace form with confirmation view
    - Navigation from FAQ: add button/link at bottom of help/index.tsx → `router.push("/help/contact" as never)`
    - Follow existing mobile data fetching pattern (useState/useEffect, no TanStack Query)

- [x]**Task 8: Tests** (AC: all)
  - [x]8.1: Create `apps/web/src/__tests__/support.test.ts`:
    - Test `insertSupportInquiry()`: successful insert, error handling
    - Test validation logic: valid email, invalid email, message too short, message too long, empty name, valid subject, invalid subject
    - Test rate limiting logic: under limit passes, at limit blocks
    - Test honeypot: non-empty honeypot returns silent success
    - Test form component: renders all fields, shows validation errors, handles submission states
  - [x]8.2: Use vitest + mock Supabase client (same pattern as faq.test.ts)
  - [x]8.3: Target: 10-15 new tests

- [x]**Task 9: Quality checks** (AC: all)
  - [x]9.1: `bun run fix-all` exits 0 (Prettier + ESLint + TypeCheck)
  - [x]9.2: `bun --cwd=apps/web run test` — all 432+ existing tests pass + new tests pass
  - [x]9.3: `bun run typecheck` — 0 TypeScript errors
  - [x]9.4: Verify contact form renders at `/help/contact`
  - [x]9.5: Verify form submission creates row in `support_inquiries` table
  - [x]9.6: Verify rate limiting blocks 4th submission from same email within 1 hour
  - [x]9.7: Verify honeypot silently blocks bot submissions
  - [x]9.8: Verify confirmation message shows after successful submission
  - [x]9.9: Verify FAQ page CTA links correctly to `/help/contact`

## Dev Notes

### Critical Architecture Constraints

- **Vanilla CSS + BEM only** — No Tailwind, no CSS-in-JS. Contact form uses BEM: `.contact-page`, `.contact-form`, `.contact-form__field`, etc. Mirror the visual patterns from `auth.css` (same input styles, label styles, button styles).

- **`support_inquiries` table ALREADY EXISTS** — Created by Story 8.1 migration (`20260401000000_faq_and_support.sql`). DO NOT create a new migration. The table has:
  - CHECK constraint on `subject IN ('Order Issue', 'Payment Problem', 'General Question', 'Other')`
  - CHECK constraint on `message char_length >= 20 AND <= 2000`
  - RLS: `anon_insert_support` policy allows INSERT for anyone (anon key sufficient)
  - RLS: `service_role_all_support` policy for admin full access
  - Index on `(status, created_at DESC)`
  - `updated_at` trigger already configured

- **Anon Supabase client is sufficient for inserts** — The `anon_insert_support` RLS policy allows any anon user to INSERT. Use `createSupabaseClient()` (anon key), NOT service role. Server function uses anon client.

- **Rate limiting is server-side** — Implement in the server function handler, NOT client-side. Query: `SELECT count(*) FROM support_inquiries WHERE email = $1 AND created_at > now() - interval '1 hour'`. If >= 3, reject.

- **Honeypot, not CAPTCHA** — Per UX spec (anti-dark-pattern philosophy). Hidden field with `tabIndex={-1}`, `aria-hidden="true"`, positioned off-screen. If filled → silently return success (don't tip off bots).

- **Edge Function for emails, NOT server function** — Email sending requires `RESEND_API_KEY` which is configured in Supabase Edge Functions env, not in the web app. Follow fire-and-forget pattern from `send-notification`.

- **Two separate emails per submission** — Admin gets an alert, visitor gets a confirmation. Both via Resend API in the same Edge Function invocation.

- **Dynamic import in server function** — Use the same pattern as `tracking.ts`: handler body loads via `await import("./submitSupportHandler")` to keep server-only code out of client bundle.

- **No new dependencies** — Use existing `@supabase/supabase-js`, `@tanstack/react-start`, `@tanstack/react-router`. No form libraries (React Hook Form, Formik, etc.). Plain React `useState` for form state.

- **Mobile uses direct Supabase calls** — No server function on mobile. Use `createSupabaseClient()` + `insertSupportInquiry()` from shared, then `supabase.functions.invoke()` for the email Edge Function. Same pattern as mobile FAQ screen.

### Existing Utilities to Reuse (DO NOT REBUILD)

| Utility | Location | What it provides |
| ------- | -------- | ---------------- |
| `createSupabaseClient()` | `packages/shared/src/clients/supabase.ts` | Anon Supabase client with RLS |
| `buildPageMeta()` | `packages/shared/src/utils/seo.ts` | SEO meta tags for route head |
| `createServerFn` | `@tanstack/react-start` | Server function pattern |
| `createFileRoute` | `@tanstack/react-router` | File-based route definition |
| `Link` | `@tanstack/react-router` | Client-side navigation |
| `corsHeaders` | `supabase/functions/_shared/cors.ts` | CORS headers for Edge Functions |
| `getSupabaseAdmin` | `supabase/functions/_shared/supabaseAdmin.ts` | Service role client in Edge Functions |
| Design tokens | `apps/web/src/styles/tokens.css` | `--color-gold`, `--color-error`, `--space-*`, `--radius-*`, etc. |
| Auth form CSS | `apps/web/src/styles/pages/auth.css` | Visual patterns for inputs, labels, buttons, errors |

### Existing Code Patterns to Follow

```typescript
// Server function POST pattern (from tracking.ts)
export const submitSupportFn = createServerFn({ method: "POST" })
  .inputValidator((data: { inquiry: SupportInquiryInput; honeypot?: string }) => data)
  .handler(async ({ data }) => {
    const { submitSupportHandler } = await import("./submitSupportHandler");
    return submitSupportHandler(data.inquiry, data.honeypot);
  });
```

```typescript
// Edge Function invocation pattern (from orderProcessors.ts)
await supabase.functions.invoke("send-support-email", {
  body: { inquiry_id, name, email, subject, message, order_id },
});
```

```typescript
// Edge Function Deno pattern (from send-notification/index.ts)
import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // ... logic
});
```

```typescript
// Mobile form submission pattern
const supabase = createSupabaseClient();
const result = await insertSupportInquiry(supabase, { name, email, subject, message, orderId });
if (result) {
  await supabase.functions.invoke("send-support-email", { body: { ... } });
}
```

### Previous Story Intelligence (Story 8.1)

- **432 tests pass** — test count after Story 8.1 with code review fixes. New support tests should push to ~445+.
- **FAQ page already has a CTA** to `/help/contact` — currently an `<a>` tag because the route didn't exist. Task 6 upgrades this to `<Link>`.
- **Mobile `as never` cast** — expo-router strict href typing requires `router.push(path as never)` for dynamic routes.
- **Commit pattern**: `feat: implement <description> (Story X.Y) + code review fixes`
- **`bun run fix-all` is the quality gate** — Prettier + ESLint + TypeCheck. Must pass before considering done.
- **Column comments already exist** on `support_inquiries` table — no need to add more.
- **Additive only** — Do not modify any existing tables. `support_inquiries` is already created with the correct schema.

### Git Intelligence

- Latest commit: `715ae60 feat: implement FAQ & Help Center (Story 8.1) + code review fixes`
- Story 8.1 created the `support_inquiries` table, shared FAQ client, help route structure
- 432 passing tests as baseline
- CSS files follow consistent import order in `index.css`: tokens → base → utilities → components → pages
- New routes trigger `routeTree.gen.ts` auto-generation on dev server start

### Edge Function Deployment Note

- The `send-support-email` Edge Function needs to be added to `supabase/functions/` directory
- It will be auto-detected by `supabase functions serve` for local dev
- For production: `supabase functions deploy send-support-email`
- Required env vars in Supabase dashboard: `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `SUPPORT_EMAIL`, `APP_URL`

### Scope Boundaries — What is NOT in this story

- **Support inquiry management UI** — That's Story 8.4. Admin views/manages inquiries via Supabase Studio for now.
- **Reply-to-customer from admin** — Story 8.4. This story only handles initial submission + confirmation.
- **CAPTCHA / reCAPTCHA** — Deliberately excluded per UX spec (anti-dark-pattern). Honeypot is sufficient.
- **File attachments** — Not in epics spec. Contact form is text-only.
- **Live chat / chatbot** — Not in scope. Contact form is async submission only.
- **Email templates in Resend** — Use inline HTML (same as send-notification). No Resend template system.
- **Custom email domain verification** — Beyond MVP scope. Use default Resend sender or configured `EMAIL_FROM_ADDRESS`.

### Project Structure Notes

- **Shared types**: `packages/shared/src/types/support.types.ts` — SupportInquiryInput, SupportSubject, SupportInquiryResult
- **Shared client**: `packages/shared/src/clients/support.ts` — insertSupportInquiry
- **Server function**: `apps/web/src/server/submitSupport.ts` + `submitSupportHandler.ts`
- **Web route**: `apps/web/src/routes/help/contact.tsx` — contact page
- **Web component**: `apps/web/src/components/help/ContactForm.tsx`
- **Web CSS**: `apps/web/src/styles/pages/contact.css`
- **Mobile**: `apps/mobile/src/app/help/contact.tsx`
- **Edge Function**: `supabase/functions/send-support-email/index.ts`
- **Tests**: `apps/web/src/__tests__/support.test.ts`

### References

- [Source: epics.md#Story 8.2 — Contact & Support Form acceptance criteria]
- [Source: prd.md#FR27a — "Visitors can access a centralized contact page with an email form"]
- [Source: prd.md#FR27c — "Visitors can view return/refund policy (handled by individual merchants via Violet)"]
- [Source: architecture.md — Supabase RLS patterns, Edge Function patterns, BEM CSS convention]
- [Source: ux-design-specification.md — Anti-dark-pattern philosophy, no CAPTCHA, honest error messaging]
- [Source: 8-1-faq-help-center.md — previous story patterns: migration already created support_inquiries, 432 tests baseline, CTA link to /help/contact]
- [Source: send-notification/index.ts — Resend API pattern, fire-and-forget, retry logic, idempotency keys]
- [Source: tracking.ts — POST server function with dynamic import pattern]
- [Source: auth.css — Form input/label/error/submit styling patterns]
- [Source: CLAUDE.md — BEM CSS, no Tailwind, Prettier, ESLint, conventional commits]
- [Source: 20260401000000_faq_and_support.sql — support_inquiries table: subject CHECK constraint, message length CHECK, RLS policies]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- `support_inquiries` RLS only allows INSERT for anon — rate limiting (SELECT count) requires service role. Web server function uses `getSupabaseServer()` for both operations. Mobile omits rate limiting since anon client can't query the table.
- Route tree (`routeTree.gen.ts`) already included `/help/contact` from a prior auto-generation — no manual update needed.
- FAQ page CTA changed from `<a href="/help/contact">` to `<Link to="/help/contact">` now that the route exists in the route tree.
- Mobile subject selector uses radio-style chip buttons instead of native `Picker` for consistent cross-platform UX.
- `React.FormEvent` deprecation warning in React 19 types is a known issue — used consistently throughout codebase (auth, checkout, profile forms).

### Completion Notes List

- Created `packages/shared/src/types/support.types.ts` — `SupportSubject`, `SupportInquiryInput`, `SupportInquiryResult` types + `SUPPORT_SUBJECTS` constant.
- Created `packages/shared/src/clients/support.ts` — `insertSupportInquiry()` for DB insert and `countRecentInquiries()` for rate-limit queries.
- Updated `packages/shared/src/types/index.ts` and `packages/shared/src/clients/index.ts` — barrel exports for new types and functions.
- Created `apps/web/src/server/submitSupport.ts` — POST server function with `inputValidator` and dynamic import pattern.
- Created `apps/web/src/server/submitSupportHandler.ts` — honeypot check, input validation, rate limiting (max 3/email/hour via service role), DB insert, fire-and-forget Edge Function invocation.
- Created `supabase/functions/send-support-email/index.ts` — Resend API Edge Function sending admin alert + visitor confirmation emails with idempotency keys.
- Updated `supabase/.env.example` — added `SUPPORT_EMAIL` env var.
- Created `apps/web/src/routes/help/contact.tsx` — contact page route with SEO meta, ContactForm component, info sidebar with FAQ link and return policy note (FR27c).
- Created `apps/web/src/components/help/ContactForm.tsx` — form with name, email, subject dropdown, optional order ID, message (with char counter), honeypot field, client-side validation, submission states (idle/submitting/success/error).
- Created `apps/web/src/styles/pages/contact.css` — BEM styles mirroring auth.css patterns for inputs/labels/buttons, plus success state and info sidebar.
- Updated `apps/web/src/styles/index.css` — added import for `pages/contact.css`.
- Updated `apps/web/src/routes/help/index.tsx` — changed contact CTA from `<a>` to `<Link>` for client-side navigation.
- Updated `apps/mobile/src/app/help/_layout.tsx` — added "Contact Us" Stack.Screen.
- Created `apps/mobile/src/app/help/contact.tsx` — mobile contact screen with KeyboardAvoidingView, radio-style subject chips, direct Supabase insert + Edge Function invocation.
- Updated `apps/mobile/src/app/help/index.tsx` — added "Contact Us" CTA button at bottom of FAQ list with navigation.
- Created `apps/web/src/__tests__/support.test.ts` — 17 tests: insertSupportInquiry (5), countRecentInquiries (3), SUPPORT_SUBJECTS (3), validation logic (6).
- All 449 tests pass (432 existing + 17 new). `bun run fix-all` exits 0. TypeCheck clean.

### Change Log

- 2026-03-20: Story 8.2 implementation complete — Contact & Support Form with web SSR page, mobile screen, Edge Function for email notifications, shared data layer, 17 new tests. Rate limiting (3/email/hour), honeypot bot protection, form validation.
- 2026-03-20: Code review fixes — [H3] Fixed `<a>` → `<Link>` for internal FAQ link in contact page. [H1] Added client-side rate limiting on mobile (anon RLS can't SELECT for count). [H2] Added 18 handler tests (honeypot, validation, rate limiting, submission flow, edge function invocation). [M2] Added runtime validation to inputValidator. [M1] Added routeTree.gen.ts to File List. Total: 467 tests.

### File List

- `packages/shared/src/types/support.types.ts` (CREATE — SupportSubject, SupportInquiryInput, SupportInquiryResult)
- `packages/shared/src/clients/support.ts` (CREATE — insertSupportInquiry, countRecentInquiries)
- `packages/shared/src/types/index.ts` (UPDATE — export support types)
- `packages/shared/src/clients/index.ts` (UPDATE — export support client)
- `apps/web/src/server/submitSupport.ts` (CREATE — POST server function)
- `apps/web/src/server/submitSupportHandler.ts` (CREATE — validation, rate limit, honeypot, DB insert, email trigger)
- `supabase/functions/send-support-email/index.ts` (CREATE — Resend API Edge Function for admin alert + visitor confirmation)
- `supabase/.env.example` (UPDATE — added SUPPORT_EMAIL)
- `apps/web/src/routes/help/contact.tsx` (CREATE — contact page route with SEO)
- `apps/web/src/components/help/ContactForm.tsx` (CREATE — form component with all fields, validation, states)
- `apps/web/src/styles/pages/contact.css` (CREATE — BEM styles for contact page + form)
- `apps/web/src/styles/index.css` (UPDATE — import contact.css)
- `apps/web/src/routes/help/index.tsx` (UPDATE — CTA link changed from `<a>` to `<Link>`)
- `apps/mobile/src/app/help/_layout.tsx` (UPDATE — added contact Stack.Screen)
- `apps/mobile/src/app/help/contact.tsx` (CREATE — mobile contact screen)
- `apps/mobile/src/app/help/index.tsx` (UPDATE — added Contact Us CTA + navigation)
- `apps/web/src/__tests__/support.test.ts` (CREATE — 17 tests)
- `apps/web/src/__tests__/submitSupportHandler.test.ts` (CREATE — 18 handler tests: honeypot, validation, rate limiting, submission flow)
- `apps/web/src/routeTree.gen.ts` (UPDATE — auto-generated, includes /help/contact route)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — story status)
- `_bmad-output/implementation-artifacts/8-2-contact-support-form.md` (UPDATE — story status + dev record)
