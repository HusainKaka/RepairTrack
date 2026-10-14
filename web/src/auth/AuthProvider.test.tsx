import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn(), setAccessToken: vi.fn() }));
vi.mock("../api/client", () => ({ api: { post: mocks.post }, setAccessToken: mocks.setAccessToken }));
import { AuthProvider, useAuth } from "./AuthProvider";

function Controls() {
  const { loading, user, login, logout } = useAuth();
  return <><span>{loading ? "Loading" : "Ready"}</span><span>{user?.fullName ?? "Signed out"}</span><button onClick={() => { void login("fixture@example.test", "unused-fixture"); }}>Sign in</button><button onClick={() => { void logout().catch(() => {}); }}>Sign out</button></>;
}

async function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><AuthProvider><Controls /></AuthProvider></QueryClientProvider>);
  await screen.findByText("Ready");
  return queryClient;
}

describe("account cache isolation", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.post.mockRejectedValueOnce(new Error("No initial session")); });
  afterEach(() => cleanup());
  it("clears previous account records before applying a signed-in session", async () => {
    const queryClient = await mount();
    queryClient.setQueryData(["business-dashboard"], { privateRecord: "previous-account" });
    mocks.post.mockResolvedValueOnce({ data: { data: { accessToken: "non-secret-fixture", user: { id: "new-user", fullName: "New account", role: "BUSINESS_ADMIN" }, expiresInSeconds: 900 } } });
    fireEvent.click(screen.getByText("Sign in"));
    await screen.findByText("New account");
    expect(queryClient.getQueryData(["business-dashboard"])).toBeUndefined();
    expect(mocks.setAccessToken).toHaveBeenLastCalledWith("non-secret-fixture");
  });
  it("clears private cache data and the local token even if the logout request fails", async () => {
    const queryClient = await mount();
    queryClient.setQueryData(["customer-repairs"], [{ privateRecord: "previous-account" }]);
    mocks.post.mockRejectedValueOnce(new Error("Network unavailable"));
    fireEvent.click(screen.getByText("Sign out"));
    await waitFor(() => expect(queryClient.getQueryData(["customer-repairs"])).toBeUndefined());
    expect(mocks.setAccessToken).toHaveBeenLastCalledWith(null);
  });
});
