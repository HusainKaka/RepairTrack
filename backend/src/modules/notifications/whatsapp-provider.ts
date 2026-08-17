import { env } from "../../config/env.js";

export interface WhatsAppMessage {
  to: string;
  body: string;
}

export interface WhatsAppSendResult {
  configured: boolean;
  providerId?: string;
  failureReason?: string;
}

export function normalizeWhatsAppPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
}

export function whatsappConfigured(): boolean {
  return Boolean(env.WHATSAPP_API_VERSION && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
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
  });
  if (!result.ok) return { configured: true, failureReason: `WhatsApp provider rejected the request with status ${result.status}` };
  const payload = await result.json() as { messages?: Array<{ id?: string }> };
  return { configured: true, providerId: payload.messages?.[0]?.id };
}

