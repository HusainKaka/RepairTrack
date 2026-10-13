import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "./BrandLogo";
import { makeTheme } from "../theme";

describe("Husaini branding", () => {
  it("retains the product name and displays the brand attribution", () => {
    const { container } = render(<BrandLogo />);
    expect(screen.getByText("RepairTrack")).toBeInTheDocument();
    expect(screen.getByText("by Husaini Tech Solutions")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "/husaini-tech-solutions.png");
  });
  it.each(["light", "dark"] as const)("provides the branded palette and glass surface in %s mode", (mode) => {
    const theme = makeTheme(mode);
    expect(theme.palette.mode).toBe("light");
    expect(theme.palette.primary.main).toBe("#3B82F6");
    expect(theme.components?.MuiCard?.styleOverrides?.root).toHaveProperty("backdropFilter", "blur(24px)");
  });
});
