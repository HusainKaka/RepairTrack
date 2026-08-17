import { ExpenseCategory, ExpenseStatus, RoleCode } from "../../generated/prisma/index.js";
import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { notFound } from "../../errors/app-error.js";
import { writeAudit } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { tenantWhere } from "../../lib/tenant.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, requireBusiness } from "../../middleware/authorize.js";
import { routeParam, validate } from "../../middleware/validate.js";

const router = Router();
router.use(authenticate, authorize(RoleCode.BUSINESS_ADMIN));

const expenseSchema = z.object({ category: z.enum(ExpenseCategory), description: z.string().trim().min(2).max(300), supplier: z.string().trim().max(160).optional(), amount: z.number().positive().max(100_000_000), expenseDate: z.iso.datetime(), reference: z.string().trim().max(160).optional(), notes: z.string().trim().max(2000).optional(), attachmentUrl: z.url().refine((value) => value.startsWith("https://"), "Attachments must use HTTPS").optional(), recurring: z.boolean().default(false) });
const utilityCategories = new Set<ExpenseCategory>([ExpenseCategory.ELECTRICITY, ExpenseCategory.WATER, ExpenseCategory.INTERNET, ExpenseCategory.TELEPHONE, ExpenseCategory.GAS]);

function dateRange(query: Request["query"]): { gte?: Date; lte?: Date } {
  const from = typeof query.from === "string" ? new Date(`${query.from}T00:00:00.000Z`) : undefined;
  const to = typeof query.to === "string" ? new Date(`${query.to}T23:59:59.999Z`) : undefined;
  return { ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}) };
}

router.get("/", async (request, response) => {
  const businessId = requireBusiness(request);
  const category = typeof request.query.category === "string" && Object.values(ExpenseCategory).includes(request.query.category as ExpenseCategory) ? request.query.category as ExpenseCategory : undefined;
  const utilityOnly = request.query.utility === "true";
  const range = dateRange(request.query);
  const expenses = await prisma.businessExpense.findMany({ where: tenantWhere(businessId, { status: ExpenseStatus.ACTIVE, ...(category ? { category } : {}), ...(utilityOnly ? { category: { in: [...utilityCategories] } } : {}), ...(Object.keys(range).length ? { expenseDate: range } : {}) }), include: { createdBy: { select: { fullName: true } } }, orderBy: { expenseDate: "desc" }, take: 500 });
  const monthlyTotals = new Map<string, number>();
  for (const expense of expenses) { const month = expense.expenseDate.toISOString().slice(0, 7); monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + Number(expense.amount)); }
  response.json({ success: true, data: { items: expenses, total: expenses.reduce((sum, item) => sum + Number(item.amount), 0), monthlyTotals: [...monthlyTotals].sort(([left], [right]) => left.localeCompare(right)).map(([month, total]) => ({ month, total })) } });
});

router.post("/", validate(expenseSchema), async (request, response) => {
  const businessId = requireBusiness(request);
  const expense = await prisma.businessExpense.create({ data: { ...request.body, businessId, createdById: request.auth!.userId, expenseDate: new Date(request.body.expenseDate) } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "EXPENSE_CREATED", resourceType: "business_expense", resourceId: expense.id, metadata: { category: expense.category, amount: Number(expense.amount) } });
  response.status(201).json({ success: true, data: expense });
});

router.patch("/:id", validate(expenseSchema.partial()), async (request, response) => {
  const businessId = requireBusiness(request);
  const existing = await prisma.businessExpense.findFirst({ where: { id: routeParam(request.params.id), businessId, status: ExpenseStatus.ACTIVE } });
  if (!existing) throw notFound("Expense");
  const expense = await prisma.businessExpense.update({ where: { id: existing.id }, data: { ...request.body, expenseDate: request.body.expenseDate ? new Date(request.body.expenseDate) : undefined } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "EXPENSE_EDITED", resourceType: "business_expense", resourceId: expense.id, metadata: { fields: Object.keys(request.body) } });
  response.json({ success: true, data: expense });
});

router.delete("/:id", validate(z.object({ reason: z.string().trim().min(3).max(500) })), async (request, response) => {
  const businessId = requireBusiness(request);
  const existing = await prisma.businessExpense.findFirst({ where: { id: routeParam(request.params.id), businessId, status: ExpenseStatus.ACTIVE } });
  if (!existing) throw notFound("Expense");
  const expense = await prisma.businessExpense.update({ where: { id: existing.id }, data: { status: ExpenseStatus.VOID, voidReason: request.body.reason } });
  await writeAudit(prisma, request, { businessId, userId: request.auth!.userId, userRole: request.auth!.role, action: "EXPENSE_VOIDED", resourceType: "business_expense", resourceId: expense.id, metadata: { reason: request.body.reason } });
  response.json({ success: true, data: expense });
});

router.get("/export.csv", async (request, response) => {
  const businessId = requireBusiness(request);
  const range = dateRange(request.query);
  const expenses = await prisma.businessExpense.findMany({ where: { businessId, status: ExpenseStatus.ACTIVE, ...(Object.keys(range).length ? { expenseDate: range } : {}) }, orderBy: { expenseDate: "desc" } });
  const escape = (value: string | number | boolean | null | undefined): string => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["Date", "Category", "Description", "Supplier", "Amount", "Reference", "Recurring"], ...expenses.map((expense) => [expense.expenseDate.toISOString().slice(0, 10), expense.category, expense.description, expense.supplier ?? "", Number(expense.amount), expense.reference ?? "", expense.recurring])];
  response.setHeader("content-type", "text/csv; charset=utf-8");
  response.setHeader("content-disposition", "attachment; filename=business-expenses.csv");
  response.send(rows.map((row) => row.map(escape).join(",")).join("\r\n"));
});

export { router as expenseRouter };
