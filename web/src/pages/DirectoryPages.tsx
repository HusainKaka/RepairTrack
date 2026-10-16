import Block from "@mui/icons-material/Block";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Key from "@mui/icons-material/Key";
import Remove from "@mui/icons-material/Remove";
import Add from "@mui/icons-material/Add";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Paper,
  TablePagination,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { CreateButton, DataTable, FormDialog } from "../components/DataViews";
import { ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { RecordName } from "../components/product/RecordName";
import type {
  ApiEnvelope,
  Business,
  Customer,
  Device,
  InventoryItem,
  Technician,
} from "../types";

function readableDate(value?: string) {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

function DirectorySearch({ value, label, placeholder, onSearch, children }: { value: string; label: string; placeholder: string; onSearch(value: string): void; children?: React.ReactNode }) {
  const [draft, setDraft] = useState(value);
  return <Paper sx={{ p: 2.5, mb: 3 }}><Stack component="form" role="search" onSubmit={(event) => { event.preventDefault(); onSearch(draft.trim()); }} direction={{ xs: "column", md: "row" }} gap={2} alignItems={{ md: "center" }}>
    <TextField fullWidth size="small" label={label} placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} />
    {children}<Stack direction="row" gap={1}><Button variant="outlined" type="submit">Search</Button>{value && <Button type="button" onClick={() => { setDraft(""); onSearch(""); }}>Clear</Button>}</Stack>
  </Stack></Paper>;
}

function ResultStatus({ count, busy, limit }: { count: number; busy: boolean; limit?: number }) {
  return <Typography variant="caption" color="text.secondary" role="status" aria-live="polite" sx={{ display: "block", minHeight: 24, mb: 1 }}>{busy ? "Updating results…" : `${count} record(s) loaded${limit ? ` · Up to ${limit} matching records are returned` : ""}.`}</Typography>;
}

const emptyCustomer = {
  fullName: "",
  email: "",
  phone: "",
  alternativePhone: "",
  whatsappPhone: "",
  customerType: "INDIVIDUAL",
  kraPin: "",
  preferredCommunication: "EMAIL",
  whatsappOptIn: false,
  address: "",
  notes: "",
};
export function CustomersPage() {
  const { user } = useAuth();
  const admin = user?.role === "BUSINESS_ADMIN";
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCustomer);
  const query = useQuery({
    queryKey: ["customers", { search }],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Customer[]>>("/customers", { params: { search: search || undefined } })).data.data,
  });
  const create = useMutation({
    mutationFn: () =>
      api.post("/customers", {
        ...form,
        email: form.email || undefined,
        alternativePhone: form.alternativePhone || undefined,
        whatsappPhone: form.whatsappPhone || undefined,
        kraPin: form.kraPin || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyCustomer);
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error)
    return (
      <ErrorBlock
        message={apiMessage(query.error)}
        retry={() => void query.refetch()}
      />
    );
  const rows = (query.data ?? []).map((customer) => [
    <Button
      component={Link}
      to={`/customers/${customer.id}`}
      state={{ directorySearch: params.toString() }}
      sx={{ p: 0, justifyContent: "flex-start" }}
    >
      <RecordName>{customer.fullName}</RecordName>
    </Button>,
    customer.phone,
    customer.email ?? "—",
    customer._count?.devices ?? 0,
    customer._count?.repairs ?? 0,
  ]);
  return (
    <>
      <PageHeader
        title="Customers"
        description="Contact details and repair history remain scoped to this business."
        actions={
          admin ? <CreateButton label="Add customer" onClick={() => { create.reset(); setOpen(true); }} /> : undefined
        }
      />
      <DirectorySearch key={search} value={search} label="Find a customer" placeholder="Name, email or phone number" onSearch={(value) => setParams(value ? { q: value } : {})} />
      <ResultStatus count={query.data?.length ?? 0} busy={query.isFetching} limit={100} />
      <DataTable
        columns={["Customer", "Phone", "Email", "Devices", "Repairs"]}
        rows={rows}
        rowKeys={(query.data ?? []).map((customer) => customer.id)}
        mobileSummaryColumns={[0]}
        caption="Customer contacts and linked workshop history"
        empty={search ? "No customers match this search. Try another name, email or phone, or clear the search." : admin ? "Add the first customer to begin a repair intake." : "No customer profiles are available in this business yet."}
      />
      <FormDialog
        open={open}
        title="Add customer"
        description="Capture contact details first. WhatsApp messages require the customer's permission."
        dirty={JSON.stringify(form) !== JSON.stringify(emptyCustomer)}
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
      >
        <Typography component="h2" variant="subtitle2">Customer identity</Typography>
        <TextField
          required
          label="Full name"
          value={form.fullName}
          onChange={(event) =>
            setForm({ ...form, fullName: event.target.value })
          }
        />
        <TextField
          required
          label="Phone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value, whatsappOptIn: false })}
        />
        <TextField
          label="Alternative phone"
          type="tel"
          value={form.alternativePhone}
          onChange={(event) =>
            setForm({ ...form, alternativePhone: event.target.value })
          }
        />
        <Typography component="h2" variant="subtitle2">Communication preferences</Typography>
        <TextField label="WhatsApp phone" type="tel" value={form.whatsappPhone} onChange={(event) => setForm({ ...form, whatsappPhone: event.target.value, whatsappOptIn: false })} />
        <FormControlLabel control={<Checkbox checked={form.whatsappOptIn} onChange={(event) => setForm({ ...form, whatsappOptIn: event.target.checked })} />} label="The customer has agreed to receive WhatsApp ticket and service updates at this number." />
        <Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField select fullWidth label="Customer type" value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value })}><MenuItem value="INDIVIDUAL">Individual</MenuItem><MenuItem value="BUSINESS">Business</MenuItem></TextField><TextField fullWidth label="KRA PIN" value={form.kraPin} onChange={(event) => setForm({ ...form, kraPin: event.target.value.toUpperCase() })} /></Stack>
        <TextField select label="Preferred communication" value={form.preferredCommunication} onChange={(event) => setForm({ ...form, preferredCommunication: event.target.value })}><MenuItem value="EMAIL">Email</MenuItem><MenuItem value="WHATSAPP">WhatsApp</MenuItem></TextField>
        <TextField
          label="Email"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <TextField
          label="Address"
          value={form.address}
          onChange={(event) =>
            setForm({ ...form, address: event.target.value })
          }
        />
        <TextField
          label="Notes"
          multiline
          minRows={2}
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </FormDialog>
    </>
  );
}

const emptyDevice = {
  customerId: "",
  type: "Laptop",
  brand: "",
  model: "",
  serialNumber: "",
  imei: "",
  colour: "",
  storageCapacity: "",
  ram: "",
  accessories: "",
  physicalCondition: "",
  reportedFault: "",
  imageUrls: "",
  warrantyStatus: "",
};
export function DevicesPage() {
  const { user } = useAuth();
  const admin = user?.role === "BUSINESS_ADMIN";
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyDevice);
  const [removing, setRemoving] = useState<Device | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const devices = useQuery({
    queryKey: ["devices", { search }],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Device[]>>("/devices", { params: { search: search || undefined } })).data.data,
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Customer[]>>("/customers")).data.data,
    enabled: admin,
  });
  const create = useMutation({
    mutationFn: () =>
      api.post("/devices", {
        ...form,
        serialNumber: form.serialNumber || undefined,
        imei: form.imei || undefined,
        colour: form.colour || undefined,
        storageCapacity: form.storageCapacity || undefined,
        ram: form.ram || undefined,
        accessories: form.accessories || undefined,
        physicalCondition: form.physicalCondition || undefined,
        warrantyStatus: form.warrantyStatus || undefined,
        imageUrls: form.imageUrls
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyDevice);
      await queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
  const deletion = useMutation({ mutationFn: () => api.delete(`/devices/${removing!.id}`, { data: { reason: deleteReason } }), onSuccess: async () => { setRemoving(null); setDeleteReason(""); await queryClient.invalidateQueries({ queryKey: ["devices"] }); } });
  if (devices.isLoading || customers.isLoading) return <LoadingBlock />;
  const issue = devices.error ?? customers.error;
  if (issue) return <ErrorBlock message={apiMessage(issue)} retry={() => { void devices.refetch(); if (admin) void customers.refetch(); }} />;
  const rows = (devices.data ?? []).map((device) => [
    <RecordName fontWeight={700}>{`${device.brand} ${device.model}`}</RecordName>,
    device.type,
    device.serialNumber || device.imei || "—",
    <RecordName fontWeight={400}>{device.customer?.fullName ?? "—"}</RecordName>,
    device.reportedFault,
    ...(admin ? [<Tooltip title="Deactivate device"><IconButton aria-label={`Deactivate ${device.brand} ${device.model}`} color="error" onClick={() => { deletion.reset(); setDeleteReason(""); setRemoving(device); }}><DeleteOutline /></IconButton></Tooltip>] : []),
  ]);
  return (
    <>
      <PageHeader
        title="Devices"
        description="Serialized equipment records linked to verified customer profiles."
        actions={
          admin ? <CreateButton label="Register device" onClick={() => { create.reset(); setOpen(true); }} /> : undefined
        }
      />
      <DirectorySearch key={search} value={search} label="Find a device" placeholder="Brand, model, serial number or IMEI" onSearch={(value) => setParams(value ? { q: value } : {})} />
      <ResultStatus count={devices.data?.length ?? 0} busy={devices.isFetching} limit={100} />
      <DataTable
        columns={[
          "Device",
          "Type",
          "Serial / IMEI",
          "Customer",
          "Reported fault",
          ...(admin ? ["Action"] : []),
        ]}
        rows={rows}
        rowKeys={(devices.data ?? []).map((device) => device.id)}
        caption="Devices and their customer-reported faults"
        minTableWidth={1000}
        mobileSummaryColumns={[0, 1]}
        empty={search ? "No devices match this search. Try a brand, model, serial number or IMEI." : "No devices have been registered in this business yet."}
      />
      <FormDialog
        open={open}
        title="Register device"
        description="Link the device to a customer, record its identity and describe the reported fault."
        dirty={JSON.stringify(form) !== JSON.stringify(emptyDevice)}
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
      >
        <Typography component="h2" variant="subtitle2">Customer and device identity</Typography>
        <TextField
          select
          required
          label="Customer"
          value={form.customerId}
          onChange={(event) =>
            setForm({ ...form, customerId: event.target.value })
          }
        >
          {(customers.data ?? []).map((customer) => (
            <MenuItem key={customer.id} value={customer.id}>
              {customer.fullName} · {customer.phone}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            select
            fullWidth
            label="Type"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
          >
            {[
              "Laptop",
              "Desktop",
              "Phone",
              "Tablet",
              "Printer",
              "Gaming console",
              "CCTV",
              "Networking hardware",
              "Storage device",
              "Other",
            ].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            required
            fullWidth
            label="Brand"
            value={form.brand}
            onChange={(event) =>
              setForm({ ...form, brand: event.target.value })
            }
          />
        </Stack>
        <TextField
          required
          label="Model"
          value={form.model}
          onChange={(event) => setForm({ ...form, model: event.target.value })}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            fullWidth
            label="Serial number"
            value={form.serialNumber}
            onChange={(event) =>
              setForm({ ...form, serialNumber: event.target.value })
            }
          />
          <TextField
            fullWidth
            label="IMEI"
            value={form.imei}
            onChange={(event) => setForm({ ...form, imei: event.target.value })}
          />
          <TextField
            fullWidth
            label="Colour"
            value={form.colour}
            onChange={(event) =>
              setForm({ ...form, colour: event.target.value })
            }
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            fullWidth
            label="Storage capacity"
            value={form.storageCapacity}
            onChange={(event) =>
              setForm({ ...form, storageCapacity: event.target.value })
            }
          />
          <TextField
            fullWidth
            label="RAM"
            value={form.ram}
            onChange={(event) => setForm({ ...form, ram: event.target.value })}
          />
          <TextField
            fullWidth
            label="Warranty status"
            value={form.warrantyStatus}
            onChange={(event) =>
              setForm({ ...form, warrantyStatus: event.target.value })
            }
          />
        </Stack>
        <TextField
          multiline
          minRows={2}
          label="Accessories received"
          value={form.accessories}
          onChange={(event) =>
            setForm({ ...form, accessories: event.target.value })
          }
        />
        <Typography component="h2" variant="subtitle2">Intake condition</Typography>
        <TextField
          multiline
          minRows={2}
          label="Physical condition"
          value={form.physicalCondition}
          onChange={(event) =>
            setForm({ ...form, physicalCondition: event.target.value })
          }
        />
        <TextField
          required
          multiline
          minRows={3}
          label="Customer-reported fault"
          value={form.reportedFault}
          onChange={(event) =>
            setForm({ ...form, reportedFault: event.target.value })
          }
        />
        <TextField
          label="Image HTTPS URLs"
          value={form.imageUrls}
          onChange={(event) =>
            setForm({ ...form, imageUrls: event.target.value })
          }
          helperText="Comma-separated URLs from an approved media host. Device passcodes are not accepted."
        />
      </FormDialog>
      <FormDialog open={Boolean(removing)} title="Deactivate device" busy={deletion.isPending} error={deletion.error ? apiMessage(deletion.error) : undefined} onClose={() => setRemoving(null)} onSubmit={() => deletion.mutate()} submitLabel="Deactivate and preserve repairs" submitDisabled={deleteReason.trim().length < 3}><Alert severity="warning">Linked repair history is preserved and remains auditable.</Alert><TextField required label="Reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></FormDialog>
    </>
  );
}

const emptyTechnician = { fullName: "", email: "", phone: "" };
export function TechniciansPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const statusFilter = params.get("status") ?? "";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyTechnician);
  const [notice, setNotice] = useState("");
  const [disabling, setDisabling] = useState<Technician | null>(null);
  const query = useQuery({
    queryKey: ["technicians"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Technician[]>>("/businesses/technicians")).data
        .data,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["technicians"] });
  const create = useMutation({
    mutationFn: () =>
      api.post("/businesses/technicians", {
        ...form,
        phone: form.phone || undefined,
      }),
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyTechnician);
      setNotice(
        "The technician invitation was generated and queued for email delivery.",
      );
      await refresh();
    },
  });
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      api.patch(`/businesses/technicians/${id}/status`, { status: value }),
    onSuccess: async () => { setDisabling(null); setNotice("The account status was updated."); await refresh(); },
  });
  const reset = useMutation({
    mutationFn: (id: string) =>
      api.post(`/businesses/technicians/${id}/password-reset`),
    onSuccess: () =>
      setNotice("A secure password-reset link was queued for delivery."),
  });
  const currentAdmin = query.data?.find((person) => person.id === user?.id);
  const capability = useMutation({ mutationFn: (enabled: boolean) => api.put("/businesses/me/technician-capability", { enabled }), onSuccess: refresh });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={apiMessage(query.error)} retry={() => void query.refetch()} />;
  const people = (query.data ?? []).filter((person) => `${person.fullName} ${person.email} ${person.phone ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (!statusFilter || person.status === statusFilter));
  const rows = people.map((person) => [
    <RecordName fontWeight={700}>{person.fullName}</RecordName>,
    <Stack>
      <span>{person.email}</span>
      <Typography variant="caption" color="text.secondary">
        {person.phone ?? "No phone"}
      </Typography>
    </Stack>,
    <StatusChip status={person.status} />,
    person._count?.assignedRepairs ?? 0,
    readableDate(person.lastLoginAt),
    person.role?.code === "BUSINESS_ADMIN" ? <Typography variant="caption" color="text.secondary">Administrator account</Typography> : <Stack direction="row">
      <Tooltip title="Send password reset">
        <IconButton aria-label={`Send password reset to ${person.fullName}`} onClick={() => reset.mutate(person.id)} disabled={reset.isPending || status.isPending}>
          <Key />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={
          person.status === "DISABLED" ? "Enable account" : "Disable account"
        }
      >
        <IconButton
          aria-label={`${person.status === "DISABLED" ? "Enable" : "Disable"} ${person.fullName} account`}
          disabled={status.isPending || reset.isPending}
          color={person.status === "DISABLED" ? "success" : "warning"}
          onClick={() => { status.reset(); if (person.status === "DISABLED") status.mutate({ id: person.id, value: "ACTIVE" }); else setDisabling(person); }}
        >
          {person.status === "DISABLED" ? <CheckCircle /> : <Block />}
        </IconButton>
      </Tooltip>
    </Stack>,
  ]);
  return (
    <>
      <PageHeader
        title="Technicians"
        description="Invite staff, control access, and review assigned workload."
        actions={
          <CreateButton
            label="Invite technician"
            onClick={() => setOpen(true)}
          />
        }
      />
      {notice && (
        <Alert severity="success" onClose={() => setNotice("")} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {(status.error || reset.error || capability.error) && <Alert severity="error" sx={{ mb: 2 }}>{apiMessage(status.error ?? reset.error ?? capability.error)}</Alert>}
      <Alert severity="info" sx={{ mb: 2 }} action={<Button onClick={() => capability.mutate(!currentAdmin?.canTakeRepairJobs)} disabled={capability.isPending}>{currentAdmin?.canTakeRepairJobs ? "Disable for me" : "Enable for me"}</Button>}>Business administrators can optionally appear in technician assignment lists and accept repair work without receiving technician-only permissions.</Alert>
      <DirectorySearch key={search} value={search} label="Find a team member" placeholder="Name, email or phone" onSearch={(value) => { const next = new URLSearchParams(params); if (value) next.set("q", value); else next.delete("q"); setParams(next); }}>
        <TextField select size="small" label="Account status" value={statusFilter} onChange={(event) => { const next = new URLSearchParams(params); if (event.target.value) next.set("status", event.target.value); else next.delete("status"); setParams(next); }} sx={{ minWidth: { md: 180 } }}><MenuItem value="">All statuses</MenuItem>{["ACTIVE", "PENDING_VERIFICATION", "DISABLED", "LOCKED", "DELETION_REQUESTED", "DELETED"].map((value) => <MenuItem key={value} value={value}>{value[0] + value.slice(1).toLowerCase().replaceAll("_", " ")}</MenuItem>)}</TextField>
      </DirectorySearch>
      <ResultStatus count={people.length} busy={query.isFetching} />
      <DataTable
        columns={[
          "Technician",
          "Contact",
          "Status",
          "Assigned repairs",
          "Last login",
          "Actions",
        ]}
        rows={rows}
        rowKeys={people.map((person) => person.id)}
        caption="Team accounts and assigned repair workload"
        minTableWidth={1000}
        mobileSummaryColumns={[0, 2]}
        empty={search || statusFilter ? "No team members match these filters. Clear the search or choose All statuses." : "No technicians have been invited yet."}
      />
      <FormDialog
        open={open}
        title="Invite technician"
        description="A secure activation invitation will be queued for the email address below."
        dirty={JSON.stringify(form) !== JSON.stringify(emptyTechnician)}
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
      >
        <TextField
          required
          label="Full name"
          value={form.fullName}
          onChange={(event) =>
            setForm({ ...form, fullName: event.target.value })
          }
        />
        <TextField
          required
          type="email"
          label="Email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <TextField
          label="Phone"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
      </FormDialog>
      <FormDialog open={Boolean(disabling)} title="Disable technician account" description={`Disable access for ${disabling?.fullName ?? "this technician"}? Existing repair and audit records are preserved, and active sessions will be signed out.`} busy={status.isPending} error={status.error ? apiMessage(status.error) : undefined} onClose={() => setDisabling(null)} onSubmit={() => { if (disabling) status.mutate({ id: disabling.id, value: "DISABLED" }); }} submitLabel="Disable account"><Alert severity="warning">This prevents the technician from signing in until an administrator enables the account again.</Alert></FormDialog>
    </>
  );
}

const emptyStock = {
  sku: "",
  name: "",
  category: "Spare part",
  purchaseCost: "0",
  sellingPrice: "0",
  quantity: "0",
  minimumStock: "1",
  location: "",
};
export function InventoryPage() {
  const { user } = useAuth();
  const admin = user?.role === "BUSINESS_ADMIN";
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const lowStock = params.get("lowStock") === "1";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [delta, setDelta] = useState("1");
  const [notes, setNotes] = useState("");
  const [form, setForm] = useState(emptyStock);
  const query = useQuery({
    queryKey: ["inventory", { search, lowStock }],
    queryFn: async () =>
      (await api.get<ApiEnvelope<InventoryItem[]>>("/inventory", { params: { search: search || undefined, lowStock: lowStock || undefined } })).data.data,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  const create = useMutation({
    mutationFn: () =>
      api.post("/inventory", {
        ...form,
        purchaseCost: Number(form.purchaseCost),
        sellingPrice: Number(form.sellingPrice),
        quantity: Number(form.quantity),
        minimumStock: Number(form.minimumStock),
        location: form.location || undefined,
      }),
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyStock);
      await refresh();
    },
  });
  const adjust = useMutation({
    mutationFn: () =>
      api.post(`/inventory/${adjusting!.id}/adjust`, {
        quantityDelta: Number(delta),
        notes,
        allowNegative: false,
      }),
    onSuccess: async () => {
      setAdjusting(null);
      setNotes("");
      setDelta("1");
      await refresh();
    },
  });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={apiMessage(query.error)} retry={() => void query.refetch()} />;
  const rows = (query.data ?? []).map((item) => [
    <Stack>
      <RecordName fontWeight={700}>{item.name}</RecordName>
      <Typography variant="caption" color="text.secondary">
        {item.sku}
      </Typography>
    </Stack>,
    item.category,
    <Chip
      color={item.quantity <= item.minimumStock ? "warning" : "success"}
      variant="outlined"
      label={`${item.quantity} in stock`}
      sx={{ color: "text.primary", fontWeight: 650 }}
    />,
    `KES ${Number(item.sellingPrice).toLocaleString()}`,
    item.location ?? "—",
    ...(admin ? [<Stack direction="row">
      <Tooltip title="Receive stock">
        <IconButton
          aria-label={`Receive ${item.name} stock`}
          color="success"
          onClick={() => {
            setAdjusting(item);
            setDelta("1");
          }}
        >
          <Add />
        </IconButton>
      </Tooltip>
      <Tooltip title="Reduce stock">
        <IconButton
          aria-label={`Reduce ${item.name} stock`}
          color="warning"
          onClick={() => {
            setAdjusting(item);
            setDelta("-1");
          }}
        >
          <Remove />
        </IconButton>
      </Tooltip>
    </Stack>] : []),
  ]);
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Live stock levels, pricing, and controlled stock adjustments."
        actions={
          admin ? <CreateButton
            label="Add inventory item"
            onClick={() => { create.reset(); setOpen(true); }}
          /> : undefined
        }
      />
      <DirectorySearch key={search} value={search} label="Find inventory" placeholder="Part name, SKU or barcode" onSearch={(value) => { const next = new URLSearchParams(params); if (value) next.set("q", value); else next.delete("q"); setParams(next); }}>
        <Button type="button" variant={lowStock ? "contained" : "outlined"} aria-pressed={lowStock} onClick={() => { const next = new URLSearchParams(params); if (lowStock) next.delete("lowStock"); else next.set("lowStock", "1"); setParams(next); }}>Low stock{lowStock ? " only" : ""}</Button>
      </DirectorySearch>
      <ResultStatus count={query.data?.length ?? 0} busy={query.isFetching} />
      <DataTable
        columns={[
          "Item",
          "Category",
          "Quantity",
          "Selling price",
          "Location",
          ...(admin ? ["Adjust"] : []),
        ]}
        rows={rows}
        rowKeys={(query.data ?? []).map((item) => item.id)}
        caption={lowStock ? "Stock at or below the configured threshold" : "Current inventory and configured selling prices"}
        minTableWidth={960}
        mobileSummaryColumns={[0]}
        empty={search || lowStock ? "No inventory items match these filters. Clear the search or turn off Low stock to see more." : "No inventory items have been added yet."}
      />
      <FormDialog
        open={open}
        title="Add inventory item"
        description="Set the item identity, configured prices and opening stock. Future changes are recorded as stock adjustments."
        dirty={JSON.stringify(form) !== JSON.stringify(emptyStock)}
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
      >
        <Typography component="h2" variant="subtitle2">Item identity</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            required
            fullWidth
            label="SKU"
            value={form.sku}
            onChange={(event) => setForm({ ...form, sku: event.target.value })}
          />
          <TextField
            required
            fullWidth
            label="Name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Stack>
        <TextField
          required
          label="Category"
          value={form.category}
          onChange={(event) =>
            setForm({ ...form, category: event.target.value })
          }
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            fullWidth
            type="number"
            label="Purchase cost"
            value={form.purchaseCost}
            onChange={(event) =>
              setForm({ ...form, purchaseCost: event.target.value })
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">KES</InputAdornment>
              ),
            }}
          />
          <TextField
            fullWidth
            type="number"
            label="Selling price"
            value={form.sellingPrice}
            onChange={(event) =>
              setForm({ ...form, sellingPrice: event.target.value })
            }
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">KES</InputAdornment>
              ),
            }}
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            fullWidth
            type="number"
            label="Opening quantity"
            value={form.quantity}
            onChange={(event) =>
              setForm({ ...form, quantity: event.target.value })
            }
          />
          <TextField
            fullWidth
            type="number"
            label="Low-stock threshold"
            value={form.minimumStock}
            onChange={(event) =>
              setForm({ ...form, minimumStock: event.target.value })
            }
          />
        </Stack>
        <TextField
          label="Storage location"
          value={form.location}
          onChange={(event) =>
            setForm({ ...form, location: event.target.value })
          }
        />
      </FormDialog>
      <FormDialog
        open={Boolean(adjusting)}
        title={`Adjust ${adjusting?.name ?? "stock"}`}
        busy={adjust.isPending}
        error={adjust.error ? apiMessage(adjust.error) : undefined}
        onClose={() => setAdjusting(null)}
        onSubmit={() => adjust.mutate()}
        submitLabel="Record adjustment"
      >
        <TextField
          required
          type="number"
          label="Quantity change"
          helperText="Use a negative number to reduce stock."
          value={delta}
          onChange={(event) => setDelta(event.target.value)}
        />
        <TextField
          required
          multiline
          minRows={2}
          label="Reason / reference"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </FormDialog>
    </>
  );
}

const emptyBusiness = {
  name: "",
  registrationNumber: "",
  taxPin: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  city: "Nairobi",
  country: "Kenya",
  currency: "KES",
  taxRate: "0",
  receiptFooter: "Thank you for choosing us.",
  invoiceFooter: "Payment is due by the stated date.",
  workingHours: "Mon-Fri 08:00-17:00",
  timeZone: "Africa/Nairobi",
  adminName: "",
  adminEmail: "",
  adminPhone: "",
};
export function BusinessesPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const requestedSize = Number(params.get("pageSize"));
  const pageSize = [20, 50, 100].includes(requestedSize) ? requestedSize : 20;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyBusiness);
  const [changingStatus, setChangingStatus] = useState<{ business: Business; value: string } | null>(null);
  const query = useQuery({
    queryKey: ["businesses", { search, page, pageSize }],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<{ items: Business[]; total: number; page: number; pageSize: number }>>(
          "/businesses",
          { params: { search: search || undefined, page, pageSize } },
        )
      ).data.data,
    placeholderData: keepPreviousData,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["businesses"] });
  const create = useMutation({
    mutationFn: () =>
      api.post("/businesses", {
        name: form.name,
        registrationNumber: form.registrationNumber,
        taxPin: form.taxPin,
        email: form.email,
        phone: form.phone,
        whatsapp: form.whatsapp,
        address: form.address,
        city: form.city,
        country: form.country,
        currency: form.currency,
        taxRate: Number(form.taxRate),
        receiptFooter: form.receiptFooter,
        invoiceFooter: form.invoiceFooter,
        workingHours: { summary: form.workingHours },
        timeZone: form.timeZone,
        administrator: {
          fullName: form.adminName,
          email: form.adminEmail,
          phone: form.adminPhone || undefined,
        },
      }),
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyBusiness);
      await refresh();
    },
  });
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      api.patch(`/businesses/${id}/status`, { status: value }),
    onSuccess: async () => { setChangingStatus(null); await refresh(); },
  });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={apiMessage(query.error)} retry={() => void query.refetch()} />;
  const rows = (query.data?.items ?? []).map((business) => [
    <Stack>
      <Typography fontWeight={700}>{business.name}</Typography>
      <Typography variant="caption" color="text.secondary">
        {business.city}, {business.country}
      </Typography>
    </Stack>,
    <Stack>
      <span>{business.email}</span>
      <Typography variant="caption">{business.phone}</Typography>
    </Stack>,
    <StatusChip status={business.status} />,
    business.subscriptionStatus,
    business._count?.users ?? 0,
    business._count?.repairs ?? 0,
    <TextField
      select
      size="small"
      aria-label={`Change ${business.name} status`}
      slotProps={{ select: { "aria-label": `Change ${business.name} status` } }}
      value={business.status}
      disabled={query.isFetching || status.isPending}
      onChange={(event) => { status.reset(); setChangingStatus({ business, value: event.target.value }); }}
    >
      {["ACTIVE", "SUSPENDED", "INACTIVE", "DELETED"].map((value) => (
        <MenuItem key={value} value={value}>
          {value}
        </MenuItem>
      ))}
    </TextField>,
  ]);
  return (
    <>
      <PageHeader
        title="Repair businesses"
        description={`${query.data?.total ?? 0} tenant workspaces registered on the platform.`}
        actions={
          <CreateButton
            label="Onboard business"
            onClick={() => setOpen(true)}
          />
        }
      />
      <DirectorySearch key={search} value={search} label="Find a business" placeholder="Business name or email" onSearch={(value) => { const next = new URLSearchParams(params); if (value) next.set("q", value); else next.delete("q"); next.delete("page"); setParams(next); }} />
      <ResultStatus count={query.data?.items.length ?? 0} busy={query.isFetching} />
      <DataTable
        columns={[
          "Business",
          "Contact",
          "Status",
          "Subscription",
          "Users",
          "Repairs",
          "Control",
        ]}
        rows={rows}
        rowKeys={(query.data?.items ?? []).map((business) => business.id)}
        mobileSummaryColumns={[0, 2]}
        paginated={false}
        caption={`Business workspaces · Page ${query.data?.page ?? page} · ${query.data?.total ?? 0} matching workspaces`}
        empty={search ? "No businesses match this search. Try another name or email." : "No business workspaces are registered yet."}
      />
      {Boolean(query.data?.total) && <TablePagination component="div" count={query.data?.total ?? 0} page={Math.max(0, (query.data?.page ?? page) - 1)} rowsPerPage={query.data?.pageSize ?? pageSize} rowsPerPageOptions={[20, 50, 100]} onPageChange={(_, nextPage) => { const next = new URLSearchParams(params); next.set("page", String(nextPage + 1)); setParams(next); }} onRowsPerPageChange={(event) => { const next = new URLSearchParams(params); next.set("pageSize", event.target.value); next.delete("page"); setParams(next); }} disabled={query.isFetching} labelRowsPerPage="Workspaces" sx={{ mt: 1, ".MuiTablePagination-toolbar": { flexWrap: "wrap", px: 0 }, ".MuiTablePagination-spacer": { display: "none" } }} />}
      <FormDialog open={Boolean(changingStatus)} title="Change business status" description={`${changingStatus?.business.name ?? "This business"} will become ${changingStatus?.value.toLowerCase() ?? "updated"}.`} busy={status.isPending} error={status.error ? apiMessage(status.error) : undefined} onClose={() => setChangingStatus(null)} onSubmit={() => { if (changingStatus) status.mutate({ id: changingStatus.business.id, value: changingStatus.value }); }} submitLabel="Confirm status change"><Alert severity={changingStatus?.value === "ACTIVE" ? "info" : "warning"}>{changingStatus?.value === "DELETED" ? "This removes the workspace from active management and signs out its users. Linked records are retained, but this screen does not provide a restore action." : changingStatus?.value === "ACTIVE" ? "This enables the workspace under its existing subscription and account rules." : "This restricts workspace access and signs out active users. Existing records remain intact."}</Alert></FormDialog>
      <FormDialog
        open={open}
        title="Onboard repair business"
        description="Create the tenant workspace and queue an invitation for its primary administrator."
        dirty={JSON.stringify(form) !== JSON.stringify(emptyBusiness)}
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
        submitLabel="Create and invite admin"
      >
        <Typography variant="overline" color="text.secondary">
          Business identity
        </Typography>
        <TextField
          required
          label="Business name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <Alert severity="info">After account activation, the business administrator can upload the invoice logo directly in Settings.</Alert>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            required
            fullWidth
            label="Registration number"
            value={form.registrationNumber}
            onChange={(event) =>
              setForm({ ...form, registrationNumber: event.target.value })
            }
          />
          <TextField
            required
            fullWidth
            label="Tax / PIN number"
            value={form.taxPin}
            onChange={(event) =>
              setForm({ ...form, taxPin: event.target.value })
            }
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            required
            fullWidth
            type="email"
            label="Business email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
          />
          <TextField
            required
            fullWidth
            label="Phone"
            value={form.phone}
            onChange={(event) =>
              setForm({ ...form, phone: event.target.value })
            }
          />
          <TextField
            required
            fullWidth
            label="WhatsApp"
            value={form.whatsapp}
            onChange={(event) =>
              setForm({ ...form, whatsapp: event.target.value })
            }
          />
        </Stack>
        <TextField
          required
          label="Physical address"
          value={form.address}
          onChange={(event) =>
            setForm({ ...form, address: event.target.value })
          }
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            required
            fullWidth
            label="City"
            value={form.city}
            onChange={(event) => setForm({ ...form, city: event.target.value })}
          />
          <TextField
            required
            fullWidth
            label="Country"
            value={form.country}
            onChange={(event) =>
              setForm({ ...form, country: event.target.value })
            }
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            required
            fullWidth
            label="Currency"
            value={form.currency}
            onChange={(event) =>
              setForm({ ...form, currency: event.target.value.toUpperCase() })
            }
          />
          <TextField
            required
            fullWidth
            type="number"
            label="Tax rate (%)"
            value={form.taxRate}
            onChange={(event) =>
              setForm({ ...form, taxRate: event.target.value })
            }
          />
          <TextField
            required
            fullWidth
            label="Time zone"
            value={form.timeZone}
            onChange={(event) =>
              setForm({ ...form, timeZone: event.target.value })
            }
          />
        </Stack>
        <TextField
          required
          label="Working hours"
          value={form.workingHours}
          onChange={(event) =>
            setForm({ ...form, workingHours: event.target.value })
          }
        />
        <TextField
          multiline
          minRows={2}
          label="Invoice footer"
          value={form.invoiceFooter}
          onChange={(event) =>
            setForm({ ...form, invoiceFooter: event.target.value })
          }
        />
        <TextField
          multiline
          minRows={2}
          label="Receipt footer"
          value={form.receiptFooter}
          onChange={(event) =>
            setForm({ ...form, receiptFooter: event.target.value })
          }
        />
        <Typography variant="overline" color="text.secondary">
          Primary administrator
        </Typography>
        <TextField
          required
          label="Administrator name"
          value={form.adminName}
          onChange={(event) =>
            setForm({ ...form, adminName: event.target.value })
          }
        />
        <TextField
          required
          type="email"
          label="Administrator email"
          value={form.adminEmail}
          onChange={(event) =>
            setForm({ ...form, adminEmail: event.target.value })
          }
        />
        <TextField
          label="Administrator phone"
          value={form.adminPhone}
          onChange={(event) =>
            setForm({ ...form, adminPhone: event.target.value })
          }
        />
      </FormDialog>
    </>
  );
}
