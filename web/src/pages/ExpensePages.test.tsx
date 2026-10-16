import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../types";

const mocks = vi.hoisted((): { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; role: Role } => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), role: "BUSINESS_ADMIN" }));
vi.mock("../api/client", () => ({ api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete }, apiMessage: () => "Request unavailable" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
import { ExpensesPage } from "./ExpensePages";

const expense = { id: "expense-id", category: "INTERNET", description: "Workshop internet", amount: "2500", expenseDate: "2026-10-16T12:00:00.000Z", recurring: true };
const data = { items: [expense], total: 2500, monthlyTotals: [{ month: "2026-10", total: 2500 }] };
function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={client}><MemoryRouter><ExpensesPage /></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { vi.resetAllMocks(); mocks.role = "BUSINESS_ADMIN"; mocks.get.mockResolvedValue({ data: { data } }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("operating cost workflow", () => {
  it("preserves date and utility filters and describes loaded totals/export scope honestly", async () => {
    mount(); await screen.findByText("Workshop internet");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-16" } });
    fireEvent.click(screen.getByRole("button", { name: "Show utilities only" }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/expenses", { params: { from: "2026-10-01", to: "2026-10-16", utility: true } }));
    expect(screen.getByRole("button", { name: "Showing utilities" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/CSV export includes all categories/)).toBeInTheDocument();
    expect(await screen.findByText(/up to 500 loaded entries/)).toBeInTheDocument();
  });
  it("gives an actionable download error instead of dropping a rejected promise", async () => {
    mocks.get.mockImplementation((path: string) => path.endsWith("export.csv") ? Promise.reject(new Error("provider internals")) : Promise.resolve({ data: { data } }));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Export CSV" }));
    expect(await screen.findByText("CSV could not be prepared. Request unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByText("provider internals")).not.toBeInTheDocument();
  });
  it("retains an entered expense and explains that recurring is metadata, not automatic payment", async () => {
    mocks.post.mockRejectedValue(new Error("network"));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Add expense" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Description" }), { target: { value: "Workshop electricity" } });
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Amount (KES)" }), { target: { value: "1250.50" } });
    fireEvent.click(within(dialog).getByRole("switch", { name: "Label this as a recurring expense" }));
    expect(screen.getByText(/does not create future expenses or initiate automatic payments/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));
    await screen.findByText("Request unavailable");
    expect(screen.getByRole("spinbutton", { name: "Amount (KES)" })).toHaveValue(1250.5);
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Workshop electricity");
    expect(mocks.post).toHaveBeenCalledWith("/expenses", expect.objectContaining({ amount: 1250.5, recurring: true, description: "Workshop electricity" }));
  });
  it("requires an audit reason before voiding an expense", async () => {
    mocks.delete.mockResolvedValue({ data: { data: expense } });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Void expense: Workshop internet" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Void expense" })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Reason" }), { target: { value: "Duplicate cost" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Void expense" }));
    await screen.findByText("Expense voided. The audit record has been preserved.");
    expect(mocks.delete).toHaveBeenCalledWith("/expenses/expense-id", { data: { reason: "Duplicate cost" } });
  });
  it("does not request financial data for non-administrators", async () => {
    mocks.role = "CUSTOMER"; mount();
    await screen.findByText("Costs and utilities are available to the business administrator.");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
  });
});
