import ArrowBack from "@mui/icons-material/ArrowBack";
import AssignmentInd from "@mui/icons-material/AssignmentInd";
import Build from "@mui/icons-material/Build";
import ContentCopy from "@mui/icons-material/ContentCopy";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import NoteAdd from "@mui/icons-material/NoteAdd";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import {
  CreateButton,
  DataTable,
  FormDialog,
  KeyValue,
} from "../components/DataViews";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import type {
  ApiEnvelope,
  Customer,
  Device,
  InventoryItem,
  Repair,
  RepairDetail,
  Technician,
} from "../types";

const repairStatuses = [
  "RECEIVED",
  "DIAGNOSING",
  "AWAITING_CUSTOMER_APPROVAL",
  "WAITING_FOR_PARTS",
  "IN_PROGRESS",
  "TESTING",
  "COMPLETED",
  "READY_FOR_COLLECTION",
  "COLLECTED",
  "CANCELLED",
];
const transitions: Record<string, string[]> = {
  RECEIVED: ["DIAGNOSING", "CANCELLED"],
  DIAGNOSING: [
    "AWAITING_CUSTOMER_APPROVAL",
    "WAITING_FOR_PARTS",
    "IN_PROGRESS",
    "CANCELLED",
  ],
  AWAITING_CUSTOMER_APPROVAL: ["WAITING_FOR_PARTS", "IN_PROGRESS", "CANCELLED"],
  WAITING_FOR_PARTS: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["TESTING", "WAITING_FOR_PARTS", "CANCELLED"],
  TESTING: ["IN_PROGRESS", "COMPLETED"],
  COMPLETED: ["READY_FOR_COLLECTION"],
  READY_FOR_COLLECTION: ["COLLECTED"],
  COLLECTED: [],
  CANCELLED: [],
};
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
const emptyNewCustomer = { fullName: "", email: "", phone: "", whatsappPhone: "", kraPin: "", address: "", customerType: "INDIVIDUAL", preferredCommunication: "EMAIL" };
const emptyNewDevice = { type: "Laptop", brand: "", model: "", serialNumber: "", imei: "", colour: "", accessories: "", physicalCondition: "" };

export function RepairsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(emptyRepair);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [deviceMode, setDeviceMode] = useState<"existing" | "new">("existing");
  const [newCustomer, setNewCustomer] = useState(emptyNewCustomer);
  const [newDevice, setNewDevice] = useState(emptyNewDevice);
  const [trackingUrl, setTrackingUrl] = useState("");
  const repairs = useQuery({
    queryKey: ["repairs", status],
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
    mutationFn: async () =>
      (
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
      ).data.data,
    onSuccess: async (data) => {
      setTrackingUrl(data.trackingUrl);
      setForm(emptyRepair);
      setNewCustomer(emptyNewCustomer);
      setNewDevice(emptyNewDevice);
      await queryClient.invalidateQueries({ queryKey: ["repairs"] });
    },
  });
  const visible = useMemo(
    () =>
      (repairs.data ?? []).filter(
        (repair) =>
          !search ||
          `${repair.reference} ${repair.customer.fullName} ${repair.device.brand} ${repair.device.model}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [repairs.data, search],
  );
  const customerDevices = (devices.data ?? []).filter(
    (device) => !form.customerId || device.customerId === form.customerId,
  );
  if (repairs.isLoading) return <LoadingBlock />;
  if (repairs.error)
    return (
      <ErrorBlock
        message={apiMessage(repairs.error)}
        retry={() => void repairs.refetch()}
      />
    );
  const rows = visible.map((repair) => [
    <Button
      component={Link}
      to={`/repairs/${repair.id}`}
      sx={{ p: 0, justifyContent: "flex-start", fontWeight: 800 }}
    >
      {repair.reference}
    </Button>,
    <Stack>
      <Typography fontWeight={700}>
        {repair.device.brand} {repair.device.model}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {repair.device.type}
      </Typography>
    </Stack>,
    repair.customer.fullName,
    <StatusChip status={repair.status} />,
    <Chip
      size="small"
      variant="outlined"
      color={
        repair.priority === "URGENT"
          ? "error"
          : repair.priority === "HIGH"
            ? "warning"
            : "default"
      }
      label={repair.priority}
    />,
    repair.assignedTechnician?.fullName ?? "Unassigned",
    new Date(repair.createdAt).toLocaleDateString(),
  ]);
  return (
    <>
      <PageHeader
        title={user?.role === "TECHNICIAN" ? "My assigned repairs" : "Repairs"}
        description="A traceable record from intake through collection."
        actions={
          user?.role === "BUSINESS_ADMIN" ? (
            <CreateButton
              label="New repair intake"
              onClick={() => {
                setTrackingUrl("");
                setOpen(true);
              }}
            />
          ) : undefined
        }
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={3}>
        <TextField
          fullWidth
          size="small"
          label="Search this view"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          sx={{ minWidth: 230 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {repairStatuses.map((value) => (
            <MenuItem key={value} value={value}>
              {value.replaceAll("_", " ")}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <DataTable
        columns={[
          "Reference",
          "Device",
          "Customer",
          "Status",
          "Priority",
          "Technician",
          "Received",
        ]}
        rows={rows}
        empty="No repairs match this view."
      />
      <FormDialog
        open={open}
        title={trackingUrl ? "Repair intake complete" : "New repair intake"}
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => (trackingUrl ? setOpen(false) : create.mutate())}
        submitLabel={trackingUrl ? "Done" : "Create repair"}
      >
        {trackingUrl ? (
          <Alert
            severity="success"
            action={
              <Button
                size="small"
                startIcon={<ContentCopy />}
                onClick={() => void navigator.clipboard.writeText(trackingUrl)}
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
        ) : (
          <>
            <Divider>Customer</Divider>
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
              <Stack spacing={2}><TextField required label="Customer or business name" value={newCustomer.fullName} onChange={(event) => setNewCustomer({ ...newCustomer, fullName: event.target.value })} /><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField required fullWidth label="Phone" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} /><TextField fullWidth type="email" label="Email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} /></Stack><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField select fullWidth label="Customer type" value={newCustomer.customerType} onChange={(event) => setNewCustomer({ ...newCustomer, customerType: event.target.value })}><MenuItem value="INDIVIDUAL">Individual</MenuItem><MenuItem value="BUSINESS">Business</MenuItem></TextField><TextField fullWidth label="KRA PIN" value={newCustomer.kraPin} onChange={(event) => setNewCustomer({ ...newCustomer, kraPin: event.target.value.toUpperCase() })} /></Stack><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField fullWidth label="WhatsApp phone" value={newCustomer.whatsappPhone} onChange={(event) => setNewCustomer({ ...newCustomer, whatsappPhone: event.target.value })} /><TextField select fullWidth label="Preferred communication" value={newCustomer.preferredCommunication} onChange={(event) => setNewCustomer({ ...newCustomer, preferredCommunication: event.target.value })}><MenuItem value="EMAIL">Email</MenuItem><MenuItem value="WHATSAPP">WhatsApp</MenuItem></TextField></Stack><TextField label="Address" value={newCustomer.address} onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })} /></Stack>
            )}
            <Divider>Device</Divider>
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
              <Stack spacing={2}><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField required fullWidth label="Device type" value={newDevice.type} onChange={(event) => setNewDevice({ ...newDevice, type: event.target.value })} /><TextField required fullWidth label="Brand" value={newDevice.brand} onChange={(event) => setNewDevice({ ...newDevice, brand: event.target.value })} /><TextField required fullWidth label="Model" value={newDevice.model} onChange={(event) => setNewDevice({ ...newDevice, model: event.target.value })} /></Stack><Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField fullWidth label="Serial number" value={newDevice.serialNumber} onChange={(event) => setNewDevice({ ...newDevice, serialNumber: event.target.value })} /><TextField fullWidth label="IMEI" value={newDevice.imei} onChange={(event) => setNewDevice({ ...newDevice, imei: event.target.value })} /></Stack><TextField label="Colour" value={newDevice.colour} onChange={(event) => setNewDevice({ ...newDevice, colour: event.target.value })} /><TextField label="Accessories received" value={newDevice.accessories} onChange={(event) => setNewDevice({ ...newDevice, accessories: event.target.value })} /><TextField multiline minRows={2} label="Physical condition" value={newDevice.physicalCondition} onChange={(event) => setNewDevice({ ...newDevice, physicalCondition: event.target.value })} /></Stack>
            )}
            <TextField
              required
              multiline
              minRows={3}
              label="Reported issue"
              value={form.reportedIssue}
              onChange={(event) =>
                setForm({ ...form, reportedIssue: event.target.value })
              }
            />
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
              value={form.customerVisibleNotes}
              onChange={(event) =>
                setForm({ ...form, customerVisibleNotes: event.target.value })
              }
            />
            <TextField
              multiline
              minRows={2}
              label="Internal workshop note"
              value={form.internalNotes}
              onChange={(event) =>
                setForm({ ...form, internalNotes: event.target.value })
              }
            />
          </>
        )}
      </FormDialog>
    </>
  );
}

export function RepairDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
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
  const query = useQuery({
    queryKey: ["repair", id],
    queryFn: async () =>
      (await api.get<ApiEnvelope<RepairDetail>>(`/repairs/${id}`)).data.data,
  });
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<InventoryItem[]>>("/inventory")).data.data,
    enabled: user?.role !== "CUSTOMER",
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["repair", id] });
  const statusMutation = useMutation({
    mutationFn: () =>
      api.post(`/repairs/${id}/status`, {
        status: nextStatus,
        customerMessage: customerMessage || undefined,
      }),
    onSuccess: async () => {
      setStatusOpen(false);
      setCustomerMessage("");
      setNextStatus("");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["repairs"] });
    },
  });
  const noteMutation = useMutation({
    mutationFn: () =>
      api.post(`/repairs/${id}/notes`, {
        body: note,
        visibility,
        imageUrls: [],
      }),
    onSuccess: async () => {
      setNoteOpen(false);
      setNote("");
      await refresh();
    },
  });
  const partMutation = useMutation({
    mutationFn: () =>
      api.post(`/inventory/repairs/${id}/parts`, {
        inventoryItemId: itemId,
        quantity: Number(quantity),
        allowNegative: false,
      }),
    onSuccess: async () => {
      setPartOpen(false);
      setItemId("");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
  const acceptMutation = useMutation({
    mutationFn: () => api.post(`/repairs/${id}/accept`),
    onSuccess: refresh,
  });
  const deletion = useMutation({ mutationFn: () => api.delete(`/repairs/${id}`, { data: { reason: deleteReason } }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["repairs"] }); void navigate("/repairs"); } });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error || !query.data)
    return <ErrorBlock message={apiMessage(query.error)} />;
  const repair = query.data;
  const canEdit =
    user?.role === "BUSINESS_ADMIN" || user?.role === "TECHNICIAN";
  const nextOptions = transitions[repair.status] ?? [];
  return (
    <>
      <Button
        component={Link}
        to="/repairs"
        startIcon={<ArrowBack />}
        sx={{ mb: 2 }}
      >
        Back to repairs
      </Button>
      <PageHeader
        title={repair.reference}
        description={`${repair.device.brand} ${repair.device.model} · ${repair.customer.fullName}`}
        actions={
          <Stack direction="row" spacing={1}>
            {user?.role === "TECHNICIAN" && !repair.acceptedAt && (
              <Button
                variant="outlined"
                startIcon={<AssignmentInd />}
                onClick={() => acceptMutation.mutate()}
              >
                Accept job
              </Button>
            )}
            {canEdit && nextOptions.length > 0 && (
              <Button
                variant="contained"
                startIcon={<Build />}
                onClick={() => {
                  setNextStatus(nextOptions[0] ?? "");
                  setStatusOpen(true);
                }}
              >
                Update status
              </Button>
            )}
            {user?.role === "BUSINESS_ADMIN" && <Button color="error" startIcon={<DeleteOutline />} onClick={() => setDeleteOpen(true)}>Archive</Button>}
          </Stack>
        }
      />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                gap={2}
              >
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Current state
                  </Typography>
                  <Box mt={0.5}>
                    <StatusChip status={repair.status} />
                  </Box>
                </Box>
                <KeyValue label="Priority" value={repair.priority} />
                <KeyValue
                  label="Assigned technician"
                  value={repair.assignedTechnician?.fullName ?? "Unassigned"}
                />
                <KeyValue
                  label="Estimate"
                  value={
                    repair.estimatedCost
                      ? `KES ${Number(repair.estimatedCost).toLocaleString()}`
                      : "Not set"
                  }
                />
              </Stack>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6">Issue and diagnosis</Typography>
              <Typography mt={1}>{repair.reportedIssue}</Typography>
              {repair.diagnosis && (
                <>
                  <Typography variant="subtitle2" mt={2}>
                    Diagnosis
                  </Typography>
                  <Typography color="text.secondary">
                    {repair.diagnosis}
                  </Typography>
                </>
              )}
              <Grid container spacing={2} mt={1}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <KeyValue label="Device type" value={repair.device.type} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <KeyValue label="Serial" value={repair.device.serialNumber} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <KeyValue
                    label="Customer phone"
                    value={repair.customer.phone}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box>
                  <Typography variant="h6">Repair notes</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Customer-visible notes are deliberately marked.
                  </Typography>
                </Box>
                {canEdit && (
                  <Button
                    startIcon={<NoteAdd />}
                    onClick={() => setNoteOpen(true)}
                  >
                    Add note
                  </Button>
                )}
              </Stack>
              <Stack spacing={2} mt={2}>
                {repair.notes.length ? (
                  repair.notes.map((entry) => (
                    <Paper variant="outlined" key={entry.id} sx={{ p: 2 }}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        mb={1}
                      >
                        <Typography fontWeight={700}>
                          {entry.author.fullName}
                        </Typography>
                        <Chip
                          size="small"
                          label={
                            entry.visibility === "CUSTOMER"
                              ? "Visible to customer"
                              : "Internal"
                          }
                          color={
                            entry.visibility === "CUSTOMER"
                              ? "primary"
                              : "default"
                          }
                        />
                      </Stack>
                      <Typography>{entry.body}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(entry.createdAt).toLocaleString()}
                      </Typography>
                    </Paper>
                  ))
                ) : (
                  <EmptyState
                    title="No repair notes"
                    description="Workshop observations will appear here."
                  />
                )}
              </Stack>
            </CardContent>
          </Card>
          {repair.customerResponses && repair.customerResponses.length > 0 && <Card sx={{ mt: 3 }}><CardContent><Typography variant="h6">Customer approval response</Typography>{repair.customerResponses.map((response) => <Alert key={response.id} severity={response.decision === "ACCEPTED" ? "success" : "warning"} sx={{ mt: 2 }}>Estimate version {response.approvalVersion}: {response.decision.replaceAll("_", " ")}{response.declineReason ? ` — ${response.declineReason}` : ""}<Typography variant="caption" display="block">Recorded {new Date(response.createdAt).toLocaleString()}</Typography></Alert>)}</CardContent></Card>}
          {user?.role !== "CUSTOMER" && (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="h6">Parts used</Typography>
                  <Button onClick={() => setPartOpen(true)}>Add part</Button>
                </Stack>
                {repair.parts.length ? (
                  repair.parts.map((part) => (
                    <Stack
                      key={part.id}
                      direction="row"
                      justifyContent="space-between"
                      py={1.5}
                      borderBottom={1}
                      borderColor="divider"
                    >
                      <span>
                        {part.inventoryItem.name} · {part.inventoryItem.sku}
                      </span>
                      <strong>
                        {part.quantity} × KES{" "}
                        {Number(part.unitPrice).toLocaleString()}
                      </strong>
                    </Stack>
                  ))
                ) : (
                  <Typography mt={2} color="text.secondary">
                    No parts have been consumed.
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6">Status timeline</Typography>
              <Stack mt={2} spacing={0}>
                {repair.statusHistory.map((entry, index) => (
                  <Box
                    key={entry.id}
                    pl={3}
                    pb={3}
                    position="relative"
                    sx={{
                      borderLeft:
                        index < repair.statusHistory.length - 1
                          ? "2px solid"
                          : 0,
                      borderColor: "divider",
                    }}
                  >
                    <Box
                      position="absolute"
                      left={-7}
                      top={2}
                      width={12}
                      height={12}
                      borderRadius="50%"
                      bgcolor="primary.main"
                    />
                    <Typography fontWeight={750}>
                      {entry.toStatus.replaceAll("_", " ")}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(entry.createdAt).toLocaleString()}
                    </Typography>
                    {entry.customerMessage && (
                      <Typography variant="body2" mt={0.5}>
                        {entry.customerMessage}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6">Billing</Typography>
              {repair.invoices.length ? (
                repair.invoices.map((invoice) => (
                  <Button
                    key={invoice.id}
                    component={Link}
                    to={`/invoices/${invoice.id}`}
                    fullWidth
                    sx={{ justifyContent: "space-between", mt: 1 }}
                  >
                    {invoice.number}
                    <StatusChip status={invoice.paymentStatus} />
                  </Button>
                ))
              ) : (
                <Typography color="text.secondary" mt={2}>
                  No invoice has been created.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <FormDialog
        open={statusOpen}
        title="Move repair to next stage"
        busy={statusMutation.isPending}
        error={
          statusMutation.error ? apiMessage(statusMutation.error) : undefined
        }
        onClose={() => setStatusOpen(false)}
        onSubmit={() => statusMutation.mutate()}
        submitLabel="Update and notify"
      >
        <TextField
          select
          label="New status"
          value={nextStatus}
          onChange={(event) => setNextStatus(event.target.value)}
        >
          {nextOptions.map((value) => (
            <MenuItem key={value} value={value}>
              {value.replaceAll("_", " ")}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          multiline
          minRows={3}
          label="Customer message (optional)"
          value={customerMessage}
          onChange={(event) => setCustomerMessage(event.target.value)}
          helperText="This message is included in the public repair timeline and notification."
        />
      </FormDialog>
      <FormDialog
        open={noteOpen}
        title="Add repair note"
        busy={noteMutation.isPending}
        error={noteMutation.error ? apiMessage(noteMutation.error) : undefined}
        onClose={() => setNoteOpen(false)}
        onSubmit={() => noteMutation.mutate()}
      >
        <TextField
          select
          label="Visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value)}
        >
          <MenuItem value="INTERNAL">Internal workshop note</MenuItem>
          <MenuItem value="CUSTOMER">Visible to customer</MenuItem>
        </TextField>
        <TextField
          required
          multiline
          minRows={4}
          label="Note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </FormDialog>
      <FormDialog
        open={partOpen}
        title="Use inventory part"
        busy={partMutation.isPending}
        error={partMutation.error ? apiMessage(partMutation.error) : undefined}
        onClose={() => setPartOpen(false)}
        onSubmit={() => partMutation.mutate()}
        submitLabel="Consume stock"
      >
        <TextField
          select
          required
          label="Inventory item"
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
        >
          {(inventory.data ?? []).map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name} · {item.quantity} available
            </MenuItem>
          ))}
        </TextField>
        <TextField
          required
          type="number"
          label="Quantity"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </FormDialog>
      <FormDialog open={deleteOpen} title="Archive repair" busy={deletion.isPending} error={deletion.error ? apiMessage(deletion.error) : undefined} onClose={() => setDeleteOpen(false)} onSubmit={() => deletion.mutate()} submitLabel="Archive with audit record" submitDisabled={deleteReason.trim().length < 3}><Alert severity="warning">Completed, paid, or legally linked records may be protected. RepairTrack will reject unsafe deletion and explain why.</Alert><TextField required multiline minRows={2} label="Reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></FormDialog>
    </>
  );
}
