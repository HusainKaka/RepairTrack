import { PaymentMethod } from "../src/generated/prisma/index.js";
import { describe, expect, it } from "vitest";
import { validateManualPaymentEvidence } from "../src/modules/invoices/payment-provider.js";

describe("payment provider boundary", () => {
  it("requires independently verified evidence for manually recorded M-Pesa payments", () => {
    expect(() => validateManualPaymentEvidence(PaymentMethod.MPESA)).toThrowError(/verified M-Pesa transaction reference/i);
    expect(() => validateManualPaymentEvidence(PaymentMethod.MPESA, "QH12ABC345")).not.toThrow();
  });

  it("does not invent provider confirmation for non-provider payment methods", () => {
    expect(() => validateManualPaymentEvidence(PaymentMethod.CASH)).not.toThrow();
  });
});
