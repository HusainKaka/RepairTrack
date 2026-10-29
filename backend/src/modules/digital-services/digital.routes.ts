import { DigitalServiceKind, DigitalTicketStatus, NoteVisibility, RepairPriority, RoleCode, type Prisma } from "../../generated/prisma/index.js";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError, notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { getBusinessLogoDataUrl } from "../../lib/business-logo.js";
import { customerInvoiceSelect as publicInvoiceSelect } from "../../lib/customer-invoice.js";
import { createOpaqueToken, decryptPublicToken, encryptPublicToken, hashToken } from "../../lib/crypto.js";
import { nextDocumentNumber } from "../../lib/identifiers.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";
import { notifyDigitalTicketCreated, notifyDigitalTicketStatus } from "../notifications/notification.service.js";
import { canDigitalTransition, digitalAccessRestriction, digitalReferencePrefix, digitalTicketView } from "./digital-policy.js";

const router = Router();
const idSchema = z.object({ id: z.uuid() });
const trackingSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const publicLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

const newCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(254).optional(),
  phone: z.string().trim().min(7).max(30),
  whatsappPhone: z.string().trim().min(7).max(30).optional(),
  whatsappOptIn: z.boolean().default(false),
  address: z.string().trim().max(300).optional(),
  customerType: z.enum(["INDIVIDUAL", "BUSINESS"]).default("INDIVIDUAL"),
  preferredCommunication: z.enum(["EMAIL", "WHATSAPP"]).default("EMAIL"),
}).strict();

const editableFields = z.object({
  title: z.string().trim().min(3).max(180),
  requirements: z.string().trim().min(3).max(10_000),
  priority: z.enum(RepairPriority).default(RepairPriority.NORMAL),
  estimatedCompletionAt: z.iso.datetime().nullable().optional(),
  internalNotes: z.string().trim().max(5000).nullable().optional(),
  customerVisibleNotes: z.string().trim().max(3000).nullable().optional(),
}).strict();

export const digitalIntakeSchema = editableFields.extend({
  kind: z.enum(DigitalServiceKind),
  customerId: z.uuid().optional(),
  newCustomer: newCustomerSchema.optional(),
  assignedTechnicianId: z.uuid().optional(),
}).superRefine((input, context) => {
  if (Boolean(input.customerId) === Boolean(input.newCustomer)) context.addIssue({ code: "custom", path: ["customerId"], message: "Select an existing customer or create a new customer." });
});

const timelineSelect = { id: true, fromStatus: true, toStatus: true, customerMessage: true, createdAt: true } as const;
const activeInvoices = { deletedAt: null, status: { notIn: ["CANCELLED", "VOID"] } } satisfies Prisma.InvoiceWhereInput;
const trackingUrl = (token: string) => `${env.PUBLIC_WEB_URL.replace(/\/$/, "")}/track/digital/${encodeURIComponent(token)}`;

router.get("/track/:token", publicLimiter, validate(trackingSchema, "params"), async (request, response) => {
  const ticket = await prisma.digitalTicket.findFirst({
    where: { publicTrackingTokenHash: hashToken(routeParam(request.params.token)), deletedAt: null, business: { status: "ACTIVE", deletedAt: null }, customer: { deletedAt: null } },
    select: { reference: true, kind: true, title: true, status: true, createdAt: true, estimatedCompletionAt: true, deliveredAt: true, customerVisibleNotes: true,
      business: { select: { id: true, name: true, phone: true, email: true, currency: true } },
      statusHistory: { select: timelineSelect, orderBy: { createdAt: "asc" }, take: 200 },
      notes: { where: { visibility: NoteVisibility.CUSTOMER }, select: { body: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 100 },
      invoices: { where: activeInvoices, select: publicInvoiceSelect, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!ticket) throw notFound("Digital ticket");
  const { id: businessId, ...business } = ticket.business;
  response.json({ success: true, data: { reference: ticket.reference, kind: ticket.kind, title: ticket.title, status: ticket.status, dateReceived: ticket.createdAt,
    estimatedCompletionAt: ticket.estimatedCompletionAt, deliveredAt: ticket.deliveredAt, customerVisibleNotes: ticket.customerVisibleNotes,
    business: { ...business, logoImageUrl: await getBusinessLogoDataUrl(businessId) }, statusHistory: ticket.statusHistory, notes: ticket.notes, invoices: ticket.invoices } });
});

router.use(authenticate);

router.get("/", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN, RoleCode.CUSTOMER), async (request, response) => {
  const query = z.object({ kind: z.enum(DigitalServiceKind).optional(), status: z.enum(DigitalTicketStatus).optional(), search: z.string().trim().max(180).optional() }).safeParse(request.query);
  if (!query.success) throw new AppError(422, "VALIDATION_ERROR", "The digital ticket filters are invalid.");
  const { kind, status, search } = query.data;
  const tickets = await prisma.digitalTicket.findMany({
    where: { businessId: requireBusiness(request), deletedAt: null, ...digitalAccessRestriction(request.auth!.role, request.auth!.userId), ...(kind ? { kind } : {}), ...(status ? { status } : {}),
      ...(search ? { OR: [{ reference: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { customer: { fullName: { contains: search, mode: "insensitive" } } }] } : {}) },
    orderBy: [{ createdAt: "desc" }], take: 100,
    include: { customer: { select: { id: true, fullName: true, phone: true, whatsappPhone: true } }, assignedTechnician: { select: { id: true, fullName: true } } },
  });
  response.json({ success: true, data: digitalTicketView(tickets, request.auth!.role === RoleCode.CUSTOMER) });
});

router.post("/", authorize(RoleCode.BUSINESS_ADMIN), validate(digitalIntakeSchema), async (request, response) => {
  const businessId = requireBusiness(request);
  const input = request.body as z.infer<typeof digitalIntakeSchema>;
  const token = createOpaqueToken(32);
  const ticket = await prisma.$transaction(async (tx) => {
    const customer = input.customerId
      ? await tx.customer.findFirst({ where: { id: input.customerId, businessId, deletedAt: null, status: "ACTIVE" } })
      : await tx.customer.create({ data: { ...input.newCustomer!, email: input.newCustomer!.email?.toLowerCase(), whatsappOptInAt: input.newCustomer!.whatsappOptIn ? new Date() : null, businessId } });
    if (!customer) throw notFound("Customer");
    if (input.assignedTechnicianId) {
      const assignee = await tx.user.findFirst({ where: { id: input.assignedTechnicianId, businessId, status: "ACTIVE", deletedAt: null, OR: [{ role: { code: RoleCode.TECHNICIAN } }, { role: { code: RoleCode.BUSINESS_ADMIN }, canTakeRepairJobs: true }] } });
      if (!assignee) throw notFound("Technician");
    }
    const reference = await nextDocumentNumber(tx, businessId, "digital-ticket", digitalReferencePrefix[input.kind]);
    const created = await tx.digitalTicket.create({ data: { businessId, customerId: customer.id, assignedTechnicianId: input.assignedTechnicianId, kind: input.kind,
      reference, title: input.title, requirements: input.requirements, priority: input.priority, internalNotes: input.internalNotes,
      customerVisibleNotes: input.customerVisibleNotes, estimatedCompletionAt: input.estimatedCompletionAt ? new Date(input.estimatedCompletionAt) : undefined,
      publicTrackingTokenHash: hashToken(token), publicTrackingTokenEncrypted: encryptPublicToken(token),
      statusHistory: { create: { businessId, toStatus: DigitalTicketStatus.INTAKE, changedByUserId: request.auth!.userId, customerMessage: "Your digital service request has been registered." } },
    } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "DIGITAL_TICKET_CREATED", resourceType: "digital_ticket", resourceId: created.id, metadata: { reference, kind: input.kind } });
    return created;
  }, { isolationLevel: "Serializable" });
  await notifyDigitalTicketCreated(ticket.id, trackingUrl(token));
  response.status(201).json({ success: true, data: digitalTicketView(ticket), trackingUrl: trackingUrl(token) });
});

router.get("/:id", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN, RoleCode.CUSTOMER), validate(idSchema, "params"), async (request, response) => {
  const customer = request.auth!.role === RoleCode.CUSTOMER;
  const ticket = await prisma.digitalTicket.findFirst({
    where: { id: routeParam(request.params.id), businessId: requireBusiness(request), deletedAt: null, ...digitalAccessRestriction(request.auth!.role, request.auth!.userId) },
    include: { customer: { select: { id: true, fullName: true, phone: true, email: true, whatsappPhone: true } }, assignedTechnician: { select: { id: true, fullName: true } },
      statusHistory: { select: timelineSelect, orderBy: { createdAt: "asc" }, take: 200 },
      notes: { ...(customer ? { where: { visibility: NoteVisibility.CUSTOMER } } : {}), include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "desc" }, take: 100 },
      ...(request.auth!.role !== RoleCode.TECHNICIAN ? { invoices: { where: activeInvoices, select: { id: true, ...publicInvoiceSelect }, orderBy: { createdAt: "desc" }, take: 20 } } : {}),
    },
  });
  if (!ticket) throw notFound("Digital ticket");
  response.json({ success: true, data: digitalTicketView(ticket, customer) });
});

router.get("/:id/tracking", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), validate(idSchema, "params"), async (request, response) => {
  const ticket = await prisma.digitalTicket.findFirst({ where: { id: routeParam(request.params.id), businessId: requireBusiness(request), deletedAt: null, ...digitalAccessRestriction(request.auth!.role, request.auth!.userId) }, select: { publicTrackingTokenEncrypted: true } });
  if (!ticket) throw notFound("Digital ticket");
  response.json({ success: true, data: { trackingUrl: trackingUrl(decryptPublicToken(ticket.publicTrackingTokenEncrypted)) } });
});

router.patch("/:id", authorize(RoleCode.BUSINESS_ADMIN), validate(idSchema, "params"), validate(editableFields.partial()), async (request, response) => {
  const businessId = requireBusiness(request);
  const input = request.body as z.infer<ReturnType<typeof editableFields.partial>>;
  const ticket = await prisma.$transaction(async (tx) => {
    const updated = await tx.digitalTicket.updateMany({ where: { id: routeParam(request.params.id), businessId, deletedAt: null }, data: { ...input, estimatedCompletionAt: input.estimatedCompletionAt ? new Date(input.estimatedCompletionAt) : input.estimatedCompletionAt } });
    if (updated.count !== 1) throw notFound("Digital ticket");
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "DIGITAL_TICKET_UPDATED", resourceType: "digital_ticket", resourceId: routeParam(request.params.id), metadata: { fields: Object.keys(input) } });
    return tx.digitalTicket.findFirstOrThrow({ where: { id: routeParam(request.params.id), businessId } });
  });
  response.json({ success: true, data: digitalTicketView(ticket) });
});

router.post("/:id/assign", authorize(RoleCode.BUSINESS_ADMIN), validate(idSchema, "params"), validate(z.object({ technicianId: z.uuid().nullable() }).strict()), async (request, response) => {
  const businessId = requireBusiness(request);
  const assignment = await prisma.$transaction(async (tx) => {
    const technician = request.body.technicianId ? await tx.user.findFirst({ where: { id: request.body.technicianId, businessId, status: "ACTIVE", deletedAt: null, OR: [{ role: { code: RoleCode.TECHNICIAN } }, { role: { code: RoleCode.BUSINESS_ADMIN }, canTakeRepairJobs: true }] }, select: { id: true, fullName: true } }) : null;
    if (request.body.technicianId && !technician) throw notFound("Technician");
    const ticket = await tx.digitalTicket.updateMany({ where: { id: routeParam(request.params.id), businessId, deletedAt: null }, data: { assignedTechnicianId: technician?.id ?? null } });
    if (ticket.count !== 1) throw notFound("Digital ticket");
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "DIGITAL_TICKET_ASSIGNED", resourceType: "digital_ticket", resourceId: routeParam(request.params.id), metadata: { technicianId: technician?.id ?? null } });
    return technician;
  }, { isolationLevel: "Serializable" });
  response.json({ success: true, data: { assignedTechnician: assignment } });
});

router.post("/:id/status", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), validate(idSchema, "params"), validate(z.object({ status: z.enum(DigitalTicketStatus), customerMessage: z.string().trim().max(1000).optional() }).strict()), async (request, response) => {
  const businessId = requireBusiness(request);
  const status = request.body.status as DigitalTicketStatus;
  const ticket = await prisma.$transaction(async (tx) => {
    const where = { id: routeParam(request.params.id), businessId, deletedAt: null, ...digitalAccessRestriction(request.auth!.role, request.auth!.userId) };
    const existing = await tx.digitalTicket.findFirst({ where });
    if (!existing) throw notFound("Digital ticket");
    if (!canDigitalTransition(existing.status, status)) throw new AppError(409, "INVALID_STATUS_TRANSITION", `A digital ticket cannot move from ${existing.status} to ${status}.`);
    const updated = await tx.digitalTicket.updateMany({ where: { ...where, status: existing.status }, data: { status, deliveredAt: status === DigitalTicketStatus.DELIVERED ? new Date() : undefined } });
    if (updated.count !== 1) throw new AppError(409, "TICKET_CHANGED", "The ticket changed. Reload it before trying again.");
    await tx.digitalStatusHistory.create({ data: { businessId, digitalTicketId: existing.id, fromStatus: existing.status, toStatus: status, changedByUserId: request.auth!.userId, customerMessage: request.body.customerMessage } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "DIGITAL_STATUS_CHANGED", resourceType: "digital_ticket", resourceId: existing.id, metadata: { from: existing.status, to: status } });
    return tx.digitalTicket.findFirstOrThrow({ where: { id: existing.id, businessId } });
  }, { isolationLevel: "Serializable" });
  await notifyDigitalTicketStatus(ticket.id);
  response.json({ success: true, data: digitalTicketView(ticket) });
});

router.post("/:id/notes", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), validate(idSchema, "params"), validate(z.object({ body: z.string().trim().min(1).max(5000), visibility: z.enum(NoteVisibility).default(NoteVisibility.INTERNAL) }).strict()), async (request, response) => {
  const businessId = requireBusiness(request);
  const note = await prisma.$transaction(async (tx) => {
    const ticket = await tx.digitalTicket.findFirst({ where: { id: routeParam(request.params.id), businessId, deletedAt: null, ...digitalAccessRestriction(request.auth!.role, request.auth!.userId) }, select: { id: true } });
    if (!ticket) throw notFound("Digital ticket");
    const created = await tx.digitalNote.create({ data: { businessId, digitalTicketId: ticket.id, authorId: request.auth!.userId, body: request.body.body, visibility: request.body.visibility } });
    await writeAudit(tx, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "DIGITAL_NOTE_ADDED", resourceType: "digital_note", resourceId: created.id, metadata: { digitalTicketId: ticket.id, visibility: created.visibility } });
    return created;
  }, { isolationLevel: "Serializable" });
  response.status(201).json({ success: true, data: note });
});

export { router as digitalRouter };
