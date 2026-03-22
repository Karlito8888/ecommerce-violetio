import { describe, expect, it, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { ContentType } from "@ecommerce/shared";
import { LEGAL_SLUGS } from "../server/getLegalContent";
import { FOOTER_SECTIONS } from "../components/Footer";

/* ─── ContentType includes "legal" ─── */

describe("ContentType", () => {
  it('includes "legal" as a valid content type', () => {
    const legalType: ContentType = "legal";
    expect(legalType).toBe("legal");
  });

  it("accepts all expected content types", () => {
    const types: ContentType[] = ["guide", "comparison", "review", "legal"];
    expect(types).toHaveLength(4);
  });
});

/* ─── Cookie Consent Hook (using custom renderHook for Bun workspace compat) ─── */

type RenderHookResult<T> = {
  result: { readonly current: T };
  rerender: () => void;
};

function renderHook<T>(hookFn: () => T): RenderHookResult<T> {
  let _current: T;
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: ReturnType<typeof createRoot>;

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
    rerender: () => {
      act(() => {
        root.render(React.createElement(TestComponent));
      });
    },
  };
}

describe("useCookieConsent", () => {
  let getItemMock: ReturnType<typeof vi.fn>;
  let setItemMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getItemMock = vi.fn().mockReturnValue(null);
    setItemMock = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: getItemMock,
      setItem: setItemMock,
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
    vi.resetModules();
  });

  it("returns null consent and hasChosen=false when no stored value", async () => {
    const { useCookieConsent } = await import("../hooks/useCookieConsent");
    const { result } = renderHook(() => useCookieConsent());
    expect(result.current.consent).toBe(null);
    expect(result.current.hasChosen).toBe(false);
  });

  it("reads stored 'accepted' value from localStorage on mount", async () => {
    getItemMock.mockReturnValue("accepted");
    const { useCookieConsent } = await import("../hooks/useCookieConsent");
    const { result } = renderHook(() => useCookieConsent());
    // After useEffect fires, consent should be synced
    expect(result.current.consent).toBe("accepted");
    expect(result.current.hasChosen).toBe(true);
  });

  it("reads stored 'declined' value from localStorage on mount", async () => {
    getItemMock.mockReturnValue("declined");
    const { useCookieConsent } = await import("../hooks/useCookieConsent");
    const { result } = renderHook(() => useCookieConsent());
    expect(result.current.consent).toBe("declined");
    expect(result.current.hasChosen).toBe(true);
  });

  it("accept() writes 'accepted' to localStorage and updates state", async () => {
    const { useCookieConsent } = await import("../hooks/useCookieConsent");
    const { result } = renderHook(() => useCookieConsent());
    act(() => {
      result.current.accept();
    });
    expect(setItemMock).toHaveBeenCalledWith("cookie-consent", "accepted");
    expect(result.current.consent).toBe("accepted");
    expect(result.current.hasChosen).toBe(true);
  });

  it("decline() writes 'declined' to localStorage and updates state", async () => {
    const { useCookieConsent } = await import("../hooks/useCookieConsent");
    const { result } = renderHook(() => useCookieConsent());
    act(() => {
      result.current.decline();
    });
    expect(setItemMock).toHaveBeenCalledWith("cookie-consent", "declined");
    expect(result.current.consent).toBe("declined");
    expect(result.current.hasChosen).toBe(true);
  });

  it("ignores invalid stored values and treats as null", async () => {
    getItemMock.mockReturnValue("maybe");
    const { useCookieConsent } = await import("../hooks/useCookieConsent");
    const { result } = renderHook(() => useCookieConsent());
    expect(result.current.consent).toBe(null);
    expect(result.current.hasChosen).toBe(false);
  });
});

/* ─── Legal page slug validation (imported from actual source) ─── */

describe("Legal page slug validation", () => {
  it("LEGAL_SLUGS contains exactly the 3 expected slugs", () => {
    expect(LEGAL_SLUGS.size).toBe(3);
    expect(LEGAL_SLUGS.has("privacy")).toBe(true);
    expect(LEGAL_SLUGS.has("terms")).toBe(true);
    expect(LEGAL_SLUGS.has("cookies")).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(LEGAL_SLUGS.has("best-running-shoes-2026")).toBe(false);
    expect(LEGAL_SLUGS.has("about")).toBe(false);
    expect(LEGAL_SLUGS.has("")).toBe(false);
  });

  it("rejects editorial content type slugs", () => {
    expect(LEGAL_SLUGS.has("guide")).toBe(false);
    expect(LEGAL_SLUGS.has("comparison")).toBe(false);
    expect(LEGAL_SLUGS.has("review")).toBe(false);
  });
});

/* ─── Footer links (imported from actual Footer component) ─── */

describe("Footer legal links", () => {
  const legalSection = FOOTER_SECTIONS.find((s) => s.heading === "Legal");

  it("Footer contains a Legal section", () => {
    expect(legalSection).toBeDefined();
  });

  it("Legal section has 3 links with correct routes", () => {
    expect(legalSection!.links).toHaveLength(3);
    expect(legalSection!.links[0].to).toBe("/legal/privacy");
    expect(legalSection!.links[1].to).toBe("/legal/terms");
    expect(legalSection!.links[2].to).toBe("/legal/cookies");
  });

  it("Legal section links have human-readable labels", () => {
    for (const link of legalSection!.links) {
      expect(link.label.length).toBeGreaterThan(0);
    }
  });

  it("Support section links point to actual routes", () => {
    const supportSection = FOOTER_SECTIONS.find((s) => s.heading === "Support");
    expect(supportSection).toBeDefined();
    expect(supportSection!.links[0].to).toBe("/help");
    expect(supportSection!.links[1].to).toBe("/help/contact");
  });
});
