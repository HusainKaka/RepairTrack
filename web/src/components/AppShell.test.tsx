import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../types";

const mocks = vi.hoisted((): { role: Role; mobile: boolean; get: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> } => ({ role: "BUSINESS_ADMIN", mobile: false, get: vi.fn(), logout: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "demo-staff", fullName: "Alex Demo", role: mocks.role, businessId: "demo-business" }, logout: mocks.logout }) }));
vi.mock("../api/client", () => ({ api: { get: mocks.get } }));
vi.mock("@mui/material", async (importOriginal) => ({ ...await importOriginal<typeof import("@mui/material")>(), useMediaQuery: () => mocks.mobile }));
import { AppShell } from "./AppShell";

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}{location.search}</div>;
}
function mount(path = "/repairs") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route element={<AppShell />}><Route path="*" element={<CurrentPath />} /></Route></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role = "BUSINESS_ADMIN"; mocks.mobile = false;
  mocks.get.mockResolvedValue({ data: { data: { count: 3 } } });
});
afterEach(cleanup);

describe("Workshop ledger shell", () => {
  it("groups the existing admin destinations and marks the active page", () => {
    const { container } = mount("/repairs/demo-repair");
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(navigation).getByRole("list", { name: "Workshop" })).toBeInTheDocument();
    expect(within(navigation).getByRole("list", { name: "Business" })).toBeInTheDocument();
    expect(within(navigation).getByRole("list", { name: "Administration" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Repairs" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Invoices" })).toHaveAttribute("href", "/invoices");
    expect(within(navigation).getByRole("link", { name: "Costs & utilities" })).toHaveAttribute("href", "/expenses");
    expect(container.querySelector(".product-ui")).toBeInTheDocument();
    expect(container.querySelector(".page-enter")).not.toBeInTheDocument();
    expect(screen.getByAltText("Husaini Tech Solutions. Innovate, solve, empower.")).toHaveAttribute("src", "/husaini-tech-solutions.png");
  });

  it.each([
    ["TECHNICIAN", ["Repairs", "Digital solutions", "Customers", "Devices", "Inventory", "Notifications", "Profile"], ["Invoices", "Technicians", "Reports", "Settings", "Businesses"]],
    ["CUSTOMER", ["Repairs", "Digital solutions", "Invoices", "Notifications", "Profile"], ["Customers", "Devices", "Inventory", "Technicians", "Reports", "Settings", "Businesses"]],
    ["SUPER_ADMIN", ["Businesses", "Subscription", "Audit trail", "Settings"], ["Repairs", "Digital solutions", "Customers", "Invoices", "Notifications", "Profile"]],
  ] as const)("retains exact role navigation boundaries for %s", (role, allowed, forbidden) => {
    mocks.role = role; mount("/");
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    for (const label of allowed) expect(within(navigation).getByRole("link", { name: label })).toBeInTheDocument();
    for (const label of forbidden) expect(within(navigation).queryByRole("link", { name: label })).not.toBeInTheDocument();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    if (role === "SUPER_ADMIN") expect(mocks.get).not.toHaveBeenCalled();
  });

  it("submits real workspace search and keeps notification navigation functional", async () => {
    mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Search workspace" }), { target: { value: "RT 42" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/search?q=RT%2042");
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 3 unread" }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/notifications");
  });

  it("does not submit a misleading one-character query", () => {
    mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Search workspace" }), { target: { value: "a" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByRole("button", { name: "Submit workspace search" })).toBeDisabled();
    expect(screen.getByTestId("current-path")).toHaveTextContent("/repairs");
  });

  it("provides labelled mobile navigation controls and closes after navigation", async () => {
    mocks.mobile = true; mount();
    const open = screen.getByRole("button", { name: "Open navigation" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(open);
    expect(await screen.findByRole("button", { name: "Close navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Customers" }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/customers");
  });

  it("uses the existing sign-out handler", () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
});
