import {
  CustomerNotificationPreference,
  NotificationCategory,
  NotificationChannel,
  NotificationStatus,
  RoleCode,
  Prisma,
} from "../../generated/prisma/index.js";
import { GoogleAuth } from "google-auth-library";
import { env } from "../../config/env.js";
import { AppError, notFound } from "../../errors/app-error.js";
import { decryptPublicToken } from "../../lib/crypto.js";
import { getBusinessLogoBuffer } from "../../lib/business-logo.js";
import { getGoogleReviewUrl } from "../../lib/google-review.js";
import { mailProvider } from "../../lib/mail.js";
import { prisma } from "../../lib/prisma.js";
import { renderCustomerEmail, renderRepairEmail } from "./email-templates.js";
import { repairNotificationEvent, repairTemplateKey, shouldSendRepairMessage, type RepairNotificationEvent } from "./notification-policy.js";
import { sendWhatsAppTicketMessage } from "./whatsapp-provider.js";

interface InternalNotificationInput {
  businessId: string;
  userId: string;
  repairId?: string;
  digitalTicketId?: string;
  category: NotificationCategory;
  template: string;
  subject: string;
  body: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function createInternalNotification(input: InternalNotificationInput): Promise<void> {
  const resource = input.repairId ?? input.digitalTicketId;
  await createNotificationOnce({ businessId: input.businessId, userId: input.userId, repairId: input.repairId, digitalTicketId: input.digitalTicketId, deduplicationKey: resource ? `${resource}:inapp:${input.userId}:${input.template}` : undefined, channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, category: input.category, template: input.template, recipient: input.userId, subject: input.subject, body: input.body, metadata: input.metadata, sentAt: new Date() });
}

async function createNotificationOnce(data: Prisma.NotificationUncheckedCreateInput) {
  try { return await prisma.notification.create({ data }); }
  catch (error) {
    if (data.deduplicationKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

export async function emailLogoForBusiness(businessId: string) {
  const content = await getBusinessLogoBuffer(businessId);
  const logoCid = content ? `business-logo-${businessId}@repairtrack` : undefined;
  return { logoCid, attachments: content ? [{ filename: "business-logo.png", content, contentType: "image/png", cid: logoCid }] : [] };
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
  if (repair.deletedAt || repair.customer.deletedAt || repair.business.deletedAt || repair.business.status !== "ACTIVE") return;
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
      const notification = await createNotificationOnce({ businessId: repair.businessId, userId: repair.customer.userId, repairId: repair.id, deduplicationKey: `${repair.id}:email:${template}`, channel: NotificationChannel.EMAIL, category: event === "COMPLETED" || event === "CANCELLED" ? NotificationCategory.REPAIR_COMPLETED : NotificationCategory.SYSTEM, template, recipient: repair.customer.email, subject: copy.subject, body: copy.body });
      if (!notification) return;
      try {
        const logo = await emailLogoForBusiness(repair.businessId);
        const reviewUrl = event === "COMPLETED" ? await getGoogleReviewUrl(repair.businessId) : null;
        const rendered = renderRepairEmail({ business: repair.business, logoCid: logo.logoCid, customerName: repair.customer.fullName, reference: repair.reference, device, dateReceived: repair.createdAt, trackingUrl, statusLabel: copy.status, message: copy.body, amountDue: amountDue || undefined, currency: repair.business.currency, reviewUrl });
        const sent = await mailProvider.send({ to: repair.customer.email, subject: copy.subject, text: rendered.text, html: rendered.html, attachments: logo.attachments });
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId: sent.providerId } });
      } catch {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: env.SMTP_HOST ? NotificationStatus.FAILED : NotificationStatus.PENDING, failureReason: "Email delivery is unavailable; check provider configuration" } });
      }
    }
  }

  if (preference === CustomerNotificationPreference.WHATSAPP || (event === "RECEIVED" && repair.customer.whatsappOptIn)) {
    const destination = repair.customer.whatsappPhone ?? repair.customer.phone;
    const duplicate = await prisma.notification.findFirst({ where: { repairId: repair.id, channel: NotificationChannel.WHATSAPP, template } });
    if (!duplicate) {
      const notification = await createNotificationOnce({ businessId: repair.businessId, userId: repair.customer.userId, repairId: repair.id, deduplicationKey: `${repair.id}:whatsapp:${template}`, channel: NotificationChannel.WHATSAPP, category: event === "COMPLETED" || event === "CANCELLED" ? NotificationCategory.REPAIR_COMPLETED : NotificationCategory.SYSTEM, template, recipient: destination, subject: copy.subject, body: `${copy.body}\n\n${repair.reference} · ${device}\n${trackingUrl}` });
      if (!notification) return;
      try {
        const sent = repair.customer.whatsappOptIn ? await sendWhatsAppTicketMessage({ to: destination, customerName: repair.customer.fullName, ticketNumber: repair.reference, serviceLabel: "Repair", statusLabel: copy.status, trackingUrl }) : { configured: false, failureReason: "The customer must explicitly consent to WhatsApp ticket notifications" };
        await prisma.notification.update({ where: { id: notification.id }, data: { status: sent.providerId ? NotificationStatus.SENT : sent.configured ? NotificationStatus.FAILED : NotificationStatus.PENDING, sentAt: sent.providerId ? new Date() : undefined, providerId: sent.providerId, failureReason: sent.failureReason } });
      } catch {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.FAILED, failureReason: "WhatsApp delivery failed; check provider configuration and retry" } });
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
      const notification = await createNotificationOnce({ businessId: repair.businessId, userId: repair.customer.user.id, repairId: repair.id, deduplicationKey: `${repair.id}:push:${deviceToken.id}:${template}`, channel: NotificationChannel.PUSH, category: NotificationCategory.SYSTEM, template: pushTemplate, recipient: deviceToken.token, subject: copy.subject, body: copy.body });
      if (!notification) continue;
      try {
        const providerId = await sendPush(deviceToken.token, copy.subject, copy.body, { repairReference: repair.reference });
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId } });
      } catch {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: env.FCM_PROJECT_ID ? NotificationStatus.FAILED : NotificationStatus.PENDING, failureReason: "Push delivery is unavailable; check provider configuration" } });
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

async function digitalContext(ticketId: string) {
  return prisma.digitalTicket.findUnique({ where: { id: ticketId }, include: { business: true, customer: { include: { user: true } } } });
}

type DigitalContext = NonNullable<Awaited<ReturnType<typeof digitalContext>>>;

async function deliverDigitalEvent(ticket: DigitalContext, suppliedTrackingUrl?: string): Promise<void> {
  if (ticket.deletedAt || ticket.customer.deletedAt || ticket.business.deletedAt || ticket.business.status !== "ACTIVE") return;
  const service = { WEBSITE: "Website", SOFTWARE: "Software", AI_AGENT: "AI agent" }[ticket.kind];
  const status = ticket.status.replaceAll("_", " ");
  const template = `digital.${ticket.status.toLowerCase()}`;
  const subject = `${service} ticket ${ticket.reference}: ${status}`;
  const body = ticket.status === "INTAKE" ? `Your ${service.toLowerCase()} request has been registered. Keep the private tracking link to follow its progress.` : `Your ${service.toLowerCase()} ticket is now ${status.toLowerCase()}. View your private tracking page for details.`;
  let trackingUrl = suppliedTrackingUrl;
  if (!trackingUrl && ticket.publicTrackingTokenEncrypted) {
    try { trackingUrl = `${env.PUBLIC_WEB_URL}/track/digital/${encodeURIComponent(decryptPublicToken(ticket.publicTrackingTokenEncrypted))}`; } catch { /* An invalid token is never included in a customer message. */ }
  }
  const preference = ticket.customer.preferredCommunication;
  if ((preference === CustomerNotificationPreference.WHATSAPP || (ticket.status === "INTAKE" && ticket.customer.whatsappOptIn)) && trackingUrl) {
    const recipient = ticket.customer.whatsappPhone ?? ticket.customer.phone;
    const existing = await prisma.notification.findFirst({ where: { digitalTicketId: ticket.id, channel: NotificationChannel.WHATSAPP, template } });
    if (!existing) {
      const notification = await createNotificationOnce({ businessId: ticket.businessId, userId: ticket.customer.userId, digitalTicketId: ticket.id, deduplicationKey: `${ticket.id}:whatsapp:${template}`, channel: NotificationChannel.WHATSAPP, category: NotificationCategory.SYSTEM, template, recipient, subject, body: `${body}\n\nTicket: ${ticket.reference}\nTrack: ${trackingUrl}` });
      if (!notification) return;
      try {
        const sent = ticket.customer.whatsappOptIn ? await sendWhatsAppTicketMessage({ to: recipient, customerName: ticket.customer.fullName, ticketNumber: ticket.reference, serviceLabel: service, statusLabel: status, trackingUrl }) : { configured: false, failureReason: "The customer must explicitly consent to WhatsApp ticket notifications" };
        await prisma.notification.update({ where: { id: notification.id }, data: { status: sent.providerId ? NotificationStatus.SENT : sent.configured ? NotificationStatus.FAILED : NotificationStatus.PENDING, sentAt: sent.providerId ? new Date() : undefined, providerId: sent.providerId, failureReason: sent.failureReason } });
      } catch {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.FAILED, failureReason: "WhatsApp delivery failed; check provider configuration and retry" } });
      }
    }
  }
  if (preference === CustomerNotificationPreference.EMAIL && ticket.customer.email) {
    const existing = await prisma.notification.findFirst({ where: { digitalTicketId: ticket.id, channel: NotificationChannel.EMAIL, template } });
    if (!existing) {
      const notification = await createNotificationOnce({ businessId: ticket.businessId, userId: ticket.customer.userId, digitalTicketId: ticket.id, deduplicationKey: `${ticket.id}:email:${template}`, channel: NotificationChannel.EMAIL, category: NotificationCategory.SYSTEM, template, recipient: ticket.customer.email, subject, body });
      if (!notification) return;
      try {
        const logo = await emailLogoForBusiness(ticket.businessId);
        const rendered = renderCustomerEmail({ business: ticket.business, logoCid: logo.logoCid, customerName: ticket.customer.fullName, reference: ticket.reference, title: service, statusLabel: status, message: body, details: [{ label: "Project", value: ticket.title }, { label: "Received", value: ticket.createdAt.toLocaleDateString("en-KE") }], actionUrl: trackingUrl, actionLabel: "Track digital ticket" });
        const sent = await mailProvider.send({ to: ticket.customer.email, subject, ...rendered, attachments: logo.attachments });
        await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId: sent.providerId } });
      } catch {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: env.SMTP_HOST ? NotificationStatus.FAILED : NotificationStatus.PENDING, failureReason: "Email delivery is unavailable; check provider configuration" } });
      }
    }
  }
  if (ticket.customer.user) {
    const existing = await prisma.notification.findFirst({ where: { digitalTicketId: ticket.id, userId: ticket.customer.user.id, channel: NotificationChannel.IN_APP, template } });
    if (!existing) await createInternalNotification({ businessId: ticket.businessId, userId: ticket.customer.user.id, digitalTicketId: ticket.id, category: NotificationCategory.SYSTEM, template, subject, body, metadata: { reference: ticket.reference } });
  }
}

export async function notifyDigitalTicketCreated(ticketId: string, trackingUrl: string): Promise<void> {
  const ticket = await digitalContext(ticketId);
  if (ticket) await deliverDigitalEvent(ticket, trackingUrl);
}

export async function notifyDigitalTicketStatus(ticketId: string): Promise<void> {
  const ticket = await digitalContext(ticketId);
  if (ticket) await deliverDigitalEvent(ticket);
}

export async function retryWhatsAppNotification(notificationId: string, businessId: string): Promise<void> {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, businessId, channel: NotificationChannel.WHATSAPP } });
  if (!notification) throw notFound("WhatsApp notification");
  if (![NotificationStatus.PENDING, NotificationStatus.FAILED].includes(notification.status as "PENDING" | "FAILED")) throw new AppError(409, "NOTIFICATION_ALREADY_SENT", "Only pending or failed messages can be retried.");
  const repair = notification.repairId ? await repairContext(notification.repairId) : null;
  const digital = notification.digitalTicketId ? await digitalContext(notification.digitalTicketId) : null;
  const ticket = repair ?? digital;
  const intake = notification.template === "repair.received" || notification.template === "digital.intake";
  if (!ticket || ticket.businessId !== businessId || ticket.deletedAt || ticket.customer.deletedAt || ticket.business.deletedAt || ticket.business.status !== "ACTIVE" || !ticket.customer.whatsappOptIn || (!intake && ticket.customer.preferredCommunication !== CustomerNotificationPreference.WHATSAPP)) throw new AppError(409, "WHATSAPP_CONSENT_REQUIRED", "An active ticket, business and customer with current consent to WhatsApp notifications are required.");
  const claimed = await prisma.notification.updateMany({ where: { id: notification.id, businessId, status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] }, OR: [{ failureReason: null }, { failureReason: { not: "DELIVERY_IN_PROGRESS" } }] }, data: { failureReason: "DELIVERY_IN_PROGRESS" } });
  if (claimed.count !== 1) throw new AppError(409, "NOTIFICATION_RETRY_IN_PROGRESS", "This message is already being retried.");
  try {
    let trackingUrl: string;
    if (repair) trackingUrl = trackingUrlFor(repair);
    else trackingUrl = `${env.PUBLIC_WEB_URL}/track/digital/${encodeURIComponent(decryptPublicToken(digital!.publicTrackingTokenEncrypted!))}`;
    const statusLabel = notification.template === "repair.received" ? "REPAIR RECEIVED" : notification.template?.startsWith("repair.terminal.") ? notification.template.split(".").at(-1)!.replaceAll("_", " ").toUpperCase() : notification.template?.startsWith("digital.") ? notification.template.slice("digital.".length).replaceAll("_", " ").toUpperCase() : ticket.status.replaceAll("_", " ");
    const serviceLabel = repair ? "Repair" : { WEBSITE: "Website", SOFTWARE: "Software", AI_AGENT: "AI agent" }[digital!.kind];
    const sent = await sendWhatsAppTicketMessage({ to: ticket.customer.whatsappPhone ?? ticket.customer.phone, customerName: ticket.customer.fullName, ticketNumber: ticket.reference, serviceLabel, statusLabel, trackingUrl });
    await prisma.notification.update({ where: { id: notification.id }, data: { status: sent.providerId ? NotificationStatus.SENT : sent.configured ? NotificationStatus.FAILED : NotificationStatus.PENDING, sentAt: sent.providerId ? new Date() : undefined, providerId: sent.providerId, failureReason: sent.failureReason ?? null } });
  } catch {
    await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.FAILED, failureReason: "WhatsApp delivery failed; check provider configuration and retry" } });
  }
}

export async function notifyInvoiceEvent(invoiceId: string, event: "ISSUED" | "PAYMENT_RECORDED", paymentAmount?: number): Promise<void> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { business: true, customer: { include: { user: true } } } });
  if (!invoice || invoice.customer.deletedAt || invoice.business.deletedAt || invoice.business.status !== "ACTIVE") return;
  const issued = event === "ISSUED";
  const subject = issued ? `${invoice.business.name}: Invoice ${invoice.number} issued` : `${invoice.business.name}: Payment recorded`;
  const body = issued ? `Invoice ${invoice.number} has been issued. Total: ${invoice.business.currency} ${Number(invoice.total).toFixed(2)}.` : `Payment of ${invoice.business.currency} ${Number(paymentAmount ?? 0).toFixed(2)} was recorded for invoice ${invoice.number}. Balance: ${invoice.business.currency} ${Number(invoice.balance).toFixed(2)}.`;
  if (invoice.customer.user) await createInternalNotification({ businessId: invoice.businessId, userId: invoice.customer.user.id, category: NotificationCategory.PAYMENT, template: issued ? "invoice.issued" : "payment.recorded", subject, body, metadata: { invoiceNumber: invoice.number } });
  if (invoice.customer.email) {
    const template = issued ? `invoice.issued.${invoice.id}` : `payment.recorded.${invoice.id}.${Number(invoice.amountPaid)}`;
    const existing = await prisma.notification.findFirst({ where: { businessId: invoice.businessId, channel: NotificationChannel.EMAIL, template } });
    if (existing) return;
    const notification = await createNotificationOnce({ businessId: invoice.businessId, userId: invoice.customer.userId, deduplicationKey: `${invoice.id}:email:${template}`, channel: NotificationChannel.EMAIL, category: NotificationCategory.PAYMENT, template, recipient: invoice.customer.email, subject, body });
    if (!notification) return;
    try {
      const logo = await emailLogoForBusiness(invoice.businessId);
      const rendered = renderCustomerEmail({ business: invoice.business, logoCid: logo.logoCid, customerName: invoice.customer.fullName, reference: invoice.number, title: "Invoice", statusLabel: issued ? "INVOICE ISSUED" : "PAYMENT RECORDED", message: body, details: [{ label: "Total", value: `${invoice.business.currency} ${Number(invoice.total).toFixed(2)}` }, { label: "Balance", value: `${invoice.business.currency} ${Number(invoice.balance).toFixed(2)}` }] });
      const sent = await mailProvider.send({ to: invoice.customer.email, subject, ...rendered, attachments: logo.attachments });
      await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId: sent.providerId } });
    } catch {
      await prisma.notification.update({ where: { id: notification.id }, data: { status: env.SMTP_HOST ? NotificationStatus.FAILED : NotificationStatus.PENDING, failureReason: "Email delivery is unavailable; check provider configuration" } });
    }
  }
}
