import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/client", () => ({ api: { get: mocks.get, post: mocks.post }, apiMessage: () => "Request unavailable" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: "BUSINESS_ADMIN" } }) }));
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
  mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { data: path === "/invoices" ? [] : path === "/customers" ? [customer] : path === "/digital-services" ? [digitalTicket] : path === "/repairs" ? [] : invoice } }));
});
afterEach(() => cleanup());

describe("digital manual billing and KRA feature gate", () => {
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
