import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../types";

const mocks = vi.hoisted((): { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; role: Role } => ({ get: vi.fn(), post: vi.fn(), role: "BUSINESS_ADMIN" }));
vi.mock("../api/client", () => ({ api: { get: mocks.get, post: mocks.post }, apiMessage: () => "Request unavailable" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "assigned-user", role: mocks.role } }) }));
import { DigitalServiceDetailPage, DigitalServicesPage, PublicDigitalTrackPage } from "./DigitalServicePages";

const ticket = {
  id: "ticket-id", reference: "WEB-2026-000001", kind: "WEBSITE", title: "Customer website", requirements: "Responsive website with accessible contact form", status: "DISCOVERY", priority: "NORMAL", createdAt: "2026-10-14T09:00:00.000Z",
  customer: { id: "customer-id", fullName: "Example customer", phone: "+254700000000" }, assignedTechnician: { id: "assigned-user", fullName: "Assigned engineer" },
  internalNotes: "PRIVATE TEAM REQUIREMENTS", customerVisibleNotes: "Scope review underway",
  statusHistory: [{ id: "history-id", toStatus: "DISCOVERY", createdAt: "2026-10-14T10:00:00.000Z", customerMessage: "We are reviewing your scope." }],
  notes: [{ id: "private-note", body: "PRIVATE INTERNAL NOTE", visibility: "INTERNAL", createdAt: "2026-10-14T10:00:00.000Z" }, { id: "public-note", body: "Your review is scheduled.", visibility: "CUSTOMER", createdAt: "2026-10-14T10:00:00.000Z" }], invoices: [],
};
const trackingUrl = `${window.location.origin}/track/digital/${"D".repeat(43)}`;

function mount(element: React.ReactNode, path: string, route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks(); mocks.role = "BUSINESS_ADMIN";
  mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { success: true, data: path === "/digital-services" ? [ticket] : path === "/customers" ? [ticket.customer] : path === "/businesses/technicians" ? [{ id: "assigned-user", fullName: "Assigned engineer", status: "ACTIVE" }] : path.endsWith("/tracking") ? { trackingUrl } : ticket } }));
});
afterEach(() => cleanup());

describe("digital service workflow", () => {
  it("shows all service categories and admin-only intake action", async () => {
    mount(<DigitalServicesPage />, "/digital-services", "/digital-services");
    await screen.findByText("Customer website");
    expect(screen.getByRole("button", { name: "New digital intake" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByLabelText("Service"));
    expect(screen.getByRole("option", { name: "Website" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Software" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "AI agent" })).toBeInTheDocument();
  });

  it("does not fetch staff directories or expose intake controls to customers", async () => {
    mocks.role = "CUSTOMER";
    mount(<DigitalServicesPage />, "/digital-services", "/digital-services");
    await screen.findByText("Customer website");
    expect(screen.queryByRole("button", { name: "New digital intake" })).not.toBeInTheDocument();
    expect(mocks.get.mock.calls.every(([path]) => path === "/digital-services")).toBe(true);
  });

  it("hides internal notes, assignments, stage editing and private tracking from customers", async () => {
    mocks.role = "CUSTOMER";
    mount(<DigitalServiceDetailPage />, "/digital-services/ticket-id", "/digital-services/:id");
    await screen.findByText("Your review is scheduled.");
    expect(screen.queryByText("PRIVATE TEAM REQUIREMENTS")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE INTERNAL NOTE")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update stage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show customer tracking link" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create manual invoice" })).not.toBeInTheDocument();
    expect(screen.queryByText("Send to WhatsApp")).not.toBeInTheDocument();
    expect(mocks.get.mock.calls.some(([path]) => typeof path === "string" && path.endsWith("/tracking"))).toBe(false);
  });

  it("limits technician stage changes to assigned tickets and omits invoice creation", async () => {
    mocks.role = "TECHNICIAN";
    mount(<DigitalServiceDetailPage />, "/digital-services/ticket-id", "/digital-services/:id");
    await screen.findByRole("button", { name: "Update stage" });
    expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create manual invoice" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update stage" }));
    fireEvent.mouseDown(screen.getByLabelText("Next stage"));
    expect(screen.getByRole("option", { name: "AWAITING APPROVAL" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "IN PROGRESS" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "DELIVERED" })).not.toBeInTheDocument();
  });

  it("creates service-specific intake without a device and reads the top-level tracking URL", async () => {
    mocks.post.mockResolvedValue({ data: { success: true, data: ticket, trackingUrl: "https://repair-track-web.vercel.app/track/digital/private-fixture" } });
    mount(<DigitalServicesPage />, "/digital-services", "/digital-services");
    fireEvent.click(await screen.findByRole("button", { name: "New digital intake" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Customer/ }));
    fireEvent.click(screen.getByRole("option", { name: "Example customer · +254700000000" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Project title/ }), { target: { value: "New website" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Requirements/ }), { target: { value: "Accessible website with CMS" } });
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));
    await screen.findByText("https://repair-track-web.vercel.app/track/digital/private-fixture");
    const [path, body] = mocks.post.mock.calls[0];
    expect(path).toBe("/digital-services");
    expect(body).toMatchObject({ kind: "WEBSITE", customerId: "customer-id", title: "New website", requirements: "Accessible website with CMS" });
    expect(body).not.toHaveProperty("deviceId");
    expect(body).not.toHaveProperty("items");
  });

  it("records explicit WhatsApp consent for a new customer without preselecting it", async () => {
    mocks.post.mockResolvedValue({ data: { success: true, data: ticket, trackingUrl: "https://repair-track-web.vercel.app/track/digital/private-fixture" } });
    mount(<DigitalServicesPage />, "/digital-services", "/digital-services");
    fireEvent.click(await screen.findByRole("button", { name: "New digital intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Register new" }));
    const consent = screen.getByRole("checkbox", { name: "Customer agrees to receive ticket and status messages on WhatsApp" });
    expect(consent).not.toBeChecked();
    fireEvent.change(screen.getByRole("textbox", { name: /^Customer or business name/ }), { target: { value: "New customer" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Phone/ }), { target: { value: "+254700000000" } });
    fireEvent.click(consent);
    fireEvent.change(screen.getByRole("textbox", { name: /^Project title/ }), { target: { value: "New software" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Requirements/ }), { target: { value: "Create a scheduling system" } });
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));
    await screen.findByText("https://repair-track-web.vercel.app/track/digital/private-fixture");
    expect(mocks.post.mock.calls[0][1].newCustomer).toMatchObject({ fullName: "New customer", preferredCommunication: "EMAIL", whatsappOptIn: true });
    expect(mocks.post.mock.calls[0][1].newCustomer).not.toHaveProperty("whatsappOptInAt");
  });

  it("clears WhatsApp consent when either intake recipient number changes", async () => {
    mount(<DigitalServicesPage />, "/digital-services", "/digital-services");
    fireEvent.click(await screen.findByRole("button", { name: "New digital intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Register new" }));
    const consent = screen.getByRole("checkbox", { name: "Customer agrees to receive ticket and status messages on WhatsApp" });
    fireEvent.click(consent); expect(consent).toBeChecked();
    fireEvent.change(screen.getByRole("textbox", { name: /^Phone/ }), { target: { value: "+254700000001" } });
    expect(consent).not.toBeChecked();
    fireEvent.click(consent); expect(consent).toBeChecked();
    fireEvent.change(screen.getByRole("textbox", { name: "WhatsApp phone" }), { target: { value: "+254700000002" } });
    expect(consent).not.toBeChecked();
  });
});

describe("manual digital WhatsApp sharing", () => {
  it.each([["WEBSITE", "Website"], ["SOFTWARE", "Software"], ["AI_AGENT", "AI agent"]])("retains the intake contact and %s service after form reset", async (kind, label) => {
    const customer = { ...ticket.customer, whatsappPhone: "+254711222333" };
    mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { data: path === "/digital-services" ? [ticket] : path === "/customers" ? [customer] : [] } }));
    mocks.post.mockResolvedValue({ data: { success: true, data: { ...ticket, kind }, trackingUrl } });
    mount(<DigitalServicesPage />, "/digital-services", "/digital-services");
    fireEvent.click(await screen.findByRole("button", { name: "New digital intake" }));
    fireEvent.mouseDown(screen.getByLabelText("Service type"));
    fireEvent.click(screen.getByRole("option", { name: label }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /^Customer/ }));
    fireEvent.click(screen.getByRole("option", { name: "Example customer · +254700000000" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Project title/ }), { target: { value: "New project" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Requirements/ }), { target: { value: "Agreed digital deliverables" } });
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));
    const share = await screen.findByRole("link", { name: "Send to WhatsApp" });
    const url = new URL(share.getAttribute("href")!);
    expect(url.pathname).toBe("/254711222333");
    expect(url.searchParams.get("text")).toContain("Example customer");
    expect(url.searchParams.get("text")).toContain(label);
    expect(url.searchParams.get("text")).toContain(ticket.reference);
    expect(url.searchParams.get("text")).toContain(trackingUrl);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0][0]).toBe("/digital-services");
  });

  it("preserves newly entered contact for a digital intake draft", async () => {
    mocks.post.mockResolvedValue({ data: { data: ticket, trackingUrl } });
    mount(<DigitalServicesPage />, "/digital-services", "/digital-services");
    fireEvent.click(await screen.findByRole("button", { name: "New digital intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Register new" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Customer or business name/ }), { target: { value: "New digital customer" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Phone/ }), { target: { value: "+254722000111" } });
    fireEvent.change(screen.getByRole("textbox", { name: "WhatsApp phone" }), { target: { value: "+254733000111" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Project title/ }), { target: { value: "New project" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Requirements/ }), { target: { value: "Agreed digital deliverables" } });
    fireEvent.click(screen.getByRole("button", { name: "Create ticket" }));
    const share = await screen.findByRole("link", { name: "Send to WhatsApp" });
    const url = new URL(share.getAttribute("href")!);
    expect(url.pathname).toBe("/254733000111"); expect(url.searchParams.get("text")).toContain("New digital customer");
  });

  it.each(["BUSINESS_ADMIN", "TECHNICIAN"] as const)("prefetches the authorized URL for %s and does not send a notification", async (role) => {
    mocks.role = role;
    mount(<DigitalServiceDetailPage />, "/digital-services/ticket-id", "/digital-services/:id");
    const share = await screen.findByRole("link", { name: "Send to WhatsApp" });
    expect(new URL(share.getAttribute("href")!).searchParams.get("text")).toContain(trackingUrl);
    expect(mocks.get).toHaveBeenCalledWith("/digital-services/ticket-id/tracking");
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("blocks a draft with invalid customer contact", async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { data: path === "/businesses/technicians" ? [] : path.endsWith("/tracking") ? { trackingUrl } : { ...ticket, customer: { ...ticket.customer, phone: "bad", whatsappPhone: "123" } } } }));
    mount(<DigitalServiceDetailPage />, "/digital-services/ticket-id", "/digital-services/:id");
    await screen.findByText("Project requirements");
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/digital-services/ticket-id/tracking"));
    expect(screen.queryByRole("link", { name: "Send to WhatsApp" })).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});

describe("public digital tracking", () => {
  it.each([["WEBSITE", "Website ticket"], ["SOFTWARE", "Software ticket"], ["AI_AGENT", "AI agent ticket"]])("renders %s customer tracking without private fields", async (kind, label) => {
    mocks.get.mockResolvedValue({ data: { data: { ...ticket, kind, dateReceived: ticket.createdAt, business: { name: "Example business", phone: "+254700000000", currency: "KES" }, requirements: "DO NOT SHOW PRIVATE REQUIREMENTS", trackingToken: "DO NOT SHOW TOKEN", internalNotes: "DO NOT SHOW TEAM NOTES" } } });
    mount(<PublicDigitalTrackPage />, "/track/digital/token-fixture", "/track/digital/:token");
    await screen.findByText(label);
    expect(screen.getByText("Customer website")).toBeInTheDocument();
    expect(screen.getByText("We are reviewing your scope.")).toBeInTheDocument();
    expect(screen.queryByText("Example customer")).not.toBeInTheDocument();
    expect(screen.queryByText("DO NOT SHOW PRIVATE REQUIREMENTS")).not.toBeInTheDocument();
    expect(screen.queryByText("DO NOT SHOW TOKEN")).not.toBeInTheDocument();
    expect(screen.queryByText("DO NOT SHOW TEAM NOTES")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE INTERNAL NOTE")).not.toBeInTheDocument();
    expect(screen.getByText("Your review is scheduled.")).toBeInTheDocument();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/digital-services/track/token-fixture"));
  });

  it("shows safe invalid-link feedback without disclosing the server error", async () => {
    mocks.get.mockRejectedValue(new Error("Sensitive internal database error"));
    mount(<PublicDigitalTrackPage />, "/track/digital/missing-fixture", "/track/digital/:token");
    await screen.findByText(/That tracking link is invalid or expired/);
    expect(screen.queryByText("Sensitive internal database error")).not.toBeInTheDocument();
  });
});
