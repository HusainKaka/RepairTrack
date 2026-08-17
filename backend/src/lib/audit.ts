import type { Prisma, PrismaClient, RoleCode } from "../generated/prisma/index.js";
import type { Request } from "express";

type AuditClient = PrismaClient | Prisma.TransactionClient;

export interface AuditEvent {
  businessId?: string | null;
  userId?: string | null;
  userRole?: RoleCode | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export async function writeAudit(client: AuditClient, request: Request | undefined, event: AuditEvent): Promise<void> {
  await client.auditLog.create({
    data: {
      businessId: event.businessId ?? undefined,
      userId: event.userId ?? undefined,
      userRole: event.userRole ?? undefined,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId ?? undefined,
      requestId: request?.requestId,
      ipAddress: request?.ip,
      userAgent: request?.get("user-agent")?.slice(0, 500),
      metadata: event.metadata
    }
  });
}
