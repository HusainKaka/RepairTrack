import { createTheme, type PaletteMode } from "@mui/material/styles";

export const makeTheme = (mode: PaletteMode) => createTheme({
  palette: {
    mode,
    primary: { main: mode === "light" ? "#0055B8" : "#6CCBFF", dark: mode === "light" ? "#003779" : "#38B6F5", contrastText: mode === "light" ? "#FFFFFF" : "#06243F" },
    secondary: { main: mode === "light" ? "#004482" : "#8CD9FF" },
    success: { main: "#10B981" }, warning: { main: "#F59E0B" }, error: { main: "#EF4444" },
    text: { primary: mode === "light" ? "#102B49" : "#E6F3FF", secondary: mode === "light" ? "#50667E" : "#ADC4DB" },
    divider: mode === "light" ? "rgba(40,98,153,.14)" : "rgba(142,191,230,.18)",
    background: { default: mode === "light" ? "#F3F5F8" : "#07172B", paper: mode === "light" ? "#F8FBFF" : "#10243D" }
  },
  shape: { borderRadius: 18 },
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif', h1: { fontWeight: 750, letterSpacing: "-0.04em" }, h2: { fontWeight: 750, letterSpacing: "-0.03em" }, h5: { fontWeight: 700 }, button: { textTransform: "none", fontWeight: 700 } },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { "--brand-ink": mode === "light" ? "#07356A" : "#DCEFFF", "--brand-muted": mode === "light" ? "#50667E" : "#ADC4DB", "--glass-surface": mode === "light" ? "rgba(255,255,255,.68)" : "rgba(13,32,57,.78)", "--glass-solid": mode === "light" ? "#F8FBFF" : "#10243D", "--glass-border": mode === "light" ? "rgba(255,255,255,.92)" : "rgba(137,193,236,.18)" } } },
    MuiButton: { styleOverrides: { root: { minHeight: 42, borderRadius: 999, boxShadow: "none", "&:focus-visible": { outline: "3px solid #009FE9", outlineOffset: 3 } }, containedPrimary: { backgroundImage: mode === "light" ? "linear-gradient(180deg, #086ACB, #004B9F)" : "linear-gradient(180deg, #91DFFF, #59C1F6)" } } },
    MuiCard: { styleOverrides: { root: { background: "var(--glass-surface)", backdropFilter: "blur(20px)", border: "1px solid var(--glass-border)", borderRadius: 24, boxShadow: "0 18px 48px -30px rgba(0,57,119,.3), inset 0 1px 0 rgba(255,255,255,.15)" } } },
    MuiPaper: { styleOverrides: { rounded: { backgroundImage: "none", backgroundColor: "var(--glass-surface)", backdropFilter: "blur(20px)", border: "1px solid var(--glass-border)" } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundImage: "none", backgroundColor: "var(--glass-surface)", backdropFilter: "blur(24px)" } } },
    MuiDialog: { styleOverrides: { paper: { backgroundColor: "var(--glass-solid)" } } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12, backgroundColor: mode === "light" ? "rgba(255,255,255,.54)" : "rgba(7,23,43,.48)" } } },
    MuiTableCell: { styleOverrides: { head: { color: mode === "light" ? "#64748B" : "#94A3B8", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" } } }
  }
});

