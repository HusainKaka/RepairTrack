import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Paper,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { DataTable, FormDialog, KeyValue } from "../components/DataViews";
import { ErrorBlock, LoadingBlock } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { repairDate, sentenceCase } from "../components/repair/repairPresentation";
import type { ApiEnvelope } from "../types";

interface Plan {
  id: string;
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  currency: string;
  trialDays: number;
  repairLimit?: number;
  technicianLimit?: number;
  businessUserLimit?: number;
  storageMb?: number;
  features: Record<string, boolean>;
  active: boolean;
}
interface Payment {
  id: string;
  provider: string;
  providerTransactionId: string;
  amount: string;
  currency: string;
  status: string;
  paidAt?: string;
  createdAt: string;
}
interface CurrentSubscription {
  id: string;
  businessId: string;
  status: string;
  billingCycle: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  renewalDate?: string;
  gracePeriodEndsAt?: string;
  plan: Plan;
  payments: Payment[];
}
interface ManagedSubscription extends CurrentSubscription {
  business: { name: string; email: string };
}

export function SubscriptionsPage() {
  const { user } = useAuth();
  const canView = user?.role === "BUSINESS_ADMIN" || user?.role === "SUPER_ADMIN";
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ManagedSubscription | null>(null);
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [billingCycle, setBillingCycle] = useState("MONTHLY");
  const [reason, setReason] = useState("");
  const [reviewPlan, setReviewPlan] = useState<Plan | null>(null);
  const [notice, setNotice] = useState("");
  const plans = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () =>
      (await api.get<ApiEnvelope<Plan[]>>("/subscriptions/plans")).data.data,
    enabled: canView,
  });
  const current = useQuery({
    queryKey: ["subscription-current"],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<CurrentSubscription>>(
          "/subscriptions/current",
        )
      ).data.data,
    enabled: user?.role === "BUSINESS_ADMIN",
  });
  const businesses = useQuery({
    queryKey: ["subscription-businesses"],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<ManagedSubscription[]>>(
          "/subscriptions/businesses",
        )
      ).data.data,
    enabled: user?.role === "SUPER_ADMIN",
  });
  const checkout = useMutation({
    mutationFn: (value: { planId: string; billingCycle: string }) =>
      api.post("/subscriptions/checkout", value),
    onSuccess: async () => { setReviewPlan(null); setNotice("Checkout request acknowledged. This does not confirm payment or activate a plan; activation requires verified provider confirmation."); await queryClient.invalidateQueries({ queryKey: ["subscription-current"] }); },
  });
  const override = useMutation({
    mutationFn: () =>
      api.put(`/subscriptions/businesses/${selected!.businessId}`, {
        planId,
        status,
        billingCycle,
        reason,
      }),
    onSuccess: async () => {
      setSelected(null);
      setReason("");
      setNotice("Subscription override saved with its audit reason.");
      await queryClient.invalidateQueries({
        queryKey: ["subscription-businesses"],
      });
    },
  });
  if (!canView) return <ErrorBlock message="Subscription management is available to administrators." />;
  if (plans.isLoading || current.isLoading || businesses.isLoading)
    return <LoadingBlock label="Loading subscription details" />;
  if (plans.error || current.error || businesses.error)
    return (
      <ErrorBlock
        message={apiMessage(plans.error ?? current.error ?? businesses.error)}
        retry={() => { void plans.refetch(); if (user?.role === "BUSINESS_ADMIN") void current.refetch(); if (user?.role === "SUPER_ADMIN") void businesses.refetch(); }}
      />
    );
  if (user?.role === "SUPER_ADMIN")
    return (
      <>
        <PageHeader
          title="Subscription manager"
          description="Control business plans and lifecycle state. Every manual override is recorded in the audit trail."
        />
        {notice && <Alert severity="success" role="status" onClose={() => setNotice("")} sx={{ mb: 2 }}>{notice}</Alert>}
        {businesses.isFetching && <LinearProgress aria-label="Refreshing subscriptions" sx={{ mb: 2 }} />}
        <DataTable
          caption="Business subscription lifecycle records"
          rowKeys={businesses.data?.map((item) => item.id)}
          mobileSummaryColumns={[0, 3]}
          columns={[
            "Business",
            "Plan",
            "Cycle",
            "Status",
            "Period ends",
            "Action",
          ]}
          rows={(businesses.data ?? []).map((item) => [
            <Box>
              <Typography fontWeight={750}>{item.business.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {item.business.email}
              </Typography>
            </Box>,
            item.plan.name,
            sentenceCase(item.billingCycle),
            <StatusChip status={item.status} />,
            item.currentPeriodEnd
              ? repairDate(item.currentPeriodEnd)
              : "—",
            <Button
              onClick={() => {
                override.reset();
                setReason("");
                setSelected(item);
                setPlanId(item.plan.id);
                setStatus(item.status);
                setBillingCycle(item.billingCycle);
              }}
            >
              Manage
            </Button>,
          ])}
        />
        <FormDialog
          open={Boolean(selected)}
          title={`Manage ${selected?.business.name ?? "subscription"}`}
          busy={override.isPending}
          error={override.error ? apiMessage(override.error) : undefined}
          onClose={() => setSelected(null)}
          onSubmit={() => override.mutate()}
          submitLabel="Apply audited override"
          submitDisabled={reason.trim().length < 3 || !planId}
          dirty={Boolean(reason) || Boolean(selected && (planId !== selected.plan.id || status !== selected.status || billingCycle !== selected.billingCycle))}
          description="This changes the business's plan and lifecycle state directly. It is not a payment and must include a clear audit reason."
        >
          <TextField
            select
            label="Plan"
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
          >
            {(plans.data ?? []).map((plan) => (
              <MenuItem key={plan.id} value={plan.id}>
                {plan.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Billing cycle"
            value={billingCycle}
            onChange={(event) => setBillingCycle(event.target.value)}
          >
            <MenuItem value="MONTHLY">Monthly</MenuItem>
            <MenuItem value="ANNUAL">Annual</MenuItem>
          </TextField>
          <TextField
            select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {[
              "TRIAL",
              "ACTIVE",
              "PAST_DUE",
              "SUSPENDED",
              "CANCELLED",
              "EXPIRED",
            ].map((value) => (
              <MenuItem value={value} key={value}>
                {sentenceCase(value)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            required
            multiline
            minRows={2}
            label="Reason for override"
            inputProps={{ minLength: 3, maxLength: 500 }}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FormDialog>
      </>
    );
  const subscription = current.data;
  if (!subscription)
    return (
      <ErrorBlock message="No business subscription is attached to this account." />
    );
  return (
    <>
      <PageHeader
        title="Plan & subscription"
        description="Review your RepairTrack plan, renewal period, enabled features, and verified payment history."
      />
      {notice && <Alert severity="info" role="status" onClose={() => setNotice("")} sx={{ mb: 2 }}>{notice}</Alert>}
      {current.isFetching && <LinearProgress aria-label="Refreshing subscription details" sx={{ mb: 2 }} />}
      <Alert
        severity={
          subscription.status === "ACTIVE" || subscription.status === "TRIAL"
            ? "success"
            : "warning"
        }
        sx={{ mb: 3 }}
      >
        Your {subscription.plan.name} plan is{" "}
        <strong>
          {subscription.status.replaceAll("_", " ").toLowerCase()}
        </strong>
        .{" "}
        {subscription.currentPeriodEnd &&
          `The current period ends ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}.`}
      </Alert>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="h5">{subscription.plan.name}</Typography>
                <StatusChip status={subscription.status} />
              </Stack>
              <Stack spacing={2} mt={3}>
                <KeyValue
                  label="Billing cycle"
                  value={sentenceCase(subscription.billingCycle)}
                />
                <KeyValue
                  label="Monthly price"
                  value={`${subscription.plan.currency} ${Number(subscription.plan.monthlyPrice).toLocaleString()}`}
                />
                <KeyValue
                  label="Annual price"
                  value={`${subscription.plan.currency} ${Number(subscription.plan.annualPrice).toLocaleString()}`}
                />
                <KeyValue
                  label="Repair limit"
                  value={subscription.plan.repairLimit ?? "Unlimited"}
                />
                <KeyValue
                  label="Technician limit"
                  value={subscription.plan.technicianLimit ?? "Unlimited"}
                />
              </Stack>
              <Typography variant="subtitle2" mt={3} mb={1}>
                Enabled features
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {Object.entries(subscription.plan.features)
                  .filter(([, enabled]) => enabled)
                  .map(([feature]) => (
                    <Chip
                      key={feature}
                      icon={<CheckCircleOutline />}
                      label={feature.replaceAll(/([A-Z])/g, " $1")}
                      color="primary"
                      variant="outlined"
                    />
                  ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" mb={2}>
              Available plans
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>Compare monthly options before continuing. The current backend requires external checkout setup and may report that checkout is unavailable; it will not activate an unpaid plan.</Typography>
            <Grid container spacing={2}>
              {(plans.data ?? []).map((plan) => (
                <Grid key={plan.id} size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6">{plan.name}</Typography>
                      <Typography variant="h4" my={1}>
                        {plan.currency}{" "}
                        {Number(plan.monthlyPrice).toLocaleString()}
                        <Typography component="span" variant="body2">
                          {" "}
                          / month
                        </Typography>
                      </Typography>
                      <Button
                        fullWidth
                        disabled={
                          plan.id === subscription.plan.id || checkout.isPending
                        }
                        onClick={() => { checkout.reset(); setReviewPlan(plan); }}
                      >
                        {plan.id === subscription.plan.id
                          ? "Current plan"
                          : `Review ${plan.name}`}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
            {checkout.error && !reviewPlan && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {apiMessage(checkout.error)}
              </Alert>
            )}
            <Alert severity="info" sx={{ mt: 2 }}>
              Plan payment activates only after a signed provider webhook is
              independently verified. A missing gateway configuration never
              creates a false successful subscription.
            </Alert>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Verified payment history
              </Typography>
              {subscription.payments.length ? (
                <DataTable
                  caption="Recent subscription payment records · activation requires provider verification"
                  rowKeys={subscription.payments.map((payment) => payment.id)}
                  mobileSummaryColumns={[0, 2]}
                  columns={[
                    "Transaction",
                    "Provider",
                    "Amount",
                    "Status",
                    "Paid",
                  ]}
                  rows={subscription.payments.map((payment) => [
                    payment.providerTransactionId,
                    payment.provider,
                    `${payment.currency} ${Number(payment.amount).toLocaleString()}`,
                    <StatusChip status={payment.status} />,
                    payment.paidAt
                      ? repairDate(payment.paidAt, true)
                      : "—",
                  ])}
                />
              ) : (
                <Typography color="text.secondary">
                  No subscription payments have been recorded.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <FormDialog open={Boolean(reviewPlan)} title={`Review ${reviewPlan?.name ?? "plan"}`} description="Review the monthly price before requesting checkout. Your plan does not change until payment is independently verified." busy={checkout.isPending} error={checkout.error ? apiMessage(checkout.error) : undefined} onClose={() => setReviewPlan(null)} onSubmit={() => { if (reviewPlan) checkout.mutate({ planId: reviewPlan.id, billingCycle: "MONTHLY" }); }} submitLabel="Continue to checkout">
        <KeyValue label="Selected plan" value={reviewPlan?.name} /><KeyValue label="Monthly price" value={reviewPlan ? `${reviewPlan.currency} ${Number(reviewPlan.monthlyPrice).toLocaleString()}` : ""} /><KeyValue label="Billing cycle" value="Monthly" /><Alert severity="info">No payment or activation is confirmed by opening this form. If the provider is unavailable, the error will be shown here and your current plan remains unchanged.</Alert>
      </FormDialog>
    </>
  );
}
