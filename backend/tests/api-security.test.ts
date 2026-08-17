import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();
const secret = process.env.JWT_SECRET!;

describe("API security boundary", () => {
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
});

