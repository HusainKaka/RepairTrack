import { AccountStatus } from "../src/generated/prisma/index.js";
import { describe, expect, it } from "vitest";
import { assertEmailVerificationAllowed, assertGoogleLinkAllowed, passwordResetActivation } from "../src/modules/auth/account-state.js";

describe("account activation boundaries", () => {
  it("activates only a pending account through email verification", () => {
    expect(() => assertEmailVerificationAllowed(AccountStatus.PENDING_VERIFICATION)).not.toThrow();
    expect(() => assertEmailVerificationAllowed(AccountStatus.DISABLED)).toThrowError(/cannot be activated/i);
  });

  it("does not reactivate a disabled account during password reset", () => {
    expect(passwordResetActivation(AccountStatus.PENDING_VERIFICATION)).toBe(AccountStatus.ACTIVE);
    expect(passwordResetActivation(AccountStatus.DISABLED)).toBeUndefined();
    expect(() => passwordResetActivation(AccountStatus.DELETION_REQUESTED)).toThrowError(/cannot reset/i);
  });

  it("allows Google linking only for active or pending accounts", () => {
    expect(() => assertGoogleLinkAllowed(AccountStatus.ACTIVE)).not.toThrow();
    expect(() => assertGoogleLinkAllowed(AccountStatus.PENDING_VERIFICATION)).not.toThrow();
    expect(() => assertGoogleLinkAllowed(AccountStatus.DISABLED)).toThrowError(/not active/i);
  });
});
