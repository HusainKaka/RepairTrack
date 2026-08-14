import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} gap={2} mb={3}><Box><Typography variant="h4" fontWeight={800} letterSpacing="-.035em">{title}</Typography>{description && <Typography color="text.secondary" mt={.5}>{description}</Typography>}</Box>{actions && <Stack direction="row" gap={1}>{actions}</Stack>}</Stack>;
}

