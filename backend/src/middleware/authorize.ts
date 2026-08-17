import type { RoleCode } from "../generated/prisma/index.js";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";

export const authorize = (...roles: RoleCode[]) => (request: Request, _response: Response, next: NextFunction): void => {
  if (!request.auth) return next(new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
  if (!roles.includes(request.auth.role)) return next(new AppError(403, "FORBIDDEN", "You do not have permission to perform this action."));
  next();
};

export function requireBusiness(request: Request): string {
  if (!request.auth?.businessId) throw new AppError(403, "BUSINESS_CONTEXT_REQUIRED", "A business account is required for this action.");
  return request.auth.businessId;
}
