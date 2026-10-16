import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../types";

const mocks = vi.hoisted((): { role: Role; get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> } => ({ role: "BUSINESS_ADMIN", get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() }));
vi.mock("../api/client", () => ({ api: { get: mocks.get, post: mocks.post, patch: mocks.patch, put: mocks.put, delete: vi.fn() }, apiMessage: () => "Demo request failed" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "demo-admin", role: mocks.role } }) }));
import { BusinessesPage, CustomersPage, DevicesPage, InventoryPage, TechniciansPage } from "./DirectoryPages";

const customer = { id: "demo-customer", fullName: "Alex Customer", email: "alex@example.invalid", phone: "+254000000001", _count: { devices: 2, repairs: 3, invoices: 1 } };
const device = { id: "demo-device", type: "Laptop", brand: "Example", model: "Workstation", serialNumber: "DEMO-SERIAL", reportedFault: "No display", customer };
const stock = { id: "demo-stock", name: "USB-C connector", sku: "DEMO-C01", quantity: 1, minimumStock: 3, sellingPrice: "1200", category: "Connector", location: "Bin A" };
const technician = { id: "demo-technician", fullName: "Taylor Technician", email: "taylor@example.invalid", status: "ACTIVE", role: { code: "TECHNICIAN" }, _count: { assignedRepairs: 2 } };
const administrator = { ...technician, id: "demo-admin", fullName: "Alex Administrator", role: { code: "BUSINESS_ADMIN" }, canTakeRepairJobs: true };
const response = (data: unknown) => Promise.resolve({ data: { data } });
function CurrentPath() { const location = useLocation(); return <div data-testid="current-path">{location.pathname}{location.search}</div>; }
function mount(element: React.ReactNode, path: string) { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{element}<CurrentPath /></MemoryRouter></QueryClientProvider>); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.role = "BUSINESS_ADMIN";
  mocks.get.mockImplementation((path: string, options?: { params?: { page?: number; pageSize?: number } }) => response(path === "/customers" ? [customer] : path === "/devices" ? [device] : path === "/inventory" ? [stock] : path === "/businesses/technicians" ? [technician, administrator] : { items: [{ id: "demo-business-" + (options?.params?.page ?? 1), name: "Demo business page " + (options?.params?.page ?? 1), city: "Nairobi", country: "Kenya", email: "shop@example.invalid", phone: "+254000000002", status: "ACTIVE", subscriptionStatus: "TRIAL", _count: { users: 3, repairs: 5 } }], page: options?.params?.page ?? 1, pageSize: options?.params?.pageSize ?? 20, total: 45 }));
});
afterEach(cleanup);

describe("permission-accurate operational directories", () => {
  it("keeps technician customer access read-only", async () => {
    mocks.role = "TECHNICIAN"; mount(<CustomersPage />, "/customers");
    expect(await screen.findByRole("link", { name: "Alex Customer" })).toHaveAttribute("href", "/customers/demo-customer");
    expect(screen.queryByRole("button", { name: "Add customer" })).not.toBeInTheDocument();
    expect(screen.getByText(/Up to 100 matching records/)).toBeInTheDocument();
  });

  it("does not expose forbidden device actions or fetch mutation-only selectors for technicians", async () => {
    mocks.role = "TECHNICIAN"; mount(<DevicesPage />, "/devices");
    await screen.findByText("Example Workstation");
    expect(screen.queryByRole("button", { name: "Register device" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Deactivate/ })).not.toBeInTheDocument();
    expect(mocks.get.mock.calls.some(([path]) => path === "/customers")).toBe(false);
    expect(screen.getByText("DEMO-SERIAL")).toBeInTheDocument();
    expect(screen.getByText("No display")).toBeInTheDocument();
  });

  it("keeps stock quantities visible without offering forbidden technician mutations", async () => {
    mocks.role = "TECHNICIAN"; mount(<InventoryPage />, "/inventory");
    await screen.findByText("USB-C connector");
    expect(screen.getByText("1 in stock")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add inventory item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Receive.*stock/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reduce.*stock/ })).not.toBeInTheDocument();
  });

  it("submits supported customer server search only after explicit submission and preserves it in the URL", async () => {
    mount(<CustomersPage />, "/customers"); await screen.findByText("Alex Customer");
    const calls = mocks.get.mock.calls.length;
    fireEvent.change(screen.getByRole("textbox", { name: "Find a customer" }), { target: { value: "Alex" } });
    expect(mocks.get).toHaveBeenCalledTimes(calls);
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/customers", { params: { search: "Alex" } }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/customers?q=Alex");
  });

  it("loads the existing device server search contract from URL state", async () => {
    mount(<DevicesPage />, "/devices?q=DEMO-SERIAL");
    await screen.findByText("DEMO-SERIAL");
    expect(mocks.get).toHaveBeenCalledWith("/devices", { params: { search: "DEMO-SERIAL" } });
  });

  it("uses the supported stock search/filter and preserves the stock filter when clearing search", async () => {
    mount(<InventoryPage />, "/inventory?q=connector&lowStock=1"); await screen.findByText("USB-C connector");
    expect(mocks.get).toHaveBeenCalledWith("/inventory", { params: { search: "connector", lowStock: true } });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/inventory", { params: { search: undefined, lowStock: true } }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/inventory?lowStock=1");
  });

  it("retains entered customer data after a failed save", async () => {
    mocks.post.mockRejectedValue(new Error("offline"));
    mount(<CustomersPage />, "/customers"); fireEvent.click(await screen.findByRole("button", { name: "Add customer" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Full name/ }), { target: { value: "New Demo Customer" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Phone/ }), { target: { value: "+254000000099" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Demo request failed");
    expect(screen.getByRole("textbox", { name: /^Full name/ })).toHaveValue("New Demo Customer");
    expect(screen.getByRole("textbox", { name: /^Phone/ })).toHaveValue("+254000000099");
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it("does not offer technician-only administration endpoints for an administrator who accepts jobs", async () => {
    mount(<TechniciansPage />, "/technicians"); await screen.findByText("Alex Administrator");
    expect(screen.getByRole("button", { name: "Send password reset to Taylor Technician" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send password reset to Alex Administrator" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disable Alex Administrator account" })).not.toBeInTheDocument();
  });

  it("confirms technician account disablement before invoking the existing mutation", async () => {
    mocks.patch.mockResolvedValue({ data: { data: {} } });
    mount(<TechniciansPage />, "/technicians");
    fireEvent.click(await screen.findByRole("button", { name: "Disable Taylor Technician account" }));
    expect(mocks.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Disable account" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/businesses/technicians/demo-technician/status", { status: "DISABLED" }));
  });

  it("surfaces genuine business server pagination rather than paging an incomplete local list", async () => {
    mocks.role = "SUPER_ADMIN"; mount(<BusinessesPage />, "/businesses");
    await screen.findByText("Demo business page 1");
    expect(screen.getByText(/45 tenant workspaces/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    await screen.findByText("Demo business page 2");
    expect(mocks.get).toHaveBeenCalledWith("/businesses", { params: { search: undefined, page: 2, pageSize: 20 } });
    expect(screen.getByTestId("current-path")).toHaveTextContent("/businesses?page=2");
  });

  it("resets business paging when a new server search is submitted", async () => {
    mocks.role = "SUPER_ADMIN"; mount(<BusinessesPage />, "/businesses?page=2&pageSize=50");
    await screen.findByText("Demo business page 2");
    fireEvent.change(screen.getByRole("textbox", { name: "Find a business" }), { target: { value: "Demo" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/businesses", { params: { search: "Demo", page: 1, pageSize: 50 } }));
  });
});
