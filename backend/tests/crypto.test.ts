import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashPassword, hashToken, passwordPolicy, verifyPassword } from "../src/lib/crypto.js";

describe("credential protection", () => {
  it("enforces the complete password policy", () => {
    expect(passwordPolicy("short").length).toBeGreaterThan(3);
    expect(passwordPolicy("ValidPassword#42")).toEqual([]);
  });

  it("hashes passwords with Argon2id and verifies without exposing the password", async () => {
    const hash = await hashPassword("ValidPassword#42");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain("ValidPassword#42");
    await expect(verifyPassword(hash, "ValidPassword#42")).resolves.toBe(true);
    await expect(verifyPassword(hash, "WrongPassword#42")).resolves.toBe(false);
  });

  it("uses random public tokens and deterministic one-way digests", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).not.toBe(second);
    expect(hashToken(first)).toHaveLength(64);
    expect(hashToken(first)).toBe(hashToken(first));
  });
});

