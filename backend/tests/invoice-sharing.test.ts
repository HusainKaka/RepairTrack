import { createHmac } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: { findFirst: vi.fn(), updateMany: vi.fn() }, invoice: { findFirst: vi.fn() }, repair: { findFirst: vi.fn() }, auditLog: { create: vi.fn() }, renderPdf: vi.fn() }));
vi.mock("../src/lib/prisma.js", () => ({ prisma: mocks }));
vi.mock("../src/lib/pdf.js", () => ({ renderInvoicePdf: mocks.renderPdf, renderReceiptPdf: vi.fn() }));
import { encryptPublicToken } from "../src/lib/crypto.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { invoiceRouter } from "../src/modules/invoices/invoice.routes.js";
import { repairRouter } from "../src/modules/repairs/repair.routes.js";
import { createInvoiceShareToken, INVOICE_SHARE_MAX_SECONDS, verifyInvoiceShareToken } from "../src/modules/invoices/invoice-share.js";

const app = express(); app.use(express.json()); app.use("/invoices", invoiceRouter); app.use("/repairs", repairRouter); app.use(errorHandler);
const businessId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const customerId = "55555555-5555-4555-8555-555555555555";
const token = (role = "BUSINESS_ADMIN") => {
  mocks.session.findFirst.mockResolvedValue({ id: sessionId, user: { id: userId, businessId, status: "ACTIVE", deletedAt: null, role: { code: role }, business: { status: "ACTIVE", deletedAt: null } } });
  return jwt.sign({ sid: sessionId, role, businessId, type: "access" }, process.env.JWT_SECRET!, { subject: userId, issuer: "repairtrack-api", audience: "repairtrack-clients", expiresIn: "5m" });
};
const testShareToken = (changes: Record<string, unknown> = {}, algorithm: jwt.Algorithm = "HS256", secret?: string | Buffer) => {
  const now = Math.floor(Date.now() / 1000);
  const key = secret ?? createHmac("sha256", process.env.JWT_SECRET!).update("repairtrack:invoice-pdf-share:v1", "utf8").digest();
  return jwt.sign({ iss: "repairtrack-invoice-share", aud: "repairtrack-public-invoice-pdf", sub: invoiceId, businessId, purpose: "invoice-pdf", jti: customerId, iat: now, exp: now + INVOICE_SHARE_MAX_SECONDS, ...changes }, key, { algorithm });
};

beforeEach(() => { vi.resetAllMocks(); mocks.renderPdf.mockResolvedValue(Buffer.from("%PDF-test")); });

describe("purpose-scoped invoice share tokens", () => {
  it("creates an expiring invoice/business-scoped token with separate signing context", () => {
    const now = new Date();
    const shared = createInvoiceShareToken(invoiceId, businessId, now);
    expect(verifyInvoiceShareToken(shared.token, now)).toEqual({ invoiceId, businessId });
    expect(new Date(shared.expiresAt).getTime() - Math.floor(now.getTime() / 1000) * 1000).toBe(INVOICE_SHARE_MAX_SECONDS * 1000);
    expect(() => jwt.verify(shared.token, process.env.JWT_SECRET!, { algorithms: ["HS256"] })).toThrow();
  });
  it("rejects expiry, tampering, wrong purpose, algorithm, audience, issuer and overlong grants", () => {
    const expired = createInvoiceShareToken(invoiceId, businessId, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
    expect(() => verifyInvoiceShareToken(expired.token)).toThrow();
    expect(() => verifyInvoiceShareToken(`${createInvoiceShareToken(invoiceId, businessId).token.slice(0, -6)}AAAAAA`)).toThrow();
    for (const changed of [{ purpose: "access" }, { aud: "repairtrack-clients" }, { iss: "repairtrack-api" }, { sub: "not-a-uuid" }, { businessId: "not-a-uuid" }, { jti: undefined }, { exp: Math.floor(Date.now() / 1000) + INVOICE_SHARE_MAX_SECONDS + 1 }, { iat: Math.floor(Date.now() / 1000) + 60 }]) {
      expect(() => verifyInvoiceShareToken(testShareToken(changed))).toThrow();
    }
    expect(() => verifyInvoiceShareToken(testShareToken({}, "HS384"))).toThrow();
    expect(() => verifyInvoiceShareToken(testShareToken({}, "HS256", "other-test-only-secret"))).toThrow();
  });
  it("does not accept normal access JWTs as public share capabilities", () => {
    expect(() => verifyInvoiceShareToken(token())).toThrow();
  });
});

describe("invoice sharing access boundary", () => {
  it("keeps all normal invoice routes authenticated and link creation admin-only", async () => {
    await request(app).get(`/invoices/${invoiceId}`).expect(401);
    await request(app).get(`/invoices/${invoiceId}/pdf`).expect(401);
    await request(app).post(`/invoices/${invoiceId}/share-link`).expect(401);
    await request(app).post(`/invoices/${invoiceId}/share-link`).set("authorization", `Bearer ${token("CUSTOMER")}`).expect(403);
    await request(app).post(`/invoices/${invoiceId}/share-link`).set("authorization", `Bearer ${token("TECHNICIAN")}`).expect(403);
    expect(mocks.invoice.findFirst).not.toHaveBeenCalled();
  });
  it("scopes generated share links to issued invoices in the administrator's tenant", async () => {
    mocks.invoice.findFirst.mockResolvedValue({ id: invoiceId, businessId, customerId, repair: null, digitalTicket: null });
    const response = await request(app).post(`/invoices/${invoiceId}/share-link`).set("authorization", `Bearer ${token()}`).expect(201);
    expect(response.body.data.invoiceUrl).toMatch(/^http:\/\/localhost:5173\/api\/v1\/invoices\/shared\//);
    expect(mocks.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: invoiceId, businessId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] }, business: { status: "ACTIVE", deletedAt: null } } }));
    const audit = JSON.stringify(mocks.auditLog.create.mock.calls);
    expect(audit).not.toContain(response.body.data.invoiceUrl.split("/").at(-1));
    expect(audit).toContain("INVOICE_SHARE_LINK_CREATED");
  });
  it("rejects drafts, voids, deleted invoices and cross-tenant IDs without generating a capability", async () => {
    mocks.invoice.findFirst.mockResolvedValue(null);
    await request(app).post(`/invoices/${invoiceId}/share-link`).set("authorization", `Bearer ${token()}`).expect(404);
    expect(mocks.auditLog.create).not.toHaveBeenCalled();
  });
  it("returns only a safe associated ticket tracking URL, never the stored ciphertext", async () => {
    const trackingToken = "x".repeat(43);
    const ciphertext = encryptPublicToken(trackingToken);
    mocks.invoice.findFirst.mockResolvedValue({ id: invoiceId, businessId, customerId, repair: null, digitalTicket: { businessId, customerId, deletedAt: null, publicTrackingTokenEncrypted: ciphertext } });
    const response = await request(app).post(`/invoices/${invoiceId}/share-link`).set("authorization", `Bearer ${token()}`).expect(201);
    expect(response.body.data.trackingUrl).toBe(`http://localhost:5173/track/digital/${trackingToken}`);
    expect(JSON.stringify(response.body)).not.toContain(ciphertext);
    mocks.invoice.findFirst.mockResolvedValue({ id: invoiceId, businessId, customerId, repair: { businessId, customerId: userId, deletedAt: null, publicTrackingTokenEncrypted: ciphertext }, digitalTicket: null });
    const wrongCustomer = await request(app).post(`/invoices/${invoiceId}/share-link`).set("authorization", `Bearer ${token()}`).expect(201);
    expect(wrongCustomer.body.data).not.toHaveProperty("trackingUrl");
  });
  it("opens only an eligible signed invoice PDF without a customer account", async () => {
    mocks.invoice.findFirst.mockResolvedValue({ id: invoiceId, number: "INV-2026-000001" });
    const shared = createInvoiceShareToken(invoiceId, businessId);
    const response = await request(app).get(`/invoices/shared/${shared.token}`).expect(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(mocks.session.findFirst).not.toHaveBeenCalled();
    expect(mocks.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: invoiceId, businessId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] }, business: { status: "ACTIVE", deletedAt: null } }) }));
  });
  it("rechecks eligibility on every public access and fails after void/deletion/business suspension", async () => {
    mocks.invoice.findFirst.mockResolvedValue(null);
    const shared = createInvoiceShareToken(invoiceId, businessId);
    await request(app).get(`/invoices/shared/${shared.token}`).expect(404);
    expect(mocks.renderPdf).not.toHaveBeenCalled();
  });
  it("rejects invalid or expired public tokens before accessing invoice data", async () => {
    const expired = createInvoiceShareToken(invoiceId, businessId, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
    const response = await request(app).get(`/invoices/shared/${expired.token}`).expect(401);
    expect(response.body.code).toBe("INVALID_INVOICE_SHARE_LINK");
    expect(mocks.invoice.findFirst).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain(expired.token);
  });
});

describe("repair tracking link sharing", () => {
  it("returns an administrator's repair link through a tenant-scoped query", async () => {
    mocks.repair.findFirst.mockResolvedValue({ publicTrackingTokenEncrypted: encryptPublicToken("x".repeat(43)) });
    const response = await request(app).get(`/repairs/${invoiceId}/tracking`).set("authorization", `Bearer ${token()}`).expect(200);
    expect(response.body.data.trackingUrl).toBe(`http://localhost:5173/track/${"x".repeat(43)}`);
    expect(mocks.repair.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: invoiceId, businessId, deletedAt: null } }));
  });
  it("restricts technicians to assigned repairs and denies customer access", async () => {
    mocks.repair.findFirst.mockResolvedValue(null);
    await request(app).get(`/repairs/${invoiceId}/tracking`).set("authorization", `Bearer ${token("TECHNICIAN")}`).expect(404);
    expect(mocks.repair.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: invoiceId, businessId, deletedAt: null, assignedTechnicianId: userId } }));
    mocks.repair.findFirst.mockClear();
    await request(app).get(`/repairs/${invoiceId}/tracking`).set("authorization", `Bearer ${token("CUSTOMER")}`).expect(403);
    expect(mocks.repair.findFirst).not.toHaveBeenCalled();
  });
  it("does not disclose ciphertext or throw internal details when a legacy token is missing/broken", async () => {
    mocks.repair.findFirst.mockResolvedValue({ publicTrackingTokenEncrypted: null });
    await request(app).get(`/repairs/${invoiceId}/tracking`).set("authorization", `Bearer ${token()}`).expect(409);
    mocks.repair.findFirst.mockResolvedValue({ publicTrackingTokenEncrypted: "private-invalid-ciphertext" });
    const response = await request(app).get(`/repairs/${invoiceId}/tracking`).set("authorization", `Bearer ${token()}`).expect(409);
    expect(JSON.stringify(response.body)).not.toContain("private-invalid-ciphertext");
  });
});

describe("invoice share creation throttling", () => {
  it("caps repeated administrator grants before querying or auditing another invoice", async () => {
    mocks.invoice.findFirst.mockResolvedValue({ id: invoiceId, businessId, customerId, repair: null, digitalTicket: null });
    const authorization = `Bearer ${token()}`;
    const statuses: number[] = [];
    for (let index = 0; index < 35; index++) {
      const response = await request(app).post(`/invoices/${invoiceId}/share-link`).set("authorization", authorization);
      statuses.push(response.status);
      expect([201, 429]).toContain(response.status);
    }
    expect(statuses).toContain(201);
    expect(statuses.at(-1)).toBe(429);
    const reads = mocks.invoice.findFirst.mock.calls.length;
    const audits = mocks.auditLog.create.mock.calls.length;
    const blocked = await request(app).post(`/invoices/${invoiceId}/share-link`).set("authorization", authorization).expect(429);
    expect(blocked.body.code).toBe("SHARE_LINK_RATE_LIMIT");
    expect(mocks.invoice.findFirst).toHaveBeenCalledTimes(reads);
    expect(mocks.auditLog.create).toHaveBeenCalledTimes(audits);
  }, 15_000);
});
