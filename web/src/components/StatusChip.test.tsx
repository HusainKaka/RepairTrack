import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it } from "vitest";
import { makeTheme } from "../theme";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it("renders a readable workflow status", () => {
    render(<ThemeProvider theme={makeTheme("light")}><StatusChip status="READY_FOR_COLLECTION" /></ThemeProvider>);
    expect(screen.getByText("READY FOR COLLECTION")).toBeInTheDocument();
  });
});
