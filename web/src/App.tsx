import { Box, Button, Typography } from "@mui/material";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute, RoleRoute } from "./components/RouteGuards";
import { deferredPage } from "./components/DeferredPage";

const AuditPage = deferredPage(() => import("./pages/AccountPages").then(m => ({ default: m.AuditPage })));
const CustomerDetailPage = deferredPage(() => import("./pages/AccountPages").then(m => ({ default: m.CustomerDetailPage })));
const NotificationsPage = deferredPage(() => import("./pages/AccountPages").then(m => ({ default: m.NotificationsPage })));
const ProfilePage = deferredPage(() => import("./pages/AccountPages").then(m => ({ default: m.ProfilePage })));
const PublicTrackPage = deferredPage(() => import("./pages/AccountPages").then(m => ({ default: m.PublicTrackPage })));
const SettingsPage = deferredPage(() => import("./pages/AccountPages").then(m => ({ default: m.SettingsPage })));
const ForgotPasswordPage = deferredPage(() => import("./pages/AuthPages").then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = deferredPage(() => import("./pages/AuthPages").then(m => ({ default: m.ResetPasswordPage })));
const SignupPage = deferredPage(() => import("./pages/AuthPages").then(m => ({ default: m.SignupPage })));
const VerifyEmailPage = deferredPage(() => import("./pages/AuthPages").then(m => ({ default: m.VerifyEmailPage })));
const GlobalSearchPage = deferredPage(() => import("./pages/BillingPages").then(m => ({ default: m.GlobalSearchPage })));
const InvoiceDetailPage = deferredPage(() => import("./pages/BillingPages").then(m => ({ default: m.InvoiceDetailPage })));
const InvoicesPage = deferredPage(() => import("./pages/BillingPages").then(m => ({ default: m.InvoicesPage })));
const ReportsPage = deferredPage(() => import("./pages/BillingPages").then(m => ({ default: m.ReportsPage })));
const DashboardPage = deferredPage(() => import("./pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const BusinessesPage = deferredPage(() => import("./pages/DirectoryPages").then(m => ({ default: m.BusinessesPage })));
const CustomersPage = deferredPage(() => import("./pages/DirectoryPages").then(m => ({ default: m.CustomersPage })));
const DevicesPage = deferredPage(() => import("./pages/DirectoryPages").then(m => ({ default: m.DevicesPage })));
const InventoryPage = deferredPage(() => import("./pages/DirectoryPages").then(m => ({ default: m.InventoryPage })));
const TechniciansPage = deferredPage(() => import("./pages/DirectoryPages").then(m => ({ default: m.TechniciansPage })));
const ExpensesPage = deferredPage(() => import("./pages/ExpensePages").then(m => ({ default: m.ExpensesPage })));
const LoginPage = deferredPage(() => import("./pages/LoginPage").then(m => ({ default: m.LoginPage })));
const RepairDetailPage = deferredPage(() => import("./pages/RepairPages").then(m => ({ default: m.RepairDetailPage })));
const RepairsPage = deferredPage(() => import("./pages/RepairPages").then(m => ({ default: m.RepairsPage })));
const SubscriptionsPage = deferredPage(() => import("./pages/SubscriptionPages").then(m => ({ default: m.SubscriptionsPage })));
const DigitalServiceDetailPage = deferredPage(() => import("./pages/DigitalServicePages").then(m => ({ default: m.DigitalServiceDetailPage })));
const DigitalServicesPage = deferredPage(() => import("./pages/DigitalServicePages").then(m => ({ default: m.DigitalServicesPage })));
const PublicDigitalTrackPage = deferredPage(() => import("./pages/DigitalServicePages").then(m => ({ default: m.PublicDigitalTrackPage })));

function NotFoundPage() {
  return (
    <Box
      minHeight="70vh"
      display="grid"
      sx={{ placeItems: "center", textAlign: "center" }}
    >
      <Box>
        <Typography variant="h1">404</Typography>
        <Typography color="text.secondary" mb={2}>
          That RepairTrack page does not exist.
        </Typography>
        <Button href="/" variant="contained">
          Return to dashboard
        </Button>
      </Box>
    </Box>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/track" element={<PublicTrackPage />} />
      <Route path="/track/:token" element={<PublicTrackPage />} />
      <Route path="/track/digital/:token" element={<PublicDigitalTrackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route element={<RoleRoute roles={["SUPER_ADMIN"]} />}>
            <Route path="businesses" element={<BusinessesPage />} />
          </Route>
          <Route
            element={
              <RoleRoute roles={["BUSINESS_ADMIN", "TECHNICIAN", "CUSTOMER"]} />
            }
          >
            <Route path="repairs" element={<RepairsPage />} />
            <Route path="repairs/:id" element={<RepairDetailPage />} />
            <Route path="digital-services" element={<DigitalServicesPage />} />
            <Route path="digital-services/:id" element={<DigitalServiceDetailPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
          </Route>
          <Route
            element={<RoleRoute roles={["BUSINESS_ADMIN", "TECHNICIAN"]} />}
          >
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="inventory" element={<InventoryPage />} />
          </Route>
          <Route element={<RoleRoute roles={["BUSINESS_ADMIN"]} />}>
            <Route path="technicians" element={<TechniciansPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="search" element={<GlobalSearchPage />} />
          </Route>
          <Route element={<RoleRoute roles={["BUSINESS_ADMIN", "CUSTOMER"]} />}>
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/:id" element={<InvoiceDetailPage />} />
          </Route>
          <Route
            element={<RoleRoute roles={["SUPER_ADMIN", "BUSINESS_ADMIN"]} />}
          >
            <Route path="subscriptions" element={<SubscriptionsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route element={<RoleRoute roles={["TECHNICIAN", "CUSTOMER"]} />}>
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          <Route path="404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
