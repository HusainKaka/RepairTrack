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
  amountPaid?: string;
  canEditInvoice?: boolean;
  kraEtimsStatus?: string;
  kraEnabled?: boolean;
  manualDigital?: boolean;
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

const maxMoneyCents = 999_999_999_999;
const maxMoney = maxMoneyCents / 100;
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const twoDecimals = (value: number) => Number(value.toFixed(2)) === value;
interface InvoiceAmounts { quantity: number; unitPrice: number; taxRate: number; discount: number }

/** Preview and validate the same discounted-tax base used by the billing API. */
export function invoiceAmountPreview(items: InvoiceAmounts[], invoiceDiscount = 0): { valid: true; total: number } | { valid: false; message: string } {
  const invalid = (message: string): { valid: false; message: string } => ({ valid: false, message });
  if (!items.length || items.length > 100) return invalid("An invoice requires between one and 100 lines.");
  if (!Number.isFinite(invoiceDiscount) || invoiceDiscount < 0 || invoiceDiscount > maxMoney || !twoDecimals(invoiceDiscount)) return invalid("Enter an invoice discount between 0 and 9,999,999,999.99, with at most two decimal places.");
  let subtotalCents = 0;
  let taxCents = 0;
  let discountCents = 0;
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 10_000 || !twoDecimals(item.quantity)) return invalid("Quantity must be greater than 0 and no more than 10,000, with at most two decimal places.");
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0 || item.unitPrice > maxMoney || !twoDecimals(item.unitPrice)) return invalid("Enter a unit price between 0 and 9,999,999,999.99, with at most two decimal places.");
    if (!Number.isFinite(item.taxRate) || item.taxRate < 0 || item.taxRate > 100 || !twoDecimals(item.taxRate)) return invalid("Tax must be between 0 and 100%, with at most two decimal places.");
    if (!Number.isFinite(item.discount) || item.discount < 0 || item.discount > maxMoney || !twoDecimals(item.discount)) return invalid("Enter a line discount between 0 and 9,999,999,999.99, with at most two decimal places.");
    const gross = cents(item.quantity * item.unitPrice);
    const discount = cents(item.discount);
    if (!Number.isSafeInteger(gross) || gross > maxMoneyCents) return invalid("A line subtotal cannot exceed 9,999,999,999.99.");
    if (discount > gross) return invalid("A line discount cannot exceed its subtotal before tax.");
    const taxable = gross - discount;
    const tax = Math.round(taxable * item.taxRate / 100);
    if (taxable + tax > maxMoneyCents) return invalid("A line total cannot exceed 9,999,999,999.99.");
    subtotalCents += gross; taxCents += tax; discountCents += discount;
    if (subtotalCents > maxMoneyCents || taxCents > maxMoneyCents || discountCents > maxMoneyCents) return invalid("Invoice amounts cannot exceed 9,999,999,999.99.");
  }
  const invoiceDiscountCents = cents(invoiceDiscount);
  const beforeDiscount = subtotalCents - discountCents + taxCents;
  if (invoiceDiscountCents > beforeDiscount) return invalid("The invoice discount cannot exceed the total after line discounts and tax.");
  if (discountCents + invoiceDiscountCents > maxMoneyCents || beforeDiscount > maxMoneyCents) return invalid("Invoice amounts cannot exceed 9,999,999,999.99.");
  return { valid: true, total: (beforeDiscount - invoiceDiscountCents) / 100 };
}

export function InvoiceManagementPanel({
  invoiceId,
  status,
  paymentStatus,
  amountPaid = "0",
  canEditInvoice,
  kraEtimsStatus,
  kraEnabled = false,
  manualDigital = false,
  invoiceDiscount = "0",
  dueAt,
  terms,
  notes,
  items,
  refresh,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editable = canEditInvoice ?? (
    ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID"].includes(status) &&
    (status !== "DRAFT" || paymentStatus === "UNPAID") &&
    (!kraEtimsStatus ||
      ["NOT_REQUIRED", "PENDING", "FAILED"].includes(kraEtimsStatus)));
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
  const [changeReason, setChangeReason] = useState("");
  const issued = status !== "DRAFT";
  const reasonValid = !issued || changeReason.trim().length >= 3;
  const canVoid = editable && ["DRAFT", "ISSUED"].includes(status) && paymentStatus === "UNPAID";
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<InventoryItem[]>>("/inventory")).data.data,
    enabled: editable && !manualDigital && itemOpen,
  });
  const selectedInventory = inventory.data?.find((item) => item.id === line.inventoryItemId);
  const candidateLine = {
    quantity: Number(line.quantity),
    unitPrice: line.itemType === "INVENTORY" && !line.unitPrice ? Number(selectedInventory?.sellingPrice) : Number(line.unitPrice),
    taxRate: Number(line.taxRate),
    discount: Number(line.discount),
  };
  const linePreview = invoiceAmountPreview([
    ...items.filter((item) => item.id !== editing?.id).map((item) => ({ quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), taxRate: Number(item.taxRate), discount: Number(item.discount) })),
    candidateLine,
  ], Number(invoiceDiscount));
  const completeLine = line.itemType === "INVENTORY" ? Boolean(selectedInventory) : Boolean(line.description.trim() && line.unitPrice.trim());
  const settingsPreview = invoiceAmountPreview(items.map((item) => ({ quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), taxRate: Number(item.taxRate), discount: Number(item.discount) })), Number(settings.invoiceDiscount));
  const saveLine = useMutation({
    mutationFn: () => {
      const payload = {
        itemType: line.itemType,
        changeReason: issued ? changeReason.trim() : undefined,
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
        changeReason: issued ? changeReason.trim() : undefined,
      }),
    onSuccess: async () => {
      setSettingsOpen(false);
      await refresh();
    },
  });
  const deleteLine = useMutation({
    mutationFn: () =>
      api.delete(`/invoices/${invoiceId}/items/${removeItem!.id}`, { data: { changeReason: issued ? changeReason.trim() : undefined } }),
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
    setChangeReason("");
    saveLine.reset();
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
  if (!editable && !canVoid)
    return (
      <>
        {notice && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {notice}
          </Alert>
        )}
        {["ISSUED", "PARTIALLY_PAID", "PAID"].includes(status) && <Alert severity="info" sx={{ mb: 3 }}>{kraEnabled ? "This invoice has been submitted or confirmed by eTIMS. Use the configured adjustment process rather than editing it directly." : "This invoice is finalized and cannot be edited directly. Contact the administrator about the supported adjustment process."}</Alert>}
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
              {issued ? "Amend charges, discounts, due date and terms. A reason is recorded; payments and the invoice number are preserved. Resend the revised invoice after saving." : manualDigital ? "Manual project charges, discounts, and safe deletion are audited." : "Draft editing, inventory links, discounts, and safe deletion are audited."}
            </Typography>
          </div>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {editable && (
              <>
                <Button
                  startIcon={<Add />}
                  onClick={() => {
                    setEditing(null);
                    setChangeReason("");
                    saveLine.reset();
                    setLine(emptyItem);
                    setItemOpen(true);
                  }}
                >
                  Add line
                </Button>
                <Button
                  startIcon={<EditOutlined />}
                  variant="outlined"
                  onClick={() => { setSettings({ invoiceDiscount, dueAt: dueAt ? new Date(new Date(dueAt).getTime() - new Date(dueAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "", terms: terms ?? "", notes: notes ?? "" }); setChangeReason(""); saveSettings.reset(); setSettingsOpen(true); }}
                >
                  Edit invoice
                </Button>
              </>
            )}
            {kraEnabled && status === "ISSUED" && kraEtimsStatus === "PENDING" && (
              <Button
                startIcon={<GavelOutlined />}
                onClick={() => kra.mutate()}
                disabled={kra.isPending}
              >
                Submit to eTIMS
              </Button>
            )}
            {canVoid && <Button
              color="error"
              startIcon={<DeleteOutline />}
              onClick={() => setInvoiceDeleteOpen(true)}
            >
              {status === "DRAFT" ? "Delete draft" : "Void invoice"}
            </Button>}
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700} title={item.description} sx={{ overflowWrap: "break-word", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}>{item.description}</Typography>
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
                      onClick={() => { setChangeReason(""); deleteLine.reset(); setRemoveItem(item); }}
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
          submitDisabled={!completeLine || !linePreview.valid || !reasonValid || (linePreview.valid && linePreview.total < Number(amountPaid))}
        >
          <TextField
            select
            label="Item type"
            value={line.itemType}
            onChange={(event) =>
              setLine({ ...line, itemType: event.target.value })
            }
          >
            {(manualDigital ? ["CUSTOM", "SERVICE"] : ["CUSTOM", "LABOUR", "SERVICE", "INVENTORY"]).map((value) => (
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
              slotProps={{ htmlInput: { min: 0.01, max: 10000, step: 0.01 } }}
              value={line.quantity}
              onChange={(event) =>
                setLine({ ...line, quantity: event.target.value })
              }
            />
            <TextField
              fullWidth
              type="number"
              label="Unit price"
              slotProps={{ htmlInput: { min: 0, max: maxMoney, step: 0.01 } }}
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
              slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }}
              value={line.taxRate}
              onChange={(event) =>
                setLine({ ...line, taxRate: event.target.value })
              }
            />
            <TextField
              fullWidth
              type="number"
              label="Line discount"
              slotProps={{ htmlInput: { min: 0, max: maxMoney, step: 0.01 } }}
              value={line.discount}
              onChange={(event) =>
                setLine({ ...line, discount: event.target.value })
              }
            />
          </Stack>
          <Alert severity={linePreview.valid ? "info" : "warning"}>
            {linePreview.valid ? `Estimated invoice total: KES ${linePreview.total.toLocaleString()}` : linePreview.message}
          </Alert>
          {issued && <TextField required label="Reason for change" value={changeReason} onChange={event => setChangeReason(event.target.value)} slotProps={{ htmlInput: { minLength: 3, maxLength: 500 } }} helperText="Recorded in the audit trail for this issued invoice." />}
          {linePreview.valid && linePreview.total < Number(amountPaid) && <Alert severity="warning">The revised total cannot be below KES {Number(amountPaid).toLocaleString()} already paid. A credit/refund must be recorded first.</Alert>}
        </FormDialog>
        <FormDialog
          open={settingsOpen}
          title={issued ? "Update issued invoice" : "Edit draft invoice"}
          busy={saveSettings.isPending}
          error={
            saveSettings.error ? apiMessage(saveSettings.error) : undefined
          }
          onClose={() => setSettingsOpen(false)}
          onSubmit={() => saveSettings.mutate()}
          submitDisabled={!settingsPreview.valid || !reasonValid || (settingsPreview.valid && settingsPreview.total < Number(amountPaid))}
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
            slotProps={{ htmlInput: { min: 0, max: maxMoney, step: 0.01 } }}
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
          <Alert severity={settingsPreview.valid ? "info" : "warning"}>
            {settingsPreview.valid ? `Estimated invoice total: KES ${settingsPreview.total.toLocaleString()}` : settingsPreview.message}
          </Alert>
          {issued && <TextField required label="Reason for change" value={changeReason} onChange={event => setChangeReason(event.target.value)} slotProps={{ htmlInput: { minLength: 3, maxLength: 500 } }} helperText="Recorded with the previous and revised totals and discount." />}
          {settingsPreview.valid && settingsPreview.total < Number(amountPaid) && <Alert severity="warning">The revised total cannot be below KES {Number(amountPaid).toLocaleString()} already paid. A credit/refund must be recorded first.</Alert>}
        </FormDialog>
        <FormDialog
          open={Boolean(removeItem)}
          title="Remove invoice line"
          busy={deleteLine.isPending}
          error={deleteLine.error ? apiMessage(deleteLine.error) : undefined}
          onClose={() => setRemoveItem(null)}
          onSubmit={() => deleteLine.mutate()}
          submitLabel="Remove line"
          submitDisabled={!reasonValid}
        >
          <Alert severity="warning">
            Remove “{removeItem?.description}”? At least one item must remain on
            the invoice.
          </Alert>
          {issued && <TextField required label="Reason for change" value={changeReason} onChange={event => setChangeReason(event.target.value)} slotProps={{ htmlInput: { minLength: 3, maxLength: 500 } }} />}
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
            {kraEnabled ? "Paid invoices and confirmed eTIMS submissions cannot be deleted." : "Paid invoices and finalized records cannot be deleted."}
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
