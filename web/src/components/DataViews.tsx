import Add from "@mui/icons-material/Add";
import { Box, Button, Typography } from "@mui/material";
import type { ReactNode } from "react";

export { ProductTable as DataTable } from "./product/ProductTable";
export { ProductFormDialog as FormDialog } from "./product/ProductFormDialog";

export function CreateButton({ label, onClick }: { label: string; onClick(): void }) { return <Button variant="contained" startIcon={<Add />} onClick={onClick}>{label}</Button>; }

export function KeyValue({ label, value }: { label: string; value: ReactNode }) { return <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary" display="block" mb={0.5} sx={{ fontSize: 12, fontWeight: 550 }}>{label}</Typography><Box sx={{ fontWeight: 650, fontSize: 14, lineHeight: 1.5, overflowWrap: "anywhere" }}>{value === null || value === undefined || value === "" ? "—" : value}</Box></Box>; }
