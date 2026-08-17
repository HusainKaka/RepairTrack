import { RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import { z } from "zod";
import { notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";

const router = Router();
router.use(authenticate);
const schema = z.object({
  customerId: z.uuid(), type: z.string().trim().min(2).max(80), brand: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(120),
  serialNumber: z.string().trim().max(120).optional(), imei: z.string().trim().max(32).optional(), colour: z.string().trim().max(60).optional(),
  storageCapacity: z.string().trim().max(60).optional(), ram: z.string().trim().max(60).optional(), accessories: z.string().trim().max(500).optional(),
  physicalCondition: z.string().trim().max(1000).optional(), reportedFault: z.string().trim().min(2).max(2000), imageUrls: z.array(z.url().refine((value) => value.startsWith("https://"), "Image URLs must use HTTPS")).max(10).default([]), warrantyStatus: z.string().trim().max(200).optional()
});

router.get("/", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), async (request, response) => {
  const businessId = requireBusiness(request);
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const devices = await prisma.device.findMany({ where: { businessId, deletedAt: null, ...(search ? { OR: [{ brand: { contains: search, mode: "insensitive" } }, { model: { contains: search, mode: "insensitive" } }, { serialNumber: { contains: search, mode: "insensitive" } }, { imei: { contains: search } }] } : {}) }, take: 100, include: { customer: { select: { id: true, fullName: true, phone: true } } }, orderBy: { createdAt: "desc" } });
  response.json({ success: true, data: devices });
});

router.post("/", authorize(RoleCode.BUSINESS_ADMIN), validate(schema), async (request, response) => {
  const businessId = requireBusiness(request);
  const customer = await prisma.customer.findFirst({ where: { id: request.body.customerId, businessId, deletedAt: null } });
  if (!customer) throw notFound("Customer");
  const device = await prisma.device.create({ data: { ...request.body, businessId } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "DEVICE_CREATED", resourceType: "device", resourceId: device.id });
  response.status(201).json({ success: true, data: device });
});

router.get("/:id", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const device = await prisma.device.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, ...(request.auth!.role === RoleCode.CUSTOMER ? { customer: { userId: request.auth!.userId } } : {}) }, include: { customer: true, repairs: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } } } });
  if (!device) throw notFound("Device");
  response.json({ success: true, data: device });
});

router.patch("/:id", authorize(RoleCode.BUSINESS_ADMIN), validate(schema.partial()), async (request, response) => {
  const businessId = requireBusiness(request);
  const existing = await prisma.device.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null } });
  if (!existing) throw notFound("Device");
  if (request.body.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: request.body.customerId, businessId, deletedAt: null } });
    if (!customer) throw notFound("Customer");
  }
  const device = await prisma.device.update({ where: { id: existing.id }, data: request.body });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "DEVICE_UPDATED", resourceType: "device", resourceId: device.id });
  response.json({ success: true, data: device });
});

router.delete("/:id", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ reason: z.string().trim().min(3).max(500) })), async (request, response) => {
  const businessId = requireBusiness(request);
  const existing = await prisma.device.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null }, include: { _count: { select: { repairs: true } } } });
  if (!existing) throw notFound("Device");
  await prisma.device.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "DEVICE_DEACTIVATED", resourceType: "device", resourceId: existing.id, metadata: { reason: request.body.reason, linkedRepairs: existing._count.repairs } });
  response.json({ success: true, data: { id: existing.id, action: "DEACTIVATED", linkedRepairsPreserved: existing._count.repairs } });
});

export { router as deviceRouter };
