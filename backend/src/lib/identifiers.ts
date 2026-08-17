import type { Prisma } from "../generated/prisma/index.js";

export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
  kind: "repair" | "invoice" | "payment" | "receipt",
  prefix: string
): Promise<string> {
  const counter = await tx.sequenceCounter.upsert({
    where: { businessId_kind: { businessId, kind } },
    create: { businessId, kind, value: 1 },
    update: { value: { increment: 1 } }
  });
  return `${prefix}-${new Date().getUTCFullYear()}-${counter.value.toString().padStart(6, "0")}`;
}
