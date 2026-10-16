import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const post = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ api: { post }, apiMessage: () => "Request unavailable" }));
import { ForgotPasswordPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from "./AuthPages";
beforeEach(() => { post.mockReset(); });
afterEach(() => cleanup());

describe("honest authentication form states", () => {
  it("shows visible required validation rather than silently refusing signup", async () => {
    render(<MemoryRouter><SignupPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter a password.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
  it.each(["unknown account", "provider failure", "transport failure"])("keeps reset feedback private for %s without claiming delivery", async (scenario) => {
    if (scenario === "unknown account") post.mockResolvedValue({ data: { success: true } });
    else post.mockRejectedValue(new Error(scenario));
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "demo@example.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("we cannot confirm whether an account exists or whether email delivery succeeded");
    expect(screen.getByLabelText("Email address")).toHaveValue("demo@example.invalid");
    expect(screen.queryByText(/Request accepted/)).not.toBeInTheDocument();
    expect(screen.queryByText(/reset link has been sent/)).not.toBeInTheDocument();
  });
  it("does not submit a password reset without the private reset token", () => {
    render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Save new password" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Request a new reset link" })).toBeInTheDocument();
  });
  it("does not consume an email token again after successful verification", async () => {
    post.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter initialEntries={["/verify-email?token=synthetic-verification-token"]}><VerifyEmailPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
    expect(await screen.findByRole("button", { name: "Verified" })).toBeDisabled();
    expect(post).toHaveBeenCalledOnce();
  });
});
