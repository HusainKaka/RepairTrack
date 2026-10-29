import { InventoryTransactionType, InvoiceItemType, InvoiceStatus, KraEtimsStatus, PaymentMethod, PaymentStatus, RoleCode, type Prisma } from "../../generated/prisma/index.js";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { decryptPublicToken } from "../../lib/crypto.js";
import { nextDocumentNumber } from "../../lib/identifiers.js";
import { mailProvider } from "../../lib/mail.js";
import { renderInvoicePdf, renderReceiptPdf } from "../../lib/pdf.js";
import { prisma } from "../../lib/prisma.js";
import { customerView } from "../../lib/customer-view.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";
import { emailLogoForBusiness, notifyInvoiceEvent } from "../notifications/notification.service.js";
import { renderCustomerEmail } from "../notifications/email-templates.js";
import { calculateInvoice, MAX_INVOICE_MONEY } from "./invoice-calculation.js";
import { defaultLabourItem, digitalInvoiceItemAllowed, invoiceCanBeEdited, invoiceDeletionAction, invoiceDisplayView } from "./invoice-policy.js";
import { getInvoiceForAccess, recalculateInvoice, reconcileInvoiceStock } from "./invoice.service.js";
import { submitInvoiceToEtims } from "./kra-etims.service.js";
import { validateManualPaymentEvidence } from "./payment-provider.js";
import { createInvoiceShareToken, invoiceShareUrl, verifyInvoiceShareToken } from "./invoice-share.js";

const router = Router();
const shareableStatuses = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID];
const publicShareLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });
const shareCreationLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: (request) => `${request.auth!.businessId}:${request.auth!.userId}`,
  message: { success: false, code: "SHARE_LINK_RATE_LIMIT", message: "Too many invoice sharing links. Please wait and try again." },
});

// This is the only anonymous invoice route; normal invoices remain behind authenticate.
router.get("/shared/:token", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
}, publicShareLimiter, validate(z.object({ token: z.string().min(16).max(1200) }), "params"), async (request, response) => {
  const claims = verifyInvoiceShareToken(routeParam(request.params.token));
  const invoice = await prisma.invoice.findFirst({
    where: { id: claims.invoiceId, businessId: claims.businessId, deletedAt: null, status: { in: shareableStatuses }, business: { status: "ACTIVE", deletedAt: null } },
    include: { business: { include: { taxSettings: { select: { etimsEnabled: true } } } }, customer: true, repair: { include: { device: true } }, digitalTicket: { select: { reference: true, title: true } }, items: true },
  });
  if (!invoice) throw notFound("Shared invoice");
  const pdf = await renderInvoicePdf(invoice, invoiceShareUrl(routeParam(request.params.token)));
  response.setHeader("content-type", "application/pdf");
  response.setHeader("content-disposition", `attachment; filename="${invoice.number}.pdf"`);
  response.send(pdf);
});
router.use(authenticate);

const itemSchema = z.object({
  description: z.string().trim().min(1).max(500).optional(),
  quantity: z.number().positive().max(10_000),
  unitPrice: z.number().nonnegative().max(MAX_INVOICE_MONEY).optional(),
  taxRate: z.number().min(0).max(100).default(0),
  discount: z.number().nonnegative().max(MAX_INVOICE_MONEY).default(0),
  itemType: z.enum(InvoiceItemType).default(InvoiceItemType.CUSTOM),
  inventoryItemId: z.uuid().optional(),
});
const amendmentFields = { changeReason: z.string().trim().min(3).max(500).optional() };

const invoiceSchema = z.object({
  customerId: z.uuid(), repairId: z.uuid().optional(), digitalTicketId: z.uuid().optional(), dueAt: z.iso.datetime().optional(), invoiceDiscount: z.number().nonnegative().default(0),
  terms: z.string().trim().max(2000).optional(), notes: z.string().trim().max(2000).optional(), items: z.array(itemSchema).max(100).default([]),
}).superRefine((input, context) => {
  if (input.repairId && input.digitalTicketId) context.addIssue({ code: "custom", path: ["digitalTicketId"], message: "An invoice can belong to a repair or a digital ticket, not both." });
  if (input.digitalTicketId && (!input.items.length || input.items.some((item) => !digitalInvoiceItemAllowed(item)))) context.addIssue({ code: "custom", path: ["items"], message: "Digital invoices require manually entered service or custom items; inventory and automatic labour are not allowed." });
});

interface ResolvedItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  itemType: InvoiceItemType;
  inventoryItemId?: string;
  historicalUnitCost?: number;
}

async function resolveItem(businessId: string, allowPriceOverride: boolean, input: z.infer<typeof itemSchema>, client: Pick<Prisma.TransactionClient, "inventoryItem"> = prisma): Promise<ResolvedItem> {
  if (!input.inventoryItemId) {
    if (!input.description || input.unitPrice === undefined) throw new AppError(422, "INVOICE_ITEM_INCOMPLETE", "Enter a description and unit price for this invoice item.");
    return { description: input.description, quantity: input.quantity, unitPrice: input.unitPrice, taxRate: input.taxRate, discount: input.discount, itemType: input.itemType };
  }
  const inventory = await client.inventoryItem.findFirst({ where: { id: input.inventoryItemId, businessId, deletedAt: null, isActive: true } });
  if (!inventory) throw notFound("Inventory item");
  const requestedPrice = input.unitPrice ?? Number(inventory.sellingPrice);
  if (!allowPriceOverride && requestedPrice !== Number(inventory.sellingPrice)) throw new AppError(403, "PRICE_OVERRIDE_DISABLED", "This business does not allow inventory selling-price overrides.");
  return { description: input.description ?? `${inventory.name} (${inventory.sku})`, quantity: input.quantity, unitPrice: requestedPrice, taxRate: input.taxRate, discount: input.discount, itemType: InvoiceItemType.INVENTORY, inventoryItemId: inventory.id, historicalUnitCost: Number(inventory.purchaseCost) };
}

async function editableInvoice(tx: Prisma.TransactionClient, invoiceId: string, businessId: string, changeReason?: string) {
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, businessId, deletedAt: null } });
  if (!invoice) throw notFound("Invoice");
  if (!invoiceCanBeEdited(invoice)) throw new AppError(409, "INVOICE_NOT_EDITABLE", "Cancelled, voided and submitted/confirmed eTIMS invoices cannot be edited.");
  if (invoice.status !== InvoiceStatus.DRAFT && !changeReason) throw new AppError(422, "INVOICE_CHANGE_REASON_REQUIRED", "Enter a reason for changing this issued invoice.");
  return invoice;
}

router.get("/", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const filters = z.object({ digitalTicketId: z.uuid().optional(), repairId: z.uuid().optional() }).safeParse(request.query);
  if (!filters.success) throw new AppError(422, "VALIDATION_ERROR", "The invoice filters are invalid.");
  const invoices = await prisma.invoice.findMany({ where: { businessId, deletedAt: null, ...filters.data, ...(request.auth!.role === RoleCode.CUSTOMER ? { customer: { userId: request.auth!.userId } } : {}) }, include: { business: { select: { taxSettings: { select: { etimsEnabled: true } } } }, customer: { select: { id: true, fullName: true } }, repair: { select: { id: true, reference: true } }, digitalTicket: { select: { id: true, reference: true, kind: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const display = invoiceDisplayView(invoices);
  response.json({ success: true, data: request.auth!.role === RoleCode.CUSTOMER ? customerView(display) : display });
});

router.post("/", authorize(RoleCode.BUSINESS_ADMIN), validate(invoiceSchema), async (request, response) => {
  const businessId = requireBusiness(request);
  const input = request.body as z.infer<typeof invoiceSchema>;
  const [customer, repair, digitalTicket, business] = await Promise.all([
    prisma.customer.findFirst({ where: { id: input.customerId, businessId, deletedAt: null } }),
    input.repairId ? prisma.repair.findFirst({ where: { id: input.repairId, businessId, customerId: input.customerId, deletedAt: null } }) : Promise.resolve(null),
    input.digitalTicketId ? prisma.digitalTicket.findFirst({ where: { id: input.digitalTicketId, businessId, customerId: input.customerId, deletedAt: null } }) : Promise.resolve(null),
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { defaultLabourCharge: true, taxRate: true, allowInvoicePriceOverride: true } }),
  ]);
  if (!customer) throw notFound("Customer");
  if (input.repairId && !repair) throw new AppError(422, "INVALID_REPAIR", "The repair does not belong to the selected customer.");
  if (input.digitalTicketId && !digitalTicket) throw new AppError(422, "INVALID_DIGITAL_TICKET", "The digital ticket does not belong to the selected customer.");
  const resolved = await Promise.all(input.items.map((item) => resolveItem(businessId, business.allowInvoicePriceOverride, item)));
  if (input.repairId && Number(business.defaultLabourCharge) > 0 && !resolved.some((item) => item.itemType === InvoiceItemType.LABOUR)) resolved.unshift(defaultLabourItem(business.defaultLabourCharge, business.taxRate));
  if (!resolved.length) throw new AppError(422, "INVOICE_ITEMS_REQUIRED", "Add at least one invoice item.");
  const calculation = calculateInvoice(resolved, input.invoiceDiscount);
  const invoice = await prisma.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, businessId, "invoice", "INV");
    const created = await tx.invoice.create({ data: { businessId, customerId: input.customerId, repairId: input.repairId, digitalTicketId: input.digitalTicketId, number, dueAt: input.dueAt ? new Date(input.dueAt) : undefined, subtotal: calculation.subtotal, taxAmount: calculation.taxAmount, discountAmount: calculation.discountAmount, invoiceLevelDiscount: input.invoiceDiscount, total: calculation.total, balance: calculation.total, terms: input.terms, notes: input.notes, items: { create: resolved.map((item, index) => ({ businessId, repairId: input.repairId, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, taxRate: item.taxRate, discount: item.discount, lineTotal: calculation.lines[index]!.lineTotal, itemType: item.itemType, inventoryItemId: item.inventoryItemId, historicalUnitCost: item.historicalUnitCost })) } } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_CREATED", resourceType: "invoice", resourceId: created.id, metadata: { number, defaultLabourApplied: input.repairId ? resolved.some((item) => item.itemType === InvoiceItemType.LABOUR) : false } });
    return created;
  }, { isolationLevel: "Serializable" });
  response.status(201).json({ success: true, data: invoice });
});

router.get("/:id", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.CUSTOMER), async (request, response) => {
  const invoice = await getInvoiceForAccess(prisma, routeParam(request.params.id), requireBusiness(request), request.auth!.role === RoleCode.CUSTOMER ? request.auth!.userId : undefined);
  if (!invoice) throw notFound("Invoice");
  const display = { ...invoiceDisplayView(invoice) as Record<string, unknown>, canEdit: request.auth!.role === RoleCode.BUSINESS_ADMIN && invoiceCanBeEdited(invoice) };
  response.json({ success: true, data: request.auth!.role === RoleCode.CUSTOMER ? customerView(display) : display });
});

router.post("/:id/share-link", authorize(RoleCode.BUSINESS_ADMIN), shareCreationLimiter, validate(z.object({ id: z.uuid() }), "params"), async (request, response) => {
  const businessId = requireBusiness(request);
  const invoice = await prisma.invoice.findFirst({
    where: { id: routeParam(request.params.id), businessId, deletedAt: null, status: { in: shareableStatuses }, business: { status: "ACTIVE", deletedAt: null } },
    select: { id: true, businessId: true, customerId: true,
      repair: { select: { businessId: true, customerId: true, deletedAt: true, publicTrackingTokenEncrypted: true } },
      digitalTicket: { select: { businessId: true, customerId: true, deletedAt: true, publicTrackingTokenEncrypted: true } },
    },
  });
  if (!invoice) throw notFound("Issued invoice");
  const share = createInvoiceShareToken(invoice.id, businessId);
  const associated = invoice.digitalTicket ?? invoice.repair;
  let trackingUrl: string | undefined;
  if (associated?.publicTrackingTokenEncrypted && !associated.deletedAt && associated.businessId === businessId && associated.customerId === invoice.customerId) {
    try {
      const trackingToken = decryptPublicToken(associated.publicTrackingTokenEncrypted);
      if (/^[A-Za-z0-9_-]{43}$/.test(trackingToken)) trackingUrl = `${env.PUBLIC_WEB_URL.replace(/\/$/, "")}/track/${invoice.digitalTicket ? "digital/" : ""}${encodeURIComponent(trackingToken)}`;
    } catch { /* The PDF remains shareable when a legacy tracking token needs repair. */ }
  }
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_SHARE_LINK_CREATED", resourceType: "invoice", resourceId: invoice.id, metadata: { expiresAt: share.expiresAt } });
  response.status(201).json({ success: true, data: { invoiceUrl: invoiceShareUrl(share.token), expiresAt: share.expiresAt, trackingUrl } });
});

router.patch("/:id", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ dueAt: z.iso.datetime().nullable().optional(), invoiceDiscount: z.number().nonnegative().max(MAX_INVOICE_MONEY).optional(), terms: z.string().trim().max(2000).nullable().optional(), notes: z.string().trim().max(2000).nullable().optional(), ...amendmentFields }).strict()), async (request, response) => {
  const businessId = requireBusiness(request);
  const updated = await prisma.$transaction(async (tx) => {
    const invoice = await editableInvoice(tx, routeParam(request.params.id), businessId, request.body.changeReason);
    await tx.invoice.update({ where: { id: invoice.id }, data: { dueAt: request.body.dueAt ? new Date(request.body.dueAt) : request.body.dueAt, terms: request.body.terms, notes: request.body.notes } });
    await recalculateInvoice(tx, invoice.id, request.body.invoiceDiscount);
    const revised = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { items: true } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_EDITED", resourceType: "invoice", resourceId: invoice.id, metadata: { fields: Object.keys(request.body), reason: request.body.changeReason ?? null, previousTotal: String(invoice.total), total: String(revised.total), previousDiscount: String(invoice.invoiceLevelDiscount), invoiceDiscount: String(revised.invoiceLevelDiscount) } });
    return revised;
  }, { isolationLevel: "Serializable" });
  response.json({ success: true, data: updated });
});

router.post("/:id/items", authorize(RoleCode.BUSINESS_ADMIN), validate(itemSchema.extend(amendmentFields)), async (request, response) => {
  const businessId = requireBusiness(request);
  const item = await prisma.$transaction(async (tx) => {
    const invoice = await editableInvoice(tx, routeParam(request.params.id), businessId, request.body.changeReason);
    if (invoice.digitalTicketId && !digitalInvoiceItemAllowed(request.body)) throw new AppError(422, "DIGITAL_MANUAL_ITEMS_ONLY", "Digital invoices accept manually entered service or custom items only.");
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { allowInvoicePriceOverride: true } });
    const resolved = await resolveItem(businessId, business.allowInvoicePriceOverride, request.body, tx);
    const line = calculateInvoice([resolved]).lines[0]!;
    const stockDeductedAt = await reconcileInvoiceStock(tx, invoice, request.auth!.userId, null, resolved);
    const created = await tx.invoiceItem.create({ data: { businessId, invoiceId: invoice.id, repairId: invoice.repairId, description: resolved.description, quantity: resolved.quantity, unitPrice: resolved.unitPrice, taxRate: resolved.taxRate, discount: resolved.discount, lineTotal: line.lineTotal, itemType: resolved.itemType, inventoryItemId: resolved.inventoryItemId, historicalUnitCost: resolved.historicalUnitCost, stockDeductedAt } });
    await recalculateInvoice(tx, invoice.id);
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_ITEM_ADDED", resourceType: "invoice_item", resourceId: created.id, metadata: { invoiceId: invoice.id, itemType: created.itemType, reason: request.body.changeReason ?? null, quantity: String(created.quantity), unitPrice: String(created.unitPrice), discount: String(created.discount) } });
    return created;
  }, { isolationLevel: "Serializable" });
  response.status(201).json({ success: true, data: item });
});

router.patch("/:id/items/:itemId", authorize(RoleCode.BUSINESS_ADMIN), validate(itemSchema.partial().extend(amendmentFields)), async (request, response) => {
  const businessId = requireBusiness(request);
  const updated = await prisma.$transaction(async (tx) => {
    const invoice = await editableInvoice(tx, routeParam(request.params.id), businessId, request.body.changeReason);
    const existing = await tx.invoiceItem.findFirst({ where: { id: routeParam(request.params.itemId, "invoice item"), invoiceId: invoice.id, businessId } });
    if (!existing) throw notFound("Invoice item");
    const inventoryItemId = request.body.itemType && request.body.itemType !== InvoiceItemType.INVENTORY ? undefined : request.body.inventoryItemId ?? existing.inventoryItemId ?? undefined;
    const merged = { description: request.body.description ?? existing.description, quantity: request.body.quantity ?? Number(existing.quantity), unitPrice: request.body.unitPrice ?? Number(existing.unitPrice), taxRate: request.body.taxRate ?? Number(existing.taxRate), discount: request.body.discount ?? Number(existing.discount), itemType: request.body.itemType ?? existing.itemType, inventoryItemId };
    if (invoice.digitalTicketId && !digitalInvoiceItemAllowed(merged)) throw new AppError(422, "DIGITAL_MANUAL_ITEMS_ONLY", "Digital invoices accept manually entered service or custom items only.");
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { allowInvoicePriceOverride: true } });
    const unchangedInventoryPrice = merged.inventoryItemId === existing.inventoryItemId && merged.unitPrice === Number(existing.unitPrice);
    const resolved = await resolveItem(businessId, business.allowInvoicePriceOverride || unchangedInventoryPrice, merged, tx);
    const line = calculateInvoice([resolved]).lines[0]!;
    const stockDeductedAt = await reconcileInvoiceStock(tx, invoice, request.auth!.userId, existing, resolved);
    const value = await tx.invoiceItem.update({ where: { id: existing.id }, data: { description: resolved.description, quantity: resolved.quantity, unitPrice: resolved.unitPrice, taxRate: resolved.taxRate, discount: resolved.discount, lineTotal: line.lineTotal, itemType: resolved.itemType, inventoryItemId: resolved.inventoryItemId ?? null, historicalUnitCost: resolved.inventoryItemId === existing.inventoryItemId ? existing.historicalUnitCost : resolved.historicalUnitCost ?? null, stockDeductedAt } });
    await recalculateInvoice(tx, invoice.id);
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_ITEM_EDITED", resourceType: "invoice_item", resourceId: value.id, metadata: { invoiceId: invoice.id, reason: request.body.changeReason ?? null, before: { quantity: String(existing.quantity), unitPrice: String(existing.unitPrice), discount: String(existing.discount), taxRate: String(existing.taxRate), inventoryItemId: existing.inventoryItemId }, after: { quantity: String(value.quantity), unitPrice: String(value.unitPrice), discount: String(value.discount), taxRate: String(value.taxRate), inventoryItemId: value.inventoryItemId } } });
    return value;
  }, { isolationLevel: "Serializable" });
  response.json({ success: true, data: updated });
});

router.delete("/:id/items/:itemId", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object(amendmentFields).default({})), async (request, response) => {
  const businessId = requireBusiness(request);
  await prisma.$transaction(async (tx) => {
    const invoice = await editableInvoice(tx, routeParam(request.params.id), businessId, request.body.changeReason);
    const existing = await tx.invoiceItem.findFirst({ where: { id: routeParam(request.params.itemId, "invoice item"), invoiceId: invoice.id, businessId } });
    if (!existing) throw notFound("Invoice item");
    const itemCount = await tx.invoiceItem.count({ where: { invoiceId: invoice.id, businessId } });
    if (itemCount <= 1) throw new AppError(409, "LAST_INVOICE_ITEM", "An invoice must contain at least one item. Add a replacement before removing this item.");
    await reconcileInvoiceStock(tx, invoice, request.auth!.userId, existing, null);
    await tx.invoiceItem.delete({ where: { id: existing.id } });
    await recalculateInvoice(tx, invoice.id);
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_ITEM_REMOVED", resourceType: "invoice_item", resourceId: existing.id, metadata: { invoiceId: invoice.id, description: existing.description, reason: request.body.changeReason ?? null, quantity: String(existing.quantity), unitPrice: String(existing.unitPrice) } });
  }, { isolationLevel: "Serializable" });
  response.status(204).end();
});

router.post("/:id/issue", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const updated = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: routeParam(request.params.id), businessId, status: InvoiceStatus.DRAFT, deletedAt: null }, include: { items: true, business: { include: { taxSettings: true } } } });
    if (!invoice) throw notFound("Draft invoice");
    if (!invoice.items.length) throw new AppError(422, "INVOICE_ITEMS_REQUIRED", "Add at least one invoice item.");
    if (invoice.digitalTicketId && invoice.items.some((item) => !digitalInvoiceItemAllowed(item))) throw new AppError(422, "DIGITAL_MANUAL_ITEMS_ONLY", "Digital invoices require manually entered service or custom items only.");
    for (const item of invoice.items.filter((value) => value.inventoryItemId && !value.stockDeductedAt)) {
      const inventory = await tx.inventoryItem.findFirst({ where: { id: item.inventoryItemId!, businessId, deletedAt: null, isActive: true } });
      if (!inventory) throw notFound("Inventory item");
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity)) throw new AppError(422, "INVENTORY_QUANTITY_WHOLE_NUMBER", "Inventory quantities on an invoice must be whole numbers.");
      const quantityAfter = inventory.quantity - quantity;
      if (quantityAfter < 0) throw new AppError(409, "INSUFFICIENT_STOCK", `${inventory.name} does not have enough stock to issue this invoice.`);
      await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantity: quantityAfter } });
      await tx.inventoryTransaction.create({ data: { businessId, inventoryItemId: inventory.id, performedById: request.auth!.userId, type: InventoryTransactionType.STOCK_OUT, quantityDelta: -quantity, quantityAfter, reference: invoice.number, notes: "Invoice issued" } });
      await tx.invoiceItem.update({ where: { id: item.id }, data: { stockDeductedAt: new Date() } });
    }
    const value = await tx.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.ISSUED, issuedAt: new Date(), kraStatus: invoice.business.taxSettings?.etimsEnabled ? KraEtimsStatus.PENDING : KraEtimsStatus.NOT_REQUIRED } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_ISSUED", resourceType: "invoice", resourceId: invoice.id });
    return value;
  }, { isolationLevel: "Serializable" });
  await notifyInvoiceEvent(updated.id, "ISSUED");
  response.json({ success: true, data: updated });
});

router.get("/:id/pdf", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.CUSTOMER), async (request, response) => {
  const invoice = await getInvoiceForAccess(prisma, routeParam(request.params.id), requireBusiness(request), request.auth!.role === RoleCode.CUSTOMER ? request.auth!.userId : undefined);
  if (!invoice) throw notFound("Invoice");
  const pdf = await renderInvoicePdf(invoice, `${env.PUBLIC_WEB_URL}/invoices/${invoice.id}`);
  response.setHeader("content-type", "application/pdf");
  response.setHeader("content-disposition", `attachment; filename="${invoice.number}.pdf"`);
  response.send(pdf);
});

router.post("/:id/email", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const invoice = await getInvoiceForAccess(prisma, routeParam(request.params.id), businessId);
  if (!invoice?.customer.email) throw new AppError(422, "CUSTOMER_EMAIL_REQUIRED", "The customer does not have an email address.");
  const pdf = await renderInvoicePdf(invoice, `${env.PUBLIC_WEB_URL}/invoices/${invoice.id}`);
  const logo = await emailLogoForBusiness(invoice.businessId);
  const rendered = renderCustomerEmail({ business: invoice.business, logoCid: logo.logoCid, customerName: invoice.customer.fullName, reference: invoice.number, title: "Invoice", statusLabel: invoice.status.replaceAll("_", " "), message: "Your invoice is attached to this email. Contact us if you have any questions.", details: [{ label: "Total", value: `${invoice.business.currency} ${Number(invoice.total).toFixed(2)}` }, { label: "Balance", value: `${invoice.business.currency} ${Number(invoice.balance).toFixed(2)}` }] });
  const sent = await mailProvider.send({ to: invoice.customer.email, subject: `Invoice ${invoice.number} from ${invoice.business.name}`, ...rendered, attachments: [{ filename: `${invoice.number}.pdf`, content: pdf, contentType: "application/pdf" }, ...logo.attachments] });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_EMAILED", resourceType: "invoice", resourceId: invoice.id, metadata: { providerId: sent.providerId } });
  response.status(202).json({ success: true, data: { providerId: sent.providerId } });
});

router.post("/:id/kra-submit", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const result = await submitInvoiceToEtims(routeParam(request.params.id), businessId);
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "KRA_ETIMS_SUBMISSION", resourceType: "invoice", resourceId: routeParam(request.params.id), metadata: { submissionId: result.id, status: result.status, officialReference: result.officialReference } });
  response.status(result.status === KraEtimsStatus.CONFIRMED ? 200 : 202).json({ success: true, data: result });
});

router.post("/:id/payments", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ amount: z.number().positive().max(MAX_INVOICE_MONEY).refine(value => Number(value.toFixed(2)) === value, "Use at most two decimal places."), method: z.enum(PaymentMethod), customMethod: z.string().trim().max(80).optional(), transactionReference: z.string().trim().max(160).optional(), notes: z.string().trim().max(500).optional(), paperWidth: z.enum(["58mm", "80mm", "A4"]).default("A4") })), async (request, response) => {
  const businessId = requireBusiness(request);
  if (request.body.method === PaymentMethod.OTHER && !request.body.customMethod) throw new AppError(422, "CUSTOM_PAYMENT_METHOD_REQUIRED", "Enter the custom payment method.");
  validateManualPaymentEvidence(request.body.method, request.body.transactionReference);
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, status: { notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.VOID, InvoiceStatus.DRAFT] } }, include: { repair: { select: { id: true, status: true } } } });
    if (!invoice) throw notFound("Issued invoice");
    if (request.body.amount > Number(invoice.balance)) throw new AppError(409, "PAYMENT_EXCEEDS_BALANCE", "The payment exceeds the outstanding balance.");
    const number = await nextDocumentNumber(tx, businessId, "payment", "PAY");
    const payment = await tx.payment.create({ data: { businessId, invoiceId: invoice.id, customerId: invoice.customerId, recordedById: request.auth!.userId, number, amount: request.body.amount, method: request.body.method, customMethod: request.body.customMethod, transactionReference: request.body.transactionReference, notes: request.body.notes } });
    const amountPaid = Math.round((Number(invoice.amountPaid) + request.body.amount) * 100) / 100;
    const balance = Math.max(Math.round((Number(invoice.total) - amountPaid) * 100) / 100, 0);
    const paymentStatus = balance === 0 ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;
    const updatedInvoice = await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid, balance, paymentStatus, status: balance === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID } });
    const receiptNumber = await nextDocumentNumber(tx, businessId, "receipt", "RCT");
    const receipt = await tx.receipt.create({ data: { businessId, paymentId: payment.id, invoiceId: invoice.id, repairId: invoice.repair?.id, issuedById: request.auth!.userId, number: receiptNumber, paperWidth: request.body.paperWidth, statusSnapshot: invoice.repair?.status } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "PAYMENT_RECORDED", resourceType: "payment", resourceId: payment.id, metadata: { invoiceId: invoice.id, amount: request.body.amount, method: payment.method, receiptId: receipt.id } });
    return { payment, invoice: updatedInvoice, receipt };
  }, { isolationLevel: "Serializable" });
  await notifyInvoiceEvent(result.invoice.id, "PAYMENT_RECORDED", Number(result.payment.amount));
  response.status(201).json({ success: true, data: result });
});

router.get("/receipts/:receiptId/pdf", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const receipt = await prisma.receipt.findFirst({ where: { id: routeParam(request.params.receiptId), businessId, ...(request.auth!.role === RoleCode.CUSTOMER ? { invoice: { customer: { userId: request.auth!.userId } } } : {}) }, include: { business: { include: { taxSettings: { select: { etimsEnabled: true } } } }, payment: true, issuedBy: { select: { fullName: true } }, invoice: { include: { customer: true, items: true, digitalTicket: { select: { reference: true, status: true } } } }, repair: true } });
  if (!receipt) throw notFound("Receipt");
  if (receipt.repair && receipt.statusSnapshot !== receipt.repair.status) await prisma.receipt.update({ where: { id: receipt.id }, data: { statusSnapshot: receipt.repair.status } });
  const width = request.query.paperWidth === "58mm" || request.query.paperWidth === "80mm" || request.query.paperWidth === "A4" ? request.query.paperWidth : receipt.paperWidth === "58mm" || receipt.paperWidth === "80mm" ? receipt.paperWidth : "A4";
  const pdf = await renderReceiptPdf(receipt, width);
  response.setHeader("content-type", "application/pdf");
  response.setHeader("content-disposition", `attachment; filename="${receipt.number}-${width}.pdf"`);
  response.send(pdf);
});

router.delete("/:id", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ reason: z.string().trim().min(3).max(500) })), async (request, response) => {
  const businessId = requireBusiness(request);
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null }, include: { items: true } });
    if (!invoice) throw notFound("Invoice");
    if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.CANCELLED) throw new AppError(409, "INVOICE_ALREADY_CANCELLED", "This invoice has already been cancelled or voided.");
    if (Number(invoice.amountPaid) > 0) throw new AppError(409, "CREDIT_OR_REFUND_REQUIRED", "This invoice has recorded payments. Complete a documented credit/refund workflow before voiding it.");
    const action = invoiceDeletionAction(invoice);
    if (action === "DELETE") {
      await tx.invoice.delete({ where: { id: invoice.id } });
      await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "DRAFT_INVOICE_DELETED", resourceType: "invoice", resourceId: invoice.id, metadata: { number: invoice.number, reason: request.body.reason } });
    } else {
      if (invoice.kraStatus === KraEtimsStatus.CONFIRMED || invoice.kraStatus === KraEtimsStatus.SUBMITTED) throw new AppError(409, "KRA_ADJUSTMENT_REQUIRED", "A submitted or confirmed eTIMS invoice must be adjusted through the configured KRA process and cannot be voided directly.");
      for (const item of invoice.items.filter((value) => value.inventoryItemId && value.stockDeductedAt)) {
        const inventory = await tx.inventoryItem.findFirst({ where: { id: item.inventoryItemId!, businessId } });
        if (!inventory) continue;
        const quantity = Number(item.quantity);
        const quantityAfter = inventory.quantity + quantity;
        await tx.inventoryItem.update({ where: { id: inventory.id }, data: { quantity: quantityAfter } });
        await tx.inventoryTransaction.create({ data: { businessId, inventoryItemId: inventory.id, performedById: request.auth!.userId, type: InventoryTransactionType.RETURN, quantityDelta: quantity, quantityAfter, reference: invoice.number, notes: "Stock restored after invoice void" } });
      }
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.VOID, voidedAt: new Date(), voidReason: request.body.reason } });
      await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVOICE_VOIDED", resourceType: "invoice", resourceId: invoice.id, metadata: { number: invoice.number, reason: request.body.reason } });
    }
    return { id: invoice.id, action };
  }, { isolationLevel: "Serializable" });
  response.json({ success: true, data: result });
});

router.post("/:id/cancel", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ reason: z.string().trim().min(3).max(500).default("Cancelled by administrator") })), async (request, response) => {
  request.url = `/${routeParam(request.params.id)}`;
  response.status(409).json({ success: false, code: "USE_SAFE_DELETE", message: "Use the invoice Delete/Void action so accounting and stock rules are applied." });
});

export { router as invoiceRouter };
