import InboxOutlined from "@mui/icons-material/InboxOutlined";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return <Box minHeight={240} display="grid" sx={{ placeItems: "center" }} role="status" aria-live="polite"><Stack direction="row" alignItems="center" spacing={1.5}><CircularProgress size={22} aria-hidden="true" /><Typography color="text.secondary">{label}…</Typography></Stack></Box>;
}

export function ErrorBlock({ message, retry }: { message: string; retry?: () => void }) {
  return <Alert severity="error" sx={{ alignItems: "center" }} action={retry ? <Button color="inherit" onClick={retry}>Try again</Button> : undefined}><Typography fontWeight={650} variant="body2">We couldn’t load this view</Typography><Typography variant="body2">{message}</Typography></Alert>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Paper variant="outlined" sx={{ textAlign: "center", py: { xs: 4, sm: 6 }, px: 3 }}><InboxOutlined sx={{ fontSize: 32, color: "text.secondary" }} aria-hidden="true" /><Typography component="h2" variant="h6" mt={1.5}>{title}</Typography><Typography color="text.secondary" maxWidth={440} mx="auto" mt={1} fontSize={14}>{description}</Typography>{action && <Box mt={2.5}>{action}</Box>}</Paper>;
}

