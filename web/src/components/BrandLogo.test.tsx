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
    expect(theme.components?.MuiCard?.styleOverrides?.root).toHaveProperty("backdropFilter", "none");
  });
  it("keeps text links flat and primary actions styled as buttons", () => {
    const theme = makeTheme("light");
    const styles = theme.components?.MuiButton?.styleOverrides;
    expect(styles?.text).toHaveProperty("background", "transparent");
    expect(styles?.text).toHaveProperty("boxShadow", "none");
    expect(styles?.text).toHaveProperty("whiteSpace", "nowrap");
    expect(styles?.contained).toHaveProperty("backdropFilter", "blur(16px)");
  });
});
