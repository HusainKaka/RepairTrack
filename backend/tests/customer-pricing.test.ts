import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ repair: { findUnique: vi.fn() }, digitalTicket: { findFirst: vi.fn() } }));
vi.mock("../src/lib/prisma.js", () => ({ prisma: mocks }));
vi.mock("../src/lib/business-logo.js", () => ({ getBusinessLogoDataUrl: vi.fn().mockResolvedValue(null) }));
import { errorHandler } from "../src/middleware/error-handler.js";
import { repairRouter } from "../src/modules/repairs/repair.routes.js";
import { digitalRouter } from "../src/modules/digital-services/digital.routes.js";
const app = express(); app.use("/repairs", repairRouter); app.use("/digital", digitalRouter); app.use(errorHandler);
const invoice = { number: "INV-1", status: "ISSUED", paymentStatus: "UNPAID", subtotal: "2000", discountAmount: "300", invoiceLevelDiscount: "200", taxAmount: "0", amountPaid: "0", total: "1700", balance: "1700", items: [{ description: "Charging port", quantity: "1", unitPrice: "2000", discount: "100", taxRate: "0", lineTotal: "1900" }] };
const record = { reference: "TEST-1", status: "IN_PROGRESS", kind: "WEBSITE", customer: { fullName: "Example Customer" }, device: { type: "Laptop", brand: "Example", model: "Model" }, business: { id: "business-id", name: "Workshop", currency: "KES" }, invoices: [invoice], customerResponses: [], statusHistory: [], notes: [], deletedAt: null, internalNotes: "PRIVATE WORKSHOP NOTE" };
beforeEach(() => vi.resetAllMocks());
describe("public customer pricing contracts", () => {
  it.each([false, true])("returns pricing and selects only customer-safe invoice data (digital=%s)", async digital => {
    const lookup = digital ? mocks.digitalTicket.findFirst : mocks.repair.findUnique;
    lookup.mockResolvedValue(record);
    const response = await request(app).get(`/${digital ? "digital" : "repairs"}/track/${"x".repeat(43)}`).expect(200);
    expect(response.body.data.invoices[0]).toEqual(invoice);
    expect(JSON.stringify(response.body)).not.toContain("PRIVATE WORKSHOP NOTE");
    const query = lookup.mock.calls[0]![0];
    const select = (digital ? query.select : query.include).invoices.select;
    expect(select).toMatchObject({ subtotal: true, discountAmount: true, invoiceLevelDiscount: true, taxAmount: true, amountPaid: true });
    expect(Object.keys(select.items.select).sort()).toEqual(["description", "discount", "itemType", "lineTotal", "quantity", "taxRate", "unitPrice"]);
    expect(select).not.toHaveProperty("notes");
    expect(select.items.select).not.toHaveProperty("historicalUnitCost");
    expect(select.items.select).not.toHaveProperty("inventoryItemId");
  });
});
