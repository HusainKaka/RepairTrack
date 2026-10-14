import { env } from "../../config/env.js";

export interface WhatsAppMessage {
  to: string;
  body: string;
}

export interface WhatsAppTicketMessage {
  to: string;
  customerName: string;
  ticketNumber: string;
  serviceLabel: string;
  statusLabel: string;
  trackingUrl: string;
}

export interface WhatsAppSendResult {
  configured: boolean;
  providerId?: string;
  failureReason?: string;
}

export function normalizeWhatsAppPhone(value: string): string | null {
  if (!/^\+?[\d ()-]+$/.test(value.trim())) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) {
    if (digits.length !== 10) return null;
    digits = `254${digits.slice(1)}`;
  }
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

export function whatsappConfigured(): boolean {
  return Boolean(env.WHATSAPP_API_VERSION && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export function whatsappTicketConfigured(): boolean {
  return whatsappConfigured() && Boolean(env.WHATSAPP_TICKET_TEMPLATE_NAME);
}

/** Business-initiated messages require the administrator's approved utility template. */
export async function sendWhatsAppTicketMessage(message: WhatsAppTicketMessage): Promise<WhatsAppSendResult> {
  if (!whatsappTicketConfigured()) return { configured: false, failureReason: "Configure WhatsApp Cloud API and an approved ticket notification template before delivery" };
  const destination = normalizeWhatsAppPhone(message.to);
  if (!destination) return { configured: true, failureReason: "The WhatsApp destination phone number is invalid" };
  const tracking = new URL(message.trackingUrl);
  if (tracking.origin !== new URL(env.PUBLIC_WEB_URL).origin || !tracking.pathname.startsWith("/track/")) return { configured: true, failureReason: "A valid first-party private tracking link is required" };
  const parameters = [message.customerName, message.ticketNumber, message.serviceLabel, message.statusLabel, message.trackingUrl];
  const result = await fetch(`https://graph.facebook.com/${encodeURIComponent(env.WHATSAPP_API_VERSION!)}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {
    method: "POST", headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: destination, type: "template", template: { name: env.WHATSAPP_TICKET_TEMPLATE_NAME, language: { code: env.WHATSAPP_TICKET_TEMPLATE_LANGUAGE }, components: [{ type: "body", parameters: parameters.map(text => ({ type: "text", text })) }] } }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!result.ok) return { configured: true, failureReason: `WhatsApp provider rejected the request with status ${result.status}` };
  const payload = await result.json() as { messages?: Array<{ id?: string }> };
  const providerId = payload.messages?.[0]?.id;
  return { configured: true, providerId, failureReason: providerId ? undefined : "WhatsApp provider did not acknowledge the message" };
}

export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
  if (!whatsappConfigured()) return { configured: false, failureReason: "WhatsApp Cloud API is not configured" };
  const destination = normalizeWhatsAppPhone(message.to);
  if (!destination) return { configured: true, failureReason: "The WhatsApp destination phone number is invalid" };
  const result = await fetch(`https://graph.facebook.com/${encodeURIComponent(env.WHATSAPP_API_VERSION!)}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: destination, type: "text", text: { preview_url: false, body: message.body } }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!result.ok) return { configured: true, failureReason: `WhatsApp provider rejected the request with status ${result.status}` };
  const payload = await result.json() as { messages?: Array<{ id?: string }> };
  return { configured: true, providerId: payload.messages?.[0]?.id };
}

