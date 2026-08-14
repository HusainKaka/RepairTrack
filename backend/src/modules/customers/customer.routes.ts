import { AccountStatus, RoleCode } from "../../generated/prisma/index.js";
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

const customerSchema = z.object({
  fullName: z.string().trim().min(2).max(120), email: z.email().optional(), phone: z.string().trim().min(7).max(30),
  alternativePhone: z.string().trim().max(30).optional(), address: z.string().trim().max(300).optional(), notes: z.string().trim().max(2000).optional()
});

router.get("/", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), async (request, response) => {
  const businessId = requireBusiness(request);
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const customers = await prisma.customer.findMany({ where: { businessId, deletedAt: null, ...(search ? { OR: [{ fullName: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }, { email: { contains: search, mode: "insensitive" } }] } : {}) }, take: 100, orderBy: { fullName: "asc" }, include: { _count: { select: { devices: true, repairs: true, invoices: true } } } });
  response.json({ success: true, data: customers });
});

router.post("/", authorize(RoleCode.BUSINESS_ADMIN), validate(customerSchema), async (request, response) => {
  const businessId = requireBusiness(request);
  const customer = await prisma.customer.create({ data: { ...request.body, email: request.body.email?.toLowerCase(), businessId } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "CUSTOMER_CREATED", resourceType: "customer", resourceId: customer.id });
  response.status(201).json({ success: true, data: customer });
});

router.get("/:id", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN, RoleCode.CUSTOMER), async (request, response) => {
  const businessId = requireBusiness(request);
  const customer = await prisma.customer.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, ...(request.auth!.role === RoleCode.CUSTOMER ? { userId: request.auth!.userId } : {}) }, include: { devices: { where: { deletedAt: null } }, repairs: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } }, invoices: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } } } });
  if (!customer) throw notFound("Customer");
  response.json({ success: true, data: customer });
});

router.patch("/:id", authorize(RoleCode.BUSINESS_ADMIN), validate(customerSchema.partial()), async (request, response) => {
  const businessId = requireBusiness(request);
  const existing = await prisma.customer.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null } });
  if (!existing) throw notFound("Customer");
  const customer = await prisma.customer.update({ where: { id: existing.id }, data: { ...request.body, email: request.body.email?.toLowerCase() } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "CUSTOMER_UPDATED", resourceType: "customer", resourceId: customer.id });
  response.json({ success: true, data: customer });
});

router.delete("/:id", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const existing = await prisma.customer.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null } });
  if (!existing) throw notFound("Customer");
  await prisma.customer.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: AccountStatus.DELETED } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "CUSTOMER_DEACTIVATED", resourceType: "customer", resourceId: existing.id });
  response.status(204).end();
});

export { router as customerRouter };
