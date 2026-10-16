import ArrowBack from "@mui/icons-material/ArrowBack";
import AssignmentInd from "@mui/icons-material/AssignmentInd";
import ContentCopy from "@mui/icons-material/ContentCopy";
import EditOutlined from "@mui/icons-material/EditOutlined";
import NoteAdd from "@mui/icons-material/NoteAdd";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Checkbox, Chip, Divider, FormControlLabel, Grid, LinearProgress, MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { BrandLogo } from "../components/BrandLogo";
import { CreateButton, DataTable, FormDialog, KeyValue } from "../components/DataViews";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { RecordName } from "../components/product/RecordName";
import { WhatsAppShareButton } from "../components/WhatsAppShareButton";
import { repairDate, sentenceCase } from "../components/repair/repairPresentation";
import type { ApiEnvelope, Customer, DigitalServiceKind, DigitalServiceStatus, DigitalTicket, DigitalTicketDetail, PublicDigitalTicket, Technician } from "../types";

const kinds: Record<DigitalServiceKind, string> = { WEBSITE: "Website", SOFTWARE: "Software", AI_AGENT: "AI agent" };
const statuses: DigitalServiceStatus[] = ["INTAKE", "DISCOVERY", "AWAITING_APPROVAL", "IN_PROGRESS", "TESTING", "READY_FOR_DELIVERY", "DELIVERED", "CANCELLED"];
const transitions: Record<DigitalServiceStatus, DigitalServiceStatus[]> = {
  INTAKE: ["DISCOVERY", "CANCELLED"],
  DISCOVERY: ["AWAITING_APPROVAL", "IN_PROGRESS", "CANCELLED"],
  AWAITING_APPROVAL: ["DISCOVERY", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["TESTING", "AWAITING_APPROVAL", "CANCELLED"],
  TESTING: ["IN_PROGRESS", "READY_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_DELIVERY: ["TESTING", "DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};
const emptyIntake = { kind: "WEBSITE" as DigitalServiceKind, customerId: "", title: "", requirements: "", priority: "NORMAL", assignedTechnicianId: "", estimatedCompletionAt: "", customerVisibleNotes: "", internalNotes: "" };
const emptyCustomer = { fullName: "", phone: "", email: "", whatsappPhone: "", preferredCommunication: "EMAIL", whatsappOptIn: false };

function digitalContext(params: URLSearchParams) {
  return { q: params.get("q") ?? "", kind: Object.hasOwn(kinds, params.get("kind") ?? "") ? params.get("kind")! : "", status: statuses.includes(params.get("status") as DigitalServiceStatus) ? params.get("status")! : "", sort: params.get("sort") === "oldest" ? "oldest" : "newest" };
}

function digitalReturnPath(search: unknown) {
  const context = digitalContext(new URLSearchParams(typeof search === "string" ? search : ""));
  const params = new URLSearchParams();
  for (const key of ["q", "kind", "status"] as const) if (context[key]) params.set(key, context[key]);
  if (context.sort !== "newest") params.set("sort", context.sort);
  return `/digital-services${params.size ? `?${params.toString()}` : ""}`;
}

function TrackingLink({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage("Tracking link copied."); }
    catch { setMessage("Copy is unavailable. Select and copy the link below."); }
  };
  return <Alert severity="info" action={<Button size="small" startIcon={<ContentCopy />} onClick={() => void copy()}>Copy</Button>}>
    Share this private tracking link only with the customer.
    <Typography component="div" variant="body2" sx={{ wordBreak: "break-all", mt: 1, userSelect: "all" }}>{url}</Typography>
    {message && <Typography variant="caption" role="status">{message}</Typography>}
  </Alert>;
}

function ProgressHistory({ entries, newestFirst = false }: { entries: PublicDigitalTicket["statusHistory"]; newestFirst?: boolean }) {
  if (!entries.length) return <Typography variant="body2" color="text.secondary" mt={2}>No stage changes have been recorded.</Typography>;
  return <Stack component="ol" sx={{ listStyle: "none", p: 0, m: 0, mt: 2.5 }}>{(newestFirst ? [...entries].reverse() : entries).map((entry, index) => <Box component="li" key={`${entry.toStatus}-${entry.createdAt}`} position="relative" pl={2.5} pb={index < entries.length - 1 ? 3 : 0} borderLeft={index < entries.length - 1 ? 1 : 0} borderColor="divider">
    <Box position="absolute" left={-4} top={5} width={7} height={7} borderRadius="50%" bgcolor="primary.main" />
    <Typography variant="body2" fontWeight={650}>{sentenceCase(entry.toStatus)}</Typography>
    <Typography variant="caption" color="text.secondary">{repairDate(entry.createdAt, true)}</Typography>
    {entry.customerMessage && <Typography mt={0.5} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.customerMessage}</Typography>}
  </Box>)}</Stack>;
}

export function DigitalServicesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const admin = user?.role === "BUSINESS_ADMIN";
  const [params, setParams] = useSearchParams();
  const { q: search, kind, status, sort } = digitalContext(params);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyIntake);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [newCustomer, setNewCustomer] = useState(emptyCustomer);
  const [created, setCreated] = useState<{ reference: string; trackingUrl: string; kind: DigitalServiceKind; customerName: string; phone?: string; whatsappPhone?: string } | null>(null);
  const tickets = useQuery({ queryKey: ["digital-services", kind, status], placeholderData: keepPreviousData, queryFn: async () => (await api.get<ApiEnvelope<DigitalTicket[]>>("/digital-services", { params: { kind: kind || undefined, status: status || undefined } })).data.data });
  const customers = useQuery({ queryKey: ["customers"], queryFn: async () => (await api.get<ApiEnvelope<Customer[]>>("/customers")).data.data, enabled: admin });
  const technicians = useQuery({ queryKey: ["technicians"], queryFn: async () => (await api.get<ApiEnvelope<Technician[]>>("/businesses/technicians")).data.data, enabled: admin });
  const create = useMutation({
    mutationFn: async () => {
      const selectedCustomer = customerMode === "new" ? newCustomer : customers.data?.find((customer) => customer.id === form.customerId);
      const contact = { customerName: selectedCustomer?.fullName ?? "", phone: selectedCustomer?.phone, whatsappPhone: selectedCustomer?.whatsappPhone };
      const response = (await api.post<ApiEnvelope<DigitalTicket> & { trackingUrl: string }>("/digital-services", {
      ...form,
      customerId: customerMode === "existing" ? form.customerId : undefined,
      newCustomer: customerMode === "new" ? { ...newCustomer, email: newCustomer.email || undefined, whatsappPhone: newCustomer.whatsappPhone || undefined } : undefined,
      assignedTechnicianId: form.assignedTechnicianId || undefined,
      estimatedCompletionAt: form.estimatedCompletionAt ? new Date(form.estimatedCompletionAt).toISOString() : undefined,
      internalNotes: form.internalNotes || undefined,
      customerVisibleNotes: form.customerVisibleNotes || undefined,
      })).data;
      return { response, contact };
    },
    onSuccess: async ({ response, contact }) => {
      setCreated({ ...contact, kind: response.data.kind, reference: response.data.reference, trackingUrl: response.trackingUrl });
      setForm(emptyIntake); setNewCustomer(emptyCustomer);
      await queryClient.invalidateQueries({ queryKey: ["digital-services"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  function updateContext(key: "q" | "kind" | "status" | "sort", value: string) {
    setParams((current) => { const next = new URLSearchParams(current); if (!value || (key === "sort" && value === "newest")) next.delete(key); else next.set(key, value); return next; }, { replace: true });
  }
  if (tickets.isLoading) return <LoadingBlock label="Loading digital projects" />;
  if (tickets.error) return <ErrorBlock message={apiMessage(tickets.error)} retry={() => void tickets.refetch()} />;
  const visible = (tickets.data ?? []).filter((ticket) => `${ticket.reference} ${ticket.title} ${ticket.customer.fullName}`.toLowerCase().includes(search.toLowerCase())).sort((left, right) => (sort === "oldest" ? 1 : -1) * (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()));
  const validCustomer = customerMode === "existing" ? Boolean(form.customerId) : newCustomer.fullName.trim().length >= 2 && newCustomer.phone.trim().length >= 7;
  return <>
    <PageHeader title={user?.role === "TECHNICIAN" ? "My digital solutions" : "Digital solutions"} description="Website, software, and AI-agent projects — from intake to delivery." actions={admin ? <CreateButton label="New digital intake" onClick={() => { create.reset(); setCreated(null); setOpen(true); }} /> : undefined} />
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}><Stack direction={{ xs: "column", md: "row" }} spacing={2}>
      <TextField fullWidth size="small" label="Search tickets" placeholder="Reference, project or customer" value={search} onChange={(event) => updateContext("q", event.target.value)} />
      <TextField select size="small" label="Service" value={kind} onChange={(event) => updateContext("kind", event.target.value)} sx={{ minWidth: { md: 160 } }}><MenuItem value="">All services</MenuItem>{Object.entries(kinds).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      <TextField select size="small" label="Status" value={status} onChange={(event) => updateContext("status", event.target.value)} sx={{ minWidth: { md: 200 } }}><MenuItem value="">All statuses</MenuItem>{statuses.map((value) => <MenuItem key={value} value={value}>{sentenceCase(value)}</MenuItem>)}</TextField>
      <TextField select size="small" label="Order loaded projects" value={sort} onChange={(event) => updateContext("sort", event.target.value)} sx={{ minWidth: { md: 170 } }}><MenuItem value="newest">Newest received</MenuItem><MenuItem value="oldest">Oldest received</MenuItem></TextField>
    </Stack><Stack direction="row" justifyContent="space-between" gap={2} alignItems="center" mt={2}><Typography variant="caption" color="text.secondary" role="status">{tickets.isPlaceholderData ? "Updating selected filters. Previous loaded projects remain visible." : <>{visible.length} matching projects · {tickets.data?.length ?? 0} loaded. Up to 100 projects are loaded per service and stage.</>}</Typography>{(search || kind || status) && <Button size="small" onClick={() => setParams(sort === "newest" ? {} : { sort })}>Clear filters</Button>}</Stack>{tickets.isFetching && <LinearProgress aria-label="Refreshing digital projects" sx={{ mt: 2 }} />}</Paper>
    {visible.length ? <DataTable minTableWidth={1000} caption="Digital projects · current loaded results" columns={["Project", "Service / customer", "Stage", "Assigned to / priority", "Received"]} rowKeys={visible.map((ticket) => ticket.id)} mobileSummaryColumns={[0, 2]} rows={visible.map((ticket) => [
      <Stack spacing={0.5}><Button component={Link} to={`/digital-services/${ticket.id}`} state={{ digitalListSearch: params.toString() }} sx={{ p: 0, justifyContent: "flex-start", fontWeight: 750 }}>{ticket.reference}</Button><RecordName>{ticket.title}</RecordName></Stack>,
      <Stack spacing={0.5}><Typography variant="body2">{kinds[ticket.kind]}</Typography><RecordName fontWeight={400}>{ticket.customer.fullName}</RecordName></Stack>, <StatusChip status={ticket.status} />,
      <Stack spacing={1}><RecordName fontWeight={400}>{ticket.assignedTechnician?.fullName ?? "Unassigned"}</RecordName>{["URGENT", "HIGH"].includes(ticket.priority) ? <Chip size="small" variant="outlined" label={`${sentenceCase(ticket.priority)} priority`} sx={{ alignSelf: "flex-start", color: ticket.priority === "URGENT" ? "error.dark" : "text.primary" }} /> : <Typography variant="caption" color="text.secondary">{sentenceCase(ticket.priority)} priority</Typography>}</Stack>, repairDate(ticket.createdAt),
    ])} /> : <Paper variant="outlined"><EmptyState title={search || kind || status ? "No projects match this view" : "A clear path from scope to delivery"} description={search || kind || status ? "Try another service, stage or search within the loaded projects." : admin ? "Create a website, software or AI-agent service intake to begin the project record." : "Digital projects linked to you will appear here."} /></Paper>}
    <FormDialog open={open} title={created ? "Digital intake complete" : "New digital intake"} busy={create.isPending} error={create.error ? apiMessage(create.error) : undefined} onClose={() => setOpen(false)} onSubmit={() => created ? setOpen(false) : create.mutate()} submitLabel={created ? "Done" : "Create ticket"} submitDisabled={!created && (!validCustomer || form.title.trim().length < 3 || form.requirements.trim().length < 3)} maxWidth="md" dirty={!created && (JSON.stringify(form) !== JSON.stringify(emptyIntake) || JSON.stringify(newCustomer) !== JSON.stringify(emptyCustomer))} description={created ? "The project has been recorded. Share the private tracking link with its customer." : "Capture the customer, service and agreed scope. Planning details can be added when they are known."}>
      {created ? <><Alert severity="success">Ticket {created.reference} has been created. Automatic notification delivery depends on customer consent and configured providers; manual WhatsApp sharing is available below.</Alert><TrackingLink url={created.trackingUrl} /><WhatsAppShareButton customerName={created.customerName} phone={created.phone} whatsappPhone={created.whatsappPhone} reference={created.reference} trackingUrl={created.trackingUrl} serviceLabel={kinds[created.kind]} /></> : <>
        <Box><Typography variant="overline" color="text.secondary">01 · SERVICE & CUSTOMER</Typography><Typography variant="h6" component="h2">Who is this project for?</Typography></Box>
        <TextField select label="Service type" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as DigitalServiceKind })}>{Object.entries(kinds).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        {customers.error && <ErrorBlock message={apiMessage(customers.error)} retry={() => void customers.refetch()} />}
        <Stack direction="row" gap={1}><Button variant={customerMode === "existing" ? "contained" : "outlined"} onClick={() => setCustomerMode("existing")}>Select existing</Button><Button variant={customerMode === "new" ? "contained" : "outlined"} onClick={() => setCustomerMode("new")}>Register new</Button></Stack>
        {customerMode === "existing" ? <TextField select required label="Customer" value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>{(customers.data ?? []).map((customer) => <MenuItem key={customer.id} value={customer.id}>{customer.fullName} · {customer.phone}</MenuItem>)}</TextField> : <>
          <TextField required label="Customer or business name" inputProps={{ minLength: 2, maxLength: 120 }} value={newCustomer.fullName} onChange={(event) => setNewCustomer({ ...newCustomer, fullName: event.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField required fullWidth type="tel" label="Phone" inputProps={{ minLength: 7, maxLength: 30 }} value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value, whatsappOptIn: false })} /><TextField fullWidth type="email" label="Email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} /></Stack>
          <TextField type="tel" label="WhatsApp phone" inputProps={{ minLength: 7, maxLength: 30 }} value={newCustomer.whatsappPhone} onChange={(event) => setNewCustomer({ ...newCustomer, whatsappPhone: event.target.value, whatsappOptIn: false })} />
          <TextField select label="Preferred communication" value={newCustomer.preferredCommunication} onChange={(event) => setNewCustomer({ ...newCustomer, preferredCommunication: event.target.value })}><MenuItem value="EMAIL">Email</MenuItem><MenuItem value="WHATSAPP">WhatsApp</MenuItem></TextField>
          <FormControlLabel control={<Checkbox checked={newCustomer.whatsappOptIn} onChange={(event) => setNewCustomer({ ...newCustomer, whatsappOptIn: event.target.checked })} />} label="Customer agrees to receive ticket and status messages on WhatsApp" />
          <Typography variant="caption" color="text.secondary">Record this only with the customer’s permission. Opt-in sends the intake ticket and private tracking link on WhatsApp; ongoing updates follow the selected communication preference.</Typography>
        </>}
        <Divider /><Box><Typography variant="overline" color="text.secondary">02 · PROJECT SCOPE</Typography><Typography variant="h6" component="h2">What will be delivered?</Typography></Box>
        <TextField required label="Project title" inputProps={{ minLength: 3, maxLength: 180 }} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <TextField required multiline minRows={4} label="Requirements" inputProps={{ minLength: 3, maxLength: 10000 }} value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })} helperText="Describe deliverables and acceptance criteria. Do not enter passwords, API keys, or other secrets." />
        <Accordion disableGutters elevation={0} sx={{ "&:before": { display: "none" } }}><AccordionSummary expandIcon={<ExpandMore />}><Box><Typography variant="subtitle2">Planning & additional notes</Typography><Typography variant="caption" color="text.secondary">Assignment, priority, estimated delivery and visibility</Typography></Box></AccordionSummary><AccordionDetails><Stack spacing={2.5}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField select fullWidth label="Priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField select fullWidth label="Assign team member" value={form.assignedTechnicianId} onChange={(event) => setForm({ ...form, assignedTechnicianId: event.target.value })}><MenuItem value="">Unassigned</MenuItem>{(technicians.data ?? []).filter((person) => person.status === "ACTIVE").map((person) => <MenuItem key={person.id} value={person.id}>{person.fullName}</MenuItem>)}</TextField></Stack>
        <TextField type="datetime-local" label="Estimated delivery" value={form.estimatedCompletionAt} onChange={(event) => setForm({ ...form, estimatedCompletionAt: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField multiline minRows={2} label="Customer-visible intake note" inputProps={{ maxLength: 3000 }} value={form.customerVisibleNotes} onChange={(event) => setForm({ ...form, customerVisibleNotes: event.target.value })} />
        <TextField multiline minRows={2} label="Internal project note" inputProps={{ maxLength: 5000 }} value={form.internalNotes} onChange={(event) => setForm({ ...form, internalNotes: event.target.value })} />
        </Stack></AccordionDetails></Accordion>
        <Alert severity="info">Digital projects use manual invoices. No labour charge or inventory item is added automatically.</Alert>
      </>}
    </FormDialog>
  </>;
}

export function DigitalServiceDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const routeState = location.state as { digitalListSearch?: unknown } | null;
  const backPath = digitalReturnPath(routeState?.digitalListSearch);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const admin = user?.role === "BUSINESS_ADMIN";
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [technicianId, setTechnicianId] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState("INTERNAL");
  const [showTracking, setShowTracking] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [noteView, setNoteView] = useState("all");
  const [edit, setEdit] = useState({ title: "", requirements: "", priority: "NORMAL", estimatedCompletionAt: "", internalNotes: "", customerVisibleNotes: "" });
  const query = useQuery({ queryKey: ["digital-service", id], queryFn: async () => (await api.get<ApiEnvelope<DigitalTicketDetail>>(`/digital-services/${id}`)).data.data });
  const technicians = useQuery({ queryKey: ["technicians"], queryFn: async () => (await api.get<ApiEnvelope<Technician[]>>("/businesses/technicians")).data.data, enabled: admin });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["digital-service", id] }); await queryClient.invalidateQueries({ queryKey: ["digital-services"] }); };
  const changeStatus = useMutation({ mutationFn: () => api.post(`/digital-services/${id}/status`, { status: nextStatus, customerMessage: customerMessage || undefined }), onSuccess: async () => { setStatusOpen(false); setCustomerMessage(""); setNotice("Project stage updated. The customer notification has been requested."); await refresh(); } });
  const assign = useMutation({ mutationFn: () => api.post(`/digital-services/${id}/assign`, { technicianId: technicianId || null }), onSuccess: async () => { setAssignmentOpen(false); setNotice("Project assignment saved."); await refresh(); } });
  const addNote = useMutation({ mutationFn: () => api.post(`/digital-services/${id}/notes`, { body: note, visibility }), onSuccess: async () => { setNoteOpen(false); setNote(""); setNotice("Project note saved with the selected visibility."); await refresh(); } });
  const update = useMutation({ mutationFn: () => api.patch(`/digital-services/${id}`, { ...edit, estimatedCompletionAt: edit.estimatedCompletionAt ? new Date(edit.estimatedCompletionAt).toISOString() : null, internalNotes: edit.internalNotes || null, customerVisibleNotes: edit.customerVisibleNotes || null }), onSuccess: async () => { setEditOpen(false); setNotice("Project scope and details saved."); await refresh(); } });
  const tracking = useQuery({ queryKey: ["digital-service-tracking", id], queryFn: async () => (await api.get<ApiEnvelope<{ trackingUrl: string }>>(`/digital-services/${encodeURIComponent(id)}/tracking`)).data.data, enabled: Boolean(query.data && (admin || (user?.role === "TECHNICIAN" && query.data.assignedTechnician?.id === user.id))), retry: false });
  if (query.isLoading) return <LoadingBlock label="Opening digital project" />;
  if (query.error || !query.data) return <ErrorBlock message={apiMessage(query.error)} retry={() => void query.refetch()} />;
  const ticket = query.data;
  const canManage = admin || (user?.role === "TECHNICIAN" && ticket.assignedTechnician?.id === user.id);
  const allowedStatuses = transitions[ticket.status];
  const visibleNotes = ticket.notes.filter((entry) => (canManage || entry.visibility === "CUSTOMER") && (noteView === "all" || entry.visibility === noteView));
  const busy = changeStatus.isPending || assign.isPending || addNote.isPending || update.isPending;
  const pastEstimate = Boolean(ticket.estimatedCompletionAt) && !["DELIVERED", "CANCELLED"].includes(ticket.status) && new Date(ticket.estimatedCompletionAt!).getTime() < Date.now();
  return <>
    <Button component={Link} to={backPath} startIcon={<ArrowBack />} sx={{ mb: 1 }}>Back to digital solutions</Button>
    <PageHeader title={ticket.reference} description={`${kinds[ticket.kind]} · ${ticket.title}`} actions={<Stack direction="row" flexWrap="wrap" gap={1}>
      {canManage && allowedStatuses.length > 0 && <Button variant="contained" disabled={busy} onClick={() => { changeStatus.reset(); setNextStatus(allowedStatuses[0]); setStatusOpen(true); }}>Update stage</Button>}
      {admin && <Button startIcon={<EditOutlined />} disabled={busy} onClick={() => { update.reset(); const date = ticket.estimatedCompletionAt ? new Date(ticket.estimatedCompletionAt) : null; setEdit({ title: ticket.title, requirements: ticket.requirements, priority: ticket.priority, estimatedCompletionAt: date && Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "", internalNotes: ticket.internalNotes ?? "", customerVisibleNotes: ticket.customerVisibleNotes ?? "" }); setEditOpen(true); }}>Edit project</Button>}
      {admin && <Button startIcon={<AssignmentInd />} disabled={busy} onClick={() => { assign.reset(); setTechnicianId(ticket.assignedTechnician?.id ?? ""); setAssignmentOpen(true); }}>Assign</Button>}
    </Stack>} />
    {notice && <Alert severity="success" role="status" onClose={() => setNotice("")} sx={{ mb: 2 }}>{notice}</Alert>}
    {query.isFetching && <LinearProgress aria-label="Refreshing digital project" sx={{ mb: 2 }} />}
    <Paper variant="outlined" sx={{ px: 3, py: 1.5, mb: 2.5 }}><Stack direction="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" gap={1.5}><Stack direction="row" alignItems="center" gap={1.5}><StatusChip status={ticket.status} /><Typography variant="body2" color="text.secondary">{kinds[ticket.kind]} service</Typography></Stack>{["URGENT", "HIGH"].includes(ticket.priority) ? <Chip size="small" variant="outlined" label={`${sentenceCase(ticket.priority)} priority`} sx={{ color: ticket.priority === "URGENT" ? "error.dark" : "text.primary" }} /> : <Typography variant="caption" color="text.secondary">{sentenceCase(ticket.priority)} priority</Typography>}</Stack></Paper>
    <Grid container spacing={3} alignItems="flex-start">
      <Grid size={{ xs: 12, lg: 8 }}>
        <Card component="section" aria-labelledby="digital-requirements-heading"><CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Typography id="digital-requirements-heading" variant="h6" component="h2">Project requirements</Typography>
          <Typography mt={1.5} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.75 }}>{ticket.requirements}</Typography>
          <Box sx={{ display: { xs: "grid", lg: "none" }, gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2, mt: 2.5, py: 2, borderTop: 1, borderBottom: 1, borderColor: "divider" }}><KeyValue label="Assigned to" value={ticket.assignedTechnician?.fullName ?? "Unassigned"} /><KeyValue label={pastEstimate ? "Past estimated delivery" : "Estimated delivery"} value={repairDate(ticket.estimatedCompletionAt ?? undefined, true)} /></Box>
          {ticket.customerVisibleNotes && <Alert severity="info" sx={{ mt: 3 }}><Typography variant="subtitle2">Customer-visible update</Typography><Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{ticket.customerVisibleNotes}</Typography></Alert>}
          {canManage && ticket.internalNotes && <Box mt={3}><Typography variant="subtitle2" component="h3">Internal project note</Typography><Typography variant="body2" mt={1} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{ticket.internalNotes}</Typography></Box>}
          <Divider sx={{ my: 3 }} />
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={2}><Box><Typography variant="h6" component="h2">Project notes</Typography><Typography variant="body2" color="text.secondary">{canManage ? "Working notes and clearly marked customer updates." : "Updates shared by the project team."}</Typography></Box>{canManage && <Button startIcon={<NoteAdd />} disabled={busy} onClick={() => { addNote.reset(); setNoteOpen(true); }}>Add note</Button>}</Stack>
          {canManage && ticket.notes.length > 0 && <Tabs value={noteView} onChange={(_event, value: string) => setNoteView(value)} aria-label="Filter project notes" variant="scrollable" allowScrollButtonsMobile sx={{ mt: 2 }}><Tab value="all" label="All notes" /><Tab value="INTERNAL" label="Team notes" /><Tab value="CUSTOMER" label="Customer updates" /></Tabs>}
          <Stack component="ol" sx={{ listStyle: "none", p: 0, m: 0, mt: 2 }}>{visibleNotes.length ? visibleNotes.map((entry, index) => <Box component="li" key={entry.id} sx={{ py: 2.5, borderTop: index ? 1 : 0, borderColor: "divider" }}><Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} gap={1}><Stack direction="row" gap={1} alignItems="center"><Typography variant="body2" fontWeight={650}>{entry.author?.fullName ?? "Project team"}</Typography><Chip size="small" variant="outlined" color={entry.visibility === "CUSTOMER" ? "primary" : "default"} label={entry.visibility === "INTERNAL" ? "Internal" : "Customer-visible"} /></Stack><Typography variant="caption" color="text.secondary">{repairDate(entry.createdAt, true)}</Typography></Stack><Typography variant="body2" mt={1.5} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.7 }}>{entry.body}</Typography></Box>) : <Box py={3}><Typography fontWeight={650}>No notes in this view</Typography><Typography variant="body2" color="text.secondary" mt={0.5}>{canManage ? "Record a scope decision, development progress or a customer update." : "The project team will share updates here."}</Typography></Box>}</Stack>
        </CardContent></Card>
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Card component="section" aria-labelledby="digital-context-heading"><CardContent sx={{ p: 3 }}><Typography id="digital-context-heading" variant="h6" component="h2" mb={2.5}>Project context</Typography><Stack spacing={2.5}>
          <KeyValue label="Customer" value={ticket.customer.fullName} /><KeyValue label="Assigned to" value={ticket.assignedTechnician?.fullName ?? "Unassigned"} /><KeyValue label="Received" value={repairDate(ticket.createdAt)} /><KeyValue label="Estimated delivery" value={repairDate(ticket.estimatedCompletionAt ?? undefined, true)} />
        </Stack>{pastEstimate && <Alert severity="warning" sx={{ mt: 2, color: "text.primary" }}>Past estimated delivery. {canManage ? "Review progress and keep the customer informed." : "Contact the team for an updated expected date."}</Alert>}
        {canManage && <><Divider sx={{ my: 3 }} /><Typography variant="subtitle2" mb={1.5}>Customer tracking</Typography><WhatsAppShareButton customerName={ticket.customer.fullName} phone={ticket.customer.phone} whatsappPhone={ticket.customer.whatsappPhone} reference={ticket.reference} trackingUrl={tracking.data?.trackingUrl} serviceLabel={kinds[ticket.kind]} disabled={tracking.isPending || tracking.isError} /><Button startIcon={<ContentCopy />} sx={{ mt: 1 }} onClick={() => setShowTracking((value) => !value)} disabled={tracking.isPending || tracking.isError}>{showTracking ? "Hide customer tracking link" : "Show customer tracking link"}</Button></>}
        {canManage && showTracking && tracking.data && <Box mt={2}><TrackingLink url={tracking.data.trackingUrl} /></Box>}
        {canManage && tracking.error && <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => void tracking.refetch()}>Retry</Button>}>{apiMessage(tracking.error)}</Alert>}
        </CardContent></Card>
        <Card component="section" aria-labelledby="digital-history-heading" sx={{ mt: 3 }}><CardContent sx={{ p: 3 }}><Typography id="digital-history-heading" variant="h6" component="h2">Progress history</Typography><Typography variant="caption" color="text.secondary">Recorded stage changes · latest first</Typography><ProgressHistory entries={ticket.statusHistory} newestFirst /></CardContent></Card>
        {(admin || user?.role === "CUSTOMER") && <Card component="section" aria-labelledby="digital-billing-heading" sx={{ mt: 3 }}><CardContent sx={{ p: 3 }}><Typography id="digital-billing-heading" variant="h6" component="h2">Manual invoices</Typography><Typography variant="body2" color="text.secondary" mt={1} mb={2}>Charges are entered explicitly for agreed digital deliverables.</Typography>{ticket.invoices.map((invoice) => <Button fullWidth component={Link} to={`/invoices/${invoice.id}`} key={invoice.id} sx={{ justifyContent: "space-between" }}>{invoice.number}<StatusChip status={invoice.paymentStatus} /></Button>)}{!ticket.invoices.length && <Typography variant="body2" color="text.secondary">No invoice created.</Typography>}{admin && <Button variant="outlined" startIcon={<ReceiptLong />} component={Link} to={`/invoices?digitalTicketId=${encodeURIComponent(ticket.id)}`} sx={{ mt: 2 }}>Create manual invoice</Button>}</CardContent></Card>}
      </Grid>
    </Grid>
    <FormDialog open={statusOpen} title="Update digital project stage" busy={changeStatus.isPending} error={changeStatus.error ? apiMessage(changeStatus.error) : undefined} onClose={() => setStatusOpen(false)} onSubmit={() => changeStatus.mutate()} submitDisabled={!nextStatus} submitLabel="Update and notify" dirty={Boolean(customerMessage) || nextStatus !== allowedStatuses[0]} description="Choose a supported stage. The optional update is visible to the customer and included in the notification request.">
      <TextField select required label="Next stage" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>{allowedStatuses.map((value) => <MenuItem key={value} value={value}>{sentenceCase(value)}</MenuItem>)}</TextField><TextField multiline minRows={2} label="Customer-visible update" inputProps={{ maxLength: 1000 }} value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} />{nextStatus === "CANCELLED" && <Alert severity="warning">This ends the workflow. Billing and project history will remain auditable.</Alert>}
    </FormDialog>
    <FormDialog open={assignmentOpen} title="Assign project team member" busy={assign.isPending} error={assign.error ? apiMessage(assign.error) : undefined} onClose={() => setAssignmentOpen(false)} onSubmit={() => assign.mutate()} submitLabel="Save assignment" dirty={technicianId !== (ticket.assignedTechnician?.id ?? "")} submitDisabled={technicians.isLoading || Boolean(technicians.error)} description="Only active team members can be assigned. Choose Unassigned to clear the current owner.">
      {technicians.error && <ErrorBlock message={apiMessage(technicians.error)} retry={() => void technicians.refetch()} />}
      <TextField select label="Team member" value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}><MenuItem value="">Unassigned</MenuItem>{(technicians.data ?? []).filter((person) => person.status === "ACTIVE").map((person) => <MenuItem key={person.id} value={person.id}>{person.fullName}</MenuItem>)}</TextField>
    </FormDialog>
    <FormDialog open={noteOpen} title="Add project note" busy={addNote.isPending} error={addNote.error ? apiMessage(addNote.error) : undefined} onClose={() => setNoteOpen(false)} onSubmit={() => addNote.mutate()} submitDisabled={note.trim().length < 3} submitLabel="Save note" dirty={Boolean(note) || visibility !== "INTERNAL"} description="Internal notes stay with the project team. Mark customer updates deliberately.">
      <TextField required multiline minRows={3} label="Note" inputProps={{ maxLength: 5000 }} value={note} onChange={(event) => setNote(event.target.value)} /><TextField select label="Visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}><MenuItem value="INTERNAL">Internal team only</MenuItem><MenuItem value="CUSTOMER">Customer-visible</MenuItem></TextField>
    </FormDialog>
    <FormDialog open={editOpen} title="Edit digital project" busy={update.isPending} error={update.error ? apiMessage(update.error) : undefined} onClose={() => setEditOpen(false)} onSubmit={() => update.mutate()} submitDisabled={edit.title.trim().length < 3 || edit.requirements.trim().length < 3} maxWidth="md" submitLabel="Save project" description="Update the recorded scope and planning information. These changes do not create invoice charges.">
      <TextField required label="Project title" inputProps={{ minLength: 3, maxLength: 180 }} value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} /><TextField required multiline minRows={4} label="Requirements" inputProps={{ minLength: 3, maxLength: 10000 }} value={edit.requirements} onChange={(event) => setEdit({ ...edit, requirements: event.target.value })} /><TextField select label="Priority" value={edit.priority} onChange={(event) => setEdit({ ...edit, priority: event.target.value })}>{["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField type="datetime-local" label="Estimated delivery" value={edit.estimatedCompletionAt} onChange={(event) => setEdit({ ...edit, estimatedCompletionAt: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} /><TextField multiline minRows={2} label="Customer-visible intake note" inputProps={{ maxLength: 3000 }} value={edit.customerVisibleNotes} onChange={(event) => setEdit({ ...edit, customerVisibleNotes: event.target.value })} /><TextField multiline minRows={2} label="Internal project note" inputProps={{ maxLength: 5000 }} value={edit.internalNotes} onChange={(event) => setEdit({ ...edit, internalNotes: event.target.value })} />
    </FormDialog>
  </>;
}

export function PublicDigitalTrackPage() {
  const { token = "" } = useParams();
  const query = useQuery({ queryKey: ["public-digital-service", token], queryFn: async () => (await api.get<ApiEnvelope<PublicDigitalTicket>>(`/digital-services/track/${encodeURIComponent(token)}`)).data.data, enabled: Boolean(token), retry: false });
  if (query.isLoading) return <LoadingBlock label="Finding your digital project" />;
  if (query.error || !query.data) return <Box minHeight="100vh" display="grid" sx={{ placeItems: "center" }} p={2}><Alert severity="error">That tracking link is invalid or expired. Check the complete link from your service provider.</Alert></Box>;
  const ticket = query.data;
  const currency = ticket.business.currency ?? "KES";
  const customerNotes = (ticket.notes ?? []).filter((entry) => entry.visibility !== "INTERNAL");
  return <Box component="main" className="product-ui" minHeight="100vh" py={{ xs: 3, md: 7 }} px={2}><Box maxWidth={850} mx="auto">
    <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={2} mb={4}><BrandLogo className="brand-logo--tracker" /><Box><Typography variant="h5">{ticket.business.name}</Typography><Typography color="text.secondary">Customer digital project tracker</Typography></Box></Stack>
    <Card><CardContent sx={{ p: { xs: 3, md: 5 } }}>{ticket.business.logoImageUrl && <Box component="img" src={ticket.business.logoImageUrl} alt={`${ticket.business.name} logo`} sx={{ maxWidth: 180, maxHeight: 100, objectFit: "contain", mb: 2 }} />}<Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}><Box><Typography variant="overline" color="text.secondary">{kinds[ticket.kind]} ticket</Typography><Typography component="h1" variant="h3" sx={{ overflowWrap: "anywhere" }}>{ticket.reference}</Typography><Typography mt={1}>{ticket.title}</Typography></Box><Box><StatusChip status={ticket.status} /></Box></Stack>
      <Grid container spacing={3} mt={2}><Grid size={{ xs: 12, sm: 6 }}><KeyValue label="Received" value={new Date(ticket.dateReceived).toLocaleDateString()} /></Grid><Grid size={{ xs: 12, sm: 6 }}><KeyValue label="Estimated delivery" value={ticket.estimatedCompletionAt ? new Date(ticket.estimatedCompletionAt).toLocaleDateString() : "Not scheduled"} /></Grid></Grid>
      <Divider sx={{ my: 3 }} /><Typography variant="h6">Progress</Typography><ProgressHistory entries={ticket.statusHistory} />{ticket.customerVisibleNotes && <Alert severity="info">{ticket.customerVisibleNotes}</Alert>}
      {customerNotes.length > 0 && <><Divider sx={{ my: 3 }} /><Typography variant="h6" mb={2}>Project updates</Typography>{customerNotes.map((entry, index) => <Box key={`${entry.createdAt}-${index}`} py={1}><Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.body}</Typography><Typography variant="caption" color="text.secondary">{new Date(entry.createdAt).toLocaleString()}</Typography></Box>)}</>}
      {ticket.invoices.length > 0 && <><Divider sx={{ my: 3 }} /><Typography variant="h6" mb={2}>Billing status</Typography>{ticket.invoices.map((invoice) => <Stack key={invoice.number} direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} py={1}><Typography fontWeight={700}>{invoice.number}</Typography><Typography>{invoice.paymentStatus.replaceAll("_", " ")} · Balance {currency} {Number(invoice.balance).toLocaleString()}</Typography></Stack>)}</>}
      <Typography variant="body2" color="text.secondary" mt={4}>For project changes or delivery arrangements, contact {ticket.business.name} at {ticket.business.phone}.</Typography>
    </CardContent></Card>
  </Box></Box>;
}
