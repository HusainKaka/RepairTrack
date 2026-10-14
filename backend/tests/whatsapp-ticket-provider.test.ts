import { beforeEach, describe, expect, it, vi } from "vitest";
const env = vi.hoisted(() => ({ WHATSAPP_API_VERSION: "v24.0", WHATSAPP_ACCESS_TOKEN: "test-provider-token", WHATSAPP_PHONE_NUMBER_ID: "123456789", WHATSAPP_TICKET_TEMPLATE_NAME: "ticket_progress", WHATSAPP_TICKET_TEMPLATE_LANGUAGE: "en", PUBLIC_WEB_URL: "https://repair.example" }));
vi.mock("../src/config/env.js", () => ({ env }));
import { normalizeWhatsAppPhone, sendWhatsAppTicketMessage } from "../src/modules/notifications/whatsapp-provider.js";
const message = { to: "+254722110000", customerName: "Customer", ticketNumber: "WEB-2026-000001", serviceLabel: "Website", statusLabel: "INTAKE", trackingUrl: "https://repair.example/track/digital/private-token" };
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); env.WHATSAPP_TICKET_TEMPLATE_NAME = "ticket_progress"; });
describe("approved WhatsApp ticket messaging", () => {
  it("sends the ticket and private tracking link as an approved template with five parameters", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.provider-ack" }] }) });
    expect(await sendWhatsAppTicketMessage(message)).toMatchObject({ configured: true, providerId: "wamid.provider-ack" });
    const [, options] = fetchMock.mock.calls[0]!;
    const payload = JSON.parse(options.body);
    expect(payload).toMatchObject({ type: "template", to: "254722110000", template: { name: "ticket_progress", language: { code: "en" } } });
    expect(payload.template.components[0].parameters).toEqual(["Customer", "WEB-2026-000001", "Website", "INTAKE", message.trackingUrl].map(text => ({ type: "text", text })));
    expect(options.redirect).toBe("error");
  });
  it("does not send or report success if the approved template is not configured", async () => {
    env.WHATSAPP_TICKET_TEMPLATE_NAME = "";
    expect(await sendWhatsAppTicketMessage(message)).toMatchObject({ configured: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("never reports sent when the provider does not acknowledge the message", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) });
    expect(await sendWhatsAppTicketMessage(message)).toMatchObject({ configured: true, providerId: undefined, failureReason: "WhatsApp provider did not acknowledge the message" });
  });
  it("rejects untrusted tracking domains and invalid destination numbers before provider calls", async () => {
    expect(await sendWhatsAppTicketMessage({ ...message, trackingUrl: "https://repair.example.evil/track/digital/private-token" })).toMatchObject({ configured: true, failureReason: expect.any(String) });
    expect(await sendWhatsAppTicketMessage({ ...message, to: "not-a-number" })).toMatchObject({ configured: true, failureReason: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sanitizes provider failures without echoing tokens or remote response content", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "private-provider-data" }) });
    const result = await sendWhatsAppTicketMessage(message);
    expect(result.failureReason).toBe("WhatsApp provider rejected the request with status 400");
    expect(JSON.stringify(result)).not.toContain(env.WHATSAPP_ACCESS_TOKEN);
  });
  it("normalizes Kenyan local and international formats without accepting arbitrary text", () => {
    expect(normalizeWhatsAppPhone("0722 110000")).toBe("254722110000");
    expect(normalizeWhatsAppPhone("+254 722 110000")).toBe("254722110000");
    expect(normalizeWhatsAppPhone("00254 722 110000")).toBe("254722110000");
    expect(normalizeWhatsAppPhone("012345678901234")).toBeNull();
    expect(normalizeWhatsAppPhone("hello0722110000")).toBeNull();
  });
});
