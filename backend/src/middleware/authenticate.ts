import type { RoleCode } from "../generated/prisma/index.js";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

interface AccessClaims extends jwt.JwtPayload {
  sub: string;
  sid: string;
  role: RoleCode;
  businessId: string | null;
  type: "access";
}

export function signAccessToken(claims: Pick<AccessClaims, "sub" | "sid" | "role" | "businessId">): string {
  return jwt.sign(
    { sid: claims.sid, role: claims.role, businessId: claims.businessId, type: "access" },
    env.JWT_SECRET,
    { subject: claims.sub, expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`, issuer: "repairtrack-api", audience: "repairtrack-clients" }
  );
}

export function authenticate(request: Request, _response: Response, next: NextFunction): void {
  const authorization = request.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return next(new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
  try {
    const claims = jwt.verify(authorization.slice(7), env.JWT_SECRET, {
      issuer: "repairtrack-api",
      audience: "repairtrack-clients"
    }) as AccessClaims;
    if (claims.type !== "access" || !claims.sub || !claims.sid) throw new Error("Invalid token type");
    request.auth = { userId: claims.sub, sessionId: claims.sid, role: claims.role, businessId: claims.businessId };
    next();
  } catch {
    next(new AppError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired."));
  }
}
