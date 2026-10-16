import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRecordLayout } from "./useRecordLayout";

function Probe() {
  const { containerRef, compact } = useRecordLayout(1000);
  return <div ref={containerRef}><output>{compact ? "Compact records" : "Readable table"}</output></div>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("available-space record layout", () => {
  it("uses the actual panel width, responds to resize and cleans up the observer", () => {
    let width = 708;
    let resize = () => {};
    const disconnect = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, width, 400));
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const view = render(<Probe />);
    expect(screen.getByText("Compact records")).toBeInTheDocument();
    width = 1108;
    act(() => resize());
    expect(screen.getByText("Readable table")).toBeInTheDocument();
    width = 948;
    act(() => resize());
    expect(screen.getByText("Compact records")).toBeInTheDocument();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("has a working window-resize fallback when ResizeObserver is unavailable", () => {
    let width = 1108;
    vi.stubGlobal("ResizeObserver", undefined);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, width, 400));
    render(<Probe />);
    expect(screen.getByText("Readable table")).toBeInTheDocument();
    width = 708;
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(screen.getByText("Compact records")).toBeInTheDocument();
  });
});
