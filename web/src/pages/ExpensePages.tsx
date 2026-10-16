import Add from "@mui/icons-material/Add";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Download from "@mui/icons-material/Download";
import EditOutlined from "@mui/icons-material/EditOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { DataTable, FormDialog, KeyValue } from "../components/DataViews";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { repairDate, sentenceCase } from "../components/repair/repairPresentation";
import type { ApiEnvelope } from "../types";

const categories = [
  "RENT",
  "ELECTRICITY",
  "WATER",
  "INTERNET",
  "TELEPHONE",
  "GAS",
  "SALARIES",
  "MARKETING",
  "TRANSPORT",
  "SOFTWARE",
  "MAINTENANCE",
  "OFFICE_SUPPLIES",
  "TAX",
  "OTHER",
] as const;
const utilityCategories = new Set([
  "ELECTRICITY",
  "WATER",
  "INTERNET",
  "TELEPHONE",
  "GAS",
]);
interface Expense {
  id: string;
  category: string;
  description: string;
  supplier?: string;
  amount: string;
  expenseDate: string;
  reference?: string;
  notes?: string;
  attachmentUrl?: string;
  recurring: boolean;
  createdBy?: { fullName: string };
}
interface ExpenseResponse {
  items: Expense[];
  total: number;
  monthlyTotals: { month: string; total: number }[];
}
const empty = {
  category: "ELECTRICITY",
  description: "",
  supplier: "",
  amount: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  reference: "",
  notes: "",
  attachmentUrl: "",
  recurring: false,
};

async function downloadExpenses(from: string, to: string) {
  const response = await api.get<Blob>("/expenses/export.csv", {
    params: { from, to },
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "repairtrack-expenses.csv";
  try { link.click(); } finally { URL.revokeObjectURL(url); }
}

export function ExpensesPage() {
  const { user } = useAuth();
  const admin = user?.role === "BUSINESS_ADMIN";
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 5, 1);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [utilityOnly, setUtilityOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [remove, setRemove] = useState<Expense | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["expenses", from, to, utilityOnly],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<ExpenseResponse>>("/expenses", {
          params: { from, to, utility: utilityOnly || undefined },
        })
      ).data.data,
    enabled: admin,
  });
  const download = useMutation({ mutationFn: () => downloadExpenses(from, to), onSuccess: () => setNotice("Expense CSV prepared for download. It includes all categories in the selected date range.") });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        amount: Number(form.amount),
        expenseDate: new Date(
          `${form.expenseDate}T12:00:00.000Z`,
        ).toISOString(),
        supplier: form.supplier || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        attachmentUrl: form.attachmentUrl || undefined,
      };
      return editing
        ? api.patch(`/expenses/${editing.id}`, payload)
        : api.post("/expenses", payload);
    },
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      setForm(empty);
      setNotice(editing ? "Expense changes saved." : "Expense recorded.");
      await refresh();
    },
  });
  const deletion = useMutation({
    mutationFn: () =>
      api.delete(`/expenses/${remove!.id}`, { data: { reason } }),
    onSuccess: async () => {
      setRemove(null);
      setReason("");
      setNotice("Expense voided. The audit record has been preserved.");
      await refresh();
    },
  });
  if (!admin) return <ErrorBlock message="Costs and utilities are available to the business administrator." />;
  if (query.isLoading) return <LoadingBlock label="Loading operating costs" />;
  if (query.error || !query.data)
    return <ErrorBlock message={apiMessage(query.error)} retry={() => void query.refetch()} />;
  const data = query.data;
  const utilities = data.items.filter((item) =>
    utilityCategories.has(item.category),
  );
  const openEdit = (item: Expense) => {
    save.reset();
    setEditing(item);
    setForm({
      category: item.category,
      description: item.description,
      supplier: item.supplier ?? "",
      amount: item.amount,
      expenseDate: item.expenseDate.slice(0, 10),
      reference: item.reference ?? "",
      notes: item.notes ?? "",
      attachmentUrl: item.attachmentUrl ?? "",
      recurring: item.recurring,
    });
    setFormOpen(true);
  };
  return (
    <>
      <PageHeader
        title="Costs & utilities"
        description="Record operating expenses and utility bills for cash-basis profit reporting."
        actions={
          <Stack direction="row" flexWrap="wrap" gap={1}>
            <Button
              startIcon={<Download />}
              disabled={download.isPending}
              onClick={() => download.mutate()}
            >
              {download.isPending ? "Preparing CSV…" : "Export CSV"}
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                setEditing(null);
                save.reset();
                setForm(empty);
                setFormOpen(true);
              }}
            >
              Add expense
            </Button>
          </Stack>
        }
      />
      {notice && <Alert severity="success" role="status" onClose={() => setNotice("")} sx={{ mb: 2 }}>{notice}</Alert>}
      {download.error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => download.mutate()} disabled={download.isPending}>Try again</Button>}>CSV could not be prepared. {apiMessage(download.error)}</Alert>}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
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
          <Button
            aria-pressed={utilityOnly}
            variant={utilityOnly ? "contained" : "outlined"}
            onClick={() => setUtilityOnly((value) => !value)}
          >
            {utilityOnly ? "Showing utilities" : "Show utilities only"}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" mt={2} role="status">{query.isPlaceholderData ? "Updating the selected range. Figures still describe the previous loaded view." : <>Totals describe up to 500 loaded entries in this range{utilityOnly ? ", restricted to utilities" : ""}.</>} CSV export includes all categories in the date range, even when the utility filter is on.</Typography>
        {from && to && from > to && <Alert severity="warning" sx={{ mt: 2 }}>The start date is after the end date. Choose a valid reporting range.</Alert>}
        {query.isFetching && <LinearProgress aria-label="Refreshing expenses" sx={{ mt: 2 }} />}
      </Paper>
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}><Grid container spacing={3}><Grid size={{ xs: 12, sm: 6, md: 4 }}><KeyValue label="Cost in loaded entries" value={`KES ${data.total.toLocaleString()}`} /></Grid><Grid size={{ xs: 6, md: 4 }}><KeyValue label="Loaded entries" value={data.items.length} /></Grid><Grid size={{ xs: 6, md: 4 }}><KeyValue label="Utility entries" value={utilities.length} /></Grid></Grid></Paper>
      {data.items.length ? (
        <DataTable
          caption="Operating costs · selected date range"
          rowKeys={data.items.map((item) => item.id)}
          mobileSummaryColumns={[2, 4]}
          columns={[
            "Date",
            "Category",
            "Description",
            "Supplier",
            "Amount",
            "Recurring label",
            "Actions",
          ]}
          rows={data.items.map((item) => [
            repairDate(item.expenseDate),
            sentenceCase(item.category),
            item.description,
            item.supplier ?? "—",
            `KES ${Number(item.amount).toLocaleString()}`,
            item.recurring ? "Recurring label" : "One-off",
            <Stack direction="row">
              <Tooltip title="Edit">
                <IconButton aria-label={`Edit expense: ${item.description}`} onClick={() => openEdit(item)}>
                  <EditOutlined />
                </IconButton>
              </Tooltip>
              <Tooltip title="Void">
                <IconButton aria-label={`Void expense: ${item.description}`} color="error" onClick={() => { deletion.reset(); setReason(""); setRemove(item); }}>
                  <DeleteOutline />
                </IconButton>
              </Tooltip>
            </Stack>,
          ])}
        />
      ) : (
        <EmptyState
          title="No expenses in this period"
          description="Add rent, utilities, salaries, software, transport, or other business costs."
        />
      )}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" mb={2}>
            Monthly cost trend
          </Typography>
          {data.monthlyTotals.length ? (
            <DataTable
              caption="Monthly totals from the loaded expense entries"
              rowKeys={data.monthlyTotals.map((item) => item.month)}
              columns={["Month", "Total cost"]}
              rows={data.monthlyTotals.map((item) => [
                item.month,
                `KES ${item.total.toLocaleString()}`,
              ])}
            />
          ) : (
            <Typography color="text.secondary">
              No monthly data available.
            </Typography>
          )}
        </CardContent>
      </Card>
      <FormDialog
        open={formOpen}
        title={editing ? "Edit expense" : "Add expense"}
        busy={save.isPending}
        error={save.error ? apiMessage(save.error) : undefined}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setForm(empty);
        }}
        onSubmit={() => save.mutate()}
        submitLabel={editing ? "Save changes" : "Add expense"}
        description="Record an operating cost. Recurring is a reporting label, not an instruction to schedule a payment."
      >
        <Box><Typography variant="h6" component="h2">Expense details</Typography><Typography variant="body2" color="text.secondary">Category, amount and the date this cost was recorded.</Typography></Box>
        <TextField
          select
          label="Category"
          value={form.category}
          onChange={(event) =>
            setForm({ ...form, category: event.target.value })
          }
        >
          {categories.map((item) => (
            <MenuItem key={item} value={item}>
              {sentenceCase(item)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          required
          label="Description"
          inputProps={{ minLength: 2, maxLength: 300 }}
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
        <TextField
          label="Supplier"
          inputProps={{ maxLength: 160 }}
          value={form.supplier}
          onChange={(event) =>
            setForm({ ...form, supplier: event.target.value })
          }
        />
        <TextField
          required
          type="number"
          label="Amount (KES)"
          inputProps={{ min: 0, max: 100000000 }}
          value={form.amount}
          onChange={(event) => setForm({ ...form, amount: event.target.value })}
        />
        <TextField
          required
          type="date"
          label="Expense date"
          value={form.expenseDate}
          onChange={(event) =>
            setForm({ ...form, expenseDate: event.target.value })
          }
          InputLabelProps={{ shrink: true }}
        />
        <Divider /><Typography variant="subtitle2" component="h2">Supporting information</Typography>
        <TextField
          label="Reference"
          inputProps={{ maxLength: 160 }}
          value={form.reference}
          onChange={(event) =>
            setForm({ ...form, reference: event.target.value })
          }
        />
        <TextField
          label="HTTPS attachment URL"
          type="url"
          inputProps={{ pattern: "https://.*" }}
          value={form.attachmentUrl}
          onChange={(event) =>
            setForm({ ...form, attachmentUrl: event.target.value })
          }
        />
        <TextField
          multiline
          minRows={2}
          label="Notes"
          inputProps={{ maxLength: 2000 }}
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
        <FormControlLabel control={<Switch inputProps={{ role: "switch" }} checked={form.recurring} onChange={(event) => setForm({ ...form, recurring: event.target.checked })} />} label="Label this as a recurring expense" />
        <Typography variant="caption" color="text.secondary">This label does not create future expenses or initiate automatic payments.</Typography>
      </FormDialog>
      <FormDialog
        open={Boolean(remove)}
        title="Void expense"
        busy={deletion.isPending}
        error={deletion.error ? apiMessage(deletion.error) : undefined}
        onClose={() => setRemove(null)}
        onSubmit={() => deletion.mutate()}
        submitLabel="Void expense"
        submitDisabled={reason.trim().length < 3}
        dirty={Boolean(reason)}
      >
        <Alert severity="warning">
          This keeps an auditable record and excludes the expense from active
          totals.
        </Alert>
        <TextField
          required
          label="Reason"
          inputProps={{ minLength: 3, maxLength: 500 }}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          helperText="At least 3 characters"
        />
      </FormDialog>
    </>
  );
}
