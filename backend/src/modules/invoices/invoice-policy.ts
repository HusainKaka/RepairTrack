import { InvoiceStatus, KraEtimsStatus, type InvoiceItemType } from "../../generated/prisma/index.js";

export function digitalInvoiceItemAllowed(input: { itemType: InvoiceItemType; inventoryItemId?: string | null }): boolean {
  return !input.inventoryItemId && (input.itemType === "SERVICE" || input.itemType === "CUSTOM");
}

/** Display metadata is optional; disabled KRA setup must not appear on customer documents. */
export function invoiceDisplayView(value: unknown, enabled?: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => invoiceDisplayView(item, enabled));
  if (!value || typeof value !== "object" || value instanceof Date || typeof (value as { toJSON?: unknown }).toJSON === "function") return value;
  const record = value as Record<string, any>;
  const kraEnabled = enabled ?? record.business?.taxSettings?.etimsEnabled === true;
  return Object.fromEntries(Object.entries(record).filter(([key]) => kraEnabled || !["kraStatus", "kraReference", "kraPin", "taxPin", "kraSubmissions"].includes(key)).map(([key, item]) => [key, invoiceDisplayView(item, kraEnabled)]));
}

export function invoiceCanBeEdited(input: { status: InvoiceStatus; amountPaid: unknown; kraStatus: KraEtimsStatus }): boolean {
  return input.status === InvoiceStatus.DRAFT && Number(input.amountPaid) === 0 && input.kraStatus !== KraEtimsStatus.SUBMITTED && input.kraStatus !== KraEtimsStatus.CONFIRMED;
}

export function invoiceDeletionAction(input: { status: InvoiceStatus; amountPaid: unknown; kraStatus: KraEtimsStatus }): "DELETE" | "VOID" {
  return invoiceCanBeEdited(input) ? "DELETE" : "VOID";
}

export function defaultLabourItem(amount: unknown, taxRate: unknown) {
  return { description: "Labour Charge", quantity: 1, unitPrice: Number(amount), taxRate: Number(taxRate), discount: 0, itemType: "LABOUR" as const };
}
