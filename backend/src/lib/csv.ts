/** Quoting alone does not stop spreadsheets interpreting untrusted formulas. */
export function csvCell(value: string | number | boolean | Date | null | undefined): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (typeof value === "string" && (/^[=+@-]/.test(text.replace(/^[\s\p{Cc}]+/u, "")) || [9, 10, 13].includes(text.charCodeAt(0)))) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
