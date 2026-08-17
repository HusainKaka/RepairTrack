import { Prisma } from "../generated/prisma/index.js";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";

export function notFoundHandler(_request: Request, _response: Response, next: NextFunction): void {
  next(new AppError(404, "ROUTE_NOT_FOUND", "The requested endpoint does not exist."));
}

export function errorHandler(error: unknown, request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    response.status(error.status).json({ success: false, code: error.code, message: error.message, errors: error.details ?? {}, requestId: request.requestId });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    response.status(409).json({ success: false, code: "DUPLICATE_RESOURCE", message: "A record with these details already exists.", errors: {}, requestId: request.requestId });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({ success: false, code: "INVALID_JSON", message: "The request body contains invalid JSON.", errors: {}, requestId: request.requestId });
    return;
  }
  if (process.env.NODE_ENV !== "test") console.error(`[${request.requestId}]`, error);
  response.status(500).json({ success: false, code: "INTERNAL_ERROR", message: "The request could not be completed.", errors: {}, requestId: request.requestId });
}
