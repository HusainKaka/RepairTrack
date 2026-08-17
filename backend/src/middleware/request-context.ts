import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const supplied = request.get("x-request-id");
  request.requestId = supplied && supplied.length <= 100 ? supplied : randomUUID();
  response.setHeader("x-request-id", request.requestId);
  next();
}

