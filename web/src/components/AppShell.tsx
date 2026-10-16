import AssessmentOutlined from "@mui/icons-material/AssessmentOutlined";
import BuildOutlined from "@mui/icons-material/BuildOutlined";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import BusinessOutlined from "@mui/icons-material/BusinessOutlined";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import DevicesOutlined from "@mui/icons-material/DevicesOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
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
  alpha,
  AppBar,
  Avatar,
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
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
type NavigationGroup = "Workshop" | "Business" | "Administration";
interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  roles: Role[];
  group: NavigationGroup;
}
const nav: NavItem[] = [
  {
    label: "Overview",
    group: "Workshop",
    to: "/",
    icon: <DashboardOutlined />,
    roles: ["SUPER_ADMIN", "BUSINESS_ADMIN", "TECHNICIAN", "CUSTOMER"],
  },
  {
    label: "Businesses",
    group: "Administration",
    to: "/businesses",
    icon: <BusinessOutlined />,
    roles: ["SUPER_ADMIN"],
  },
  {
    label: "Repairs",
    group: "Workshop",
    to: "/repairs",
    icon: <BuildOutlined />,
    roles: ["BUSINESS_ADMIN", "TECHNICIAN", "CUSTOMER"],
  },
  {
    label: "Digital solutions",
    group: "Workshop",
    to: "/digital-services",
    icon: <CodeOutlined />,
    roles: ["BUSINESS_ADMIN", "TECHNICIAN", "CUSTOMER"],
  },
  {
    label: "Customers",
    group: "Workshop",
    to: "/customers",
    icon: <PeopleOutline />,
    roles: ["BUSINESS_ADMIN", "TECHNICIAN"],
  },
  {
    label: "Devices",
    group: "Workshop",
    to: "/devices",
    icon: <DevicesOutlined />,
    roles: ["BUSINESS_ADMIN", "TECHNICIAN"],
  },
  {
    label: "Technicians",
    group: "Workshop",
    to: "/technicians",
    icon: <EngineeringOutlined />,
    roles: ["BUSINESS_ADMIN"],
  },
  {
    label: "Inventory",
    group: "Workshop",
    to: "/inventory",
    icon: <Inventory2Outlined />,
    roles: ["BUSINESS_ADMIN", "TECHNICIAN"],
  },
  {
    label: "Invoices",
    group: "Business",
    to: "/invoices",
    icon: <ReceiptLongOutlined />,
    roles: ["BUSINESS_ADMIN", "CUSTOMER"],
  },
  {
    label: "Costs & utilities",
    group: "Business",
    to: "/expenses",
    icon: <AccountBalanceWalletOutlined />,
    roles: ["BUSINESS_ADMIN"],
  },
  {
    label: "Reports",
    group: "Business",
    to: "/reports",
    icon: <AssessmentOutlined />,
    roles: ["BUSINESS_ADMIN"],
  },
  {
    label: "Subscription",
    group: "Business",
    to: "/subscriptions",
    icon: <WorkspacePremiumOutlined />,
    roles: ["SUPER_ADMIN", "BUSINESS_ADMIN"],
  },
  {
    label: "Notifications",
    group: "Administration",
    to: "/notifications",
    icon: <NotificationsNoneOutlined />,
    roles: ["CUSTOMER", "TECHNICIAN", "BUSINESS_ADMIN"],
  },
  {
    label: "Audit trail",
    group: "Administration",
    to: "/audit",
    icon: <AssessmentOutlined />,
    roles: ["SUPER_ADMIN", "BUSINESS_ADMIN"],
  },
  {
    label: "Settings",
    group: "Administration",
    to: "/settings",
    icon: <SettingsOutlined />,
    roles: ["SUPER_ADMIN", "BUSINESS_ADMIN"],
  },
  {
    label: "Profile",
    group: "Administration",
    to: "/profile",
    icon: <PersonOutline />,
    roles: ["TECHNICIAN", "CUSTOMER"],
  },
];

export function AppShell() {
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
  const currentItem = items.find((item) => item.to !== "/" && location.pathname.startsWith(item.to)) ?? items[0];
  const currentLabel = location.pathname === "/search" ? "Search" : currentItem?.label ?? "Workspace";
  const currentGroup = location.pathname === "/search" ? "Business" : currentItem?.group ?? "RepairTrack";
  const roleLabel = { SUPER_ADMIN: "Platform administrator", BUSINESS_ADMIN: "Business administrator", TECHNICIAN: "Technician", CUSTOMER: "Customer" }[user.role];
  const searchForm = (
    <Box component="form" role="search" onSubmit={(event) => {
      event.preventDefault();
      if (search.trim().length >= 2) void navigate(`/search?q=${encodeURIComponent(search.trim())}`);
    }} sx={{ width: "100%", maxWidth: mobile ? undefined : 440, minWidth: 0 }}>
      <TextField
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        size="small"
        label="Search workspace"
        placeholder="Ticket, customer, serial or invoice"
        fullWidth
        slotProps={{
          htmlInput: { "aria-label": "Search workspace", minLength: 2 },
          inputLabel: { shrink: true },
          input: {
            endAdornment: <InputAdornment position="end"><IconButton type="submit" aria-label="Submit workspace search" disabled={search.trim().length < 2} edge="end" sx={{ width: 44, height: 44 }}><SearchOutlined fontSize="small" /></IconButton></InputAdornment>,
          },
        }}
      />
    </Box>
  );
  const drawer = (
    <Box className="product-ui" height="100%" minHeight={0} display="flex" flexDirection="column">
      <Box px={2} py={2} flexShrink={0}>
        {mobile && (
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="body2" color="text.secondary" fontWeight={650}>Navigation</Typography>
            <IconButton aria-label="Close navigation" onClick={() => setOpen(false)} sx={{ width: 44, height: 44 }}><ChevronLeft /></IconButton>
          </Stack>
        )}
        <BrandLogo className="brand-logo--nav" />
      </Box>
      <Divider />
      <Box component="nav" aria-label="Primary navigation" sx={{ px: 1.5, py: 1.5, flex: 1, minHeight: 0, overflowY: "auto" }}>
        {(["Workshop", "Business", "Administration"] as const).map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (!groupItems.length) return null;
          return <List key={group} disablePadding aria-label={group} sx={{ mb: 1.5 }} subheader={<ListSubheader disableSticky sx={{ px: 1.5, py: 1, lineHeight: 1.4, bgcolor: "transparent", color: "text.secondary", fontSize: 12, fontWeight: 700, letterSpacing: ".035em" }}>{group}</ListSubheader>}>
            {groupItems.map((item) => <ListItem key={item.to} disablePadding sx={{ display: "block" }}><ListItemButton
              component={NavLink}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setOpen(false)}
              selected={item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)}
              sx={{
                minHeight: 44, mb: 0.5, px: 1.5, py: 1, borderRadius: 2,
                "&.Mui-selected": { color: "text.primary", bgcolor: alpha(theme.palette.primary.main, 0.10), "& .MuiListItemIcon-root": { color: "primary.dark" }, "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.16) } },
                "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
              }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: "inherit", "& .MuiSvgIcon-root": { fontSize: 20 } }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 650, fontSize: 14, lineHeight: 1.4 }} />
            </ListItemButton></ListItem>)}
          </List>;
        })}
      </Box>
      <Divider />
      <Stack p={2} direction="row" alignItems="center" gap={1} flexShrink={0}>
        <Avatar
          aria-hidden="true" sx={{ width: 36, height: 36, bgcolor: "primary.dark", fontSize: 13 }}
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
          <Typography noWrap variant="caption" color="text.secondary" title={roleLabel}>{roleLabel}</Typography>
        </Box>
        <Tooltip title="Sign out">
          <IconButton aria-label="Sign out" onClick={() => void logout()} sx={{ width: 44, height: 44 }}>
            <LogoutOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );

  return (
    <Box className="product-ui" display="flex" minHeight="100vh">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobile ? (
        <Drawer
          className="product-ui"
          open={open}
          onClose={() => setOpen(false)}
          ModalProps={{ keepMounted: true }}
          slotProps={{ paper: { role: "dialog", "aria-modal": true, "aria-label": "RepairTrack navigation" } }}
          sx={{ "& .MuiDrawer-paper": { width: drawerWidth } }}
        >
          {drawer}
        </Drawer>
      ) : (
        <Drawer
          className="product-ui"
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
              "var(--glass-surface)",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Toolbar sx={{ gap: 1.5, minHeight: { xs: 64, sm: 72 } }}>
            {mobile && (
              <IconButton
                onClick={() => setOpen(true)}
                aria-label="Open navigation" aria-expanded={open} aria-haspopup="dialog"
                sx={{ width: 44, height: 44, flexShrink: 0 }}
              >
                <MenuIcon />
              </IconButton>
            )}
            <Box minWidth={0} sx={{ flexShrink: 1 }}>
              <Typography variant="caption" color="text.secondary" display="block" noWrap>{currentGroup}</Typography>
              <Typography variant="body2" fontWeight={700} noWrap>{currentLabel}</Typography>
            </Box>
            <Box flex={1} />
            {!mobile && user.role === "BUSINESS_ADMIN" && searchForm}
            {user.role !== "SUPER_ADMIN" && (
              <Tooltip title="Notifications">
                <IconButton aria-label={`Notifications${unread.data ? `, ${unread.data} unread` : ""}`} onClick={() => navigate("/notifications")} sx={{ width: 44, height: 44, flexShrink: 0 }}>
                  <Badge color="error" badgeContent={unread.data ?? 0} max={99}>
                    <NotificationsNoneOutlined />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}
          </Toolbar>
          {mobile && user.role === "BUSINESS_ADMIN" && <Box px={2} pb={2}>{searchForm}</Box>}
        </AppBar>
        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          p={{ xs: 2, sm: 3, lg: 4 }}
          maxWidth={1540}
          mx="auto"
        >
          <Box key={location.pathname}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
