import Add from "@mui/icons-material/Add";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import GavelOutlined from "@mui/icons-material/GavelOutlined";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import type { ApiEnvelope, InventoryItem } from "../types";
import { FormDialog } from "./DataViews";

interface Item {
  id: string;
  description: string;
  itemType?: string;
  inventoryItemId?: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discount: string;
}
interface Props {
  invoiceId: string;
  status: string;
  paymentStatus: string;
  kraEtimsStatus?: string;
  invoiceDiscount?: string;
  dueAt?: string;
  terms?: string;
  notes?: string;
  items: Item[];
  refresh(): Promise<unknown>;
}
const emptyItem = {
  itemType: "CUSTOM",
  inventoryItemId: "",
  description: "",
  quantity: "1",
  unitPrice: "0",
  taxRate: "0",
  discount: "0",
};

export function InvoiceManagementPanel({
  invoiceId,
  status,
  paymentStatus,
  kraEtimsStatus,
  invoiceDiscount = "0",
  dueAt,
  terms,
  notes,
  items,
  refresh,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editable =
    status === "DRAFT" &&
    paymentStatus === "UNPAID" &&
    (!kraEtimsStatus ||
      ["NOT_REQUIRED", "PENDING", "FAILED"].includes(kraEtimsStatus));
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [line, setLine] = useState(emptyItem);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    invoiceDiscount,
    dueAt: dueAt?.slice(0, 16) ?? "",
    terms: terms ?? "",
    notes: notes ?? "",
  });
  const [removeItem, setRemoveItem] = useState<Item | null>(null);
  const [invoiceDeleteOpen, setInvoiceDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<InventoryItem[]>>("/inventory")).data.data,
    enabled: editable,
  });
  const saveLine = useMutation({
    mutationFn: () => {
      const payload = {
        itemType: line.itemType,
        inventoryItemId:
          line.itemType === "INVENTORY" ? line.inventoryItemId : undefined,
        description: line.description || undefined,
        quantity: Number(line.quantity),
        unitPrice:
          line.itemType === "INVENTORY" && !line.unitPrice
            ? undefined
            : Number(line.unitPrice),
        taxRate: Number(line.taxRate),
        discount: Number(line.discount),
      };
      return editing
        ? api.patch(`/invoices/${invoiceId}/items/${editing.id}`, payload)
        : api.post(`/invoices/${invoiceId}/items`, payload);
    },
    onSuccess: async () => {
      setItemOpen(false);
      setEditing(null);
      setLine(emptyItem);
      await refresh();
    },
  });
  const saveSettings = useMutation({
    mutationFn: () =>
      api.patch(`/invoices/${invoiceId}`, {
        invoiceDiscount: Number(settings.invoiceDiscount),
        dueAt: settings.dueAt ? new Date(settings.dueAt).toISOString() : null,
        terms: settings.terms || null,
        notes: settings.notes || null,
      }),
    onSuccess: async () => {
      setSettingsOpen(false);
      await refresh();
    },
  });
  const deleteLine = useMutation({
    mutationFn: () =>
      api.delete(`/invoices/${invoiceId}/items/${removeItem!.id}`),
    onSuccess: async () => {
      setRemoveItem(null);
      await refresh();
    },
  });
  const deleteInvoice = useMutation({
    mutationFn: () =>
      api.delete(`/invoices/${invoiceId}`, { data: { reason } }),
    onSuccess: async (response) => {
      setInvoiceDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      const action = (response.data as { data?: { action?: string } }).data
        ?.action;
      if (action === "DELETED") void navigate("/invoices");
      else {
        setNotice(
          "The invoice was voided and its auditable history was preserved.",
        );
        await refresh();
      }
    },
  });
  const kra = useMutation({
    mutationFn: () => api.post(`/invoices/${invoiceId}/kra-submit`),
    onSuccess: async () => {
      setNotice(
        "The eTIMS adapter accepted and independently confirmed this submission.",
      );
      await refresh();
    },
  });
  const beginEdit = (item: Item) => {
    setEditing(item);
    setLine({
      itemType: item.itemType ?? "CUSTOM",
      inventoryItemId: item.inventoryItemId ?? "",
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      discount: item.discount,
    });
    setItemOpen(true);
  };
  if (!editable && status !== "ISSUED" && status !== "DRAFT")
    return (
      <>
        {notice && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {notice}
          </Alert>
        )}
      </>
    );
  return (
    <Card sx={{ mb: 3 }} variant="outlined">
      <CardContent>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          gap={2}
        >
          <div>
            <Typography variant="h6">Invoice controls</Typography>
            <Typography color="text.secondary" variant="body2">
              Draft editing, inventory links, discounts, compliance submission,
              and safe deletion are audited.
            </Typography>
          </div>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {editable && (
              <>
                <Button
                  startIcon={<Add />}
                  onClick={() => {
                    setEditing(null);
                    setLine(emptyItem);
                    setItemOpen(true);
                  }}
                >
                  Add line
                </Button>
                <Button
                  startIcon={<EditOutlined />}
                  onClick={() => setSettingsOpen(true)}
                >
                  Edit invoice
                </Button>
              </>
            )}
            {status === "ISSUED" && kraEtimsStatus === "PENDING" && (
              <Button
                startIcon={<GavelOutlined />}
                onClick={() => kra.mutate()}
                disabled={kra.isPending}
              >
                Submit to eTIMS
              </Button>
            )}
            <Button
              color="error"
              startIcon={<DeleteOutline />}
              onClick={() => setInvoiceDeleteOpen(true)}
            >
              {status === "DRAFT" ? "Delete draft" : "Void invoice"}
            </Button>
          </Stack>
        </Stack>
        {notice && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {notice}
          </Alert>
        )}
        {kra.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {apiMessage(kra.error)}
          </Alert>
        )}
        {editable && (
          <Grid container spacing={1} mt={2}>
            {items.map((item) => (
              <Grid key={item.id} size={{ xs: 12, md: 6 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  p={1.5}
                  border={1}
                  borderColor="divider"
                  borderRadius={2}
                >
                  <div style={{ flex: 1 }}>
                    <Typography fontWeight={700}>{item.description}</Typography>
                    <Typography variant="caption">
                      {item.itemType ?? "CUSTOM"} · {item.quantity} × KES{" "}
                      {Number(item.unitPrice).toLocaleString()}
                    </Typography>
                  </div>
                  <Tooltip title="Edit">
                    <IconButton onClick={() => beginEdit(item)}>
                      <EditOutlined />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove">
                    <IconButton
                      color="error"
                      onClick={() => setRemoveItem(item)}
                    >
                      <DeleteOutline />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Grid>
            ))}
          </Grid>
        )}
        <FormDialog
          open={itemOpen}
          title={editing ? "Edit invoice line" : "Add invoice line"}
          busy={saveLine.isPending}
          error={saveLine.error ? apiMessage(saveLine.error) : undefined}
          onClose={() => setItemOpen(false)}
          onSubmit={() => saveLine.mutate()}
          submitLabel={editing ? "Save line" : "Add line"}
        >
          <TextField
            select
            label="Item type"
            value={line.itemType}
            onChange={(event) =>
              setLine({ ...line, itemType: event.target.value })
            }
          >
            {["CUSTOM", "LABOUR", "SERVICE", "INVENTORY"].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          {line.itemType === "INVENTORY" && (
            <TextField
              select
              required
              label="Inventory item"
              value={line.inventoryItemId}
              onChange={(event) => {
                const item = inventory.data?.find(
                  (value) => value.id === event.target.value,
                );
                setLine({
                  ...line,
                  inventoryItemId: event.target.value,
                  description: item?.name ?? line.description,
                  unitPrice: item?.sellingPrice ?? line.unitPrice,
                });
              }}
            >
              {(inventory.data ?? []).map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name} · {item.quantity} available · KES{" "}
                  {Number(item.sellingPrice).toLocaleString()}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            required={line.itemType !== "INVENTORY"}
            label="Description"
            value={line.description}
            onChange={(event) =>
              setLine({ ...line, description: event.target.value })
            }
          />
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <TextField
              fullWidth
              type="number"
              label="Quantity"
              value={line.quantity}
              onChange={(event) =>
                setLine({ ...line, quantity: event.target.value })
              }
            />
            <TextField
              fullWidth
              type="number"
              label="Unit price"
              value={line.unitPrice}
              onChange={(event) =>
                setLine({ ...line, unitPrice: event.target.value })
              }
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
            <TextField
              fullWidth
              type="number"
              label="Tax %"
              value={line.taxRate}
              onChange={(event) =>
                setLine({ ...line, taxRate: event.target.value })
              }
            />
            <TextField
              fullWidth
              type="number"
              label="Line discount"
              value={line.discount}
              onChange={(event) =>
                setLine({ ...line, discount: event.target.value })
              }
            />
          </Stack>
        </FormDialog>
        <FormDialog
          open={settingsOpen}
          title="Edit draft invoice"
          busy={saveSettings.isPending}
          error={
            saveSettings.error ? apiMessage(saveSettings.error) : undefined
          }
          onClose={() => setSettingsOpen(false)}
          onSubmit={() => saveSettings.mutate()}
        >
          <TextField
            type="datetime-local"
            label="Due date"
            value={settings.dueAt}
            onChange={(event) =>
              setSettings({ ...settings, dueAt: event.target.value })
            }
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="number"
            label="Invoice-level discount"
            value={settings.invoiceDiscount}
            onChange={(event) =>
              setSettings({ ...settings, invoiceDiscount: event.target.value })
            }
          />
          <TextField
            multiline
            minRows={2}
            label="Customer terms"
            value={settings.terms}
            onChange={(event) =>
              setSettings({ ...settings, terms: event.target.value })
            }
          />
          <TextField
            multiline
            minRows={2}
            label="Internal invoice notes"
            value={settings.notes}
            onChange={(event) =>
              setSettings({ ...settings, notes: event.target.value })
            }
          />
        </FormDialog>
        <FormDialog
          open={Boolean(removeItem)}
          title="Remove invoice line"
          busy={deleteLine.isPending}
          error={deleteLine.error ? apiMessage(deleteLine.error) : undefined}
          onClose={() => setRemoveItem(null)}
          onSubmit={() => deleteLine.mutate()}
          submitLabel="Remove line"
        >
          <Alert severity="warning">
            Remove “{removeItem?.description}”? At least one item must remain on
            the invoice.
          </Alert>
        </FormDialog>
        <FormDialog
          open={invoiceDeleteOpen}
          title={status === "DRAFT" ? "Delete draft invoice" : "Void invoice"}
          busy={deleteInvoice.isPending}
          error={
            deleteInvoice.error ? apiMessage(deleteInvoice.error) : undefined
          }
          onClose={() => setInvoiceDeleteOpen(false)}
          onSubmit={() => deleteInvoice.mutate()}
          submitLabel={
            status === "DRAFT" ? "Delete draft" : "Void with audit record"
          }
          submitDisabled={reason.trim().length < 3}
        >
          <Alert severity="warning">
            Paid invoices and confirmed eTIMS submissions cannot be deleted.
            Issued inventory is safely returned only when allowed.
          </Alert>
          <TextField
            required
            multiline
            minRows={2}
            label="Reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormDialog>
      </CardContent>
    </Card>
  );
}
