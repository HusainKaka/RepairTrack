import type { RoleCode } from "../../generated/prisma/index.js";
const financialFields = new Set(["revenueToday", "revenueMonth", "outstanding", "monthlyRevenue"]);
export function dashboardView(data: Record<string, unknown>, role: RoleCode): Record<string, unknown> {
  return role === "BUSINESS_ADMIN" ? data : Object.fromEntries(Object.entries(data).filter(([key]) => !financialFields.has(key)));
}
