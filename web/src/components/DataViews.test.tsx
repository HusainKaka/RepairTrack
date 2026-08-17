import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable } from "./DataViews";

describe("DataTable", () => {
  it("shows a clear empty state", () => {
    render(<DataTable columns={["Reference"]} rows={[]} empty="Nothing received" />);
    expect(screen.getByText("Nothing received")).toBeInTheDocument();
  });

  it("renders columns and values", () => {
    render(<DataTable columns={["Reference", "Status"]} rows={[["RT-001", "RECEIVED"]]} />);
    expect(screen.getByRole("columnheader", { name: "Reference" })).toBeInTheDocument();
    expect(screen.getByText("RT-001")).toBeInTheDocument();
  });
});
