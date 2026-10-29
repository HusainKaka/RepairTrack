import ArrowBack from "@mui/icons-material/ArrowBack";
import DeleteForever from "@mui/icons-material/DeleteForever";
import Edit from "@mui/icons-material/Edit";
import MarkEmailRead from "@mui/icons-material/MarkEmailRead";
import Search from "@mui/icons-material/Search";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { BrandLogo } from "../components/BrandLogo";
import { DataTable, FormDialog, KeyValue } from "../components/DataViews";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { ReviewSettingsPanel } from "../components/ReviewSettingsPanel";
import type {
  ApiEnvelope,
  AuditLog,
  Customer,
  Device,
  Invoice,
  Notification,
  Repair,
} from "../types";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useQuery({
    queryKey: ["notifications", category, unreadOnly],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<Notification[]>>("/notifications", {
          params: { category: category || undefined, unread: unreadOnly || undefined },
        })
      ).data.data,
  });
  const read = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
    },
  });
  const readAll = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notification-unread-count"] });
    },
  });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={apiMessage(query.error)} retry={() => void query.refetch()} />;
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Repair updates and account events delivered to this user."
        actions={<Button startIcon={<MarkEmailRead />} onClick={() => readAll.mutate()} disabled={readAll.isPending || read.isPending || !query.data?.some((item) => !item.readAt)}>Mark all read</Button>}
      />
      {(read.error || readAll.error) && <Alert severity="error" sx={{ mb: 2 }}>{apiMessage(read.error ?? readAll.error)} The read status could not be confirmed. Try again.</Alert>}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
          <TextField select label="Category" value={category} onChange={(event) => setCategory(event.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="">All categories</MenuItem>
            {["REPAIR", "INVOICE", "PAYMENT", "SUBSCRIPTION", "SYSTEM", "CUSTOMER_RESPONSE"].map((value) => <MenuItem key={value} value={value}>{value.replaceAll("_", " ")}</MenuItem>)}
          </TextField>
          <Button variant={unreadOnly ? "contained" : "outlined"} onClick={() => setUnreadOnly((value) => !value)}>{unreadOnly ? "Unread only" : "Show unread only"}</Button>
        </Stack>
      </Paper>
      {query.data?.length ? (
        <Stack spacing={1.5}>
          {query.data.map((item) => (
            <Paper
              variant="outlined"
              key={item.id}
              sx={{ p: 2.5, borderLeft: 3, borderLeftColor: item.readAt ? "divider" : "primary.dark" }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                gap={2}
                alignItems={{ sm: "center" }}
              >
                <Box flex={1}>
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Typography fontWeight={800}>{item.title}</Typography>
                    {item.category && <Chip size="small" label={item.category.replaceAll("_", " ")} variant="outlined" />}
                    {!item.readAt && (
                      <Chip size="small" label="New" color="primary" />
                    )}
                  </Stack>
                  <Typography color="text.secondary" mt={0.5}>
                    {item.body}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(item.createdAt).toLocaleString()} · {item.channel}
                    {item.repair ? ` · ${item.repair.reference}` : ""}
                  </Typography>
                </Box>
                {!item.readAt && (
                  <Button
                    startIcon={<MarkEmailRead />}
                    onClick={() => read.mutate(item.id)}
                    disabled={read.isPending || readAll.isPending}
                  >
                    Mark read
                  </Button>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <EmptyState
          title="You are all caught up"
          description="New repair and billing updates will appear here."
        />
      )}
    </>
  );
}

export function AuditPage() {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["audit"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<AuditLog[]>>("/businesses/audit")).data.data,
  });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={apiMessage(query.error)} retry={() => void query.refetch()} />;
  const visibleLogs = (query.data ?? []).filter((log) => `${log.user?.fullName ?? "System"} ${log.user?.email ?? ""} ${log.action} ${log.resourceType} ${log.resourceId ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const rows = visibleLogs.map((log) => [
    new Date(log.createdAt).toLocaleString(),
    <Stack>
      <Typography fontWeight={700}>{log.user?.fullName ?? "System"}</Typography>
      <Typography variant="caption">{log.user?.email}</Typography>
    </Stack>,
    log.action.replaceAll("_", " "),
    log.resourceType,
    log.resourceId ?? "—",
    log.ipAddress ?? "—",
  ]);
  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Append-only security and operational events for accountability."
      />
      <Paper sx={{ p: 2.5, mb: 3 }}><TextField fullWidth size="small" label="Search loaded audit events" value={search} onChange={(event) => setSearch(event.target.value)} helperText="Search actors, actions and resources within the latest 200 events." /></Paper>
      <DataTable
        caption={`${visibleLogs.length} shown · latest ${query.data?.length ?? 0} loaded security events (maximum 200)`}
        rowKeys={visibleLogs.map((log) => log.id)}
        empty={search ? "No loaded audit events match this search." : "No security events recorded yet."}
        columns={[
          "Time",
          "Actor",
          "Action",
          "Resource",
          "Resource ID",
          "IP address",
        ]}
        rows={rows}
      />
    </>
  );
}

interface BusinessProfile {
  name: string;
  logoImageUrl?: string;
  email: string;
  phone: string;
  whatsapp?: string;
  address: string;
  city: string;
  country: string;
  currency: string;
  taxRate: string;
  taxPin?: string;
  defaultLabourCharge: string;
  allowInvoicePriceOverride: boolean;
  receiptFooter?: string;
  invoiceFooter?: string;
  timeZone: string;
}
interface Setting {
  id: string;
  key: string;
  value: unknown;
}
interface TaxSetting { etimsEnabled: boolean; environment: "sandbox" | "production"; branchCode?: string; deviceIdentifier?: string; requireCustomerKraPin: boolean }
interface IntegrationStatus { email: boolean; whatsapp: boolean; whatsappTicketTemplate: boolean; kraEtims: boolean; subscriptionGateway: boolean }
interface DeliveryItem { id: string; channel: string; status: string; subject?: string; failureReason?: string; createdAt: string; repair?: { reference: string }; digitalTicket?: { reference: string } }
export function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const sections = user?.role === "BUSINESS_ADMIN" ? ["business", "tax", "delivery", "advanced"] : ["advanced"];
  const section = sections.includes(params.get("section") ?? "") ? params.get("section")! : sections[0];
  const [profileOpen, setProfileOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [key, setKey] = useState("notifications.email.enabled");
  const [value, setValue] = useState("true");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [notice, setNotice] = useState("");
  const [tax, setTax] = useState<TaxSetting | null>(null);
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Setting[]>>("/settings")).data.data,
  });
  const business = useQuery({
    queryKey: ["business-profile"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<BusinessProfile>>("/businesses/profile")).data
        .data,
    enabled: user?.role === "BUSINESS_ADMIN",
  });
  const taxQuery = useQuery({ queryKey: ["tax-settings"], queryFn: async () => (await api.get<ApiEnvelope<TaxSetting>>("/settings/tax")).data.data, enabled: user?.role === "BUSINESS_ADMIN" });
  const integrations = useQuery({ queryKey: ["integration-status"], queryFn: async () => (await api.get<ApiEnvelope<IntegrationStatus>>("/settings/integrations/status")).data.data });
  const deliveries = useQuery({ queryKey: ["notification-delivery"], queryFn: async () => (await api.get<ApiEnvelope<DeliveryItem[]>>("/notifications/delivery")).data.data, enabled: user?.role === "BUSINESS_ADMIN" });
  const retryDelivery = useMutation({ mutationFn: (id: string) => api.post(`/notifications/delivery/${id}/retry`), onSuccess: async () => { setNotice("Delivery retry processed; check the status below."); await queryClient.invalidateQueries({ queryKey: ["notification-delivery"] }); } });
  useEffect(() => {
    if (business.data && !profileOpen) setProfile(business.data);
  }, [business.data, profileOpen]);
  useEffect(() => { if (taxQuery.data && !taxOpen) setTax(taxQuery.data); }, [taxQuery.data, taxOpen]);
  const saveSetting = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
      return api.put(`/settings/${encodeURIComponent(key)}`, { value: parsed });
    },
    onSuccess: async () => {
      setNotice("Setting saved and recorded in the audit trail.");
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const saveProfile = useMutation({
    mutationFn: () =>
      api.patch(
        "/businesses/profile",
        profile
          ? {
              ...profile,
              logoImageUrl: undefined,
              taxRate: Number(profile.taxRate),
              defaultLabourCharge: Number(profile.defaultLabourCharge),
              invoiceFooter: profile.invoiceFooter || undefined,
              receiptFooter: profile.receiptFooter || undefined,
            }
          : {},
      ),
    onSuccess: async () => {
      setNotice("Business profile updated.");
      await queryClient.invalidateQueries({ queryKey: ["business-profile"] });
      setProfileOpen(false);
    },
  });
  const saveTax = useMutation({ mutationFn: () => api.put("/settings/tax", tax), onSuccess: async () => { setNotice("Tax and eTIMS settings updated."); await queryClient.invalidateQueries({ queryKey: ["tax-settings"] }); setTaxOpen(false); } });
  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 2 * 1024 * 1024) throw new Error("Choose an image no larger than 2 MB.");
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The image could not be read."));
        reader.onerror = () => reject(new Error("The image could not be read."));
        reader.readAsDataURL(file);
      });
      return api.put("/businesses/profile/logo", { imageDataUrl });
    },
    onSuccess: async () => { setNotice("Logo uploaded. It will appear on invoices, receipts and customer emails."); await queryClient.invalidateQueries({ queryKey: ["business-profile"] }); const updated = queryClient.getQueryData<BusinessProfile>(["business-profile"]); setProfile((current) => current ? { ...current, logoImageUrl: updated?.logoImageUrl } : current); },
  });
  const removeLogo = useMutation({ mutationFn: () => api.delete("/businesses/profile/logo"), onSuccess: async () => { setNotice("Business logo removed."); await queryClient.invalidateQueries({ queryKey: ["business-profile"] }); setProfile((current) => current ? { ...current, logoImageUrl: undefined } : current); } });
  if (settings.isLoading || business.isLoading || taxQuery.isLoading || integrations.isLoading) return <LoadingBlock />;
  const issue = settings.error ?? business.error ?? taxQuery.error ?? integrations.error;
  if (issue) return <ErrorBlock message={apiMessage(issue)} retry={() => { void settings.refetch(); void integrations.refetch(); if (user?.role === "BUSINESS_ADMIN") { void business.refetch(); void taxQuery.refetch(); } }} />;
  return (
    <>
      <PageHeader
        title="Settings"
        description="Business identity, document defaults, and scoped configuration."
      />
      <Tabs value={section} onChange={(_, selected: string) => setParams({ section: selected }, { replace: true })} variant="scrollable" allowScrollButtonsMobile aria-label="Settings sections" sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {user?.role === "BUSINESS_ADMIN" && <Tab id="settings-business-tab" label="Identity & documents" value="business" aria-controls="settings-business" />}
        {user?.role === "BUSINESS_ADMIN" && <Tab id="settings-tax-tab" label="Tax controls" value="tax" aria-controls="settings-tax" />}
        {user?.role === "BUSINESS_ADMIN" && <Tab id="settings-delivery-tab" label="Message delivery" value="delivery" aria-controls="settings-delivery" />}
        <Tab id="settings-advanced-tab" label="Advanced" value="advanced" aria-controls="settings-advanced" />
      </Tabs>
      {notice && (
        <Alert severity="success" onClose={() => setNotice("")} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {(saveProfile.error || saveTax.error || saveSetting.error || uploadLogo.error || removeLogo.error || retryDelivery.error) && <Alert severity="error" sx={{ mb: 2 }}>{apiMessage(saveProfile.error ?? saveTax.error ?? saveSetting.error ?? uploadLogo.error ?? removeLogo.error ?? retryDelivery.error)}</Alert>}
      <Grid container spacing={3}>
        {profile && (
          <Grid size={12} role="tabpanel" id="settings-business" aria-labelledby="settings-business-tab" hidden={section !== "business"}>
            <Card>
              <CardContent>
                <Typography variant="h6">Business profile</Typography>
                <Typography variant="body2" color="text.secondary" mb={3}>
                  Displayed on invoices, receipts, and customer notifications.
                </Typography>
                <Stack spacing={2.5} maxWidth={780}>
                  {business.data?.logoImageUrl && <Box component="img" src={business.data.logoImageUrl} alt={`${business.data.name} logo`} sx={{ width: 180, height: 130, objectFit: "contain" }} />}
                  <Typography variant="h5">{business.data?.name}</Typography>
                  <Grid container spacing={3}><Grid size={{ xs: 12, sm: 6 }}><KeyValue label="Contact" value={<>{business.data?.email}<br />{business.data?.phone}</>} /></Grid><Grid size={{ xs: 12, sm: 6 }}><KeyValue label="Workshop address" value={<>{business.data?.address}<br />{business.data?.city}, {business.data?.country}</>} /></Grid><Grid size={{ xs: 12, sm: 6 }}><KeyValue label="Document currency" value={business.data?.currency} /></Grid><Grid size={{ xs: 12, sm: 6 }}><KeyValue label="Default repair labour" value={`${business.data?.currency ?? "KES"} ${Number(business.data?.defaultLabourCharge ?? 0).toLocaleString()}`} /></Grid></Grid>
                  <Box><Button variant="contained" startIcon={<Edit />} onClick={() => { saveProfile.reset(); setProfile(business.data ?? null); setProfileOpen(true); }}>Edit business profile</Button></Box>
                </Stack>
                <FormDialog open={profileOpen} title="Edit business profile" description="Saved identity and document defaults apply to invoices, receipts and customer notifications. Logo upload/removal is saved immediately and separately." maxWidth="md" busy={saveProfile.isPending || uploadLogo.isPending || removeLogo.isPending} error={saveProfile.error || uploadLogo.error || removeLogo.error ? apiMessage(saveProfile.error ?? uploadLogo.error ?? removeLogo.error) : undefined} dirty={JSON.stringify(profile) !== JSON.stringify(business.data)} onClose={() => setProfileOpen(false)} onSubmit={() => saveProfile.mutate()} submitLabel="Save profile">
                <Stack spacing={2}>
                  <TextField
                    label="Business name"
                    value={profile.name}
                    onChange={(event) =>
                      setProfile({ ...profile, name: event.target.value })
                    }
                  />
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography fontWeight={700} mb={1}>Business logo</Typography>
                    {profile.logoImageUrl && <Box component="img" src={profile.logoImageUrl} alt={`${profile.name} logo`} sx={{ display: "block", width: "100%", maxWidth: 220, height: 150, objectFit: "contain", mb: 2 }} />}
                    <Stack direction="row" gap={1} flexWrap="wrap">
                      <Button component="label" variant="outlined" disabled={uploadLogo.isPending || removeLogo.isPending}>{uploadLogo.isPending ? "Uploading…" : "Upload photo"}<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/tiff" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadLogo.mutate(file); event.target.value = ""; }} /></Button>
                      {profile.logoImageUrl && <Button color="error" onClick={() => removeLogo.mutate()} disabled={uploadLogo.isPending || removeLogo.isPending}>Remove logo</Button>}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block" mt={1}>PNG, JPG/JPEG, WebP, GIF, AVIF or TIFF · maximum 2 MB / 4096 × 4096 pixels. The complete image is kept; animated images use the first frame.</Typography>
                  </Paper>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField
                      fullWidth
                      type="email"
                      label="Email"
                      value={profile.email}
                      onChange={(event) =>
                        setProfile({ ...profile, email: event.target.value })
                      }
                    />
                    <TextField
                      fullWidth
                      label="Phone"
                      value={profile.phone}
                      onChange={(event) =>
                        setProfile({ ...profile, phone: event.target.value })
                      }
                    />
                  </Stack>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField
                      fullWidth
                      label="KRA PIN"
                      value={profile.taxPin ?? ""}
                      onChange={(event) => setProfile({ ...profile, taxPin: event.target.value.toUpperCase() })}
                      helperText="Only printed when the administrator enables KRA after setup."
                    />
                    <TextField
                      fullWidth
                      type="number"
                      label="Default labour charge"
                      value={profile.defaultLabourCharge}
                      onChange={(event) => setProfile({ ...profile, defaultLabourCharge: event.target.value })}
                      helperText={`Amount in ${profile.currency}; automatically added to repair invoices.`}
                    />
                  </Stack>
                  <Button
                    variant={profile.allowInvoicePriceOverride ? "contained" : "outlined"}
                    onClick={() => setProfile({ ...profile, allowInvoicePriceOverride: !profile.allowInvoicePriceOverride })}
                  >
                    {profile.allowInvoicePriceOverride ? "Inventory price override allowed" : "Use configured inventory prices"}
                  </Button>
                  <TextField
                    label="Address"
                    value={profile.address}
                    onChange={(event) =>
                      setProfile({ ...profile, address: event.target.value })
                    }
                  />
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField
                      fullWidth
                      label="City"
                      value={profile.city}
                      onChange={(event) =>
                        setProfile({ ...profile, city: event.target.value })
                      }
                    />
                    <TextField
                      fullWidth
                      label="Country"
                      value={profile.country}
                      onChange={(event) =>
                        setProfile({ ...profile, country: event.target.value })
                      }
                    />
                  </Stack>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField
                      fullWidth
                      label="Currency"
                      value={profile.currency}
                      onChange={(event) =>
                        setProfile({ ...profile, currency: event.target.value })
                      }
                    />
                    <TextField
                      fullWidth
                      type="number"
                      label="Default tax rate (%)"
                      value={profile.taxRate}
                      onChange={(event) =>
                        setProfile({ ...profile, taxRate: event.target.value })
                      }
                    />
                  </Stack>
                  <TextField
                    multiline
                    minRows={2}
                    label="Invoice footer"
                    value={profile.invoiceFooter ?? ""}
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        invoiceFooter: event.target.value,
                      })
                    }
                  />
                  <TextField
                    multiline
                    minRows={2}
                    label="Receipt footer"
                    value={profile.receiptFooter ?? ""}
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        receiptFooter: event.target.value,
                      })
                    }
                  />
                </Stack>
                </FormDialog>
              </CardContent>
            </Card>
          </Grid>
        )}
        {tax && <Grid size={12} role="tabpanel" id="settings-tax" aria-labelledby="settings-tax-tab" hidden={section !== "tax"}>
          <Card><CardContent><Typography variant="h6" component="h2">KRA / eTIMS controls</Typography><Typography variant="body2" color="text.secondary" mt={1} mb={3} maxWidth={760}>Off by default. KRA information and submission controls stay hidden on invoices and receipts until enabled after setup. This does not change tax calculations or existing records.</Typography>
            <Stack spacing={2.5} maxWidth={600}><KeyValue label="Current state" value={taxQuery.data?.etimsEnabled ? "KRA features on" : "KRA features off"} /><KeyValue label="Environment" value={taxQuery.data?.environment ?? "sandbox"} /><Alert severity={integrations.data?.kraEtims ? "success" : "info"}>{integrations.data?.kraEtims ? "KRA adapter credentials detected" : "Complete external KRA setup before enabling"}</Alert><Box><Button variant="outlined" onClick={() => { saveTax.reset(); setTax(taxQuery.data ?? null); setTaxOpen(true); }}>Configure tax controls</Button></Box></Stack>
          </CardContent></Card>
          <FormDialog open={taxOpen} title="Configure KRA / eTIMS" description="Enable only after external setup is complete. This controls document visibility and submission, not the tax calculation rules." busy={saveTax.isPending} error={saveTax.error ? apiMessage(saveTax.error) : undefined} dirty={JSON.stringify(tax) !== JSON.stringify(taxQuery.data)} onClose={() => setTaxOpen(false)} onSubmit={() => saveTax.mutate()} submitLabel="Save KRA settings" submitDisabled={tax.etimsEnabled && !integrations.data?.kraEtims}>
            <FormControlLabel control={<Switch checked={tax.etimsEnabled} onChange={(event) => setTax({ ...tax, etimsEnabled: event.target.checked })} disabled={!tax.etimsEnabled && !integrations.data?.kraEtims} />} label={tax.etimsEnabled ? "KRA features on" : "KRA features off"} />
            <TextField select label="Environment" value={tax.environment} onChange={(event) => setTax({ ...tax, environment: event.target.value as TaxSetting["environment"] })}><MenuItem value="sandbox">Sandbox</MenuItem><MenuItem value="production">Production</MenuItem></TextField>
            <TextField label="Branch code" value={tax.branchCode ?? ""} onChange={(event) => setTax({ ...tax, branchCode: event.target.value })} /><TextField label="Device identifier" value={tax.deviceIdentifier ?? ""} onChange={(event) => setTax({ ...tax, deviceIdentifier: event.target.value })} />
            <FormControlLabel control={<Switch checked={tax.requireCustomerKraPin} onChange={(event) => setTax({ ...tax, requireCustomerKraPin: event.target.checked })} />} label="Require customer KRA PIN when KRA is enabled" />
          </FormDialog>
        </Grid>}
        {user?.role === "BUSINESS_ADMIN" && <Grid size={12} role="tabpanel" id="settings-delivery" aria-labelledby="settings-delivery-tab" hidden={section !== "delivery"}>
          {section === "delivery" && <ReviewSettingsPanel />}
          <Card><CardContent><Typography variant="h6" component="h2" mb={1}>Customer message delivery</Typography><Typography variant="body2" color="text.secondary" mb={2} maxWidth={800}>Intake notifications include the ticket number and private tracking link for repairs, websites, software and AI agents. WhatsApp sends only with customer consent and an approved utility template; ongoing updates follow their communication preference.</Typography>
            <Alert severity={integrations.data?.whatsappTicketTemplate ? "success" : "info"} sx={{ mb: 3 }}>{integrations.data?.whatsappTicketTemplate ? "WhatsApp ticket delivery is configured. Sent means accepted by the provider, not confirmed received." : "WhatsApp credentials or the approved ticket template are missing. Messages stay pending; they are never marked sent without provider acknowledgement. Manual Send to WhatsApp buttons remain available on tickets and invoices."}</Alert>
            {deliveries.isLoading ? <LoadingBlock /> : deliveries.error ? <ErrorBlock message={apiMessage(deliveries.error)} retry={() => void deliveries.refetch()} /> : <Stack divider={<Divider />} spacing={0}>{deliveries.data?.length ? deliveries.data.map(item => <Stack key={item.id} direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} gap={2} py={2.5}><Box minWidth={0}><Typography fontWeight={650}>{item.subject ?? "Customer message"}</Typography><Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" mt={0.75}><StatusChip status={item.status} /><Typography variant="body2" color="text.secondary">{item.channel} · {item.repair?.reference ?? item.digitalTicket?.reference ?? "Billing"}</Typography></Stack>{item.failureReason && <Typography variant="caption" color="text.secondary" display="block" mt={1}>{item.failureReason === "DELIVERY_IN_PROGRESS" ? "Delivery retry in progress" : item.failureReason}</Typography>}</Box>{item.channel === "WHATSAPP" && ["PENDING", "FAILED"].includes(item.status) && <Button onClick={() => retryDelivery.mutate(item.id)} disabled={retryDelivery.isPending || !integrations.data?.whatsappTicketTemplate || item.failureReason === "DELIVERY_IN_PROGRESS"}>Retry WhatsApp</Button>}</Stack>) : <EmptyState title="No customer deliveries yet" description="Recorded delivery attempts will appear here. Manual WhatsApp drafts are sent separately by your staff." />}</Stack>}
          </CardContent></Card>
        </Grid>}
        <Grid size={12} role="tabpanel" id="settings-advanced" aria-labelledby="settings-advanced-tab" hidden={section !== "advanced"}>
          <Card>
            <CardContent>
              <Typography variant="h6">Configuration registry</Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Administrative configuration values. Do not enter API keys,
                passwords or other secrets here; provider credentials belong in the server environment.
              </Typography>
              <Stack spacing={2}>
                <TextField
                  label="Setting key"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                />
                <TextField
                  multiline
                  minRows={2}
                  label="JSON or text value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
                <Button
                  variant="outlined"
                  onClick={() => saveSetting.mutate()}
                  disabled={saveSetting.isPending}
                >
                  Save setting
                </Button>
                <Divider />
                {(settings.data ?? []).map((setting) => (
                  <Box key={setting.id}>
                    <Typography fontWeight={750}>{setting.key}</Typography>
                    <Typography
                      component="pre"
                      variant="caption"
                      sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                      {JSON.stringify(setting.value, null, 2)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}

interface MeProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  status: string;
  role: { code: string };
  business?: { name: string; currency: string; timeZone: string };
}
export function ProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [form, setForm] = useState({ fullName: "", phone: "", avatarUrl: "" });
  const query = useQuery({
    queryKey: ["profile"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<MeProfile>>("/auth/me")).data.data,
  });
  const deletion = useMutation({
    mutationFn: () => api.delete("/auth/account"),
    onSuccess: async () => {
      await logout();
      void navigate("/login");
    },
  });
  const update = useMutation({
    mutationFn: () =>
      api.patch("/auth/me", {
        fullName: form.fullName,
        phone: form.phone || null,
        avatarUrl: form.avatarUrl || null,
      }),
    onSuccess: async () => {
      setEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
  useEffect(() => {
    if (query.data)
      setForm({
        fullName: query.data.fullName,
        phone: query.data.phone ?? "",
        avatarUrl: query.data.avatarUrl ?? "",
      });
  }, [query.data]);
  if (query.isLoading) return <LoadingBlock />;
  if (query.error || !query.data)
    return <ErrorBlock message={apiMessage(query.error)} />;
  const profile = query.data;
  return (
    <>
      <PageHeader
        title="My profile"
        description="Your identity and security context in RepairTrack."
        actions={
          <Button
            startIcon={<Edit />}
            variant="outlined"
            onClick={() => setEditOpen(true)}
          >
            Edit profile
          </Button>
        }
      />
      <Card sx={{ maxWidth: 760 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={3}
            alignItems={{ sm: "center" }}
          >
            <Avatar
              src={profile.avatarUrl}
              sx={{ width: 80, height: 80, fontSize: 28 }}
            >
              {profile.fullName.slice(0, 1)}
            </Avatar>
            <Box flex={1}>
              <Typography variant="h5">{profile.fullName}</Typography>
              <Typography color="text.secondary">{profile.email}</Typography>
              <Stack direction="row" gap={1} mt={1}>
                <StatusChip status={profile.status} />
                <Chip
                  label={profile.role.code.replaceAll("_", " ")}
                  variant="outlined"
                />
              </Stack>
            </Box>
          </Stack>
          <Divider sx={{ my: 3 }} />
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <KeyValue label="Phone" value={profile.phone} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <KeyValue label="Business" value={profile.business?.name} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <KeyValue label="Currency" value={profile.business?.currency} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <KeyValue label="Time zone" value={profile.business?.timeZone} />
            </Grid>
          </Grid>
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" color="error.main">
            Privacy controls
          </Typography>
          <Typography color="text.secondary" mb={2}>
            Requesting deletion immediately revokes active sessions and queues
            the account for a privacy review.
          </Typography>
          <Button
            color="error"
            variant="outlined"
            startIcon={<DeleteForever />}
            onClick={() => setConfirmOpen(true)}
          >
            Request account deletion
          </Button>
        </CardContent>
      </Card>
      <FormDialog
        open={editOpen}
        title="Edit my profile"
        busy={update.isPending}
        error={update.error ? apiMessage(update.error) : undefined}
        onClose={() => setEditOpen(false)}
        onSubmit={() => update.mutate()}
        submitDisabled={
          form.fullName.trim().length < 2 ||
          Boolean(form.phone && form.phone.trim().length < 7)
        }
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
          label="Phone"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
        <TextField
          type="url"
          label="Avatar URL"
          value={form.avatarUrl}
          onChange={(event) =>
            setForm({ ...form, avatarUrl: event.target.value })
          }
          helperText="Use an HTTPS image URL from an approved host."
        />
      </FormDialog>
      <FormDialog
        open={confirmOpen}
        title="Request account deletion"
        busy={deletion.isPending}
        error={deletion.error ? apiMessage(deletion.error) : undefined}
        submitDisabled={confirmation !== "DELETE"}
        onClose={() => setConfirmOpen(false)}
        onSubmit={() => deletion.mutate()}
        submitLabel="Revoke sessions and request deletion"
      >
        <Alert severity="warning">
          Type DELETE to confirm. Historical invoices and audit records may be
          retained where legally required.
        </Alert>
        <TextField
          label="Confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          error={Boolean(confirmation && confirmation !== "DELETE")}
          disabled={deletion.isPending}
        />
        {confirmation !== "DELETE" && (
          <Typography variant="caption" color="text.secondary">
            The confirmation button will only submit after the exact phrase is
            entered.
          </Typography>
        )}
      </FormDialog>
    </>
  );
}

interface CustomerFull extends Customer {
  devices: Device[];
  repairs: Repair[];
  invoices: Invoice[];
}
export function CustomerDetailPage() {
  const location = useLocation();
  const directoryContext = new URLSearchParams((location.state as { directorySearch?: string } | null)?.directorySearch ?? "");
  const directoryParams = new URLSearchParams();
  if (directoryContext.get("q")) directoryParams.set("q", directoryContext.get("q")!);
  const directoryPath = `/customers${directoryParams.size ? `?${directoryParams.toString()}` : ""}`;
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const query = useQuery({
    queryKey: ["customer", id],
    queryFn: async () =>
      (await api.get<ApiEnvelope<CustomerFull>>(`/customers/${id}`)).data.data,
  });
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    alternativePhone: "",
    whatsappPhone: "",
    whatsappOptIn: false,
    customerType: "INDIVIDUAL",
    kraPin: "",
    preferredCommunication: "EMAIL",
    address: "",
    notes: "",
  });
  useEffect(() => {
    if (query.data)
      setForm({
        fullName: query.data.fullName,
        email: query.data.email ?? "",
        phone: query.data.phone,
        alternativePhone: query.data.alternativePhone ?? "",
        whatsappPhone: query.data.whatsappPhone ?? "",
        whatsappOptIn: query.data.whatsappOptIn ?? false,
        customerType: query.data.customerType ?? "INDIVIDUAL",
        kraPin: query.data.kraPin ?? "",
        preferredCommunication: query.data.preferredCommunication ?? "EMAIL",
        address: query.data.address ?? "",
        notes: query.data.notes ?? "",
      });
  }, [query.data]);
  const update = useMutation({
    mutationFn: () =>
      api.patch(`/customers/${id}`, {
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
      await queryClient.invalidateQueries({ queryKey: ["customer", id] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  const deletion = useMutation({ mutationFn: () => api.delete(`/customers/${id}`, { data: { reason: deleteReason } }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["customers"] }); void navigate("/customers"); } });
  if (query.isLoading) return <LoadingBlock />;
  if (query.error || !query.data)
    return <ErrorBlock message={apiMessage(query.error)} />;
  const customer = query.data;
  return (
    <>
      <Button
        component={Link}
        to={directoryPath}
        startIcon={<ArrowBack />}
        sx={{ mb: 2 }}
      >
        Back to customers
      </Button>
      <PageHeader
        title={customer.fullName}
        description={`${customer.phone} · ${customer.email ?? "No email address"}`}
        actions={
          user?.role === "BUSINESS_ADMIN" ? (
            <Stack direction="row" gap={1}><Button
              startIcon={<Edit />}
              variant="outlined"
              onClick={() => setOpen(true)}
            >
              Edit customer
            </Button><Button color="error" startIcon={<DeleteForever />} onClick={() => setDeleteOpen(true)}>Deactivate</Button></Stack>
          ) : undefined
        }
      />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <KeyValue label="Phone" value={customer.phone} />
                <KeyValue
                  label="Alternative phone"
                  value={customer.alternativePhone}
                />
                <KeyValue label="Email" value={customer.email} />
                <KeyValue label="Customer type" value={customer.customerType?.replaceAll("_", " ")} />
                <KeyValue label="KRA PIN" value={customer.kraPin} />
                <KeyValue label="Preferred communication" value={customer.preferredCommunication?.replaceAll("_", " ")} />
                <KeyValue label="Address" value={customer.address} />
                <KeyValue label="Internal notes" value={customer.notes} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Repair history
              </Typography>
              {customer.repairs.length ? (
                customer.repairs.map((repair) => (
                  <Button
                    component={Link}
                    to={`/repairs/${repair.id}`}
                    key={repair.id}
                    fullWidth
                    sx={{ justifyContent: "space-between" }}
                  >
                    {repair.reference}
                    <StatusChip status={repair.status} />
                  </Button>
                ))
              ) : (
                <Typography color="text.secondary">No repairs yet.</Typography>
              )}
            </CardContent>
          </Card>
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Registered devices
              </Typography>
              <DataTable
                columns={["Device", "Serial / IMEI", "Reported fault"]}
                rows={customer.devices.map((device) => [
                  `${device.brand} ${device.model}`,
                  device.serialNumber ?? device.imei ?? "—",
                  device.reportedFault,
                ])}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <FormDialog
        open={open}
        title="Edit customer"
        busy={update.isPending}
        error={update.error ? apiMessage(update.error) : undefined}
        onClose={() => setOpen(false)}
        onSubmit={() => update.mutate()}
      >
        <TextField
          label="Full name"
          value={form.fullName}
          onChange={(event) =>
            setForm({ ...form, fullName: event.target.value })
          }
        />
        <TextField
          label="Phone"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value, whatsappOptIn: false })}
        />
        <TextField
          label="Alternative phone"
          value={form.alternativePhone}
          onChange={(event) =>
            setForm({ ...form, alternativePhone: event.target.value })
          }
        />
        <TextField
          type="email"
          label="Email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <TextField label="WhatsApp phone" value={form.whatsappPhone} onChange={(event) => setForm({ ...form, whatsappPhone: event.target.value, whatsappOptIn: false })} />
        <FormControlLabel control={<Switch checked={form.whatsappOptIn} onChange={(event) => setForm({ ...form, whatsappOptIn: event.target.checked })} />} label="Customer has agreed to WhatsApp ticket and status notifications" />
        <Typography variant="caption" color="text.secondary">Only enable with the customer's permission. They can withdraw consent at any time.</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} gap={2}><TextField select fullWidth label="Customer type" value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value })}><MenuItem value="INDIVIDUAL">Individual</MenuItem><MenuItem value="BUSINESS">Business</MenuItem></TextField><TextField fullWidth label="KRA PIN" value={form.kraPin} onChange={(event) => setForm({ ...form, kraPin: event.target.value.toUpperCase() })} /></Stack>
        <TextField select label="Preferred communication" value={form.preferredCommunication} onChange={(event) => setForm({ ...form, preferredCommunication: event.target.value })}><MenuItem value="EMAIL">Email</MenuItem><MenuItem value="WHATSAPP">WhatsApp</MenuItem></TextField>
        <TextField
          label="Address"
          value={form.address}
          onChange={(event) =>
            setForm({ ...form, address: event.target.value })
          }
        />
        <TextField
          multiline
          minRows={3}
          label="Notes"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </FormDialog>
      <FormDialog open={deleteOpen} title="Deactivate customer" busy={deletion.isPending} error={deletion.error ? apiMessage(deletion.error) : undefined} onClose={() => setDeleteOpen(false)} onSubmit={() => deletion.mutate()} submitLabel="Deactivate and preserve history" submitDisabled={deleteReason.trim().length < 3}><Alert severity="warning">The customer disappears from active lists, while linked repairs, invoices, payments, and audit records remain intact.</Alert><TextField required multiline minRows={2} label="Reason" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></FormDialog>
    </>
  );
}

interface PublicRepair {
  reference: string;
  device: { type: string; brand: string; model: string };
  business: { name: string; logoImageUrl?: string; phone: string };
  dateReceived: string;
  status: string;
  customerFirstName: string;
  customerVisibleNotes?: string;
  estimatedCompletionAt?: string;
  approval?: { version: number; estimateAmount: number; message?: string; items: { description: string; quantity: string; unitPrice: string; lineTotal: string }[] } | null;
  customerResponse?: { decision: string; declineReason?: string; approvalVersion: number; createdAt: string } | null;
  invoices: {
    number: string;
    status: string;
    paymentStatus: string;
    balance: string;
  }[];
  statusHistory: {
    toStatus: string;
    customerMessage?: string;
    createdAt: string;
  }[];
}
export function PublicTrackPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.token ?? "");
  const [declineReason, setDeclineReason] = useState("");
  const [responseNotice, setResponseNotice] = useState("");
  const query = useQuery({
    queryKey: ["public-repair", params.token],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<PublicRepair>>(
          `/repairs/track/${params.token}`,
        )
      ).data.data,
    enabled: Boolean(params.token),
    retry: false,
  });
  const respond = useMutation({
    mutationFn: (decision: "ACCEPTED" | "DECLINED") => api.post(`/repairs/track/${params.token}/respond`, { decision, approvalVersion: query.data?.approval?.version, declineReason: decision === "DECLINED" ? declineReason : undefined }),
    onSuccess: async (_data, decision) => { setResponseNotice(decision === "ACCEPTED" ? "Your approval was recorded. The repair team has been notified." : "Your decision was recorded. The repair team has been notified."); await query.refetch(); },
  });
  if (!params.token)
    return (
      <Box className="product-ui" minHeight="100vh" display="grid" sx={{ placeItems: "center" }} p={2}>
        <Card sx={{ width: "100%", maxWidth: 560 }}>
          <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
            <Box mb={3}>
              <BrandLogo className="brand-logo--auth" />
            </Box>
            <Typography component="h1" variant="h4">Track your repair</Typography>
            <Typography color="text.secondary" mt={1} mb={3}>
              Paste the private tracking token from your intake receipt or
              message.
            </Typography>
            <Stack
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                if (token.trim())
                  void navigate(`/track/${encodeURIComponent(token.trim())}`);
              }}
              spacing={2}
            >
              <TextField
                label="Tracking token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
              <Button type="submit" variant="contained" startIcon={<Search />}>
                View repair status
              </Button>
              <Button component={Link} to="/login">
                Sign in instead
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  if (query.isLoading) return <LoadingBlock label="Finding your repair" />;
  if (query.error || !query.data)
    return (
      <Box className="product-ui" minHeight="100vh" display="grid" sx={{ placeItems: "center" }} p={2}>
        <Alert severity="error">
          That tracking link is invalid or expired. Check the complete link from
          the repair business.
        </Alert>
      </Box>
    );
  const repair = query.data;
  return (
    <Box
      className="product-ui"
      minHeight="100vh"
      bgcolor="transparent"
      py={{ xs: 3, md: 7 }}
      px={2}
    >
      <Box maxWidth={850} mx="auto">
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} gap={1.5} mb={4}>
          {repair.business.logoImageUrl ? <Box component="img" src={repair.business.logoImageUrl} alt={`${repair.business.name} logo`} sx={{ width: { xs: 100, sm: 140 }, height: 140, objectFit: "contain" }} /> : <BrandLogo className="brand-logo--tracker" />}
          <Box>
            <Typography variant="h5">{repair.business.name}</Typography>
            <Typography color="text.secondary">
              Customer repair tracker
            </Typography>
          </Box>
        </Stack>
        <Card>
          <CardContent sx={{ p: { xs: 3, md: 5 } }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              gap={2}
            >
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Repair reference
                </Typography>
                <Typography component="h1" sx={{ fontSize: { xs: 30, sm: 42 }, lineHeight: 1.2, fontWeight: 750, letterSpacing: "-.04em", overflowWrap: "anywhere" }}>{repair.reference}</Typography>
                <Typography color="text.secondary">
                  {repair.device.brand} {repair.device.model} ·{" "}
                  {repair.device.type}
                </Typography>
              </Box>
              <Box>
                <StatusChip status={repair.status} />
              </Box>
            </Stack>
            <Divider sx={{ my: 4 }} />
            <Typography variant="h6">Progress</Typography>
            <Stack mt={3}>
              {repair.statusHistory.map((entry, index) => (
                <Box
                  key={`${entry.toStatus}-${entry.createdAt}`}
                  pl={3}
                  pb={3}
                  position="relative"
                  borderLeft={index < repair.statusHistory.length - 1 ? 2 : 0}
                  borderColor="divider"
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
                  <Typography fontWeight={800}>
                    {entry.toStatus.replaceAll("_", " ")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(entry.createdAt).toLocaleString()}
                  </Typography>
                  {entry.customerMessage && (
                    <Typography mt={0.5}>{entry.customerMessage}</Typography>
                  )}
                </Box>
              ))}
            </Stack>
            {repair.customerVisibleNotes && (
              <Alert severity="info">{repair.customerVisibleNotes}</Alert>
            )}
            {responseNotice && <Alert severity="success" sx={{ mt: 2 }}>{responseNotice}</Alert>}
            {repair.approval && <Card variant="outlined" sx={{ mt: 3, borderColor: "primary.main" }}><CardContent><Typography variant="h6">Estimate approval required</Typography><Typography color="text.secondary">Hello {repair.customerFirstName}, review estimate version {repair.approval.version} before the repair continues.</Typography>{repair.approval.items.length > 0 && <DataTable columns={["Item", "Quantity", "Unit price", "Total"]} rows={repair.approval.items.map((item) => [item.description, Number(item.quantity), `KES ${Number(item.unitPrice).toLocaleString()}`, `KES ${Number(item.lineTotal).toLocaleString()}`])} />}<Typography variant="h5" mt={2}>Estimated total: KES {repair.approval.estimateAmount.toLocaleString()}</Typography><TextField fullWidth multiline minRows={2} label="Reason if declining" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} sx={{ mt: 2 }} /><Stack direction={{ xs: "column", sm: "row" }} gap={1.5} mt={2}><Button variant="contained" onClick={() => respond.mutate("ACCEPTED")} disabled={respond.isPending}>Accept estimate</Button><Button color="error" variant="outlined" onClick={() => respond.mutate("DECLINED")} disabled={respond.isPending || declineReason.trim().length < 3}>Decline estimate</Button></Stack>{respond.error && <Alert severity="error" sx={{ mt: 2 }}>{apiMessage(respond.error)}</Alert>}<Typography variant="caption" color="text.secondary" display="block" mt={2}>Your response is versioned, time-stamped, and cannot be submitted twice.</Typography></CardContent></Card>}
            {repair.customerResponse && <Alert severity="info" sx={{ mt: 2 }}>Response recorded: {repair.customerResponse.decision.replaceAll("_", " ")}{repair.customerResponse.declineReason ? ` — ${repair.customerResponse.declineReason}` : ""}</Alert>}
            {repair.invoices.length > 0 && (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="h6" mb={1}>
                  Billing status
                </Typography>
                {repair.invoices.map((invoice) => (
                  <Stack
                    key={invoice.number}
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    py={1}
                  >
                    <span>{invoice.number}</span>
                    <span>
                      {invoice.paymentStatus.replaceAll("_", " ")} · Balance KES{" "}
                      {Number(invoice.balance).toLocaleString()}
                    </span>
                  </Stack>
                ))}
              </>
            )}
            <Typography variant="body2" color="text.secondary" mt={4}>
              For changes or collection arrangements, contact{" "}
              {repair.business.name} at {repair.business.phone}.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
