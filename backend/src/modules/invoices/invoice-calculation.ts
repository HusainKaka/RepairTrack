export interface InvoiceCalculationInput {
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discount?: number;
}

export interface CalculatedLine extends Required<InvoiceCalculationInput> {
  lineTotal: number;
  taxAmount: number;
}

const cents = (value: number): number => Math.round((value + Number.EPSILON) * 100);
const money = (valueInCents: number): number => valueInCents / 100;

export function calculateInvoice(items: InvoiceCalculationInput[], invoiceDiscount = 0): { lines: CalculatedLine[]; subtotal: number; taxAmount: number; discountAmount: number; total: number } {
  if (!items.length) throw new Error("At least one invoice item is required.");
  if (invoiceDiscount < 0) throw new Error("Invoice discount cannot be negative.");
  let subtotalCents = 0;
  let taxCents = 0;
  let lineDiscountCents = 0;
  const lines = items.map((item) => {
    if (item.quantity <= 0 || item.unitPrice < 0) throw new Error("Invoice quantity must be positive and price cannot be negative.");
    const taxRate = item.taxRate ?? 0;
    const discount = item.discount ?? 0;
    if (taxRate < 0 || taxRate > 100 || discount < 0) throw new Error("Invoice tax and discount values are invalid.");
    const grossCents = cents(item.quantity * item.unitPrice);
    const discountCents = cents(discount);
    if (discountCents > grossCents) throw new Error("A line discount cannot exceed the line subtotal.");
    const taxableCents = grossCents - discountCents;
    const itemTaxCents = Math.round(taxableCents * taxRate / 100);
    subtotalCents += grossCents;
    lineDiscountCents += discountCents;
    taxCents += itemTaxCents;
    return { quantity: item.quantity, unitPrice: item.unitPrice, taxRate, discount, taxAmount: money(itemTaxCents), lineTotal: money(taxableCents + itemTaxCents) };
  });
  const invoiceDiscountCents = cents(invoiceDiscount);
  const preDiscountTotal = subtotalCents - lineDiscountCents + taxCents;
  if (invoiceDiscountCents > preDiscountTotal) throw new Error("The invoice discount cannot exceed the invoice total.");
  return { lines, subtotal: money(subtotalCents), taxAmount: money(taxCents), discountAmount: money(lineDiscountCents + invoiceDiscountCents), total: money(preDiscountTotal - invoiceDiscountCents) };
}

