import Add from "@mui/icons-material/Add";
import ArrowBack from "@mui/icons-material/ArrowBack";
import Download from "@mui/icons-material/Download";
import Email from "@mui/icons-material/Email";
import Payment from "@mui/icons-material/Payment";
import RemoveCircleOutline from "@mui/icons-material/RemoveCircleOutline";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
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
import { InvoiceManagementPanel } from "../components/InvoiceManagementPanel";
import type { ApiEnvelope, Customer, Invoice, Repair } from "../types";

interface InvoiceLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discount: string;
}
interface InvoiceFull extends Invoice {
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  invoiceLevelDiscount?: string;
  notes?: string;
  kraStatus?: string;
  dueAt?: string;
  terms?: string;
  business: {
    name: string;
    currency: string;
    email: string;
    phone: string;
    address: string;
    logoUrl?: string;
    taxPin?: string;
  };
  customer: Customer;
  items: {
    id: string;
    description: string;
    itemType?: string;
    inventoryItemId?: string;
    quantity: string;
    unitPrice: string;
    taxRate: string;
    discount: string;
    lineTotal: string;
  }[];
  payments: {
    id: string;
    number: string;
    amount: string;
    method: string;
    transactionReference?: string;
    paidAt: string;
  }[];
  receipts: {
    id: string;
    number: string;
    paperWidth: string;
    createdAt: string;
  }[];
}
const newLine = (): InvoiceLine => ({
  key: crypto.randomUUID(),
  description: "",
  quantity: "1",
  unitPrice: "0",
  taxRate: "0",
  discount: "0",
});

async function downloadFile(url: string, filename: string) {
  const response = await api.get<Blob>(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

export function InvoicesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [repairId, setRepairId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [terms, setTerms] = useState("");
  const [discount, setDiscount] = useState("0");
  const [lines, setLines] = useState<InvoiceLine[]>([newLine()]);
  const invoices = useQuery({
    queryKey: ["invoices"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Invoice[]>>("/invoices")).data.data,
  });
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Customer[]>>("/customers")).data.data,
    enabled: user?.role === "BUSINESS_ADMIN",
  });
  const repairs = useQuery({
    queryKey: ["repairs"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Repair[]>>("/repairs")).data.data,
    enabled: user?.role === "BUSINESS_ADMIN",
  });
  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<ApiEnvelope<{ id: string }>>("/invoices", {
          customerId,
          repairId: repairId || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          invoiceDiscount: Number(discount),
          terms: terms || undefined,
          items: lines.map(
            ({
              description,
              quantity,
              unitPrice,
              taxRate,
              discount: lineDiscount,
            }) => ({
              description,
              quantity: Number(quantity),
              unitPrice: Number(unitPrice),
              taxRate: Number(taxRate),
              discount: Number(lineDiscount),
            }),
          ),
        })
      ).data.data,
    onSuccess: async (invoice) => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void navigate(`/invoices/${invoice.id}`);
    },
  });
  if (invoices.isLoading) return <LoadingBlock />;
  if (invoices.error)
    return <ErrorBlock message={apiMessage(invoices.error)} />;
  const rows = (invoices.data ?? []).map((invoice) => [
    <Button
      component={Link}
      to={`/invoices/${invoice.id}`}
      sx={{ p: 0, fontWeight: 800 }}
    >
      {invoice.number}
    </Button>,
    invoice.customer.fullName,
    invoice.repair?.reference ?? "General",
    <StatusChip status={invoice.status} />,
    <StatusChip status={invoice.paymentStatus} />,
    `KES ${Number(invoice.total).toLocaleString()}`,
    `KES ${Number(invoice.balance).toLocaleString()}`,
    new Date(invoice.createdAt).toLocaleDateString(),
  ]);
  const subtotal =
    lines.reduce(
      (sum, line) =>
        sum +
        Math.max(
          Number(line.quantity) *
            Number(line.unitPrice) *
            (1 + Number(line.taxRate) / 100) -
            Number(line.discount),
          0,
        ),
      0,
    ) - Number(discount || 0);
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Itemized charges, payment status, and auditable receipts."
        actions={
          user?.role === "BUSINESS_ADMIN" ? (
            <CreateButton
              label="Create invoice"
              onClick={() => setOpen(true)}
            />
          ) : undefined
        }
      />
      <DataTable
        columns={[
          "Invoice",
          "Customer",
          "Repair",
          "Status",
          "Payment",
          "Total",
          "Balance",
          "Created",
        ]}
        rows={rows}
      />
      <FormDialog
        open={open}
        title="Create invoice"
        busy={create.isPending}
        error={create.error ? apiMessage(create.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => create.mutate()}
        submitLabel="Create draft"
      >
        <TextField
          select
          required
          label="Customer"
          value={customerId}
          onChange={(event) => {
            setCustomerId(event.target.value);
            setRepairId("");
          }}
        >
          {(customers.data ?? []).map((customer) => (
            <MenuItem key={customer.id} value={customer.id}>
              {customer.fullName}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Related repair"
          value={repairId}
          onChange={(event) => setRepairId(event.target.value)}
        >
          <MenuItem value="">General invoice</MenuItem>
          {(repairs.data ?? [])
            .filter((repair) => repair.customer.id === customerId)
            .map((repair) => (
              <MenuItem key={repair.id} value={repair.id}>
                {repair.reference} · {repair.device.brand} {repair.device.model}
              </MenuItem>
            ))}
        </TextField>
        <TextField
          type="datetime-local"
          label="Due date"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <Divider>Line items</Divider>
        {lines.map((line, index) => (
          <Paper variant="outlined" sx={{ p: 2 }} key={line.key}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography variant="subtitle2" flex={1}>
                Item {index + 1}
              </Typography>
              {lines.length > 1 && (
                <IconButton
                  onClick={() =>
                    setLines(lines.filter((item) => item.key !== line.key))
                  }
                >
                  <RemoveCircleOutline />
                </IconButton>
              )}
            </Stack>
            <TextField
              fullWidth
              required
              label="Description"
              value={line.description}
              onChange={(event) =>
                setLines(
                  lines.map((item) =>
                    item.key === line.key
                      ? { ...item, description: event.target.value }
                      : item,
                  ),
                )
              }
              sx={{ mt: 1 }}
            />
            <Grid container spacing={1.5} mt={0.5}>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  type="number"
                  label="Qty"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines(
                      lines.map((item) =>
                        item.key === line.key
                          ? { ...item, quantity: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  type="number"
                  label="Unit price"
                  value={line.unitPrice}
                  onChange={(event) =>
                    setLines(
                      lines.map((item) =>
                        item.key === line.key
                          ? { ...item, unitPrice: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  type="number"
                  label="Tax %"
                  value={line.taxRate}
                  onChange={(event) =>
                    setLines(
                      lines.map((item) =>
                        item.key === line.key
                          ? { ...item, taxRate: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  fullWidth
                  type="number"
                  label="Discount"
                  value={line.discount}
                  onChange={(event) =>
                    setLines(
                      lines.map((item) =>
                        item.key === line.key
                          ? { ...item, discount: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </Grid>
            </Grid>
          </Paper>
        ))}
        <Button
          startIcon={<Add />}
          onClick={() => setLines([...lines, newLine()])}
        >
          Add line
        </Button>
        <TextField
          type="number"
          label="Invoice discount"
          value={discount}
          onChange={(event) => setDiscount(event.target.value)}
        />
        <TextField
          multiline
          minRows={2}
          label="Terms"
          value={terms}
          onChange={(event) => setTerms(event.target.value)}
        />
        <Alert severity="info">
          Estimated total: KES {Math.max(subtotal, 0).toLocaleString()}
        </Alert>
      </FormDialog>
    </>
  );
}

export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [customMethod, setCustomMethod] = useState("");
  const [reference, setReference] = useState("");
  const [paperWidth, setPaperWidth] = useState("A4");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () =>
      (await api.get<ApiEnvelope<InvoiceFull>>(`/invoices/${id}`)).data.data,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["invoice", id] });
  const issue = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/issue`),
    onSuccess: refresh,
  });
  const email = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/email`),
    onSuccess: () => setNotice("The invoice was accepted for email delivery."),
  });
  const payment = useMutation({
    mutationFn: () =>
      api.post(`/invoices/${id}/payments`, {
        amount: Number(amount),
        method,
        customMethod: method === "OTHER" ? customMethod : undefined,
        transactionReference: reference || undefined,
        paperWidth,
      }),
    onSuccess: async () => {
      setPayOpen(false);
      setAmount("");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error || !query.data)
    return <ErrorBlock message={apiMessage(query.error)} />;
  const invoice = query.data;
  return (
    <>
      <Button
        component={Link}
        to="/invoices"
        startIcon={<ArrowBack />}
        sx={{ mb: 2 }}
      >
        Back to invoices
      </Button>
      <PageHeader
        title={invoice.number}
        description={`${invoice.customer.fullName} · ${invoice.repair?.reference ?? "General invoice"}`}
        actions={
          <Stack direction="row" flexWrap="wrap" gap={1}>
            <Button
              startIcon={<Download />}
              onClick={() =>
                void downloadFile(
                  `/invoices/${id}/pdf`,
                  `${invoice.number}.pdf`,
                )
              }
            >
              PDF
            </Button>
            {user?.role === "BUSINESS_ADMIN" && invoice.status === "DRAFT" && (
              <Button variant="outlined" onClick={() => issue.mutate()}>
                Issue invoice
              </Button>
            )}
            {user?.role === "BUSINESS_ADMIN" &&
              invoice.status !== "DRAFT" &&
              invoice.status !== "CANCELLED" &&
              Number(invoice.balance) > 0 && (
                <Button
                  variant="contained"
                  startIcon={<Payment />}
                  onClick={() => {
                    setAmount(invoice.balance);
                    setPayOpen(true);
                  }}
                >
                  Record payment
                </Button>
              )}
          </Stack>
        }
      />
      {notice && (
        <Alert severity="success" onClose={() => setNotice("")} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {user?.role === "BUSINESS_ADMIN" && <InvoiceManagementPanel invoiceId={id} status={invoice.status} paymentStatus={invoice.paymentStatus} kraEtimsStatus={invoice.kraStatus} invoiceDiscount={invoice.invoiceLevelDiscount} dueAt={invoice.dueAt} terms={invoice.terms} notes={invoice.notes} items={invoice.items} refresh={refresh} />}
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
                  {invoice.business.logoUrl && <Box component="img" src={invoice.business.logoUrl} alt={`${invoice.business.name} logo`} sx={{ maxWidth: 180, maxHeight: 72, objectFit: "contain", mb: 1 }} />}
                  <Typography variant="h5">{invoice.business.name}</Typography>
                  <Typography color="text.secondary">
                    {invoice.business.address}
                    <br />
                    {invoice.business.email} · {invoice.business.phone}
                  </Typography>
                  {invoice.business.taxPin && <Typography variant="caption">KRA PIN: {invoice.business.taxPin}</Typography>}
                </Box>
                <Box textAlign={{ sm: "right" }}>
                  <StatusChip status={invoice.status} />
                  <Typography mt={1} variant="body2">
                    Issued {new Date(invoice.createdAt).toLocaleDateString()}
                  </Typography>
                  {invoice.dueAt && (
                    <Typography variant="body2">
                      Due {new Date(invoice.dueAt).toLocaleDateString()}
                    </Typography>
                  )}
                </Box>
              </Stack>
              <Divider sx={{ my: 3 }} />
              <DataTable
                columns={[
                  "Description",
                  "Quantity",
                  "Unit price",
                  "Tax",
                  "Discount",
                  "Total",
                ]}
                rows={invoice.items.map((line) => [
                  line.description,
                  Number(line.quantity),
                  `KES ${Number(line.unitPrice).toLocaleString()}`,
                  `${Number(line.taxRate)}%`,
                  `KES ${Number(line.discount).toLocaleString()}`,
                  <strong>
                    KES {Number(line.lineTotal).toLocaleString()}
                  </strong>,
                ])}
              />
              <Stack alignItems="flex-end" spacing={1} mt={3}>
                <KeyValue
                  label="Subtotal"
                  value={`KES ${Number(invoice.subtotal).toLocaleString()}`}
                />
                <KeyValue
                  label="Tax"
                  value={`KES ${Number(invoice.taxAmount).toLocaleString()}`}
                />
                <KeyValue
                  label="Discount"
                  value={`KES ${Number(invoice.discountAmount).toLocaleString()}`}
                />
                <Typography variant="h5">
                  Total KES {Number(invoice.total).toLocaleString()}
                </Typography>
              </Stack>
              {invoice.terms && (
                <Alert severity="info" sx={{ mt: 3 }}>
                  {invoice.terms}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6">Payment summary</Typography>
              <Stack spacing={2} mt={2}>
                <KeyValue
                  label="Invoice status"
                  value={<StatusChip status={invoice.paymentStatus} />}
                />
                <KeyValue
                  label="Paid"
                  value={`KES ${Number(invoice.amountPaid).toLocaleString()}`}
                />
                <KeyValue
                  label="Balance"
                  value={`KES ${Number(invoice.balance).toLocaleString()}`}
                />
              </Stack>
              {user?.role === "BUSINESS_ADMIN" && (
                <Button
                  fullWidth
                  startIcon={<Email />}
                  sx={{ mt: 3 }}
                  onClick={() => email.mutate()}
                  disabled={email.isPending}
                >
                  Email invoice
                </Button>
              )}
            </CardContent>
          </Card>
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6">Payments & receipts</Typography>
              {invoice.payments.length ? (
                invoice.payments.map((entry) => (
                  <Box
                    key={entry.id}
                    py={2}
                    borderBottom={1}
                    borderColor="divider"
                  >
                    <Stack direction="row" justifyContent="space-between">
                      <Typography fontWeight={700}>{entry.number}</Typography>
                      <Typography fontWeight={800}>
                        KES {Number(entry.amount).toLocaleString()}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {entry.method} · {new Date(entry.paidAt).toLocaleString()}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Typography color="text.secondary" mt={2}>
                  No payments recorded.
                </Typography>
              )}
              {invoice.receipts.map((receipt) => (
                <Button
                  key={receipt.id}
                  size="small"
                  startIcon={<Download />}
                  onClick={() =>
                    void downloadFile(
                      `/invoices/receipts/${receipt.id}/pdf?paperWidth=${paperWidth}`,
                      `${receipt.number}-${paperWidth}.pdf`,
                    )
                  }
                >
                  {receipt.number} receipt
                </Button>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <FormDialog
        open={payOpen}
        title="Record payment"
        busy={payment.isPending}
        error={payment.error ? apiMessage(payment.error) : undefined}
        onClose={() => setPayOpen(false)}
        onSubmit={() => payment.mutate()}
        submitLabel="Record and issue receipt"
      >
        <TextField
          required
          type="number"
          label="Amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">KES</InputAdornment>
            ),
          }}
          helperText={`Maximum: KES ${Number(invoice.balance).toLocaleString()}`}
        />
        <TextField
          select
          label="Method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          {["CASH", "CARD", "BANK_TRANSFER", "MPESA", "OTHER"].map((value) => (
            <MenuItem key={value} value={value}>
              {value.replaceAll("_", " ")}
            </MenuItem>
          ))}
        </TextField>
        {method === "OTHER" && (
          <TextField
            required
            label="Custom payment method"
            value={customMethod}
            onChange={(event) => setCustomMethod(event.target.value)}
          />
        )}
        <TextField
          label="Transaction reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
        <TextField
          select
          label="Receipt format"
          value={paperWidth}
          onChange={(event) => setPaperWidth(event.target.value)}
        >
          {["A4", "80mm", "58mm"].map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </TextField>
      </FormDialog>
    </>
  );
}

interface ReportData {
  repairsToday: number;
  statuses: Record<string, number>;
  customers: number;
  technicians: number;
  revenueToday: number;
  revenueMonth: number;
  outstanding: { count: number; amount: number };
  lowStock: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    minimumStock: number;
  }[];
  monthlyRepairs: { month: string; count: number }[];
  monthlyRevenue: { month: string; total: number }[];
}
interface AnalyticsData {
  from: string;
  to: string;
  repairsByStatus: { status: string; count: number }[];
  repairsByDevice: { device: string; count: number }[];
  technicianPerformance: {
    id: string;
    name: string;
    assigned: number;
    completed: number;
  }[];
  invoices: {
    status: string;
    paymentStatus: string;
    count: number;
    total: number;
    balance: number;
  }[];
  payments: { method: string; count: number; amount: number }[];
  topParts: { id?: string; name?: string; sku?: string; quantity: number }[];
}
interface ProfitData { from: string; to: string; revenue: number; partsRevenue: number; labourRevenue: number; costOfParts: number; grossProfit: number; utilityCosts: number; otherBusinessCosts: number; operatingExpenses: number; operatingProfit: number; profitMarginPercent: number; methodology: "CASH_BASIS" }
export function ReportsPage() {
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(() => {
    const value = new Date();
    value.setFullYear(value.getFullYear() - 1);
    return value.toISOString().slice(0, 10);
  });
  const query = useQuery({
    queryKey: ["reports"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<ReportData>>("/reports/dashboard")).data.data,
  });
  const analytics = useQuery({
    queryKey: ["report-analytics", from, to],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<AnalyticsData>>("/reports/analytics", {
          params: { from, to },
        })
      ).data.data,
  });
  const profit = useQuery({ queryKey: ["profit-report", from, to], queryFn: async () => (await api.get<ApiEnvelope<ProfitData>>("/reports/profit", { params: { from, to } })).data.data });
  if (query.isLoading || analytics.isLoading || profit.isLoading) return <LoadingBlock />;
  if (query.error || analytics.error || profit.error || !query.data || !analytics.data || !profit.data)
    return <ErrorBlock message={apiMessage(query.error ?? analytics.error ?? profit.error)} />;
  const data = query.data;
  const detail = analytics.data;
  const finances = profit.data;
  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational and financial summaries calculated from current tenant data."
        actions={
          <Button
            variant="contained"
            startIcon={<Download />}
            onClick={() =>
              void downloadFile("/reports/repairs.csv", "repair-report.csv")
            }
          >
            Export repair CSV
          </Button>
        }
      />
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            type="date"
            label="From"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            label="To"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      </Paper>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12 }}><Alert severity="info">Profit uses cash-basis accounting for this period: payments received minus historical parts cost and recorded operating expenses. It is an operational report, not audited tax advice.</Alert></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Card><CardContent><KeyValue label="Cash revenue" value={`KES ${finances.revenue.toLocaleString()}`} /></CardContent></Card></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Card><CardContent><KeyValue label="Gross profit" value={`KES ${finances.grossProfit.toLocaleString()}`} /></CardContent></Card></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Card><CardContent><KeyValue label="Operating expenses" value={`KES ${finances.operatingExpenses.toLocaleString()}`} /></CardContent></Card></Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Card><CardContent><KeyValue label="Operating profit" value={`KES ${finances.operatingProfit.toLocaleString()} (${finances.profitMarginPercent}%)`} /></CardContent></Card></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><Card><CardContent><Typography variant="h6" mb={2}>Revenue composition</Typography><DataTable columns={["Category", "Amount"]} rows={[["Labour", `KES ${finances.labourRevenue.toLocaleString()}`], ["Parts", `KES ${finances.partsRevenue.toLocaleString()}`], ["Other paid revenue", `KES ${Math.max(finances.revenue - finances.labourRevenue - finances.partsRevenue, 0).toLocaleString()}`]]} /></CardContent></Card></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><Card><CardContent><Typography variant="h6" mb={2}>Cost composition</Typography><DataTable columns={["Category", "Amount"]} rows={[["Historical parts cost", `KES ${finances.costOfParts.toLocaleString()}`], ["Utilities", `KES ${finances.utilityCosts.toLocaleString()}`], ["Other business costs", `KES ${finances.otherBusinessCosts.toLocaleString()}`]]} /></CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <KeyValue
                label="Revenue this month"
                value={`KES ${data.revenueMonth.toLocaleString()}`}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <KeyValue
                label="Outstanding invoices"
                value={`${data.outstanding.count} · KES ${data.outstanding.amount.toLocaleString()}`}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <KeyValue label="Low stock alerts" value={data.lowStock.length} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Repairs by month
              </Typography>
              <DataTable
                columns={["Month", "Repairs"]}
                rows={data.monthlyRepairs.map((item) => [
                  item.month,
                  item.count,
                ])}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Revenue by month
              </Typography>
              <DataTable
                columns={["Month", "Revenue"]}
                rows={data.monthlyRevenue.map((item) => [
                  item.month,
                  `KES ${item.total.toLocaleString()}`,
                ])}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Repairs by status
              </Typography>
              <DataTable
                columns={["Status", "Repairs"]}
                rows={detail.repairsByStatus.map((item) => [
                  <StatusChip status={item.status} />,
                  item.count,
                ])}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Repairs by device
              </Typography>
              <DataTable
                columns={["Device", "Repairs"]}
                rows={detail.repairsByDevice.map((item) => [
                  item.device,
                  item.count,
                ])}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Technician performance
              </Typography>
              <DataTable
                columns={[
                  "Technician",
                  "Assigned",
                  "Completed",
                  "Completion rate",
                ]}
                rows={detail.technicianPerformance.map((item) => [
                  item.name,
                  item.assigned,
                  item.completed,
                  `${item.assigned ? Math.round((item.completed / item.assigned) * 100) : 0}%`,
                ])}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Invoice report
              </Typography>
              <DataTable
                columns={["Status", "Payment", "Count", "Total", "Balance"]}
                rows={detail.invoices.map((item) => [
                  item.status,
                  item.paymentStatus,
                  item.count,
                  `KES ${item.total.toLocaleString()}`,
                  `KES ${item.balance.toLocaleString()}`,
                ])}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Payments by method
              </Typography>
              <DataTable
                columns={["Method", "Count", "Amount"]}
                rows={detail.payments.map((item) => [
                  item.method.replaceAll("_", " "),
                  item.count,
                  `KES ${item.amount.toLocaleString()}`,
                ])}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Most-used parts
              </Typography>
              {detail.topParts.length ? (
                <DataTable
                  columns={["Part", "SKU", "Quantity"]}
                  rows={detail.topParts.map((item) => [
                    item.name ?? "Deleted item",
                    item.sku ?? "—",
                    item.quantity,
                  ])}
                />
              ) : (
                <Typography color="text.secondary">
                  No part usage in this period.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}

interface SearchGroup {
  type: string;
  items: Record<string, string>[];
}
export function GlobalSearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const query = useQuery({
    queryKey: ["global-search", q],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<SearchGroup[]>>("/reports/search", {
          params: { q },
        })
      ).data.data,
    enabled: q.length >= 2,
  });
  const links: Record<string, (item: Record<string, string>) => string> = {
    repair: (item) => `/repairs/${item.id}`,
    customer: (item) => `/customers/${item.id}`,
    device: () => "/devices",
    inventory: () => "/inventory",
    invoice: (item) => `/invoices/${item.id}`,
    receipt: (item) => `/invoices/${item.invoiceId}`,
    user: () => "/technicians",
  };
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={apiMessage(query.error)} />;
  const groups = query.data ?? [];
  return (
    <>
      <PageHeader
        title={`Search results for “${q}”`}
        description="Matches are restricted to your business workspace."
      />
      {groups.every((group) => group.items.length === 0) ? (
        <EmptyState
          title="No matches"
          description="Try a reference, name, phone, device, serial number, IMEI, SKU, invoice, receipt, or technician."
        />
      ) : (
        <Grid container spacing={2}>
          {groups
            .filter((group) => group.items.length)
            .map((group) => (
              <Grid key={group.type} size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="overline">{group.type}</Typography>
                    <Stack mt={1}>
                      {group.items.map((item) => (
                        <Button
                          key={item.id}
                          component={Link}
                          to={links[group.type]?.(item) ?? "/"}
                          sx={{ justifyContent: "space-between" }}
                        >
                          {item.reference ??
                            item.fullName ??
                            item.name ??
                            item.number ??
                            `${item.brand} ${item.model}`}
                          <span>
                            {item.status ??
                              item.phone ??
                              item.sku ??
                              item.email ??
                              item.serialNumber ??
                              item.imei}
                          </span>
                        </Button>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
        </Grid>
      )}
    </>
  );
}
