import { AccountStatus, type RoleCode } from "../generated/prisma/index.js";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";

interface AccessClaims extends jwt.JwtPayload {
  sub: string;
  sid: string;
  role: RoleCode;
  businessId: string | null;
  type: "access";
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signAccessToken(claims: Pick<AccessClaims, "sub" | "sid" | "role" | "businessId">): string {
  return jwt.sign(
    { sid: claims.sid, role: claims.role, businessId: claims.businessId, type: "access" },
    env.JWT_SECRET,
    { subject: claims.sub, expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`, issuer: "repairtrack-api", audience: "repairtrack-clients" }
  );
}

export async function authenticate(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const authorization = request.get("authorization");
  if (!authorization?.startsWith("Bearer ")) { next(new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.")); return; }
  let claims: AccessClaims;
  try {
    claims = jwt.verify(authorization.slice(7), env.JWT_SECRET, {
      issuer: "repairtrack-api",
      audience: "repairtrack-clients",
      algorithms: ["HS256"]
    }) as AccessClaims;
    if (claims.type !== "access" || typeof claims.sub !== "string" || typeof claims.sid !== "string" || !uuid.test(claims.sub) || !uuid.test(claims.sid)) throw new Error("Invalid token claims");
  } catch {
    next(new AppError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired."));
    return;
  }
  try {
    const session = await prisma.session.findFirst({ where: { id: claims.sid, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: { include: { role: true, business: { select: { status: true, deletedAt: true } } } } } });
    const user = session?.user;
    if (!session || !user || user.status !== AccountStatus.ACTIVE || user.deletedAt || (user.businessId && (!user.business || user.business.status !== "ACTIVE" || user.business.deletedAt))) {
      next(new AppError(401, "SESSION_INACTIVE", "The session is no longer active. Sign in again.")); return;
    }
    if (claims.role !== user.role.code || claims.businessId !== user.businessId) {
      await prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
      next(new AppError(401, "SESSION_CONTEXT_CHANGED", "Your permissions changed. Sign in again.")); return;
    }
    // Current database permissions, not stale JWT roles, authorize each request.
    request.auth = { userId: user.id, sessionId: session.id, role: user.role.code, businessId: user.businessId };
    next();
  } catch (error) {
    next(error); // Database failures fail closed, never bypass the session check.
  }
}
