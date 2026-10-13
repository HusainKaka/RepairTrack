import { createTheme, type PaletteMode } from "@mui/material/styles";

export const makeTheme = (requestedMode: PaletteMode) => {
  // The supplied AURA reference and explicit user choice are light-only.
  void requestedMode; // Retain call compatibility; saved/system dark mode cannot override the reference.
  const mode: PaletteMode = "light";
  return createTheme({
  palette: {
    mode,
    primary: { main: "#3B82F6", dark: "#2563EB", contrastText: "#FFFFFF" },
    secondary: { main: mode === "light" ? "#004482" : "#8CD9FF" },
    success: { main: "#10B981" }, warning: { main: "#F59E0B" }, error: { main: "#EF4444" },
    text: { primary: "#0F172A", secondary: "#475569" },
    divider: mode === "light" ? "rgba(40,98,153,.14)" : "rgba(142,191,230,.18)",
    background: { default: mode === "light" ? "#F3F5F8" : "#07172B", paper: mode === "light" ? "#F8FBFF" : "#10243D" }
  },
  shape: { borderRadius: 18 },
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif', h1: { fontWeight: 750, letterSpacing: "-0.04em" }, h2: { fontWeight: 750, letterSpacing: "-0.03em" }, h5: { fontWeight: 700 }, button: { textTransform: "none", fontWeight: 700 } },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { colorScheme: "light", "--brand-ink": "#0F172A", "--brand-muted": "#475569", "--glass-surface": "rgba(255,255,255,.60)", "--glass-solid": "#F8FBFF", "--glass-border": "rgba(255,255,255,.90)" }, "::selection": { background: "#DBEAFE", color: "#1E3A8A" } } },
    MuiButton: { styleOverrides: { root: { minHeight: 42, borderRadius: 999, backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,.9)", boxShadow: "0 8px 20px -14px rgba(15,23,42,.35), inset 0 1px 0 rgba(255,255,255,.9)", "&:focus-visible": { outline: "3px solid #3B82F6", outlineOffset: 3 } }, containedPrimary: { backgroundImage: "linear-gradient(180deg, rgba(59,130,246,.94), rgba(37,99,235,.96))", borderColor: "rgba(29,78,216,.5)", "&.Mui-disabled": { backgroundImage: "none" } }, outlined: { background: "rgba(255,255,255,.5)", borderColor: "#BFDBFE", color: "#1D4ED8" }, text: { background: "rgba(255,255,255,.36)", color: "#1D4ED8" } } },
    MuiCard: { styleOverrides: { root: { background: "var(--glass-surface)", backdropFilter: "blur(24px)", border: "1px solid var(--glass-border)", borderRadius: 24, boxShadow: "0 30px 80px -45px rgba(15,23,42,.35), inset 0 1px 0 #fff" } } },
    MuiPaper: { styleOverrides: { rounded: { backgroundImage: "none", backgroundColor: "var(--glass-surface)", backdropFilter: "blur(24px)", border: "1px solid var(--glass-border)", boxShadow: "0 14px 38px -22px rgba(15,23,42,.32), inset 0 1px 0 #fff" } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundImage: "none", backgroundColor: "var(--glass-surface)", backdropFilter: "blur(24px)" } } },
    MuiDialog: { styleOverrides: { paper: { backgroundColor: "var(--glass-solid)" } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12, backgroundColor: mode === "light" ? "rgba(255,255,255,.54)" : "rgba(7,23,43,.48)" } } },
    MuiTableCell: { styleOverrides: { head: { color: mode === "light" ? "#64748B" : "#94A3B8", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" } } }
  }
  });
};

