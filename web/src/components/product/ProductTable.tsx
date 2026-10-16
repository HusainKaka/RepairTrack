import { Box, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Typography } from "@mui/material";
import { useId, useState, type ReactNode } from "react";
import { useRecordLayout } from "./useRecordLayout";

export interface ProductTableProps {
  columns: string[];
  rows: ReactNode[][];
  empty?: string;
  caption?: string;
  rowKeys?: string[];
  mobileSummaryColumns?: number[];
  pageSize?: number;
  paginated?: boolean;
  minTableWidth?: number;
}

/** Pages only the supplied records; never implies a server-side total. */
export function ProductTable({ columns, rows, empty = "No records yet.", caption, rowKeys, mobileSummaryColumns = [0], pageSize = 15, paginated = true, minTableWidth = Math.max(320, columns.length * 128) }: ProductTableProps) {
  const { containerRef, compact } = useRecordLayout(minTableWidth);
  const captionId = useId();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / size) - 1));
  const offset = paginated ? safePage * size : 0;
  const displayed = paginated ? rows.slice(offset, offset + size) : rows;
  if (!rows.length) return <Paper className="product-table-empty" variant="outlined" sx={{ p: { xs: 3, sm: 5 }, textAlign: "center" }}><Typography color="text.secondary" role="status">{empty}</Typography></Paper>;
  return <Paper ref={containerRef} className="product-table" sx={{ minWidth: 0 }}>
    {caption && <Box px={{ xs: 2, sm: 2.5 }} py={1.5} borderBottom={1} borderColor="divider"><Typography id={captionId} variant="body2" color="text.secondary">{caption}</Typography></Box>}
    {compact ? <Box component="ul" aria-label={caption ?? "Records"} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {displayed.map((cells, index) => <Box component="li" key={rowKeys?.[offset + index] ?? offset + index} sx={{ p: 2, borderBottom: index < displayed.length - 1 ? 1 : 0, borderColor: "divider" }}>
        <Stack spacing={0.5} mb={1.5}>{mobileSummaryColumns.map((column) => <Box key={column} sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>{cells[column]}</Box>)}</Stack>
        <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5, m: 0 }}>{cells.map((cell, column) => mobileSummaryColumns.includes(column) ? null : <Box key={column} sx={{ minWidth: 0 }}><Typography component="dt" variant="caption" color="text.secondary" mb={0.5}>{columns[column]}</Typography><Box component="dd" sx={{ m: 0, fontSize: 14, overflowWrap: "anywhere", "& .MuiButton-root": { whiteSpace: "normal", textAlign: "left" } }}>{cell}</Box></Box>)}</Box>
      </Box>)}
    </Box> : <TableContainer sx={{ maxWidth: "100%" }} role="region" tabIndex={0} aria-label="Scrollable records" className="product-table-scroll"><Table sx={{ minWidth: minTableWidth }} aria-describedby={caption ? captionId : undefined}>
      <TableHead><TableRow>{columns.map((column) => <TableCell scope="col" key={column}>{column}</TableCell>)}</TableRow></TableHead>
      <TableBody>{displayed.map((cells, index) => <TableRow hover key={rowKeys?.[offset + index] ?? offset + index}>{cells.map((cell, column) => <TableCell key={column} sx={{ overflowWrap: "break-word" }}>{cell}</TableCell>)}</TableRow>)}</TableBody>
    </Table></TableContainer>}
    {paginated && rows.length > pageSize && <TablePagination component="div" count={rows.length} page={safePage} rowsPerPage={size} rowsPerPageOptions={[...new Set([pageSize, 15, 30, 60])].sort((a, b) => a - b)} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={(event) => { setSize(Number(event.target.value)); setPage(0); }} labelRowsPerPage="Loaded rows" labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count} loaded`} sx={{ borderTop: 1, borderColor: "divider", ".MuiTablePagination-toolbar": { flexWrap: "wrap", px: 1 }, ".MuiTablePagination-spacer": { display: "none" }, ".MuiTablePagination-selectLabel": { display: { xs: "none", sm: "block" } } }} />}
  </Paper>;
}
