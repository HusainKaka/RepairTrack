import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const asBuffer = (document: PDFKit.PDFDocument): Promise<Buffer> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  document.on("end", () => resolve(Buffer.concat(chunks)));
  document.on("error", reject);
});

const money = (currency: string, value: unknown): string => `${currency} ${Number(value).toFixed(2)}`;

const privateAddress = (address: string): boolean => address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);

async function loadPublicLogo(value: unknown): Promise<Buffer | null> {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) return null;
    const result = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!result.ok || !result.headers.get("content-type")?.startsWith("image/")) return null;
    const buffer = Buffer.from(await result.arrayBuffer());
    return buffer.length <= 2_000_000 ? buffer : null;
  } catch {
    return null;
  }
}

export async function renderInvoicePdf(invoice: any, publicUrl: string): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Invoice ${invoice.number}`, Author: "RepairTrack" } });
  const result = asBuffer(document);
  const logo = await loadPublicLogo(invoice.business.logoUrl);
  if (logo) { document.image(logo, 48, 42, { fit: [120, 54], valign: "center" }); document.moveDown(3.2); }
  document.fontSize(22).fillColor("#2563EB").text(invoice.business.name, { align: "left" });
  document.fontSize(10).fillColor("#334155").text(`${invoice.business.address}, ${invoice.business.city}\n${invoice.business.phone} • ${invoice.business.email}`);
  if (invoice.business.taxPin) document.text(`KRA PIN: ${invoice.business.taxPin}`);
  document.moveUp(3).fontSize(22).fillColor("#0F172A").text("INVOICE", { align: "right" });
  document.fontSize(10).text(invoice.number, { align: "right" });
  document.moveDown(2).fillColor("#0F172A").fontSize(11).text(`Bill to: ${invoice.customer.fullName}`);
  document.text(`${invoice.customer.email ?? ""} ${invoice.customer.phone}`.trim());
  if (invoice.repair) document.text(`Repair: ${invoice.repair.reference} • ${invoice.repair.device.brand} ${invoice.repair.device.model}`);
  document.moveDown();
  document.font("Helvetica-Bold").text("Description", 48, document.y, { width: 270 });
  document.text("Qty", 330, document.y - 13, { width: 45, align: "right" });
  document.text("Price", 380, document.y - 13, { width: 70, align: "right" });
  document.text("Total", 455, document.y - 13, { width: 90, align: "right" });
  document.moveDown(0.5).font("Helvetica");
  for (const item of invoice.items) {
    const y = document.y;
    document.text(item.description, 48, y, { width: 270 });
    document.text(Number(item.quantity).toFixed(2), 330, y, { width: 45, align: "right" });
    document.text(money(invoice.business.currency, item.unitPrice), 380, y, { width: 70, align: "right" });
    document.text(money(invoice.business.currency, item.lineTotal), 455, y, { width: 90, align: "right" });
    document.moveDown();
  }
  document.moveDown().font("Helvetica-Bold");
  document.text(`Subtotal: ${money(invoice.business.currency, invoice.subtotal)}`, { align: "right" });
  document.text(`Tax: ${money(invoice.business.currency, invoice.taxAmount)}`, { align: "right" });
  document.text(`Discount: ${money(invoice.business.currency, invoice.discountAmount)}`, { align: "right" });
  document.fontSize(14).text(`Total: ${money(invoice.business.currency, invoice.total)}`, { align: "right" });
  document.fontSize(11).text(`Paid: ${money(invoice.business.currency, invoice.amountPaid)}   Balance: ${money(invoice.business.currency, invoice.balance)}`, { align: "right" });
  document.fontSize(9).fillColor("#475569").text(`eTIMS: ${String(invoice.kraStatus).replaceAll("_", " ")}${invoice.kraReference ? ` • ${invoice.kraReference}` : ""}`, { align: "right" });
  const qr = await QRCode.toBuffer(publicUrl, { width: 180, margin: 1, errorCorrectionLevel: "M" });
  document.image(qr, 48, Math.min(document.y + 18, 650), { width: 82 });
  document.font("Helvetica").fontSize(9).text(invoice.terms ?? invoice.business.invoiceFooter ?? "Thank you for choosing us.", 150, Math.min(document.y + 35, 680), { width: 380 });
  document.end();
  return result;
}

export async function renderReceiptPdf(receipt: any, paperWidth: "58mm" | "80mm" | "A4"): Promise<Buffer> {
  const widths = { "58mm": 164, "80mm": 227, A4: 595 };
  const thermal = paperWidth !== "A4";
  const document = new PDFDocument({ size: thermal ? [widths[paperWidth], 620] : "A4", margin: thermal ? 12 : 48, info: { Title: `Receipt ${receipt.number}`, Author: "RepairTrack" } });
  const result = asBuffer(document);
  const logo = await loadPublicLogo(receipt.business.logoUrl);
  if (logo) { const width = thermal ? 62 : 100; document.image(logo, (document.page.width - width) / 2, document.y, { fit: [width, thermal ? 34 : 50], align: "center" }); document.moveDown(thermal ? 4 : 5); }
  document.fontSize(thermal ? 13 : 20).font("Helvetica-Bold").text(receipt.business.name, { align: "center" });
  document.fontSize(thermal ? 7 : 10).font("Helvetica").text(`${receipt.business.address}\n${receipt.business.phone}`, { align: "center" });
  document.moveDown().font("Helvetica-Bold").text("PAYMENT RECEIPT", { align: "center" });
  document.font("Helvetica").text(`Receipt: ${receipt.number}\nInvoice: ${receipt.invoice.number}\nRepair: ${receipt.repair?.reference ?? "N/A"}\nStatus: ${receipt.repair?.status ?? receipt.statusSnapshot ?? "N/A"}\nCustomer: ${receipt.invoice.customer.fullName}`);
  document.moveDown(0.5);
  for (const item of receipt.invoice.items ?? []) document.text(`${item.description}  ${Number(item.quantity).toFixed(2)} × ${money(receipt.business.currency, item.unitPrice)}`);
  document.moveDown(0.5).text(`Subtotal: ${money(receipt.business.currency, receipt.invoice.subtotal)}\nTax: ${money(receipt.business.currency, receipt.invoice.taxAmount)}\nDiscount: ${money(receipt.business.currency, receipt.invoice.discountAmount)}\nInvoice total: ${money(receipt.business.currency, receipt.invoice.total)}\nAmount paid now: ${money(receipt.business.currency, receipt.payment.amount)}\nBalance: ${money(receipt.business.currency, receipt.invoice.balance)}\nMethod: ${receipt.payment.method}\nDate: ${new Date(receipt.issuedAt).toLocaleString("en-KE", { timeZone: receipt.business.timeZone })}\nCashier: ${receipt.issuedBy.fullName}`);
  const qr = await QRCode.toBuffer(`${receipt.invoice.number}:${receipt.number}`, { width: 160, margin: 1 });
  document.moveDown().image(qr, (document.page.width - (thermal ? 70 : 90)) / 2, document.y, { width: thermal ? 70 : 90 });
  document.moveDown(thermal ? 8 : 10).fontSize(thermal ? 7 : 9).text(receipt.business.receiptFooter ?? "Thank you.", { align: "center" });
  document.end();
  return result;
}
