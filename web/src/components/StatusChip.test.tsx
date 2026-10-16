import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it } from "vitest";
import { makeTheme } from "../theme";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it("renders a readable workflow status", () => {
    render(<ThemeProvider theme={makeTheme("light")}><StatusChip status="READY_FOR_COLLECTION" /></ThemeProvider>);
    expect(screen.getByText("Ready for collection")).toBeInTheDocument();
  });
  it("keeps the complete approval status rather than abbreviating or clipping its meaning", () => {
    render(<ThemeProvider theme={makeTheme("light")}><StatusChip status="AWAITING_CUSTOMER_APPROVAL" /></ThemeProvider>);
    expect(screen.getByTitle("Awaiting customer approval")).toHaveClass("product-status-chip");
    expect(screen.getByText("Awaiting customer approval")).toBeInTheDocument();
  });
});
