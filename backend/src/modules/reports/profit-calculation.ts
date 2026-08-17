import { InvoiceItemType } from "../../generated/prisma/index.js";

export interface CashReceiptInput {
  amount: number;
  invoiceTotal: number;
  items: Array<{ itemType: InvoiceItemType; lineTotal: number; quantity: number; historicalUnitCost?: number }>;
}

export interface ExpenseInput {
  amount: number;
  utility: boolean;
}

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateCashBasisProfit(receipts: CashReceiptInput[], expenses: ExpenseInput[]) {
  let revenue = 0;
  let partsRevenue = 0;
  let labourRevenue = 0;
  let costOfParts = 0;
  for (const receipt of receipts) {
    if (receipt.amount <= 0 || receipt.invoiceTotal <= 0) continue;
    const allocation = Math.min(receipt.amount / receipt.invoiceTotal, 1);
    revenue += receipt.amount;
    for (const item of receipt.items) {
      if (item.itemType === InvoiceItemType.INVENTORY) {
        partsRevenue += item.lineTotal * allocation;
        costOfParts += (item.historicalUnitCost ?? 0) * item.quantity * allocation;
      }
      if (item.itemType === InvoiceItemType.LABOUR) labourRevenue += item.lineTotal * allocation;
    }
  }
  const utilityCosts = expenses.filter((expense) => expense.utility).reduce((sum, expense) => sum + expense.amount, 0);
  const otherBusinessCosts = expenses.filter((expense) => !expense.utility).reduce((sum, expense) => sum + expense.amount, 0);
  const grossProfit = revenue - costOfParts;
  const operatingProfit = grossProfit - utilityCosts - otherBusinessCosts;
  return { revenue: roundMoney(revenue), partsRevenue: roundMoney(partsRevenue), labourRevenue: roundMoney(labourRevenue), costOfParts: roundMoney(costOfParts), grossProfit: roundMoney(grossProfit), utilityCosts: roundMoney(utilityCosts), otherBusinessCosts: roundMoney(otherBusinessCosts), operatingExpenses: roundMoney(utilityCosts + otherBusinessCosts), operatingProfit: roundMoney(operatingProfit), profitMarginPercent: revenue ? roundMoney(operatingProfit / revenue * 100) : 0, methodology: "CASH_BASIS" as const };
}

