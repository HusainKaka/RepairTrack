import { InventoryTransactionType, InvoiceStatus, PaymentStatus, type InvoiceItem, type Prisma, type PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../errors/app-error.js";
import { nextDocumentNumber } from "../../lib/identifiers.js";
import { getBusinessLogoDataUrl } from "../../lib/business-logo.js";
import { calculateInvoice } from "./invoice-calculation.js";
import { defaultLabourItem } from "./invoice-policy.js";

type TransactionClient = Prisma.TransactionClient;

export async function recalculateInvoice(tx: TransactionClient, invoiceId: string, invoiceDiscount?: number): Promise<void> {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice was not found.");
  const appliedInvoiceDiscount = invoiceDiscount ?? Number(invoice.invoiceLevelDiscount);
  const calculation = calculateInvoice(invoice.items.map((item) => ({ quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), taxRate: Number(item.taxRate), discount: Number(item.discount) })), appliedInvoiceDiscount);
  const amountPaid = Number(invoice.amountPaid);
  if (Math.round(calculation.total * 100) < Math.round(amountPaid * 100)) throw new AppError(409, "INVOICE_BELOW_PAYMENTS", "The revised total cannot be less than payments already recorded. A documented credit/refund is required first.");
  const balance = Math.max(Math.round((calculation.total - amountPaid) * 100) / 100, 0);
  const paymentStatus = balance === 0 ? PaymentStatus.PAID : amountPaid > 0 ? PaymentStatus.PARTIALLY_PAID : PaymentStatus.UNPAID;
  await tx.invoice.update({ where: { id: invoiceId }, data: { subtotal: calculation.subtotal, taxAmount: calculation.taxAmount, discountAmount: calculation.discountAmount, invoiceLevelDiscount: appliedInvoiceDiscount, total: calculation.total, balance, paymentStatus, status: invoice.status === InvoiceStatus.DRAFT ? InvoiceStatus.DRAFT : paymentStatus === PaymentStatus.PAID ? InvoiceStatus.PAID : paymentStatus === PaymentStatus.PARTIALLY_PAID ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.ISSUED } });
  if (invoice.repairId) await tx.repair.updateMany({ where: { id: invoice.repairId, businessId: invoice.businessId, status: "AWAITING_CUSTOMER_APPROVAL", deletedAt: null }, data: { approvalVersion: { increment: 1 } } });
}

/** Runs inside the invoice's serializable transaction: adjust only the stock delta. */
export async function reconcileInvoiceStock(tx: TransactionClient, invoice: { businessId: string; number: string; status: InvoiceStatus }, userId: string, previous: Pick<InvoiceItem, "inventoryItemId" | "quantity" | "stockDeductedAt" | "sourceType"> | null, next: { inventoryItemId?: string; quantity: number } | null): Promise<Date | null> {
  const oldId = previous?.stockDeductedAt ? previous.inventoryItemId : null;
  // Used repair parts belong to their consumption record, not an invoice correction.
  if (previous?.sourceType?.toLowerCase() === "repair_part" && (next?.inventoryItemId !== previous.inventoryItemId || next?.quantity !== Number(previous.quantity))) throw new AppError(409, "REPAIR_PART_STOCK_LOCKED", "Used-part quantities are tied to the repair consumption record and cannot be changed on the invoice. Prices and discounts can still be corrected.");
  const consume = invoice.status !== InvoiceStatus.DRAFT || Boolean(previous?.stockDeductedAt);
  const newId = consume ? next?.inventoryItemId : null;
  if (next?.inventoryItemId && !Number.isInteger(next.quantity)) throw new AppError(422, "INVENTORY_QUANTITY_WHOLE_NUMBER", "Inventory quantities on an invoice must be whole numbers.");
  const deltas = new Map<string, number>();
  if (oldId) deltas.set(oldId, Number(previous!.quantity));
  if (newId) deltas.set(newId, (deltas.get(newId) ?? 0) - next!.quantity);
  for (const [id, delta] of [...deltas].sort(([a], [b]) => a.localeCompare(b))) {
    if (!delta) continue;
    const inventory = await tx.inventoryItem.findFirst({ where: { id, businessId: invoice.businessId } });
    if (!inventory) throw new AppError(409, "INVENTORY_UNAVAILABLE", "The linked stock record is unavailable; no invoice changes were saved.");
    const quantityAfter = inventory.quantity + delta;
    if (quantityAfter < 0) throw new AppError(409, "INSUFFICIENT_STOCK", `${inventory.name} does not have enough stock for this invoice change.`);
    await tx.inventoryItem.update({ where: { id }, data: { quantity: quantityAfter } });
    await tx.inventoryTransaction.create({ data: { businessId: invoice.businessId, inventoryItemId: id, performedById: userId, type: delta > 0 ? InventoryTransactionType.RETURN : InventoryTransactionType.STOCK_OUT, quantityDelta: delta, quantityAfter, reference: invoice.number, notes: "Invoice amendment stock adjustment" } });
  }
  return newId ? previous?.stockDeductedAt ?? new Date() : null;
}

export async function ensureDraftInvoice(tx: TransactionClient, businessId: string, customerId: string, repairId: string): Promise<string> {
  const existing = await tx.invoice.findFirst({ where: { businessId, repairId, status: InvoiceStatus.DRAFT, deletedAt: null } });
  if (existing) return existing.id;
  const number = await nextDocumentNumber(tx, businessId, "invoice", "INV");
  const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { defaultLabourCharge: true, taxRate: true } });
  const labour = defaultLabourItem(business.defaultLabourCharge, business.taxRate);
  const calculation = labour.unitPrice > 0 ? calculateInvoice([labour]) : null;
  const created = await tx.invoice.create({ data: { businessId, customerId, repairId, number, subtotal: calculation?.subtotal ?? 0, taxAmount: calculation?.taxAmount ?? 0, discountAmount: calculation?.discountAmount ?? 0, total: calculation?.total ?? 0, balance: calculation?.total ?? 0, items: labour.unitPrice > 0 ? { create: [{ businessId, repairId, description: labour.description, quantity: labour.quantity, unitPrice: labour.unitPrice, taxRate: labour.taxRate, discount: labour.discount, lineTotal: calculation!.lines[0]!.lineTotal, itemType: labour.itemType }] } : undefined } });
  return created.id;
}

export async function getInvoiceForAccess(client: PrismaClient, invoiceId: string, businessId: string, customerUserId?: string) {
  const invoice = await client.invoice.findFirst({
    where: { id: invoiceId, businessId, deletedAt: null, ...(customerUserId ? { customer: { userId: customerUserId } } : {}) },
    include: { business: { include: { taxSettings: { select: { etimsEnabled: true } } } }, customer: true, repair: { include: { device: true } }, digitalTicket: { select: { id: true, reference: true, kind: true, title: true, status: true } }, items: true, payments: { orderBy: { paidAt: "asc" } }, receipts: true }
  });
  if (!invoice) return null;
  return { ...invoice, business: { ...invoice.business, logoImageUrl: await getBusinessLogoDataUrl(invoice.businessId) } };
}
