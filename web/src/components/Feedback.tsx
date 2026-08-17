import InboxOutlined from "@mui/icons-material/InboxOutlined";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return <Box minHeight={240} display="grid" sx={{ placeItems: "center" }}><Stack alignItems="center" spacing={1.5}><CircularProgress size={32} /><Typography color="text.secondary">{label}…</Typography></Stack></Box>;
}

export function ErrorBlock({ message, retry }: { message: string; retry?: () => void }) {
  return <Alert severity="error" action={retry ? <Button color="inherit" onClick={retry}>Retry</Button> : undefined}>{message}</Alert>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Box textAlign="center" py={8} px={3}><InboxOutlined sx={{ fontSize: 44, color: "text.disabled" }} /><Typography variant="h6" mt={1}>{title}</Typography><Typography color="text.secondary" maxWidth={440} mx="auto" mt={.5}>{description}</Typography>{action && <Box mt={2}>{action}</Box>}</Box>;
}

