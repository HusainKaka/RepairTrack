import type { Repair } from "../../types";

export const repairStages = ["RECEIVED", "DIAGNOSING", "AWAITING_CUSTOMER_APPROVAL", "WAITING_FOR_PARTS", "IN_PROGRESS", "TESTING", "COMPLETED", "READY_FOR_COLLECTION", "COLLECTED", "CANCELLED"];

export const stageTransitions: Record<string, string[]> = {
  RECEIVED: ["DIAGNOSING", "CANCELLED"],
  DIAGNOSING: ["AWAITING_CUSTOMER_APPROVAL", "WAITING_FOR_PARTS", "IN_PROGRESS", "CANCELLED"],
  AWAITING_CUSTOMER_APPROVAL: ["WAITING_FOR_PARTS", "IN_PROGRESS", "CANCELLED"],
  WAITING_FOR_PARTS: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["TESTING", "WAITING_FOR_PARTS", "CANCELLED"],
  TESTING: ["IN_PROGRESS", "COMPLETED"],
  COMPLETED: ["READY_FOR_COLLECTION"],
  READY_FOR_COLLECTION: ["COLLECTED"],
  COLLECTED: [], CANCELLED: [],
};

export const stageGuidance: Record<string, string> = {
  RECEIVED: "The device has been checked in. Diagnosis is the next workshop stage.",
  DIAGNOSING: "Record the findings, then choose the appropriate next stage.",
  AWAITING_CUSTOMER_APPROVAL: "An estimate is awaiting the customer's response. Any recorded response appears below.",
  WAITING_FOR_PARTS: "The job is paused for parts. Continue when the required parts are available.",
  IN_PROGRESS: "Repair work is under way. Move to testing when the work is ready to check.",
  TESTING: "Check the repair before completion. Return to work if more attention is needed.",
  COMPLETED: "Testing is complete. Prepare the device for customer collection.",
  READY_FOR_COLLECTION: "The device is ready. Record collection when it has been handed over.",
  COLLECTED: "This repair has been collected. The record and history remain available.",
  CANCELLED: "This repair is cancelled. The record and history remain available.",
};

export const customerStageGuidance: Record<string, string> = {
  RECEIVED: "Your device has been received by the workshop.",
  DIAGNOSING: "The repair team is investigating the reported issue.",
  AWAITING_CUSTOMER_APPROVAL: "The repair team has requested your approval. Use your private tracking link to review the estimate and respond.",
  WAITING_FOR_PARTS: "The repair is waiting for required parts.",
  IN_PROGRESS: "The repair team is working on your device.",
  TESTING: "Your device is being checked after the repair work.",
  COMPLETED: "The repair is complete and is being prepared for collection.",
  READY_FOR_COLLECTION: "Your device is ready for collection. Contact the workshop to arrange handover.",
  COLLECTED: "Your device has been collected. Your repair history remains available here.",
  CANCELLED: "This repair has been cancelled. Contact the workshop if you have questions.",
};

export const nextActionLabel: Record<string, string> = {
  RECEIVED: "Start diagnosis", DIAGNOSING: "Choose next stage", AWAITING_CUSTOMER_APPROVAL: "Update stage",
  WAITING_FOR_PARTS: "Resume repair", IN_PROGRESS: "Move to testing", TESTING: "Review testing",
  COMPLETED: "Prepare for collection", READY_FOR_COLLECTION: "Record collection",
};

export function sentenceCase(value: string): string {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function repairDate(value?: string, includeTime = false): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value));
}

export type RepairSort = "priority" | "newest" | "oldest";
export function readRepairContext(params: URLSearchParams) {
  return {
    q: params.get("q") ?? "",
    status: repairStages.includes(params.get("status") ?? "") ? params.get("status")! : "",
    sort: (["newest", "oldest"].includes(params.get("sort") ?? "") ? params.get("sort") : "priority") as RepairSort,
  };
}

export function repairListPath(search: unknown): string {
  const context = readRepairContext(new URLSearchParams(typeof search === "string" ? search : ""));
  const params = new URLSearchParams();
  if (context.q) params.set("q", context.q);
  if (context.status) params.set("status", context.status);
  if (context.sort !== "priority") params.set("sort", context.sort);
  return `/repairs${params.size ? `?${params.toString()}` : ""}`;
}

export function sortedRepairs(repairs: Repair[], sort: RepairSort): Repair[] {
  const rank: Record<string, number> = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
  return [...repairs].sort((left, right) => {
    const dates = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    return sort === "oldest" ? -dates : sort === "newest" ? dates : (rank[right.priority] ?? 0) - (rank[left.priority] ?? 0) || dates;
  });
}
