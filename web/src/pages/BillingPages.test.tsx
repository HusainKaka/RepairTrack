import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), role: "BUSINESS_ADMIN" }));
vi.mock("../api/client", () => ({ api: { get: mocks.get, post: mocks.post, patch: mocks.patch }, apiMessage: () => "Request unavailable" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
import { InvoiceDetailPage, InvoicesPage } from "./BillingPages";
import { invoiceAmountPreview } from "../components/InvoiceManagementPanel";

const customer = { id: "customer-id", fullName: "Example customer", phone: "+254700000000" };
const digitalTicket = { id: "digital-id", reference: "WEB-2026-000001", kind: "WEBSITE", title: "Website delivery", customer };
const invoice = {
  id: "invoice-id", number: "INV-2026-000001", status: "ISSUED", paymentStatus: "UNPAID", createdAt: "2026-10-14T09:00:00.000Z", subtotal: "1000", taxAmount: "0", discountAmount: "0", total: "1000", amountPaid: "0", balance: "1000", kraStatus: "PENDING", customer,
  digitalTicketId: "digital-id", digitalTicket,
  business: { name: "Example business", phone: "+254700000000", email: "business@example.test", currency: "KES", address: "Nairobi", taxPin: "PRIVATE-KRA-PIN", taxSettings: { etimsEnabled: false }, logoImageUrl: "data:image/png;base64,iVBORw0KGgo=" },
  items: [{ id: "item-id", description: "Website delivery", itemType: "SERVICE", quantity: "1", unitPrice: "1000", taxRate: "0", discount: "0", lineTotal: "1000" }], payments: [], receipts: [],
};

function mount(element: React.ReactNode, path: string, route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /><Route path="/invoices/invoice-id" element={<div>New invoice detail</div>} /></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role = "BUSINESS_ADMIN";
  mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { data: path === "/invoices" ? [] : path === "/customers" ? [customer] : path === "/digital-services" ? [digitalTicket] : path === "/repairs" ? [] : invoice } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("digital manual billing and KRA feature gate", () => {
  it("updates an issued discount only with a reason and retains a failed edit", async () => {
    mocks.patch.mockRejectedValue(new Error("Network unavailable"));
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Edit invoice" }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Invoice-level discount"), { target: { value: "100" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Reason for change/ }), { target: { value: "Agreed customer discount" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/invoices/view-id", expect.objectContaining({ invoiceDiscount: 100, changeReason: "Agreed customer discount" })));
    await screen.findByText("Request unavailable");
    expect(screen.getByLabelText("Invoice-level discount")).toHaveValue(100);
  });
  it("prevents discount changes from reducing a paid invoice below payments", async () => {
    mocks.get.mockResolvedValue({ data: { data: { ...invoice, status: "PAID", paymentStatus: "PAID", amountPaid: "1000", balance: "0" } } });
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Edit invoice" }));
    fireEvent.change(screen.getByLabelText("Invoice-level discount"), { target: { value: "1" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Reason for change/ }), { target: { value: "Correction" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Void invoice" })).not.toBeInTheDocument();
  });
  it("does not show issued-edit controls to customers", async () => {
    mocks.role = "CUSTOMER";
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    await screen.findByText("Example business");
    expect(screen.queryByRole("button", { name: "Edit invoice" })).not.toBeInTheDocument();
  });
  it("previews discounted tax accurately and blocks excessive discounts or quantities", async () => {
    mount(<InvoicesPage />, "/invoices?digitalTicketId=digital-id", "/invoices");
    await screen.findByText(/Manual digital invoice:/);
    fireEvent.change(screen.getByRole("textbox", { name: /^Description/ }), { target: { value: "Website milestone" } });
    fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Tax %"), { target: { value: "16" } });
    fireEvent.change(screen.getByLabelText("Discount"), { target: { value: "100" } });
    expect(screen.getByText("Estimated total: KES 1,044")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create draft" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Discount"), { target: { value: "1001" } });
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
    expect(screen.getByText("A line discount cannot exceed its subtotal before tax.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Discount"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Invoice discount"), { target: { value: "1045" } });
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Invoice discount"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "10001" } });
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("creates explicit service-only lines with no repair or inventory association", async () => {
    mocks.post.mockResolvedValue({ data: { data: { id: "invoice-id" } } });
    mount(<InvoicesPage />, "/invoices?digitalTicketId=digital-id", "/invoices");
    await screen.findByText(/Manual digital invoice:/);
    fireEvent.change(screen.getByRole("textbox", { name: /^Description/ }), { target: { value: "Agreed website milestone" } });
    fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
    await screen.findByText("New invoice detail");
    const [path, body] = mocks.post.mock.calls[0];
    expect(path).toBe("/invoices");
    expect(body).toMatchObject({ customerId: "customer-id", digitalTicketId: "digital-id", items: [{ description: "Agreed website milestone", quantity: 1, unitPrice: 15000, taxRate: 0, discount: 0, itemType: "SERVICE" }] });
    expect(body.repairId).toBeUndefined();
    expect(body.items[0]).not.toHaveProperty("inventoryItemId");
  });

  it("defaults KRA content off and renders the uploaded logo without a remote URL", async () => {
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    await screen.findByText("Example business");
    expect(screen.queryByText(/KRA PIN/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit to eTIMS" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Example business logo" })).toHaveAttribute("src", invoice.business.logoImageUrl);
    expect(screen.getByText(/Example customer · WEB-2026-000001/)).toBeInTheDocument();
  });

  it("only reveals KRA information after the business flag is deliberately enabled", async () => {
    mocks.get.mockResolvedValue({ data: { data: { ...invoice, kraEnabled: true, business: { ...invoice.business, taxSettings: { etimsEnabled: true } } } } });
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    await screen.findByText("KRA PIN: PRIVATE-KRA-PIN");
    expect(screen.getByRole("button", { name: "Submit to eTIMS" })).toBeInTheDocument();
  });

  it("does not offer stock or labour items when editing a manual digital invoice", async () => {
    mocks.get.mockResolvedValue({ data: { data: { ...invoice, status: "DRAFT" } } });
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Add line" }));
    fireEvent.mouseDown(screen.getByLabelText("Item type"));
    expect(screen.getByRole("option", { name: "SERVICE" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CUSTOM" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "INVENTORY" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "LABOUR" })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.get.mock.calls.some(([path]) => path === "/inventory")).toBe(false));
  });

  it("uses the same discounted-tax preview and validation when editing invoice lines", async () => {
    mocks.get.mockResolvedValue({ data: { data: { ...invoice, status: "DRAFT" } } });
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Tax %"), { target: { value: "16" } });
    fireEvent.change(screen.getByLabelText("Line discount"), { target: { value: "100" } });
    expect(screen.getByText("Estimated invoice total: KES 1,044")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save line" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Line discount"), { target: { value: "1001" } });
    expect(screen.getByRole("button", { name: "Save line" })).toBeDisabled();
    expect(screen.getByText("A line discount cannot exceed its subtotal before tax.")).toBeInTheDocument();
  });
});

describe("invoice monetary precision and storage boundaries", () => {
  const line = { quantity: 1, unitPrice: 1000, taxRate: 16, discount: 100 };
  it("taxes the discounted subtotal and applies invoice discounts afterwards", () => {
    expect(invoiceAmountPreview([line])).toEqual({ valid: true, total: 1044 });
    expect(invoiceAmountPreview([line], 44)).toEqual({ valid: true, total: 1000 });
  });
  it("accepts exact supported amount and quantity boundaries", () => {
    expect(invoiceAmountPreview([{ quantity: 1, unitPrice: 9_999_999_999.99, taxRate: 0, discount: 0 }])).toEqual({ valid: true, total: 9_999_999_999.99 });
    expect(invoiceAmountPreview([{ quantity: 10_000, unitPrice: 1, taxRate: 0, discount: 0 }])).toEqual({ valid: true, total: 10_000 });
    expect(invoiceAmountPreview([{ quantity: 1.1, unitPrice: 1.23, taxRate: 16.25, discount: 0 }]).valid).toBe(true);
  });
  it.each([
    { quantity: 10_000.01 }, { quantity: Number.NaN }, { quantity: Number.POSITIVE_INFINITY }, { quantity: 0.001 },
    { unitPrice: Number.POSITIVE_INFINITY }, { unitPrice: Number.NaN }, { unitPrice: 10_000_000_000 }, { unitPrice: 3.333 },
    { taxRate: 100.01 }, { taxRate: 16.001 }, { discount: Number.POSITIVE_INFINITY }, { discount: 1000.01 }, { discount: 0.001 },
  ])("rejects invalid or over-precise line values %j", (change) => {
    expect(invoiceAmountPreview([{ ...line, ...change }]).valid).toBe(false);
  });
  it.each([Number.POSITIVE_INFINITY, Number.NaN, -1, 10_000_000_000, 1044.01, 0.001])("rejects unsupported invoice discounts %s", (discount) => {
    expect(invoiceAmountPreview([line], discount).valid).toBe(false);
  });
  it("rejects aggregate overflow and more than 100 lines", () => {
    expect(invoiceAmountPreview([{ quantity: 10_000, unitPrice: 9_999_999_999.99, taxRate: 0, discount: 0 }]).valid).toBe(false);
    expect(invoiceAmountPreview([{ quantity: 1, unitPrice: 5_000_000_000, taxRate: 0, discount: 0 }, { quantity: 1, unitPrice: 5_000_000_000, taxRate: 0, discount: 0 }]).valid).toBe(false);
    expect(invoiceAmountPreview(Array.from({ length: 101 }, () => line)).valid).toBe(false);
  });
});

describe("one-click private invoice sharing", () => {
  const sharedPdfUrl = () => `${window.location.origin}/api/v1/invoices/shared/fixtureHeader.fixtureClaims.fixtureSignature`;
  const trackingUrl = () => `${window.location.origin}/track/digital/${"x".repeat(43)}`;
  function popupWindow() {
    const popup = { document: document.implementation.createHTMLDocument(), opener: window, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    return popup;
  }

  it("creates a private link only after the admin clicks and opens the customer's WhatsApp draft", async () => {
    const popup = popupWindow();
    mocks.get.mockResolvedValue({ data: { data: { ...invoice, customer: { ...customer, whatsappPhone: "+254711111111" } } } });
    mocks.post.mockResolvedValue({ data: { data: { invoiceUrl: sharedPdfUrl(), trackingUrl: trackingUrl(), expiresAt: "2026-10-21T09:00:00.000Z" } } });
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    const button = await screen.findByRole("button", { name: "Send to WhatsApp" });
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(popup.location.replace).toHaveBeenCalled());
    expect(mocks.post).toHaveBeenCalledWith("/invoices/view-id/share-link");
    const destination = new URL(popup.location.replace.mock.calls[0][0] as string);
    expect(destination.origin).toBe("https://wa.me");
    expect(destination.pathname).toBe("/254711111111");
    const message = destination.searchParams.get("text");
    expect(message).toContain("Invoice: INV-2026-000001");
    expect(message).toContain("Total: KES 1000.00");
    expect(message).toContain(sharedPdfUrl());
    expect(message).toContain(trackingUrl());
    expect(message).toContain("expires in 7 days");
    expect(popup.opener).toBeNull();
    expect(screen.queryByText(/successfully sent|WhatsApp sent/i)).not.toBeInTheDocument();
  });

  it.each(["DRAFT", "VOID", "CANCELLED"])("does not offer public invoice sharing for %s", async (status) => {
    mocks.get.mockResolvedValue({ data: { data: { ...invoice, status } } });
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    await screen.findByText("Example business");
    expect(screen.queryByRole("button", { name: "Send to WhatsApp" })).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("keeps public sharing controls administrator-only", async () => {
    mocks.role = "CUSTOMER";
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    await screen.findByText("Example business");
    expect(screen.queryByRole("button", { name: "Send to WhatsApp" })).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("disables sharing when the recorded recipient is invalid", async () => {
    mocks.get.mockResolvedValue({ data: { data: { ...invoice, customer: { ...customer, phone: "not a number" } } } });
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    expect(await screen.findByRole("button", { name: "Send to WhatsApp" })).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("shows safe failure feedback and closes the reserved tab without claiming delivery", async () => {
    const popup = popupWindow();
    mocks.post.mockRejectedValue(new Error("private provider details"));
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Send to WhatsApp" }));
    await screen.findByText(/The sharing link could not be prepared. No message was sent./);
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("private provider details")).not.toBeInTheDocument();
  });
  it("shows item and invoice discounts separately on the signed-in customer's invoice", async () => {
    mocks.role = "CUSTOMER";
    mocks.get.mockResolvedValue({ data: { data: { ...invoice, subtotal: "1000", discountAmount: "150", invoiceLevelDiscount: "100", total: "850", balance: "850", items: [{ ...invoice.items[0], discount: "50", lineTotal: "950" }] } } });
    mount(<InvoiceDetailPage />, "/invoices/view-id", "/invoices/:id");
    await screen.findByText("Invoice discount");
    expect(screen.getByText("Invoice discount").nextElementSibling).toHaveTextContent("KES 100.00");
    expect(screen.getByText("Item discounts").nextElementSibling).toHaveTextContent("KES 50.00");
    expect(screen.queryByRole("button", { name: "Edit invoice" })).not.toBeInTheDocument();
  });
});
