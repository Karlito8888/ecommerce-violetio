/**
 * Guest Order Lookup Page — /order/lookup
 *
 * @module routes/order/lookup
 *
 * Multi-step page that lets guest buyers track their orders without an account.
 *
 * ## Two entry paths
 *
 * 1. **Token-based** (`?token=<base64url>`): Arrived from the confirmation page link.
 *    On mount, the token is auto-submitted to `lookupOrderByTokenFn` which hashes it
 *    server-side (SHA-256) and queries the Convex orders table by hash.
 *    This path requires NO authentication — the token's 256-bit entropy is the auth.
 *
 * 2. **Email-based** (no token): The guest enters their email to receive a 6-digit OTP
 *    via Convex Auth `signIn("password", { flow: "reset", email })`. The ResendOTP
 *    provider sends the email independently of account existence. After verifying,
 *    all orders for that email are fetched via `lookupOrdersByEmailFn`.
 *    No session cleanup needed — the reset flow doesn't create a persistent session.
 *
 * ## State machine
 * ```
 * "email" → (submit email) → "verify" → (submit OTP) → "results"
 *    ↑                            |
 *    └──── (back button) ─────────┘
 *
 * URL has ?token → auto-submit → "token-result"
 * ```
 *
 * ## Data source
 * Token-based lookup uses the Convex orders table (via server function).
 * Email-based lookup uses Convex query after OTP verification.
 *
 * ## DESIGN NOTE (Guest OTP via reset flow)
 * The email-based path reuses Convex Auth's password reset flow (`flow: "reset"`)
 * for OTP delivery to guests who may NOT have a Convex Auth account. This works
 * because our custom ResendOTP provider (`convex/lib/resendOTP.ts`) sends the
 * OTP email via Resend API regardless of whether the email has an associated account.
 * The OTP serves solely as proof of email possession — it does NOT create a session
 * or user record if the email is unregistered. Same pattern as mobile `order/lookup.tsx`.
 *
 * ## SEO: noindex
 * Guest lookup pages should not be indexed — they contain transient personal data
 * and are not useful for search engine crawlers.
 *
 * ## Component duplication note
 * Several sub-components (ItemRow, RefundNotice, BagCard, OrderDetailContent) are
 * duplicated from $orderId.tsx. A future refactor should extract these into shared
 * components under a common order-detail module.
 *
 * @see {@link lookupOrderByTokenFn} — token-based server function
 * @see {@link lookupOrdersByEmailFn} — email-based server function
 * @see Story 5.4 — Guest Order Lookup (web + mobile)
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  buildPageMeta,
  ORDER_STATUS_LABELS,
  BAG_STATUS_LABELS,
  getBagStatusSummary,
  formatPrice,
  formatDate,
} from "@ecommerce/shared";
import type {
  OrderWithBagsAndItems,
  OrderBagWithItems,
  OrderItemRow,
  OrderRefundRow,
} from "@ecommerce/shared";
import { useAuthActions } from "@convex-dev/auth/react";
import { lookupOrderByTokenFn, lookupOrdersByEmailFn } from "#/server/guestOrders";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

// ─── State Machine ─────────────────────────────────────────────────────────────

/**
 * Discriminated union representing the current step of the guest lookup flow.
 *
 * - `"email"`: Initial state — show email input form (or token error fallback).
 * - `"verify"`: OTP sent — show 6-digit code input for the given email.
 * - `"results"`: Email verified — show order list (may be empty).
 * - `"token-result"`: Token lookup succeeded — show single order detail.
 */
type LookupStep =
  | { step: "email" }
  | { step: "verify"; email: string }
  | { step: "results"; orders: OrderWithBagsAndItems[] }
  | { step: "token-result"; order: OrderWithBagsAndItems };

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/order/lookup")({
  head: () => ({
    meta: buildPageMeta({
      title: "Track Your Order | Maison Émile",
      description: "Look up your order status using your email address or order token.",
      url: "/order/lookup",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || "",
  }),
  component: LookupPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBagStatusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "order-detail__status-badge--delivered";
    case "SHIPPED":
      return "order-detail__status-badge--shipped";
    case "CANCELED":
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "order-detail__status-badge--canceled";
    default:
      return "order-detail__status-badge--processing";
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "orders__status-badge--delivered";
    case "SHIPPED":
    case "PARTIALLY_SHIPPED":
      return "orders__status-badge--shipped";
    case "CANCELED":
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "orders__status-badge--canceled";
    default:
      return "orders__status-badge--processing";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ItemRow({ item, currency }: { item: OrderItemRow; currency: string }) {
  return (
    <div className="order-detail__item">
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.name}
          className="order-detail__item-image"
          loading="lazy"
        />
      ) : (
        <div
          className="order-detail__item-image order-detail__item-image--placeholder"
          aria-hidden="true"
        >
          ●
        </div>
      )}
      <div className="order-detail__item-details">
        <div className="order-detail__item-name">{item.name}</div>
        {item.quantity > 1 && <div className="order-detail__item-qty">Qty: {item.quantity}</div>}
      </div>
      <div className="order-detail__item-price">{formatPrice(item.line_price, currency)}</div>
    </div>
  );
}

/**
 * Displays refund information for a bag that has been refunded.
 *
 * Per Violet.io docs, CANCELED bags never have refund data — only REFUNDED or
 * PARTIALLY_REFUNDED bags do. This component renders nothing for empty arrays,
 * which correctly handles CANCELED bags (they always have `order_refunds: []`).
 *
 * NOTE: This component is duplicated from $orderId.tsx. A future refactor should
 * extract shared order detail sub-components (RefundNotice, BagCard, ItemRow).
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md
 */
function RefundNotice({ refunds, currency }: { refunds: OrderRefundRow[]; currency: string }) {
  if (refunds.length === 0) return null;
  const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0);
  const firstReason = refunds.find((r) => r.reason)?.reason;
  return (
    <div className="order-detail__refund">
      <span className="order-detail__refund-notice">
        Refund of {formatPrice(totalRefunded, currency)} processed
      </span>
      {firstReason && <span className="order-detail__refund-reason">{firstReason}</span>}
    </div>
  );
}

function BagCard({ bag, orderCurrency }: { bag: OrderBagWithItems; orderCurrency: string }) {
  const statusLabel = BAG_STATUS_LABELS[bag.status] ?? bag.status;

  return (
    <div className="order-detail__bag">
      <div className="order-detail__bag-header">
        <span className="order-detail__merchant-name">{bag.merchant_name || "Merchant"}</span>
        <span className={`order-detail__status-badge ${getBagStatusClass(bag.status)}`}>
          {statusLabel}
        </span>
      </div>

      <div className="order-detail__items">
        {bag.order_items.map((item) => (
          <ItemRow key={item.id} item={item} currency={orderCurrency} />
        ))}
      </div>

      {bag.status === "SHIPPED" && bag.tracking_url && (
        <div className="order-detail__tracking">
          {bag.carrier && <span className="order-detail__tracking-carrier">{bag.carrier}</span>}
          <a
            href={bag.tracking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="order-detail__tracking-link"
          >
            Track Package →
          </a>
          {bag.tracking_number && (
            <span className="order-detail__tracking-number">#{bag.tracking_number}</span>
          )}
        </div>
      )}

      {/* Refund notice (REFUNDED bags only) */}
      <RefundNotice refunds={bag.order_refunds} currency={orderCurrency} />

      {bag.order_items.length > 0 && (
        <div className="order-detail__bag-footer">
          <span className="order-detail__bag-shipping-method">
            {bag.shipping_method && `Shipped via ${bag.shipping_method}`}
          </span>
          <span className="order-detail__bag-total">
            {formatPrice(bag.total, orderCurrency)}
            {bag.order_refunds.length > 0 && (
              <span className="order-detail__bag-refund-annotation">
                {` — Refund: ${formatPrice(
                  bag.order_refunds.reduce((s, r) => s + r.amount, 0),
                  orderCurrency,
                )}`}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Renders the full order detail view (header, bags, pricing breakdown).
 * Used for both single token-result and expanded orders in the email results list.
 *
 * This component uses the Supabase row shape (`OrderWithBagsAndItems` with snake_case
 * fields), unlike the confirmation page's similar component which uses Violet's
 * `OrderDetail` shape (camelCase fields).
 */
function OrderDetailContent({ order }: { order: OrderWithBagsAndItems }) {
  const bagStatuses = order.order_bags.map((b) => b.status);
  const hasMultipleBags = order.order_bags.length > 1;
  const overallStatusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;

  return (
    <div className="order-detail">
      <header className="order-detail__header">
        <div className="order-detail__header-meta">
          <h2 className="order-detail__id">Order #{order.id.slice(0, 8).toUpperCase()}</h2>
          <time className="order-detail__date" dateTime={order.created_at}>
            {formatDate(order.created_at, "long")}
          </time>
        </div>
        <div className="order-detail__header-status">
          <span className="order-detail__overall-status">{overallStatusLabel}</span>
        </div>
      </header>

      {hasMultipleBags && new Set(bagStatuses).size > 1 && (
        <div className="order-detail__bag-summary">
          {getBagStatusSummary(bagStatuses, "SHIPPED")}
        </div>
      )}

      {order.order_bags.map((bag) => (
        <BagCard key={bag.id} bag={bag} orderCurrency={order.currency} />
      ))}

      <div className="order-detail__pricing">
        <div className="order-detail__section-title">Order Summary</div>
        <div className="order-detail__pricing-row">
          <span>Subtotal</span>
          <span>{formatPrice(order.subtotal, order.currency)}</span>
        </div>
        <div className="order-detail__pricing-row">
          <span>Shipping</span>
          <span>{formatPrice(order.shipping_total, order.currency)}</span>
        </div>
        <div className="order-detail__pricing-row">
          <span>Tax</span>
          <span>{formatPrice(order.tax_total, order.currency)}</span>
        </div>
        <div className="order-detail__pricing-row order-detail__pricing-row--total">
          <span>Total</span>
          <span>{formatPrice(order.total, order.currency)}</span>
        </div>
      </div>
    </div>
  );
}

function TokenLookupSkeleton() {
  return (
    <div className="order-lookup__skeleton" aria-label="Loading order" aria-busy="true">
      <div className="orders__card orders__card--skeleton" aria-hidden="true">
        <div className="orders__skeleton-line orders__skeleton-line--wide" />
        <div className="orders__skeleton-line orders__skeleton-line--narrow" />
        <div className="orders__skeleton-line orders__skeleton-line--medium" />
      </div>
    </div>
  );
}

// ─── Page Component ────────────────────────────────────────────────────────────

function LookupPage() {
  const { token } = Route.useSearch();

  const [currentStep, setCurrentStep] = useState<LookupStep>({ step: "email" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);

  /**
   * Token auto-lookup on mount.
   * If the URL contains a `?token=...` search param, automatically submit it
   * to the server for hash-based lookup. This fires once on mount (token is stable).
   * On success, transitions to "token-result" step. On failure, shows error and
   * falls back to the email form so the guest can try an alternative lookup method.
   */
  useEffect(() => {
    if (!token) return;

    setIsLoading(true);
    setError("");

    lookupOrderByTokenFn({ data: { token } })
      .then((order) => {
        if (order) {
          setCurrentStep({ step: "token-result", order });
        } else {
          setError("Order not found. Your token may have expired or been mistyped.");
        }
      })
      .catch(() => {
        setError("Unable to look up order. Please try again.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  // Convex Auth actions for guest OTP (reuses reset flow — see DESIGN NOTE above)
  const { signIn } = useAuthActions();

  /**
   * Handles email form submission — sends a 6-digit OTP via Convex Auth reset flow.
   *
   * Reuses `signIn("password", { flow: "reset", email })` to send an OTP via Resend.
   * The ResendOTP provider sends the email regardless of account existence.
   * Handles rate limiting (429) by disabling the submit button.
   *
   * DESIGN NOTE: Same pattern as mobile `order/lookup.tsx`. The `flow: "reset"` is
   * intentionally reused for guest OTP — it does NOT require an existing account.
   *
   * @param e - Form submit event. Email is read from the named input element.
   */
  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    try {
      // Convex Auth reset flow — sends OTP via Resend (works for non-registered emails)
      await signIn("password", { flow: "reset", email });
      setCurrentStep({ step: "verify", email });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("too many") ||
        message.toLowerCase().includes("429");
      if (isRateLimit) {
        setIsRateLimited(true);
        setError("Too many requests. Please wait before trying again.");
      } else {
        setError("Unable to send verification code. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Handles OTP verification — verifies the 6-digit code and fetches orders.
   *
   * Uses Convex Auth `signIn("password", { flow: "reset-verification", email, code })`
   * to verify the OTP. If successful, fetches orders via server function.
   * No session cleanup needed — the reset-verification flow doesn't create a
   * persistent session (unlike the old Supabase OTP flow).
   *
   * @param e - Form submit event. OTP is read from the named input element.
   */
  async function handleOtpSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = e.currentTarget;
    const otp = (form.elements.namedItem("otp") as HTMLInputElement).value.trim();
    const email = currentStep.step === "verify" ? currentStep.email : "";

    if (!otp || otp.length !== 6) {
      setError("Please enter the 6-digit code from your email.");
      return;
    }

    setIsLoading(true);
    try {
      // Verify OTP via Convex Auth reset-verification flow
      await signIn("password", { flow: "reset-verification", email, code: otp });

      // OTP verified — fetch orders by email
      const orders = await lookupOrdersByEmailFn();
      setCurrentStep({ step: "results", orders });
    } catch {
      setError("Invalid or expired code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Token auto-lookup loading skeleton
  if (isLoading && token && currentStep.step === "email") {
    return (
      <section className="page-wrap">
        <div className="order-lookup">
          <h1 className="order-lookup__title">Track Your Order</h1>
          <TokenLookupSkeleton />
        </div>
      </section>
    );
  }

  // Token result view
  if (currentStep.step === "token-result") {
    return (
      <section className="page-wrap">
        <div className="order-lookup">
          <h1 className="order-lookup__title">Track Your Order</h1>
          <OrderDetailContent order={currentStep.order} />
        </div>
      </section>
    );
  }

  // Results view (email-verified order list)
  if (currentStep.step === "results") {
    const { orders } = currentStep;

    return (
      <section className="page-wrap">
        <div className="order-lookup">
          <h1 className="order-lookup__title">Track Your Order</h1>
          <div className="order-lookup__results-header">Your Orders</div>

          {orders.length === 0 ? (
            <div className="order-lookup__empty">
              No orders found for this email. Check the address or contact support.
            </div>
          ) : (
            <div className="orders__list">
              {orders.map((order) => {
                const statusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;
                const merchantText =
                  order.order_bags.length === 1
                    ? "1 merchant"
                    : `${order.order_bags.length} merchants`;
                const isExpanded = expandedOrderId === order.id;

                return (
                  <div key={order.id}>
                    <button
                      type="button"
                      className="orders__card"
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      aria-expanded={isExpanded}
                    >
                      <div className="orders__card-header">
                        <span className="orders__card-date">
                          {formatDate(order.created_at, "short")}
                        </span>
                        <span className={`orders__status-badge ${getStatusClass(order.status)}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="orders__card-meta">
                        <span className="orders__card-id">
                          Order #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="orders__card-merchants">{merchantText}</span>
                      </div>
                      <div className="orders__card-total">
                        {formatPrice(order.total, order.currency)}
                      </div>
                    </button>

                    {isExpanded && <OrderDetailContent order={order} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    );
  }

  // OTP verify step
  if (currentStep.step === "verify") {
    return (
      <section className="page-wrap">
        <div className="order-lookup">
          <h1 className="order-lookup__title">Track Your Order</h1>
          <p className="order-lookup__subtitle">
            <span className="order-lookup__step-indicator">Step 2 of 2</span>
          </p>
          <p className="order-lookup__email-note">
            We sent a 6-digit code to <strong>{currentStep.email}</strong>
          </p>

          <form className="order-lookup__form" onSubmit={handleOtpSubmit} noValidate>
            {error && <div className="order-lookup__error">{error}</div>}

            <div className="auth-form__field">
              <label className="auth-form__label" htmlFor="lookup-otp">
                Verification Code
              </label>
              <input
                id="lookup-otp"
                name="otp"
                className="auth-form__input auth-form__input--otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
              />
            </div>

            <button type="submit" className="auth-form__submit" disabled={isLoading}>
              {isLoading ? "Verifying…" : "Verify & View Orders"}
            </button>

            <button
              type="button"
              className="order-lookup__back-link"
              onClick={() => {
                setCurrentStep({ step: "email" });
                setError("");
              }}
            >
              ← Use a different email
            </button>
          </form>
        </div>
      </section>
    );
  }

  // Email step (default)
  return (
    <section className="page-wrap">
      <div className="order-lookup">
        <h1 className="order-lookup__title">Track Your Order</h1>
        <p className="order-lookup__subtitle">
          Enter your email to receive a verification code and view your orders.
        </p>

        {/* Token-not-found error shown above the email form */}
        {error && token && <div className="order-lookup__error">{error}</div>}

        <form className="order-lookup__form" onSubmit={handleEmailSubmit} noValidate>
          {error && !token && <div className="order-lookup__error">{error}</div>}

          <div className="auth-form__field">
            <label className="auth-form__label" htmlFor="lookup-email">
              Email Address
            </label>
            <input
              id="lookup-email"
              name="email"
              className="auth-form__input"
              type="email"
              autoComplete="email"
              autoFocus
              disabled={isLoading}
            />
          </div>

          <button type="submit" className="auth-form__submit" disabled={isLoading || isRateLimited}>
            {isLoading ? "Sending code…" : "Send Verification Code"}
          </button>
        </form>
      </div>
    </section>
  );
}
