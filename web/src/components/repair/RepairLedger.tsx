import ArrowForward from "@mui/icons-material/ArrowForward";
import { Box, Button, Chip, Divider, Paper, Stack, TablePagination, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Repair } from "../../types";
import { DataTable } from "../DataViews";
import { StatusChip } from "../StatusChip";
import { repairDate, sentenceCase } from "./repairPresentation";
import { RecordName } from "../product/RecordName";
import { useRecordLayout } from "../product/useRecordLayout";

function Priority({ priority }: { priority: string }) {
  return priority === "URGENT" || priority === "HIGH" ? <Chip size="small" variant="outlined" color={priority === "URGENT" ? "error" : "warning"} label={`${sentenceCase(priority)} priority`} sx={{ color: priority === "URGENT" ? "error.dark" : "text.primary" }} /> : <Typography variant="caption" color="text.secondary">{sentenceCase(priority)} priority</Typography>;
}

export function RepairLedger({ repairs, returnSearch }: { repairs: Repair[]; returnSearch: string }) {
  const { containerRef, compact } = useRecordLayout(1000);
  const [page, setPage] = useState(0);
  const pageSize = 15;
  const safePage = Math.min(page, Math.max(0, Math.ceil(repairs.length / pageSize) - 1));
  const mobileRepairs = repairs.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const linkState = { repairListSearch: returnSearch };
  const rows = compact ? [] : repairs.map((repair) => [
    <Stack spacing={0.5} key="identity" sx={{ minWidth: 180, maxWidth: 240 }}><Button component={Link} to={`/repairs/${repair.id}`} state={linkState} sx={{ p: 0, minHeight: 28, justifyContent: "flex-start", fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>{repair.reference}</Button><RecordName>{`${repair.device.brand} ${repair.device.model}`}</RecordName><Typography variant="caption" color="text.secondary">{repair.device.type}</Typography></Stack>,
    <Box key="issue" sx={{ maxWidth: 320 }}><Typography className="repair-issue-preview" variant="body2" sx={{ overflowWrap: "anywhere", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}>{repair.reportedIssue}</Typography><Typography variant="caption" color="text.secondary" display="block" mt={0.75}>{repair.customer.fullName}</Typography></Box>,
    <Stack key="stage" spacing={1} alignItems="flex-start"><StatusChip status={repair.status} /><Priority priority={repair.priority} /></Stack>,
    <Box key="owner" sx={{ minWidth: 140, maxWidth: 200, color: repair.assignedTechnician ? "text.primary" : "text.secondary" }}><RecordName fontWeight={400}>{repair.assignedTechnician?.fullName ?? "Unassigned"}</RecordName></Box>,
    <Typography key="received" variant="body2" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{repairDate(repair.createdAt)}</Typography>,
  ]);
  if (!compact) return <Box ref={containerRef} sx={{ minWidth: 0 }}><DataTable minTableWidth={1000} caption="Repair jobs · current loaded results" columns={["Job / device", "Reported issue / customer", "Stage / priority", "Assigned to", "Received"]} rows={rows} rowKeys={repairs.map((repair) => repair.id)} /></Box>;
  return <Box ref={containerRef} sx={{ minWidth: 0 }}>
    <Box component="ul" aria-label="Repair jobs" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
      {mobileRepairs.map((repair) => <Paper component="li" key={repair.id} variant="outlined" sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}><Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>{repair.reference}</Typography><StatusChip status={repair.status} /></Stack>
        <Button component={Link} to={`/repairs/${repair.id}`} state={linkState} endIcon={<ArrowForward />} sx={{ px: 0, mt: 1, width: "100%", justifyContent: "space-between", textAlign: "left", fontSize: 18, lineHeight: 1.4 }}><RecordName>{`${repair.device.brand} ${repair.device.model}`}</RecordName></Button>
        <Typography variant="body2" color="text.secondary" mt={0.5}>{repair.customer.fullName} · {repair.device.type}</Typography>
        <Typography className="repair-issue-preview" variant="body2" mt={1.5} sx={{ overflowWrap: "anywhere", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }}>{repair.reportedIssue}</Typography>
        <Divider sx={{ my: 2 }} />
        <Stack direction="row" justifyContent="space-between" alignItems="flex-end" gap={2}><Box minWidth={0}><Typography variant="caption" color="text.secondary" display="block">Assigned to</Typography><RecordName fontWeight={600}>{repair.assignedTechnician?.fullName ?? "Unassigned"}</RecordName></Box><Priority priority={repair.priority} /></Stack>
        <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>Received {repairDate(repair.createdAt)}</Typography>
      </Paper>)}
    </Box>
    {repairs.length > pageSize && <TablePagination component="div" count={repairs.length} page={safePage} rowsPerPage={pageSize} rowsPerPageOptions={[]} onPageChange={(_event, value) => setPage(value)} labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count} loaded jobs`} sx={{ mt: 2, ".MuiTablePagination-toolbar": { px: 0, flexWrap: "wrap" }, ".MuiTablePagination-spacer": { display: "none" } }} />}
  </Box>;
}
