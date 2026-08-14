import { InventoryTransactionType, RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import { z } from "zod";
import { AppError, notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";
import { ensureDraftInvoice, recalculateInvoice } from "../invoices/invoice.service.js";

const router = Router();
router.use(authenticate);

const itemSchema = z.object({ supplierId: z.uuid().optional(), sku: z.string().trim().min(1).max(80), barcode: z.string().trim().max(120).optional(), name: z.string().trim().min(2).max(180), category: z.string().trim().min(2).max(100), purchaseCost: z.number().nonnegative(), sellingPrice: z.number().nonnegative(), quantity: z.number().int().nonnegative().default(0), minimumStock: z.number().int().nonnegative().default(0), location: z.string().trim().max(120).optional(), warranty: z.string().trim().max(200).optional(), isActive: z.boolean().default(true) });

router.get("/", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), async (request, response) => {
  const businessId = requireBusiness(request);
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const lowStock = request.query.lowStock === "true";
  const items = await prisma.inventoryItem.findMany({ where: { businessId, deletedAt: null, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }, { barcode: { contains: search } }] } : {}) }, include: { supplier: true }, orderBy: { name: "asc" } });
  response.json({ success: true, data: lowStock ? items.filter((item) => item.quantity <= item.minimumStock) : items });
});

router.post("/", authorize(RoleCode.BUSINESS_ADMIN), validate(itemSchema), async (request, response) => {
  const businessId = requireBusiness(request);
  if (request.body.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: request.body.supplierId, businessId, deletedAt: null } });
    if (!supplier) throw notFound("Supplier");
  }
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({ data: { ...request.body, businessId } });
    if (created.quantity > 0) await tx.inventoryTransaction.create({ data: { businessId, inventoryItemId: created.id, performedById: request.auth!.userId, type: InventoryTransactionType.STOCK_IN, quantityDelta: created.quantity, quantityAfter: created.quantity, notes: "Opening stock" } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVENTORY_ITEM_CREATED", resourceType: "inventory_item", resourceId: created.id });
    return created;
  });
  response.status(201).json({ success: true, data: item });
});

router.patch("/:id", authorize(RoleCode.BUSINESS_ADMIN), validate(itemSchema.omit({ quantity: true }).partial()), async (request, response) => {
  const businessId = requireBusiness(request);
  const existing = await prisma.inventoryItem.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null } });
  if (!existing) throw notFound("Inventory item");
  const item = await prisma.inventoryItem.update({ where: { id: existing.id }, data: request.body });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVENTORY_ITEM_UPDATED", resourceType: "inventory_item", resourceId: item.id });
  response.json({ success: true, data: item });
});

router.post("/:id/adjust", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ quantityDelta: z.number().int().refine((value) => value !== 0), notes: z.string().trim().min(3).max(500), allowNegative: z.boolean().default(false) })), async (request, response) => {
  const businessId = requireBusiness(request);
  const item = await prisma.inventoryItem.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null } });
  if (!item) throw notFound("Inventory item");
  const nextQuantity = item.quantity + request.body.quantityDelta;
  if (nextQuantity < 0 && !request.body.allowNegative) throw new AppError(409, "INSUFFICIENT_STOCK", "This adjustment would make stock negative.");
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
    await tx.inventoryTransaction.create({ data: { businessId, inventoryItemId: item.id, performedById: request.auth!.userId, type: InventoryTransactionType.ADJUSTMENT, quantityDelta: request.body.quantityDelta, quantityAfter: nextQuantity, notes: request.body.notes } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "INVENTORY_ADJUSTED", resourceType: "inventory_item", resourceId: item.id, metadata: { quantityDelta: request.body.quantityDelta, quantityAfter: nextQuantity, override: nextQuantity < 0 } });
    return value;
  });
  response.json({ success: true, data: updated });
});

router.get("/:id/history", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), async (request, response) => {
  const businessId = requireBusiness(request);
  const item = await prisma.inventoryItem.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null } });
  if (!item) throw notFound("Inventory item");
  const history = await prisma.inventoryTransaction.findMany({ where: { businessId, inventoryItemId: item.id }, include: { performedBy: { select: { fullName: true } } }, orderBy: { createdAt: "desc" } });
  response.json({ success: true, data: history });
});

router.post("/repairs/:repairId/parts", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), validate(z.object({ inventoryItemId: z.uuid(), quantity: z.number().int().positive(), allowNegative: z.boolean().default(false) })), async (request, response) => {
  const businessId = requireBusiness(request);
  const [repair, item] = await Promise.all([
    prisma.repair.findFirst({ where: { id: routeParam(request.params.repairId), businessId, deletedAt: null, ...(request.auth!.role === RoleCode.TECHNICIAN ? { assignedTechnicianId: request.auth!.userId } : {}) } }),
    prisma.inventoryItem.findFirst({ where: { id: request.body.inventoryItemId, businessId, isActive: true, deletedAt: null } })
  ]);
  if (!repair) throw notFound("Repair");
  if (!item) throw notFound("Inventory item");
  const quantityAfter = item.quantity - request.body.quantity;
  if (quantityAfter < 0 && !(request.auth!.role === RoleCode.BUSINESS_ADMIN && request.body.allowNegative)) throw new AppError(409, "INSUFFICIENT_STOCK", "There is not enough stock for this repair.");
  const result = await prisma.$transaction(async (tx) => {
    if (quantityAfter >= 0) {
      const changed = await tx.inventoryItem.updateMany({ where: { id: item.id, quantity: { gte: request.body.quantity } }, data: { quantity: { decrement: request.body.quantity } } });
      if (changed.count !== 1) throw new AppError(409, "STOCK_CHANGED", "Stock changed while the part was being added. Try again.");
    } else {
      await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: quantityAfter } });
    }
    const stockTransaction = await tx.inventoryTransaction.create({ data: { businessId, inventoryItemId: item.id, performedById: request.auth!.userId, type: InventoryTransactionType.REPAIR_USAGE, quantityDelta: -request.body.quantity, quantityAfter, reference: repair.reference } });
    const part = await tx.repairPart.create({ data: { businessId, repairId: repair.id, inventoryItemId: item.id, technicianId: request.auth!.userId, quantity: request.body.quantity, unitPrice: item.sellingPrice } });
    const invoiceId = await ensureDraftInvoice(tx, businessId, repair.customerId, repair.id);
    const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { taxRate: true } });
    const lineTotal = Number(item.sellingPrice) * request.body.quantity * (1 + Number(business.taxRate) / 100);
    await tx.invoiceItem.create({ data: { businessId, invoiceId, description: `${item.name} (${item.sku})`, quantity: request.body.quantity, unitPrice: item.sellingPrice, taxRate: business.taxRate, lineTotal, sourceType: "repair_part", sourceId: part.id } });
    await recalculateInvoice(tx, invoiceId);
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "REPAIR_PART_ADDED", resourceType: "repair_part", resourceId: part.id, metadata: { repairId: repair.id, itemId: item.id, quantity: request.body.quantity, negativeStockOverride: quantityAfter < 0 } });
    return { part, stockTransaction, invoiceId };
  }, { isolationLevel: "Serializable" });
  response.status(201).json({ success: true, data: result });
});

router.get("/suppliers/list", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const suppliers = await prisma.supplier.findMany({ where: { businessId: requireBusiness(request), deletedAt: null }, orderBy: { name: "asc" } });
  response.json({ success: true, data: suppliers });
});

router.post("/suppliers", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ name: z.string().trim().min(2).max(160), email: z.email().optional(), phone: z.string().trim().max(30).optional(), address: z.string().trim().max(300).optional() })), async (request, response) => {
  const supplier = await prisma.supplier.create({ data: { ...request.body, businessId: requireBusiness(request) } });
  response.status(201).json({ success: true, data: supplier });
});

export { router as inventoryRouter };
