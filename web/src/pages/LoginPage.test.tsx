import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
const login = vi.hoisted(() => vi.fn());
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: null, login }) }));
import { LoginPage } from "./LoginPage";

afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("password-only sign in", () => {
  it("shows no Google widget, divider or configuration notice", () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Sign in securely" })).toBeVisible();
    expect(screen.queryByText(/Google|VITE_GOOGLE_CLIENT_ID/)).not.toBeInTheDocument();
    expect(screen.queryByText("or")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  });
  it("preserves genuine password-login error feedback", async () => {
    login.mockRejectedValueOnce(new Error("The email or password is incorrect."));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "fixture@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not-a-real-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The email or password is incorrect.");
  });
});
