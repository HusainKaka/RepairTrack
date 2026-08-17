import { InvoiceStatus, KraEtimsStatus } from "../../generated/prisma/index.js";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";

interface EtimsProviderResponse {
  success?: boolean;
  status?: string;
  reference?: string;
  message?: string;
}

export function kraEtimsConfigured(): boolean {
  return Boolean(env.KRA_ETIMS_BASE_URL && env.KRA_ETIMS_CLIENT_ID && env.KRA_ETIMS_CLIENT_SECRET);
}

export async function submitInvoiceToEtims(invoiceId: string, businessId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, businessId, deletedAt: null }, include: { business: { include: { taxSettings: true } }, customer: true, items: true, kraSubmissions: { orderBy: { attempt: "desc" }, take: 1 } } });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice was not found.");
  if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.PARTIALLY_PAID && invoice.status !== InvoiceStatus.PAID) throw new AppError(409, "INVOICE_NOT_ISSUED", "Issue the invoice before eTIMS submission.");
  if (!invoice.business.taxSettings?.etimsEnabled) throw new AppError(409, "ETIMS_DISABLED", "Enable eTIMS in Business Settings before submitting invoices.");
  if (invoice.kraStatus === KraEtimsStatus.CONFIRMED) throw new AppError(409, "ETIMS_ALREADY_CONFIRMED", "This invoice already has a confirmed eTIMS response.");
  if (invoice.business.taxSettings.requireCustomerKraPin && !invoice.customer.kraPin) throw new AppError(422, "CUSTOMER_KRA_PIN_REQUIRED", "A customer KRA PIN is required for this configured invoice flow.");
  const requestPayload = { invoiceNumber: invoice.number, issuedAt: invoice.issuedAt?.toISOString(), currency: invoice.business.currency, supplier: { name: invoice.business.name, kraPin: invoice.business.taxPin, branchCode: invoice.business.taxSettings.branchCode, deviceIdentifier: invoice.business.taxSettings.deviceIdentifier }, customer: { name: invoice.customer.fullName, type: invoice.customer.customerType, kraPin: invoice.customer.kraPin }, totals: { subtotal: Number(invoice.subtotal), tax: Number(invoice.taxAmount), discount: Number(invoice.discountAmount), total: Number(invoice.total) }, items: invoice.items.map((item) => ({ description: item.description, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), taxRate: Number(item.taxRate), discount: Number(item.discount), total: Number(item.lineTotal) })) };
  const submission = await prisma.kraEtimsSubmission.create({ data: { businessId, invoiceId: invoice.id, attempt: (invoice.kraSubmissions[0]?.attempt ?? 0) + 1, requestPayload, status: KraEtimsStatus.PENDING } });
  if (!kraEtimsConfigured()) {
    await prisma.kraEtimsSubmission.update({ where: { id: submission.id }, data: { status: KraEtimsStatus.FAILED, failureReason: "KRA/eTIMS provider credentials are not configured" } });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { kraStatus: KraEtimsStatus.FAILED } });
    throw new AppError(503, "ETIMS_NOT_CONFIGURED", "KRA/eTIMS credentials are not configured. The invoice was not marked as submitted or confirmed.");
  }
  try {
    const endpoint = new URL(env.KRA_ETIMS_SUBMIT_PATH, env.KRA_ETIMS_BASE_URL).toString();
    const token = Buffer.from(`${env.KRA_ETIMS_CLIENT_ID}:${env.KRA_ETIMS_CLIENT_SECRET}`).toString("base64");
    const providerResponse = await fetch(endpoint, { method: "POST", headers: { authorization: `Basic ${token}`, "content-type": "application/json", "x-idempotency-key": submission.id }, body: JSON.stringify(requestPayload), signal: AbortSignal.timeout(30_000) });
    const payload = await providerResponse.json().catch(() => ({})) as EtimsProviderResponse;
    if (!providerResponse.ok) throw new Error(`KRA/eTIMS gateway returned HTTP ${providerResponse.status}`);
    const confirmed = payload.success === true && payload.status?.toUpperCase() === "CONFIRMED" && Boolean(payload.reference);
    const submitted = payload.success === true && (payload.status?.toUpperCase() === "SUBMITTED" || confirmed);
    const status = confirmed ? KraEtimsStatus.CONFIRMED : submitted ? KraEtimsStatus.SUBMITTED : KraEtimsStatus.FAILED;
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.kraEtimsSubmission.update({ where: { id: submission.id }, data: { status, officialReference: payload.reference, responsePayload: JSON.parse(JSON.stringify(payload)), submittedAt: submitted ? new Date() : undefined, confirmedAt: confirmed ? new Date() : undefined, failureReason: status === KraEtimsStatus.FAILED ? payload.message ?? "Provider response was not a verified submission" : undefined } });
      await tx.invoice.update({ where: { id: invoice.id }, data: { kraStatus: status, kraReference: confirmed ? payload.reference : undefined } });
      return value;
    });
    return updated;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message.slice(0, 300) : "KRA/eTIMS submission failed";
    await prisma.$transaction([prisma.kraEtimsSubmission.update({ where: { id: submission.id }, data: { status: KraEtimsStatus.FAILED, failureReason } }), prisma.invoice.update({ where: { id: invoice.id }, data: { kraStatus: KraEtimsStatus.FAILED } })]);
    throw new AppError(502, "ETIMS_SUBMISSION_FAILED", "The KRA/eTIMS provider did not confirm this invoice. Review the recorded failure and retry safely.");
  }
}
