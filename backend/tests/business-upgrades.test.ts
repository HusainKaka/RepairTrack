import { CustomerNotificationPreference, InvoiceItemType, InvoiceStatus, KraEtimsStatus, RepairStatus, SubscriptionBillingCycle } from "../src/generated/prisma/index.js";
import { describe, expect, it } from "vitest";
import { decryptPublicToken, encryptPublicToken } from "../src/lib/crypto.js";
import { tenantWhere } from "../src/lib/tenant.js";
import { defaultLabourItem, invoiceCanBeEdited, invoiceDeletionAction } from "../src/modules/invoices/invoice-policy.js";
import { repairNotificationEvent, shouldSendRepairMessage } from "../src/modules/notifications/notification-policy.js";
import { calculateCashBasisProfit } from "../src/modules/reports/profit-calculation.js";
import { hasFeature, paymentMatchesPlan, subscriptionPeriodEnd } from "../src/modules/subscriptions/subscription.service.js";

describe("major business upgrade policies", () => {
  it("applies the configurable default labour line", () => {
    expect(defaultLabourItem("1500.00", "16.00")).toEqual({ description: "Labour Charge", quantity: 1, unitPrice: 1500, taxRate: 16, discount: 0, itemType: "LABOUR" });
  });

  it("allows only unpaid pre-eTIMS drafts to be edited or hard deleted", () => {
    expect(invoiceCanBeEdited({ status: InvoiceStatus.DRAFT, amountPaid: 0, kraStatus: KraEtimsStatus.NOT_REQUIRED })).toBe(true);
    expect(invoiceDeletionAction({ status: InvoiceStatus.ISSUED, amountPaid: 0, kraStatus: KraEtimsStatus.PENDING })).toBe("VOID");
    expect(invoiceCanBeEdited({ status: InvoiceStatus.DRAFT, amountPaid: 1, kraStatus: KraEtimsStatus.NOT_REQUIRED })).toBe(false);
    expect(invoiceCanBeEdited({ status: InvoiceStatus.DRAFT, amountPaid: 0, kraStatus: KraEtimsStatus.CONFIRMED })).toBe(false);
  });

  it("uses authenticated encryption for recoverable private tracking links", () => {
    const token = "customer-private-token-with-enough-entropy";
    const encrypted = encryptPublicToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptPublicToken(encrypted)).toBe(token);
    expect(() => decryptPublicToken(`${encrypted.slice(0, -1)}x`)).toThrow();
  });

  it("limits email to intake and one terminal message while WhatsApp follows milestones", () => {
    const emailEvents = [RepairStatus.RECEIVED, RepairStatus.DIAGNOSING, RepairStatus.AWAITING_CUSTOMER_APPROVAL, RepairStatus.IN_PROGRESS, RepairStatus.COMPLETED]
      .map(repairNotificationEvent).filter((event): event is NonNullable<typeof event> => event !== null)
      .filter((event) => shouldSendRepairMessage(CustomerNotificationPreference.EMAIL, event));
    expect(emailEvents).toEqual(["RECEIVED", "COMPLETED"]);
    expect(shouldSendRepairMessage(CustomerNotificationPreference.WHATSAPP, "APPROVAL_REQUIRED")).toBe(true);
  });

  it("calculates cash-basis profit from collected revenue, historical parts cost, and expenses", () => {
    const result = calculateCashBasisProfit([{ amount: 6000, invoiceTotal: 6000, items: [{ itemType: InvoiceItemType.LABOUR, lineTotal: 3000, quantity: 1 }, { itemType: InvoiceItemType.INVENTORY, lineTotal: 3000, quantity: 2, historicalUnitCost: 500 }] }], [{ amount: 400, utility: true }, { amount: 600, utility: false }]);
    expect(result).toMatchObject({ revenue: 6000, labourRevenue: 3000, partsRevenue: 3000, costOfParts: 1000, operatingExpenses: 1000, operatingProfit: 4000, methodology: "CASH_BASIS" });
  });

  it("protects tenant scope even if a caller tries to replace businessId", () => {
    expect(tenantWhere("tenant-a", { businessId: "tenant-b", status: "ACTIVE" })).toEqual({ businessId: "tenant-a", status: "ACTIVE" });
  });

  it("validates subscription periods, prices, currencies, and feature flags", () => {
    expect(subscriptionPeriodEnd(new Date("2026-01-15T00:00:00Z"), SubscriptionBillingCycle.ANNUAL).toISOString()).toBe("2027-01-15T00:00:00.000Z");
    expect(paymentMatchesPlan({ amount: 1500, currency: "kes", expectedAmount: 1500, expectedCurrency: "KES" })).toBe(true);
    expect(paymentMatchesPlan({ amount: 1499, currency: "KES", expectedAmount: 1500, expectedCurrency: "KES" })).toBe(false);
    expect(hasFeature({ reports: true }, "reports")).toBe(true);
  });
});
