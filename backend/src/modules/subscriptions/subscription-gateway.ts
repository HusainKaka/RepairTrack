import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

export interface NormalizedSubscriptionEvent {
  eventId: string;
  businessId: string;
  subscriptionId: string;
  transactionId: string;
  status: "SUCCESS" | "FAILED";
  amount: number;
  currency: string;
  paidAt?: string;
}

export function verifyGatewaySignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.PAYMENT_GATEWAY_WEBHOOK_SECRET || !signature) return false;
  const provided = signature.replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = createHmac("sha256", env.PAYMENT_GATEWAY_WEBHOOK_SECRET).update(rawBody).digest();
  const supplied = Buffer.from(provided, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

