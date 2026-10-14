import jwt from "jsonwebtoken";
import { Prisma } from "../src/generated/prisma/index.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const prisma = vi.hoisted(() => ({ session: { findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, device: { findFirst: vi.fn() }, inventoryItem: { findFirst: vi.fn(), update: vi.fn() }, supplier: { findFirst: vi.fn() }, repair: { findUnique: vi.fn() }, $transaction: vi.fn() }));
vi.mock("../src/lib/prisma.js", () => ({ prisma }));
import { createApp } from "../src/app.js";

const app = createApp();
const secret = process.env.JWT_SECRET!;
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const activeSession = () => ({ id: sessionId, user: { id: userId, businessId: "11111111-1111-4111-8111-111111111111", status: "ACTIVE", deletedAt: null, role: { code: "CUSTOMER" }, business: { status: "ACTIVE", deletedAt: null } } });
const accessToken = (role = "CUSTOMER") => jwt.sign({ sid: sessionId, role, businessId: "11111111-1111-4111-8111-111111111111", type: "access" }, secret, { subject: userId, expiresIn: "5m", issuer: "repairtrack-api", audience: "repairtrack-clients" });
beforeEach(() => { vi.mocked(prisma.session.findFirst).mockReset(); vi.mocked(prisma.session.findFirst).mockResolvedValue(activeSession() as never); });

describe("API security boundary", () => {
  it("returns a safe retry response for database transaction conflicts", async () => {
    prisma.device.findFirst.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("private query details", { code: "P2034", clientVersion: "6.19.3" }));
    const response = await request(app).get("/api/v1/devices/44444444-4444-4444-8444-444444444444").set("authorization", `Bearer ${accessToken()}`).expect(409);
    expect(response.body.code).toBe("RESOURCE_CHANGED");
    expect(JSON.stringify(response.body)).not.toContain("private query details");
  });
  it("rejects oversized JSON requests without exposing input", async () => {
    const response = await request(app).post("/api/v1/auth/login").send({ padding: "x".repeat(1_100_000) }).expect(413);
    expect(response.body.code).toBe("PAYLOAD_TOO_LARGE");
  });
  it("does not expose the retired Google sign-in endpoint", async () => {
    await request(app).post("/api/v1/auth/google").send({ idToken: "unused-token" }).expect(404);
  });
  it("serves a minimal health response without leaking configuration", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body.success).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain("DATABASE_URL");
  });

  it("rejects unauthenticated and invalid-token endpoint access", async () => {
    await request(app).get("/api/v1/customers").expect(401);
    const response = await request(app).get("/api/v1/customers").set("authorization", "Bearer invalid").expect(401);
    expect(response.body.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("rejects expired JWTs", async () => {
    const token = jwt.sign({ sid: "a", role: "CUSTOMER", businessId: "11111111-1111-4111-8111-111111111111", type: "access" }, secret, { subject: "22222222-2222-4222-8222-222222222222", expiresIn: -1, issuer: "repairtrack-api", audience: "repairtrack-clients" });
    const response = await request(app).get("/api/v1/customers").set("authorization", `Bearer ${token}`).expect(401);
    expect(response.body.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("enforces role permissions before touching tenant data", async () => {
    const token = jwt.sign({ sid: "33333333-3333-4333-8333-333333333333", role: "CUSTOMER", businessId: "11111111-1111-4111-8111-111111111111", type: "access" }, secret, { subject: "22222222-2222-4222-8222-222222222222", expiresIn: "5m", issuer: "repairtrack-api", audience: "repairtrack-clients" });
    const response = await request(app).get("/api/v1/customers").set("authorization", `Bearer ${token}`).expect(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("returns standardized errors and request identifiers", async () => {
    const response = await request(app).post("/api/v1/auth/login").set("content-type", "application/json").send("{").expect(400);
    expect(response.body).toMatchObject({ success: false, code: "INVALID_JSON" });
    expect(response.body.requestId).toEqual(expect.any(String));
  });
  it("rejects revoked or expired sessions even with a signed JWT", async () => {
    vi.mocked(prisma.session.findFirst).mockResolvedValue(null);
    const response = await request(app).get("/api/v1/customers").set("authorization", `Bearer ${accessToken()}`).expect(401);
    expect(response.body.code).toBe("SESSION_INACTIVE");
    expect(prisma.session.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: sessionId, userId, revokedAt: null }) }));
  });
  it("rejects disabled accounts and suspended businesses", async () => {
    const session = activeSession(); session.user.status = "DISABLED";
    vi.mocked(prisma.session.findFirst).mockResolvedValue(session as never);
    await request(app).get("/api/v1/customers").set("authorization", `Bearer ${accessToken()}`).expect(401);
    session.user.status = "ACTIVE"; session.user.business.status = "SUSPENDED";
    await request(app).get("/api/v1/customers").set("authorization", `Bearer ${accessToken()}`).expect(401);
  });
  it("uses current database roles instead of stale token privileges", async () => {
    const forgedRole = jwt.sign({ sid: sessionId, role: "BUSINESS_ADMIN", businessId: "11111111-1111-4111-8111-111111111111", type: "access" }, secret, { subject: userId, expiresIn: "5m", issuer: "repairtrack-api", audience: "repairtrack-clients" });
    const response = await request(app).get("/api/v1/customers").set("authorization", `Bearer ${forgedRole}`).expect(401);
    expect(response.body.code).toBe("SESSION_CONTEXT_CHANGED");
  });
  it("blocks cross-origin authentication writes before credentials are processed", async () => {
    const response = await request(app).post("/api/v1/auth/login").set("origin", "https://untrusted.example").send({ email: "test@example.test", password: "unused" }).expect(403);
    expect(response.body.code).toBe("UNTRUSTED_ORIGIN");
  });
  it("does not cache API responses containing user information", async () => {
    const response = await request(app).get("/api/v1/customers").expect(401);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it("rejects a signed token using a disallowed algorithm before any database access", async () => {
    const token = jwt.sign({ sid: sessionId, role: "CUSTOMER", businessId: activeSession().user.businessId, type: "access" }, secret, { subject: userId, expiresIn: "5m", issuer: "repairtrack-api", audience: "repairtrack-clients", algorithm: "HS384" });
    await request(app).get("/api/v1/customers").set("authorization", `Bearer ${token}`).expect(401);
    expect(prisma.session.findFirst).not.toHaveBeenCalled();
  });
  it("fails closed without exposing internal errors when the session database fails", async () => {
    prisma.session.findFirst.mockRejectedValue(new Error("private-database-detail"));
    const response = await request(app).get("/api/v1/devices/44444444-4444-4444-8444-444444444444").set("authorization", `Bearer ${accessToken()}`).expect(500);
    expect(JSON.stringify(response.body)).not.toContain("private-database-detail");
  });
  it("scopes nested repair history to the customer even when a device is reassigned", async () => {
    prisma.device.findFirst.mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444", repairs: [] });
    await request(app).get("/api/v1/devices/44444444-4444-4444-8444-444444444444").set("authorization", `Bearer ${accessToken()}`).expect(200);
    expect(prisma.device.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessId: activeSession().user.businessId, customer: { userId } }),
      include: expect.objectContaining({ repairs: expect.objectContaining({ where: { deletedAt: null, customer: { userId } } }) })
    }));
  });
  it("does not link inventory to another tenant's supplier", async () => {
    const session = activeSession(); session.user.role.code = "BUSINESS_ADMIN";
    vi.mocked(prisma.session.findFirst).mockResolvedValue(session as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444" } as never);
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(null);
    await request(app).patch("/api/v1/inventory/44444444-4444-4444-8444-444444444444").set("authorization", `Bearer ${accessToken("BUSINESS_ADMIN")}`).send({ supplierId: "55555555-5555-4555-8555-555555555555" }).expect(404);
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: session.user.businessId }) }));
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });
  it("does not accept an estimate changed after the customer loaded it", async () => {
    prisma.repair.findUnique.mockResolvedValue({ id: "repair", approvalVersion: 2, status: "AWAITING_CUSTOMER_APPROVAL", deletedAt: null, customerResponses: [], invoices: [] });
    const save = vi.fn();
    const claim = vi.fn().mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (callback: any) => callback({ repair: { updateMany: claim }, customerRepairResponse: { create: save } }));
    const response = await request(app).post(`/api/v1/repairs/track/${"x".repeat(43)}/respond`).send({ decision: "ACCEPTED", approvalVersion: 2 }).expect(409);
    expect(response.body.code).toBe("APPROVAL_NOT_AVAILABLE");
    expect(save).not.toHaveBeenCalled();
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ approvalVersion: 2, status: "AWAITING_CUSTOMER_APPROVAL" }) }));
  });
});

