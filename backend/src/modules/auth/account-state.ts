import { AccountStatus } from "../../generated/prisma/index.js";
import { AppError } from "../../errors/app-error.js";

export function assertEmailVerificationAllowed(status: AccountStatus): void {
  if (status !== AccountStatus.PENDING_VERIFICATION) throw new AppError(403, "ACCOUNT_STATE_INVALID", "This account cannot be activated with that verification link.");
}

export function passwordResetActivation(status: AccountStatus): AccountStatus | undefined {
  if (status === AccountStatus.DELETED || status === AccountStatus.DELETION_REQUESTED) throw new AppError(403, "ACCOUNT_INACTIVE", "This account cannot reset its password.");
  return status === AccountStatus.PENDING_VERIFICATION ? AccountStatus.ACTIVE : undefined;
}

export function assertGoogleLinkAllowed(status: AccountStatus): void {
  if (status !== AccountStatus.ACTIVE && status !== AccountStatus.PENDING_VERIFICATION) throw new AppError(403, "ACCOUNT_INACTIVE", "The account is not active.");
}
