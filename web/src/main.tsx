import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import "./styles.css";
import "./product.css";
import { makeTheme } from "./theme";
import { BrandBackdrop } from "./components/BrandBackdrop";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false }, mutations: { retry: 0 } } });

const theme = makeTheme("light");
function Root() {
  return <ThemeProvider theme={theme}><CssBaseline /><BrandBackdrop /><BrowserRouter><QueryClientProvider client={queryClient}><AuthProvider><App /></AuthProvider></QueryClientProvider></BrowserRouter></ThemeProvider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
