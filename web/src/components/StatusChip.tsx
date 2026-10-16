import { Chip } from "@mui/material";

const colorFor = (status: string): "success" | "warning" | "error" | "info" | "default" => {
  if (["ACTIVE", "PAID", "COMPLETED", "COLLECTED", "READY_FOR_COLLECTION", "DELIVERED", "READY_FOR_DELIVERY"].includes(status)) return "success";
  if (["WAITING_FOR_PARTS", "AWAITING_CUSTOMER_APPROVAL", "AWAITING_APPROVAL", "PARTIALLY_PAID", "PAST_DUE", "PENDING"].includes(status)) return "warning";
  if (["CANCELLED", "DISABLED", "SUSPENDED", "FAILED"].includes(status)) return "error";
  if (["IN_PROGRESS", "TESTING", "DIAGNOSING", "ISSUED", "SENT"].includes(status)) return "info";
  return "default";
};

export function StatusChip({ status }: { status: string }) {
  const color = colorFor(status);
  const words = status.replaceAll("_", " ").toLowerCase();
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return <Chip className="product-status-chip" size="small" color={color} variant="outlined" label={label} title={label} sx={(theme) => ({ fontWeight: 650, fontSize: 12, lineHeight: 1.4, height: "auto", minHeight: 28, width: "max-content", minWidth: label.length >= 20 ? "min(148px, 100%)" : 0, maxWidth: "min(192px, 100%)", flexShrink: 0, borderRadius: "var(--product-radius-control, 12px)", color: color === "default" ? theme.palette.text.secondary : color === "warning" ? theme.palette.text.primary : color === "info" ? theme.palette.primary.dark : theme.palette[color].dark, borderColor: color === "default" ? theme.palette.divider : undefined, "& .MuiChip-label": { px: 1.25, py: 0.5, whiteSpace: "normal", overflowWrap: "normal", wordBreak: "normal", textAlign: "center" } })} />;
}

