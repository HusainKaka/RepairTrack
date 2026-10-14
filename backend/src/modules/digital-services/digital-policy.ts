import { DigitalTicketStatus, type DigitalServiceKind, type RoleCode } from "../../generated/prisma/index.js";

const transitions: Record<DigitalTicketStatus, readonly DigitalTicketStatus[]> = {
  INTAKE: [DigitalTicketStatus.DISCOVERY, DigitalTicketStatus.CANCELLED],
  DISCOVERY: [DigitalTicketStatus.AWAITING_APPROVAL, DigitalTicketStatus.IN_PROGRESS, DigitalTicketStatus.CANCELLED],
  AWAITING_APPROVAL: [DigitalTicketStatus.DISCOVERY, DigitalTicketStatus.IN_PROGRESS, DigitalTicketStatus.CANCELLED],
  IN_PROGRESS: [DigitalTicketStatus.TESTING, DigitalTicketStatus.AWAITING_APPROVAL, DigitalTicketStatus.CANCELLED],
  TESTING: [DigitalTicketStatus.IN_PROGRESS, DigitalTicketStatus.READY_FOR_DELIVERY, DigitalTicketStatus.CANCELLED],
  READY_FOR_DELIVERY: [DigitalTicketStatus.TESTING, DigitalTicketStatus.DELIVERED, DigitalTicketStatus.CANCELLED],
  DELIVERED: [],
  CANCELLED: [],
};

export const canDigitalTransition = (from: DigitalTicketStatus, to: DigitalTicketStatus): boolean => transitions[from].includes(to);

export const digitalReferencePrefix: Record<DigitalServiceKind, string> = { WEBSITE: "WEB", SOFTWARE: "SW", AI_AGENT: "AI" };

export function digitalAccessRestriction(role: RoleCode, userId: string) {
  if (role === "TECHNICIAN") return { assignedTechnicianId: userId };
  if (role === "CUSTOMER") return { customer: { userId, deletedAt: null } };
  return {};
}

/** Never return reusable tracking secrets in ordinary authenticated DTOs. */
export function digitalTicketView(value: unknown, customer = false): unknown {
  if (Array.isArray(value)) return value.map((item) => digitalTicketView(item, customer));
  if (!value || typeof value !== "object" || value instanceof Date || typeof (value as { toJSON?: unknown }).toJSON === "function") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "publicTrackingTokenHash" && key !== "publicTrackingTokenEncrypted" && (!customer || key !== "internalNotes")).map(([key, item]) => [key, digitalTicketView(item, customer)]));
}
