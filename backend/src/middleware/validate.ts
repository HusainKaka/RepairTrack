import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors/app-error.js";

export const validate = (schema: ZodType, target: "body" | "query" | "params" = "body") =>
  (request: Request, _response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request[target]);
    if (!result.success) {
      return next(new AppError(422, "VALIDATION_ERROR", "The request could not be completed.", result.error.flatten()));
    }
    request[target] = result.data;
    next();
  };

export function routeParam(value: string | string[] | undefined, name = "identifier"): string {
  if (typeof value !== "string" || !value) throw new AppError(400, "INVALID_ROUTE_PARAMETER", `The ${name} is invalid.`);
  return value;
}
