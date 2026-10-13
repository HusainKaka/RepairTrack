import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "./BrandLogo";
import { makeTheme } from "../theme";

describe("Husaini branding", () => {
  it("retains the product name and displays the brand attribution", () => {
    const { container } = render(<BrandLogo />);
    expect(screen.getByText("repairTrack")).toBeInTheDocument();
    expect(screen.getByText("by Husaini Tech Solutions")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "/husaini-tech-solutions.png");
  });
  it.each(["light", "dark"] as const)("provides the branded palette and glass surface in %s mode", (mode) => {
    const theme = makeTheme(mode);
    expect(theme.palette.mode).toBe(mode);
    expect(theme.palette.primary.main).toBe(mode === "light" ? "#0055B8" : "#6CCBFF");
    expect(theme.components?.MuiCard?.styleOverrides?.root).toHaveProperty("backdropFilter", "blur(20px)");
  });
});
