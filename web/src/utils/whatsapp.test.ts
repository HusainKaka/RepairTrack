import { describe, expect, it } from "vitest";
import { buildWhatsAppShare, normalizeWhatsAppPhone } from "./whatsapp";

const origin = "https://repair-track-web.vercel.app";
const token = "a".repeat(43);
const input = { customerName: "Amina & Co", phone: "0712 345 678", reference: "REP-2026-000001", trackingUrl: `${origin}/track/${token}` };

describe("WhatsApp phone normalization", () => {
  it.each([["0712 345 678", "254712345678"], ["0112-345-678", "254112345678"], ["+254 (712) 345678", "254712345678"], ["00254712345678", "254712345678"], ["+44 7700 900123", "447700900123"]])("normalizes %s", (value, expected) => expect(normalizeWhatsAppPhone(value)).toBe(expected));
  it.each(["", "123", "+0712345678", "0812345678", "0712345678&text=wrong", "https://wa.me/254712345678", "254712345678 ext 9", "+".repeat(100), "１２３４５６７８９０", "1234567890123456"])("rejects invalid recipient %s", value => expect(normalizeWhatsAppPhone(value)).toBeNull());
});

describe("private WhatsApp drafts", () => {
  it("includes the owner's Google review link in a manually opened completion draft", () => {
    const result = buildWhatsAppShare({ ...input, reviewUrl: "https://g.page/r/Cbadgp9VKwYjEBI/review" }, origin);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const draft = new URL(result.href);
    expect(draft.hostname).toBe("wa.me");
    expect(draft.searchParams.get("text")).toContain("Your repair is complete");
    expect(draft.searchParams.get("text")).toContain("https://g.page/r/Cbadgp9VKwYjEBI/review");
    expect(draft.searchParams.get("text")).toContain(input.trackingUrl);
  });
  it("rejects unrelated, script and impersonated Google review destinations", () => {
    for (const reviewUrl of ["javascript:alert(1)", "https://g.page.evil.test/r/a/review", "https://evil.test", "https://www.google.com/url?url=https://evil.test"]) expect(buildWhatsAppShare({ ...input, reviewUrl }, origin).ok).toBe(false);
  });
  it("encodes the full message, name and tracking link without extra query parameters", () => {
    const result = buildWhatsAppShare(input, origin);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.href);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/254712345678");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(result.message);
    expect(result.message).toContain("Hello Amina & Co,");
    expect(result.message).toContain(input.trackingUrl);
    expect(result.message).toContain("RepairTrack by Husaini Tech Solutions");
  });
  it("prefers the explicit WhatsApp number without falling back from an invalid override", () => {
    const valid = buildWhatsAppShare({ ...input, whatsappPhone: "+254700000002" }, origin);
    expect(valid.ok && valid.href).toContain("wa.me/254700000002?");
    expect(buildWhatsAppShare({ ...input, whatsappPhone: "invalid" }, origin).ok).toBe(false);
    expect(buildWhatsAppShare({ ...input, whatsappPhone: " " }, origin).ok).toBe(true);
  });
  it.each(["Website", "Software", "AI-agent service"])("includes the %s ticket and its digital tracking link", serviceLabel => {
    const result = buildWhatsAppShare({ ...input, serviceLabel, trackingUrl: `${origin}/track/digital/${token}` }, origin);
    expect(result.ok && result.message).toContain(`${serviceLabel} ticket: ${input.reference}`);
  });
  it("includes an expiring invoice PDF link, invoice number, total and optional tracking", () => {
    const invoiceUrl = `${origin}/api/v1/invoices/shared/eyJhbGci.eyJwdXJwb3Nl.c2lnbmF0dXJl`;
    const result = buildWhatsAppShare({ ...input, invoiceUrl, reference: "INV-2026-000010", invoiceTotal: "1250", currency: "KES" }, origin);
    expect(result.ok && result.message).toContain("Invoice: INV-2026-000010");
    expect(result.ok && result.message).toContain("Total: KES 1250.00");
    expect(result.ok && result.message).toContain(invoiceUrl);
    expect(result.ok && result.message).toContain("expires in 7 days");
    expect(result.ok && result.message).toContain(input.trackingUrl);
  });
  it.each([`https://evil.example/track/${token}`, `https://repair-track-web.vercel.app.evil.example/track/${token}`, `javascript:alert(1)`, `${origin}/track/${token}?redirect=evil`, `${origin}/track/${token}#token`, `${origin}/track/short`, `${origin}/invoices/internal-id`, `https://user:password@repair-track-web.vercel.app/track/${token}`])("rejects unsafe tracking URL %s", trackingUrl => expect(buildWhatsAppShare({ ...input, trackingUrl }, origin).ok).toBe(false));
  it("rejects plain HTTP away from localhost and allows a local development link", () => {
    expect(buildWhatsAppShare({ ...input, trackingUrl: `http://example.com/track/${token}` }, "http://example.com").ok).toBe(false);
    expect(buildWhatsAppShare({ ...input, trackingUrl: `http://localhost:5173/track/${token}` }, "http://localhost:5173").ok).toBe(true);
  });
  it("requires a link and strips line/control injection from displayed fields", () => {
    expect(buildWhatsAppShare({ ...input, trackingUrl: undefined }, origin).ok).toBe(false);
    const result = buildWhatsAppShare({ ...input, customerName: "Amina\nFake invoice\u202e", reference: "REP\nFake link" }, origin);
    expect(result.ok && result.message).toContain("Hello Amina Fake invoice,");
    expect(result.ok && result.message).toContain("Repair ticket: REP Fake link");
  });
});
