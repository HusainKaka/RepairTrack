import { Chip } from "@mui/material";

const colorFor = (status: string): "success" | "warning" | "error" | "info" | "default" => {
  if (["ACTIVE", "PAID", "COMPLETED", "COLLECTED", "READY_FOR_COLLECTION"].includes(status)) return "success";
  if (["WAITING_FOR_PARTS", "AWAITING_CUSTOMER_APPROVAL", "PARTIALLY_PAID", "PAST_DUE"].includes(status)) return "warning";
  if (["CANCELLED", "DISABLED", "SUSPENDED", "FAILED"].includes(status)) return "error";
  if (["IN_PROGRESS", "TESTING", "DIAGNOSING", "ISSUED", "SENT"].includes(status)) return "info";
  return "default";
};

export function StatusChip({ status }: { status: string }) {
  return <Chip size="small" color={colorFor(status)} variant="outlined" label={status.replaceAll("_", " ")} sx={{ fontWeight: 700, fontSize: 11 }} />;
}

