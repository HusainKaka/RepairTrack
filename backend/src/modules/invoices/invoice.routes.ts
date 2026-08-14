import { InvoiceStatus, PaymentMethod, PaymentStatus, RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { nextDocumentNumber } from "../../lib/identifiers.js";
import { mailProvider } from "../../lib/mail.js";
import { renderInvoicePdf, renderReceiptPdf } from "../../lib/pdf.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";
import { calculateInvoice } from "./invoice-calculation.js";
import { getInvoiceForAccess } from "./invoice.service.js";
import { validateManualPaymentEvidence } from "./payment-provider.js";
import { notifyInvoiceEvent } from "../notifications/notification.service.js";

const router = Router();
router.use(authenticate);

const itemSchema = z.object({ description: z.string().trim().min(1).max(500), quantity: z.number().positive().max(10000), unitPrice: z.number().nonnegative(), taxRate: z.number().min(0).max(100).default(0), discount: z.number().nonnegative().default(0) });
const invoiceSchema = z.object({ customerId: z.uuid(), repairId: z.uuid().optional(), dueAt: z.iso.datetime().optional(), invoiceDiscount: z.number().nonnegative().default(0), terms: z.string().trim().max(2000).optional(), items: z.array(itemSchema).min(1).max(100) });

router.get("/", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const invoices = await prisma.invoice.findMany({ where: { businessId, deletedAt: null, ...(request.auth!.role === RoleCode.CUSTOMER ? { customer: { userId: request.auth!.userId } } : {}) }, include: { customer: { select: { id: true, fullName: true } }, repair: { select: { id: true, reference: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ success: true, data: invoices });
});

router.post("/", authorize(RoleCode.BUSINESS_ADMIN), validate(invoiceSchema), async (request, response) => {
  const businessId = requireBusiness(request);
  const input = request.body as z.infer<typeof invoiceSchema>;
  const calculation = calculateInvoice(input.items, input.invoiceDiscount);
  const [customer, repair] = await Promise.all([
    prisma.customer.findFirst({ where: { id: input.customerId, businessId, deletedAt: null } }),
    input.repairId ? prisma.repair.findFirst({ where: { id: input.repairId, businessId, customerId: input.customerId, deletedAt: null } }) : Promise.resolve(null)
  ]);
  if (!customer) throw notFound("Customer");
  if (input.repairId && !repair) throw new AppError(422, "INVALID_REPAIR", "The repair does not belong to the selected customer.");
  const invoice = await prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, businessId, "invoice", "INV");
    const created = await tx.invoice.create({ data: { businessId, customerId: input.customerId, repairId: input.repairId, number, dueAt: input.dueAt ? new Date(input.dueAt) : undefined, subtotal: calculation.subtotal, taxAmount: calculation.taxAmount, discountAmount: calculation.discountAmount, total: calculation.total, balance: calculation.total, terms: input.terms, items: { create: input.items.map((item, index) => ({ businessId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, discount: item.discount, lineTotal: calculation.lines[index]!.lineTotal })) } } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_CREATED", resourceType: "invoice", resourceId: created.id, metadata: { number } });
    return created;
  }, { isolationLevel: "Serializable" });
  response.status(201).json({ success: true, data: invoice });
});

router.get("/:id", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.CUSTOMER), async (request, response) => {
  const invoice = await getInvoiceForAccess(prisma, routeParam(request.params.id), requireBusiness(request), request.auth!.role === RoleCode.CUSTOMER ? request.auth!.userId : undefined);
  if (!invoice) throw notFound("Invoice");
  response.json({ success: true, data: invoice });
});

router.post("/:id/issue", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const invoice = await prisma.invoice.findFirst({ where: { id: routeParam(request.params.id), businessId, status: InvoiceStatus.DRAFT, deletedAt: null } });
  if (!invoice) throw notFound("Draft invoice");
  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.ISSUED, issuedAt: new Date() } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_ISSUED", resourceType: "invoice", resourceId: invoice.id });
  await notifyInvoiceEvent(updated.id, "ISSUED");
  response.json({ success: true, data: updated });
});

router.get("/:id/pdf", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const invoice = await getInvoiceForAccess(prisma, routeParam(request.params.id), businessId, request.auth!.role === RoleCode.CUSTOMER ? request.auth!.userId : undefined);
  if (!invoice) throw notFound("Invoice");
  const pdf = await renderInvoicePdf(invoice, invoice.repair ? `${env.PUBLIC_WEB_URL}/repairs/${invoice.repair.id}` : `${env.PUBLIC_WEB_URL}/invoices/${invoice.id}`);
  response.setHeader("content-type", "application/pdf");
  response.setHeader("content-disposition", `attachment; filename="${invoice.number}.pdf"`);
  response.send(pdf);
});

router.post("/:id/email", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const invoice = await getInvoiceForAccess(prisma, routeParam(request.params.id), businessId);
  if (!invoice || !invoice.customer.email) throw new AppError(422, "CUSTOMER_EMAIL_REQUIRED", "The customer does not have an email address.");
  const pdf = await renderInvoicePdf(invoice, `${env.PUBLIC_WEB_URL}/invoices/${invoice.id}`);
  const sent = await mailProvider.send({ to: invoice.customer.email, subject: `Invoice ${invoice.number} from ${invoice.business.name}`, text: `Your invoice ${invoice.number} is attached. Balance: ${invoice.business.currency} ${Number(invoice.balance).toFixed(2)}.`, attachments: [{ filename: `${invoice.number}.pdf`, content: pdf, contentType: "application/pdf" }] });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_EMAILED", resourceType: "invoice", resourceId: invoice.id, metadata: { providerId: sent.providerId } });
  response.status(202).json({ success: true, data: { providerId: sent.providerId } });
});

router.post("/:id/payments", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ amount: z.number().positive(), method: z.enum(PaymentMethod), customMethod: z.string().trim().max(80).optional(), transactionReference: z.string().trim().max(160).optional(), notes: z.string().trim().max(500).optional(), paperWidth: z.enum(["58mm", "80mm", "A4"]).default("A4") })), async (request, response) => {
  const businessId = requireBusiness(request);
  if (request.body.method === PaymentMethod.OTHER && !request.body.customMethod) throw new AppError(422, "CUSTOM_PAYMENT_METHOD_REQUIRED", "Enter the custom payment method.");
  validateManualPaymentEvidence(request.body.method, request.body.transactionReference);
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, status: { notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT] } }, include: { repair: { select: { id: true, status: true } } } });
    if (!invoice) throw notFound("Issued invoice");
    const amount = request.body.amount;
    if (amount > Number(invoice.balance)) throw new AppError(409, "PAYMENT_EXCEEDS_BALANCE", "The payment exceeds the outstanding balance.");
    const number = await nextDocumentNumber(tx, businessId, "payment", "PAY");
    const payment = await tx.payment.create({ data: { businessId, invoiceId: invoice.id, customerId: invoice.customerId, recordedById: request.auth!.userId, number, amount, method: request.body.method, customMethod: request.body.customMethod, transactionReference: request.body.transactionReference, notes: request.body.notes } });
    const amountPaid = Number(invoice.amountPaid) + amount;
    const balance = Math.max(Number(invoice.total) - amountPaid, 0);
    const paymentStatus = balance === 0 ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;
    const updatedInvoice = await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, balance, paymentStatus, status: balance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID } });
    const receiptNumber = await nextDocumentNumber(tx, businessId, "receipt", "RCT");
    const receipt = await tx.receipt.create({ data: { businessId, paymentId: payment.id, invoiceId: invoice.id, repairId: invoice.repair?.id, issuedById: request.auth!.userId, number: receiptNumber, paperWidth: request.body.paperWidth, statusSnapshot: invoice.repair?.status } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "PAYMENT_RECORDED", resourceType: "payment", resourceId: payment.id, metadata: { invoiceId: invoice.id, amount, method: payment.method, receiptId: receipt.id } });
    return { payment, invoice: updatedInvoice, receipt };
  }, { isolationLevel: "Serializable" });
  await notifyInvoiceEvent(result.invoice.id, "PAYMENT_RECORDED", Number(result.payment.amount));
  response.status(201).json({ success: true, data: result });
});

router.get("/receipts/:receiptId/pdf", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const receipt = await prisma.receipt.findFirst({ where: { id: routeParam(request.params.receiptId), businessId, ...(request.auth!.role === RoleCode.CUSTOMER ? { invoice: { customer: { userId: request.auth!.userId } } } : {}) }, include: { business: true, payment: true, issuedBy: { select: { fullName: true } }, invoice: { include: { customer: true } }, repair: true } });
  if (!receipt) throw notFound("Receipt");
  if (receipt.repair && receipt.statusSnapshot !== receipt.repair.status) await prisma.receipt.update({ where: { id: receipt.id }, data: { statusSnapshot: receipt.repair.status } });
  const width = (request.query.paperWidth === "58mm" || request.query.paperWidth === "80mm" || request.query.paperWidth === "A4") ? request.query.paperWidth : (receipt.paperWidth === "58mm" || receipt.paperWidth === "80mm" ? receipt.paperWidth : "A4");
  const pdf = await renderReceiptPdf(receipt, width);
  response.setHeader("content-type", "application/pdf");
  response.setHeader("content-disposition", `attachment; filename="${receipt.number}-${width}.pdf"`);
  response.send(pdf);
});

router.post("/:id/cancel", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const invoice = await prisma.invoice.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null } });
  if (!invoice) throw notFound("Invoice");
  if (Number(invoice.amountPaid) > 0) throw new AppError(409, "PAID_INVOICE_CANNOT_BE_CANCELLED", "Reverse recorded payments before cancelling this invoice.");
  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.CANCELLED } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_CANCELLED", resourceType: "invoice", resourceId: invoice.id });
  response.json({ success: true, data: updated });
});

export { router as invoiceRouter };
