import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { googleLogin, login, logout, refresh, registerCustomer, requestPasswordReset, resetPassword, verifyEmail } from "./auth.service.js";

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const credentialLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });
const refreshCookie = "rt_refresh";
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/v1/auth", maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 };

router.use(authLimiter);

router.post("/signup", validate(z.object({ businessId: z.uuid(), email: z.email(), password: z.string(), fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(30) })), async (request, response) => {
  await registerCustomer(request.body, request);
  response.status(201).json({ success: true, data: { message: "Check your email to verify the account." } });
});

router.post("/login", credentialLimiter, validate(z.object({ email: z.email(), password: z.string().min(1).max(128) })), async (request, response) => {
  const result = await login(request.body.email, request.body.password, request);
  response.cookie(refreshCookie, result.refreshToken, cookieOptions);
  response.json({ success: true, data: { accessToken: result.accessToken, expiresInSeconds: result.expiresInSeconds, user: result.user } });
});

router.post("/google", credentialLimiter, validate(z.object({ idToken: z.string().min(50), businessId: z.uuid().optional() })), async (request, response) => {
  const result = await googleLogin(request.body.idToken, request.body.businessId, request);
  response.cookie(refreshCookie, result.refreshToken, cookieOptions);
  response.json({ success: true, data: { accessToken: result.accessToken, expiresInSeconds: result.expiresInSeconds, user: result.user } });
});

router.post("/refresh", async (request, response) => {
  const token = request.cookies[refreshCookie] as string | undefined;
  if (!token) throw new AppError(401, "REFRESH_TOKEN_REQUIRED", "The refresh session is missing.");
  const result = await refresh(token, request);
  response.cookie(refreshCookie, result.refreshToken, cookieOptions);
  response.json({ success: true, data: { accessToken: result.accessToken, expiresInSeconds: result.expiresInSeconds, user: result.user } });
});

router.post("/logout", async (request, response) => {
  await logout(request.cookies[refreshCookie] as string | undefined, request);
  response.clearCookie(refreshCookie, { ...cookieOptions, maxAge: undefined });
  response.status(204).end();
});

router.post("/verify-email", validate(z.object({ token: z.string().min(20) })), async (request, response) => {
  await verifyEmail(request.body.token);
  response.json({ success: true, data: { message: "Email verified." } });
});

router.post("/forgot-password", credentialLimiter, validate(z.object({ email: z.email() })), async (request, response) => {
  await requestPasswordReset(request.body.email);
  response.json({ success: true, data: { message: "If the account exists, a reset email has been sent." } });
});

router.post("/reset-password", credentialLimiter, validate(z.object({ token: z.string().min(20), password: z.string() })), async (request, response) => {
  await resetPassword(request.body.token, request.body.password);
  response.json({ success: true, data: { message: "Password reset. Sign in again on all devices." } });
});

router.get("/me", authenticate, async (request, response) => {
  const user = await prisma.user.findUnique({ where: { id: request.auth!.userId }, select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, businessId: true, status: true, role: { select: { code: true } }, business: { select: { name: true, logoUrl: true, currency: true, timeZone: true } } } });
  if (!user) throw new AppError(401, "ACCOUNT_NOT_FOUND", "The authenticated account no longer exists.");
  response.json({ success: true, data: user });
});

router.patch("/me", authenticate, validate(z.object({ fullName: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().min(7).max(30).nullable().optional(), avatarUrl: z.url().refine((value) => value.startsWith("https://"), "Avatar URL must use HTTPS").nullable().optional() })), async (request, response) => {
  const user = await prisma.user.update({
    where: { id: request.auth!.userId },
    data: request.body,
    select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, businessId: true, status: true, role: { select: { code: true } }, business: { select: { name: true, logoUrl: true, currency: true, timeZone: true } } }
  });
  await writeAudit(prisma, request, { businessId: request.auth!.businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "USER_PROFILE_UPDATED", resourceType: "user", resourceId: request.auth!.userId });
  response.json({ success: true, data: user });
});

router.delete("/account", authenticate, async (request, response) => {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: request.auth!.userId }, data: { status: "DELETION_REQUESTED" } });
    await tx.session.updateMany({ where: { userId: request.auth!.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(tx, request, { businessId: request.auth!.businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "ACCOUNT_DELETION_REQUESTED", resourceType: "user", resourceId: request.auth!.userId });
  });
  response.clearCookie(refreshCookie, { ...cookieOptions, maxAge: undefined });
  response.status(202).json({ success: true, data: { message: "The account deletion request has been recorded for privacy review." } });
});

export { router as authRouter };
