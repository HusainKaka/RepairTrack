import { SubscriptionBillingCycle } from "../../generated/prisma/index.js";

export function subscriptionPeriodEnd(start: Date, cycle: SubscriptionBillingCycle): Date {
  const end = new Date(start);
  if (cycle === SubscriptionBillingCycle.ANNUAL) end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

export function paymentMatchesPlan(input: { amount: number; currency: string; expectedAmount: number; expectedCurrency: string }): boolean {
  return input.amount > 0 && Math.round(input.amount * 100) === Math.round(input.expectedAmount * 100) && input.currency.toUpperCase() === input.expectedCurrency.toUpperCase();
}

export function hasFeature(features: unknown, feature: string): boolean {
  return Boolean(features && typeof features === "object" && !Array.isArray(features) && (features as Record<string, unknown>)[feature] === true);
}

