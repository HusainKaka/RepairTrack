import { Box, Button, Typography } from "@mui/material";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute, RoleRoute } from "./components/RouteGuards";
import {
  AuditPage,
  CustomerDetailPage,
  NotificationsPage,
  ProfilePage,
  PublicTrackPage,
  SettingsPage,
} from "./pages/AccountPages";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  SignupPage,
  VerifyEmailPage,
} from "./pages/AuthPages";
import {
  GlobalSearchPage,
  InvoiceDetailPage,
  InvoicesPage,
  ReportsPage,
} from "./pages/BillingPages";
import { DashboardPage } from "./pages/DashboardPage";
import {
  BusinessesPage,
  CustomersPage,
  DevicesPage,
  InventoryPage,
  TechniciansPage,
} from "./pages/DirectoryPages";
import { ExpensesPage } from "./pages/ExpensePages";
import { LoginPage } from "./pages/LoginPage";
import { RepairDetailPage, RepairsPage } from "./pages/RepairPages";
import { SubscriptionsPage } from "./pages/SubscriptionPages";

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

export function App({
  mode,
  toggleMode,
}: {
  mode: "light" | "dark";
  toggleMode(): void;
}) {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/track" element={<PublicTrackPage />} />
      <Route path="/track/:token" element={<PublicTrackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell mode={mode} toggleMode={toggleMode} />}>
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
