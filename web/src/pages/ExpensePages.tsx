import Add from "@mui/icons-material/Add";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Download from "@mui/icons-material/Download";
import EditOutlined from "@mui/icons-material/EditOutlined";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, apiMessage } from "../api/client";
import { DataTable, FormDialog, KeyValue } from "../components/DataViews";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
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
  link.click();
  URL.revokeObjectURL(url);
}

export function ExpensesPage() {
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
  const query = useQuery({
    queryKey: ["expenses", from, to, utilityOnly],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<ExpenseResponse>>("/expenses", {
          params: { from, to, utility: utilityOnly || undefined },
        })
      ).data.data,
  });
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
      await refresh();
    },
  });
  const deletion = useMutation({
    mutationFn: () =>
      api.delete(`/expenses/${remove!.id}`, { data: { reason } }),
    onSuccess: async () => {
      setRemove(null);
      setReason("");
      await refresh();
    },
  });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error || !query.data)
    return <ErrorBlock message={apiMessage(query.error)} />;
  const data = query.data;
  const utilities = data.items.filter((item) =>
    utilityCategories.has(item.category),
  );
  const openEdit = (item: Expense) => {
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
          <Stack direction="row" gap={1}>
            <Button
              startIcon={<Download />}
              onClick={() => void downloadExpenses(from, to)}
            >
              Export CSV
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                setEditing(null);
                setForm(empty);
                setFormOpen(true);
              }}
            >
              Add expense
            </Button>
          </Stack>
        }
      />
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
            variant={utilityOnly ? "contained" : "outlined"}
            onClick={() => setUtilityOnly((value) => !value)}
          >
            {utilityOnly ? "Showing utilities" : "Show utilities only"}
          </Button>
        </Stack>
      </Paper>
      <Grid container spacing={2.5} mb={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <KeyValue
                label="Expenses in range"
                value={`KES ${data.total.toLocaleString()}`}
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <KeyValue label="Entries" value={data.items.length} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <KeyValue label="Utility entries" value={utilities.length} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      {data.items.length ? (
        <DataTable
          columns={[
            "Date",
            "Category",
            "Description",
            "Supplier",
            "Amount",
            "Recurring",
            "Actions",
          ]}
          rows={data.items.map((item) => [
            new Date(item.expenseDate).toLocaleDateString(),
            item.category.replaceAll("_", " "),
            item.description,
            item.supplier ?? "—",
            `KES ${Number(item.amount).toLocaleString()}`,
            item.recurring ? "Yes" : "No",
            <Stack direction="row">
              <Tooltip title="Edit">
                <IconButton onClick={() => openEdit(item)}>
                  <EditOutlined />
                </IconButton>
              </Tooltip>
              <Tooltip title="Void">
                <IconButton color="error" onClick={() => setRemove(item)}>
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
      >
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
              {item.replaceAll("_", " ")}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          required
          label="Description"
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
        <TextField
          label="Supplier"
          value={form.supplier}
          onChange={(event) =>
            setForm({ ...form, supplier: event.target.value })
          }
        />
        <TextField
          required
          type="number"
          label="Amount (KES)"
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
        <TextField
          label="Reference"
          value={form.reference}
          onChange={(event) =>
            setForm({ ...form, reference: event.target.value })
          }
        />
        <TextField
          label="HTTPS attachment URL"
          value={form.attachmentUrl}
          onChange={(event) =>
            setForm({ ...form, attachmentUrl: event.target.value })
          }
        />
        <TextField
          multiline
          minRows={2}
          label="Notes"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
        <Button
          variant={form.recurring ? "contained" : "outlined"}
          onClick={() => setForm({ ...form, recurring: !form.recurring })}
        >
          {form.recurring ? "Recurring expense" : "Mark as recurring"}
        </Button>
      </FormDialog>
      <FormDialog
        open={Boolean(remove)}
        title="Void expense"
        busy={deletion.isPending}
        error={deletion.error ? apiMessage(deletion.error) : undefined}
        onClose={() => setRemove(null)}
        onSubmit={() => deletion.mutate()}
        submitLabel="Void expense"
      >
        <Alert severity="warning">
          This keeps an auditable record and excludes the expense from active
          totals.
        </Alert>
        <TextField
          required
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          helperText="At least 3 characters"
        />
      </FormDialog>
    </>
  );
}
