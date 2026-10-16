import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../types";

const mocks = vi.hoisted((): { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; role: Role } => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), role: "BUSINESS_ADMIN" }));
vi.mock("../api/client", () => ({ api: { get: mocks.get, post: mocks.post, put: mocks.put }, apiMessage: () => "Checkout is unavailable. No subscription was activated." }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
import { SubscriptionsPage } from "./SubscriptionPages";

const basic = { id: "basic-plan", name: "Workshop", monthlyPrice: "1500", annualPrice: "15000", currency: "KES", trialDays: 14, repairLimit: 100, technicianLimit: 2, features: { inventory: true, reports: false }, active: true };
const pro = { ...basic, id: "pro-plan", name: "Team", monthlyPrice: "3000", annualPrice: "30000", technicianLimit: 5 };
const subscription = { id: "subscription-id", businessId: "business-id", status: "ACTIVE", billingCycle: "MONTHLY", currentPeriodEnd: "2026-11-16T10:00:00.000Z", plan: basic, payments: [] };
function mount() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={client}><MemoryRouter><SubscriptionsPage /></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { vi.resetAllMocks(); mocks.role = "BUSINESS_ADMIN"; mocks.get.mockImplementation((path: string) => Promise.resolve({ data: { data: path.endsWith("/plans") ? [basic, pro] : path.endsWith("/businesses") ? [{ ...subscription, business: { name: "Demo workshop", email: "workshop@example.test" } }] : subscription } })); });
afterEach(() => cleanup());

describe("subscription lifecycle interface", () => {
  it("reviews a plan before attempting the existing checkout and shows provider errors without claiming activation", async () => {
    mocks.post.mockRejectedValue(new Error("private provider internals"));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Review Team" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(screen.getByText(/current backend requires external checkout setup/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
    await screen.findByText("Checkout is unavailable. No subscription was activated.");
    expect(mocks.post).toHaveBeenCalledWith("/subscriptions/checkout", { planId: "pro-plan", billingCycle: "MONTHLY" });
    expect(screen.queryByText("private provider internals")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to checkout" })).toBeEnabled();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("prevents duplicate checkout attempts while pending and never treats acknowledgement as paid", async () => {
    let finish!: (value: unknown) => void;
    mocks.post.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Review Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));
    const saving = await screen.findByRole("button", { name: "Saving…" });
    expect(saving).toBeDisabled(); fireEvent.click(saving);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ data: { success: true } }); await Promise.resolve(); });
    await screen.findByText(/Checkout request acknowledged. This does not confirm payment or activate a plan/);
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
    expect(screen.queryByText("Payment successful")).not.toBeInTheDocument();
  });
  it("keeps business administrators away from the platform override endpoint", async () => {
    mount(); await screen.findByText("Plan & subscription");
    expect(mocks.get).toHaveBeenCalledWith("/subscriptions/current");
    expect(mocks.get).not.toHaveBeenCalledWith("/subscriptions/businesses");
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
  });
  it("requires a reason for a super-administrator override and preserves its payload", async () => {
    mocks.role = "SUPER_ADMIN"; mocks.put.mockResolvedValue({ data: { data: subscription } });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Manage" }));
    expect(screen.getByRole("button", { name: "Apply audited override" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for override" }), { target: { value: "Correct verified contract terms" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply audited override" }));
    await screen.findByText("Subscription override saved with its audit reason.");
    expect(mocks.put).toHaveBeenCalledWith("/subscriptions/businesses/business-id", { planId: "basic-plan", status: "ACTIVE", billingCycle: "MONTHLY", reason: "Correct verified contract terms" });
    expect(mocks.get).not.toHaveBeenCalledWith("/subscriptions/current");
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("never fetches subscription records for non-administrators", async () => {
    mocks.role = "TECHNICIAN"; mount();
    await screen.findByText("Subscription management is available to administrators.");
    await waitFor(() => expect(mocks.get).not.toHaveBeenCalled());
  });
});
