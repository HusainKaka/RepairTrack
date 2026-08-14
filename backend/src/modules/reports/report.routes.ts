import { InvoiceStatus, RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";

const router = Router();
router.use(authenticate);

const startOfDay = (): Date => { const value = new Date(); value.setHours(0, 0, 0, 0); return value; };
const startOfMonth = (): Date => { const value = new Date(); value.setDate(1); value.setHours(0, 0, 0, 0); return value; };

router.get("/platform", authorize(RoleCode.SUPER_ADMIN), async (_request, response) => {
  const activitySince = new Date(Date.now() - 24 * 60 * 60_000);
  const [businesses, subscriptions, users, activeSessions, repairs, auditEvents24h] = await prisma.$transaction([
    prisma.business.groupBy({ by: ["status"], where: { deletedAt: null }, orderBy: { status: "asc" }, _count: true }),
    prisma.business.groupBy({ by: ["subscriptionStatus"], where: { deletedAt: null }, orderBy: { subscriptionStatus: "asc" }, _count: true }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.repair.count({ where: { deletedAt: null } }),
    prisma.auditLog.count({ where: { createdAt: { gte: activitySince } } })
  ]);
  response.json({ success: true, data: { businesses: Object.fromEntries(businesses.map((item) => [item.status, item._count])), subscriptions: Object.fromEntries(subscriptions.map((item) => [item.subscriptionStatus, item._count])), users, activeSessions, repairs, auditEvents24h } });
});

router.get("/dashboard", authorize(RoleCode.BUSINESS_ADMIN, RoleCode.TECHNICIAN), async (request, response) => {
  const businessId = requireBusiness(request);
  const technician = request.auth!.role === RoleCode.TECHNICIAN ? { assignedTechnicianId: request.auth!.userId } : {};
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11, 1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);
  const [statusGroups, repairsToday, customers, technicians, revenueToday, revenueMonth, outstanding, lowStock, recentRepairs, recentPayments] = await prisma.$transaction([
    prisma.repair.groupBy({ by: ["status"], where: { businessId, deletedAt: null, ...technician }, orderBy: { status: "asc" }, _count: true }),
    prisma.repair.count({ where: { businessId, deletedAt: null, createdAt: { gte: startOfDay() }, ...technician } }),
    prisma.customer.count({ where: { businessId, deletedAt: null } }),
    prisma.user.count({ where: { businessId, role: { code: RoleCode.TECHNICIAN }, deletedAt: null, status: "ACTIVE" } }),
    prisma.payment.aggregate({ where: { businessId, paidAt: { gte: startOfDay() } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { businessId, paidAt: { gte: startOfMonth() } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { businessId, status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] }, deletedAt: null }, _sum: { balance: true }, _count: true }),
    prisma.inventoryItem.findMany({ where: { businessId, deletedAt: null, isActive: true }, select: { id: true, name: true, sku: true, quantity: true, minimumStock: true } }),
    prisma.repair.findMany({ where: { businessId, deletedAt: null, createdAt: { gte: twelveMonthsAgo } }, select: { createdAt: true } }),
    prisma.payment.findMany({ where: { businessId, paidAt: { gte: twelveMonthsAgo } }, select: { paidAt: true, amount: true } })
  ]);
  const monthKey = (date: Date): string => date.toISOString().slice(0, 7);
  const repairMonths = new Map<string, number>();
  const paymentMonths = new Map<string, number>();
  for (const item of recentRepairs) repairMonths.set(monthKey(item.createdAt), (repairMonths.get(monthKey(item.createdAt)) ?? 0) + 1);
  for (const item of recentPayments) paymentMonths.set(monthKey(item.paidAt), (paymentMonths.get(monthKey(item.paidAt)) ?? 0) + Number(item.amount));
  response.json({ success: true, data: { repairsToday, statuses: Object.fromEntries(statusGroups.map((group) => [group.status, group._count])), customers, technicians, revenueToday: Number(revenueToday._sum.amount ?? 0), revenueMonth: Number(revenueMonth._sum.amount ?? 0), outstanding: { count: outstanding._count, amount: Number(outstanding._sum.balance ?? 0) }, lowStock: lowStock.filter((item) => item.quantity <= item.minimumStock), monthlyRepairs: [...repairMonths].map(([month, count]) => ({ month, count })), monthlyRevenue: [...paymentMonths].map(([month, total]) => ({ month, total })) } });
});

router.get("/repairs.csv", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const repairs = await prisma.repair.findMany({ where: { businessId, deletedAt: null }, include: { customer: true, device: true, assignedTechnician: true }, orderBy: { createdAt: "desc" } });
  const escape = (value: string | number | Date | null | undefined): string => `"${(value instanceof Date ? value.toISOString() : String(value ?? "")).replaceAll('"', '""')}"`;
  const rows = [["Reference", "Customer", "Device", "Technician", "Status", "Priority", "Created"], ...repairs.map((repair) => [repair.reference, repair.customer.fullName, `${repair.device.brand} ${repair.device.model}`, repair.assignedTechnician?.fullName ?? "", repair.status, repair.priority, repair.createdAt.toISOString()])];
  response.setHeader("content-type", "text/csv; charset=utf-8");
  response.setHeader("content-disposition", "attachment; filename=repair-report.csv");
  response.send(rows.map((row) => row.map(escape).join(",")).join("\r\n"));
});

router.get("/analytics", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const fallbackFrom = new Date(); fallbackFrom.setFullYear(fallbackFrom.getFullYear() - 1);
  const fromParam = typeof request.query.from === "string" ? request.query.from : undefined;
  const toParam = typeof request.query.to === "string" ? request.query.to : undefined;
  const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : fallbackFrom;
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : new Date();
  const validDate = (value: string | undefined, parsed: Date): boolean => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value);
  if (!validDate(fromParam, from) || !validDate(toParam, to) || from > to || to.getTime() - from.getTime() > 2 * 366 * 24 * 60 * 60_000) throw new AppError(422, "INVALID_REPORT_RANGE", "Choose valid dates spanning no more than two years.");
  const [repairs, invoiceGroups, paymentGroups, partGroups] = await Promise.all([
    prisma.repair.findMany({ where: { businessId, deletedAt: null, createdAt: { gte: from, lte: to } }, select: { status: true, device: { select: { type: true } }, assignedTechnician: { select: { id: true, fullName: true } } } }),
    prisma.invoice.groupBy({ by: ["status", "paymentStatus"], where: { businessId, deletedAt: null, createdAt: { gte: from, lte: to } }, _count: true, _sum: { total: true, balance: true } }),
    prisma.payment.groupBy({ by: ["method"], where: { businessId, paidAt: { gte: from, lte: to } }, _count: true, _sum: { amount: true } }),
    prisma.repairPart.groupBy({ by: ["inventoryItemId"], where: { businessId, createdAt: { gte: from, lte: to } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 10 })
  ]);
  const statuses = new Map<string, number>(); const devices = new Map<string, number>(); const technicians = new Map<string, { id: string; name: string; assigned: number; completed: number }>();
  for (const repair of repairs) {
    statuses.set(repair.status, (statuses.get(repair.status) ?? 0) + 1); devices.set(repair.device.type, (devices.get(repair.device.type) ?? 0) + 1);
    if (repair.assignedTechnician) { const value = technicians.get(repair.assignedTechnician.id) ?? { id: repair.assignedTechnician.id, name: repair.assignedTechnician.fullName, assigned: 0, completed: 0 }; value.assigned++; if (["COMPLETED", "READY_FOR_COLLECTION", "COLLECTED"].includes(repair.status)) value.completed++; technicians.set(value.id, value); }
  }
  const itemIds = partGroups.map((item) => item.inventoryItemId); const itemNames = itemIds.length ? await prisma.inventoryItem.findMany({ where: { businessId, id: { in: itemIds } }, select: { id: true, name: true, sku: true } }) : []; const itemMap = new Map(itemNames.map((item) => [item.id, item]));
  response.json({ success: true, data: { from, to, repairsByStatus: [...statuses].map(([status, count]) => ({ status, count })), repairsByDevice: [...devices].sort((a, b) => b[1] - a[1]).map(([device, count]) => ({ device, count })), technicianPerformance: [...technicians.values()].sort((a, b) => b.completed - a.completed), invoices: invoiceGroups.map((item) => ({ status: item.status, paymentStatus: item.paymentStatus, count: item._count, total: Number(item._sum.total ?? 0), balance: Number(item._sum.balance ?? 0) })), payments: paymentGroups.map((item) => ({ method: item.method, count: item._count, amount: Number(item._sum.amount ?? 0) })), topParts: partGroups.map((item) => ({ ...itemMap.get(item.inventoryItemId), quantity: item._sum.quantity ?? 0 })) } });
});

router.get("/search", authorize(RoleCode.BUSINESS_ADMIN), async (request, response) => {
  const businessId = requireBusiness(request);
  const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
  if (query.length < 2) return response.json({ success: true, data: [] });
  const [repairs, customers, devices, inventory, invoices, receipts, users] = await Promise.all([
    prisma.repair.findMany({ where: { businessId, deletedAt: null, OR: [{ reference: { contains: query, mode: "insensitive" } }, { device: { serialNumber: { contains: query, mode: "insensitive" } } }, { device: { imei: { contains: query } } }] }, select: { id: true, reference: true, status: true }, take: 10 }),
    prisma.customer.findMany({ where: { businessId, deletedAt: null, OR: [{ fullName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }] }, select: { id: true, fullName: true, phone: true }, take: 10 }),
    prisma.device.findMany({ where: { businessId, deletedAt: null, OR: [{ brand: { contains: query, mode: "insensitive" } }, { model: { contains: query, mode: "insensitive" } }, { serialNumber: { contains: query, mode: "insensitive" } }, { imei: { contains: query } }] }, select: { id: true, brand: true, model: true, serialNumber: true, imei: true }, take: 10 }),
    prisma.inventoryItem.findMany({ where: { businessId, deletedAt: null, OR: [{ name: { contains: query, mode: "insensitive" } }, { sku: { contains: query, mode: "insensitive" } }] }, select: { id: true, name: true, sku: true }, take: 10 }),
    prisma.invoice.findMany({ where: { businessId, deletedAt: null, number: { contains: query, mode: "insensitive" } }, select: { id: true, number: true, status: true }, take: 10 }),
    prisma.receipt.findMany({ where: { businessId, number: { contains: query, mode: "insensitive" } }, select: { id: true, number: true, invoiceId: true }, take: 10 }),
    prisma.user.findMany({ where: { businessId, deletedAt: null, OR: [{ fullName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] }, select: { id: true, fullName: true, email: true }, take: 10 })
  ]);
  response.json({ success: true, data: [{ type: "repair", items: repairs }, { type: "customer", items: customers }, { type: "device", items: devices }, { type: "inventory", items: inventory }, { type: "invoice", items: invoices }, { type: "receipt", items: receipts }, { type: "user", items: users }] });
});

export { router as reportRouter };
