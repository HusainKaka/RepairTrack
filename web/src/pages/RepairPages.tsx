import ArrowBack from "@mui/icons-material/ArrowBack";
import AssignmentInd from "@mui/icons-material/AssignmentInd";
import Build from "@mui/icons-material/Build";
import ContentCopy from "@mui/icons-material/ContentCopy";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import ExpandMore from "@mui/icons-material/ExpandMore";
import Search from "@mui/icons-material/Search";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import {
  CreateButton,
  FormDialog,
} from "../components/DataViews";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { WhatsAppShareButton } from "../components/WhatsAppShareButton";
import { RepairLedger } from "../components/repair/RepairLedger";
import { RepairWorkspace } from "../components/repair/RepairWorkspace";
import { nextActionLabel, readRepairContext, repairListPath, repairStages, sentenceCase, sortedRepairs, stageTransitions } from "../components/repair/repairPresentation";
import type {
  ApiEnvelope,
  Customer,
  Device,
  InventoryItem,
  Repair,
  RepairDetail,
  Technician,
} from "../types";

const emptyRepair = {
  customerId: "",
  deviceId: "",
  reportedIssue: "",
  assignedTechnicianId: "",
  estimatedCost: "",
  estimatedCompletionAt: "",
  priority: "NORMAL",
  warrantyInformation: "",
  internalNotes: "",
  customerVisibleNotes: "",
  notificationPreferenceOverride: "",
};
const emptyNewCustomer = { fullName: "", email: "", phone: "", whatsappPhone: "", kraPin: "", address: "", customerType: "INDIVIDUAL", preferredCommunication: "EMAIL", whatsappOptIn: false };
const emptyNewDevice = { type: "Laptop", brand: "", model: "", serialNumber: "", imei: "", colour: "", accessories: "", physicalCondition: "" };

export function RepairsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { q: search, status, sort } = readRepairContext(params);
  const [open, setOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [form, setForm] = useState(emptyRepair);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [deviceMode, setDeviceMode] = useState<"existing" | "new">("existing");
  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer);
  const [newDevice, setNewDevice] = useState(emptyNewDevice);
  const [trackingUrl, setTrackingUrl] = useState("");
  const [intakeCustomer, setIntakeCustomer] = useState<{ fullName: string; phone?: string; whatsappPhone?: string; reference: string } | null>(null);
  const repairs = useQuery({
    queryKey: ["repairs", status],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<Repair[]>>("/repairs", {
          params: { status: status || undefined },
        })
      ).data.data,
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Customer[]>>("/customers")).data.data,
    enabled: user?.role === "BUSINESS_ADMIN",
  });
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Device[]>>("/devices")).data.data,
    enabled: user?.role === "BUSINESS_ADMIN",
  });
  const technicians = useQuery({
    queryKey: ["technicians"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Technician[]>>("/businesses/technicians")).data
        .data,
    enabled: user?.role === "BUSINESS_ADMIN",
  });
  const create = useMutation({
    mutationFn: async () => {
      const selectedCustomer = customerMode === "new" ? newCustomer : customers.data?.find((customer) => customer.id === form.customerId);
      const contact = { fullName: selectedCustomer?.fullName ?? "", phone: selectedCustomer?.phone, whatsappPhone: selectedCustomer?.whatsappPhone };
      const data = (
        await api.post<ApiEnvelope<Repair & { trackingUrl: string }>>(
          "/repairs",
          {
            ...form,
            customerId: customerMode === "existing" ? form.customerId : undefined,
            newCustomer: customerMode === "new" ? { ...newCustomer, email: newCustomer.email || undefined, whatsappPhone: newCustomer.whatsappPhone || undefined, kraPin: newCustomer.kraPin || undefined, address: newCustomer.address || undefined } : undefined,
            deviceId: deviceMode === "existing" ? form.deviceId : undefined,
            newDevice: deviceMode === "new" ? { ...newDevice, serialNumber: newDevice.serialNumber || undefined, imei: newDevice.imei || undefined, colour: newDevice.colour || undefined, accessories: newDevice.accessories || undefined, physicalCondition: newDevice.physicalCondition || undefined } : undefined,
            assignedTechnicianId: form.assignedTechnicianId || undefined,
            estimatedCost: form.estimatedCost
              ? Number(form.estimatedCost)
              : undefined,
            estimatedCompletionAt: form.estimatedCompletionAt
              ? new Date(form.estimatedCompletionAt).toISOString()
              : undefined,
            warrantyInformation: form.warrantyInformation || undefined,
            internalNotes: form.internalNotes || undefined,
            customerVisibleNotes: form.customerVisibleNotes || undefined,
            notificationPreferenceOverride: form.notificationPreferenceOverride || undefined,
          },
        )
      ).data.data;
      return { data, contact };
    },
    onSuccess: async ({ data, contact }) => {
      setTrackingUrl(data.trackingUrl);
      setIntakeCustomer({ ...contact, reference: data.reference });
      setForm(emptyRepair);
      setNewCustomer(emptyNewCustomer);
      setNewDevice(emptyNewDevice);
      await queryClient.invalidateQueries({ queryKey: ["repairs"] });
    },
  });
  const visible = useMemo(
    () =>
      sortedRepairs((repairs.data ?? []).filter(
        (repair) =>
          !search ||
          `${repair.reference} ${repair.reportedIssue} ${repair.customer.fullName} ${repair.device.brand} ${repair.device.model} ${repair.device.serialNumber ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ), sort),
    [repairs.data, search, sort],
  );
  const customerDevices = (devices.data ?? []).filter(
    (device) => !form.customerId || device.customerId === form.customerId,
  );
  function updateContext(key: "q" | "status" | "sort", value: string) {
    setParams((current) => { const next = new URLSearchParams(current); if (!value || (key === "sort" && value === "priority")) next.delete(key); else next.set(key, value); return next; }, { replace: true });
  }
  const intakeDirty = !trackingUrl && (JSON.stringify(form) !== JSON.stringify(emptyRepair) || JSON.stringify(newCustomer) !== JSON.stringify(emptyNewCustomer) || JSON.stringify(newDevice) !== JSON.stringify(emptyNewDevice));
  const intakeDependenciesError = customers.error ?? devices.error ?? technicians.error;
  async function copyIntakeTracking() {
    try { await navigator.clipboard.writeText(trackingUrl); setCopyFeedback("Private tracking link copied."); }
    catch { setCopyFeedback("The link could not be copied. You can use Send to WhatsApp or select the link below."); }
  }
  if (repairs.isLoading) return <LoadingBlock label="Loading repair jobs" />;
  if (repairs.error)
    return (
      <ErrorBlock
        message={apiMessage(repairs.error)}
        retry={() => void repairs.refetch()}
      />
    );
  return (
    <>
      <PageHeader
        title={user?.role === "TECHNICIAN" ? "My assigned repairs" : user?.role === "CUSTOMER" ? "My repairs" : "Repairs"}
        description={user?.role === "CUSTOMER" ? "Your devices, workshop updates and collection progress." : "Your workshop ledger, from first diagnosis to final handover."}
        actions={
          user?.role === "BUSINESS_ADMIN" ? (
            <CreateButton
              label="New repair intake"
              onClick={() => {
                setTrackingUrl("");
                setIntakeCustomer(null);
                setCopyFeedback("");
                create.reset();
                setOpen(true);
              }}
            />
          ) : undefined
        }
      />
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          fullWidth
          size="small"
          label="Search loaded jobs"
          placeholder="Reference, device, customer or reported issue"
          value={search}
          onChange={(event) => updateContext("q", event.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(event) => updateContext("status", event.target.value)}
          sx={{ minWidth: { md: 240 } }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {repairStages.map((value) => (
            <MenuItem key={value} value={value}>
              {sentenceCase(value)}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Order loaded jobs" value={sort} onChange={(event) => updateContext("sort", event.target.value)} sx={{ minWidth: { md: 190 } }}><MenuItem value="priority">Priority first</MenuItem><MenuItem value="newest">Newest received</MenuItem><MenuItem value="oldest">Oldest received</MenuItem></TextField>
      </Stack>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} mt={2}><Typography variant="caption" color="text.secondary" role="status">{repairs.isPlaceholderData ? "Updating stage results. Previous loaded jobs remain visible." : <>{visible.length} {visible.length === 1 ? "job" : "jobs"} match this view · {repairs.data?.length ?? 0} loaded{status ? ` in ${sentenceCase(status).toLowerCase()}` : ""}. Up to 100 jobs are loaded per status.</>}</Typography>{(search || status) && <Button size="small" onClick={() => setParams(sort === "priority" ? {} : { sort }, { replace: true })}>Clear filters</Button>}</Stack>
      {repairs.isFetching && <LinearProgress aria-label="Refreshing repair jobs" sx={{ mt: 2 }} />}
      </Paper>
      {visible.length ? <RepairLedger repairs={visible} returnSearch={params.toString()} /> : <Paper variant="outlined"><EmptyState title={search || status ? "No jobs match this view" : "Your workshop ledger is ready"} description={search || status ? "Try a different search or stage. Filters apply to the current loaded jobs." : user?.role === "BUSINESS_ADMIN" ? "Create a repair intake to register a customer, device and reported issue in one place." : "Repair jobs will appear here when they are linked to you."} action={search || status ? <Button onClick={() => setParams({})}>Clear filters</Button> : undefined} /></Paper>}
      <FormDialog
        open={open}
        title={trackingUrl ? "Repair intake complete" : "New repair intake"}
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => (trackingUrl ? setOpen(false) : create.mutate())}
        submitLabel={trackingUrl ? "Done" : "Create repair"}
        maxWidth="md"
        dirty={intakeDirty}
        description={trackingUrl ? "The job is recorded. Share its private tracking link with the customer." : "Customer, device and reported issue first. Add workshop planning details when you have them."}
        submitDisabled={!trackingUrl && ((customerMode === "existing" && (customers.isLoading || Boolean(customers.error))) || (deviceMode === "existing" && (devices.isLoading || Boolean(devices.error))))}
      >
        {trackingUrl ? (
          <>
          <Alert
            severity="success"
            action={
              <Button
                size="small"
                startIcon={<ContentCopy />}
                onClick={() => void copyIntakeTracking()}
              >
                Copy
              </Button>
            }
          >
            Give this private tracking link to the customer:
            <br />
            <Typography
              component="span"
              variant="caption"
              sx={{ wordBreak: "break-all" }}
            >
              {trackingUrl}
            </Typography>
          </Alert>
          {intakeCustomer && <WhatsAppShareButton customerName={intakeCustomer.fullName} phone={intakeCustomer.phone} whatsappPhone={intakeCustomer.whatsappPhone} reference={intakeCustomer.reference} trackingUrl={trackingUrl} serviceLabel="Repair" />}
          {copyFeedback && <Typography role="status" variant="body2">{copyFeedback}</Typography>}
          </>
        ) : (
          <>
            {intakeDependenciesError && <Alert severity="error" action={<Button color="inherit" onClick={() => { void customers.refetch(); void devices.refetch(); void technicians.refetch(); }}>Retry</Button>}>The customer, device or technician directory could not be loaded. Your entered details are preserved.</Alert>}
            <Box><Typography variant="overline" color="text.secondary">01 · CUSTOMER</Typography><Typography variant="h6" component="h2">Who are we helping?</Typography><Typography variant="body2" color="text.secondary">Choose an existing customer or register their contact details.</Typography></Box>
            <Stack direction="row" gap={1}><Button variant={customerMode === "existing" ? "contained" : "outlined"} onClick={() => setCustomerMode("existing")}>Select existing</Button><Button variant={customerMode === "new" ? "contained" : "outlined"} onClick={() => { setCustomerMode("new"); setDeviceMode("new"); }}>Register new</Button></Stack>
            {customerMode === "existing" ? (
            <TextField
              select
              required
              label="Customer"
              value={form.customerId}
              onChange={(event) =>
                setForm({
                  ...form,
                  customerId: event.target.value,
                  deviceId: "",
                })
              }
            >
              {(customers.data ?? []).map((customer) => (
                <MenuItem key={customer.id} value={customer.id}>
                  {customer.fullName} · {customer.phone}
                </MenuItem>
              ))}
            </TextField>
            ) : (
              <Stack spacing={2}><TextField required label="Customer or business name" inputProps={{ minLength: 2, maxLength: 120 }} value={newCustomer.fullName} onChange={(event) => setNewCustomer({ ...newCustomer, fullName: event.target.value })} /><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField required fullWidth type="tel" label="Phone" inputProps={{ minLength: 7, maxLength: 30 }} value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value, whatsappOptIn: false })} /><TextField fullWidth type="email" label="Email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} /></Stack><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField select fullWidth label="Customer type" value={newCustomer.customerType} onChange={(event) => setNewCustomer({ ...newCustomer, customerType: event.target.value })}><MenuItem value="INDIVIDUAL">Individual</MenuItem><MenuItem value="BUSINESS">Business</MenuItem></TextField><TextField fullWidth label="KRA PIN" value={newCustomer.kraPin} onChange={(event) => setNewCustomer({ ...newCustomer, kraPin: event.target.value.toUpperCase() })} /></Stack><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField fullWidth type="tel" label="WhatsApp phone" inputProps={{ minLength: 7, maxLength: 30 }} value={newCustomer.whatsappPhone} onChange={(event) => setNewCustomer({ ...newCustomer, whatsappPhone: event.target.value, whatsappOptIn: false })} /><TextField select fullWidth label="Preferred communication" value={newCustomer.preferredCommunication} onChange={(event) => setNewCustomer({ ...newCustomer, preferredCommunication: event.target.value })}><MenuItem value="EMAIL">Email</MenuItem><MenuItem value="WHATSAPP">WhatsApp</MenuItem></TextField></Stack><TextField label="Address" value={newCustomer.address} onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })} /></Stack>
            )}
            {customerMode === "new" && <FormControlLabel control={<Checkbox checked={newCustomer.whatsappOptIn} onChange={(event) => setNewCustomer({ ...newCustomer, whatsappOptIn: event.target.checked })} />} label="The customer has agreed to receive WhatsApp ticket and service updates at this number." />}
            {customerMode === "existing" && form.customerId && <Alert severity="info">WhatsApp ticket messages require recorded customer consent. Manage it in the customer profile.</Alert>}
            <Divider sx={{ my: 1 }} />
            <Box><Typography variant="overline" color="text.secondary">02 · DEVICE</Typography><Typography variant="h6" component="h2">What has arrived?</Typography><Typography variant="body2" color="text.secondary">Link a device to this customer, with its identifying details.</Typography></Box>
            {customerMode === "existing" && <Stack direction="row" gap={1}><Button variant={deviceMode === "existing" ? "contained" : "outlined"} onClick={() => setDeviceMode("existing")}>Select registered</Button><Button variant={deviceMode === "new" ? "contained" : "outlined"} onClick={() => setDeviceMode("new")}>Register device</Button></Stack>}
            {deviceMode === "existing" ? (
            <TextField
              select
              required
              label="Device"
              value={form.deviceId}
              onChange={(event) =>
                setForm({ ...form, deviceId: event.target.value })
              }
            >
              {customerDevices.map((device) => (
                <MenuItem key={device.id} value={device.id}>
                  {device.brand} {device.model} ·{" "}
                  {device.serialNumber ?? device.imei ?? device.type}
                </MenuItem>
              ))}
            </TextField>
            ) : (
              <Stack spacing={2}><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField required fullWidth label="Device type" inputProps={{ minLength: 2, maxLength: 80 }} value={newDevice.type} onChange={(event) => setNewDevice({ ...newDevice, type: event.target.value })} /><TextField required fullWidth label="Brand" inputProps={{ minLength: 1, maxLength: 80 }} value={newDevice.brand} onChange={(event) => setNewDevice({ ...newDevice, brand: event.target.value })} /><TextField required fullWidth label="Model" inputProps={{ minLength: 1, maxLength: 120 }} value={newDevice.model} onChange={(event) => setNewDevice({ ...newDevice, model: event.target.value })} /></Stack><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField fullWidth label="Serial number" value={newDevice.serialNumber} onChange={(event) => setNewDevice({ ...newDevice, serialNumber: event.target.value })} /><TextField fullWidth label="IMEI" value={newDevice.imei} onChange={(event) => setNewDevice({ ...newDevice, imei: event.target.value })} /></Stack><TextField label="Colour" value={newDevice.colour} onChange={(event) => setNewDevice({ ...newDevice, colour: event.target.value })} /><TextField label="Accessories received" value={newDevice.accessories} onChange={(event) => setNewDevice({ ...newDevice, accessories: event.target.value })} /><TextField multiline minRows={2} label="Physical condition" value={newDevice.physicalCondition} onChange={(event) => setNewDevice({ ...newDevice, physicalCondition: event.target.value })} /></Stack>
            )}
            <Divider sx={{ my: 1 }} />
            <Box><Typography variant="overline" color="text.secondary">03 · REPAIR</Typography><Typography variant="h6" component="h2">What needs attention?</Typography><Typography variant="body2" color="text.secondary">Describe the reported fault so the technician can start with the right context.</Typography></Box>
            <TextField
              required
              multiline
              minRows={3}
              label="Reported issue"
              inputProps={{ minLength: 3, maxLength: 2000 }}
              value={form.reportedIssue}
              onChange={(event) =>
                setForm({ ...form, reportedIssue: event.target.value })
              }
            />
            <Accordion disableGutters elevation={0} sx={{ "&:before": { display: "none" } }}><AccordionSummary expandIcon={<ExpandMore />}><Box><Typography variant="subtitle2">Workshop planning & additional notes</Typography><Typography variant="caption" color="text.secondary">Optional assignment, estimate, completion date and communication details</Typography></Box></AccordionSummary><AccordionDetails><Stack spacing={2.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                select
                fullWidth
                label="Priority"
                value={form.priority}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value })
                }
              >
                {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="Assign technician"
                value={form.assignedTechnicianId}
                onChange={(event) =>
                  setForm({ ...form, assignedTechnicianId: event.target.value })
                }
              >
                <MenuItem value="">Unassigned</MenuItem>
                {(technicians.data ?? [])
                  .filter((person) => person.status !== "DISABLED")
                  .map((person) => (
                    <MenuItem key={person.id} value={person.id}>
                      {person.fullName}
                    </MenuItem>
                  ))}
              </TextField>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                type="number"
                label="Estimated cost"
                inputProps={{ min: 0 }}
                value={form.estimatedCost}
                onChange={(event) =>
                  setForm({ ...form, estimatedCost: event.target.value })
                }
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">KES</InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                type="datetime-local"
                label="Estimated completion"
                value={form.estimatedCompletionAt}
                onChange={(event) =>
                  setForm({
                    ...form,
                    estimatedCompletionAt: event.target.value,
                  })
                }
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            <TextField
              label="Warranty information"
              inputProps={{ maxLength: 1000 }}
              value={form.warrantyInformation}
              onChange={(event) =>
                setForm({ ...form, warrantyInformation: event.target.value })
              }
            />
            <TextField select label="Notification channel for this repair" value={form.notificationPreferenceOverride} onChange={(event) => setForm({ ...form, notificationPreferenceOverride: event.target.value })}><MenuItem value="">Use customer preference</MenuItem><MenuItem value="EMAIL">Email</MenuItem><MenuItem value="WHATSAPP">WhatsApp</MenuItem></TextField>
            <TextField
              multiline
              minRows={2}
              label="Customer-visible intake note"
              inputProps={{ maxLength: 2000 }}
              value={form.customerVisibleNotes}
              onChange={(event) =>
                setForm({ ...form, customerVisibleNotes: event.target.value })
              }
            />
            <TextField
              multiline
              minRows={2}
              label="Internal workshop note"
              inputProps={{ maxLength: 3000 }}
              value={form.internalNotes}
              onChange={(event) =>
                setForm({ ...form, internalNotes: event.target.value })
              }
            />
            </Stack></AccordionDetails></Accordion>
          </>
        )}
      </FormDialog>
    </>
  );
}

export function RepairDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { repairListSearch?: unknown } | null;
  const backPath = repairListPath(routeState?.repairListSearch);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState("INTERNAL");
  const [partOpen, setPartOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["repair", id],
    queryFn: async () => (await api.get<ApiEnvelope<RepairDetail>>(`/repairs/${id}`)).data.data,
  });
  const tracking = useQuery({
    queryKey: ["repair-tracking", id],
    queryFn: async () => (await api.get<ApiEnvelope<{ trackingUrl: string; reviewUrl?: string | null }>>(`/repairs/${encodeURIComponent(id)}/tracking`)).data.data,
    enabled: Boolean(query.data && (user?.role === "BUSINESS_ADMIN" || (user?.role === "TECHNICIAN" && query.data.assignedTechnician?.id === user.id))),
    retry: false,
  });
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => (await api.get<ApiEnvelope<InventoryItem[]>>("/inventory")).data.data,
    enabled: partOpen && (user?.role === "BUSINESS_ADMIN" || user?.role === "TECHNICIAN"),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["repair", id] });
  const statusMutation = useMutation({
    mutationFn: () => api.post(`/repairs/${id}/status`, { status: nextStatus, customerMessage: customerMessage || undefined }),
    onSuccess: async () => {
      setStatusOpen(false);
      setCustomerMessage("");
      setNextStatus("");
      setNotice("Repair stage updated. The customer notification has been requested.");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["repair-tracking", id] });
      await queryClient.invalidateQueries({ queryKey: ["repairs"] });
    },
  });
  const noteMutation = useMutation({
    mutationFn: () => api.post(`/repairs/${id}/notes`, { body: note, visibility, imageUrls: [] }),
    onSuccess: async () => {
      setNoteOpen(false);
      setNote("");
      setNotice("Repair note saved with the selected visibility.");
      await refresh();
    },
  });
  const partMutation = useMutation({
    mutationFn: () => api.post(`/inventory/repairs/${id}/parts`, { inventoryItemId: itemId, quantity: Number(quantity), allowNegative: false }),
    onSuccess: async () => {
      setPartOpen(false);
      setItemId("");
      setQuantity("1");
      setNotice("Part recorded. Stock and the repair draft invoice have been updated.");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
  const acceptMutation = useMutation({
    mutationFn: () => api.post(`/repairs/${id}/accept`),
    onSuccess: async () => { setNotice("Job accepted. It remains assigned to you."); await refresh(); },
  });
  const deletion = useMutation({
    mutationFn: () => api.delete(`/repairs/${id}`, { data: { reason: deleteReason } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["repairs"] }); void navigate(backPath); },
  });
  if (query.isLoading) return <LoadingBlock label="Opening repair workspace" />;
  if (query.error || !query.data) return <ErrorBlock message={apiMessage(query.error)} retry={() => void query.refetch()} />;
  const repair = query.data;
  const canEdit = user?.role === "BUSINESS_ADMIN" || (user?.role === "TECHNICIAN" && repair.assignedTechnician?.id === user.id);
  const nextOptions = stageTransitions[repair.status] ?? [];
  const acceptingNeeded = user?.role === "TECHNICIAN" && canEdit && !repair.acceptedAt;
  const busy = statusMutation.isPending || noteMutation.isPending || partMutation.isPending || acceptMutation.isPending || deletion.isPending;
  return <>
    <Button component={Link} to={backPath} startIcon={<ArrowBack />} sx={{ mb: 1 }}>Back to repairs</Button>
    <PageHeader title={repair.reference} description={`${repair.device.brand} ${repair.device.model} · ${repair.customer.fullName}`} actions={
      <Stack direction="row" flexWrap="wrap" gap={1}>
        {acceptingNeeded && <Button variant="contained" startIcon={<AssignmentInd />} disabled={busy} onClick={() => acceptMutation.mutate()}>{acceptMutation.isPending ? "Accepting…" : "Accept job"}</Button>}
        {canEdit && nextOptions.length > 0 && <Button variant={acceptingNeeded ? "outlined" : "contained"} startIcon={<Build />} disabled={busy} onClick={() => { statusMutation.reset(); setNextStatus(nextOptions[0] ?? ""); setStatusOpen(true); }}>{nextActionLabel[repair.status] ?? "Update status"}</Button>}
        {user?.role === "BUSINESS_ADMIN" && <Button color="error" startIcon={<DeleteOutline />} disabled={busy} onClick={() => { deletion.reset(); setDeleteOpen(true); }}>Archive</Button>}
      </Stack>
    } />
    {notice && <Alert severity="success" role="status" onClose={() => setNotice("")} sx={{ mb: 2 }}>{notice}</Alert>}
    {acceptMutation.error && <Alert severity="error" sx={{ mb: 2 }}>{apiMessage(acceptMutation.error)}</Alert>}
    {query.isFetching && <LinearProgress aria-label="Refreshing repair workspace" sx={{ mb: 2 }} />}
    <RepairWorkspace repair={repair} role={user?.role} canEdit={canEdit} trackingUrl={tracking.data?.trackingUrl} reviewUrl={tracking.data?.reviewUrl} trackingBusy={tracking.isPending} trackingError={tracking.error ? `The private tracking link could not be loaded. ${apiMessage(tracking.error)}` : undefined} onRetryTracking={() => void tracking.refetch()} onAddNote={() => { if (!busy) { noteMutation.reset(); setNoteOpen(true); } }} onAddPart={() => { if (!busy) { partMutation.reset(); setPartOpen(true); } }} />
    <FormDialog open={statusOpen} title="Move repair to next stage" busy={statusMutation.isPending} error={statusMutation.error ? apiMessage(statusMutation.error) : undefined} onClose={() => setStatusOpen(false)} onSubmit={() => statusMutation.mutate()} submitLabel="Update and notify" dirty={Boolean(customerMessage)} description="Choose a supported next stage. A customer message is visible in the public timeline and included in the notification request.">
      <TextField select required label="New status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>{nextOptions.map((value) => <MenuItem key={value} value={value}>{sentenceCase(value)}</MenuItem>)}</TextField>
      <TextField multiline minRows={3} label="Customer message (optional)" inputProps={{ maxLength: 1000 }} value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} helperText="Visible to the customer. Do not include workshop-only information." />
    </FormDialog>
    <FormDialog open={noteOpen} title="Add repair note" busy={noteMutation.isPending} error={noteMutation.error ? apiMessage(noteMutation.error) : undefined} onClose={() => setNoteOpen(false)} onSubmit={() => noteMutation.mutate()} dirty={Boolean(note)} submitLabel="Save note" description="Choose who can see this note. Internal workshop notes are never shown to the customer.">
      <TextField select label="Visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}><MenuItem value="INTERNAL">Internal workshop note</MenuItem><MenuItem value="CUSTOMER">Visible to customer</MenuItem></TextField>
      <TextField required multiline minRows={4} label="Note" inputProps={{ maxLength: 5000 }} value={note} onChange={(event) => setNote(event.target.value)} />
    </FormDialog>
    <FormDialog open={partOpen} title="Use inventory part" busy={partMutation.isPending} error={partMutation.error ? apiMessage(partMutation.error) : undefined} onClose={() => setPartOpen(false)} onSubmit={() => partMutation.mutate()} submitLabel="Consume stock" dirty={Boolean(itemId) || quantity !== "1"} description="This records a used part, deducts stock and adds its charge to the repair draft invoice." submitDisabled={inventory.isLoading || Boolean(inventory.error) || !itemId || !Number.isInteger(Number(quantity)) || Number(quantity) < 1}>
      {inventory.isLoading && <Typography role="status" variant="body2">Loading available inventory…</Typography>}
      {inventory.error && <ErrorBlock message={apiMessage(inventory.error)} retry={() => void inventory.refetch()} />}
      {inventory.isSuccess && inventory.data.length === 0 && <Alert severity="info">No inventory items are available. Ask an administrator to add stock first.</Alert>}
      <TextField select required label="Inventory item" value={itemId} onChange={(event) => setItemId(event.target.value)}>{(inventory.data ?? []).map((item) => <MenuItem key={item.id} value={item.id}>{item.name} · {item.quantity} available</MenuItem>)}</TextField>
      <TextField required type="number" label="Quantity" inputProps={{ min: 1, step: 1 }} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
    </FormDialog>
    <FormDialog open={deleteOpen} title="Archive repair" busy={deletion.isPending} error={deletion.error ? apiMessage(deletion.error) : undefined} onClose={() => setDeleteOpen(false)} onSubmit={() => deletion.mutate()} submitLabel="Archive with audit record" submitDisabled={deleteReason.trim().length < 3} dirty={Boolean(deleteReason)}>
      <Alert severity="warning">This removes the job from active lists. Linked financial and stock history is preserved. Unprotected jobs are cancelled; protected jobs are archived without changing their stage.</Alert>
      <TextField required multiline minRows={2} label="Reason" inputProps={{ minLength: 3, maxLength: 500 }} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} />
    </FormDialog>
  </>;
}
