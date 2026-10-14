import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
vi.hoisted(() => { process.env.GOOGLE_WEB_CLIENT_ID = "test-google-client"; });
vi.mock("google-auth-library", () => ({ OAuth2Client: class { verifyIdToken = vi.fn().mockResolvedValue({ getPayload: () => ({ sub: "different-google-subject", email: "same@example.test", email_verified: true }) }); } }));
const prisma = vi.hoisted(() => ({ user: { findFirst: vi.fn(), updateMany: vi.fn() }, passwordReset: { findUnique: vi.fn() }, emailVerification: { findUnique: vi.fn() }, $transaction: vi.fn() }));
vi.mock("../src/lib/prisma.js", () => ({ prisma }));
vi.mock("../src/lib/crypto.js", async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), hashPassword: vi.fn().mockResolvedValue("test-hash") }));
import { googleLogin, resetPassword, verifyEmail } from "../src/modules/auth/auth.service.js";

describe("authentication remediation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects a different Google subject even when the email matches", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ googleSubject: "original-google-subject", status: "ACTIVE" } as never);
    await expect(googleLogin("unused-token", undefined, {} as Request)).rejects.toMatchObject({ code: "GOOGLE_IDENTITY_MISMATCH" });
  });
  it("does not change a password when a concurrent reset consumed the token", async () => {
    vi.mocked(prisma.passwordReset.findUnique).mockResolvedValue({ id: "reset", userId: "user", usedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { status: "ACTIVE" } } as never);
    const change = vi.fn();
    const consume = vi.fn().mockResolvedValue({ count: 0 });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback({ passwordReset: { updateMany: consume }, user: { updateMany: change } }));
    await expect(resetPassword("one-time-token", "StrongPassword12!")).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(change).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ usedAt: null }) }));
  });
  it("does not activate an account when a verification token was already consumed", async () => {
    vi.mocked(prisma.emailVerification.findUnique).mockResolvedValue({ id: "verify", userId: "user", usedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { status: "PENDING_VERIFICATION" } } as never);
    const change = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback({ emailVerification: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, user: { updateMany: change } }));
    await expect(verifyEmail("one-time-token")).rejects.toMatchObject({ code: "INVALID_VERIFICATION_TOKEN" });
    expect(change).not.toHaveBeenCalled();
  });
});
