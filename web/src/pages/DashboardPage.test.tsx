import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../types";

const mocks = vi.hoisted((): { role: Role; get: ReturnType<typeof vi.fn> } => ({ role: "BUSINESS_ADMIN", get: vi.fn() }));
vi.mock("../api/client", () => ({ api: { get: mocks.get }, apiMessage: () => "Demo request failed" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "demo-user", fullName: "Alex Demo", role: mocks.role } }) }));
import { DashboardPage } from "./DashboardPage";

const dashboard = { repairsToday: 2, statuses: { RECEIVED: 2, IN_PROGRESS: 3, WAITING_FOR_PARTS: 1, READY_FOR_COLLECTION: 1 }, customers: 12, technicians: 3, revenueToday: 800, revenueMonth: 12400, outstanding: { count: 2, amount: 4900 }, lowStock: [{ id: "demo-part", name: "USB-C connector", sku: "DEMO-C01", quantity: 1, minimumStock: 3 }] };
const repair = { id: "demo-repair", reference: "REP-DEMO-0042", status: "IN_PROGRESS", device: { brand: "Example", model: "Laptop" } };
const invoice = { id: "demo-invoice", balance: "1500.50" };
const response = (data: unknown) => Promise.resolve({ data: { data } });
function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { vi.resetAllMocks(); mocks.role = "BUSINESS_ADMIN"; mocks.get.mockImplementation((path: string) => response(path === "/reports/dashboard" ? dashboard : path === "/repairs" ? [repair] : path === "/invoices" ? [invoice] : { businesses: { ACTIVE: 3, SUSPENDED: 1 }, subscriptions: { ACTIVE: 2, TRIAL: 2 }, users: 20, activeSessions: 4, repairs: 65, auditEvents24h: 11 })); });
afterEach(cleanup);

describe("task-focused dashboard", () => {
  it("links real repair stages and displays actual stock and receivables", async () => {
    mount(); await screen.findByRole("heading", { name: "Workshop ledger" });
    expect(screen.getByRole("link", { name: /Waiting for parts/i })).toHaveAttribute("href", "/repairs?status=WAITING_FOR_PARTS");
    expect(screen.getByRole("link", { name: /Ready for collection/i })).toHaveAttribute("href", "/repairs?status=READY_FOR_COLLECTION");
    expect(screen.getByText("USB-C connector")).toBeInTheDocument();
    expect(screen.getByText("DEMO-C01")).toBeInTheDocument();
    expect(screen.getByText("KES 4,900")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("does not render or request financial information for technicians", async () => {
    mocks.role = "TECHNICIAN";
    mocks.get.mockImplementation(() => response({ ...dashboard, revenueToday: undefined, revenueMonth: undefined, outstanding: undefined }));
    mount(); await screen.findByRole("heading", { name: "My workshop" });
    expect(screen.queryByText("Receivables")).not.toBeInTheDocument();
    expect(screen.queryByText("Revenue this month")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review invoices" })).not.toBeInTheDocument();
    expect(mocks.get.mock.calls.every(([path]) => path === "/reports/dashboard")).toBe(true);
  });

  it("waits for customer invoices instead of showing a premature zero balance", async () => {
    mocks.role = "CUSTOMER";
    let resolveInvoices!: (value: unknown) => void;
    const pending = new Promise((resolve) => { resolveInvoices = resolve; });
    mocks.get.mockImplementation((path: string) => path === "/invoices" ? pending : response([repair]));
    mount();
    await screen.findByText("Preparing your workspace…");
    expect(screen.queryByText("Outstanding balance")).not.toBeInTheDocument();
    act(() => { resolveInvoices({ data: { data: [invoice] } }); });
    expect(await screen.findByText("KES 1,500.5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View repair REP-DEMO-0042" })).toHaveAttribute("href", "/repairs/demo-repair");
  });

  it("shows invoice failure and recovery rather than an inaccurate customer balance", async () => {
    mocks.role = "CUSTOMER";
    mocks.get.mockImplementation((path: string) => path === "/invoices" ? Promise.reject(new Error("offline")) : response([repair]));
    mount(); await screen.findByText("Demo request failed");
    expect(screen.queryByText("Outstanding balance")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("gives a useful empty state for customer repair history", async () => {
    mocks.role = "CUSTOMER"; mocks.get.mockImplementation(() => response([]));
    mount(); expect(await screen.findByRole("heading", { name: "No active repairs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View digital projects" })).toHaveAttribute("href", "/digital-services");
    expect(screen.getByText(/Balances reflect up to 100 invoices/)).toBeInTheDocument();
  });

  it("does not invent operational totals in an empty business", async () => {
    mocks.get.mockImplementation(() => response({ ...dashboard, statuses: {}, lowStock: [], repairsToday: 0 }));
    mount(); expect(await screen.findByRole("heading", { name: "Your repair ledger is ready" })).toBeInTheDocument();
    expect(screen.getByText("No stock items are at or below their threshold.")).toBeInTheDocument();
  });

  it("keeps the longer stock summary inside a valid list item", async () => {
    mocks.get.mockImplementation(() => response({ ...dashboard, lowStock: Array.from({ length: 6 }, (_, index) => ({ ...dashboard.lowStock[0], id: `demo-part-${index}`, name: `Demo connector ${index}` })) }));
    mount();
    const summary = await screen.findByText("Showing 5 of 6 low-stock items. Review the rest in Inventory.");
    expect(summary.closest("li")).not.toBeNull();
    expect(screen.queryByText("Demo connector 5")).not.toBeInTheDocument();
  });

  it("uses only aggregate platform data for the super administrator", async () => {
    mocks.role = "SUPER_ADMIN"; mount();
    await screen.findByRole("heading", { name: "Platform overview" });
    expect(screen.getByText("Workspace health")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith("/reports/platform");
  });

  it("retries the failing role-scoped query without triggering disabled endpoints", async () => {
    mocks.get.mockRejectedValueOnce(new Error("offline")).mockImplementation(() => response(dashboard));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Workshop ledger" });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(mocks.get.mock.calls.every(([path]) => path === "/reports/dashboard")).toBe(true);
  });
});
