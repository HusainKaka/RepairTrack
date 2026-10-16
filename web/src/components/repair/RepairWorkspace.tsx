import ContentCopy from "@mui/icons-material/ContentCopy";
import NoteAdd from "@mui/icons-material/NoteAdd";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, Paper, Stack, Tab, Tabs, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { RepairDetail, Role } from "../../types";
import { KeyValue } from "../DataViews";
import { StatusChip } from "../StatusChip";
import { WhatsAppShareButton } from "../WhatsAppShareButton";
import { customerStageGuidance, repairDate, sentenceCase, stageGuidance } from "./repairPresentation";

interface Props {
  repair: RepairDetail;
  role?: Role;
  canEdit: boolean;
  trackingUrl?: string;
  trackingBusy: boolean;
  trackingError?: string;
  onRetryTracking(): void;
  onAddNote(): void;
  onAddPart(): void;
}

export function RepairWorkspace({ repair, role, canEdit, trackingUrl, trackingBusy, trackingError, onRetryTracking, onAddNote, onAddPart }: Props) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down("md"));
  const [noteView, setNoteView] = useState("all");
  const [copyFeedback, setCopyFeedback] = useState("");
  const allowedNotes = role === "CUSTOMER" ? repair.notes.filter((note) => note.visibility === "CUSTOMER") : repair.notes;
  const visibleNotes = allowedNotes.filter((note) => noteView === "all" || note.visibility === noteView).reverse();
  const optional = repair as RepairDetail & { warrantyInformation?: string };
  const pastEstimate = !["COMPLETED", "READY_FOR_COLLECTION", "COLLECTED", "CANCELLED"].includes(repair.status) && Boolean(repair.estimatedCompletionAt) && new Date(repair.estimatedCompletionAt!).getTime() < Date.now();
  async function copyTracking() {
    if (!trackingUrl) return;
    try { await navigator.clipboard.writeText(trackingUrl); setCopyFeedback("Private tracking link copied."); }
    catch { setCopyFeedback("The link could not be copied. Use Send to WhatsApp, or try again."); }
  }
  return <>
    <Paper variant="outlined" className="repair-stage-strip" sx={{ px: { xs: 2.5, md: 3 }, py: 1.5, mb: 2.5 }}>
      <Stack direction="row" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={{ xs: 1.5, md: 3 }}>
        <Stack spacing={0.75} minWidth={0}><Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: { xs: "none", md: "block" } }}>CURRENT STAGE</Typography><StatusChip status={repair.status} /></Stack>
        {!compact && <Typography variant="body2" color="text.secondary" flex={1} sx={{ maxWidth: 650 }}>{(role === "CUSTOMER" ? customerStageGuidance : stageGuidance)[repair.status] ?? "Review the repair record and recorded history below."}</Typography>}
        {repair.priority === "URGENT" || repair.priority === "HIGH" ? <Chip variant="outlined" size="small" color={repair.priority === "URGENT" ? "error" : "warning"} label={`${sentenceCase(repair.priority)} priority`} sx={{ color: repair.priority === "URGENT" ? "error.dark" : "text.primary" }} /> : <Typography variant="caption" color="text.secondary">{sentenceCase(repair.priority)} priority</Typography>}
        {compact && <Box component="details" sx={{ width: "100%", fontSize: 13, color: "text.secondary", "& summary": { cursor: "pointer", py: 0.5 }, "& p": { mb: 0.5, lineHeight: 1.6 } }}><summary>About this stage</summary><p>{(role === "CUSTOMER" ? customerStageGuidance : stageGuidance)[repair.status]}</p></Box>}
      </Stack>
    </Paper>
    <Grid container spacing={3} alignItems="flex-start">
      <Grid size={{ xs: 12, lg: 8 }}>
        <Card component="section" aria-labelledby="repair-workspace-title">
          <CardContent sx={{ p: { xs: 2.5, md: 3 }, "&:last-child": { pb: { xs: 2.5, md: 3 } } }}>
            <Typography id="repair-workspace-title" variant="h5" component="h2" sx={{ overflowWrap: "anywhere", display: { xs: "none", sm: "block" } }}>{repair.device.brand} {repair.device.model}</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5} sx={{ display: { xs: "none", sm: "block" } }}>{repair.device.type}{repair.device.serialNumber ? ` · ${repair.device.serialNumber}` : " · Serial not recorded"}</Typography>
            <Divider sx={{ my: 2, display: { xs: "none", sm: "block" } }} />
            <Typography variant="subtitle2" color="text.secondary" component="h2">Reported issue</Typography>
            <Typography mt={1} fontWeight={550} sx={{ fontSize: { xs: "1.06rem", md: "1.15rem" }, lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{repair.reportedIssue}</Typography>
            <Box sx={{ display: { xs: "grid", lg: "none" }, gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2, mt: 2.5, py: 2, borderTop: 1, borderBottom: 1, borderColor: "divider" }}><KeyValue label="Assigned to" value={repair.assignedTechnician?.fullName ?? "Unassigned"} /><KeyValue label={pastEstimate ? "Past estimated completion" : "Estimated completion"} value={repairDate(repair.estimatedCompletionAt, true)} /></Box>
            {canEdit && repair.diagnosis && <Box mt={3}><Typography variant="subtitle2" component="h3">Diagnosis <Typography component="span" variant="caption" color="text.secondary">· Workshop only</Typography></Typography><Typography variant="body2" mt={1} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{repair.diagnosis}</Typography></Box>}
            {repair.customerVisibleNotes && <Alert severity="info" sx={{ mt: 3 }}><Typography variant="subtitle2">Customer-visible update</Typography><Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{repair.customerVisibleNotes}</Typography></Alert>}
            {canEdit && repair.internalNotes && <Box mt={3}><Typography variant="subtitle2" component="h3">Intake workshop note <Typography component="span" variant="caption" color="text.secondary">· Internal</Typography></Typography><Typography variant="body2" mt={1} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{repair.internalNotes}</Typography></Box>}
            <Divider sx={{ my: 3 }} />
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={2}>
              <Box><Typography variant="h6" component="h2">Repair notes</Typography><Typography variant="body2" color="text.secondary">{canEdit ? "Keep workshop observations separate from customer updates." : "Updates shared by the repair team."}</Typography></Box>
              {canEdit && <Button startIcon={<NoteAdd />} onClick={onAddNote} sx={{ flexShrink: 0 }}>Add note</Button>}
            </Stack>
            {canEdit && allowedNotes.length > 0 && <Tabs value={noteView} onChange={(_event, value: string) => setNoteView(value)} aria-label="Filter repair notes" variant="scrollable" allowScrollButtonsMobile sx={{ mt: 2 }}><Tab label={`All notes (${allowedNotes.length})`} value="all" /><Tab label="Workshop" value="INTERNAL" /><Tab label="Customer updates" value="CUSTOMER" /></Tabs>}
            <Stack spacing={0} mt={2} component="ol" sx={{ listStyle: "none", p: 0, mb: 0 }}>
              {visibleNotes.length ? visibleNotes.map((note, index) => <Box component="li" key={note.id} sx={{ py: 2.5, borderTop: index ? 1 : 0, borderColor: "divider" }}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}><Stack direction="row" gap={1} alignItems="center" flexWrap="wrap"><Typography fontWeight={650} variant="body2">{note.author?.fullName ?? "Repair team"}</Typography><Chip size="small" variant="outlined" color={note.visibility === "CUSTOMER" ? "primary" : "default"} label={note.visibility === "CUSTOMER" ? "Visible to customer" : "Internal"} /></Stack><Typography variant="caption" color="text.secondary">{repairDate(note.createdAt, true)}</Typography></Stack>
                <Typography variant="body2" mt={1.5} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.7 }}>{note.body}</Typography>
              </Box>) : <Box py={3}><Typography fontWeight={650}>{allowedNotes.length ? "No notes in this view" : "No repair notes yet"}</Typography><Typography variant="body2" color="text.secondary" mt={0.5}>{canEdit ? "Add a diagnosis observation, work performed or a clear customer update." : "The repair team will share updates here."}</Typography>{canEdit && !allowedNotes.length && <Button startIcon={<NoteAdd />} onClick={onAddNote} sx={{ mt: 1.5 }}>Write the first note</Button>}</Box>}
            </Stack>
          </CardContent>
        </Card>
        {repair.customerResponses && repair.customerResponses.length > 0 && <Box component="section" aria-label="Customer estimate responses" mt={3}><Typography variant="h6" component="h2" mb={1.5}>Estimate responses</Typography>{repair.customerResponses.map((response) => <Alert key={response.id} severity={response.decision === "ACCEPTED" ? "success" : "warning"} sx={{ mb: 1.5 }}>Estimate version {response.approvalVersion}: {sentenceCase(response.decision)}{response.declineReason ? ` — ${response.declineReason}` : ""}<Typography variant="caption" display="block">Recorded {repairDate(response.createdAt, true)}</Typography></Alert>)}</Box>}
        {canEdit && <Card component="section" aria-labelledby="parts-used-title" sx={{ mt: 3 }}><CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}><Box><Typography id="parts-used-title" variant="h6" component="h2">Parts used</Typography><Typography variant="body2" color="text.secondary">Recorded parts affect stock and the repair invoice.</Typography></Box><Button onClick={onAddPart} sx={{ flexShrink: 0, alignSelf: "flex-start" }}>Add part</Button></Stack>
          {repair.parts.length ? <Stack component="ul" sx={{ listStyle: "none", p: 0, m: 0, mt: 2 }}>{repair.parts.map((part) => <Stack component="li" key={part.id} direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} py={2} borderTop={1} borderColor="divider"><Box><Typography variant="body2" fontWeight={650}>{part.inventoryItem.name}</Typography><Typography variant="caption" color="text.secondary">{part.inventoryItem.sku}</Typography></Box><Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{part.quantity} × KES {Number(part.unitPrice).toLocaleString("en-KE")}</Typography></Stack>)}</Stack> : <Typography variant="body2" mt={2.5} color="text.secondary">No inventory parts have been used on this repair.</Typography>}
        </CardContent></Card>}
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Card component="section" aria-labelledby="repair-context-title"><CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Typography id="repair-context-title" variant="h6" component="h2" mb={2.5}>Job context</Typography>
          <Stack spacing={2.5}><KeyValue label="Customer" value={repair.customer.fullName} /><KeyValue label="Customer phone" value={repair.customer.phone} /><KeyValue label="Assigned technician" value={repair.assignedTechnician?.fullName ?? "Unassigned"} /><KeyValue label="Received" value={repairDate(repair.createdAt, true)} /><KeyValue label="Estimated completion" value={repairDate(repair.estimatedCompletionAt, true)} /><KeyValue label="Estimate" value={repair.estimatedCost !== undefined && repair.estimatedCost !== null ? `KES ${Number(repair.estimatedCost).toLocaleString("en-KE")}` : "Not set"} />{optional.warrantyInformation && <KeyValue label="Warranty information" value={optional.warrantyInformation} />}</Stack>
          {pastEstimate && <Alert severity="warning" sx={{ mt: 2, color: "text.primary" }}>Past estimated completion. {role === "CUSTOMER" ? "Contact the workshop for an updated expected date." : "Review progress and update the customer where appropriate."}</Alert>}
          {canEdit && <><Divider sx={{ my: 3 }} /><Typography variant="subtitle2" mb={1.5}>Customer tracking</Typography><WhatsAppShareButton customerName={repair.customer.fullName} phone={repair.customer.phone} whatsappPhone={repair.customer.whatsappPhone} reference={repair.reference} trackingUrl={trackingUrl} serviceLabel="Repair" disabled={trackingBusy || Boolean(trackingError)} />{trackingUrl && <Button size="small" startIcon={<ContentCopy />} onClick={() => void copyTracking()} sx={{ mt: 1 }}>Copy tracking link</Button>}{copyFeedback && <Typography role="status" variant="caption" display="block" mt={1}>{copyFeedback}</Typography>}{trackingError && <Alert severity="error" sx={{ mt: 1.5 }} action={<Button color="inherit" onClick={onRetryTracking}>Retry</Button>}>{trackingError}</Alert>}</>}
        </CardContent></Card>
        <Card component="section" aria-labelledby="repair-timeline-title" sx={{ mt: 3 }}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Typography id="repair-timeline-title" variant="h6" component="h2">Status timeline</Typography><Typography variant="caption" color="text.secondary">Recorded stage changes · latest first</Typography>
          {repair.statusHistory.length ? <Stack component="ol" sx={{ listStyle: "none", p: 0, m: 0, mt: 3 }}>{[...repair.statusHistory].reverse().map((entry, index) => <Box component="li" key={entry.id} sx={{ position: "relative", pl: 2.5, pb: index < repair.statusHistory.length - 1 ? 3 : 0, borderLeft: index < repair.statusHistory.length - 1 ? 1 : 0, borderColor: "divider" }}><Box sx={{ position: "absolute", left: -4, top: 5, width: 7, height: 7, borderRadius: "50%", bgcolor: index ? "text.disabled" : "primary.main" }} /><Typography variant="body2" fontWeight={650}>{sentenceCase(entry.toStatus)}</Typography><Typography variant="caption" color="text.secondary">{repairDate(entry.createdAt, true)}</Typography>{entry.customerMessage && <Typography variant="body2" color="text.secondary" mt={1} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.customerMessage}</Typography>}</Box>)}</Stack> : <Typography variant="body2" color="text.secondary" mt={2}>No stage history has been recorded.</Typography>}
        </CardContent></Card>
        <Card component="section" aria-labelledby="repair-billing-title" sx={{ mt: 3 }}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}><Typography id="repair-billing-title" variant="h6" component="h2">Billing</Typography>
          {role === "TECHNICIAN" && <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>Invoice summary · managed by the administrator</Typography>}
          {repair.invoices.length ? repair.invoices.map((invoice) => <Box key={invoice.id} mt={2}><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>{role === "BUSINESS_ADMIN" || role === "CUSTOMER" ? <Button component={Link} to={`/invoices/${invoice.id}`} sx={{ p: 0, justifyContent: "flex-start", fontVariantNumeric: "tabular-nums" }}>{invoice.number}</Button> : <Typography variant="body2" fontWeight={650}>{invoice.number}</Typography>}<StatusChip status={invoice.paymentStatus} /></Stack><Typography variant="caption" color="text.secondary" display="block" mt={0.5}>Balance {invoice.balance != null ? `KES ${Number(invoice.balance).toLocaleString("en-KE")}` : "not available"}</Typography></Box>) : <Typography variant="body2" color="text.secondary" mt={2}>No invoice has been created.</Typography>}
        </CardContent></Card>
      </Grid>
    </Grid>
  </>;
}
