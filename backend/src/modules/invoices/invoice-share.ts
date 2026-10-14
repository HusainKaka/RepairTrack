import { createHmac, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";

export const INVOICE_SHARE_MAX_SECONDS = 7 * 24 * 60 * 60;
const issuer = "repairtrack-invoice-share";
const audience = "repairtrack-public-invoice-pdf";
const purpose = "invoice-pdf";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const signingKey = () => createHmac("sha256", env.JWT_SECRET).update("repairtrack:invoice-pdf-share:v1", "utf8").digest();
const invalid = () => new AppError(401, "INVALID_INVOICE_SHARE_LINK", "This invoice link is invalid or expired. Ask the business for a new link.");

export function createInvoiceShareToken(invoiceId: string, businessId: string, now = new Date()): { token: string; expiresAt: string } {
  if (!uuid.test(invoiceId) || !uuid.test(businessId) || !Number.isFinite(now.getTime())) throw invalid();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + INVOICE_SHARE_MAX_SECONDS;
  const token = jwt.sign({ purpose, businessId, iat: issuedAt, exp: expiresAt }, signingKey(), { algorithm: "HS256", issuer, audience, subject: invoiceId, jwtid: randomUUID() });
  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export function verifyInvoiceShareToken(token: string, now = new Date()): { invoiceId: string; businessId: string } {
  try {
    if (token.length > 1200 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || !Number.isFinite(now.getTime())) throw invalid();
    const currentTime = Math.floor(now.getTime() / 1000);
    const claims = jwt.verify(token, signingKey(), { algorithms: ["HS256"], issuer, audience, clockTimestamp: currentTime, maxAge: `${INVOICE_SHARE_MAX_SECONDS}s` });
    if (typeof claims !== "object" || claims.purpose !== purpose || typeof claims.sub !== "string" || !uuid.test(claims.sub) || typeof claims.businessId !== "string" || !uuid.test(claims.businessId) || typeof claims.jti !== "string" || !uuid.test(claims.jti)
      || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.iat! > currentTime || claims.exp! <= claims.iat! || claims.exp! - claims.iat! > INVOICE_SHARE_MAX_SECONDS) throw invalid();
    return { invoiceId: claims.sub, businessId: claims.businessId };
  } catch { throw invalid(); }
}

export const invoiceShareUrl = (token: string): string => `${env.PUBLIC_WEB_URL.replace(/\/$/, "")}/api/v1/invoices/shared/${encodeURIComponent(token)}`;
