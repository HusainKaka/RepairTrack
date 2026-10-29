export interface WhatsAppShareDetails {
  trackingUrl?: string;
  invoiceUrl?: string;
  reviewUrl?: string | null;
}

export interface WhatsAppShareInput extends WhatsAppShareDetails {
  customerName: string;
  phone?: string | null;
  whatsappPhone?: string | null;
  reference: string;
  serviceLabel?: string;
  invoiceTotal?: string;
  currency?: string;
}

export type WhatsAppShareResult =
  | { ok: true; href: string; message: string }
  | { ok: false; reason: string };

/** wa.me needs international digits, without a plus, separators or extensions. */
export function normalizeWhatsAppPhone(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length > 64 || !/^\+?[\d ()-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00") && !trimmed.startsWith("+")) digits = digits.slice(2);
  else if (digits.startsWith("0") && !trimmed.startsWith("+")) {
    if (!/^0[17]\d{8}$/.test(digits)) return null;
    digits = `254${digits.slice(1)}`;
  }
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

function firstPartyLink(value: string, origin: string, kind: "tracking" | "invoice"): string | null {
  if (value.length > 4096) return null;
  try {
    const url = new URL(value);
    const expected = new URL(origin);
    const localDevelopment = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localDevelopment) || url.origin !== expected.origin || url.username || url.password || url.search || url.hash) return null;
    const validPath = kind === "tracking"
      ? /^\/track\/(?:digital\/)?[A-Za-z0-9_-]{43}$/.test(url.pathname)
      : /^\/api\/v1\/invoices\/shared\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url.pathname);
    return validPath ? url.href : null;
  } catch {
    return null;
  }
}

function plainLine(value: string, max: number): string {
  return value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ").trim().slice(0, max);
}

export function isGoogleReviewLink(value: string): boolean {
  if (value.length > 2048 || /[\s\p{Cc}\\]/u.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
    return (url.hostname === "g.page" && /^\/r\/[A-Za-z0-9_-]+\/review\/?$/.test(url.pathname))
      || (["search.google.com", "www.google.com", "google.com"].includes(url.hostname) && url.pathname === "/local/writereview" && /^[A-Za-z0-9_-]{5,256}$/.test(url.searchParams.get("placeid") ?? ""))
      || (url.hostname === "maps.app.goo.gl" && /^\/[A-Za-z0-9]+\/?$/.test(url.pathname));
  } catch { return false; }
}

/** Private URLs stay local until an operator explicitly opens WhatsApp. */
export function buildWhatsAppShare(input: WhatsAppShareInput, origin: string): WhatsAppShareResult {
  const recipient = input.whatsappPhone?.trim() || input.phone?.trim() || "";
  const phone = normalizeWhatsAppPhone(recipient);
  if (!phone) return { ok: false, reason: "Add a valid customer phone or WhatsApp number, including its country code." };
  const reference = plainLine(input.reference, 80);
  if (!reference) return { ok: false, reason: "A ticket or invoice reference is required." };
  const tracking = input.trackingUrl ? firstPartyLink(input.trackingUrl, origin, "tracking") : null;
  const invoice = input.invoiceUrl ? firstPartyLink(input.invoiceUrl, origin, "invoice") : null;
  const review = input.reviewUrl && isGoogleReviewLink(input.reviewUrl) ? input.reviewUrl : null;
  if (input.reviewUrl && !review) return { ok: false, reason: "Add a valid Google review link in Settings → Delivery." };
  if ((input.trackingUrl && !tracking) || (input.invoiceUrl && !invoice)) return { ok: false, reason: "A valid RepairTrack sharing link is required. Reload the page and try again." };
  if (!tracking && !invoice && !review) return { ok: false, reason: "The sharing link is not available yet." };

  const greeting = plainLine(input.customerName, 120);
  const lines = [greeting ? `Hello ${greeting},` : "Hello,", "", "RepairTrack by Husaini Tech Solutions"];
  if (invoice) {
    lines.push(`Invoice: ${reference}`);
    const total = Number(input.invoiceTotal);
    if (input.invoiceTotal?.trim() && Number.isFinite(total) && total >= 0 && input.currency) lines.push(`Total: ${plainLine(input.currency, 12)} ${total.toFixed(2)}`);
    lines.push(`View/download your invoice: ${invoice}`);
    lines.push("This private invoice link expires in 7 days. Please do not forward it.");
  } else {
    lines.push(`${plainLine(input.serviceLabel || "Repair", 64)} ticket: ${reference}`);
  }
  if (tracking) lines.push(`Track your request: ${tracking}`, "Please keep your private tracking link secure.");
  if (review) lines.push("", "Your repair is complete. Thank you for choosing us. You are welcome to share an honest review of your experience:", review);
  const message = lines.join("\n");
  return { ok: true, message, href: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` };
}
