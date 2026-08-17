import { CustomerNotificationPreference, RepairStatus } from "../../generated/prisma/index.js";

export type RepairNotificationEvent = "RECEIVED" | "APPROVAL_REQUIRED" | "COMPLETED" | "CANCELLED";

export function repairNotificationEvent(status: RepairStatus): RepairNotificationEvent | null {
  if (status === RepairStatus.RECEIVED) return "RECEIVED";
  if (status === RepairStatus.AWAITING_CUSTOMER_APPROVAL) return "APPROVAL_REQUIRED";
  if (status === RepairStatus.COMPLETED || status === RepairStatus.READY_FOR_COLLECTION) return "COMPLETED";
  if (status === RepairStatus.CANCELLED) return "CANCELLED";
  return null;
}

export function shouldSendRepairMessage(
  preference: CustomerNotificationPreference,
  event: RepairNotificationEvent,
): boolean {
  if (preference === CustomerNotificationPreference.EMAIL) {
    return event === "RECEIVED" || event === "COMPLETED" || event === "CANCELLED";
  }
  return true;
}

export function repairTemplateKey(event: RepairNotificationEvent): string {
  return event === "RECEIVED" ? "repair.received" : `repair.terminal.${event.toLowerCase()}`;
}

