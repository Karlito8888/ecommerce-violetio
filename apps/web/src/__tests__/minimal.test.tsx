/**
 * Minimal renderHook test using react-dom/client imported directly (bypasses the
 * Bun-workspace CJS dual-instance issue where @testing-library/react loads react-dom
 * via Node.js native require, creating a separate React module instance from Vite's).
 */
import { describe, it, expect } from "vitest";
import React, { useState, act } from "react";
import { createRoot } from "react-dom/client";

function useSimpleHook() {
  const [count] = useState(0);
  return count;
}

function renderHook<T>(hookFn: () => T) {
  let _current: T;
  const container = document.createElement("div");
  document.body.appendChild(container);

  function TestComponent() {
    _current = hookFn();
    return null;
  }

  act(() => {
    createRoot(container).render(React.createElement(TestComponent));
  });

  return {
    result: {
      get current() {
        return _current;
      },
    },
  };
}

describe("minimal hook test", () => {
  it("renderHook works", () => {
    const { result } = renderHook(() => useSimpleHook());
    expect(result.current).toBe(0);
  });
});
