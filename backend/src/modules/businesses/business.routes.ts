import { AccountStatus, BusinessStatus, RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { createOpaqueToken, hashToken } from "../../lib/crypto.js";
import { mailProvider } from "../../lib/mail.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";

const router = Router();
router.use(authenticate);

const businessSchema = z.object({
  name: z.string().trim().min(2).max(160),
  logoUrl: z.url().refine((value) => value.startsWith("https://"), "Logo URL must use HTTPS").optional(),
  registrationNumber: z.string().trim().min(2).max(80),
  taxPin: z.string().trim().min(2).max(80),
  email: z.email(),
  phone: z.string().trim().min(7).max(30),
  whatsapp: z.string().trim().min(7).max(30),
  address: z.string().trim().min(3).max(300),
  city: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100).default("Kenya"),
  currency: z.string().trim().length(3).default("KES"),
  taxRate: z.number().min(0).max(100).default(0),
  receiptFooter: z.string().max(500).optional(),
  invoiceFooter: z.string().max(500).optional(),
  workingHours: z.record(z.string(), z.string()).default({ weekdays: "08:00-17:00" }),
  timeZone: z.string().trim().min(3).max(100).default("Africa/Nairobi"),
  administrator: z.object({ fullName: z.string().trim().min(2).max(120), email: z.email(), phone: z.string().trim().min(7).max(30).optional() })
});

async function sendInvitation(email: string, fullName: string, token: string): Promise<void> {
  try {
    await mailProvider.send({ to: email, subject: "Set up your RepairTrack administrator account", text: `Hello ${fullName}, set your password at ${env.PUBLIC_WEB_URL}/reset-password?token=${encodeURIComponent(token)}. This invitation expires in 24 hours.` });
  } catch (error) {
    if (env.NODE_ENV === "production") throw error;
  }
}

router.get("/", authorize(RoleCode.SUPER_ADMIN), async (request, response) => {
  const page = Math.max(Number(request.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(request.query.pageSize) || 20, 1), 100);
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const where = { deletedAt: null, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } : {}) };
  const [items, total] = await prisma.$transaction([
    prisma.business.findMany({ where, select: { id: true, name: true, email: true, phone: true, city: true, country: true, status: true, subscriptionStatus: true, createdAt: true, _count: { select: { users: true, repairs: true } } }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: "desc" } }),
    prisma.business.count({ where })
  ]);
  response.json({ success: true, data: { items, page, pageSize, total } });
});

router.post("/", authorize(RoleCode.SUPER_ADMIN), validate(businessSchema), async (request, response) => {
  const input = request.body as z.infer<typeof businessSchema>;
  const inviteToken = createOpaqueToken();
  const result = await prisma.$transaction(async (tx) => {
    const adminRole = await tx.role.upsert({ where: { code: RoleCode.BUSINESS_ADMIN }, update: {}, create: { code: RoleCode.BUSINESS_ADMIN, name: "Business Administrator" } });
    const business = await tx.business.create({ data: { name: input.name, logoUrl: input.logoUrl, registrationNumber: input.registrationNumber, taxPin: input.taxPin, email: input.email.toLowerCase(), phone: input.phone, whatsapp: input.whatsapp, address: input.address, city: input.city, country: input.country, currency: input.currency.toUpperCase(), taxRate: input.taxRate, receiptFooter: input.receiptFooter, invoiceFooter: input.invoiceFooter, workingHours: input.workingHours, timeZone: input.timeZone } });
    const admin = await tx.user.create({ data: { businessId: business.id, roleId: adminRole.id, email: input.administrator.email.toLowerCase(), fullName: input.administrator.fullName, phone: input.administrator.phone, status: AccountStatus.PENDING_VERIFICATION } });
    await tx.business.update({ where: { id: business.id }, data: { primaryAdminId: admin.id } });
    await tx.passwordReset.create({ data: { userId: admin.id, tokenHash: hashToken(inviteToken), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
    await writeAudit(tx, request, { userId: request.auth!.userId, userRole: request.auth!.role, action: "BUSINESS_CREATED", resourceType: "business", resourceId: business.id, metadata: { administratorId: admin.id } });
    return { business, admin: { id: admin.id, email: admin.email, fullName: admin.fullName } };
  });
  await sendInvitation(result.admin.email, result.admin.fullName, inviteToken);
  response.status(201).json({ success: true, data: result });
});

router.patch("/:id/status", authorize(RoleCode.SUPER_ADMIN), validate(z.object({ status: z.enum(BusinessStatus) })), async (request, response) => {
  const business = await prisma.business.findFirst({ where: { id: routeParam(request.params.id), deletedAt: null } });
  if (!business) throw notFound("Business");
  const updated = await prisma.business.update({ where: { id: business.id }, data: { status: request.body.status, deletedAt: request.body.status === BusinessStatus.DELETED ? new Date() : undefined } });
  if (request.body.status !== BusinessStatus.ACTIVE) await prisma.session.updateMany({ where: { user: { businessId: business.id }, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit(prisma, request, { userId: request.auth!.userId, userRole: request.auth!.role, action: "BUSINESS_STATUS_CHANGED", resourceType: "business", resourceId: business.id, metadata: { from: business.status, to: updated.status } });
  response.json({ success: true, data: updated });
});

router.get("/profile", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), async (request, response) => {
  const business = await prisma.business.findFirst({ where: { id: requireBusiness(request), deletedAt: null } });
  if (!business) throw notFound("Business");
  response.json({ success: true, data: business });
});

router.patch("/profile", authorize(RoleCode.BUSINESS_ADMIN), validate(businessSchema.omit({ administrator: true, registrationNumber: true }).partial()), async (request, response) => {
  const businessId = requireBusiness(request);
  const updated = await prisma.business.update({ where: { id: businessId }, data: request.body });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "BUSINESS_PROFILE_UPDATED", resourceType: "business", resourceId: businessId });
  response.json({ success: true, data: updated });
});

router.get("/technicians", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const technicians = await prisma.user.findMany({ where: { businessId, role: { code: RoleCode.TECHNICIAN }, deletedAt: null }, select: { id: true, fullName: true, email: true, phone: true, status: true, lastLoginAt: true, _count: { select: { assignedRepairs: true } } }, orderBy: { fullName: "asc" } });
  response.json({ success: true, data: technicians });
});

router.post("/technicians", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ fullName: z.string().trim().min(2).max(120), email: z.email(), phone: z.string().trim().min(7).max(30).optional() })), async (request, response) => {
  const businessId = requireBusiness(request);
  const token = createOpaqueToken();
  const technician = await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({ where: { code: RoleCode.TECHNICIAN }, update: {}, create: { code: RoleCode.TECHNICIAN, name: "Technician" } });
    const user = await tx.user.create({ data: { businessId, roleId: role.id, email: request.body.email.toLowerCase(), fullName: request.body.fullName, phone: request.body.phone, status: AccountStatus.PENDING_VERIFICATION } });
    await tx.passwordReset.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "TECHNICIAN_CREATED", resourceType: "user", resourceId: user.id });
    return user;
  });
  await sendInvitation(technician.email, technician.fullName, token);
  response.status(201).json({ success: true, data: { id: technician.id, email: technician.email, fullName: technician.fullName, status: technician.status } });
});

router.patch("/technicians/:id/status", authorize(RoleCode.BUSINESS_ADMIN), validate(z.object({ status: z.enum([AccountStatus.ACTIVE, AccountStatus.DISABLED]) })), async (request, response) => {
  const businessId = requireBusiness(request);
  const technician = await prisma.user.findFirst({ where: { id: routeParam(request.params.id), businessId, role: { code: RoleCode.TECHNICIAN }, deletedAt: null } });
  if (!technician) throw notFound("Technician");
  const updated = await prisma.user.update({ where: { id: technician.id }, data: { status: request.body.status } });
  if (updated.status === AccountStatus.DISABLED) await prisma.session.updateMany({ where: { userId: updated.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "TECHNICIAN_STATUS_CHANGED", resourceType: "user", resourceId: updated.id, metadata: { status: updated.status } });
  response.json({ success: true, data: { id: updated.id, status: updated.status } });
});

router.post("/technicians/:id/password-reset", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const technician = await prisma.user.findFirst({ where: { id: routeParam(request.params.id), businessId, role: { code: RoleCode.TECHNICIAN }, deletedAt: null } });
  if (!technician) throw notFound("Technician");
  const token = createOpaqueToken();
  await prisma.passwordReset.create({ data: { userId: technician.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
  await sendInvitation(technician.email, technician.fullName, token);
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "TECHNICIAN_PASSWORD_RESET_REQUESTED", resourceType: "user", resourceId: technician.id });
  response.status(202).json({ success: true, data: { message: "A secure reset link was sent to the technician." } });
});

router.get("/audit", authorize(RoleCode.SUPER_ADMIN, RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = request.auth!.role === RoleCode.SUPER_ADMIN ? (typeof request.query.businessId === "string" ? request.query.businessId : undefined) : requireBusiness(request);
  if (!businessId && request.auth!.role !== RoleCode.SUPER_ADMIN) throw new AppError(403, "BUSINESS_CONTEXT_REQUIRED", "A business account is required.");
  const logs = await prisma.auditLog.findMany({ where: { businessId }, take: 200, orderBy: { createdAt: "desc" }, include: { user: { select: { fullName: true, email: true } } } });
  response.json({ success: true, data: logs });
});

export { router as businessRouter };
