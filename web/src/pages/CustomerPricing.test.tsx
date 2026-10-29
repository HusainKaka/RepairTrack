import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/client", () => ({ api: mocks, apiMessage: () => "Unavailable" }));
import { PublicTrackPage } from "./AccountPages";
import { PublicDigitalTrackPage } from "./DigitalServicePages";
const invoice = { number: "INV-TEST-1", status: "ISSUED", paymentStatus: "PARTIALLY_PAID", subtotal: "2000", taxAmount: "0", discountAmount: "300", invoiceLevelDiscount: "200", total: "1700", amountPaid: "500", balance: "1200", items: [{ description: "Customer-visible service", quantity: "1", unitPrice: "2000", discount: "100", taxRate: "0", lineTotal: "1900" }] };
const record = { reference: "TEST-1", status: "IN_PROGRESS", kind: "WEBSITE", title: "Website work", dateReceived: "2026-10-29", business: { name: "Example workshop", phone: "0000000000", currency: "KES" }, device: { type: "Laptop", brand: "Example", model: "Model" }, customerFirstName: "Example", invoices: [invoice], statusHistory: [], approval: null, notes: [] };
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("customer tracking pricing", () => {
  it.each([false, true])("displays full pricing on the repair/digital tracker (digital=%s)", async digital => {
    mocks.get.mockResolvedValue({ data: { data: record } });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/track/token"]}><Routes><Route path="/track/:token" element={digital ? <PublicDigitalTrackPage /> : <PublicTrackPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("Pricing breakdown")).toBeInTheDocument();
    expect(screen.getByText("Customer-visible service")).toBeInTheDocument();
    expect(screen.getByText("Invoice discount").nextElementSibling).toHaveTextContent("KES 200.00");
    expect(screen.getByText("Balance due").nextElementSibling).toHaveTextContent("KES 1,200.00");
  });
  it("shows the complete approval breakdown before the response controls without duplicating it", async () => {
    mocks.get.mockResolvedValue({ data: { data: { ...record, status: "AWAITING_CUSTOMER_APPROVAL", approval: { version: 2, estimateAmount: 1700, items: invoice.items } } } });
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/track/token"]}><Routes><Route path="/track/:token" element={<PublicTrackPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("Estimate approval required")).toBeInTheDocument();
    expect(screen.getAllByText("Customer-visible service")).toHaveLength(1);
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("KES 1,700.00");
    expect(screen.getByRole("button", { name: "Accept estimate" })).toBeEnabled();
  });
});
