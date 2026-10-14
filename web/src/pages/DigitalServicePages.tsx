import ArrowBack from "@mui/icons-material/ArrowBack";
import AssignmentInd from "@mui/icons-material/AssignmentInd";
import ContentCopy from "@mui/icons-material/ContentCopy";
import EditOutlined from "@mui/icons-material/EditOutlined";
import NoteAdd from "@mui/icons-material/NoteAdd";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import { Alert, Box, Button, Card, CardContent, Checkbox, Chip, Divider, FormControlLabel, Grid, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { BrandLogo } from "../components/BrandLogo";
import { CreateButton, DataTable, FormDialog, KeyValue } from "../components/DataViews";
import { ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
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

function TrackingLink({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage("Tracking link copied."); }
    catch { setMessage("Copy is unavailable. Select and copy the link below."); }
  };
  return <Alert severity="info" action={<Button size="small" startIcon={<ContentCopy />} onClick={() => void copy()}>Copy</Button>}>
    Share this private tracking link only with the customer.
    <Typography component="div" variant="body2" sx={{ wordBreak: "break-all", mt: 1, userSelect: "all" }}>{url}</Typography>
    {message && <Typography variant="caption">{message}</Typography>}
  </Alert>;
}

function ProgressHistory({ entries }: { entries: PublicDigitalTicket["statusHistory"] }) {
  return <Stack mt={2}>{entries.map((entry, index) => <Box key={`${entry.toStatus}-${entry.createdAt}`} position="relative" pl={3} pb={3} borderLeft={index < entries.length - 1 ? 2 : 0} borderColor="divider">
    <Box position="absolute" left={-7} top={2} width={12} height={12} borderRadius="50%" bgcolor="primary.main" />
    <Typography fontWeight={750}>{entry.toStatus.replaceAll("_", " ")}</Typography>
    <Typography variant="caption" color="text.secondary">{new Date(entry.createdAt).toLocaleString()}</Typography>
    {entry.customerMessage && <Typography mt={0.5} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.customerMessage}</Typography>}
  </Box>)}</Stack>;
}

export function DigitalServicesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const admin = user?.role === "BUSINESS_ADMIN";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyIntake);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [newCustomer, setNewCustomer] = useState(emptyCustomer);
  const [created, setCreated] = useState<{ reference: string; trackingUrl: string } | null>(null);
  const tickets = useQuery({ queryKey: ["digital-services", kind, status], queryFn: async () => (await api.get<ApiEnvelope<DigitalTicket[]>>("/digital-services", { params: { kind: kind || undefined, status: status || undefined } })).data.data });
  const customers = useQuery({ queryKey: ["customers"], queryFn: async () => (await api.get<ApiEnvelope<Customer[]>>("/customers")).data.data, enabled: admin });
  const technicians = useQuery({ queryKey: ["technicians"], queryFn: async () => (await api.get<ApiEnvelope<Technician[]>>("/businesses/technicians")).data.data, enabled: admin });
  const create = useMutation({
    mutationFn: async () => (await api.post<ApiEnvelope<DigitalTicket> & { trackingUrl: string }>("/digital-services", {
      ...form,
      customerId: customerMode === "existing" ? form.customerId : undefined,
      newCustomer: customerMode === "new" ? { ...newCustomer, email: newCustomer.email || undefined, whatsappPhone: newCustomer.whatsappPhone || undefined } : undefined,
      assignedTechnicianId: form.assignedTechnicianId || undefined,
      estimatedCompletionAt: form.estimatedCompletionAt ? new Date(form.estimatedCompletionAt).toISOString() : undefined,
      internalNotes: form.internalNotes || undefined,
      customerVisibleNotes: form.customerVisibleNotes || undefined,
    })).data,
    onSuccess: async (response) => {
      setCreated({ reference: response.data.reference, trackingUrl: response.trackingUrl });
      setForm(emptyIntake); setNewCustomer(emptyCustomer);
      await queryClient.invalidateQueries({ queryKey: ["digital-services"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  if (tickets.isLoading) return <LoadingBlock />;
  if (tickets.error) return <ErrorBlock message={apiMessage(tickets.error)} retry={() => void tickets.refetch()} />;
  const visible = (tickets.data ?? []).filter((ticket) => `${ticket.reference} ${ticket.title} ${ticket.customer.fullName}`.toLowerCase().includes(search.toLowerCase()));
  const validCustomer = customerMode === "existing" ? Boolean(form.customerId) : newCustomer.fullName.trim().length >= 2 && newCustomer.phone.trim().length >= 7;
  return <>
    <PageHeader title={user?.role === "TECHNICIAN" ? "My digital solutions" : "Digital solutions"} description="Website, software, and AI-agent projects — from intake to delivery." actions={admin ? <CreateButton label="New digital intake" onClick={() => { create.reset(); setCreated(null); setOpen(true); }} /> : undefined} />
    <Stack direction={{ xs: "column", md: "row" }} spacing={2} mb={3}>
      <TextField fullWidth size="small" label="Search tickets" value={search} onChange={(event) => setSearch(event.target.value)} />
      <TextField select size="small" label="Service" value={kind} onChange={(event) => setKind(event.target.value)} sx={{ minWidth: 180 }}><MenuItem value="">All services</MenuItem>{Object.entries(kinds).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      <TextField select size="small" label="Status" value={status} onChange={(event) => setStatus(event.target.value)} sx={{ minWidth: 220 }}><MenuItem value="">All statuses</MenuItem>{statuses.map((value) => <MenuItem key={value} value={value}>{value.replaceAll("_", " ")}</MenuItem>)}</TextField>
    </Stack>
    <DataTable columns={["Ticket", "Project", "Customer", "Status", "Priority", "Assigned to", "Received"]} empty="No digital projects match this view." rows={visible.map((ticket) => [
      <Button component={Link} to={`/digital-services/${ticket.id}`} sx={{ p: 0, fontWeight: 800 }}>{ticket.reference}</Button>,
      <Stack><Typography fontWeight={700}>{ticket.title}</Typography><Typography variant="caption" color="text.secondary">{kinds[ticket.kind]}</Typography></Stack>,
      ticket.customer.fullName, <StatusChip status={ticket.status} />,
      <Chip size="small" variant="outlined" color={ticket.priority === "URGENT" ? "error" : ticket.priority === "HIGH" ? "warning" : "default"} label={ticket.priority} />,
      ticket.assignedTechnician?.fullName ?? "Unassigned", new Date(ticket.createdAt).toLocaleDateString(),
    ])} />
    <FormDialog open={open} title={created ? "Digital intake complete" : "New digital intake"} busy={create.isPending} error={create.error ? apiMessage(create.error) : undefined} onClose={() => setOpen(false)} onSubmit={() => created ? setOpen(false) : create.mutate()} submitLabel={created ? "Done" : "Create ticket"} submitDisabled={!created && (!validCustomer || form.title.trim().length < 3 || form.requirements.trim().length < 3)}>
      {created ? <><Alert severity="success">Ticket {created.reference} has been created. Notification delivery depends on customer consent and configured email/WhatsApp providers.</Alert><TrackingLink url={created.trackingUrl} /></> : <>
        <TextField select label="Service type" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as DigitalServiceKind })}>{Object.entries(kinds).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        <Divider>Customer</Divider>
        <Stack direction="row" gap={1}><Button variant={customerMode === "existing" ? "contained" : "outlined"} onClick={() => setCustomerMode("existing")}>Select existing</Button><Button variant={customerMode === "new" ? "contained" : "outlined"} onClick={() => setCustomerMode("new")}>Register new</Button></Stack>
        {customerMode === "existing" ? <TextField select required label="Customer" value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>{(customers.data ?? []).map((customer) => <MenuItem key={customer.id} value={customer.id}>{customer.fullName} · {customer.phone}</MenuItem>)}</TextField> : <>
          <TextField required label="Customer or business name" value={newCustomer.fullName} onChange={(event) => setNewCustomer({ ...newCustomer, fullName: event.target.value })} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField required fullWidth label="Phone" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value, whatsappOptIn: false })} /><TextField fullWidth type="email" label="Email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} /></Stack>
          <TextField label="WhatsApp phone" value={newCustomer.whatsappPhone} onChange={(event) => setNewCustomer({ ...newCustomer, whatsappPhone: event.target.value, whatsappOptIn: false })} />
          <TextField select label="Preferred communication" value={newCustomer.preferredCommunication} onChange={(event) => setNewCustomer({ ...newCustomer, preferredCommunication: event.target.value })}><MenuItem value="EMAIL">Email</MenuItem><MenuItem value="WHATSAPP">WhatsApp</MenuItem></TextField>
          <FormControlLabel control={<Checkbox checked={newCustomer.whatsappOptIn} onChange={(event) => setNewCustomer({ ...newCustomer, whatsappOptIn: event.target.checked })} />} label="Customer agrees to receive ticket and status messages on WhatsApp" />
          <Typography variant="caption" color="text.secondary">Record this only with the customer’s permission. Opt-in sends the intake ticket and private tracking link on WhatsApp; ongoing updates follow the selected communication preference.</Typography>
        </>}
        <Divider>Project scope</Divider>
        <TextField required label="Project title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <TextField required multiline minRows={4} label="Requirements" value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })} helperText="Describe deliverables and acceptance criteria. Do not enter passwords, API keys, or other secrets." />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}><TextField select fullWidth label="Priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField select fullWidth label="Assign team member" value={form.assignedTechnicianId} onChange={(event) => setForm({ ...form, assignedTechnicianId: event.target.value })}><MenuItem value="">Unassigned</MenuItem>{(technicians.data ?? []).filter((person) => person.status === "ACTIVE").map((person) => <MenuItem key={person.id} value={person.id}>{person.fullName}</MenuItem>)}</TextField></Stack>
        <TextField type="datetime-local" label="Estimated delivery" value={form.estimatedCompletionAt} onChange={(event) => setForm({ ...form, estimatedCompletionAt: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField multiline minRows={2} label="Customer-visible intake note" value={form.customerVisibleNotes} onChange={(event) => setForm({ ...form, customerVisibleNotes: event.target.value })} />
        <TextField multiline minRows={2} label="Internal project note" value={form.internalNotes} onChange={(event) => setForm({ ...form, internalNotes: event.target.value })} />
        <Alert severity="info">Digital projects use manual invoices. No labour charge or inventory item is added automatically.</Alert>
      </>}
    </FormDialog>
  </>;
}

export function DigitalServiceDetailPage() {
  const { id = "" } = useParams();
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
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ title: "", requirements: "", priority: "NORMAL", estimatedCompletionAt: "", internalNotes: "", customerVisibleNotes: "" });
  const query = useQuery({ queryKey: ["digital-service", id], queryFn: async () => (await api.get<ApiEnvelope<DigitalTicketDetail>>(`/digital-services/${id}`)).data.data });
  const technicians = useQuery({ queryKey: ["technicians"], queryFn: async () => (await api.get<ApiEnvelope<Technician[]>>("/businesses/technicians")).data.data, enabled: admin });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["digital-service", id] }); await queryClient.invalidateQueries({ queryKey: ["digital-services"] }); };
  const changeStatus = useMutation({ mutationFn: () => api.post(`/digital-services/${id}/status`, { status: nextStatus, customerMessage: customerMessage || undefined }), onSuccess: async () => { setStatusOpen(false); setCustomerMessage(""); await refresh(); } });
  const assign = useMutation({ mutationFn: () => api.post(`/digital-services/${id}/assign`, { technicianId: technicianId || null }), onSuccess: async () => { setAssignmentOpen(false); await refresh(); } });
  const addNote = useMutation({ mutationFn: () => api.post(`/digital-services/${id}/notes`, { body: note, visibility }), onSuccess: async () => { setNoteOpen(false); setNote(""); await refresh(); } });
  const update = useMutation({ mutationFn: () => api.patch(`/digital-services/${id}`, { ...edit, estimatedCompletionAt: edit.estimatedCompletionAt ? new Date(edit.estimatedCompletionAt).toISOString() : null, internalNotes: edit.internalNotes || null, customerVisibleNotes: edit.customerVisibleNotes || null }), onSuccess: async () => { setEditOpen(false); await refresh(); } });
  const tracking = useMutation({ mutationFn: async () => (await api.get<ApiEnvelope<{ trackingUrl: string }>>(`/digital-services/${id}/tracking`)).data.data });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error || !query.data) return <ErrorBlock message={apiMessage(query.error)} />;
  const ticket = query.data;
  const canManage = admin || (user?.role === "TECHNICIAN" && ticket.assignedTechnician?.id === user.id);
  const allowedStatuses = transitions[ticket.status];
  return <>
    <Button component={Link} to="/digital-services" startIcon={<ArrowBack />} sx={{ mb: 2 }}>Back to digital solutions</Button>
    <PageHeader title={ticket.reference} description={`${kinds[ticket.kind]} · ${ticket.title}`} actions={<Stack direction="row" flexWrap="wrap" gap={1}>
      {admin && <Button startIcon={<EditOutlined />} onClick={() => { update.reset(); setEdit({ title: ticket.title, requirements: ticket.requirements, priority: ticket.priority, estimatedCompletionAt: ticket.estimatedCompletionAt?.slice(0, 16) ?? "", internalNotes: ticket.internalNotes ?? "", customerVisibleNotes: ticket.customerVisibleNotes ?? "" }); setEditOpen(true); }}>Edit project</Button>}
      {admin && <Button startIcon={<AssignmentInd />} onClick={() => { assign.reset(); setTechnicianId(ticket.assignedTechnician?.id ?? ""); setAssignmentOpen(true); }}>Assign</Button>}
      {canManage && allowedStatuses.length > 0 && <Button variant="contained" onClick={() => { changeStatus.reset(); setNextStatus(allowedStatuses[0]); setStatusOpen(true); }}>Update stage</Button>}
    </Stack>} />
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, lg: 8 }}><Card><CardContent>
        <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1.5} mb={3}><StatusChip status={ticket.status} /><Chip variant="outlined" size="small" label={kinds[ticket.kind]} /></Stack>
        <Typography variant="h6">Project requirements</Typography><Typography mt={1} sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{ticket.requirements}</Typography>
        {ticket.customerVisibleNotes && <Alert severity="info" sx={{ mt: 3 }}>{ticket.customerVisibleNotes}</Alert>}
        {canManage && ticket.internalNotes && <Box mt={3}><Typography variant="subtitle2">Internal project note</Typography><Typography color="text.secondary" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{ticket.internalNotes}</Typography></Box>}
        <Divider sx={{ my: 3 }} /><Typography variant="h6">Progress history</Typography><ProgressHistory entries={ticket.statusHistory} />
      </CardContent></Card>
      <Card sx={{ mt: 3 }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} mb={2}><Typography variant="h6">Project notes</Typography>{canManage && <Button startIcon={<NoteAdd />} onClick={() => { addNote.reset(); setNoteOpen(true); }}>Add note</Button>}</Stack>
        {ticket.notes.length ? ticket.notes.filter((entry) => canManage || entry.visibility === "CUSTOMER").map((entry) => <Box key={entry.id} py={2} borderTop={1} borderColor="divider"><Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.body}</Typography><Typography variant="caption" color="text.secondary">{entry.visibility === "INTERNAL" ? "Internal · " : "Customer-visible · "}{entry.author?.fullName ? `${entry.author.fullName} · ` : ""}{new Date(entry.createdAt).toLocaleString()}</Typography></Box>) : <Typography color="text.secondary">No notes yet.</Typography>}
      </CardContent></Card></Grid>
      <Grid size={{ xs: 12, lg: 4 }}><Card><CardContent><Typography variant="h6" mb={2}>Project details</Typography><Stack spacing={2}>
        <KeyValue label="Customer" value={ticket.customer.fullName} /><KeyValue label="Assigned to" value={ticket.assignedTechnician?.fullName ?? "Unassigned"} /><KeyValue label="Priority" value={ticket.priority} /><KeyValue label="Received" value={new Date(ticket.createdAt).toLocaleDateString()} /><KeyValue label="Estimated delivery" value={ticket.estimatedCompletionAt ? new Date(ticket.estimatedCompletionAt).toLocaleString() : "Not scheduled"} />
      </Stack>{canManage && <Button fullWidth startIcon={<ContentCopy />} sx={{ mt: 3 }} onClick={() => tracking.mutate()} disabled={tracking.isPending}>Show customer tracking link</Button>}{tracking.data && <Box mt={2}><TrackingLink url={tracking.data.trackingUrl} /></Box>}{tracking.error && <Alert severity="error" sx={{ mt: 2 }}>{apiMessage(tracking.error)}</Alert>}</CardContent></Card>
      {(admin || user?.role === "CUSTOMER") && <Card sx={{ mt: 3 }}><CardContent><Typography variant="h6">Manual invoices</Typography><Typography variant="body2" color="text.secondary" mt={1} mb={2}>Charges are entered explicitly for agreed digital deliverables.</Typography>{ticket.invoices.map((invoice) => <Button fullWidth component={Link} to={`/invoices/${invoice.id}`} key={invoice.id} sx={{ justifyContent: "space-between" }}>{invoice.number}<StatusChip status={invoice.paymentStatus} /></Button>)}{!ticket.invoices.length && <Typography color="text.secondary">No invoice created.</Typography>}{admin && <Button variant="outlined" startIcon={<ReceiptLong />} component={Link} to={`/invoices?digitalTicketId=${encodeURIComponent(ticket.id)}`} sx={{ mt: 2 }}>Create manual invoice</Button>}</CardContent></Card>}
      </Grid>
    </Grid>
    <FormDialog open={statusOpen} title="Update digital project stage" busy={changeStatus.isPending} error={changeStatus.error ? apiMessage(changeStatus.error) : undefined} onClose={() => setStatusOpen(false)} onSubmit={() => changeStatus.mutate()} submitDisabled={!nextStatus}>
      <TextField select label="Next stage" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>{allowedStatuses.map((value) => <MenuItem key={value} value={value}>{value.replaceAll("_", " ")}</MenuItem>)}</TextField><TextField multiline minRows={2} label="Customer-visible update" value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} />{nextStatus === "CANCELLED" && <Alert severity="warning">This ends the workflow. Billing and project history will remain auditable.</Alert>}
    </FormDialog>
    <FormDialog open={assignmentOpen} title="Assign project team member" busy={assign.isPending} error={assign.error ? apiMessage(assign.error) : undefined} onClose={() => setAssignmentOpen(false)} onSubmit={() => assign.mutate()}>
      <TextField select label="Team member" value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}><MenuItem value="">Unassigned</MenuItem>{(technicians.data ?? []).filter((person) => person.status === "ACTIVE").map((person) => <MenuItem key={person.id} value={person.id}>{person.fullName}</MenuItem>)}</TextField>
    </FormDialog>
    <FormDialog open={noteOpen} title="Add project note" busy={addNote.isPending} error={addNote.error ? apiMessage(addNote.error) : undefined} onClose={() => setNoteOpen(false)} onSubmit={() => addNote.mutate()} submitDisabled={note.trim().length < 3}>
      <TextField required multiline minRows={3} label="Note" value={note} onChange={(event) => setNote(event.target.value)} /><TextField select label="Visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}><MenuItem value="INTERNAL">Internal team only</MenuItem><MenuItem value="CUSTOMER">Customer-visible</MenuItem></TextField>
    </FormDialog>
    <FormDialog open={editOpen} title="Edit digital project" busy={update.isPending} error={update.error ? apiMessage(update.error) : undefined} onClose={() => setEditOpen(false)} onSubmit={() => update.mutate()} submitDisabled={edit.title.trim().length < 3 || edit.requirements.trim().length < 3}>
      <TextField required label="Project title" value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} /><TextField required multiline minRows={4} label="Requirements" value={edit.requirements} onChange={(event) => setEdit({ ...edit, requirements: event.target.value })} /><TextField select label="Priority" value={edit.priority} onChange={(event) => setEdit({ ...edit, priority: event.target.value })}>{["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField type="datetime-local" label="Estimated delivery" value={edit.estimatedCompletionAt} onChange={(event) => setEdit({ ...edit, estimatedCompletionAt: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} /><TextField multiline minRows={2} label="Customer-visible intake note" value={edit.customerVisibleNotes} onChange={(event) => setEdit({ ...edit, customerVisibleNotes: event.target.value })} /><TextField multiline minRows={2} label="Internal project note" value={edit.internalNotes} onChange={(event) => setEdit({ ...edit, internalNotes: event.target.value })} />
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
  return <Box minHeight="100vh" py={{ xs: 3, md: 7 }} px={2}><Box maxWidth={850} mx="auto">
    <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} gap={2} mb={4}><BrandLogo className="brand-logo--tracker" /><Box><Typography variant="h5">{ticket.business.name}</Typography><Typography color="text.secondary">Customer digital project tracker</Typography></Box></Stack>
    <Card><CardContent sx={{ p: { xs: 3, md: 5 } }}>{ticket.business.logoImageUrl && <Box component="img" src={ticket.business.logoImageUrl} alt={`${ticket.business.name} logo`} sx={{ maxWidth: 180, maxHeight: 100, objectFit: "contain", mb: 2 }} />}<Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}><Box><Typography variant="overline" color="text.secondary">{kinds[ticket.kind]} ticket</Typography><Typography variant="h3" sx={{ overflowWrap: "anywhere" }}>{ticket.reference}</Typography><Typography mt={1}>{ticket.title}</Typography></Box><Box><StatusChip status={ticket.status} /></Box></Stack>
      <Grid container spacing={3} mt={2}><Grid size={{ xs: 12, sm: 6 }}><KeyValue label="Received" value={new Date(ticket.dateReceived).toLocaleDateString()} /></Grid><Grid size={{ xs: 12, sm: 6 }}><KeyValue label="Estimated delivery" value={ticket.estimatedCompletionAt ? new Date(ticket.estimatedCompletionAt).toLocaleDateString() : "Not scheduled"} /></Grid></Grid>
      <Divider sx={{ my: 3 }} /><Typography variant="h6">Progress</Typography><ProgressHistory entries={ticket.statusHistory} />{ticket.customerVisibleNotes && <Alert severity="info">{ticket.customerVisibleNotes}</Alert>}
      {customerNotes.length > 0 && <><Divider sx={{ my: 3 }} /><Typography variant="h6" mb={2}>Project updates</Typography>{customerNotes.map((entry, index) => <Box key={`${entry.createdAt}-${index}`} py={1}><Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.body}</Typography><Typography variant="caption" color="text.secondary">{new Date(entry.createdAt).toLocaleString()}</Typography></Box>)}</>}
      {ticket.invoices.length > 0 && <><Divider sx={{ my: 3 }} /><Typography variant="h6" mb={2}>Billing status</Typography>{ticket.invoices.map((invoice) => <Stack key={invoice.number} direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} py={1}><Typography fontWeight={700}>{invoice.number}</Typography><Typography>{invoice.paymentStatus.replaceAll("_", " ")} · Balance {currency} {Number(invoice.balance).toLocaleString()}</Typography></Stack>)}</>}
      <Typography variant="body2" color="text.secondary" mt={4}>For project changes or delivery arrangements, contact {ticket.business.name} at {ticket.business.phone}.</Typography>
    </CardContent></Card>
  </Box></Box>;
}
