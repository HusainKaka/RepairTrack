import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DigitalServiceKind, DigitalTicketStatus, InvoiceItemType } from "../src/generated/prisma/index.js";

const mocks = vi.hoisted(() => ({
  session: { findFirst: vi.fn(), updateMany: vi.fn() },
  digitalTicket: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findFirstOrThrow: vi.fn() },
  digitalStatusHistory: { create: vi.fn() }, digitalNote: { create: vi.fn() },
  customer: { findFirst: vi.fn(), create: vi.fn() }, user: { findFirst: vi.fn() },
  business: { findUniqueOrThrow: vi.fn() }, invoice: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  invoiceItem: { findFirst: vi.fn(), count: vi.fn(), delete: vi.fn() }, inventoryTransaction: { create: vi.fn() },
  inventoryItem: { findFirst: vi.fn() }, sequenceCounter: { upsert: vi.fn() }, auditLog: { create: vi.fn() },
  $transaction: vi.fn(), notifyCreated: vi.fn(), notifyStatus: vi.fn(), getLogo: vi.fn(),
}));

vi.mock("../src/lib/prisma.js", () => ({ prisma: mocks }));
vi.mock("../src/lib/business-logo.js", () => ({ getBusinessLogoDataUrl: mocks.getLogo }));
vi.mock("../src/modules/notifications/notification.service.js", () => ({ notifyDigitalTicketCreated: mocks.notifyCreated, notifyDigitalTicketStatus: mocks.notifyStatus, notifyInvoiceEvent: vi.fn() }));

import { errorHandler } from "../src/middleware/error-handler.js";
import { digitalRouter, digitalIntakeSchema } from "../src/modules/digital-services/digital.routes.js";
import { canDigitalTransition, digitalAccessRestriction, digitalReferencePrefix, digitalTicketView } from "../src/modules/digital-services/digital-policy.js";
import { invoiceRouter } from "../src/modules/invoices/invoice.routes.js";
import { digitalInvoiceItemAllowed, invoiceDisplayView } from "../src/modules/invoices/invoice-policy.js";
import { recalculateInvoice } from "../src/modules/invoices/invoice.service.js";

const app = express(); app.use(express.json()); app.use("/digital", digitalRouter); app.use("/invoices", invoiceRouter); app.use(errorHandler);
const businessId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const ticketId = "44444444-4444-4444-8444-444444444444";
const customerId = "55555555-5555-4555-8555-555555555555";
const assigneeId = "66666666-6666-4666-8666-666666666666";
const token = (role = "BUSINESS_ADMIN") => {
  mocks.session.findFirst.mockResolvedValue({ id: sessionId, user: { id: userId, businessId, status: "ACTIVE", deletedAt: null, role: { code: role }, business: { status: "ACTIVE", deletedAt: null } } });
  return jwt.sign({ sid: sessionId, role, businessId, type: "access" }, process.env.JWT_SECRET!, { subject: userId, issuer: "repairtrack-api", audience: "repairtrack-clients", expiresIn: "5m" });
};
const input = { kind: "WEBSITE", customerId, title: "Business website", requirements: "Build an accessible business website" };
const ticket = () => ({ id: ticketId, businessId, customerId, kind: "WEBSITE", reference: "WEB-2026-000001", title: input.title, requirements: input.requirements, status: "INTAKE", publicTrackingTokenHash: "private-hash", publicTrackingTokenEncrypted: "private-encrypted", internalNotes: "internal-only" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.$transaction.mockImplementation(async (callback: any) => callback(mocks));
  mocks.customer.findFirst.mockResolvedValue({ id: customerId });
  mocks.customer.create.mockResolvedValue({ id: customerId });
  mocks.digitalTicket.create.mockResolvedValue(ticket());
  mocks.digitalTicket.updateMany.mockResolvedValue({ count: 1 });
  mocks.digitalTicket.findFirstOrThrow.mockResolvedValue(ticket());
  mocks.sequenceCounter.upsert.mockResolvedValue({ value: 1 });
  mocks.business.findUniqueOrThrow.mockResolvedValue({ defaultLabourCharge: 1500, taxRate: 16, allowInvoicePriceOverride: true });
  mocks.getLogo.mockResolvedValue(null);
  mocks.notifyCreated.mockResolvedValue(undefined); mocks.notifyStatus.mockResolvedValue(undefined);
});

describe("digital workflow policies", () => {
  it("provides separate ticket prefixes and valid sequential stages", () => {
    expect(digitalReferencePrefix[DigitalServiceKind.WEBSITE]).toBe("WEB");
    expect(digitalReferencePrefix[DigitalServiceKind.SOFTWARE]).toBe("SW");
    expect(digitalReferencePrefix[DigitalServiceKind.AI_AGENT]).toBe("AI");
    expect(canDigitalTransition(DigitalTicketStatus.INTAKE, DigitalTicketStatus.DISCOVERY)).toBe(true);
    expect(canDigitalTransition(DigitalTicketStatus.INTAKE, DigitalTicketStatus.DELIVERED)).toBe(false);
    for (const status of Object.values(DigitalTicketStatus)) {
      expect(canDigitalTransition(DigitalTicketStatus.DELIVERED, status)).toBe(false);
      expect(canDigitalTransition(DigitalTicketStatus.CANCELLED, status)).toBe(false);
    }
  });
  it("redacts reusable tokens for every role and internal notes for customers", () => {
    expect(digitalTicketView(ticket())).not.toHaveProperty("publicTrackingTokenHash");
    expect(digitalTicketView(ticket())).not.toHaveProperty("publicTrackingTokenEncrypted");
    expect(digitalTicketView([ticket()], true)).toEqual([expect.objectContaining({ id: ticketId })]);
    expect(digitalTicketView(ticket(), true)).not.toHaveProperty("internalNotes");
    expect(digitalAccessRestriction("CUSTOMER", userId)).toEqual({ customer: { userId, deletedAt: null } });
    expect(digitalAccessRestriction("TECHNICIAN", userId)).toEqual({ assignedTechnicianId: userId });
  });
  it("requires exactly one customer source and rejects privileged mass-assignment fields", () => {
    expect(digitalIntakeSchema.safeParse(input).success).toBe(true);
    expect(digitalIntakeSchema.safeParse({ ...input, customerId: undefined }).success).toBe(false);
    expect(digitalIntakeSchema.safeParse({ ...input, status: "DELIVERED" }).success).toBe(false);
    expect(digitalIntakeSchema.safeParse({ ...input, newCustomer: { fullName: "Client", phone: "+254700000000" } }).success).toBe(false);
    expect(digitalIntakeSchema.safeParse({ ...input, requirements: "x".repeat(10_001) }).success).toBe(false);
  });
  it("accepts manual service/custom items but never inventory or automatic labour", () => {
    expect(digitalInvoiceItemAllowed({ itemType: InvoiceItemType.SERVICE })).toBe(true);
    expect(digitalInvoiceItemAllowed({ itemType: InvoiceItemType.CUSTOM })).toBe(true);
    expect(digitalInvoiceItemAllowed({ itemType: InvoiceItemType.LABOUR })).toBe(false);
    expect(digitalInvoiceItemAllowed({ itemType: InvoiceItemType.SERVICE, inventoryItemId: assigneeId })).toBe(false);
  });
  it("removes KRA identifiers from invoice DTOs until explicitly enabled", () => {
    const value = { business: { taxPin: "private-pin", taxSettings: { etimsEnabled: false } }, customer: { kraPin: "private-pin" }, kraStatus: "NOT_REQUIRED", kraReference: "legacy-reference" };
    expect(JSON.stringify(invoiceDisplayView(value))).not.toContain("private-pin");
    expect(invoiceDisplayView(value)).not.toHaveProperty("kraStatus");
    expect(invoiceDisplayView({ ...value, business: { ...value.business, taxSettings: { etimsEnabled: true } } })).toHaveProperty("kraStatus", "NOT_REQUIRED");
  });
});

describe("digital ticket API boundaries", () => {
  it("requires authentication and administrator intake permissions", async () => {
    await request(app).get("/digital").expect(401);
    await request(app).post("/digital").set("authorization", `Bearer ${token("CUSTOMER")}`).send(input).expect(403);
    expect(mocks.digitalTicket.create).not.toHaveBeenCalled();
  });
  it("creates digital intake without devices, default invoices, or public token leakage", async () => {
    const response = await request(app).post("/digital").set("authorization", `Bearer ${token()}`).send(input).expect(201);
    expect(response.body.trackingUrl).toMatch(/\/track\/digital\/[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(response.body)).not.toContain("private-hash");
    expect(JSON.stringify(response.body)).not.toContain("private-encrypted");
    expect(mocks.invoice.create).not.toHaveBeenCalled();
    expect(mocks.notifyCreated).toHaveBeenCalledWith(ticketId, response.body.trackingUrl);
    expect(mocks.digitalTicket.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ businessId, customerId, kind: "WEBSITE", statusHistory: expect.any(Object), publicTrackingTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
  });
  it("rejects cross-tenant customers and assignees before ticket creation", async () => {
    mocks.customer.findFirst.mockResolvedValue(null);
    await request(app).post("/digital").set("authorization", `Bearer ${token()}`).send(input).expect(404);
    expect(mocks.digitalTicket.create).not.toHaveBeenCalled();
    mocks.customer.findFirst.mockResolvedValue({ id: customerId });
    mocks.user.findFirst.mockResolvedValue(null);
    await request(app).post("/digital").set("authorization", `Bearer ${token()}`).send({ ...input, assignedTechnicianId: assigneeId }).expect(404);
    expect(mocks.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId, id: assigneeId, status: "ACTIVE" }) }));
  });
  it("scopes customer lists and technician details to the current account", async () => {
    mocks.digitalTicket.findMany.mockResolvedValue([ticket()]);
    const result = await request(app).get("/digital?kind=WEBSITE").set("authorization", `Bearer ${token("CUSTOMER")}`).expect(200);
    expect(mocks.digitalTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId, customer: { userId, deletedAt: null } }) }));
    expect(result.body.data[0]).not.toHaveProperty("internalNotes");
    mocks.digitalTicket.findFirst.mockResolvedValue(null);
    await request(app).get(`/digital/${ticketId}`).set("authorization", `Bearer ${token("TECHNICIAN")}`).expect(404);
    expect(mocks.digitalTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId, assignedTechnicianId: userId }) }));
  });
  it("publishes a minimal bearer-tracking view, excluding internal and identity details", async () => {
    mocks.digitalTicket.findFirst.mockResolvedValue({ reference: "WEB-2026-000001", kind: "WEBSITE", title: input.title, status: "INTAKE", createdAt: new Date(), business: { id: businessId, name: "Business", phone: "0700000000", email: "hello@example.test", currency: "KES" }, statusHistory: [], notes: [], invoices: [], internalNotes: "not-public", customer: { email: "secret@example.test" }, publicTrackingTokenHash: "not-public" });
    const response = await request(app).get(`/digital/track/${"x".repeat(43)}`).expect(200);
    expect(JSON.stringify(response.body)).not.toContain("not-public");
    expect(JSON.stringify(response.body)).not.toContain("secret@example.test");
    expect(response.body.data.business).not.toHaveProperty("id");
    expect(mocks.digitalTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, business: { status: "ACTIVE", deletedAt: null } }) }));
  });
  it("rejects malformed tracking tokens before database access", async () => {
    await request(app).get("/digital/track/guess").expect(422);
    expect(mocks.digitalTicket.findFirst).not.toHaveBeenCalled();
  });
  it("checks original workflow status atomically and rejects stale updates", async () => {
    mocks.digitalTicket.findFirst.mockResolvedValue(ticket());
    mocks.digitalTicket.updateMany.mockResolvedValue({ count: 0 });
    const result = await request(app).post(`/digital/${ticketId}/status`).set("authorization", `Bearer ${token("TECHNICIAN")}`).send({ status: "DISCOVERY" }).expect(409);
    expect(result.body.code).toBe("TICKET_CHANGED");
    expect(mocks.digitalTicket.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId, status: "INTAKE", assignedTechnicianId: userId }) }));
    expect(mocks.digitalStatusHistory.create).not.toHaveBeenCalled();
    expect(mocks.notifyStatus).not.toHaveBeenCalled();
  });
  it("rejects stage skipping and customer mutations", async () => {
    mocks.digitalTicket.findFirst.mockResolvedValue(ticket());
    await request(app).post(`/digital/${ticketId}/status`).set("authorization", `Bearer ${token()}`).send({ status: "DELIVERED" }).expect(409);
    await request(app).post(`/digital/${ticketId}/notes`).set("authorization", `Bearer ${token("CUSTOMER")}`).send({ body: "illegal" }).expect(403);
    expect(mocks.digitalTicket.updateMany).not.toHaveBeenCalled();
  });
});

describe("manual digital invoices", () => {
  const manualInvoice = { customerId, digitalTicketId: ticketId, items: [{ description: "Website design milestone", quantity: 1, unitPrice: 5000, itemType: "SERVICE" }] };
  it("rejects ambiguous associations, empty digital invoices, and stock-backed items", async () => {
    const authorization = `Bearer ${token()}`;
    await request(app).post("/invoices").set("authorization", authorization).send({ ...manualInvoice, repairId: assigneeId }).expect(422);
    await request(app).post("/invoices").set("authorization", authorization).send({ ...manualInvoice, items: [] }).expect(422);
    await request(app).post("/invoices").set("authorization", authorization).send({ ...manualInvoice, items: [{ ...manualInvoice.items[0], inventoryItemId: assigneeId }] }).expect(422);
    expect(mocks.invoice.create).not.toHaveBeenCalled();
  });
  it("verifies digital invoice customer/tenant association", async () => {
    mocks.digitalTicket.findFirst.mockResolvedValue(null);
    await request(app).post("/invoices").set("authorization", `Bearer ${token()}`).send(manualInvoice).expect(422);
    expect(mocks.digitalTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ticketId, businessId, customerId, deletedAt: null } }));
    expect(mocks.invoice.create).not.toHaveBeenCalled();
  });
  it("creates only the explicitly entered items, with no default labour or inventory effects", async () => {
    mocks.digitalTicket.findFirst.mockResolvedValue(ticket());
    mocks.invoice.create.mockImplementation(async (args: any) => ({ id: "invoice", ...args.data }));
    const response = await request(app).post("/invoices").set("authorization", `Bearer ${token()}`).send(manualInvoice).expect(201);
    expect(response.body.data.total).toBe(5000);
    const args = mocks.invoice.create.mock.calls[0]![0] as { data: { items: { create: unknown[] }; digitalTicketId: string } };
    expect(args.data.digitalTicketId).toBe(ticketId);
    expect(args.data.items.create).toHaveLength(1);
    expect(args.data.items.create[0]).toMatchObject({ description: "Website design milestone", itemType: "SERVICE", unitPrice: 5000 });
    expect(mocks.inventoryItem.findFirst).not.toHaveBeenCalled();
  });
});

describe("invoice transaction safety", () => {
  it("checks editable state inside each transaction rather than trusting a stale outer draft", async () => {
    mocks.invoice.findFirst.mockResolvedValue({ id: ticketId, status: "DRAFT", amountPaid: 0, kraStatus: "NOT_REQUIRED" });
    const current = vi.fn().mockResolvedValue({ id: ticketId, status: "ISSUED", amountPaid: 0, kraStatus: "NOT_REQUIRED" });
    mocks.$transaction.mockImplementation(async (callback: any) => callback({ ...mocks, invoice: { ...mocks.invoice, findFirst: current } }));
    const authorization = `Bearer ${token()}`;
    await request(app).patch(`/invoices/${ticketId}`).set("authorization", authorization).send({ notes: "changed" }).expect(409);
    await request(app).post(`/invoices/${ticketId}/items`).set("authorization", authorization).send({ description: "Service", quantity: 1, unitPrice: 100 }).expect(409);
    await request(app).patch(`/invoices/${ticketId}/items/${customerId}`).set("authorization", authorization).send({ quantity: 2 }).expect(409);
    await request(app).delete(`/invoices/${ticketId}/items/${customerId}`).set("authorization", authorization).expect(409);
    expect(current).toHaveBeenCalledTimes(4);
    expect(mocks.invoice.findFirst).not.toHaveBeenCalled();
    expect(mocks.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
  it("reads the fresh draft and line items inside issue before any stock deduction", async () => {
    const current = vi.fn().mockResolvedValue(null);
    mocks.$transaction.mockImplementation(async (callback: any) => callback({ ...mocks, invoice: { ...mocks.invoice, findFirst: current } }));
    await request(app).post(`/invoices/${ticketId}/issue`).set("authorization", `Bearer ${token()}`).expect(404);
    expect(mocks.invoice.findFirst).not.toHaveBeenCalled();
    expect(mocks.inventoryItem.findFirst).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "DRAFT", businessId }) }));
  });
  it("rejects a repeated void using current transaction state instead of returning stock twice", async () => {
    const current = vi.fn().mockResolvedValue({ id: ticketId, status: "VOID", amountPaid: 0, items: [] });
    mocks.$transaction.mockImplementation(async (callback: any) => callback({ ...mocks, invoice: { ...mocks.invoice, findFirst: current } }));
    const result = await request(app).delete(`/invoices/${ticketId}`).set("authorization", `Bearer ${token()}`).send({ reason: "Cancel invoice" }).expect(409);
    expect(result.body.code).toBe("INVOICE_ALREADY_CANCELLED");
    expect(mocks.invoice.findFirst).not.toHaveBeenCalled();
    expect(mocks.inventoryTransaction.create).not.toHaveBeenCalled();
  });
  it("counts remaining invoice items inside the same serializable mutation", async () => {
    const current = vi.fn().mockResolvedValue({ id: ticketId, status: "DRAFT", amountPaid: 0, kraStatus: "NOT_REQUIRED" });
    const count = vi.fn().mockResolvedValue(1);
    mocks.invoiceItem.findFirst.mockResolvedValue({ id: customerId });
    mocks.$transaction.mockImplementation(async (callback: any) => callback({ ...mocks, invoice: { ...mocks.invoice, findFirst: current }, invoiceItem: { ...mocks.invoiceItem, count } }));
    const result = await request(app).delete(`/invoices/${ticketId}/items/${customerId}`).set("authorization", `Bearer ${token()}`).expect(409);
    expect(result.body.code).toBe("LAST_INVOICE_ITEM");
    expect(count).toHaveBeenCalledWith({ where: { invoiceId: ticketId, businessId } });
    expect(mocks.invoiceItem.delete).not.toHaveBeenCalled();
  });
  it("keeps zero-total manual drafts editable during recalculation", async () => {
    mocks.invoice.findUnique.mockResolvedValue({ id: ticketId, businessId, status: "DRAFT", invoiceLevelDiscount: 0, amountPaid: 0, items: [{ quantity: 1, unitPrice: 0, taxRate: 0, discount: 0 }], repairId: null });
    await recalculateInvoice(mocks as never, ticketId);
    expect(mocks.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT", total: 0 }) }));
  });
});
