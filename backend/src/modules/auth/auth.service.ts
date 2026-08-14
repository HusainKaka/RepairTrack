import { AccountStatus, RoleCode, type User } from "../../generated/prisma/index.js";
import { OAuth2Client } from "google-auth-library";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { createOpaqueToken, hashPassword, hashToken, passwordPolicy, verifyPassword } from "../../lib/crypto.js";
import { mailProvider } from "../../lib/mail.js";
import { prisma } from "../../lib/prisma.js";
import { signAccessToken } from "../../middleware/authenticate.js";
import { assertEmailVerificationAllowed, assertGoogleLinkAllowed, passwordResetActivation } from "./account-state.js";

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$RHVtbXlTYWx0Rm9yVGltaW5n$GwbW3Gy92PoOhX0GtXxeM9W2kt5OXWVa9fJ5m2hHmnI";

type UserWithRole = User & { role: { code: RoleCode }; business: { status: string } | null };

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: { id: string; email: string; fullName: string; role: RoleCode; businessId: string | null };
}

function publicUser(user: UserWithRole): SessionResult["user"] {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role.code, businessId: user.businessId };
}

async function issueSession(user: UserWithRole, request: Request): Promise<SessionResult> {
  const refreshToken = createOpaqueToken(48);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt,
      ipAddress: request.ip,
      userAgent: request.get("user-agent")?.slice(0, 500)
    }
  });
  return {
    accessToken: signAccessToken({ sub: user.id, sid: session.id, role: user.role.code, businessId: user.businessId }),
    refreshToken,
    expiresInSeconds: env.ACCESS_TOKEN_TTL_MINUTES * 60,
    user: publicUser(user)
  };
}

async function createVerification(userId: string): Promise<string> {
  const token = createOpaqueToken();
  await prisma.emailVerification.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
  });
  return token;
}

async function deliverAccountEmail(user: Pick<User, "email" | "fullName">, subject: string, path: string): Promise<void> {
  try {
    await mailProvider.send({
      to: user.email,
      subject,
      text: `Hello ${user.fullName}, open ${env.PUBLIC_WEB_URL}${path} to continue. This link expires automatically.`
    });
  } catch (error) {
    if (env.NODE_ENV === "production") throw error;
  }
}

export async function registerCustomer(input: { businessId: string; email: string; password: string; fullName: string; phone: string }, request: Request): Promise<void> {
  const policyErrors = passwordPolicy(input.password);
  if (policyErrors.length) throw new AppError(422, "WEAK_PASSWORD", "The password does not meet the security policy.", { password: policyErrors });
  const business = await prisma.business.findFirst({ where: { id: input.businessId, status: "ACTIVE", deletedAt: null } });
  if (!business) throw new AppError(404, "BUSINESS_NOT_FOUND", "The selected repair business is unavailable.");
  const role = await prisma.role.upsert({ where: { code: RoleCode.CUSTOMER }, update: {}, create: { code: RoleCode.CUSTOMER, name: "Customer" } });
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { businessId: input.businessId, roleId: role.id, email: input.email.toLowerCase(), passwordHash, fullName: input.fullName, phone: input.phone }
    });
    await tx.customer.create({ data: { businessId: input.businessId, userId: created.id, fullName: input.fullName, email: created.email, phone: input.phone } });
    await writeAudit(tx, request, { businessId: input.businessId, userId: created.id, userRole: RoleCode.CUSTOMER, action: "USER_REGISTERED", resourceType: "user", resourceId: created.id });
    return created;
  });
  const token = await createVerification(user.id);
  await deliverAccountEmail(user, "Verify your RepairTrack email", `/verify-email?token=${encodeURIComponent(token)}`);
}

export async function login(email: string, password: string, request: Request): Promise<SessionResult> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { role: true, business: { select: { status: true } } } });
  if (!user) {
    await verifyPassword(DUMMY_PASSWORD_HASH, password);
    throw new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError(423, "ACCOUNT_LOCKED", "The account is temporarily locked. Try again later.");
  const valid = user.passwordHash ? await verifyPassword(user.passwordHash, password) : false;
  if (!valid) {
    const failures = user.failedLoginCount + 1;
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: failures, lockedUntil: failures >= LOCK_THRESHOLD ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null } });
    await writeAudit(prisma, request, { businessId: user.businessId, userId: user.id, userRole: user.role.code, action: "LOGIN_FAILED", resourceType: "session" });
    throw new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
  }
  if (user.status !== AccountStatus.ACTIVE) throw new AppError(403, "ACCOUNT_INACTIVE", "The account is not active.");
  if (user.business && user.business.status !== "ACTIVE") throw new AppError(403, "BUSINESS_INACTIVE", "The business account is not active.");
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await writeAudit(prisma, request, { businessId: user.businessId, userId: user.id, userRole: user.role.code, action: "LOGIN_SUCCEEDED", resourceType: "session" });
  return issueSession(user, request);
}

export async function refresh(rawToken: string, request: Request): Promise<SessionResult> {
  const existing = await prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(rawToken) },
    include: { user: { include: { role: true, business: { select: { status: true } } } } }
  });
  if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) throw new AppError(401, "INVALID_REFRESH_TOKEN", "The session is invalid or expired.");
  const user = existing.user;
  if (user.status !== AccountStatus.ACTIVE || (user.business && user.business.status !== "ACTIVE")) throw new AppError(403, "ACCOUNT_INACTIVE", "The account is not active.");
  const newToken = createOpaqueToken(48);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const newSession = await prisma.$transaction(async (tx) => {
    const revoked = await tx.session.updateMany({ where: { id: existing.id, revokedAt: null }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
    if (revoked.count !== 1) throw new AppError(401, "REFRESH_TOKEN_REUSED", "The session has already been rotated.");
    const created = await tx.session.create({ data: { userId: user.id, refreshTokenHash: hashToken(newToken), expiresAt, ipAddress: request.ip, userAgent: request.get("user-agent")?.slice(0, 500) } });
    await tx.session.update({ where: { id: existing.id }, data: { replacedBySessionId: created.id } });
    return created;
  });
  return {
    accessToken: signAccessToken({ sub: user.id, sid: newSession.id, role: user.role.code, businessId: user.businessId }),
    refreshToken: newToken,
    expiresInSeconds: env.ACCESS_TOKEN_TTL_MINUTES * 60,
    user: publicUser(user)
  };
}

export async function logout(rawToken: string | undefined, request: Request): Promise<void> {
  if (rawToken) await prisma.session.updateMany({ where: { refreshTokenHash: hashToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  if (request.auth) await writeAudit(prisma, request, { ...request.auth, action: "LOGOUT", resourceType: "session", resourceId: request.auth.sessionId });
}

export async function verifyEmail(rawToken: string): Promise<void> {
  const record = await prisma.emailVerification.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { user: { select: { status: true } } } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) throw new AppError(400, "INVALID_VERIFICATION_TOKEN", "The verification link is invalid or expired.");
  assertEmailVerificationAllowed(record.user.status);
  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date(), status: AccountStatus.ACTIVE } })
  ]);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.status === AccountStatus.DELETED) return;
  const token = createOpaqueToken();
  await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
  await deliverAccountEmail(user, "Reset your RepairTrack password", `/reset-password?token=${encodeURIComponent(token)}`);
}

export async function resetPassword(rawToken: string, password: string): Promise<void> {
  const policyErrors = passwordPolicy(password);
  if (policyErrors.length) throw new AppError(422, "WEAK_PASSWORD", "The password does not meet the security policy.", { password: policyErrors });
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: { user: { select: { status: true } } } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) throw new AppError(400, "INVALID_RESET_TOKEN", "The reset link is invalid or expired.");
  const activationStatus = passwordResetActivation(record.user.status);
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null, status: activationStatus } }),
    prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);
}

export async function googleLogin(idToken: string, businessId: string | undefined, request: Request): Promise<SessionResult> {
  if (!env.GOOGLE_WEB_CLIENT_ID) throw new AppError(503, "GOOGLE_SIGN_IN_NOT_CONFIGURED", "Google Sign-In is not configured.");
  const ticket = await new OAuth2Client(env.GOOGLE_WEB_CLIENT_ID).verifyIdToken({ idToken, audience: env.GOOGLE_WEB_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified) throw new AppError(401, "INVALID_GOOGLE_TOKEN", "Google could not verify this account.");
  let user = await prisma.user.findFirst({ where: { OR: [{ googleSubject: payload.sub }, { email: payload.email.toLowerCase() }] }, include: { role: true, business: { select: { status: true } } } });
  if (!user) {
    if (!businessId) throw new AppError(422, "BUSINESS_REQUIRED", "Select a repair business before creating a customer account.");
    const business = await prisma.business.findFirst({ where: { id: businessId, status: "ACTIVE", deletedAt: null } });
    if (!business) throw new AppError(404, "BUSINESS_NOT_FOUND", "The selected repair business is unavailable.");
    const role = await prisma.role.upsert({ where: { code: RoleCode.CUSTOMER }, update: {}, create: { code: RoleCode.CUSTOMER, name: "Customer" } });
    const created = await prisma.user.create({ data: { businessId, roleId: role.id, email: payload.email.toLowerCase(), fullName: payload.name ?? payload.email, googleSubject: payload.sub, emailVerifiedAt: new Date(), status: AccountStatus.ACTIVE } });
    user = { ...created, role, business: { status: "ACTIVE" } };
  } else if (!user.googleSubject) {
    assertGoogleLinkAllowed(user.status);
    user = { ...(await prisma.user.update({ where: { id: user.id }, data: { googleSubject: payload.sub, emailVerifiedAt: user.emailVerifiedAt ?? new Date(), status: AccountStatus.ACTIVE } })), role: user.role, business: user.business };
  }
  if (user.status !== AccountStatus.ACTIVE) throw new AppError(403, "ACCOUNT_INACTIVE", "The account is not active.");
  if (user.business && user.business.status !== "ACTIVE") throw new AppError(403, "BUSINESS_INACTIVE", "The business account is not active.");
  await writeAudit(prisma, request, { businessId: user.businessId, userId: user.id, userRole: user.role.code, action: "GOOGLE_LOGIN_SUCCEEDED", resourceType: "session" });
  return issueSession(user, request);
}
