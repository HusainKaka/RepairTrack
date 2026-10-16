import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), post: vi.fn(), role: "BUSINESS_ADMIN" }));
vi.mock("../api/client", () => ({ api: mocks, apiMessage: (error: unknown) => error instanceof Error ? error.message : "Request unavailable" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "demo-admin", role: mocks.role } }) }));
import { NotificationsPage, SettingsPage } from "./AccountPages";

const business = { name: "Synthetic workshop", email: "workshop@example.invalid", phone: "+254000000000", address: "Example Lane", city: "Nairobi", country: "Kenya", currency: "KES", taxRate: "0", defaultLabourCharge: "1500", allowInvoicePriceOverride: true, timeZone: "Africa/Nairobi" };
const notification = { id: "demo-notification", title: "Repair update", body: "Synthetic status recorded", category: "REPAIR", channel: "IN_APP", createdAt: "2026-10-16T01:00:00Z" };
function mount(element: React.ReactNode, path = "/settings") {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.role = "BUSINESS_ADMIN";
  mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { data: path === "/businesses/profile" ? business : path === "/settings/tax" ? { etimsEnabled: false, environment: "sandbox", requireCustomerKraPin: false } : path === "/settings/integrations/status" ? { email: false, whatsapp: false, whatsappTicketTemplate: false, kraEtims: false, subscriptionGateway: false } : path === "/notifications" ? [notification] : [] } }));
});
afterEach(() => cleanup());

describe("scoped account workspaces", () => {
  it("opens profile editing deliberately and preserves a failed draft", async () => {
    mocks.patch.mockRejectedValue(new Error("Connection unavailable"));
    mount(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit business profile" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Business name" }), { target: { value: "Unsaved synthetic name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findAllByText("Connection unavailable");
    expect(await screen.findByRole("textbox", { name: "Business name" })).toHaveValue("Unsaved synthetic name");
    expect(mocks.patch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Leave this form?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(await screen.findByRole("textbox", { name: "Business name" })).toHaveValue("Unsaved synthetic name");
  });

  it("keeps tax activation gated when provider setup is unavailable", async () => {
    mount(<SettingsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "Tax controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Configure tax controls" }));
    expect(await screen.findByLabelText("KRA features off")).toBeDisabled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("limits platform settings to the existing advanced configuration scope", async () => {
    mocks.role = "SUPER_ADMIN";
    mount(<SettingsPage />);
    await screen.findByRole("tab", { name: "Advanced" });
    expect(screen.queryByRole("tab", { name: "Identity & documents" })).not.toBeInTheDocument();
    expect(mocks.get.mock.calls.some(([path]) => path === "/businesses/profile" || path === "/settings/tax" || path === "/notifications/delivery")).toBe(false);
  });

  it("shows notification mutation failures without fading the content", async () => {
    mocks.patch.mockRejectedValue(new Error("Read update unavailable"));
    mount(<NotificationsPage />, "/notifications");
    fireEvent.click(await screen.findByRole("button", { name: "Mark read" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Read update unavailable");
    expect(screen.getByText("Synthetic status recorded")).toBeInTheDocument();
  });

  it("prevents repeated mark-read requests while one is pending", async () => {
    mocks.patch.mockReturnValue(new Promise(() => undefined));
    mount(<NotificationsPage />, "/notifications");
    const read = await screen.findByRole("button", { name: "Mark read" });
    fireEvent.click(read);
    await waitFor(() => expect(read).toBeDisabled());
    fireEvent.click(read);
    expect(mocks.patch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
  });
});
