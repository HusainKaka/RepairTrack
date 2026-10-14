import { describe, expect, it } from "vitest";
import { whatsappConsentUpdate } from "../src/modules/customers/whatsapp-consent.js";
describe("recipient-specific WhatsApp consent", () => {
  it("defaults new contacts to no consent", () => {
    expect(whatsappConsentUpdate({ phone: "+254700000000" })).toEqual({ whatsappOptIn: false, whatsappOptInAt: null });
  });
  it("records consent time server-side only when explicitly opted in", () => {
    expect(whatsappConsentUpdate({ phone: "+254700000000", whatsappOptIn: true })).toEqual({ whatsappOptIn: true, whatsappOptInAt: expect.any(Date) });
  });
  it("withdraws consent when the recipient changes unless explicitly reconfirmed", () => {
    expect(whatsappConsentUpdate({ phone: "+254711111111" }, { phone: "+254700000000", whatsappOptIn: true })).toEqual({ whatsappOptIn: false, whatsappOptInAt: null });
  });
  it("preserves consent for unrelated profile edits", () => {
    expect(whatsappConsentUpdate({}, { phone: "+254700000000", whatsappOptIn: true })).toEqual({});
  });
  it("allows withdrawal without altering phone fields", () => {
    expect(whatsappConsentUpdate({ whatsappOptIn: false }, { phone: "+254700000000", whatsappOptIn: true })).toEqual({ whatsappOptIn: false, whatsappOptInAt: null });
  });
});
