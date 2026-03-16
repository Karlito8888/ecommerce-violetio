/**
 * CheckoutErrorBoundary — React error boundary wrapping the checkout route.
 *
 * Catches unhandled errors in the checkout render tree. Shows a friendly
 * fallback UI with options to retry or go to cart.
 *
 * Must be a class component — React Error Boundaries require componentDidCatch.
 *
 * ## Error logging (Story 4.7 Code Review Fix — C1)
 * `componentDidCatch` logs errors to the `error_logs` table via `logClientErrorFn`,
 * a Server Function that bridges client → server-side Supabase service-role client.
 * This ensures unhandled checkout errors are persisted for admin dashboard (Story 8.5)
 * and debugging — not just visible in the browser console.
 *
 * The logging call is fire-and-forget: it never blocks the fallback UI rendering,
 * and failures in logging are silently handled by `logError()` on the server side.
 *
 * @see Story 4.7 AC#2 — recovery from unexpected states
 * @see Story 4.7 AC#4 — all errors logged to error_logs table
 * @see apps/web/src/server/checkout.ts — logClientErrorFn Server Function
 */

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { logClientErrorFn } from "../../server/checkout";

interface Props {
  children: ReactNode;
  onNavigateToCart?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CheckoutErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[CheckoutErrorBoundary] Unhandled checkout error:", error, info.componentStack);

    /**
     * Persist to error_logs via Server Function (fire-and-forget).
     *
     * ## Why fire-and-forget (no await)
     * componentDidCatch is synchronous — we can't await here. The Server Function
     * call returns a Promise that resolves independently. If the logging fails,
     * the console.error above still captures the error for dev debugging.
     */
    logClientErrorFn({
      data: {
        error_type: "CHECKOUT.UNHANDLED_ERROR",
        message: error.message,
        stack_trace: error.stack,
        context: { componentStack: info.componentStack ?? undefined },
      },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-wrap">
          <div className="checkout">
            <div className="checkout-error checkout-error--boundary" role="alert">
              <h2 className="checkout-error__title">Something unexpected happened</h2>
              <p className="checkout-error__message">
                Your cart is saved. You can try again or return to your cart.
              </p>
              <div className="checkout-error__actions">
                <button
                  type="button"
                  className="checkout-error__action checkout-error__action--primary"
                  onClick={this.handleRetry}
                >
                  Try Again
                </button>
                {this.props.onNavigateToCart && (
                  <button
                    type="button"
                    className="checkout-error__action checkout-error__action--secondary"
                    onClick={this.props.onNavigateToCart}
                  >
                    Go to Cart
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
