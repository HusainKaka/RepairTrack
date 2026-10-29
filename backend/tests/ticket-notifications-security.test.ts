import { beforeEach, describe, expect, it, vi } from "vitest";
const prisma = vi.hoisted(() => ({ digitalTicket: { findUnique: vi.fn() }, repair: { findUnique: vi.fn() }, invoice: { findUnique: vi.fn() }, user: { findMany: vi.fn() }, notification: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, setting: { findUnique: vi.fn() } }));
const sendWhatsAppTicketMessage = vi.hoisted(() => vi.fn());
const sendMail = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/prisma.js", () => ({ prisma }));
vi.mock("../src/modules/notifications/whatsapp-provider.js", () => ({ sendWhatsAppTicketMessage }));
vi.mock("../src/lib/mail.js", () => ({ mailProvider: { send: sendMail } }));
import { Prisma } from "../src/generated/prisma/index.js";
import { notifyDigitalTicketCreated, notifyInvoiceEvent, notifyRepairCreated, notifyRepairStatus, retryWhatsAppNotification } from "../src/modules/notifications/notification.service.js";

const ticket = () => ({ id: "ticket-id", businessId: "business-id", kind: "WEBSITE", reference: "WEB-2026-000001", title: "Business website", requirements: "PRIVATE REQUIREMENTS", internalNotes: "PRIVATE NOTES", status: "INTAKE", createdAt: new Date(), deletedAt: null, publicTrackingTokenEncrypted: null, business: { name: "Brand", status: "ACTIVE", deletedAt: null as Date | null, email: "brand@example.test", phone: "+254722110000", address: "Nairobi", city: "Nairobi" }, customer: { fullName: "Customer", deletedAt: null as Date | null, userId: null, user: null, email: "customer@example.test", phone: "+254722110001", whatsappPhone: null, preferredCommunication: "EMAIL", whatsappOptIn: true } });
beforeEach(() => { vi.clearAllMocks(); prisma.notification.findFirst.mockResolvedValue(null); prisma.notification.create.mockResolvedValue({ id: "notification-id" }); prisma.notification.update.mockResolvedValue({}); prisma.setting.findUnique.mockResolvedValue(null); sendWhatsAppTicketMessage.mockResolvedValue({ configured: true, providerId: "wamid.test-ack" }); sendMail.mockResolvedValue({ providerId: "mail-ack" }); });
describe("ticket notifications consent and privacy", () => {
  it("adds the configured review link to completion email, without sending a WhatsApp review automatically", async () => {
    const value = ticket();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.repair.findUnique.mockResolvedValue({ ...value, reference: "RT-2026-000001", status: "COMPLETED", notificationPreferenceOverride: null, device: { brand: "Brand", model: "Model", type: "LAPTOP" }, invoices: [] });
    prisma.setting.findUnique.mockImplementation(async ({ where }) => where.scope_key.key === "reviews.google" ? { businessId: value.businessId, value: { googleReviewUrl: "https://g.page/r/Cbadgp9VKwYjEBI/review" } } : null);
    await notifyRepairStatus("ticket-id");
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining("https://g.page/r/Cbadgp9VKwYjEBI/review"), text: expect.stringContaining("Leave a Google review") }));
    expect(sendWhatsAppTicketMessage).not.toHaveBeenCalled();
    prisma.notification.findFirst.mockResolvedValue({ id: "already-notified" });
    await notifyRepairStatus("ticket-id");
    expect(sendMail).toHaveBeenCalledOnce();
  });
  it("does not send a completion review email when the customer prefers WhatsApp", async () => {
    const value = ticket(); value.customer.preferredCommunication = "WHATSAPP";
    prisma.user.findMany.mockResolvedValue([]);
    prisma.repair.findUnique.mockResolvedValue({ ...value, reference: "RT-2026-000001", status: "COMPLETED", notificationPreferenceOverride: null, device: { brand: "Brand", model: "Model", type: "LAPTOP" }, invoices: [] });
    await notifyRepairStatus("ticket-id");
    expect(sendMail).not.toHaveBeenCalled();
    expect(JSON.stringify(sendWhatsAppTicketMessage.mock.calls)).not.toContain("g.page");
  });
  it("automatically sends intake WhatsApp even with email preference, but only with explicit consent", async () => {
    prisma.digitalTicket.findUnique.mockResolvedValue(ticket());
    await notifyDigitalTicketCreated("ticket-id", "https://repair.example/track/digital/token");
    expect(sendWhatsAppTicketMessage).toHaveBeenCalledWith(expect.objectContaining({ ticketNumber: "WEB-2026-000001", trackingUrl: "https://repair.example/track/digital/token" }));
    expect(sendMail).toHaveBeenCalled();
    expect(JSON.stringify(sendWhatsAppTicketMessage.mock.calls)).not.toContain("PRIVATE");
    expect(JSON.stringify(sendMail.mock.calls)).not.toContain("PRIVATE");
  });
  it.each(["SOFTWARE", "AI_AGENT"])("includes the %s intake number and tracking link", async kind => {
    const value = { ...ticket(), kind };
    prisma.digitalTicket.findUnique.mockResolvedValue(value);
    await notifyDigitalTicketCreated("ticket-id", "https://repair.example/track/digital/token");
    expect(sendWhatsAppTicketMessage).toHaveBeenCalledWith(expect.objectContaining({ serviceLabel: kind === "SOFTWARE" ? "Software" : "AI agent", ticketNumber: value.reference, trackingUrl: "https://repair.example/track/digital/token" }));
  });
  it("includes repair intake number and tracking link for a consented customer preferring email", async () => {
    const value = ticket();
    prisma.repair.findUnique.mockResolvedValue({ ...value, reference: "RT-2026-000001", status: "RECEIVED", notificationPreferenceOverride: null, device: { brand: "Brand", model: "Model", type: "LAPTOP" }, invoices: [] });
    await notifyRepairCreated("ticket-id", "https://repair.example/track/token");
    expect(sendWhatsAppTicketMessage).toHaveBeenCalledWith(expect.objectContaining({ serviceLabel: "Repair", ticketNumber: "RT-2026-000001", trackingUrl: "https://repair.example/track/token" }));
    expect(sendMail).toHaveBeenCalled();
  });
  it("does not call WhatsApp for unconsented customers, even if WhatsApp is their preference", async () => {
    const value = ticket(); value.customer.whatsappOptIn = false; value.customer.preferredCommunication = "WHATSAPP";
    prisma.digitalTicket.findUnique.mockResolvedValue(value);
    await notifyDigitalTicketCreated("ticket-id", "https://repair.example/track/digital/token");
    expect(sendWhatsAppTicketMessage).not.toHaveBeenCalled();
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", failureReason: expect.stringContaining("consent") }) }));
  });
  it("records missing provider configuration as pending, not sent", async () => {
    const value = ticket(); value.customer.preferredCommunication = "WHATSAPP";
    prisma.digitalTicket.findUnique.mockResolvedValue(value);
    sendWhatsAppTicketMessage.mockResolvedValue({ configured: false, failureReason: "Not configured" });
    await notifyDigitalTicketCreated("ticket-id", "https://repair.example/track/digital/token");
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", sentAt: undefined }) }));
  });
  it("does not duplicate sends if a concurrent intake notification already claimed the unique key", async () => {
    prisma.digitalTicket.findUnique.mockResolvedValue(ticket());
    prisma.notification.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "6.19.3" }));
    await notifyDigitalTicketCreated("ticket-id", "https://repair.example/track/digital/token");
    expect(sendWhatsAppTicketMessage).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("emails issued invoices to customers without requiring a RepairTrack user account", async () => {
    const value = ticket();
    prisma.invoice.findUnique.mockResolvedValue({ id: "invoice-id", businessId: value.businessId, customer: value.customer, business: { ...value.business, currency: "KES" }, number: "INV-2026-000001", total: 2500, balance: 2500, amountPaid: 0 });
    await notifyInvoiceEvent("invoice-id", "ISSUED");
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: value.customer.email, html: expect.stringContaining("Invoice") }));
  });
  it("scopes retries to the administrator's business and rechecks current consent", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "notification-id", businessId: "business-id", status: "PENDING", digitalTicketId: "ticket-id", repairId: null, template: "digital.intake" });
    const value = ticket(); value.customer.whatsappOptIn = false;
    prisma.digitalTicket.findUnique.mockResolvedValue(value);
    await expect(retryWhatsAppNotification("notification-id", "business-id")).rejects.toMatchObject({ code: "WHATSAPP_CONSENT_REQUIRED" });
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: "notification-id", businessId: "business-id", channel: "WHATSAPP" } });
    expect(sendWhatsAppTicketMessage).not.toHaveBeenCalled();
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });
  it.each(["customer", "business"])("does not retry messages for an inactive %s", async target => {
    prisma.notification.findFirst.mockResolvedValue({ id: "notification-id", businessId: "business-id", status: "PENDING", digitalTicketId: "ticket-id", repairId: null, template: "digital.intake" });
    const value = ticket();
    if (target === "customer") value.customer.deletedAt = new Date();
    else value.business.status = "SUSPENDED";
    prisma.digitalTicket.findUnique.mockResolvedValue(value);
    await expect(retryWhatsAppNotification("notification-id", "business-id")).rejects.toMatchObject({ code: "WHATSAPP_CONSENT_REQUIRED" });
    expect(sendWhatsAppTicketMessage).not.toHaveBeenCalled();
  });
  it("does not deliver a newly created ticket for a deleted customer", async () => {
    const value = ticket(); value.customer.deletedAt = new Date();
    prisma.digitalTicket.findUnique.mockResolvedValue(value);
    await notifyDigitalTicketCreated("ticket-id", "https://repair.example/track/digital/token");
    expect(sendWhatsAppTicketMessage).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("does not call the provider when another retry has already claimed the notification", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "notification-id", businessId: "business-id", status: "PENDING", digitalTicketId: "ticket-id", repairId: null, template: "digital.intake" });
    prisma.digitalTicket.findUnique.mockResolvedValue(ticket());
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(retryWhatsAppNotification("notification-id", "business-id")).rejects.toMatchObject({ code: "NOTIFICATION_RETRY_IN_PROGRESS" });
    expect(sendWhatsAppTicketMessage).not.toHaveBeenCalled();
  });
});
