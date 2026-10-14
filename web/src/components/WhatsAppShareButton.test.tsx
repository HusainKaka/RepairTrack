import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WhatsAppShareButton } from "./WhatsAppShareButton";

const input = { customerName: "Example customer", phone: "+254712345678", reference: "REP-2026-000001", trackingUrl: `${window.location.origin}/track/${"a".repeat(43)}` };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("WhatsApp sharing control", () => {
  it("opens a safe external draft link without any send API", () => {
    render(<WhatsAppShareButton {...input} />);
    const link = screen.getByRole("link", { name: "Send to WhatsApp" });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/254712345678?text="));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByText(/press Send in WhatsApp/)).toBeInTheDocument();
  });
  it("disables invalid recipients rather than opening an unaddressed chat", () => {
    render(<WhatsAppShareButton {...input} phone="bad number" />);
    expect(screen.getByRole("button", { name: "Send to WhatsApp" })).toBeDisabled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("prepares the invoice on one click and secures the reserved tab before navigating", async () => {
    const location = { replace: vi.fn() };
    const doc = document.implementation.createHTMLDocument();
    const popup = { opener: window, document: doc, location, closed: false, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const invoiceUrl = `${window.location.origin}/api/v1/invoices/shared/header.payload.signature`;
    const prepareShare = vi.fn().mockResolvedValue({ invoiceUrl });
    render(<WhatsAppShareButton {...input} reference="INV-2026-000001" trackingUrl={undefined} prepareShare={prepareShare} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to WhatsApp" }));
    await waitFor(() => expect(location.replace).toHaveBeenCalledOnce());
    expect(prepareShare).toHaveBeenCalledOnce();
    expect(popup.opener).toBeNull();
    expect(doc.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe("no-referrer");
    expect(new URL(location.replace.mock.calls[0][0] as string).searchParams.get("text")).toContain(invoiceUrl);
    expect(screen.queryByText(/message sent/i)).not.toBeInTheDocument();
  });
  it("does not mint a link if pop-ups are blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const prepareShare = vi.fn();
    render(<WhatsAppShareButton {...input} trackingUrl={undefined} prepareShare={prepareShare} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to WhatsApp" }));
    expect(prepareShare).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Allow pop-ups");
  });
  it.each(["request failure", "unsafe link"])("closes the draft tab on %s and reports no delivery", async mode => {
    const close = vi.fn();
    const location = { replace: vi.fn() };
    const popup = { opener: window, document: document.implementation.createHTMLDocument(), location, closed: false, close };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const prepareShare = mode === "request failure" ? vi.fn().mockRejectedValue(new Error("PRIVATE TOKEN NEVER DISPLAY")) : vi.fn().mockResolvedValue({ invoiceUrl: "https://evil.example/invoice" });
    render(<WhatsAppShareButton {...input} trackingUrl={undefined} prepareShare={prepareShare} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to WhatsApp" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(location.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("No message was sent");
    expect(screen.queryByText(/PRIVATE TOKEN/)).not.toBeInTheDocument();
  });
});
