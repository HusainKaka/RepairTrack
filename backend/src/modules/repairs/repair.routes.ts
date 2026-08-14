import { RepairStatus, RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { createOpaqueToken, hashToken } from "../../lib/crypto.js";
import { nextDocumentNumber } from "../../lib/identifiers.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";
import { notifyRepairStatus } from "../notifications/notification.service.js";

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

const createSchema = z.object({
  customerId: z.uuid(), deviceId: z.uuid(), reportedIssue: z.string().trim().min(3).max(2000), diagnosis: z.string().trim().max(3000).optional(),
  assignedTechnicianId: z.uuid().optional(), estimatedCost: z.number().nonnegative().optional(), estimatedCompletionAt: z.iso.datetime().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"), warrantyInformation: z.string().trim().max(1000).optional(), internalNotes: z.string().trim().max(3000).optional(), customerVisibleNotes: z.string().trim().max(2000).optional()
});

router.get("/track/:token", validate(z.object({ token: z.string().min(32).max(200) }), "params"), async (request, response) => {
  const repair = await prisma.repair.findUnique({ where: { publicTrackingTokenHash: hashToken(routeParam(request.params.token, "tracking token")) }, include: { device: { select: { type: true, brand: true, model: true } }, business: { select: { name: true, logoUrl: true, phone: true } }, invoices: { where: { status: { not: "CANCELLED" }, deletedAt: null }, select: { number: true, status: true, paymentStatus: true, balance: true } }, statusHistory: { select: { toStatus: true, customerMessage: true, createdAt: true }, orderBy: { createdAt: "asc" } } } });
  if (!repair || repair.deletedAt) throw notFound("Repair");
  response.json({ success: true, data: { reference: repair.reference, device: repair.device, business: repair.business, dateReceived: repair.createdAt, status: repair.status, customerVisibleNotes: repair.customerVisibleNotes, estimatedCompletionAt: repair.estimatedCompletionAt, completedAt: repair.completedAt, collectedAt: repair.collectedAt, invoices: repair.invoices, statusHistory: repair.statusHistory } });
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
  const [customer, device, technician] = await Promise.all([
    prisma.customer.findFirst({ where: { id: input.customerId, businessId, deletedAt: null } }),
    prisma.device.findFirst({ where: { id: input.deviceId, businessId, customerId: input.customerId, deletedAt: null } }),
    input.assignedTechnicianId ? prisma.user.findFirst({ where: { id: input.assignedTechnicianId, businessId, role: { code: RoleCode.TECHNICIAN }, status: "ACTIVE", deletedAt: null } }) : Promise.resolve(null)
  ]);
  if (!customer) throw notFound("Customer");
  if (!device) throw new AppError(422, "INVALID_DEVICE", "The device does not belong to the selected customer.");
  if (input.assignedTechnicianId && !technician) throw notFound("Technician");
  const rawTrackingToken = createOpaqueToken(32);
  const repair = await prisma.$transaction(async (tx) => {
    const reference = await nextDocumentNumber(tx, businessId, "repair", "RT");
    const created = await tx.repair.create({ data: { businessId, customerId: input.customerId, deviceId: input.deviceId, reference, publicTrackingTokenHash: hashToken(rawTrackingToken), reportedIssue: input.reportedIssue, diagnosis: input.diagnosis, assignedTechnicianId: input.assignedTechnicianId, estimatedCost: input.estimatedCost, estimatedCompletionAt: input.estimatedCompletionAt ? new Date(input.estimatedCompletionAt) : undefined, priority: input.priority, warrantyInformation: input.warrantyInformation, internalNotes: input.internalNotes, customerVisibleNotes: input.customerVisibleNotes } });
    await tx.repairStatusHistory.create({ data: { businessId, repairId: created.id, toStatus: RepairStatus.RECEIVED, changedByUserId: request.auth!.userId, customerMessage: "Your device has been received." } });
    if (input.assignedTechnicianId) await tx.repairAssignment.create({ data: { businessId, repairId: created.id, technicianId: input.assignedTechnicianId, assignedById: request.auth!.userId } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "REPAIR_CREATED", resourceType: "repair", resourceId: created.id, metadata: { reference } });
    return created;
  }, { isolationLevel: "Serializable" });
  response.status(201).json({ success: true, data: { ...repair, trackingUrl: `${env.PUBLIC_WEB_URL}/track/${rawTrackingToken}` } });
});

router.get("/:id", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const repair = await prisma.repair.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, ...technicianRestriction(request), ...(request.auth!.role === RoleCode.CUSTOMER ? { customer: { userId: request.auth!.userId } } : {}) }, include: { customer: true, device: true, assignedTechnician: { select: { id: true, fullName: true, email: true } }, statusHistory: { orderBy: { createdAt: "asc" } }, notes: { where: request.auth!.role === RoleCode.CUSTOMER ? { visibility: "CUSTOMER" } : {}, include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } }, parts: { include: { inventoryItem: { select: { name: true, sku: true } } } }, invoices: { where: { deletedAt: null } } } });
  if (!repair) throw notFound("Repair");
  if (request.auth!.role === RoleCode.CUSTOMER) {
    const { internalNotes: _internalNotes, diagnosis: _diagnosis, ...safe } = repair;
    response.json({ success: true, data: safe });
    return;
  }
  response.json({ success: true, data: repair });
});

router.patch("/:id", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), validate(createSchema.omit({ customerId: true, deviceId: true, assignedTechnicianId: true }).partial()), async (request, response) => {
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
    prisma.user.findFirst({ where: { id: request.body.technicianId, businessId, role: { code: RoleCode.TECHNICIAN }, status: "ACTIVE", deletedAt: null } })
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
    const value = await tx.repair.update({ where: { id: repair.id }, data: { status: nextStatus, completedAt: nextStatus === RepairStatus.COMPLETED ? new Date() : undefined, collectedAt: nextStatus === RepairStatus.COLLECTED ? new Date() : undefined } });
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

export { router as repairRouter };
