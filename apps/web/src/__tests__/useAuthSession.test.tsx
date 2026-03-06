/**
 * useAuthSession hook tests.
 *
 * Mocks:
 * - @ecommerce/shared: initAnonymousSession (fire-and-forget in the hook)
 * - ../utils/supabase: getSupabaseBrowserClient (returns mock Supabase client)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockUnsubscribe = vi.fn();
const mockSession = {
  user: { id: "anon-uuid", is_anonymous: true, email: null },
  access_token: "tok",
};

let _authCb: ((e: string, s: unknown) => void) | null = null;

function buildMockSupabaseClient() {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInAnonymously: vi.fn().mockResolvedValue({ data: { session: mockSession }, error: null }),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
        _authCb = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Mocks (hoisted)
// ---------------------------------------------------------------------------

const mockClient = buildMockSupabaseClient();

vi.mock("../utils/supabase", () => ({
  getSupabaseBrowserClient: vi.fn(() => mockClient),
}));

vi.mock("@ecommerce/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecommerce/shared")>();
  return {
    ...actual,
    initAnonymousSession: vi.fn().mockResolvedValue({ session: null, isNew: false }),
  };
});

// Import AFTER vi.mock declarations (hoisted anyway)
import { useAuthSession } from "../hooks/useAuthSession";

// ---------------------------------------------------------------------------
// Minimal test utilities (react + react-dom/client from this file's Vite context)
// ---------------------------------------------------------------------------

type RenderHookResult<T> = {
  result: { readonly current: T };
  unmount: () => void;
};

function renderHook<T>(hookFn: () => T): RenderHookResult<T> {
  let _current: T;
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: ReturnType<typeof createRoot>;

  function TestComponent() {
    _current = hookFn();
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(React.createElement(TestComponent));
  });

  return {
    result: {
      get current() {
        return _current;
      },
    },
    unmount() {
      act(() => {
        root.unmount();
        container.remove();
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAuthSession hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsubscribe.mockReset();
    _authCb = null;
    // Rebuild mock client methods for clean state
    mockClient.auth.getSession = vi
      .fn()
      .mockResolvedValue({ data: { session: null }, error: null });
    mockClient.auth.onAuthStateChange = vi.fn((cb: (e: string, s: unknown) => void) => {
      _authCb = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });
  });

  afterEach(() => {
    _authCb = null;
  });

  it("starts with isLoading: true", () => {
    const { result } = renderHook(() => useAuthSession());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it("sets user after SIGNED_IN event", async () => {
    const { result } = renderHook(() => useAuthSession());

    // Fire the auth event inside act() so React processes the state update
    await act(async () => {
      _authCb?.("SIGNED_IN", mockSession);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user?.id).toBe("anon-uuid");
    expect(result.current.isAnonymous).toBe(true);
  });

  it("returns null user on SIGNED_OUT", async () => {
    const { result } = renderHook(() => useAuthSession());

    await act(async () => {
      _authCb?.("SIGNED_OUT", null);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isAnonymous).toBe(false);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useAuthSession());
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });
});
