import PDFDocument from "pdfkit";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
const prisma = vi.hoisted(() => ({ setting: { findUnique: vi.fn() } }));
vi.mock("../src/lib/prisma.js", () => ({ prisma }));
import { renderInvoicePdf, renderReceiptPdf } from "../src/lib/pdf.js";
import { renderCustomerEmail } from "../src/modules/notifications/email-templates.js";
import { emailLogoForBusiness } from "../src/modules/notifications/notification.service.js";

const business = (enabled: boolean) => ({ id: "business-id", name: "Husaini Tech Solutions", address: "Nairobi", city: "Nairobi", phone: "+254722110000", email: "business@example.test", currency: "KES", taxPin: "A123456789B", timeZone: "Africa/Nairobi", invoiceFooter: "Thank you\nKRA supplier information\neTIMS reference", receiptFooter: "Thank you\nKRA supplier information\neTIMS reference", taxSettings: { etimsEnabled: enabled }, logoUrl: "https://unused-legacy.example/logo.png" });
const invoice = (enabled: boolean) => ({ id: "invoice-id", number: "INV-2026-000001", businessId: "business-id", business: business(enabled), customer: { fullName: "Customer", email: "customer@example.test", phone: "+254722110001" }, digitalTicket: { reference: "WEB-2026-000001", title: "Customer website", status: "IN_PROGRESS" }, repair: null, subtotal: 10000, taxAmount: 0, discountAmount: 0, total: 10000, amountPaid: 2000, balance: 8000, kraStatus: "CONFIRMED", kraReference: "PRIVATE-KRA-REFERENCE", items: [{ description: "Website implementation", quantity: 1, unitPrice: 10000, lineTotal: 10000 }] });
const textSpy = vi.spyOn(PDFDocument.prototype, "text");
const imageSpy = vi.spyOn(PDFDocument.prototype, "image");
let logo: Buffer;
beforeEach(async () => {
  textSpy.mockClear(); imageSpy.mockClear();
  logo = await sharp({ create: { width: 20, height: 12, channels: 3, background: "#2563eb" } }).png().toBuffer();
  prisma.setting.findUnique.mockResolvedValue({ value: { dataUrl: `data:image/png;base64,${logo.toString("base64")}` } });
});
const renderedText = () => textSpy.mock.calls.map(call => String(call[0])).join("\n");
describe("uploaded logo, digital invoice and KRA document presentation", () => {
  it("renders the uploaded logo and digital ticket reference in a valid invoice PDF without disabled KRA content", async () => {
    const pdf = await renderInvoicePdf(invoice(false), "https://repair.example/invoices/invoice-id");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const output = renderedText();
    expect(output).toContain("WEB-2026-000001");
    expect(output).toContain("Customer website");
    expect(output).toContain("Total: KES 10000.00");
    expect(output).not.toMatch(/KRA|eTIMS|PRIVATE-KRA-REFERENCE/);
    expect(imageSpy.mock.calls[0]![0]).toEqual(logo);
    expect(imageSpy.mock.calls[0]![3]).toMatchObject({ fit: [120, 54] });
  });
  it("retains KRA information after the administrator explicitly enables it", async () => {
    await renderInvoicePdf(invoice(true), "https://repair.example/invoices/invoice-id");
    expect(renderedText()).toContain("KRA PIN: A123456789B");
    expect(renderedText()).toContain("eTIMS: CONFIRMED");
    expect(renderedText()).toContain("PRIVATE-KRA-REFERENCE");
  });
  it.each(["58mm", "80mm", "A4"] as const)("renders a branded digital receipt at %s without disabled KRA content", async width => {
    const value = invoice(false);
    const pdf = await renderReceiptPdf({ number: "RCT-2026-000001", businessId: value.businessId, business: value.business, invoice: value, repair: null, payment: { amount: 2000, method: "CASH" }, issuedAt: new Date("2026-10-14T12:00:00Z"), issuedBy: { fullName: "Administrator" } }, width);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(renderedText()).toContain("Ticket: WEB-2026-000001");
    expect(renderedText()).toContain("Status: IN_PROGRESS");
    expect(renderedText()).toContain("Amount paid now: KES 2000.00");
    expect(renderedText()).not.toMatch(/KRA|eTIMS|PRIVATE-KRA-REFERENCE/);
    expect(imageSpy.mock.calls[0]![0]).toEqual(logo);
    expect(imageSpy.mock.calls[0]![3]).toHaveProperty("fit");
  });
  it("attaches the uploaded logo inline for email instead of fetching a remote URL", async () => {
    const logoInput = await emailLogoForBusiness("business-id");
    expect(logoInput.attachments).toEqual([{ filename: "business-logo.png", content: logo, contentType: "image/png", cid: "business-logo-business-id@repairtrack" }]);
    const result = renderCustomerEmail({ business: business(false), logoCid: logoInput.logoCid, customerName: '<script>alert("unsafe")</script>', reference: "INV-2026-000001", title: "Invoice", statusLabel: "ISSUED", message: "Your invoice is attached.", details: [] });
    expect(result.html).toContain('src="cid:business-logo-business-id@repairtrack"');
    expect(result.html).not.toContain("unused-legacy.example");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });
});
