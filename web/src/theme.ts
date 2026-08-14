import { createTheme, type PaletteMode } from "@mui/material/styles";

export const makeTheme = (mode: PaletteMode) => createTheme({
  palette: {
    mode,
    primary: { main: "#2563EB", dark: "#1D4ED8", contrastText: "#FFFFFF" },
    secondary: { main: "#0F172A" },
    success: { main: "#10B981" }, warning: { main: "#F59E0B" }, error: { main: "#EF4444" },
    background: { default: mode === "light" ? "#F8FAFC" : "#07101F", paper: mode === "light" ? "#FFFFFF" : "#0F172A" }
  },
  shape: { borderRadius: 14 },
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif', h1: { fontWeight: 750, letterSpacing: "-0.04em" }, h2: { fontWeight: 750, letterSpacing: "-0.03em" }, h5: { fontWeight: 700 }, button: { textTransform: "none", fontWeight: 700 } },
  components: {
    MuiButton: { styleOverrides: { root: { minHeight: 42, boxShadow: "none" } } },
    MuiCard: { styleOverrides: { root: { border: mode === "light" ? "1px solid #E2E8F0" : "1px solid #1E293B", boxShadow: "0 8px 28px rgba(15,23,42,0.05)" } } },
    MuiTableCell: { styleOverrides: { head: { color: mode === "light" ? "#64748B" : "#94A3B8", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" } } }
  }
});

