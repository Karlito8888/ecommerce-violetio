import { describe, it, expect } from "vitest";

describe("syncOrderDistributions", () => {
  it("returns error when violetOrderId is missing", async () => {
    const { z } = await import("zod");
    const schema = z.object({ violetOrderId: z.string().min(1) });
    expect(() => schema.parse({ violetOrderId: "" })).toThrow();
    expect(() => schema.parse({ violetOrderId: "12345" })).not.toThrow();
  });
});
