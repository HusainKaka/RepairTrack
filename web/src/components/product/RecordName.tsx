import { Typography } from "@mui/material";

/** Two visual lines; the complete value remains in the DOM and hover title. */
export function RecordName({ children, fontWeight = 650 }: { children: string; fontWeight?: number }) {
  return <Typography component="span" variant="inherit" className="product-record-name" title={children} sx={{ fontWeight }}>{children}</Typography>;
}
