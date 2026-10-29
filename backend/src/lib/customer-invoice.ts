import type { Prisma } from "../generated/prisma/index.js";

// Public tracking is a bearer capability: expose selling prices, never costs,
// supplier references, internal notes, inventory IDs or customer identities.
export const customerInvoiceSelect = {
  number: true, status: true, paymentStatus: true,
  subtotal: true, taxAmount: true, discountAmount: true, invoiceLevelDiscount: true,
  total: true, amountPaid: true, balance: true,
  items: { select: { description: true, itemType: true, quantity: true, unitPrice: true, discount: true, taxRate: true, lineTotal: true } },
} as const satisfies Prisma.InvoiceSelect;
