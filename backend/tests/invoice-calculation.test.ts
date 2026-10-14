import { describe, expect, it } from "vitest";
import { calculateInvoice } from "../src/modules/invoices/invoice-calculation.js";

describe("invoice calculation", () => {
  it("taxes the discounted line base, matching the manual invoice preview", () => {
    expect(calculateInvoice([{ quantity: 1, unitPrice: 1000, taxRate: 16, discount: 100 }]).total).toBe(1044);
  });
  it("returns a validation error for non-finite and database-overflowing monetary values", () => {
    for (const price of [NaN, Infinity, 1e90, 10_000_000_000, 3.333]) {
      expect(() => calculateInvoice([{ quantity: 1, unitPrice: price }])).toThrow(expect.objectContaining({ status: 422 }));
    }
    expect(() => calculateInvoice([{ quantity: 10_000, unitPrice: 9_999_999_999 }])).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => calculateInvoice([{ quantity: 1, unitPrice: 100 }], 101)).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => calculateInvoice([{ quantity: 10_001, unitPrice: 1 }])).toThrow(expect.objectContaining({ status: 422 }));
  });
  it("calculates quantities, tax, line discounts, and invoice discounts in cents", () => {
    const result = calculateInvoice([
      { quantity: 2, unitPrice: 1000, taxRate: 16, discount: 100 },
      { quantity: 1, unitPrice: 500, taxRate: 0 }
    ], 50);
    expect(result).toEqual({
      lines: [
        { quantity: 2, unitPrice: 1000, taxRate: 16, discount: 100, taxAmount: 304, lineTotal: 2204 },
        { quantity: 1, unitPrice: 500, taxRate: 0, discount: 0, taxAmount: 0, lineTotal: 500 }
      ],
      subtotal: 2500,
      taxAmount: 304,
      discountAmount: 150,
      total: 2654
    });
  });

  it("rejects negative values and discounts exceeding a line", () => {
    expect(() => calculateInvoice([{ quantity: 1, unitPrice: -1 }])).toThrow();
    expect(() => calculateInvoice([{ quantity: 1, unitPrice: 100, discount: 101 }])).toThrow();
  });

  it("avoids common floating point currency drift", () => {
    expect(calculateInvoice([{ quantity: 3, unitPrice: 0.1 }]).total).toBe(0.3);
  });
});

