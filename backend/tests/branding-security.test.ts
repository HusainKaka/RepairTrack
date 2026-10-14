import jwt from "jsonwebtoken";
import request from "supertest";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
const prisma = vi.hoisted(() => ({ session: { findFirst: vi.fn(), updateMany: vi.fn() }, setting: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() }, business: { update: vi.fn(), findUnique: vi.fn() }, businessTaxSetting: { findUnique: vi.fn(), upsert: vi.fn() }, auditLog: { create: vi.fn() }, notification: { findMany: vi.fn(), findFirst: vi.fn() }, $transaction: vi.fn() }));
vi.mock("../src/lib/prisma.js", () => ({ prisma }));
import { createApp } from "../src/app.js";
import { BUSINESS_LOGO_KEY, documentFooter, getBusinessLogoDataUrl, normalizeBusinessLogo, storedLogoDataUrl } from "../src/lib/business-logo.js";

const businessId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const app = createApp();
function authenticate(role = "BUSINESS_ADMIN") {
  prisma.session.findFirst.mockResolvedValue({ id: sessionId, user: { id: userId, businessId, status: "ACTIVE", deletedAt: null, role: { code: role }, business: { status: "ACTIVE", deletedAt: null } } });
  return `Bearer ${jwt.sign({ sid: sessionId, role, businessId, type: "access" }, process.env.JWT_SECRET!, { subject: userId, expiresIn: "5m", issuer: "repairtrack-api", audience: "repairtrack-clients" })}`;
}
beforeEach(() => { vi.clearAllMocks(); prisma.$transaction.mockImplementation(async callback => callback(prisma)); prisma.setting.upsert.mockResolvedValue({ id: "logo" }); prisma.business.update.mockResolvedValue({ id: businessId }); prisma.auditLog.create.mockResolvedValue({}); });

describe("safe business logo normalization", () => {
  it.each(["png", "jpeg", "webp", "gif", "avif", "tiff"] as const)("decodes %s and stores a single sanitized PNG", async format => {
    const bytes = await sharp({ create: { width: 24, height: 14, channels: 4, background: "#2563eb" } }).toFormat(format).toBuffer();
    const result = await normalizeBusinessLogo(`data:image/${format};base64,${bytes.toString("base64")}`);
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata).toMatchObject({ width: 24, height: 14, format: "png" });
    expect(metadata.exif).toBeUndefined();
  });
  it("rejects SVG, MIME spoofing, arbitrary URLs and corrupted bytes", async () => {
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    for (const value of [`data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString("base64")}`, `data:image/jpeg;base64,${png.toString("base64")}`, "https://127.0.0.1/logo.png", "data:image/png;base64,aW52YWxpZA=="]) await expect(normalizeBusinessLogo(value)).rejects.toMatchObject({ code: "INVALID_LOGO_IMAGE" });
  });
  it("rejects excessive dimensions before resizing and oversized uploads before decoding", async () => {
    const tooWide = await sharp({ create: { width: 4097, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    await expect(normalizeBusinessLogo(`data:image/png;base64,${tooWide.toString("base64")}`)).rejects.toMatchObject({ code: "INVALID_LOGO_IMAGE" });
    await expect(normalizeBusinessLogo(`data:image/png;base64,${"A".repeat(3_000_000)}`)).rejects.toMatchObject({ code: "INVALID_LOGO_IMAGE" });
  });
  it("never accepts unsafe legacy values as stored logos", () => {
    expect(storedLogoDataUrl({ dataUrl: "https://private.example/logo.png" })).toBeNull();
    expect(storedLogoDataUrl({ dataUrl: "data:image/svg+xml;base64,aaaa" })).toBeNull();
  });
  it("loads only the requested tenant's reserved logo setting", async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: { dataUrl: "data:image/png;base64,AAAA" } });
    expect(await getBusinessLogoDataUrl(businessId)).toBe("data:image/png;base64,AAAA");
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({ where: { scope_key: { scope: `business:${businessId}`, key: BUSINESS_LOGO_KEY } }, select: { value: true } });
  });
});

describe("logo, settings and delivery authorization", () => {
  it("requires authentication and a business administrator to upload or remove a logo", async () => {
    await request(app).put("/api/v1/businesses/profile/logo").send({ imageDataUrl: "invalid" }).expect(401);
    await request(app).put("/api/v1/businesses/profile/logo").set("authorization", authenticate("CUSTOMER")).send({ imageDataUrl: "invalid" }).expect(403);
    await request(app).delete("/api/v1/businesses/profile/logo").set("authorization", authenticate("TECHNICIAN")).expect(403);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });
  it("cannot override tenant context in the upload payload", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    await request(app).put("/api/v1/businesses/profile/logo").set("authorization", authenticate()).send({ imageDataUrl: `data:image/png;base64,${png.toString("base64")}`, businessId: "another-tenant" }).expect(422);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });
  it("stores a sanitized logo under the authenticated business only", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    const result = await request(app).put("/api/v1/businesses/profile/logo").set("authorization", authenticate()).send({ imageDataUrl: `data:image/png;base64,${png.toString("base64")}` }).expect(200);
    expect(result.body.data.logoImageUrl).toMatch(/^data:image\/png;base64,/);
    expect(prisma.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { scope_key: { scope: `business:${businessId}`, key: BUSINESS_LOGO_KEY } }, create: expect.objectContaining({ businessId }) }));
    expect(prisma.business.update).toHaveBeenCalledWith({ where: { id: businessId }, data: { logoUrl: null } });
  });
  it("prevents the generic registry bypassing upload validation", async () => {
    await request(app).put(`/api/v1/settings/${BUSINESS_LOGO_KEY}`).set("authorization", authenticate()).send({ value: { dataUrl: "malicious" } }).expect(403);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });
  it("does not include logo bytes in the generic configuration registry", async () => {
    prisma.setting.findMany.mockResolvedValue([]);
    await request(app).get("/api/v1/settings").set("authorization", authenticate()).expect(200);
    expect(prisma.setting.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { scope: `business:${businessId}`, key: { not: BUSINESS_LOGO_KEY } } }));
  });
  it("prevents enabling KRA until external setup is present", async () => {
    const result = await request(app).put("/api/v1/settings/tax").set("authorization", authenticate()).send({ etimsEnabled: true, environment: "sandbox", requireCustomerKraPin: false }).expect(409);
    expect(result.body.code).toBe("ETIMS_NOT_CONFIGURED");
    expect(prisma.businessTaxSetting.upsert).not.toHaveBeenCalled();
  });
  it("scopes delivery diagnostics to the business without exposing recipient or tracking tokens", async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await request(app).get("/api/v1/notifications/delivery").set("authorization", authenticate()).expect(200);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId }), select: expect.not.objectContaining({ recipient: true, body: true, metadata: true }) }));
    await request(app).get("/api/v1/notifications/delivery").set("authorization", authenticate("CUSTOMER")).expect(403);
  });
  it("hides KRA-specific footer clauses while retaining general text and financial totals", () => {
    expect(documentFooter("Thank you\nKRA PIN: A123456789B\neTIMS reference ABC", false, "Fallback")).toBe("Thank you");
    expect(documentFooter("KRA PIN: A123456789B", false, "Thank you")).toBe("Thank you");
    expect(documentFooter("eTIMS reference ABC", true, "Fallback")).toBe("eTIMS reference ABC");
  });
});
