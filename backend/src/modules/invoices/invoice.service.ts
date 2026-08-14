import { InvoiceStatus, PaymentStatus, type Prisma, type PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../errors/app-error.js";
import { nextDocumentNumber } from "../../lib/identifiers.js";
import { calculateInvoice } from "./invoice-calculation.js";

type TransactionClient = Prisma.TransactionClient;

export async function recalculateInvoice(tx: TransactionClient, invoiceId: string, invoiceDiscount = 0): Promise<void> {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice was not found.");
  const calculation = calculateInvoice(invoice.items.map((item) => ({ quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), taxRate: Number(item.taxRate), discount: Number(item.discount) })), invoiceDiscount);
  const amountPaid = Number(invoice.amountPaid);
  const balance = Math.max(calculation.total - amountPaid, 0);
  const paymentStatus = balance === 0 ? PaymentStatus.PAID : amountPaid > 0 ? PaymentStatus.PARTIALLY_PAID : PaymentStatus.UNPAID;
  await tx.invoice.update({ where: { id: invoiceId }, data: { subtotal: calculation.subtotal, taxAmount: calculation.taxAmount, discountAmount: calculation.discountAmount, total: calculation.total, balance, paymentStatus, status: paymentStatus === PaymentStatus.PAID ? InvoiceStatus.PAID : invoice.status === InvoiceStatus.PAID ? InvoiceStatus.ISSUED : invoice.status } });
}

export async function ensureDraftInvoice(tx: TransactionClient, businessId: string, customerId: string, repairId: string): Promise<string> {
  const existing = await tx.invoice.findFirst({ where: { businessId, repairId, status: InvoiceStatus.DRAFT, deletedAt: null } });
  if (existing) return existing.id;
  const number = await nextDocumentNumber(tx, businessId, "invoice", "INV");
  const created = await tx.invoice.create({ data: { businessId, customerId, repairId, number } });
  return created.id;
}

export async function getInvoiceForAccess(client: PrismaClient, invoiceId: string, businessId: string, customerUserId?: string) {
  return client.invoice.findFirst({
    where: { id: invoiceId, businessId, deletedAt: null, ...(customerUserId ? { customer: { userId: customerUserId } } : {}) },
    include: { business: true, customer: true, repair: { include: { device: true } }, items: true, payments: { orderBy: { paidAt: "asc" } }, receipts: true }
  });
}
