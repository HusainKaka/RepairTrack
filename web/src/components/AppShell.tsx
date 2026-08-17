import AssessmentOutlined from "@mui/icons-material/AssessmentOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import DevicesOutlined from "@mui/icons-material/DevicesOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsNoneOutlined from "@mui/icons-material/NotificationsNoneOutlined";
import PeopleOutline from "@mui/icons-material/PeopleOutline";
import PersonOutline from "@mui/icons-material/PersonOutline";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import EngineeringOutlined from "@mui/icons-material/EngineeringOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../api/client";
import type { ApiEnvelope, Role } from "../types";
import { BrandLogo } from "./BrandLogo";

const drawerWidth = 268;
interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  roles: Role[];
}
const nav: NavItem[] = [
  {
    label: "Overview",
    to: "/",
    icon: <DashboardOutlined />,
    roles: ["SUPER_ADMIN", "BUSINESS_ADMIN", "TECHNICIAN", "CUSTOMER"],
  },
  {
    label: "Businesses",
    to: "/businesses",
    icon: <BusinessOutlined />,
    roles: ["SUPER_ADMIN"],
  },
  {
    label: "Repairs",
    to: "/repairs",
    icon: <BuildOutlined />,
    roles: ["BUSINESS_ADMIN", "TECHNICIAN", "CUSTOMER"],
  },
  {
    label: "Customers",
    to: "/customers",
    icon: <PeopleOutline />,
    roles: ["BUSINESS_ADMIN", "TECHNICIAN"],
  },
  {
    label: "Devices",
    to: "/devices",
    icon: <DevicesOutlined />,
    roles: ["BUSINESS_ADMIN", "TECHNICIAN"],
  },
  {
    label: "Technicians",
    to: "/technicians",
    icon: <EngineeringOutlined />,
    roles: ["BUSINESS_ADMIN"],
  },
  {
    label: "Inventory",
    to: "/inventory",
    icon: <Inventory2Outlined />,
    roles: ["BUSINESS_ADMIN", "TECHNICIAN"],
  },
  {
    label: "Invoices",
    to: "/invoices",
    icon: <ReceiptLongOutlined />,
    roles: ["BUSINESS_ADMIN", "CUSTOMER"],
  },
  {
    label: "Costs & utilities",
    to: "/expenses",
    icon: <AccountBalanceWalletOutlined />,
    roles: ["BUSINESS_ADMIN"],
  },
  {
    label: "Reports",
    to: "/reports",
    icon: <AssessmentOutlined />,
    roles: ["BUSINESS_ADMIN"],
  },
  {
    label: "Subscription",
    to: "/subscriptions",
    icon: <WorkspacePremiumOutlined />,
    roles: ["SUPER_ADMIN", "BUSINESS_ADMIN"],
  },
  {
    label: "Notifications",
    to: "/notifications",
    icon: <NotificationsNoneOutlined />,
    roles: ["CUSTOMER", "TECHNICIAN", "BUSINESS_ADMIN"],
  },
  {
    label: "Audit trail",
    to: "/audit",
    icon: <AssessmentOutlined />,
    roles: ["SUPER_ADMIN", "BUSINESS_ADMIN"],
  },
  {
    label: "Settings",
    to: "/settings",
    icon: <SettingsOutlined />,
    roles: ["SUPER_ADMIN", "BUSINESS_ADMIN"],
  },
  {
    label: "Profile",
    to: "/profile",
    icon: <PersonOutline />,
    roles: ["TECHNICIAN", "CUSTOMER"],
  },
];

export function AppShell({
  mode,
  toggleMode,
}: {
  mode: "light" | "dark";
  toggleMode: () => void;
}) {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const unread = useQuery({
    queryKey: ["notification-unread-count"],
    queryFn: async () =>
      (
        await api.get<ApiEnvelope<{ count: number }>>(
          "/notifications/unread-count",
        )
      ).data.data.count,
    enabled: Boolean(user && user.role !== "SUPER_ADMIN"),
    refetchInterval: 60_000,
  });
  if (!user) return null;
  const items = nav.filter((item) => item.roles.includes(user.role));
  const drawer = (
    <Box height="100%" display="flex" flexDirection="column">
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.4}
        px={2.5}
        py={1.5}
      >
        <BrandLogo className="brand-logo--nav" />
        {mobile && (
          <IconButton sx={{ ml: "auto" }} onClick={() => setOpen(false)}>
            <ChevronLeft />
          </IconButton>
        )}
      </Stack>
      <Divider />
      <List sx={{ px: 1.5, py: 2, flex: 1 }}>
        {items.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            onClick={() => setOpen(false)}
            selected={
              item.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.to)
            }
            sx={{
              mb: 0.5,
              borderRadius: 2.5,
              "&.Mui-selected": {
                color: "primary.contrastText",
                bgcolor: "primary.main",
                "&:hover": { bgcolor: "primary.dark" },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 42, color: "inherit" }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{ fontWeight: 700, fontSize: 14 }}
            />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <Stack p={2} direction="row" alignItems="center" gap={1.2}>
        <Avatar
          sx={{ width: 38, height: 38, bgcolor: "primary.main", fontSize: 14 }}
        >
          {user.fullName
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")}
        </Avatar>
        <Box minWidth={0} flex={1}>
          <Typography noWrap fontWeight={700} fontSize={13}>
            {user.fullName}
          </Typography>
          <Typography noWrap variant="caption" color="text.secondary">
            {user.role.replaceAll("_", " ")}
          </Typography>
        </Box>
        <Tooltip title="Sign out">
          <IconButton size="small" onClick={() => void logout()}>
            <LogoutOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );

  return (
    <Box display="flex" minHeight="100vh">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobile ? (
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ "& .MuiDrawer-paper": { width: drawerWidth } }}
        >
          {drawer}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              borderRightColor: "divider",
            },
          }}
        >
          {drawer}
        </Drawer>
      )}
      <Box flex={1} minWidth={0}>
        <AppBar
          position="sticky"
          elevation={0}
          color="transparent"
          className="no-print"
          sx={{
            backdropFilter: "blur(16px)",
            bgcolor:
              mode === "light" ? "rgba(248,250,252,.84)" : "rgba(7,16,31,.84)",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Toolbar sx={{ gap: 1.5 }}>
            {mobile && (
              <IconButton
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <MenuIcon />
              </IconButton>
            )}
            {user.role === "BUSINESS_ADMIN" && (
              <TextField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && search.trim())
                    void navigate(
                      `/search?q=${encodeURIComponent(search.trim())}`,
                    );
                }}
                size="small"
                placeholder="Search repairs, customers, IMEI, invoice…"
                aria-label="Global search"
                sx={{ flex: 1, maxWidth: 560 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}
            <Box flex={1} />
            <Tooltip title={`Use ${mode === "light" ? "dark" : "light"} mode`}>
              <IconButton onClick={toggleMode}>
                {mode === "light" ? (
                  <DarkModeOutlined />
                ) : (
                  <LightModeOutlined />
                )}
              </IconButton>
            </Tooltip>
            {user.role !== "SUPER_ADMIN" && (
              <Tooltip title="Notifications">
                <IconButton onClick={() => navigate("/notifications")}>
                  <Badge color="error" badgeContent={unread.data ?? 0} max={99}>
                    <NotificationsNoneOutlined />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}
          </Toolbar>
        </AppBar>
        <Box
          component="main"
          id="main-content"
          p={{ xs: 2, sm: 3, lg: 4 }}
          maxWidth={1540}
          mx="auto"
        >
          <Box className="page-enter" key={location.pathname}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
