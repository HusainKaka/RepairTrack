import { Box, Divider, Stack, Typography } from "@mui/material";
import type { CustomerPricing } from "../types";

type Money = string | number | null | undefined;
const numeric = (value: Money) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

/** Display saved invoice amounts; do not recalculate charges in the tracker. */
export function CustomerPricingBreakdown({ invoice, currency = "KES", showPayments = true }: { invoice: CustomerPricing; currency?: string; showPayments?: boolean }) {
  const money = (value: Money) => { const amount = numeric(value); return amount === null ? "—" : `${currency} ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
  const deduction = (value: Money) => `${(numeric(value) ?? 0) > 0 ? "− " : ""}${money(value)}`;
  const totalDiscount = numeric(invoice.discountAmount);
  const invoiceDiscount = numeric(invoice.invoiceLevelDiscount);
  const hasTax = (numeric(invoice.taxAmount) ?? 0) > 0;
  const itemDiscount = totalDiscount !== null && invoiceDiscount !== null ? Math.max(0, Math.round((totalDiscount - invoiceDiscount) * 100) / 100) : undefined;
  const summary = [
    ["Subtotal before discounts", money(invoice.subtotal)],
    ["Item discounts", deduction(itemDiscount)],
    ["Invoice discount", deduction(invoice.invoiceLevelDiscount)],
    ...(hasTax ? [["Tax", money(invoice.taxAmount)]] : []),
    ["Total", money(invoice.total)],
    ...(showPayments ? [["Paid", money(invoice.amountPaid)], ["Balance due", money(invoice.balance)]] : []),
  ];
  return <Box sx={{ minWidth: 0 }}>
    <Box component="ul" aria-label="Invoice items" sx={{ listStyle: "none", p: 0, m: 0 }}>
      {(invoice.items ?? []).map((item, index) => <Box component="li" key={index} sx={{ py: 2, borderBottom: 1, borderColor: "divider" }}>
        <Stack direction={{ xs: "column", sm: "row" }} gap={1} justifyContent="space-between" mb={1.5}>
          <Typography fontWeight={650} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{item.description}</Typography>
          <Typography fontWeight={650} sx={{ flexShrink: 0 }}>Line total {money(item.lineTotal)}</Typography>
        </Stack>
        <Box component="dl" sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: `repeat(${hasTax ? 4 : 3}, minmax(0, 1fr))` }, gap: 1.5, m: 0 }}>
          {[["Quantity", numeric(item.quantity)?.toLocaleString("en-KE") ?? "—"], ["Unit price", money(item.unitPrice)], ["Line discount", money(item.discount)], ...(hasTax ? [["Tax rate", numeric(item.taxRate) === null ? "—" : `${Number(item.taxRate)}%`]] : [])].map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}><Typography component="dt" variant="caption" color="text.secondary">{label}</Typography><Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: "anywhere" }}>{value}</Typography></Box>)}
        </Box>
      </Box>)}
    </Box>
    {!invoice.items?.length && <Typography variant="body2" color="text.secondary" my={2}>Item details are not available yet. Contact your service provider for a breakdown.</Typography>}
    <Box component="dl" sx={{ m: 0, mt: 2.5, ml: { sm: "auto" }, maxWidth: { sm: 400 }, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 1.25, alignItems: "baseline" }}>
      {summary.map(([label, value]) => <Box key={label} sx={{ display: "contents" }}><Typography component="dt" variant="body2" sx={{ fontWeight: ["Total", "Balance due"].includes(label) ? 750 : 400 }}>{label}</Typography><Typography component="dd" variant="body2" sx={{ m: 0, textAlign: "right", fontWeight: ["Total", "Balance due"].includes(label) ? 750 : 550, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{value}</Typography></Box>)}
    </Box>
    {invoice.status === "DRAFT" && <><Divider sx={{ mt: 2 }} /><Typography variant="caption" color="text.secondary" display="block" mt={1}>Draft estimate — amounts may change before the invoice is issued.</Typography></>}
  </Box>;
}
