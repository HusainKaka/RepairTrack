import Block from "@mui/icons-material/Block";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Key from "@mui/icons-material/Key";
import Remove from "@mui/icons-material/Remove";
import Add from "@mui/icons-material/Add";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import {
  Alert,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { CreateButton, DataTable, FormDialog } from "../components/DataViews";
import { ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
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

const emptyCustomer = {
  fullName: "",
  email: "",
  phone: "",
  alternativePhone: "",
  whatsappPhone: "",
  customerType: "INDIVIDUAL",
  kraPin: "",
  preferredCommunication: "EMAIL",
  address: "",
  notes: "",
};
export function CustomersPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCustomer);
  const query = useQuery({
    queryKey: ["customers"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Customer[]>>("/customers")).data.data,
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
      sx={{ p: 0, justifyContent: "flex-start" }}
    >
      {customer.fullName}
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
          <CreateButton label="Add customer" onClick={() => setOpen(true)} />
        }
      />
      <DataTable
        columns={["Customer", "Phone", "Email", "Devices", "Repairs"]}
        rows={rows}
        empty="Add the first customer to begin a repair intake."
      />
      <FormDialog
        open={open}
        title="Add customer"
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
          label="Phone"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
        <TextField
          label="Alternative phone"
          value={form.alternativePhone}
          onChange={(event) =>
            setForm({ ...form, alternativePhone: event.target.value })
          }
        />
        <TextField label="WhatsApp phone" value={form.whatsappPhone} onChange={(event) => setForm({ ...form, whatsappPhone: event.target.value })} />
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyDevice);
  const [removing, setRemoving] = useState<Device | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Device[]>>("/devices")).data.data,
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Customer[]>>("/customers")).data.data,
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
  if (issue) return <ErrorBlock message={apiMessage(issue)} />;
  const rows = (devices.data ?? []).map((device) => [
    <Typography fontWeight={700}>
      {device.brand} {device.model}
    </Typography>,
    device.type,
    device.serialNumber ?? device.imei ?? "—",
    device.customer?.fullName ?? "—",
    device.reportedFault,
    <Tooltip title="Deactivate device"><IconButton color="error" onClick={() => setRemoving(device)}><DeleteOutline /></IconButton></Tooltip>,
  ]);
  return (
    <>
      <PageHeader
        title="Devices"
        description="Serialized equipment records linked to verified customer profiles."
        actions={
          <CreateButton label="Register device" onClick={() => setOpen(true)} />
        }
      />
      <DataTable
        columns={[
          "Device",
          "Type",
          "Serial / IMEI",
          "Customer",
          "Reported fault",
          "Action",
        ]}
        rows={rows}
      />
      <FormDialog
        open={open}
        title="Register device"
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
      >
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyTechnician);
  const [notice, setNotice] = useState("");
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
    onSuccess: refresh,
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
  if (query.error) return <ErrorBlock message={apiMessage(query.error)} />;
  const rows = (query.data ?? []).map((person) => [
    <Typography fontWeight={700}>{person.fullName}</Typography>,
    <Stack>
      <span>{person.email}</span>
      <Typography variant="caption" color="text.secondary">
        {person.phone ?? "No phone"}
      </Typography>
    </Stack>,
    <StatusChip status={person.status} />,
    person._count?.assignedRepairs ?? 0,
    readableDate(person.lastLoginAt),
    <Stack direction="row">
      <Tooltip title="Send password reset">
        <IconButton onClick={() => reset.mutate(person.id)}>
          <Key />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={
          person.status === "DISABLED" ? "Enable account" : "Disable account"
        }
      >
        <IconButton
          color={person.status === "DISABLED" ? "success" : "warning"}
          onClick={() =>
            status.mutate({
              id: person.id,
              value: person.status === "DISABLED" ? "ACTIVE" : "DISABLED",
            })
          }
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
      <Alert severity="info" sx={{ mb: 2 }} action={<Button onClick={() => capability.mutate(!currentAdmin?.canTakeRepairJobs)} disabled={capability.isPending}>{currentAdmin?.canTakeRepairJobs ? "Disable for me" : "Enable for me"}</Button>}>Business administrators can optionally appear in technician assignment lists and accept repair work without receiving technician-only permissions.</Alert>
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
      />
      <FormDialog
        open={open}
        title="Invite technician"
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [delta, setDelta] = useState("1");
  const [notes, setNotes] = useState("");
  const [form, setForm] = useState(emptyStock);
  const query = useQuery({
    queryKey: ["inventory"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<InventoryItem[]>>("/inventory")).data.data,
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
  if (query.error) return <ErrorBlock message={apiMessage(query.error)} />;
  const rows = (query.data ?? []).map((item) => [
    <Stack>
      <Typography fontWeight={700}>{item.name}</Typography>
      <Typography variant="caption" color="text.secondary">
        {item.sku}
      </Typography>
    </Stack>,
    item.category,
    <Chip
      color={item.quantity <= item.minimumStock ? "warning" : "success"}
      variant="outlined"
      label={`${item.quantity} in stock`}
    />,
    `KES ${Number(item.sellingPrice).toLocaleString()}`,
    item.location ?? "—",
    <Stack direction="row">
      <Tooltip title="Receive stock">
        <IconButton
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
          color="warning"
          onClick={() => {
            setAdjusting(item);
            setDelta("-1");
          }}
        >
          <Remove />
        </IconButton>
      </Tooltip>
    </Stack>,
  ]);
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Live stock levels, pricing, and controlled stock adjustments."
        actions={
          <CreateButton
            label="Add inventory item"
            onClick={() => setOpen(true)}
          />
        }
      />
      <DataTable
        columns={[
          "Item",
          "Category",
          "Quantity",
          "Selling price",
          "Location",
          "Adjust",
        ]}
        rows={rows}
      />
      <FormDialog
        open={open}
        title="Add inventory item"
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
      >
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
  logoUrl: "",
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyBusiness);
  const query = useQuery({
    queryKey: ["businesses"],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<{ items: Business[]; total: number }>>(
          "/businesses",
        )
      ).data.data,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["businesses"] });
  const create = useMutation({
    mutationFn: () =>
      api.post("/businesses", {
        name: form.name,
        logoUrl: form.logoUrl || undefined,
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
    onSuccess: refresh,
  });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={apiMessage(query.error)} />;
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
      value={business.status}
      onChange={(event) =>
        status.mutate({ id: business.id, value: event.target.value })
      }
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
      />
      <FormDialog
        open={open}
        title="Onboard repair business"
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
        <TextField
          type="url"
          label="Logo HTTPS URL"
          value={form.logoUrl}
          onChange={(event) =>
            setForm({ ...form, logoUrl: event.target.value })
          }
          helperText="Upload the logo to an approved media host and paste its HTTPS URL."
        />
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
