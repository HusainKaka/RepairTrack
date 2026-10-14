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
export const MAX_INVOICE_MONEY = 9_999_999_999.99;
const maxCents = 999_999_999_999;
const invalid = (message: string) => new AppError(422, "INVALID_INVOICE_VALUES", message);
const twoDecimals = (value: number) => Number(value.toFixed(2)) === value;
const validMoney = (value: number) => Number.isFinite(value) && value >= 0 && value <= MAX_INVOICE_MONEY && twoDecimals(value);

export function calculateInvoice(items: InvoiceCalculationInput[], invoiceDiscount = 0): { lines: CalculatedLine[]; subtotal: number; taxAmount: number; discountAmount: number; total: number } {
  if (!items.length || items.length > 100) throw invalid("An invoice requires between one and 100 items.");
  if (!validMoney(invoiceDiscount)) throw invalid("Invoice discount is outside the supported range.");
  let subtotalCents = 0;
  let taxCents = 0;
  let lineDiscountCents = 0;
  const lines = items.map((item) => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 10_000 || !twoDecimals(item.quantity) || !validMoney(item.unitPrice)) throw invalid("Invoice quantity or price is outside the supported range; use at most two decimal places.");
    const taxRate = item.taxRate ?? 0;
    const discount = item.discount ?? 0;
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !twoDecimals(taxRate) || !validMoney(discount)) throw invalid("Invoice tax and discount values are invalid; use at most two decimal places.");
    const grossCents = cents(item.quantity * item.unitPrice);
    const discountCents = cents(discount);
    if (!Number.isSafeInteger(grossCents) || grossCents > maxCents) throw invalid("A line subtotal exceeds the supported monetary range.");
    if (discountCents > grossCents) throw invalid("A line discount cannot exceed the line subtotal.");
    const taxableCents = grossCents - discountCents;
    const itemTaxCents = Math.round(taxableCents * taxRate / 100);
    subtotalCents += grossCents;
    lineDiscountCents += discountCents;
    taxCents += itemTaxCents;
    if (subtotalCents > maxCents || taxCents > maxCents || lineDiscountCents > maxCents || taxableCents + itemTaxCents > maxCents) throw invalid("Invoice totals exceed the supported monetary range.");
    return { quantity: item.quantity, unitPrice: item.unitPrice, taxRate, discount, taxAmount: money(itemTaxCents), lineTotal: money(taxableCents + itemTaxCents) };
  });
  const invoiceDiscountCents = cents(invoiceDiscount);
  const preDiscountTotal = subtotalCents - lineDiscountCents + taxCents;
  if (preDiscountTotal > maxCents || lineDiscountCents + invoiceDiscountCents > maxCents) throw invalid("Invoice totals exceed the supported monetary range.");
  if (invoiceDiscountCents > preDiscountTotal) throw invalid("The invoice discount cannot exceed the invoice total.");
  return { lines, subtotal: money(subtotalCents), taxAmount: money(taxCents), discountAmount: money(lineDiscountCents + invoiceDiscountCents), total: money(preDiscountTotal - invoiceDiscountCents) };
}

import { AppError } from "../../errors/app-error.js";

