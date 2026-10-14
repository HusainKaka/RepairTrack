import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../types";

const mocks = vi.hoisted((): { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; role: Role } => ({ get: vi.fn(), post: vi.fn(), role: "BUSINESS_ADMIN" }));
vi.mock("../api/client", () => ({ api: { get: mocks.get, post: mocks.post }, apiMessage: () => "Request unavailable" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "staff-id", role: mocks.role } }) }));
import { RepairDetailPage, RepairsPage } from "./RepairPages";

const trackingUrl = `${window.location.origin}/track/${"R".repeat(43)}`;
const customer = { id: "customer-id", fullName: "Repair customer", phone: "+254700000000", whatsappPhone: "+254711222333" };
const device = { id: "device-id", customerId: customer.id, brand: "Example", model: "Laptop", type: "Laptop", reportedFault: "Power fault" };
const repair = { id: "repair-id", reference: "RT-2026-000042", reportedIssue: "Does not power on", priority: "NORMAL", status: "RECEIVED", createdAt: "2026-10-14T09:00:00.000Z", customer, device, assignedTechnician: { id: "staff-id", fullName: "Assigned staff" }, notes: [], parts: [], invoices: [], statusHistory: [] };

function mount(element: React.ReactNode, path: string, route: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks(); mocks.role = "BUSINESS_ADMIN";
  mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { success: true, data: path === "/repairs" ? [repair] : path === "/customers" ? [customer] : path === "/devices" ? [device] : path === "/inventory" || path === "/businesses/technicians" ? [] : path.endsWith("/tracking") ? { trackingUrl } : repair } }));
});
afterEach(() => cleanup());

describe("manual repair WhatsApp sharing", () => {
  it("keeps existing customer contact and the nested intake URL after clearing the form", async () => {
    mocks.post.mockResolvedValue({ data: { success: true, data: { ...repair, trackingUrl } } });
    mount(<RepairsPage />, "/repairs", "/repairs");
    fireEvent.click(await screen.findByRole("button", { name: "New repair intake" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Customer/ }));
    fireEvent.click(screen.getByRole("option", { name: "Repair customer · +254700000000" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Device/ }));
    fireEvent.click(screen.getByRole("option", { name: "Example Laptop · Laptop" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Reported issue/ }), { target: { value: "Power fault" } });
    fireEvent.click(screen.getByRole("button", { name: "Create repair" }));
    const share = await screen.findByRole("link", { name: "Send to WhatsApp" });
    const url = new URL(share.getAttribute("href")!);
    expect(url.hostname).toBe("wa.me"); expect(url.pathname).toBe("/254711222333");
    expect(url.searchParams.get("text")).toContain("Repair customer");
    expect(url.searchParams.get("text")).toContain(repair.reference);
    expect(url.searchParams.get("text")).toContain(trackingUrl);
    expect(url.searchParams.get("text")).toContain("Repair");
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0][0]).toBe("/repairs");
  });

  it("keeps new intake contact instead of empty reset values", async () => {
    mocks.post.mockResolvedValue({ data: { data: { ...repair, trackingUrl } } });
    mount(<RepairsPage />, "/repairs", "/repairs");
    fireEvent.click(await screen.findByRole("button", { name: "New repair intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Register new" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Customer or business name/ }), { target: { value: "New repair customer" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Phone/ }), { target: { value: "+254722000111" } });
    fireEvent.change(screen.getByRole("textbox", { name: "WhatsApp phone" }), { target: { value: "+254733000111" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Brand/ }), { target: { value: "Example" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Model/ }), { target: { value: "Laptop" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Reported issue/ }), { target: { value: "Power fault" } });
    fireEvent.click(screen.getByRole("button", { name: "Create repair" }));
    const share = await screen.findByRole("link", { name: "Send to WhatsApp" });
    const url = new URL(share.getAttribute("href")!);
    expect(url.pathname).toBe("/254733000111");
    expect(url.searchParams.get("text")).toContain("New repair customer");
    expect(url.searchParams.get("text")).toContain(trackingUrl);
  }, 15_000);

  it.each(["BUSINESS_ADMIN", "TECHNICIAN"] as const)("prefetches the authorized tracking URL for %s without sending anything", async (role) => {
    mocks.role = role;
    mount(<RepairDetailPage />, "/repairs/repair-id", "/repairs/:id");
    const share = await screen.findByRole("link", { name: "Send to WhatsApp" });
    expect(new URL(share.getAttribute("href")!).searchParams.get("text")).toContain(trackingUrl);
    expect(share).toHaveAttribute("target", "_blank");
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/repairs/repair-id/tracking"));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("never fetches private sharing URLs or shows a staff action to customers", async () => {
    mocks.role = "CUSTOMER";
    mount(<RepairDetailPage />, "/repairs/repair-id", "/repairs/:id");
    await screen.findByText("Does not power on");
    expect(screen.queryByText("Send to WhatsApp")).not.toBeInTheDocument();
    expect(mocks.get.mock.calls.some(([path]) => typeof path === "string" && path.endsWith("/tracking"))).toBe(false);
  });

  it("does not offer an outbound draft for invalid customer contact", async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { data: path === "/inventory" ? [] : path.endsWith("/tracking") ? { trackingUrl } : { ...repair, customer: { ...customer, phone: "bad", whatsappPhone: "123" } } } }));
    mount(<RepairDetailPage />, "/repairs/repair-id", "/repairs/:id");
    await screen.findByText("Does not power on");
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/repairs/repair-id/tracking"));
    expect(screen.queryByRole("link", { name: "Send to WhatsApp" })).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
