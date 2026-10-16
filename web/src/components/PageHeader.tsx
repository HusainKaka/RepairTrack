import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: ReactNode }) {
  return <Stack className="product-page-header" direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", md: "center" }} gap={2.5} mb={3.5}><Box sx={{ minWidth: 0 }}>{eyebrow && <Typography variant="caption" color="text.secondary" display="block" mb={1}>{eyebrow}</Typography>}<Typography component="h1" sx={{ fontSize: { xs: 28, sm: 32 }, lineHeight: 1.2, fontWeight: 750, letterSpacing: "-.04em", overflowWrap: "anywhere" }}>{title}</Typography>{description && <Typography color="text.secondary" mt={1} sx={{ maxWidth: "72ch", fontSize: 15, lineHeight: 1.6 }}>{description}</Typography>}</Box>{actions && <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1} sx={{ flexShrink: 0, maxWidth: { md: "52%" }, "& > .MuiStack-root": { flexWrap: "wrap", alignItems: "center" } }}>{actions}</Stack>}</Stack>;
}

