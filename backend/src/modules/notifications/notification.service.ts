import { NotificationChannel, NotificationStatus } from "../../generated/prisma/index.js";
import { GoogleAuth } from "google-auth-library";
import { env } from "../../config/env.js";
import { mailProvider } from "../../lib/mail.js";
import { prisma } from "../../lib/prisma.js";

const statusMessage: Record<string, string> = {
  RECEIVED: "Your device has been received.", DIAGNOSING: "Diagnosis is in progress.", AWAITING_CUSTOMER_APPROVAL: "Your approval is required.", WAITING_FOR_PARTS: "The repair is waiting for parts.", IN_PROGRESS: "Repair work is in progress.", TESTING: "Your device is being tested.", COMPLETED: "Repair work is complete.", READY_FOR_COLLECTION: "Your device is ready for collection.", COLLECTED: "Your device has been collected.", CANCELLED: "The repair was cancelled."
};

interface NotificationRecipient {
  businessId: string;
  user: { id: string; pushTokens: { token: string }[] } | null;
  email: string | null;
  template: string;
  subject: string;
  body: string;
  repairId?: string;
  data: Record<string, string>;
}

async function sendPush(recipient: string, title: string, body: string, data: Record<string, string>): Promise<string> {
  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) throw new Error("Firebase Cloud Messaging is not configured");
  const auth = new GoogleAuth({ credentials: { client_email: env.FCM_CLIENT_EMAIL, private_key: env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n") }, scopes: ["https://www.googleapis.com/auth/firebase.messaging"] });
  const client = await auth.getClient();
  const access = await client.getAccessToken();
  if (!access.token) throw new Error("Firebase access token could not be created");
  const result = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FCM_PROJECT_ID)}/messages:send`, {
    method: "POST", headers: { authorization: `Bearer ${access.token}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { fid: recipient, notification: { title, body }, data } })
  });
  if (!result.ok) throw new Error(`Firebase rejected the notification with status ${result.status}`);
  const payload = await result.json() as { name: string };
  return payload.name;
}

async function enabledChannels(businessId: string): Promise<Record<"inApp" | "email" | "push", boolean>> {
  const settings = await prisma.setting.findMany({ where: { scope: `business:${businessId}`, key: { in: ["notifications.inApp.enabled", "notifications.email.enabled", "notifications.push.enabled"] } }, select: { key: true, value: true } });
  const value = (key: string): boolean => settings.find((setting) => setting.key === key)?.value !== false;
  return { inApp: value("notifications.inApp.enabled"), email: value("notifications.email.enabled"), push: value("notifications.push.enabled") };
}

async function deliver(input: NotificationRecipient): Promise<void> {
  const enabled = await enabledChannels(input.businessId);
  if (enabled.inApp && input.user) await prisma.notification.create({ data: { businessId: input.businessId, userId: input.user.id, repairId: input.repairId, channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, template: input.template, recipient: input.user.id, subject: input.subject, body: input.body, sentAt: new Date() } });
  if (enabled.email && input.email) {
    const notification = await prisma.notification.create({ data: { businessId: input.businessId, userId: input.user?.id, repairId: input.repairId, channel: NotificationChannel.EMAIL, template: input.template, recipient: input.email, subject: input.subject, body: input.body } });
    try {
      const sent = await mailProvider.send({ to: input.email, subject: input.subject, text: `${input.body}\n\nOpen RepairTrack for the full record.` });
      await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId: sent.providerId } });
    } catch (error) {
      await prisma.notification.update({ where: { id: notification.id }, data: { status: env.SMTP_HOST ? NotificationStatus.FAILED : NotificationStatus.PENDING, failureReason: error instanceof Error ? error.message.slice(0, 300) : "Delivery failed" } });
    }
  }
  if (enabled.push) for (const device of input.user?.pushTokens ?? []) {
    const notification = await prisma.notification.create({ data: { businessId: input.businessId, userId: input.user!.id, repairId: input.repairId, channel: NotificationChannel.PUSH, template: input.template, recipient: device.token, subject: input.subject, body: input.body } });
    try {
      const providerId = await sendPush(device.token, input.subject, input.body, input.data);
      await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId } });
    } catch (error) {
      await prisma.notification.update({ where: { id: notification.id }, data: { status: env.FCM_PROJECT_ID ? NotificationStatus.FAILED : NotificationStatus.PENDING, failureReason: error instanceof Error ? error.message.slice(0, 300) : "Delivery failed" } });
    }
  }
}

export async function notifyRepairStatus(repairId: string): Promise<void> {
  const repair = await prisma.repair.findUnique({ where: { id: repairId }, include: { business: true, customer: { include: { user: { include: { pushTokens: { where: { revokedAt: null } } } } } } } });
  if (!repair) return;
  await deliver({ businessId: repair.businessId, user: repair.customer.user, email: repair.customer.email ?? null, repairId: repair.id, template: `repair.${repair.status.toLowerCase()}`, subject: `${repair.business.name}: Repair ${repair.reference}`, body: statusMessage[repair.status] ?? `Repair ${repair.reference} status changed to ${repair.status}.`, data: { repairId: repair.id } });
}

export async function notifyInvoiceEvent(invoiceId: string, event: "ISSUED" | "PAYMENT_RECORDED", paymentAmount?: number): Promise<void> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { business: true, customer: { include: { user: { include: { pushTokens: { where: { revokedAt: null } } } } } } } });
  if (!invoice) return;
  const issued = event === "ISSUED";
  const subject = issued ? `${invoice.business.name}: Invoice ${invoice.number} issued` : `${invoice.business.name}: Payment recorded`;
  const body = issued ? `Invoice ${invoice.number} has been issued. Total: ${invoice.business.currency} ${Number(invoice.total).toFixed(2)}.` : `Payment of ${invoice.business.currency} ${Number(paymentAmount ?? 0).toFixed(2)} was recorded for invoice ${invoice.number}. Balance: ${invoice.business.currency} ${Number(invoice.balance).toFixed(2)}.`;
  await deliver({ businessId: invoice.businessId, user: invoice.customer.user, email: invoice.customer.email ?? null, template: issued ? "invoice.issued" : "payment.recorded", subject, body, data: { invoiceId: invoice.id } });
}
