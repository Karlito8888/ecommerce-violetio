/**
 * Lightweight toast notification system (Story 6.4 — Code Review Fix H2).
 *
 * ## Why a custom implementation instead of Sonner/react-hot-toast?
 * The project's CSS architecture (Vanilla CSS + BEM, no Tailwind) and the
 * "no external UI library" constraint make a thin custom toast preferable.
 * This weighs ~1.5 KB vs ~8 KB for Sonner, and uses the project's own
 * design tokens for visual consistency.
 *
 * ## Architecture
 * - `ToastProvider` wraps the app (mounted in `__root.tsx`)
 * - `useToast()` hook exposes `toast.success()` / `toast.error()` anywhere
 * - Toasts auto-dismiss after 4 seconds (UX spec requirement)
 * - Accessible: uses `role="status"` + `aria-live="polite"` for screen readers
 *
 * ## Usage
 * ```tsx
 * const toast = useToast();
 * toast.success("Added to wishlist");
 * toast.error("Something went wrong");
 * ```
 */

import { createContext, useCallback, useContext, useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error";
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Auto-dismiss delay in ms — matches UX spec ("auto-dismiss after 4 seconds"). */
const TOAST_DURATION = 4000;

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, type: "success" | "error") => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timer = setTimeout(() => dismiss(id), TOAST_DURATION);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const success = useCallback((message: string) => show(message, "success"), [show]);
  const error = useCallback((message: string) => show(message, "error"), [show]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ success, error }}>
      {children}
      {/**
       * M9 review fix: Removed duplicate aria-live/role from individual toasts.
       *
       * BEFORE: Both the container AND each toast had `aria-live="polite"` + `role="status"`.
       * This caused screen readers to double-announce every toast message.
       *
       * NOW: Only the container has the live region attributes. New toast children
       * are automatically announced by the container's live region. Individual
       * toasts use a plain div — the container handles accessibility.
       */}
      <div className="toast-container" aria-live="polite" role="status">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            <span className="toast__icon">{toast.type === "success" ? "✓" : "✕"}</span>
            <span className="toast__message">{toast.message}</span>
            <button
              type="button"
              className="toast__dismiss"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access the toast notification system from any component.
 * Must be used within `<ToastProvider>`.
 *
 * @throws Error if used outside ToastProvider — intentional to catch misuse early.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
