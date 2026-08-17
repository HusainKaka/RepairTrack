import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import "./styles.css";
import { makeTheme } from "./theme";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false }, mutations: { retry: 0 } } });

function Root() {
  const [mode, setMode] = useState<"light" | "dark">(() => localStorage.getItem("repairtrack-color-mode") === "dark" ? "dark" : "light");
  const theme = useMemo(() => makeTheme(mode), [mode]);
  const toggleMode = () => setMode((current) => { const next = current === "light" ? "dark" : "light"; localStorage.setItem("repairtrack-color-mode", next); return next; });
  return <ThemeProvider theme={theme}><CssBaseline /><BrowserRouter><QueryClientProvider client={queryClient}><AuthProvider><App mode={mode} toggleMode={toggleMode} /></AuthProvider></QueryClientProvider></BrowserRouter></ThemeProvider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
