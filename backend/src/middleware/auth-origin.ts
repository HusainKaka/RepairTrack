import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export function authOrigin(request: Request, _response: Response, next: NextFunction): void {
  const origin = request.get("origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && ((origin && origin !== new URL(env.WEB_ORIGIN).origin) || (!origin && request.get("sec-fetch-site") === "cross-site"))) {
    next(new AppError(403, "UNTRUSTED_ORIGIN", "Authentication requests must come from the configured web app.")); return;
  }
  next();
}
