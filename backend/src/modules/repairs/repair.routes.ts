import { CustomerRepairDecision, NotificationCategory, RepairStatus, RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { createOpaqueToken, encryptPublicToken, hashToken } from "../../lib/crypto.js";
import { nextDocumentNumber } from "../../lib/identifiers.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";
import { createInternalNotification, notifyRepairCreated, notifyRepairStatus } from "../notifications/notification.service.js";

const router = Router();

const transitions: Record<RepairStatus, RepairStatus[]> = {
  RECEIVED: [RepairStatus.DIAGNOSING, RepairStatus.CANCELLED],
  DIAGNOSING: [RepairStatus.AWAITING_CUSTOMER_APPROVAL, RepairStatus.WAITING_FOR_PARTS, RepairStatus.IN_PROGRESS, RepairStatus.CANCELLED],
  AWAITING_CUSTOMER_APPROVAL: [RepairStatus.WAITING_FOR_PARTS, RepairStatus.IN_PROGRESS, RepairStatus.CANCELLED],
  WAITING_FOR_PARTS: [RepairStatus.IN_PROGRESS, RepairStatus.CANCELLED],
  IN_PROGRESS: [RepairStatus.TESTING, RepairStatus.WAITING_FOR_PARTS, RepairStatus.CANCELLED],
  TESTING: [RepairStatus.IN_PROGRESS, RepairStatus.COMPLETED],
  COMPLETED: [RepairStatus.READY_FOR_COLLECTION],
  READY_FOR_COLLECTION: [RepairStatus.COLLECTED],
  COLLECTED: [],
  CANCELLED: []
};

export function canTransition(from: RepairStatus, to: RepairStatus): boolean {
  return transitions[from].includes(to);
}

function technicianRestriction(request: Express.Request): { assignedTechnicianId?: string } {
  return request.auth!.role === RoleCode.TECHNICIAN ? { assignedTechnicianId: request.auth!.userId } : {};
}

const newCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(120), email: z.email().optional(), phone: z.string().trim().min(7).max(30), whatsappPhone: z.string().trim().min(7).max(30).optional(),
  kraPin: z.string().trim().regex(/^[AP]\d{9}[A-Z]$/i, "Enter a valid KRA PIN such as A123456789B").optional(), address: z.string().trim().max(300).optional(),
  customerType: z.enum(["INDIVIDUAL", "BUSINESS"]).default("INDIVIDUAL"), preferredCommunication: z.enum(["EMAIL", "WHATSAPP"]).default("EMAIL")
});

const newDeviceSchema = z.object({
  type: z.string().trim().min(2).max(80), brand: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(120), serialNumber: z.string().trim().max(120).optional(),
  imei: z.string().trim().max(32).optional(), colour: z.string().trim().max(60).optional(), accessories: z.string().trim().max(500).optional(), physicalCondition: z.string().trim().max(1000).optional()
});

const repairInputSchema = z.object({
  customerId: z.uuid().optional(), newCustomer: newCustomerSchema.optional(), deviceId: z.uuid().optional(), newDevice: newDeviceSchema.optional(), reportedIssue: z.string().trim().min(3).max(2000), diagnosis: z.string().trim().max(3000).optional(),
  assignedTechnicianId: z.uuid().optional(), estimatedCost: z.number().nonnegative().optional(), estimatedCompletionAt: z.iso.datetime().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"), warrantyInformation: z.string().trim().max(1000).optional(), internalNotes: z.string().trim().max(3000).optional(), customerVisibleNotes: z.string().trim().max(2000).optional(),
  notificationPreferenceOverride: z.enum(["EMAIL", "WHATSAPP"]).optional()
});

const createSchema = repairInputSchema.superRefine((input, context) => {
  if (Boolean(input.customerId) === Boolean(input.newCustomer)) context.addIssue({ code: "custom", path: ["customerId"], message: "Select an existing customer or create a new customer." });
  if (Boolean(input.deviceId) === Boolean(input.newDevice)) context.addIssue({ code: "custom", path: ["deviceId"], message: "Select an existing device or register a new device." });
});

router.get("/track/:token", validate(z.object({ token: z.string().min(32).max(200) }), "params"), async (request, response) => {
  const repair = await prisma.repair.findUnique({ where: { publicTrackingTokenHash: hashToken(routeParam(request.params.token, "tracking token")) }, include: { customer: { select: { fullName: true } }, device: { select: { type: true, brand: true, model: true } }, business: { select: { name: true, logoUrl: true, phone: true, email: true, currency: true } }, invoices: { where: { status: { notIn: ["CANCELLED", "VOID"] }, deletedAt: null }, select: { number: true, status: true, paymentStatus: true, balance: true, total: true, items: { select: { description: true, itemType: true, quantity: true, unitPrice: true, lineTotal: true } } }, orderBy: { createdAt: "desc" } }, customerResponses: { orderBy: { createdAt: "desc" }, take: 1, select: { decision: true, declineReason: true, approvalVersion: true, createdAt: true } }, statusHistory: { select: { toStatus: true, customerMessage: true, createdAt: true }, orderBy: { createdAt: "asc" } } } });
  if (!repair || repair.deletedAt) throw notFound("Repair");
  const approvalInvoice = repair.invoices[0];
  response.json({ success: true, data: { reference: repair.reference, customerFirstName: repair.customer.fullName.split(/\s+/)[0], device: repair.device, business: repair.business, dateReceived: repair.createdAt, status: repair.status, customerVisibleNotes: repair.customerVisibleNotes, estimatedCompletionAt: repair.estimatedCompletionAt, completedAt: repair.completedAt, collectedAt: repair.collectedAt, invoices: repair.invoices, statusHistory: repair.statusHistory, approval: repair.status === RepairStatus.AWAITING_CUSTOMER_APPROVAL ? { version: repair.approvalVersion, estimateAmount: Number(approvalInvoice?.total ?? repair.estimatedCost ?? 0), items: approvalInvoice?.items ?? [], message: repair.customerVisibleNotes } : null, customerResponse: repair.customerResponses[0] ?? null } });
});

router.post("/track/:token/respond", validate(z.object({ token: z.string().min(32).max(200) }), "params"), validate(z.object({ decision: z.enum(CustomerRepairDecision), approvalVersion: z.number().int().positive(), declineReason: z.string().trim().max(500).optional() })), async (request, response) => {
  const tokenHash = hashToken(routeParam(request.params.token, "tracking token"));
  const repair = await prisma.repair.findUnique({ where: { publicTrackingTokenHash: tokenHash }, include: { customerResponses: { where: { approvalVersion: request.body.approvalVersion } }, invoices: { where: { deletedAt: null, status: { notIn: ["CANCELLED", "VOID"] } }, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!repair || repair.deletedAt) throw notFound("Repair");
  if (repair.status !== RepairStatus.AWAITING_CUSTOMER_APPROVAL || repair.approvalVersion !== request.body.approvalVersion) throw new AppError(409, "APPROVAL_NOT_AVAILABLE", "This approval request is no longer active.");
  if (repair.customerResponses.length) throw new AppError(409, "APPROVAL_ALREADY_RECORDED", "A response has already been recorded for this estimate.");
  if (request.body.decision === CustomerRepairDecision.DECLINED && !request.body.declineReason) throw new AppError(422, "DECLINE_REASON_REQUIRED", "Please provide a short reason for declining the estimate.");
  const nextStatus = request.body.decision === CustomerRepairDecision.ACCEPTED ? RepairStatus.IN_PROGRESS : RepairStatus.CANCELLED;
  const result = await prisma.$transaction(async (tx) => {
    const decision = await tx.customerRepairResponse.create({ data: { businessId: repair.businessId, repairId: repair.id, customerId: repair.customerId, decision: request.body.decision, approvalVersion: repair.approvalVersion, estimateAmountPresented: repair.invoices[0]?.total ?? repair.estimatedCost, declineReason: request.body.declineReason, ipAddress: request.ip, userAgent: request.get("user-agent")?.slice(0, 500) } });
    await tx.repair.update({ where: { id: repair.id }, data: { status: nextStatus, completedAt: undefined } });
    await tx.repairStatusHistory.create({ data: { businessId: repair.businessId, repairId: repair.id, fromStatus: repair.status, toStatus: nextStatus, customerMessage: request.body.decision === CustomerRepairDecision.ACCEPTED ? "The customer approved the estimate." : "The customer declined the estimate." } });
    await writeAudit(tx, request, { businessId: repair.businessId, action: request.body.decision === CustomerRepairDecision.ACCEPTED ? "CUSTOMER_ESTIMATE_ACCEPTED" : "CUSTOMER_ESTIMATE_DECLINED", resourceType: "repair", resourceId: repair.id, metadata: { approvalVersion: repair.approvalVersion, decision: request.body.decision } });
    return decision;
  }, { isolationLevel: "Serializable" });
  const administrators = await prisma.user.findMany({ where: { businessId: repair.businessId, role: { code: RoleCode.BUSINESS_ADMIN }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  for (const administrator of administrators) await createInternalNotification({ businessId: repair.businessId, userId: administrator.id, repairId: repair.id, category: request.body.decision === CustomerRepairDecision.ACCEPTED ? NotificationCategory.CUSTOMER_ACCEPTED_REPAIR : NotificationCategory.CUSTOMER_DECLINED_REPAIR, template: `repair.customer_response.${repair.approvalVersion}`, subject: `Customer ${request.body.decision.toLowerCase()} repair ${repair.reference}`, body: request.body.decision === CustomerRepairDecision.ACCEPTED ? `The customer approved estimate version ${repair.approvalVersion}.` : `The customer declined estimate version ${repair.approvalVersion}. Reason: ${request.body.declineReason}`, metadata: { reference: repair.reference, approvalVersion: repair.approvalVersion } });
  await notifyRepairStatus(repair.id);
  response.status(201).json({ success: true, data: result });
});

router.use(authenticate);

router.get("/", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const status = typeof request.query.status === "string" && Object.values(RepairStatus).includes(request.query.status as RepairStatus) ? request.query.status as RepairStatus : undefined;
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const customerRestriction = request.auth!.role === RoleCode.CUSTOMER ? { customer: { userId: request.auth!.userId } } : {};
  const repairs = await prisma.repair.findMany({
    where: { businessId, deletedAt: null, ...technicianRestriction(request), ...customerRestriction, ...(status ? { status } : {}), ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { customer: { fullName: { contains: search, mode: "insensitive" } } }, { device: { serialNumber: { contains: search, mode: "insensitive" } } }, { device: { imei: { contains: search } } }] } : {}) },
    take: 100, orderBy: [{ priority: "desc" }, { createdAt: "desc" }], include: { customer: { select: { id: true, fullName: true, phone: true } }, device: { select: { id: true, type: true, brand: true, model: true, serialNumber: true } }, assignedTechnician: { select: { id: true, fullName: true } } }
  });
  response.json({ success: true, data: repairs });
});

router.post("/", authorize(RoleCode.BUSINESS_ADMIN), validate(createSchema), async (request, response) => {
  const businessId = requireBusiness(request);
  const input = request.body as z.infer<typeof createSchema>;
  const rawTrackingToken = createOpaqueToken(32);
  const repair = await prisma.$transaction(async (tx) => {
    const customer = input.customerId
      ? await tx.customer.findFirst({ where: { id: input.customerId, businessId, deletedAt: null } })
      : await tx.customer.create({ data: { ...input.newCustomer!, email: input.newCustomer!.email?.toLowerCase(), kraPin: input.newCustomer!.kraPin?.toUpperCase(), businessId } });
    if (!customer) throw notFound("Customer");
    const device = input.deviceId
      ? await tx.device.findFirst({ where: { id: input.deviceId, businessId, customerId: customer.id, deletedAt: null } })
      : await tx.device.create({ data: { ...input.newDevice!, businessId, customerId: customer.id, reportedFault: input.reportedIssue, imageUrls: [] } });
    if (!device) throw new AppError(422, "INVALID_DEVICE", "The device does not belong to the selected customer.");
    const technician = input.assignedTechnicianId ? await tx.user.findFirst({ where: { id: input.assignedTechnicianId, businessId, status: "ACTIVE", deletedAt: null, OR: [{ role: { code: RoleCode.TECHNICIAN } }, { canTakeRepairJobs: true }] } }) : null;
    if (input.assignedTechnicianId && !technician) throw notFound("Technician");
    const reference = await nextDocumentNumber(tx, businessId, "repair", "RT");
    const created = await tx.repair.create({ data: { businessId, customerId: customer.id, deviceId: device.id, reference, publicTrackingTokenHash: hashToken(rawTrackingToken), publicTrackingTokenEncrypted: encryptPublicToken(rawTrackingToken), reportedIssue: input.reportedIssue, diagnosis: input.diagnosis, assignedTechnicianId: input.assignedTechnicianId, estimatedCost: input.estimatedCost, estimatedCompletionAt: input.estimatedCompletionAt ? new Date(input.estimatedCompletionAt) : undefined, priority: input.priority, warrantyInformation: input.warrantyInformation, internalNotes: input.internalNotes, customerVisibleNotes: input.customerVisibleNotes, notificationPreferenceOverride: input.notificationPreferenceOverride } });
    await tx.repairStatusHistory.create({ data: { businessId, repairId: created.id, toStatus: RepairStatus.RECEIVED, changedByUserId: request.auth!.userId, customerMessage: "Your device has been received." } });
    if (input.assignedTechnicianId) await tx.repairAssignment.create({ data: { businessId, repairId: created.id, technicianId: input.assignedTechnicianId, assignedById: request.auth!.userId } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "REPAIR_CREATED", resourceType: "repair", resourceId: created.id, metadata: { reference, customerCreated: Boolean(input.newCustomer), deviceCreated: Boolean(input.newDevice) } });
    return created;
  }, { isolationLevel: "Serializable" });
  const trackingUrl = `${env.PUBLIC_WEB_URL}/track/${rawTrackingToken}`;
  await notifyRepairCreated(repair.id, trackingUrl);
  response.status(201).json({ success: true, data: { ...repair, trackingUrl } });
});

router.get("/:id", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const repair = await prisma.repair.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, ...technicianRestriction(request), ...(request.auth!.role === RoleCode.CUSTOMER ? { customer: { userId: request.auth!.userId } } : {}) }, include: { customer: true, device: true, assignedTechnician: { select: { id: true, fullName: true, email: true } }, customerResponses: { orderBy: { createdAt: "desc" } }, statusHistory: { orderBy: { createdAt: "asc" } }, notes: { where: request.auth!.role === RoleCode.CUSTOMER ? { visibility: "CUSTOMER" } : {}, include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } }, parts: { include: { inventoryItem: { select: { name: true, sku: true } } } }, invoices: { where: { deletedAt: null } } } });
  if (!repair) throw notFound("Repair");
  if (request.auth!.role === RoleCode.CUSTOMER) {
    const { internalNotes: _internalNotes, diagnosis: _diagnosis, ...safe } = repair;
    response.json({ success: true, data: safe });
    return;
  }
  response.json({ success: true, data: repair });
});

router.patch("/:id", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), validate(repairInputSchema.omit({ customerId: true, newCustomer: true, deviceId: true, newDevice: true, assignedTechnicianId: true }).partial()), async (request, response) => {
  const businessId = requireBusiness(request);
  const existing = await prisma.repair.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, ...technicianRestriction(request) } });
  if (!existing) throw notFound("Repair");
  const input = request.body;
  const updated = await prisma.repair.update({ where: { id: existing.id }, data: { ...input, estimatedCompletionAt: input.estimatedCompletionAt ? new Date(input.estimatedCompletionAt) : undefined } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "REPAIR_UPDATED", resourceType: "repair", resourceId: updated.id });
  response.json({ success: true, data: updated });
});

router.post("/:id/assign", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ technicianId: z.uuid() })), async (request, response) => {
  const businessId = requireBusiness(request);
  const [repair, technician] = await Promise.all([
    prisma.repair.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null } }),
    prisma.user.findFirst({ where: { id: request.body.technicianId, businessId, status: "ACTIVE", deletedAt: null, OR: [{ role: { code: RoleCode.TECHNICIAN } }, { canTakeRepairJobs: true }] } })
  ]);
  if (!repair) throw notFound("Repair");
  if (!technician) throw notFound("Technician");
  await prisma.$transaction(async (tx) => {
    await tx.repairAssignment.updateMany({ where: { repairId: repair.id, unassignedAt: null }, data: { unassignedAt: new Date() } });
    await tx.repairAssignment.create({ data: { businessId, repairId: repair.id, technicianId: technician.id, assignedById: request.auth!.userId } });
    await tx.repair.update({ where: { id: repair.id }, data: { assignedTechnicianId: technician.id } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "REPAIR_REASSIGNED", resourceType: "repair", resourceId: repair.id, metadata: { from: repair.assignedTechnicianId, to: technician.id } });
  });
  response.json({ success: true, data: { assignedTechnician: { id: technician.id, fullName: technician.fullName } } });
});

router.post("/:id/accept", authorize(RoleCode.TECHNICIAN), async (request, response) => {
  const businessId = requireBusiness(request);
  const repair = await prisma.repair.findFirst({ where: { id: routeParam(request.params.id), businessId, assignedTechnicianId: request.auth!.userId, deletedAt: null } });
  if (!repair) throw notFound("Assigned repair");
  const updated = await prisma.repair.update({ where: { id: repair.id }, data: { acceptedAt: repair.acceptedAt ?? new Date() } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "REPAIR_ACCEPTED", resourceType: "repair", resourceId: repair.id });
  response.json({ success: true, data: updated });
});

router.post("/:id/status", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), validate(z.object({ status: z.enum(RepairStatus), customerMessage: z.string().trim().max(1000).optional() })), async (request, response) => {
  const businessId = requireBusiness(request);
  const repair = await prisma.repair.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, ...technicianRestriction(request) } });
  if (!repair) throw notFound("Repair");
  const nextStatus = request.body.status as RepairStatus;
  if (!canTransition(repair.status, nextStatus)) throw new AppError(409, "INVALID_STATUS_TRANSITION", `A repair cannot move from ${repair.status} to ${nextStatus}.`);
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.repair.update({ where: { id: repair.id }, data: { status: nextStatus, approvalVersion: nextStatus === RepairStatus.AWAITING_CUSTOMER_APPROVAL ? { increment: 1 } : undefined, completedAt: nextStatus === RepairStatus.COMPLETED ? new Date() : undefined, collectedAt: nextStatus === RepairStatus.COLLECTED ? new Date() : undefined } });
    await tx.repairStatusHistory.create({ data: { businessId, repairId: repair.id, fromStatus: repair.status, toStatus: nextStatus, changedByUserId: request.auth!.userId, customerMessage: request.body.customerMessage } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "REPAIR_STATUS_CHANGED", resourceType: "repair", resourceId: repair.id, metadata: { from: repair.status, to: nextStatus } });
    return value;
  });
  await notifyRepairStatus(updated.id);
  response.json({ success: true, data: updated });
});

router.post("/:id/notes", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), validate(z.object({ body: z.string().trim().min(1).max(5000), visibility: z.enum(["INTERNAL", "CUSTOMER"]).default("INTERNAL"), imageUrls: z.array(z.url()).max(10).default([]) })), async (request, response) => {
  const businessId = requireBusiness(request);
  const repair = await prisma.repair.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, ...technicianRestriction(request) } });
  if (!repair) throw notFound("Repair");
  const note = await prisma.repairNote.create({ data: { businessId, repairId: repair.id, authorId: request.auth!.userId, body: request.body.body, visibility: request.body.visibility, imageUrls: request.body.imageUrls } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "REPAIR_NOTE_ADDED", resourceType: "repair_note", resourceId: note.id, metadata: { repairId: repair.id, visibility: note.visibility } });
  response.status(201).json({ success: true, data: note });
});

router.delete("/:id", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ reason: z.string().trim().min(3).max(500) })), async (request, response) => {
  const businessId = requireBusiness(request);
  const repair = await prisma.repair.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null }, include: { invoices: { where: { deletedAt: null }, include: { _count: { select: { payments: true, receipts: true, kraSubmissions: true } } } }, _count: { select: { parts: true, receipts: true } } } });
  if (!repair) throw notFound("Repair");
  const protectedRecord = repair._count.parts > 0 || repair._count.receipts > 0 || repair.invoices.some((invoice) => invoice._count.payments > 0 || invoice._count.receipts > 0 || invoice._count.kraSubmissions > 0 || invoice.status !== "DRAFT");
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.repair.update({ where: { id: repair.id }, data: { deletedAt: new Date(), status: protectedRecord ? undefined : RepairStatus.CANCELLED, customerVisibleNotes: protectedRecord ? repair.customerVisibleNotes : request.body.reason } });
    if (!protectedRecord && repair.status !== RepairStatus.CANCELLED) await tx.repairStatusHistory.create({ data: { businessId, repairId: repair.id, fromStatus: repair.status, toStatus: RepairStatus.CANCELLED, changedByUserId: request.auth!.userId, customerMessage: "The repair record was cancelled by the business." } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: protectedRecord ? "REPAIR_ARCHIVED" : "REPAIR_CANCELLED", resourceType: "repair", resourceId: repair.id, metadata: { reference: repair.reference, reason: request.body.reason, protectedRecord } });
    return value;
  });
  response.json({ success: true, data: { id: updated.id, action: protectedRecord ? "ARCHIVED" : "CANCELLED", protectedRecord } });
});

export { router as repairRouter };
