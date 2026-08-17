import { PaymentMethod } from "../../generated/prisma/index.js";
import { AppError } from "../../errors/app-error.js";

export interface MpesaInitiation {
  merchantRequestId: string;
  checkoutRequestId: string;
  customerMessage: string;
}

export interface MpesaResult {
  status: "PENDING" | "CONFIRMED" | "FAILED";
  providerReference?: string;
  failureReason?: string;
}

export interface MpesaGateway {
  initiate(input: { amount: number; phone: string; accountReference: string; idempotencyKey: string }): Promise<MpesaInitiation>;
  query(checkoutRequestId: string): Promise<MpesaResult>;
}

export function validateManualPaymentEvidence(method: PaymentMethod, transactionReference?: string): void {
  if (method === PaymentMethod.MPESA && !transactionReference?.trim()) throw new AppError(422, "MPESA_REFERENCE_REQUIRED", "Enter a verified M-Pesa transaction reference before recording this payment.");
}
