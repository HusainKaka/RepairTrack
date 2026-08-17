import {
  CustomerNotificationPreference,
  NotificationCategory,
  NotificationChannel,
  NotificationStatus,
  RoleCode,
} from "../../generated/prisma/index.js";
import { GoogleAuth } from "google-auth-library";
import { env } from "../../config/env.js";
import { decryptPublicToken } from "../../lib/crypto.js";
import { mailProvider } from "../../lib/mail.js";
import { prisma } from "../../lib/prisma.js";
import { renderRepairEmail } from "./email-templates.js";
import { repairNotificationEvent, repairTemplateKey, shouldSendRepairMessage, type RepairNotificationEvent } from "./notification-policy.js";
import { sendWhatsAppMessage } from "./whatsapp-provider.js";

interface InternalNotificationInput {
  businessId: string;
  userId: string;
  repairId?: string;
  category: NotificationCategory;
  template: string;
  subject: string;
  body: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function createInternalNotification(input: InternalNotificationInput): Promise<void> {
  await prisma.notification.create({ data: { businessId: input.businessId, userId: input.userId, repairId: input.repairId, channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, category: input.category, template: input.template, recipient: input.userId, subject: input.subject, body: input.body, metadata: input.metadata, sentAt: new Date() } });
}

async function sendPush(recipient: string, title: string, body: string, data: Record<string, string>): Promise<string> {
  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) throw new Error("Firebase Cloud Messaging is not configured");
  const auth = new GoogleAuth({ credentials: { client_email: env.FCM_CLIENT_EMAIL, private_key: env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n") }, scopes: ["https://www.googleapis.com/auth/firebase.messaging"] });
  const client = await auth.getClient();
  const access = await client.getAccessToken();
  if (!access.token) throw new Error("Firebase access token could not be created");
  const result = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FCM_PROJECT_ID)}/messages:send`, { method: "POST", headers: { authorization: `Bearer ${access.token}`, "content-type": "application/json" }, body: JSON.stringify({ message: { token: recipient, notification: { title, body }, data } }), signal: AbortSignal.timeout(15_000) });
  if (!result.ok) throw new Error(`Firebase rejected the notification with status ${result.status}`);
  const payload = await result.json() as { name: string };
  return payload.name;
}

async function repairContext(repairId: string) {
  return prisma.repair.findUnique({ where: { id: repairId }, include: { business: true, device: { select: { type: true, brand: true, model: true } }, customer: { include: { user: { include: { pushTokens: { where: { revokedAt: null } } } } } }, invoices: { where: { deletedAt: null, status: { notIn: ["CANCELLED", "VOID"] } }, select: { balance: true } } } });
}

type RepairContext = NonNullable<Awaited<ReturnType<typeof repairContext>>>;

function eventCopy(event: RepairNotificationEvent, reference: string): { status: string; subject: string; body: string } {
  if (event === "RECEIVED") return { status: "REPAIR RECEIVED", subject: `Repair Received – Track Repair ${reference}`, body: "Your device has been registered successfully. Use the secure link below to follow progress." };
  if (event === "APPROVAL_REQUIRED") return { status: "APPROVAL REQUIRED", subject: `Approval required for repair ${reference}`, body: "Please review the estimate on your secure tracking page and choose Accept or Decline." };
  if (event === "COMPLETED") return { status: "READY FOR COLLECTION", subject: "Your Repair Is Complete", body: "Repair work is complete. Please review the current balance and collection instructions on the tracking page." };
  return { status: "REPAIR CANCELLED", subject: `Repair ${reference} Has Been Cancelled`, body: "This repair has been cancelled. The customer-visible timeline contains the latest information." };
}

function trackingUrlFor(repair: RepairContext, supplied?: string): string {
  if (supplied) return supplied;
  if (repair.publicTrackingTokenEncrypted) {
    try { return `${env.PUBLIC_WEB_URL}/track/${encodeURIComponent(decryptPublicToken(repair.publicTrackingTokenEncrypted))}`; } catch { return `${env.PUBLIC_WEB_URL}/track`; }
  }
  return `${env.PUBLIC_WEB_URL}/track`;
}

async function deliverRepairEvent(repair: RepairContext, event: RepairNotificationEvent, suppliedTrackingUrl?: string): Promise<void> {
  const preference = repair.notificationPreferenceOverride ?? repair.customer.preferredCommunication;
  if (!shouldSendRepairMessage(preference, event)) return;
  const template = repairTemplateKey(event);
  const copy = eventCopy(event, repair.reference);
  const trackingUrl = trackingUrlFor(repair, suppliedTrackingUrl);
  const device = `${repair.device.brand} ${repair.device.model} (${repair.device.type})`;
  const amountDue = repair.invoices.reduce((sum, invoice) => sum + Number(invoice.balance), 0);

  if (preference === CustomerNotificationPreference.EMAIL && repair.customer.email) {
    const duplicate = await prisma.notification.findFirst({ where: { repairId: repair.id, channel: NotificationChannel.EMAIL, template } });
    if (!duplicate) {
      const notification = await prisma.notification.create({ data: { businessId: repair.businessId, userId: repair.customer.userId, repairId: repair.id, channel: NotificationChannel.EMAIL, category: event === "COMPLETED" || event === "CANCELLED" ? NotificationCategory.REPAIR_COMPLETED : NotificationCategory.SYSTEM, template, recipient: repair.customer.email, subject: copy.subject, body: copy.body } });
      const rendered = renderRepairEmail({ business: repair.business, customerName: repair.customer.fullName, reference: repair.reference, device, dateReceived: repair.createdAt, trackingUrl, statusLabel: copy.status, message: copy.body, amountDue: amountDue || undefined, currency: repair.business.currency });
      try {
        const sent = await mailProvider.send({ to: repair.customer.email, subject: copy.subject, text: rendered.text, html: rendered.html });
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId: sent.providerId } });
      } catch (error) {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: env.SMTP_HOST ? NotificationStatus.FAILED : NotificationStatus.PENDING, failureReason: error instanceof Error ? error.message.slice(0, 300) : "Email delivery failed" } });
      }
    }
  }

  if (preference === CustomerNotificationPreference.WHATSAPP) {
    const destination = repair.customer.whatsappPhone ?? repair.customer.phone;
    const duplicate = await prisma.notification.findFirst({ where: { repairId: repair.id, channel: NotificationChannel.WHATSAPP, template } });
    if (!duplicate) {
      const notification = await prisma.notification.create({ data: { businessId: repair.businessId, userId: repair.customer.userId, repairId: repair.id, channel: NotificationChannel.WHATSAPP, category: event === "COMPLETED" || event === "CANCELLED" ? NotificationCategory.REPAIR_COMPLETED : NotificationCategory.SYSTEM, template, recipient: destination, subject: copy.subject, body: `${copy.body}\n\n${repair.reference} · ${device}\n${trackingUrl}` } });
      try {
        const sent = await sendWhatsAppMessage({ to: destination, body: `${copy.subject}\n\n${copy.body}\n\nRepair: ${repair.reference}\nDevice: ${device}\nTrack: ${trackingUrl}` });
        await prisma.notification.update({ where: { id: notification.id }, data: { status: sent.providerId ? NotificationStatus.SENT : sent.configured ? NotificationStatus.FAILED : NotificationStatus.PENDING, sentAt: sent.providerId ? new Date() : undefined, providerId: sent.providerId, failureReason: sent.failureReason } });
      } catch (error) {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.FAILED, failureReason: error instanceof Error ? error.message.slice(0, 300) : "WhatsApp delivery failed" } });
      }
    }
  }

  if (repair.customer.user) {
    const duplicate = await prisma.notification.findFirst({ where: { repairId: repair.id, userId: repair.customer.user.id, channel: NotificationChannel.IN_APP, template } });
    if (!duplicate) await createInternalNotification({ businessId: repair.businessId, userId: repair.customer.user.id, repairId: repair.id, category: event === "COMPLETED" || event === "CANCELLED" ? NotificationCategory.REPAIR_COMPLETED : NotificationCategory.SYSTEM, template, subject: copy.subject, body: copy.body, metadata: { reference: repair.reference } });
    for (const deviceToken of repair.customer.user.pushTokens) {
      const pushTemplate = `${template}.push`;
      const pushDuplicate = await prisma.notification.findFirst({ where: { repairId: repair.id, channel: NotificationChannel.PUSH, template: pushTemplate, recipient: deviceToken.token } });
      if (pushDuplicate) continue;
      const notification = await prisma.notification.create({ data: { businessId: repair.businessId, userId: repair.customer.user.id, repairId: repair.id, channel: NotificationChannel.PUSH, category: NotificationCategory.SYSTEM, template: pushTemplate, recipient: deviceToken.token, subject: copy.subject, body: copy.body } });
      try {
        const providerId = await sendPush(deviceToken.token, copy.subject, copy.body, { repairReference: repair.reference });
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId } });
      } catch (error) {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: env.FCM_PROJECT_ID ? NotificationStatus.FAILED : NotificationStatus.PENDING, failureReason: error instanceof Error ? error.message.slice(0, 300) : "Push delivery failed" } });
      }
    }
  }

  if (event === "COMPLETED" || event === "CANCELLED") {
    const administrators = await prisma.user.findMany({ where: { businessId: repair.businessId, role: { code: RoleCode.BUSINESS_ADMIN }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
    for (const administrator of administrators) {
      const adminTemplate = `${template}.admin`;
      const duplicate = await prisma.notification.findFirst({ where: { userId: administrator.id, repairId: repair.id, template: adminTemplate, channel: NotificationChannel.IN_APP } });
      if (!duplicate) await createInternalNotification({ businessId: repair.businessId, userId: administrator.id, repairId: repair.id, category: NotificationCategory.REPAIR_COMPLETED, template: adminTemplate, subject: copy.subject, body: `${repair.reference}: ${copy.body}`, metadata: { reference: repair.reference } });
    }
  }
}

export async function notifyRepairCreated(repairId: string, trackingUrl: string): Promise<void> {
  const repair = await repairContext(repairId);
  if (repair) await deliverRepairEvent(repair, "RECEIVED", trackingUrl);
}

export async function notifyRepairStatus(repairId: string): Promise<void> {
  const repair = await repairContext(repairId);
  if (!repair) return;
  const event = repairNotificationEvent(repair.status);
  if (event && event !== "RECEIVED") await deliverRepairEvent(repair, event);
}

export async function notifyInvoiceEvent(invoiceId: string, event: "ISSUED" | "PAYMENT_RECORDED", paymentAmount?: number): Promise<void> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { business: true, customer: { include: { user: true } } } });
  if (!invoice?.customer.user) return;
  const issued = event === "ISSUED";
  const subject = issued ? `${invoice.business.name}: Invoice ${invoice.number} issued` : `${invoice.business.name}: Payment recorded`;
  const body = issued ? `Invoice ${invoice.number} has been issued. Total: ${invoice.business.currency} ${Number(invoice.total).toFixed(2)}.` : `Payment of ${invoice.business.currency} ${Number(paymentAmount ?? 0).toFixed(2)} was recorded for invoice ${invoice.number}. Balance: ${invoice.business.currency} ${Number(invoice.balance).toFixed(2)}.`;
  await createInternalNotification({ businessId: invoice.businessId, userId: invoice.customer.user.id, category: NotificationCategory.PAYMENT, template: issued ? "invoice.issued" : "payment.recorded", subject, body, metadata: { invoiceNumber: invoice.number } });
}
