import { InvoiceStatus, KraEtimsStatus } from "../../generated/prisma/index.js";

export function invoiceCanBeEdited(input: { status: InvoiceStatus; amountPaid: unknown; kraStatus: KraEtimsStatus }): boolean {
  return input.status === InvoiceStatus.DRAFT && Number(input.amountPaid) === 0 && input.kraStatus !== KraEtimsStatus.SUBMITTED && input.kraStatus !== KraEtimsStatus.CONFIRMED;
}

export function invoiceDeletionAction(input: { status: InvoiceStatus; amountPaid: unknown; kraStatus: KraEtimsStatus }): "DELETE" | "VOID" {
  return invoiceCanBeEdited(input) ? "DELETE" : "VOID";
}

export function defaultLabourItem(amount: unknown, taxRate: unknown) {
  return { description: "Labour Charge", quantity: 1, unitPrice: Number(amount), taxRate: Number(taxRate), discount: 0, itemType: "LABOUR" as const };
}
