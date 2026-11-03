import { describe, it, expect } from "vitest";
import {
  formatINR,
  formatTableCustomerLabel,
  getSafeErrorMessage,
} from "./restaurant.ts";

describe("restaurant helpers", () => {
  it("formats INR currency correctly", () => {
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(32000)).toBe("₹320.00");
    expect(formatINR(85000)).toBe("₹850.00");
  });

  describe("formatTableCustomerLabel", () => {
    it("formats single guest with customer name", () => {
      const res = formatTableCustomerLabel(1, ["Manjunath Gowda"], 1);
      expect(res.headline).toBe("Table 1 — Manjunath Gowda");
      expect(res.subtext).toBe("1 Guest");
    });

    it("formats multiple customer names with additional guest count", () => {
      const res = formatTableCustomerLabel(2, ["Manjunath Gowda", "Anita", "Rohan"], 3);
      expect(res.headline).toBe("Table 2 — Manjunath Gowda (+2 guests)");
      expect(res.subtext).toBe("3 Guests");
    });

    it("formats guest fallback when customer names are empty or omitted", () => {
      const res = formatTableCustomerLabel(3, [], 1);
      expect(res.headline).toBe("Table 3 — Guest");
      expect(res.subtext).toBe("1 Guest");
    });

    it("handles whitespace-only customer names as Guest fallback", () => {
      const res = formatTableCustomerLabel(4, ["   "], 2);
      expect(res.headline).toBe("Table 4 — Guest");
      expect(res.subtext).toBe("2 Guests");
    });

    it("formats people count when only one name provided but peopleCount > 1", () => {
      const res = formatTableCustomerLabel(5, ["Alice"], 4);
      expect(res.headline).toBe("Table 5 — Alice (+3 guests)");
      expect(res.subtext).toBe("4 Guests");
    });
  });

  describe("getSafeErrorMessage", () => {
    it("extracts message from ConvexError object", () => {
      const err = { data: { message: "Table not found." } };
      expect(getSafeErrorMessage(err, "Fallback")).toBe("Table not found.");
    });

    it("extracts message from string data", () => {
      const err = { data: "Custom string error" };
      expect(getSafeErrorMessage(err, "Fallback")).toBe("Custom string error");
    });

    it("uses fallback when err is undefined", () => {
      expect(getSafeErrorMessage(undefined, "Default error")).toBe("Default error");
    });
  });
});
