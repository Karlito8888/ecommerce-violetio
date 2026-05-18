/**
 * @module AdminErrorBoundary
 *
 * React Error Boundary for admin pages.
 *
 * When a Convex query throws (e.g. assertAdmin fails because user is not admin),
 * useQuery throws a React error that crashes the component tree.
 * This boundary catches those errors and shows a graceful fallback.
 *
 * Convex useQuery behavior:
 *   - Returns `undefined` while loading
 *   - Returns data on success
 *   - Throws on error (assertAdmin failure, network error, etc.)
 *   - NEVER returns an Error object (instanceof Error is dead code)
 *
 * Doc: https://docs.convex.dev/client/react — "Experimental: query result object"
 * Alternative: useQuery_experimental returns { status: "error", error } without throwing.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AdminErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[AdminErrorBoundary] Unhandled error in admin page:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message ?? "";
      const isAuthError =
        msg.includes("Not authenticated") || msg.includes("Admin access required");

      return (
        <div className="page-wrap">
          <p>
            {isAuthError ? "Access denied. Admin role required." : "An unexpected error occurred."}
          </p>
          <Link to="/">Back to home</Link>
        </div>
      );
    }
    return this.props.children;
  }
}
