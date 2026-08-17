import Add from "@mui/icons-material/Add";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { ReactNode } from "react";

export function DataTable({ columns, rows, empty = "No records yet." }: { columns: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}><Typography color="text.secondary">{empty}</Typography></Paper>;
  return <TableContainer component={Paper}><Table><TableHead><TableRow>{columns.map((column) => <TableCell key={column}>{column}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((cells, rowIndex) => <TableRow hover key={rowIndex}>{cells.map((cell, columnIndex) => <TableCell key={columnIndex}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>;
}

export function FormDialog({ open, title, children, busy, error, submitLabel = "Save", submitDisabled = false, onClose, onSubmit }: { open: boolean; title: string; children: ReactNode; busy?: boolean; error?: string; submitLabel?: string; submitDisabled?: boolean; onClose(): void; onSubmit(): void }) {
  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm"><DialogTitle>{title}</DialogTitle><DialogContent><Stack spacing={2} pt={1}>{error && <Alert severity="error">{error}</Alert>}{children}</Stack></DialogContent><DialogActions sx={{ p: 3 }}><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="contained" onClick={onSubmit} disabled={busy || submitDisabled}>{submitLabel}</Button></DialogActions>{busy && <LinearProgress />}</Dialog>;
}

export function CreateButton({ label, onClick }: { label: string; onClick(): void }) { return <Button variant="contained" startIcon={<Add />} onClick={onClick}>{label}</Button>; }

export function KeyValue({ label, value }: { label: string; value: ReactNode }) { return <Box><Typography variant="caption" color="text.secondary" textTransform="uppercase" letterSpacing=".06em">{label}</Typography><Typography fontWeight={650}>{value || "—"}</Typography></Box>; }
