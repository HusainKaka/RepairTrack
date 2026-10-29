import { Alert, Button } from "@mui/material";
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { LoadingBlock } from "./Feedback";

class PageLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <Alert severity="error" action={<Button color="inherit" onClick={() => window.location.reload()}>Reload page</Button>}>This page could not open. Check your connection and reload; your saved records are unchanged.</Alert> : this.props.children;
  }
}

/** Keep the shell and protected background mounted while only a route loads. */
export function deferredPage(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(load);
  return function DeferredPage() { return <PageLoadBoundary><Suspense fallback={<LoadingBlock label="Opening page" />}><Page /></Suspense></PageLoadBoundary>; };
}
