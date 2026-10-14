import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("production configuration safeguards", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "NonSecretTestFixture-9385qAzLpMwHxRt6");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/repairtrack_test");
    vi.stubEnv("WEB_ORIGIN", "https://repair.example.test");
    vi.stubEnv("PUBLIC_WEB_URL", "https://repair.example.test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires an explicit signing secret rather than a development fallback", async () => {
    vi.stubEnv("JWT_SECRET", undefined);
    await expect(import("../src/config/env.js")).rejects.toThrow("JWT_SECRET");
  });
  it.each(["development-only-change-this-secret-now", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]) ("rejects a weak signing-secret fixture", async secret => {
    vi.stubEnv("JWT_SECRET", secret);
    await expect(import("../src/config/env.js")).rejects.toThrow("JWT_SECRET");
  });
  it("requires explicitly configured HTTPS links", async () => {
    vi.stubEnv("PUBLIC_WEB_URL", undefined);
    await expect(import("../src/config/env.js")).rejects.toThrow("PUBLIC_WEB_URL");
    vi.resetModules();
    vi.stubEnv("PUBLIC_WEB_URL", "http://repair.example.test");
    await expect(import("../src/config/env.js")).rejects.toThrow("PUBLIC_WEB_URL");
  });
  it("accepts an explicitly configured production fixture", async () => {
    expect((await import("../src/config/env.js")).env.NODE_ENV).toBe("production");
  });
});
