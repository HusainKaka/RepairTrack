/** Builds a tenant-scoped Prisma filter while preventing caller supplied fields from replacing the scope. */
export function tenantWhere<T extends Record<string, unknown>>(businessId: string, where: T): T & { businessId: string } {
  return { ...where, businessId };
}
