import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

function RouteContext() {
  const location = useLocation();
  return <output aria-label="Current route">{location.pathname}{location.search}</output>;
}

function mountWorkflow(path = "/repairs") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/repairs" element={<><RepairsPage /><RouteContext /></>} /><Route path="/repairs/:id" element={<><RepairDetailPage /><RouteContext /></>} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe("workshop ledger context and role boundaries", () => {
  it("restores URL-backed search, status and local order after detail navigation", async () => {
    mountWorkflow("/repairs?q=power&status=RECEIVED&sort=oldest");
    expect(await screen.findByRole("textbox", { name: "Search loaded jobs" })).toHaveValue("power");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Received");
    expect(screen.getByRole("combobox", { name: "Order loaded jobs" })).toHaveTextContent("Oldest received");
    fireEvent.click(screen.getByRole("link", { name: repair.reference }));
    const back = await screen.findByRole("link", { name: "Back to repairs" });
    expect(back).toHaveAttribute("href", "/repairs?q=power&status=RECEIVED&sort=oldest");
    fireEvent.click(back);
    expect(await screen.findByRole("textbox", { name: "Search loaded jobs" })).toHaveValue("power");
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/repairs?q=power&status=RECEIVED&sort=oldest");
    expect(mocks.get).toHaveBeenCalledWith("/repairs", { params: { status: "RECEIVED" } });
  });

  it("distinguishes no matches and clears only the working filter context", async () => {
    mountWorkflow("/repairs?q=does-not-match");
    await screen.findByText("No jobs match this view");
    expect(screen.getByText(/Up to 100 jobs are loaded per status/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(await screen.findByRole("link", { name: repair.reference })).toBeInTheDocument();
    expect(screen.getByLabelText("Current route")).toHaveTextContent("/repairs");
  });

  it("does not render forbidden invoice navigation for an assigned technician", async () => {
    mocks.role = "TECHNICIAN";
    const detail = { ...repair, invoices: [{ id: "invoice-id", number: "INV-0042", paymentStatus: "UNPAID", balance: "2500" }] };
    mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { data: path === "/inventory" ? [] : path.endsWith("/tracking") ? { trackingUrl } : detail } }));
    mount(<RepairDetailPage />, "/repairs/repair-id", "/repairs/:id");
    expect(await screen.findByText("INV-0042")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "INV-0042" })).not.toBeInTheDocument();
    expect(screen.getByText(/managed by the administrator/)).toBeInTheDocument();
  });

  it("keeps customer views read-only and excludes internal content even in an overbroad response", async () => {
    mocks.role = "CUSTOMER";
    const detail = { ...repair, diagnosis: "Private diagnosis", internalNotes: "Private intake", notes: [{ id: "private", body: "Private workshop note", visibility: "INTERNAL", author: { fullName: "Technician" }, createdAt: repair.createdAt }, { id: "public", body: "Your device is being checked", visibility: "CUSTOMER", author: { fullName: "Repair team" }, createdAt: repair.createdAt }] };
    mocks.get.mockResolvedValue({ data: { data: detail } });
    mount(<RepairDetailPage />, "/repairs/repair-id", "/repairs/:id");
    await screen.findByText("Your device is being checked");
    for (const text of ["Private diagnosis", "Private intake", "Private workshop note"]) expect(screen.queryByText(text)).not.toBeInTheDocument();
    for (const name of ["Start diagnosis", "Add note", "Add part", "Archive", "Accept job"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.getByText("Your device has been received by the workshop.")).toBeInTheDocument();
    expect(mocks.get.mock.calls.some(([path]) => path === "/inventory" || String(path).endsWith("/tracking"))).toBe(false);
  });
});

describe("repair mutation feedback and safety", () => {
  it("opens only valid next-stage choices and locks a pending update", async () => {
    let finish!: (value: unknown) => void;
    mocks.post.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount(<RepairDetailPage />, "/repairs/repair-id", "/repairs/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Start diagnosis" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "New status" }));
    expect(screen.getByRole("option", { name: "Diagnosing" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cancelled" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Collected" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Diagnosing" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Customer message (optional)" }), { target: { value: "We are checking the power issue." } });
    fireEvent.click(screen.getByRole("button", { name: "Update and notify" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith("/repairs/repair-id/status", { status: "DIAGNOSING", customerMessage: "We are checking the power issue." });
    const saving = await screen.findByRole("button", { name: "Saving…" });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ data: { data: repair } }); await Promise.resolve(); });
    expect(await screen.findByText("Repair stage updated. The customer notification has been requested.")).toBeInTheDocument();
  });

  it("keeps note text and visibility after failure and allows recovery", async () => {
    mocks.post.mockRejectedValue(new Error("network"));
    mount(<RepairDetailPage />, "/repairs/repair-id", "/repairs/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Checked the charging port.\nFurther testing required." } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await screen.findByText("Request unavailable");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Checked the charging port.\nFurther testing required.");
    expect(screen.getByRole("combobox", { name: "Visibility" })).toHaveTextContent("Internal workshop note");
    expect(screen.getByRole("button", { name: "Save note" })).toBeEnabled();
    expect(mocks.post).toHaveBeenCalledWith("/repairs/repair-id/notes", { body: "Checked the charging port.\nFurther testing required.", visibility: "INTERNAL", imageUrls: [] });
  });

  it("confirms clipboard completion without claiming a customer message was sent", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    mount(<RepairDetailPage />, "/repairs/repair-id", "/repairs/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Copy tracking link" }));
    expect(await screen.findByText("Private tracking link copied.")).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(trackingUrl);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("explains inventory side effects and blocks invalid consumption quantities", async () => {
    const item = { id: "item-id", name: "Replacement port", quantity: 2 };
    mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { data: path === "/inventory" ? [item] : path.endsWith("/tracking") ? { trackingUrl } : repair } }));
    mount(<RepairDetailPage />, "/repairs/repair-id", "/repairs/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Add part" }));
    expect(screen.getByText(/deducts stock and adds its charge/)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(within(dialog).getByRole("combobox", { name: "Inventory item" }));
    fireEvent.click(screen.getByRole("option", { name: "Replacement port · 2 available" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantity" }), { target: { value: "1.5" } });
    expect(screen.getByRole("button", { name: "Consume stock" })).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
