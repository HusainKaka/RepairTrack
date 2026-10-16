import ArrowForward from "@mui/icons-material/ArrowForward";
import { Box, Button, Card, CardContent, Grid, Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import type { ApiEnvelope, Invoice, Repair } from "../types";

interface Dashboard {
  repairsToday: number; statuses: Record<string, number>; customers: number; technicians: number;
  revenueToday?: number; revenueMonth?: number; outstanding?: { count: number; amount: number };
  lowStock: Array<{ id: string; name: string; sku: string; quantity: number; minimumStock: number }>;
}
interface PlatformDashboard { businesses: Record<string, number>; subscriptions: Record<string, number>; users: number; activeSessions: number; repairs: number; auditEvents24h: number }
const money = (value: number) => "KES " + new Intl.NumberFormat("en-KE", { maximumFractionDigits: 2 }).format(value);
const stageOrder = ["AWAITING_CUSTOMER_APPROVAL", "WAITING_FOR_PARTS", "READY_FOR_COLLECTION", "RECEIVED", "DIAGNOSING", "IN_PROGRESS", "TESTING", "COMPLETED", "COLLECTED", "CANCELLED"];
const stageGuidance: Record<string, string> = { AWAITING_CUSTOMER_APPROVAL: "Awaiting a customer decision", WAITING_FOR_PARTS: "Waiting on required stock", READY_FOR_COLLECTION: "Ready to hand back", RECEIVED: "New jobs awaiting assessment", DIAGNOSING: "Assessment in progress", IN_PROGRESS: "Work under way", TESTING: "Final checks in progress", COMPLETED: "Repair work completed", COLLECTED: "Devices handed back", CANCELLED: "Closed without further work" };

function SummaryValue({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return <Box component="dl" sx={{ m: 0, minWidth: 0 }}><Box><Typography component="dt" variant="body2" color="text.secondary" mb={0.5}>{label}</Typography><Typography component="dd" sx={{ m: 0, fontSize: 25, lineHeight: 1.4, fontWeight: 750, letterSpacing: "-.035em", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{value}<Typography component="span" display="block" variant="caption" color="text.secondary" sx={{ fontWeight: 400, letterSpacing: 0, mt: 0.5 }}>{hint}</Typography></Typography></Box></Box>;
}
function SectionHeading({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1.5} mb={2}><Box sx={{ minWidth: 0 }}><Typography component="h2" className="product-section-heading">{title}</Typography>{description && <Typography variant="body2" color="text.secondary" mt={0.5}>{description}</Typography>}</Box>{action}</Stack>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const businessQuery = useQuery({ queryKey: ["business-dashboard"], queryFn: async () => (await api.get<ApiEnvelope<Dashboard>>("/reports/dashboard")).data.data, enabled: user?.role === "BUSINESS_ADMIN" || user?.role === "TECHNICIAN" });
  const customerRepairs = useQuery({ queryKey: ["customer-repairs"], queryFn: async () => (await api.get<ApiEnvelope<Repair[]>>("/repairs")).data.data, enabled: user?.role === "CUSTOMER" });
  const customerInvoices = useQuery({ queryKey: ["customer-invoices"], queryFn: async () => (await api.get<ApiEnvelope<Invoice[]>>("/invoices")).data.data, enabled: user?.role === "CUSTOMER" });
  const platform = useQuery({ queryKey: ["platform-dashboard"], queryFn: async () => (await api.get<ApiEnvelope<PlatformDashboard>>("/reports/platform")).data.data, enabled: user?.role === "SUPER_ADMIN" });
  if (businessQuery.isLoading || customerRepairs.isLoading || customerInvoices.isLoading || platform.isLoading) return <LoadingBlock label="Preparing your workspace" />;
  const failed = [businessQuery, customerRepairs, customerInvoices, platform].find((query) => query.error);
  if (failed) return <ErrorBlock message={apiMessage(failed.error)} retry={() => void failed.refetch()} />;
  const updating = [businessQuery, customerRepairs, customerInvoices, platform].some((query) => query.isFetching);
  const refreshState = <Typography variant="caption" color="text.secondary" role="status" aria-live="polite" sx={{ display: "block", minHeight: 20, mb: 1 }}>{updating ? "Updating overview…" : ""}</Typography>;

  if (user?.role === "SUPER_ADMIN" && platform.data) {
    const data = platform.data;
    const businessTotal = Object.values(data.businesses).reduce((sum, count) => sum + count, 0);
    return <>
      <PageHeader title="Platform overview" description="Tenant workspaces, subscriptions and aggregate platform activity." actions={<Button component={Link} to="/businesses" variant="contained">Manage businesses</Button>} />
      {refreshState}
      <Paper sx={{ p: 3, mb: 3 }}><Grid container spacing={3}>
        <Grid size={{ xs: 6, lg: 3 }}><SummaryValue label="Business workspaces" value={businessTotal} hint={(data.businesses.ACTIVE ?? 0) + " active"} /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><SummaryValue label="Platform users" value={data.users} hint={data.activeSessions + " active sessions"} /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><SummaryValue label="Repairs managed" value={data.repairs} hint="Aggregate count only" /></Grid>
        <Grid size={{ xs: 6, lg: 3 }}><SummaryValue label="Audit events" value={data.auditEvents24h} hint="In the last 24 hours" /></Grid>
      </Grid></Paper>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}><Card><CardContent><SectionHeading title="Workspace health" description="Current lifecycle state across the platform." />
          {Object.keys(data.businesses).length ? Object.entries(data.businesses).map(([status, count]) => <Stack key={status} direction="row" justifyContent="space-between" alignItems="center" py={2} borderTop={1} borderColor="divider"><StatusChip status={status} /><Typography fontWeight={750}>{count}</Typography></Stack>) : <EmptyState title="No workspaces yet" description="Onboard the first business to begin." />}
        </CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 5 }}><Card><CardContent><SectionHeading title="Subscriptions" action={<Button component={Link} to="/subscriptions">Manage</Button>} />
          {Object.entries(data.subscriptions).map(([status, count]) => <Stack key={status} direction="row" justifyContent="space-between" alignItems="center" py={2} borderTop={1} borderColor="divider"><StatusChip status={status} /><Typography fontWeight={750}>{count}</Typography></Stack>)}
          {!Object.keys(data.subscriptions).length && <Typography color="text.secondary">No subscriptions recorded.</Typography>}
        </CardContent></Card></Grid>
      </Grid>
    </>;
  }

  if (user?.role === "CUSTOMER") {
    const repairs = customerRepairs.data ?? [], invoices = customerInvoices.data ?? [];
    const active = repairs.filter((repair) => !["COLLECTED", "CANCELLED"].includes(repair.status));
    const balance = invoices.reduce((sum, invoice) => sum + Number(invoice.balance), 0);
    return <>
      <PageHeader title={"Hello, " + user.fullName.split(" ")[0]} description="Your service requests, progress updates and payment status in one place." actions={<Button component={Link} to="/repairs" variant="contained">View my repairs</Button>} />
      {refreshState}
      <Paper sx={{ p: 3, mb: 3 }}><Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 4 }}><SummaryValue label="Active repairs" value={active.length} hint="In your loaded repair history" /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><SummaryValue label="Outstanding balance" value={money(balance)} hint={invoices.filter((item) => Number(item.balance) > 0).length + " open invoice(s) loaded"} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><SummaryValue label="Repair history" value={repairs.length} hint="Up to 100 visible jobs loaded" /></Grid>
      </Grid></Paper>
      <Card><CardContent><SectionHeading title="Current repairs" description="Open a job for the latest workshop update." />
        {active.length ? <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>{active.map((repair) => <Box component="li" key={repair.id} sx={{ py: 2, borderTop: 1, borderColor: "divider" }}>
          <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" gap={2}><Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{repair.reference}</Typography><Typography fontWeight={700} mt={0.5} sx={{ overflowWrap: "anywhere" }}>{repair.device.brand} {repair.device.model}</Typography><Box mt={1}><StatusChip status={repair.status} /></Box></Box><Button component={Link} to={"/repairs/" + repair.id} endIcon={<ArrowForward />} aria-label={"View repair " + repair.reference}>View repair</Button></Stack>
        </Box>)}</Box> : <EmptyState title="No active repairs" description="You have no active jobs in the current repair history. Completed visits remain available under Repairs." action={<Button component={Link} to="/repairs">See repair history</Button>} />}
      </CardContent></Card>
      <Stack direction={{ xs: "column", sm: "row" }} gap={2} justifyContent="space-between" mt={3}><Button component={Link} to="/digital-services" endIcon={<ArrowForward />}>View digital projects</Button><Button component={Link} to="/invoices" endIcon={<ArrowForward />}>View invoices</Button></Stack>
      <Typography variant="caption" color="text.secondary" display="block" mt={2}>Balances reflect up to 100 invoices returned for your account. Open Invoices to review individual records.</Typography>
    </>;
  }

  const data = businessQuery.data;
  if (!data) return <ErrorBlock message="The overview is unavailable." retry={() => void businessQuery.refetch()} />;
  const admin = user?.role === "BUSINESS_ADMIN";
  const total = Object.values(data.statuses).reduce((sum, count) => sum + count, 0);
  const completed = (data.statuses.COMPLETED ?? 0) + (data.statuses.READY_FOR_COLLECTION ?? 0) + (data.statuses.COLLECTED ?? 0);
  const stages = [...stageOrder, ...Object.keys(data.statuses).filter((status) => !stageOrder.includes(status))].filter((status) => data.statuses[status] > 0);
  return <>
    <PageHeader title={admin ? "Operations overview" : "My workshop"} description={admin ? "The workshop at a glance. Start with the jobs that need a decision or handover." : "Your assigned repair workload and the workshop stock that supports it."} actions={<Button component={Link} to="/repairs" variant="contained" endIcon={<ArrowForward />}>Open repairs</Button>} />
    {refreshState}
    <Paper sx={{ p: 3, mb: 3 }}><Grid container spacing={3}>
      <Grid size={{ xs: 6, lg: admin ? 3 : 4 }}><SummaryValue label="Received today" value={data.repairsToday} hint="New repair intakes" /></Grid>
      <Grid size={{ xs: 6, lg: admin ? 3 : 4 }}><SummaryValue label="In progress" value={(data.statuses.IN_PROGRESS ?? 0) + (data.statuses.DIAGNOSING ?? 0)} hint={(data.statuses.WAITING_FOR_PARTS ?? 0) + " waiting for parts"} /></Grid>
      {admin ? <><Grid size={{ xs: 6, lg: 3 }}><SummaryValue label="Revenue this month" value={data.revenueMonth === undefined ? "—" : money(data.revenueMonth)} hint={data.revenueToday === undefined ? "Today’s revenue unavailable" : money(data.revenueToday) + " today"} /></Grid><Grid size={{ xs: 6, lg: 3 }}><SummaryValue label="Customers" value={data.customers} hint={data.technicians + " active technicians"} /></Grid></> : <Grid size={{ xs: 12, lg: 4 }}><SummaryValue label="Ready for collection" value={data.statuses.READY_FOR_COLLECTION ?? 0} hint="Assigned devices ready to hand back" /></Grid>}
    </Grid></Paper>
    <Grid container spacing={3} alignItems="flex-start">
      <Grid size={{ xs: 12, lg: 7 }}><Card><CardContent>
        <SectionHeading title="Workshop ledger" description={total + (admin ? " business" : " assigned") + " repairs across all stages. Open a stage to work through its jobs."} />
        {stages.length ? <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>{stages.map((status) => <Box component="li" key={status} sx={{ borderTop: 1, borderColor: "divider" }}>
          <Button component={Link} to={"/repairs?status=" + encodeURIComponent(status)} fullWidth sx={{ py: 2, px: 0, minHeight: 70, justifyContent: "space-between", textAlign: "left", gap: 2, "&:hover": { textDecoration: "none" } }}><Box sx={{ minWidth: 0 }}><StatusChip status={status} /><Typography variant="body2" color="text.secondary" mt={0.75}>{stageGuidance[status] ?? "View jobs in this stage"}</Typography></Box><Stack direction="row" alignItems="center" gap={2}><Typography component="span" fontSize={20} fontWeight={750} color="text.primary">{data.statuses[status]}</Typography><ArrowForward fontSize="small" /></Stack></Button>
        </Box>)}</Box> : <EmptyState title="Your repair ledger is ready" description={admin ? "Create your first repair intake to bring workshop work into this view." : "Assigned repair jobs will appear here."} action={<Button component={Link} to="/repairs">Go to repairs</Button>} />}
        {total > 0 && <Typography variant="caption" color="text.secondary" display="block" pt={2} borderTop={1} borderColor="divider">{Math.round(completed / total * 100)}% completed, ready for collection or collected · Based on current repair stages</Typography>}
      </CardContent></Card></Grid>
      <Grid size={{ xs: 12, lg: 5 }}><Stack spacing={3}>
        {admin && <Card><CardContent><SectionHeading title="Receivables" description="Issued invoices still awaiting payment." action={<Button component={Link} to="/invoices">Review invoices</Button>} /><Typography sx={{ fontSize: 28, fontWeight: 750, letterSpacing: "-.035em" }}>{data.outstanding ? money(data.outstanding.amount) : "Unavailable"}</Typography><Typography variant="body2" color="text.secondary" mt={0.5}>{data.outstanding ? data.outstanding.count + " outstanding invoice(s)" : "Invoice summary could not be loaded"}</Typography></CardContent></Card>}
        <Card><CardContent><SectionHeading title="Stock to review" description="Items at or below their configured threshold." action={<Button component={Link} to="/inventory">Open inventory</Button>} />
          {data.lowStock.length ? <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>{data.lowStock.slice(0, 5).map((item) => <Box component="li" key={item.id} sx={{ py: 2, borderTop: 1, borderColor: "divider" }}><Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}><Box sx={{ minWidth: 0 }}><Typography fontWeight={650} sx={{ overflowWrap: "anywhere" }}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.sku}</Typography></Box><Typography fontWeight={750} sx={{ whiteSpace: "nowrap" }}>{item.quantity} left</Typography></Stack><Typography variant="caption" color="text.secondary">Review threshold: {item.minimumStock}</Typography></Box>)}{data.lowStock.length > 5 && <Box component="li"><Typography variant="body2" color="text.secondary" pt={2}>Showing 5 of {data.lowStock.length} low-stock items. Review the rest in Inventory.</Typography></Box>}</Box> : <Typography color="text.secondary" py={2}>No stock items are at or below their threshold.</Typography>}
        </CardContent></Card>
        <Box><Typography variant="body2" color="text.secondary">Website, software and AI-agent work has its own delivery workflow.</Typography><Button component={Link} to="/digital-services" endIcon={<ArrowForward />} sx={{ mt: 1 }}>Open digital solutions</Button></Box>
      </Stack></Grid>
    </Grid>
  </>;
}
