import { describe, expect, it } from "vitest";
import {
  deriveOrderStatusFromBags,
  getBagStatusSummary,
  BAG_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from "../orderStatusDerivation";

describe("deriveOrderStatusFromBags", () => {
  it("returns PROCESSING for empty bags", () => {
    expect(deriveOrderStatusFromBags([])).toBe("PROCESSING");
  });

  it("returns the status when all bags have the same status", () => {
    expect(deriveOrderStatusFromBags(["SHIPPED", "SHIPPED", "SHIPPED"])).toBe("SHIPPED");
    expect(deriveOrderStatusFromBags(["COMPLETED", "COMPLETED"])).toBe("COMPLETED");
    expect(deriveOrderStatusFromBags(["CANCELED", "CANCELED", "CANCELED"])).toBe("CANCELED");
    expect(deriveOrderStatusFromBags(["ACCEPTED"])).toBe("ACCEPTED");
  });

  it("returns single bag status directly", () => {
    expect(deriveOrderStatusFromBags(["SHIPPED"])).toBe("SHIPPED");
    expect(deriveOrderStatusFromBags(["IN_PROGRESS"])).toBe("IN_PROGRESS");
  });

  it("returns PARTIALLY_SHIPPED when mixed with SHIPPED", () => {
    expect(deriveOrderStatusFromBags(["SHIPPED", "ACCEPTED", "ACCEPTED"])).toBe(
      "PARTIALLY_SHIPPED",
    );
    expect(deriveOrderStatusFromBags(["SHIPPED", "IN_PROGRESS"])).toBe("PARTIALLY_SHIPPED");
  });

  it("returns PARTIALLY_COMPLETED when mixed with COMPLETED", () => {
    expect(deriveOrderStatusFromBags(["COMPLETED", "COMPLETED", "SHIPPED"])).toBe(
      "PARTIALLY_COMPLETED",
    );
    expect(deriveOrderStatusFromBags(["COMPLETED", "ACCEPTED"])).toBe("PARTIALLY_COMPLETED");
  });

  it("does not conflate CANCELED and REFUNDED", () => {
    // Mixed terminal states → PROCESSING (neither PARTIALLY_SHIPPED nor PARTIALLY_COMPLETED)
    expect(deriveOrderStatusFromBags(["CANCELED", "REFUNDED", "COMPLETED"])).toBe(
      "PARTIALLY_COMPLETED",
    );
    expect(deriveOrderStatusFromBags(["CANCELED", "REFUNDED"])).toBe("PROCESSING");
  });

  it("returns PROCESSING for other mixed states", () => {
    expect(deriveOrderStatusFromBags(["ACCEPTED", "IN_PROGRESS"])).toBe("PROCESSING");
    expect(deriveOrderStatusFromBags(["SUBMITTED", "ACCEPTED"])).toBe("PROCESSING");
  });

  it("returns SUBMITTED when all bags are SUBMITTED", () => {
    expect(deriveOrderStatusFromBags(["SUBMITTED", "SUBMITTED"])).toBe("SUBMITTED");
  });

  it("returns PARTIALLY_REFUNDED when all bags are PARTIALLY_REFUNDED", () => {
    expect(deriveOrderStatusFromBags(["PARTIALLY_REFUNDED", "PARTIALLY_REFUNDED"])).toBe(
      "PARTIALLY_REFUNDED",
    );
  });

  it("returns REJECTED when all bags are REJECTED", () => {
    expect(deriveOrderStatusFromBags(["REJECTED", "REJECTED"])).toBe("REJECTED");
  });
});

describe("getBagStatusSummary", () => {
  it("returns correct summary for shipped bags", () => {
    expect(getBagStatusSummary(["SHIPPED", "ACCEPTED", "ACCEPTED"], "SHIPPED")).toBe(
      "1 of 3 packages shipped",
    );
  });

  it("returns correct summary for completed bags", () => {
    expect(getBagStatusSummary(["COMPLETED", "COMPLETED", "SHIPPED"], "COMPLETED")).toBe(
      "2 of 3 packages delivered",
    );
  });

  it("handles single bag", () => {
    expect(getBagStatusSummary(["SHIPPED"], "SHIPPED")).toBe("1 of 1 packages shipped");
  });

  it("handles unknown status gracefully", () => {
    expect(getBagStatusSummary(["UNKNOWN_STATUS"], "UNKNOWN_STATUS")).toBe(
      "1 of 1 packages unknown_status",
    );
  });
});

describe("BAG_STATUS_LABELS", () => {
  it("maps all known BagStatus values", () => {
    const expectedKeys = [
      "IN_PROGRESS",
      "SUBMITTED",
      "ACCEPTED",
      "SHIPPED",
      "COMPLETED",
      "CANCELED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
      "REJECTED",
    ];
    for (const key of expectedKeys) {
      expect(BAG_STATUS_LABELS[key]).toBeDefined();
      expect(typeof BAG_STATUS_LABELS[key]).toBe("string");
    }
  });

  it("returns user-friendly labels", () => {
    expect(BAG_STATUS_LABELS["SHIPPED"]).toBe("Shipped");
    expect(BAG_STATUS_LABELS["COMPLETED"]).toBe("Delivered");
    expect(BAG_STATUS_LABELS["SUBMITTED"]).toBe("Processing");
  });
});

describe("ORDER_STATUS_LABELS", () => {
  it("maps all known statuses including derived ones", () => {
    const expectedKeys = [
      "IN_PROGRESS",
      "PROCESSING",
      "SUBMITTED",
      "ACCEPTED",
      "SHIPPED",
      "COMPLETED",
      "CANCELED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
      "REJECTED",
      "PARTIALLY_SHIPPED",
      "PARTIALLY_COMPLETED",
    ];
    for (const key of expectedKeys) {
      expect(ORDER_STATUS_LABELS[key]).toBeDefined();
      expect(typeof ORDER_STATUS_LABELS[key]).toBe("string");
    }
  });

  it("returns user-friendly labels for derived statuses", () => {
    expect(ORDER_STATUS_LABELS["PARTIALLY_SHIPPED"]).toBe("Partially Shipped");
    expect(ORDER_STATUS_LABELS["PARTIALLY_COMPLETED"]).toBe("Partially Delivered");
  });
});
